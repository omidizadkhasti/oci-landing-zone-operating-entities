# MCP pilot readiness — 2026-10-30

**Status: Ready with evidence gaps for the internal pilot. This is not formal
CSSAP approval or authorization for customer production use.**

## Scope and design gate

New versioned MCP service, worker isolation, persistent artifact store, headless
Studio facade, portable WASM build scripts, container and Helm packaging. Existing
UI behavior is preserved. This release accepts strict structured JSON and produces
review-required Draw.io and configuration artifacts. No OCI deployment, arbitrary
Jsonnet, remote URL fetching, Planning skill, Runtime profile or Registry binding
is introduced. LLM safety applies at the tool boundary; the service has no model.

The design review and pre-test thresholds are in `SECURITY-DESIGN.md`. Trust
boundaries are authenticated client → authorized project → bounded worker →
caller/project artifact directory. Customer inputs, evidence and model outputs
are untrusted data. No credential or customer document was added to fixtures.

## Implemented controls

- TLS server verification and mutual TLS client authentication, plus explicit
  client fingerprint and project allowlists. No trusted caller-selected headers.
- Strict schemas/versioning, reserved-key and depth rejection, 1 MiB design limit,
  domain validation and explicit missing-input failures. No shell or caller code.
- One worker at a time, 60-second deadline, cancellation and memory/output bounds.
- Identical generator snapshot for JSON and diagram routes/resource inventory,
  deterministic input/engine identity, atomic artifact writes, file hashes,
  bounded chunk reads, quotas and 24-hour retention.
- Non-root, read-only runtime, no capabilities or service-account token, scoped
  Secrets, internal ClusterIP, restricted namespace and resource quota. No server
  egress. Image and build actions pinned by digest; dependency lockfiles retained.
- Content-free request audit events. Private certificate files remain outside
  Git/images/tool arguments. The image-pull Secret copy was explicitly approved
  by the user; credential values were not printed or committed.

## Verification actually performed

| Check | Result |
| --- | --- |
| Full Studio suite | 743 tests passed across 68 files |
| New MCP suite | 10 tests passed, including multiple negative cases per test |
| Studio and MCP typecheck, lint, production/headless builds | Passed |
| Hub A/B/C/E JSON parity | Every canonical output compared byte-for-byte |
| Regional diagram parity | Matches browser preview, including reused compartments |
| EXACC/EXACS output parity | Explicit service/placement output preserved |
| Real HTTPS tests | Missing/unbound certificates, spoofed identity, bad Host/Origin, malformed/oversized input rejected |
| MCP authorization and storage tests | Project denial, caller/project isolation, traversal, corruption, expiry and retries passed |
| Worker negative tests | Deadline, cancellation and concurrent admission passed |
| Injection-like input tests | Unknown executable fields rejected; source instructions remained inert |
| Independent MCP dependency audit | Zero advisories, including development dependencies |
| Runtime SBOM | CycloneDX inventory generated, 93 components |
| Basic local secret-pattern check | No private-key or GitHub-token matches in changed files; not a full secret scan |
| Portable WASM build | macOS rebuild passed and produced byte-identical WASM; Linux container build passed |
| Final AMD64 container | Generation passed as UID 1000, read-only, no network, dropped capabilities, 2 GiB / 2 CPU limits |
| Helm lint and COEALLY admission dry-run | Passed |
| In-cluster official MCP SDK | Handshake, five tools, validation, generation, denial, retries and ZIP hash passed |
| Network isolation on final placement | Unlabelled client denied |
| Persistence | Existing manifest and ZIP hash survived service restart |
| Fresh protected-node generation | New input revision generated successfully with server egress denied |

## Resolved findings

1. **Risk: network-policy coverage.** Calico was restricted to one existing worker
   node, so the first unlabelled-client test reached a pod scheduled elsewhere.
   The MCP workload was moved to the existing policy-enabled node using an exact
   node selector and toleration. No cluster-wide networking was changed. The
   denial test passed on that placement. Operators must preserve this scheduling
   constraint or extend verified policy coverage before changing it.
2. **Packaging defect: root-only WASM permissions.** The upstream temporary output
   inherited mode 0600. The build now marks the public runtime readable; non-root
   container generation passed.
3. **Portability defect: hashing tool.** Minimal Linux lacked macOS `shasum`.
   Build/ensure scripts now select GNU `sha256sum` or macOS `shasum` without
   disabling verification. Both build environments passed.

## Deployment evidence

COEALLY namespace: `oci-landing-zone`. Helm release: `landingzone-mcp`.
Internal service: `landingzone-mcp:8443`; no public endpoint.

Image digest:
`sha256:71f4d074fd808d285cca710778ec34d46d87f1ee4ec915562a12984e93428198`.

Engine digest:
`b35884502cc684f4bb9dc30d3ebb8cf7812e411b3e4a186515b0173746a27384`.

Synthetic generation:
`db7de1e3eff20ee0639a25f8813b334d74d6dd7b3bd411b51fed350ac4d258f7`.
Bundle SHA-256:
`cfdb13bd86696922fc0825b18fdf71d17aea35d1141be7514cdf9c9512b994fe`.

Completed artifacts use a retained 50 GiB PVC. The pilot client is bound only to
the `planning` and `smoke-test` project aliases. No customer integration is active.
Leaf certificates expire on 2026-11-29; operator-managed rotation is required.
Rollback/removal instructions are in `README.md`; uninstall intentionally retains
the PVC so data disposal is a separate explicit operation.

## Material gaps and owner actions

| Classification | Gap/action | Owner |
| --- | --- | --- |
| Evidence gap | Fortify/approved equivalent, Parfait and independent peer review unavailable | Security/project owner |
| Evidence gap | OS/base-image vulnerability scan unavailable; npm audit covers packages, not the whole image | Release owner |
| Evidence gap | New pinned CI/CodeQL workflow is configured but has not run remotely; CodeQL is not claimed as an approved OSSA equivalent | Repository owner |
| Evidence gap | Live Oracle standards, cluster secret-at-rest controls and organization-managed certificate issuance were not verified | Security/platform owner |
| Evidence gap | Full secret detection and broader adversarial testing remain required; the local pattern check is supplementary | Security owner |
| Evidence gap | Live Planning skill grounding, poisoned-document, leakage and multi-turn evaluations were not performed | Planning owner |
| Integration work | Approve skill/profile/output contract, caller identity and Registry/transport adapter before admitting customer requests | Planning/Runtime owner |
| Feature boundary | Artifact-reference ingestion, object-storage adapter, PNG/SVG and durable asynchronous queue are not implemented | Project owner |

The original UI development lockfile's previously reported advisories are not
remediated in this change. Vite and those UI development tools are excluded from
the independent MCP image. This record does not declare the entire upstream
repository release-ready. An owner must complete the missing scans/reviews,
certificate lifecycle and live integration qualification before production use.
