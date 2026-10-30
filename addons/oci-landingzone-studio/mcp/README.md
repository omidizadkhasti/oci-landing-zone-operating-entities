# Headless Studio MCP (internal pilot)

This optional service reuses Studio's generator, validation and Draw.io modules.
It generates review-required artifacts and has no OCI deployment capability.
The UI remains independently usable. The generic core lives in `../src/headless`;
MCP, storage, identity and Kubernetes integration stay in this directory.

## Contract and tools

Send one strict JSON design envelope containing:

- `schemaVersion`: `1.0`.
- `projectId`, positive `revision`, and safe `name`.
- `configuration`: the complete current Studio `LzModel`, including foundation,
  hub, environments/projects, environment/shared platforms, Exadata service and
  placement choices, and remote peering.
- `evidence`: `{field, source, locator}` records; `decisions`: `{field, status,
  rationale}` records; `unresolvedItems`: strings. Evidence is inert data.

Run the build to obtain the exact `dist/design.schema.json` and complete synthetic
`dist/example-design.json`. `landingzone_capabilities` also returns both. Examples
are not customer facts; Planning must replace them with grounded design inputs.
Model version is pinned to Studio's current model. Unknown fields are rejected;
do not guess generator keys or use arbitrary Jsonnet.

| Tool | Arguments | Result |
| --- | --- | --- |
| `landingzone_capabilities` | `{}` | Schema, synthetic example, supported outputs and limits |
| `landingzone_validate` | `{design: <envelope>}` | Validity and bounded validation issues |
| `landingzone_generate` | `{design: <envelope>}` | Completed review-required manifest or validation issues |
| `landingzone_get_generation` | `{projectId, generationId}` | Authorized manifest, or null after expiry |
| `landingzone_read_artifact` | `{projectId, generationId, name, offset?}` | Bounded base64 chunk, hash and next offset |

Transport: stateless Streamable HTTP at `/mcp`, negotiated by the official MCP
SDK. Generation is synchronous with a 60-second worker deadline; configure client
tool timeouts above 60 seconds. There is no durable asynchronous queue or cancel
tool in this pilot. Disconnect cancellation terminates the active worker.

The input limit is 1 MiB, maximum generated text is 16 MiB, and one worker runs at
a time. A concurrent generation returns busy; retry later. Content-addressed
generation IDs include the entire input and engine digest. Identical retained
requests return the same manifest. Artifacts are private to the certificate-bound
caller and its allowed projects, retained for 24 hours, with a 100-generation
quota per caller/project. A restart preserves completed artifacts on the PVC;
interrupted requests can be retried. This is not an exactly-once workflow engine.

Outputs include `.drawio`, canonical `config.jsonnet`, **all** JSON files emitted
for that supported configuration, the design evidence envelope, and a ZIP bundle.
Every file is hashed. The external manifest includes the bundle hash; the manifest
inside the ZIP covers the payload files, excluding its containing ZIP. Download
and verify artifact chunks in an application adapter outside model context.

PNG/SVG, arbitrary artifact URL ingestion, cloud storage adapters, Registry
registration, and Planning skill/profile activation are not implemented here.
Unsupported requirements must remain explicit. Outputs are proposals; no tool
approves a design or grants permission to deploy it.

## Build and test

From `addons/oci-landingzone-studio`, prepare the WASM as in
[`../LOCAL-DEVELOPMENT.md`](../LOCAL-DEVELOPMENT.md), then:

```sh
cd mcp
npm ci --ignore-scripts --registry=https://registry.npmjs.org
npm run typecheck
npm test
```

Tests include canonical-generator parity in `../src/headless/generate.test.ts`,
SDK discovery/tool calls, real TLS certificate rejection, project isolation,
invalid schema/CIDRs, injection-like data, timeouts, retries, artifact integrity
and traversal rejection. The parent Studio suite verifies UI compatibility.

The independent MCP lockfile avoids installing Vite or the UI development tools
in the container. Build stages use native JavaScript/WASM tooling; the final
runtime image targets the cluster architecture. Official base images are pinned
by digest. Go shim and WASM are built together. Third-party notices are included.

## Deployment and identity

