# Studio MCP contract, version 1.0 / service pilot 0.1.0

Use the host's approved binding. This skill does not configure servers, grant
tools, install SDKs, create certificates, select upload destinations or supply
an endpoint. TLS/mTLS, renewal, project authorization and credentials belong to
the runtime/operator. Never disable verification or switch identity after denial.

## Calls and actual responses

| Tool | Arguments | Structured result |
| --- | --- | --- |
| `landingzone_capabilities` | `{}` | `schemaVersion`, `engineSha256`, `schema`, `example`, `projectIds`, `outputs`, limits |
| `landingzone_validate` | `{ "design": <envelope> }` | `{ "valid": true\|false, "issues": ["message", ...] }` |
| `landingzone_generate` | `{ "design": <same validated envelope> }` | Completed manifest **or** validation result; can also return `isError: true` |
| `landingzone_get_generation` | `{ "projectId": "<authorized project>", "generationId": "<returned ID>" }` | `{ "manifest": <manifest>\|null }` |
| `landingzone_read_artifact` | `{projectId, generationId, name, offset?}` | `name/bytes/sha256/encoding/offset/nextOffset/data` |

Prefer `structuredContent`; parse text-only JSON safely if the binding requires
it. Transport success is not tool success. Actual validation issues are strings;
do not invent issue codes/paths, operation URLs or files the server did not return.

Initial limits: inline design <= 1 MiB, one concurrent worker, synchronous
generation, 60-second deadline, 24-hour retention, `artifactReferenceInput: false`,
outputs `drawio/jsonnet/generated-json/zip`. Configure host tool timeouts above
60 seconds. There is no polling queue, cancel tool, PNG/SVG, URL ingestion or
deployment tool. The example is synthetic, never a customer baseline.

Require a usable schema/schema version, engine digest, authorized project list,
output list and input byte limit before validation/generation. Missing or malformed
mandatory metadata is an integration dependency; continue provisional discovery.
Concurrency, deadline, retention and transport details may be absent from older
recorded responses. The host's admitted service profile may supply them; otherwise
label documented pilot values as unobserved, use conservative timeouts/retries,
and do not invent asynchronous behavior. Generate only when synchronous mode is
advertised or established by that trusted profile. Missing reference-ingestion or
optional-output flags mean unsupported, not permission to try them. A missing
retention value means do not promise future availability.

## Manifest checks

Expect `generationId/projectId/revision/engineSha256/createdAt`,
`status: review_required`, and `artifacts: [{name, bytes, sha256}, ...]`.
Check project/revision against the submitted input and engine against validated
capabilities/publisher policy. Require well-formed hashes and all requested
supported output types. Missing files or invalid inventory are execution failures.

Keep the full dynamic file set: security/observability pre/final files depend on
baseline, scope and extensions. Do not assume seven JSON files or keep only
`network.json`. Current output includes `architecture.drawio`, `config.jsonnet`,
design snapshot and bundle. Never mix generation IDs or edit hashed outputs.

Input-byte SHA-256 is not `generationId`: the server canonicalizes the whole
envelope with the engine digest. Record the returned ID rather than guessing it
from raw JSON bytes. Evidence/decision changes can change it without new topology.

## Download integrity

Use an approved application/file adapter outside model context. Start offset 0,
decode base64 strictly and append once. Check `encoding: base64`, requested
filename/offset and consistent total `bytes/sha256`. Next offset must equal offset
plus decoded length and advance; `null` marks completion. Reject gaps, repeated
offsets, inconsistent hashes/lengths and oversized responses.

Verify final length and SHA-256 against read result and manifest before delivery.
The ZIP's internal manifest covers payload files; its external manifest covers
the containing ZIP. If unpacking is authorized, reject absolute/traversal paths,
links and unexpected executables, bound expanded size and verify member hashes.
Do not run generated files or interpolate filenames into shells. Host format and
malware validation remain authoritative. Without a safe adapter, return the
manifest as intermediate and report delivery blocked, not verified local files.

## Recovery boundaries

- Missing/conflicting facts: ask through Planning; preserve evidence, not defaults.
- Invalid schema: compare with live schema once and correct the caller envelope.
  Unresolved drift is an integration dependency.
- Busy: respect advertised delay; at most two bounded retries per logical request,
  then return a retryable execution status.
- Timeout/lost response: do not claim success. Query a known generation ID;
  otherwise at most one identical-payload retry when the host permits. Do not
  increment revision merely to retry. Stop on cancellation.
- Authentication/project denial/expired certificate: stop dependent calls and
  report to the operator. Do not request credentials or choose another project
  just because capabilities exposes it.
- Expired/missing manifest: report unavailable. Regenerate only the saved,
  authorized input under the admitted engine; disclose engine changes and apply
  the host's review gate for the new output.
- Integrity mismatch: withhold delivery and return sanitized metadata; never
  repair bytes or waive checks.
- Oversize/unsupported feature/output-slot mismatch: report the capability gap.
  Never silently drop evidence, invent reference ingestion, split connected
  topologies or overwrite unrelated outputs to fit.
