# Evidence discovery and Studio field mapping

Use these prompts only for missing in-scope data. A workbook recommendation is a
proposal until the engagement authority confirms it. Source AWS VPC/subnet ranges
are not automatically target OCI ranges. Preserve exceptions and conflicts.

## Foundation and regional scope

| Need | Path under `configuration` | Discovery/relationship |
| --- | --- | --- |
| Cloud realm | `foundation.realm` | Confirm public/sovereign scope. Initial generator supports `oc1` and `oc19`; validate live support. |
| Target region | `foundation.region` | Exact OCI region identifier, with evidence for the selection. |
| Naming key | `foundation.regionShortName` | Supported regional key, at most three characters; clarify custom naming. |
| CIS baseline | `foundation.cisLevel` | Explicit level `1` or `2`; selection is not compliance. |
| Home/regional deployment | `foundation.stackScope` | `complete` for home-owned baseline or `regional` for DR reuse. Regional requires a different same-realm `homeRegion`. |
| Planned DR | `foundation.drRegion` | On the complete home design, identifies DR. Does not itself create a DR stack; each regional output has its own scoped revision. |
| Notifications | `foundation.notifications` | `useSingleRecipient` and all `default/cloudguard/iam/network/security` string fields. Determine single or per-topic recipients. Regional needs applicable Network/Security topics. |

Do not invent identifiers or recipients. Required blank fields cannot be replaced
with `example.com`, placeholders or an FDE personal address without evidence.

## Hub, environments, projects and connectivity

| Need | Model path | Discovery/relationship |
| --- | --- | --- |
| Hub topology | `network.hubKind` | `hub_a`, `hub_b`, `hub_c`, `hub_e`; explain supported alternatives and seek the required decision. |
| Hub network | `network.hubVcnCidr`, `network.subnets[]` | Subnet `name/cidr`, optionally `locked`. Confirm roles and ranges for the selected hub. |
| Environment | `environments[]` | Stable `id`, safe `name`, `securityZone`, optional `projectNetworkEnabled`, and `network {vcnCidr,subnets}`. Security Zone intent is separate from CIS level. |
| Optional spoke network | `environments[].projectNetworkEnabled` | Not mandatory for every environment. False requires established absence; disabled structural fields do not allocate an inferred network. |
| Project compartments | `projects[]` | Stable `id/name`, `environments: "all"` or environment IDs. Projects define compartment placement, not extension definitions. |
| Remote peering | `remotePeeringConnections[]` | Stable `id/name`, `acceptor/requester`, `remoteCidrs`, `peerRegionName`, and applicable `peerId/peerTenancyOcid/requestorGroupOcid`. Use real authorized identifiers. |

Check valid VCN/subnet ranges, containment and routed overlap. Capture on-premises,
other-cloud, service/pod and DR constraints in the ledger even without direct
model fields. Retain a confirmed reuse/translation decision for matching ranges.

Arbitrary VPN/FastConnect/IAM/resource objects are not current model inputs.
Resolve their manual/external scope explicitly. A `custom` platform does not
implement arbitrary services merely because its network can be represented.

## Environment and shared platforms

An environment platform is in `platforms[]`: stable `id`, config `key`, `type`,
placement `environments`, `vcnCidr`, `subnets` and optional `overrides` keyed by
environment ID. Overrides change `vcnCidr` and/or `subnets`. Confirm every effective
per-environment range; do not rely on an unnoticed index-derived shift.

Current types are `custom` and `oke_simple`. Shared network platforms are in
`sharedPlatforms[]` with `id/key`, optional `type: custom`, VCN and subnets.
Do not move shared resources into a project to force a fit.

For OKE capture `okeParams`:

- `kubernetesVersion`, `workerImage`, `workerBootVolumeSize`.
- `cniType: native|overlay`, `servicesCidr`, applicable `podsCidr`.
- `apiAllowedCidrs`, `createFss`, `publicLoadBalancer`.
- Optional `clusterSize: small|medium|large`; clarify profile versus manual
  subnet design. Preserve required subnet roles and validate the complete map.

