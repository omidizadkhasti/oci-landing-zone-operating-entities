# MCP security design and qualification

Scope: a headless Studio facade and an internal MCP service. The service creates
review-required artifacts only; it cannot deploy infrastructure, access OCI APIs,
retrieve arbitrary URLs, execute supplied code, or modify Planning/Runtime.
Input is a bounded, strict JSON envelope containing the versioned Studio model,
provenance and decisions. Evidence is data and does not grant authority.

## Boundaries and controls

1. Client → HTTPS MCP: private CA client authentication plus an operator-owned
   certificate fingerprint binding. No caller-selected identity headers. Exact
   Host/Origin checks; no permissive CORS. Health endpoints have no data access.
2. MCP → operation: caller/project allowlist checked before every validation,
   generation, lookup or artifact read. Names and IDs are constrained. Unknown
   fields, reserved prototype keys, deep nesting and oversized inputs fail closed.
3. Operation → worker: pinned code and embedded Jsonnet imports only; no user
   Jsonnet, shell commands or remote imports. One concurrent worker, 60-second
   timeout, bounded heap and input/output sizes. Cancellation terminates the worker.
4. Worker → artifacts: complete output snapshot, generated route tables and
   compartment inventory feed Draw.io. Input+engine hash identifies the revision;
   every file has a SHA-256. Atomic private directories isolate client/project
   artifacts. Bounded reads, 24-hour retention and project generation quota.
5. Container → cluster: non-root, dropped capabilities, read-only root, seccomp,
   namespace quotas, no Kubernetes role, no service-account token and no outbound
   network. Internal ClusterIP only. Dedicated PVC; one replica/Recreate until a
   shared operation store is introduced. An additive namespace-scoped deployment
   can be rolled back without changing existing Planning workloads.

Client certificates are a service-to-service identity mechanism, not an OAuth
authorization-server implementation. Keys live only in protected operator files
and Kubernetes Secrets. Issue certificates for at most 30 days, bind exact client
fingerprints, rotate before expiry, and remove old bindings to revoke access.
Only the public CA is distributed to clients. Do not put private keys in images,
Git, tool arguments, model prompts, logs or artifact bundles.

## LLM tool safety thresholds (defined before tests)

LLM safety applies to this tool boundary; no model or discovery skill is deployed
here. Required deterministic threshold: zero unauthorized reads, project bypasses,
path traversal, arbitrary-code/import execution, or mutation of OCI resources.
Injection-like input must fail schema validation or remain inert data. Missing
region/notification/network prerequisites and unresolved questions must prevent
generation. All supported output files must match the canonical generator.
Exadata choices must remain explicit. Outputs are always `review_required`.

Bias and harmful-text generation are low applicability for this deterministic
service, with no language-generation component. Hallucinated fields and unsafe
model tool arguments are addressed by strict schema and semantic validation.
Customer-evidence grounding, source-document prompt injection and multi-turn
clarification behavior require separate live Planning-skill evaluations.

## Verification and release evidence

Run MCP typecheck/build/tests, upstream UI typecheck/lint/build/test suite,
dependency audits for both lockfiles, image/SBOM checks where available, Helm
validation and server-side dry-run, mTLS/authorization negative tests, and an
in-cluster MCP generation smoke test with synthetic input. Do not copy customer
documents or artifacts into fixtures. Retain a final readiness record with actual
results. Formal Fortify/approved SAST, Parfait, live Oracle guidance, independent
review and full Planning/Registry integration are separate evidence requirements.
No formal CSSAP approval is implied.