The Helm chart requires an image repository/digest and existing TLS, client
binding and image-pull Secrets. `deploy/namespace.yaml` creates the requested
`oci-landing-zone` namespace, resource quota and default-deny network policy.
The chart creates an internal ClusterIP, non-root service, private PVC and a
network allowlist. Allowed caller pods must carry
`oci-landing-zone-client: "true"` in an approved namespace. No Kubernetes role or
service-account token is assigned. No outbound network is needed by the server.
Verify that the network-policy engine covers the selected worker nodes. A
DaemonSet's presence alone is insufficient. Where coverage is limited, set the
chart's `nodeSelector` to existing policy-enabled nodes and run the negative
network test before admitting customer traffic; do not silently alter the
cluster's networking add-ons. Keep environment-specific scheduling values out
of the generic chart.

The HTTPS server requires TLS client certificates signed by its trusted CA AND
an explicit fingerprint binding in `LZ_CLIENTS_FILE`:

```json
[{"id":"planning","certificateSha256":"<64 lowercase hex characters>","projectIds":["planning","smoke-test"]}]
```

The caller cannot select its identity through a header or tool argument.
The pilot PKI script writes private files outside Git; use organization-managed
issuance for production. Client/server certificates expire after 30 days. Rotate
the mounted Secrets, update fingerprint bindings, and restart the deployment
before expiry. Removing an old binding revokes that client's application access
after restart. The CA private key must never be mounted in the service.

Health endpoints on port 8081 expose only readiness, no customer data. MCP is on
8443. HTTP is never accepted for generation, and certificate verification must
remain enabled. Exact Host checks and default rejection of browser Origins apply.
Logs contain only readiness/version and caller alias/status/duration, no input,
certificate, evidence, token, generated artifact contents or request body.

Example install (after provisioning approved Secrets and an immutable image):

```sh
helm upgrade --install landingzone-mcp deploy --namespace oci-landing-zone \
  --set image.repository="$LZ_IMAGE_REPOSITORY" --set image.digest="$LZ_IMAGE_DIGEST" \
  --wait --timeout 5m
```

The generic client helper `client.mjs` uses the official SDK with mTLS. Set
`LZ_MCP_URL`, `LZ_CLIENT_CA_FILE`, `LZ_CLIENT_CERT_FILE`, and `LZ_CLIENT_KEY_FILE`;
run `node smoke.mjs` to test synthetic generation. `deploy/smoke-job.yaml` performs
the same test in the cluster after replacing its image placeholder with the exact
deployed digest. It needs the scoped smoke-client Secret, not the CA private key.

The endpoint for this namespace is:
`https://landingzone-mcp.oci-landing-zone.svc.cluster.local:8443/mcp`.

Planning/Runtime integration is a separate release: approved caller identity,
network label, CA/client certificate mounts or a reviewed Registry transport
adapter, tool allowlist, artifact adapter, skill snapshot and output contract.
Do not copy existing credentials across namespaces without explicit authorization.

## Rollback and contribution

The portable agent skill is
[`oci-landing-zone-planning`](../skills/oci-landing-zone-planning/SKILL.md).
It covers workbook/FDE discovery, complete model assembly, the real MCP protocol,
artifact integrity and review boundaries. Package qualification is recorded in
[`qualification/skill-v1-readiness.md`](qualification/skill-v1-readiness.md).
It is not installed or activated by this service deployment. A trusted publisher
must admit its exact package digest, bind the skill/tools/output slots to the
approved Planning profile, and complete live qualification before activation.

For an existing release, use `helm rollback landingzone-mcp <revision> -n
oci-landing-zone --wait`. For the initial pilot, uninstall the Helm release to
remove the service; the PVC is intentionally retained. Remove pilot Secrets and
namespace policies separately after confirming their consumers and data retention.
No rollout step modifies Planning, Implementation or Codex Runtime workloads.

See [`SECURITY-DESIGN.md`](SECURITY-DESIGN.md) and
[`SECURITY-READINESS.md`](SECURITY-READINESS.md) for the qualification record.
Upstream submission also requires the repository's contributor agreement,
signed-off commits, maintainer discussion and independent review. No agreement
acceptance or upstream PR publication is performed by this implementation.
