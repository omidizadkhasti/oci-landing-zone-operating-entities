# Planning ELZ qualification matrix

The finite matrix covers 544 generation designs: A/B/C/E hubs, complete/regional scope, one/three environments, foundation/custom networks, and all manual/small/medium/large OKE profiles × native/overlay CNI × FSS × public/private load-balancer flags. Hub D is not published. Each generated case checks semantic validation, parseable emitted JSON, intended VCN presence and unclipped route-table label style. This does not cover every arbitrary input or replace native visual review. Existing DR, Exadata, peering, routing and negative suites run separately.

All 544 generation cases passed during the November 18 COEALLY investigation. Strict MCP-envelope checks then exposed automatic OKE profiles incorrectly sharing the manual nonempty-subnet constraint. The closed schema now has an explicit automatic-profile branch allowing empty generator-owned maps; manual OKE, custom and hub arrays remain nonempty. Both portable skill schema references match the generated contract. All 544 closed envelopes and the manual-negative cases pass.

Fast closed-envelope checks run by default in the MCP test suite, using shared pure fixtures without introducing MCP dependencies into frontend CI. The full generator matrix takes about 16 minutes and is an explicit release check:

```sh
ELZ_FULL_MATRIX=1 npx vitest run src/headless/planningMatrix.test.ts
```

The MCP integration suite additionally runs the actual closed parser through generation for every automatic size/CNI profile. The route-table export uses `overflow=fill` to avoid Draw.io’s implicit vertical offset; native before/after rendering remains a separate visual qualification.
