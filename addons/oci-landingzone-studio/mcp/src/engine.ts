import { readFile } from 'node:fs/promises';
import { setAssetLoader } from '../../src/generator/jsonnetVm';
import { generateHeadless } from '../../src/headless/generate';
import { validatePlatformContracts } from '../../src/services/platformValidation';
import { validateOkeModel } from '../../src/services/okeValidation';
import { validateExadataModel } from '../../src/services/exadata';
import { validateRemotePeering } from '../../src/services/remotePeering';
import { validateRegionalDeployment } from '../../src/services/regionalDeployment';
import { findRegion, regionShortNameError } from '../../src/services/regions';
import { validateNotificationEmails } from '../../src/services/notificationEmails';
import { vcnConflicts } from '../../src/services/vcnConflicts';
import { parseDesign, type Design } from './schema';
export { emptyLzModel } from '../../src/model/defaults';

setAssetLoader(async () => ({ wasmBinary: await readFile(new URL('./wasm/libjsonnet.wasm', import.meta.url)) }));

export interface Validation { valid: boolean; issues: string[] }
export function validateDesign(design: Design): Validation {
  const m = design.configuration;
  const issues = [...validatePlatformContracts(m), ...validateOkeModel(m), ...validateExadataModel(m),
    ...validateRemotePeering(m), ...validateRegionalDeployment(m),
    ...validateNotificationEmails(m.foundation.notifications, m.foundation.stackScope === 'regional'),
    ...Object.values(vcnConflicts(m)).flat()];
  if (!findRegion(m.foundation.realm, m.foundation.region)) issues.push('Foundation region must belong to a supported realm.');
  if (m.foundation.drRegion && (!findRegion(m.foundation.realm, m.foundation.drRegion) || m.foundation.drRegion === m.foundation.region)) {
    issues.push('DR region must be different and belong to the same realm.');
  }
  const shortNameError = regionShortNameError(m.foundation.regionShortName);
  if (shortNameError) issues.push(shortNameError);
  const envIds = new Set(m.environments.map((e) => e.id));
  for (const [label, entities] of Object.entries({ environments: m.environments, projects: m.projects, platforms: m.platforms, sharedPlatforms: m.sharedPlatforms })) {
    if (new Set(entities.map((e) => e.id)).size !== entities.length) issues.push(`Duplicate ${label} IDs.`);
  }
  if (new Set(m.environments.map((e) => e.name)).size !== m.environments.length) issues.push('Duplicate environment names.');
  if (new Set(m.projects.map((p) => p.name)).size !== m.projects.length) issues.push('Duplicate project names.');
  for (const p of m.projects) if (p.environments !== 'all' && p.environments.some((id) => !envIds.has(id))) issues.push(`Project ${p.name} references an unknown environment.`);
  if (m.environments.some((e) => e.projectNetworkEnabled !== false && !e.network.subnets.length)) issues.push('Enabled project networks require subnets.');
  if (design.unresolvedItems.length) issues.push('Resolve outstanding design questions before generation.');
  return { valid: issues.length === 0, issues: [...new Set(issues)].slice(0, 200) };
}

export async function runEngine(action: 'validate' | 'generate', input: unknown) {
  const design = parseDesign(input);
  const validation = validateDesign(design);
  if (action === 'validate' || !validation.valid) return { validation };
  const files = await generateHeadless(design.configuration, design.name);
  if (Object.keys(files).length > 256 || Object.values(files).reduce((sum, body) => sum + Buffer.byteLength(body), 0) > 16 * 1024 * 1024) {
    throw new Error('Generated output exceeds the supported limit.');
  }
  return { validation, files };
}
