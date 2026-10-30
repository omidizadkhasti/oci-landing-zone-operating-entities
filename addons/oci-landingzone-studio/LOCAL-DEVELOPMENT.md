# Local Studio setup and planning-agent integration notes

## Repository

Fork: https://github.com/omidizadkhasti/oci-landing-zone-operating-entities

Upstream: https://github.com/oci-landing-zones/oci-landing-zone-operating-entities

Initial upstream revision: `def6f0f7a0be02135c79a345073a66b02adce345`.
Keep the full repository relationship: Studio imports the canonical root `gen/`
Jsonnet files at build time. It is not a standalone copy of this subdirectory.
The local sparse checkout includes `addons/oci-landingzone-studio`, `gen`, and
`blueprints/one-oe/runtime/one-stack` (generator parity-test fixtures).

## Run locally

From the repository root:

```sh
cd addons/oci-landingzone-studio
npm ci --ignore-scripts --registry=https://registry.npmjs.org
# Requires Go >= 1.26 on PATH. Binaryen comes from the locked npm dependencies.
bash 3rd/go-jsonnet/ensure.sh
npm --ignore-scripts run build
npm --ignore-scripts run preview -- --host 127.0.0.1 --port 5173 --strictPort
```

Open http://127.0.0.1:5173/. Stop the foreground server with Ctrl+C.
The preview command serves the built application; rebuild after source edits.
For development with live reload, after preparing the runtime, use:

```sh
npm --ignore-scripts run dev -- --host 127.0.0.1 --port 5173 --strictPort
```

The explicit loopback host overrides upstream's LAN-facing Vite default.
The upstream lifecycle scripts invoke Bun. These npm commands deliberately
prepare the runtime explicitly and skip those Bun-based lifecycle hooks.
No global Bun installation or change to upstream package scripts is needed.

This machine's initial setup used Node 25.8.1, npm 11.11.0, and checksum-verified
official Go 1.26.10 for macOS arm64. The project-local Go executable is:
`node_modules/.local-setup/toolchains/go/bin/go`. To rebuild with it:

```sh
PATH="$PWD/node_modules/.local-setup/toolchains/go/bin:$PATH" bash 3rd/go-jsonnet/ensure.sh
```

`npm ci` removes `node_modules`, including this local Go installation. Install Go
separately or restore the local toolchain before the next runtime rebuild.
WASM, local toolchains, dependency caches, and `dist` remain uncommitted.
Keep the WASM and its matching `wasm_exec.js` together when rebuilding.

Studio stores designs in browser local storage. It requires no OCI credentials
for diagram generation. Use synthetic data for development and keep real design
artifacts in organization-controlled storage.

## Verification commands

After preparing the runtime:

```sh
npm --ignore-scripts run typecheck
npm --ignore-scripts run lint
npm --ignore-scripts run test -- --maxWorkers=2
npm --ignore-scripts run build
npm audit --registry=https://registry.npmjs.org
npm audit --omit=dev --registry=https://registry.npmjs.org
```

Verified on 2026-10-30: typecheck, lint, production build, and browser dashboard,
wizard, and hub diagram rendering passed. The suite passed 735 tests; its one
missing-fixture failure passed on a focused rerun after checking out the upstream
blueprints (736 tests verified across the two runs). The build emitted an
upstream chunk-size warning. No application source or dependency versions changed.

## Later planning-agent integration

An optional headless MCP pilot is now implemented in [`mcp/README.md`](mcp/README.md).
Its service contract and current verification are in
[`mcp/SECURITY-READINESS.md`](mcp/SECURITY-READINESS.md). The notes below describe
the initial upstream assessment and candidate integration points.

There was no HTTP API in the initial upstream Studio implementation. Candidate reuse
points, relative to this directory, are:

| Stage | Existing source |
| --- | --- |
| Import a supported config object into `LzModel` | `src/services/importConfig.ts`: `importConfig` |
| Serialize a Studio model into generator input | `src/services/lzConfig.ts`: `buildConfig`, `serializeConfig` |
| Evaluate canonical generator for diagram resources | `src/generator/preview.ts`: `generatePreview` |
| Derive route tables and inventory for graph construction | `src/services/diagramPreview.worker.ts` |
| Build diagram nodes, edges, and geometry | `src/diagram/buildGraph.ts`: `buildGraph` |
| Export editable Draw.io XML | `src/export/toDrawio.ts`: `toDrawioXml` |

Proposed next phase: a versioned JSON request contract for regions, hub type,
VCN/subnet CIDRs, environments, and supported platforms, mapped into the existing
model and validation pipeline. Return editable `.drawio` first. PNG/SVG rendering
would require an additional rendering/export step. Preserve generated route
tables and inventory when building the graph so it matches Studio's view.

The existing code uses Vite raw imports, WebAssembly asset URLs, browser workers,
and browser storage. A Node service needs an explicit generator asset loader and
packaging strategy; directly importing the UI modules into an HTTP server is
not yet a verified integration. A CLI adapter is a possible first step before
wrapping it in REST or an MCP tool.

Before exposing an agent-facing interface, define and test schema/CIDR/region
validation, unknown-field rejection, request and resource limits, cancellation,
isolated evaluation, authorization, tenant isolation, and artifact retention.
Prefer structured JSON inputs over arbitrary caller-supplied Jsonnet. Treat
model-generated inputs as untrusted, and keep deployment actions outside the
diagram-generation operation. Run the LLM safety workflow when that integration
is implemented; it is not part of this local bootstrap.

## Security readiness

Scope: upstream local build and browser execution; this branch adds this runbook
only. No API, planning-agent tool, credentials, or cloud deployment is introduced.
LLM safety: Not applicable to the current bootstrap because no model, prompt,
retrieval, or agent execution surface is implemented.

Initial dependency audit on 2026-10-30 found six affected development packages:
four high (`brace-expansion`, `source-map-js`, `vite`, `zod`) and two moderate
(`@vitest/mocker`, `vitest`). Production dependencies reported zero advisories.
These findings are unresolved; upstream dependency remediation and validation
are required before release. The local server is loopback-only. Audit findings
are package-level evidence, not a claim that every advisory is exploitable in
this macOS preview configuration.

CSSAP workflow readiness: **Not ready for release**, due to unresolved high-rated
dependency findings. Local functional verification is recorded separately in
the setup handoff. Fortify/approved SAST, Parfait, independent peer review, and
live Oracle-standard verification were unavailable. No formal CSSAP approval
is claimed. The project owner must arrange remediation, scans, and owner review
before deployment or exposing a planning-agent endpoint.
