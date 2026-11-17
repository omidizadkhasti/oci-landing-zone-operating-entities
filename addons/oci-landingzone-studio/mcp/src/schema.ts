import { z } from 'zod';
import { LZ_MODEL_VERSION } from '../../src/model/defaults';

export const key = z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/);
const text = z.string().max(1024);
const names = z.array(key).max(64);
const placement = z.union([z.literal('all'), names]);
const subnet = z.strictObject({ name: key, cidr: text, locked: z.boolean().optional() });
const subnets = z.array(subnet).min(1).max(64);
const network = z.strictObject({ vcnCidr: text, subnets });
const notifications = z.strictObject({
  useSingleRecipient: z.boolean().optional(), default: text, cloudguard: text, iam: text, network: text, security: text,
});
const exadataNotifications = z.strictObject({
  useSingleRecipient: z.boolean().optional(), default: text,
  fallbackDefault: z.strictObject({ recipients: z.array(text).max(64), source: text }).optional(),
  dbWorkloads: text.optional(), infraWorkloads: text.optional(),
  environmentInfraEmails: z.record(key, text).optional(), environmentDbEmails: z.record(key, text).optional(),
  projectEmails: z.record(key, text).optional(), projects: text.optional(),
});
const service = z.enum(['none', 'autonomous', 'vmc', 'both']);
const projectDb = z.record(key, names);
const override = z.strictObject({ vcnCidr: text.optional(), subnets: subnets.optional() });
const okeParamsSchema = z.strictObject({
      kubernetesVersion: text, servicesCidr: text, apiAllowedCidrs: z.array(text).max(64), workerImage: text,
      workerBootVolumeSize: z.number().int().min(1).max(32768), cniType: z.enum(['native', 'overlay']),
      clusterSize: z.enum(['small', 'medium', 'large']).optional(), podsCidr: text.optional(),
      createFss: z.boolean(), publicLoadBalancer: z.boolean(),
});
const platform = z.strictObject({
    id: key, key, type: z.enum(['oke_simple', 'custom']), environments: placement, vcnCidr: text, subnets,
    overrides: z.record(key, override).optional(),
    okeParams: okeParamsSchema.optional(),
  });
// Empty subnet arrays explicitly select generator-owned automatic OKE layout.
// All manual/custom and hub subnet contracts retain their nonempty requirement.
const automaticOkePlatform = platform.extend({
  type: z.literal('oke_simple'),
  subnets: z.array(subnet).length(0),
  okeParams: okeParamsSchema.extend({ clusterSize: z.enum(['small', 'medium', 'large']) }),
  overrides: z.record(key, z.strictObject({
    vcnCidr: text.optional(), subnets: z.array(subnet).length(0).optional(),
  })).optional(),
});
export const modelSchema = z.strictObject({
  version: z.literal(LZ_MODEL_VERSION),
  foundation: z.strictObject({
    stackScope: z.enum(['complete', 'regional']).optional(), homeRegion: text.optional(), drRegion: text.optional(),
    description: text.optional(), realm: key, region: key, regionShortName: key, cisLevel: z.union([z.literal(1), z.literal(2)]),
    notifications,
  }),
  network: z.strictObject({ hubKind: z.enum(['hub_a', 'hub_b', 'hub_c', 'hub_e']), hubVcnCidr: text, subnets }),
  environments: z.array(z.strictObject({
    id: key, name: key, securityZone: z.boolean(), projectNetworkEnabled: z.boolean().optional(),
    network: z.strictObject({ vcnCidr: text, subnets: z.array(subnet).max(64) }),
  })).max(32),
  projects: z.array(z.strictObject({ id: key, name: key, environments: placement })).max(64),
  platforms: z.array(z.union([platform, automaticOkePlatform])).max(32),
  sharedPlatforms: z.array(z.strictObject({ id: key, key, type: z.literal('custom').optional(), ...network.shape })).max(32),
  exadata: z.strictObject({
    exacc: z.strictObject({
      enabled: z.boolean(), shared: z.boolean(), database: z.enum(['shared', 'per_environment']).optional(),
      service: service.optional(), autonomous: z.boolean().optional(), environments: names, projectDb, notifications: exadataNotifications,
    }),
    exacs: z.strictObject({
      enabled: z.boolean(), infrastructure: z.enum(['shared', 'per_environment']), database: z.enum(['shared', 'per_environment']),
      service, environments: names, sharedVcnCidr: text, environmentVcnCidrs: z.record(key, text), projectDb, notifications: exadataNotifications,
    }),
  }),
  remotePeeringConnections: z.array(z.strictObject({
    id: key, name: key, role: z.enum(['acceptor', 'requester']), remoteCidrs: z.array(text).max(64),
    peerRegionName: key, peerId: text.optional(), peerTenancyOcid: text.optional(), requestorGroupOcid: text.optional(),
  })).max(32).optional(),
});
export const designSchema = z.strictObject({
  schemaVersion: z.literal('1.0'), projectId: key, revision: z.number().int().min(1).max(1_000_000),
  name: key, configuration: modelSchema,
  evidence: z.array(z.strictObject({ field: text, source: text, locator: text })).max(2000),
  decisions: z.array(z.strictObject({ field: text, status: z.enum(['confirmed', 'proposed']), rationale: text })).max(1000),
  unresolvedItems: z.array(text).max(1000),
});
export type Design = z.infer<typeof designSchema>;
export const MAX_INPUT_BYTES = 1024 * 1024;

/** Reject prototype keys before data reaches serializers, object spreads or Jsonnet. */
export function rejectUnsafeKeys(value: unknown, depth = 0): void {
  if (depth > 32) throw new Error('Input nesting exceeds the limit.');
  if (value && typeof value === 'object') for (const [name, child] of Object.entries(value)) {
    if (['__proto__', 'constructor', 'prototype'].includes(name)) throw new Error('Reserved object key.');
    rejectUnsafeKeys(child, depth + 1);
  }
}

export function parseDesign(value: unknown): Design {
  if (Buffer.byteLength(JSON.stringify(value)) > MAX_INPUT_BYTES) throw new Error('Design exceeds 1 MiB.');
  rejectUnsafeKeys(value);
  return designSchema.parse(value);
}