Do not infer versions, image selectors or exposure policy from examples. Hub C
generated backend placeholders are not real third-party firewall backend targets.

## EXACC and EXACS

Use `exadata.exacc` and `exadata.exacs`, not `platforms[].type: exacc`.
Keep the model rather than importing exported generator JSON, which can omit
VMC/AVMC choices.

| Choice | EXACC | EXACS |
| --- | --- | --- |
| Inclusion | `enabled` | `enabled` |
| Infrastructure placement | `shared` boolean | `infrastructure: shared\|per_environment` |
| Database placement | `database: shared\|per_environment` | Same |
| Database service | `service: vmc\|autonomous\|both` when enabled; `none` is not a valid enabled selection | Same |
| Membership | `environments`: environment IDs | Same |
| Autonomous project tiers | `projectDb[environmentId]`: project ID arrays | Same |
| Networking | No ExaCS VCN fields; do not invent Cloud@Customer OCI networks | Applicable `sharedVcnCidr`, `environmentVcnCidrs[environmentId]` |
| Notifications | `notifications` | Same |

EXACC is Exadata Database Service on Cloud@Customer; EXACS is Exadata Database
Service on Dedicated Infrastructure in OCI. Neither label chooses VMC versus
Autonomous service automatically. Ask whether infrastructure and database clusters
are shared or dedicated per environment, which environments participate, and
whether Autonomous project tiers are needed. Skip DB-tier questions for VMC-only.

Exadata notification fields include single-recipient/default, optional
`dbWorkloads/infraWorkloads`, `environmentInfraEmails/environmentDbEmails`,
`projectEmails/projects`. Maps use environment IDs. `fallbackDefault` is import
compatibility; do not fabricate it for new designs. Validate service/placement
combinations; shape validity alone does not establish their meaning.

## Evidence and completeness

### Inactive structural fields

Use these serializations only after absence/exclusion is established. They are
representation values, not inferred customer placement or network allocations.

| Confirmed inactive scope | Structural representation in the current schema |
| --- | --- |
| EXACC excluded | `enabled: false`, `shared: true`, `database: shared`, `service: none`, `environments: []`, `projectDb: {}`, `notifications: {useSingleRecipient: true, default: ""}` |
| EXACS excluded | `enabled: false`, `infrastructure: shared`, `database: shared`, `service: none`, `environments: []`, `sharedVcnCidr: ""`, `environmentVcnCidrs: {}`, `projectDb: {}`, `notifications: {useSingleRecipient: true, default: ""}` |
| Environment project network absent | `projectNetworkEnabled: false`, `network: {vcnCidr: "", subnets: []}`; retain any applicable platform networks |
| No projects/environment platforms/shared platforms/RPC in scope | Empty collection for each confirmed absent category; optional RPC field can instead be omitted |
| Foundation uses one confirmed recipient list | Populate `default`, set `useSingleRecipient: true`; retain required other topic strings as empty, not invented addresses |

Enabled Exadata still needs an explicit VMC/AVMC selection. A hybrid shared
infrastructure component without its own network does not permit `service: none`
for the enabled extension. Validate the complete design after serialization.

### Provenance

Use JSON Pointer paths such as `/configuration/foundation/region` and
`/configuration/network/subnets/0/cidr`. Array indices identify the immutable
snapshot; stable IDs let the ledger regenerate pointers after reordering. Escape
pointer segments as needed and check that pointers resolve in the saved input.

Record actual workbook filename/version + sheet/range, BRD section/table, or
recorded answer with its real available locator. Never fabricate hashes, cells,
approval records or confidence percentages. Reconcile each material requirement
to a supported field, confirmed exclusion, accepted manual/external activity, or
question. Unknown applicability is not disabled. Missing worksheet coverage must
be disclosed and retrieved through an authorized reader or clarified.
