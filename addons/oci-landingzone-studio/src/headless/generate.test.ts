import { readFileSync } from 'node:fs';
import { beforeAll, expect, it } from 'vitest';
import { setAssetLoader } from '../generator/jsonnetVm';
import { generateOutputs } from '../generator/generate';
import { emptyLzModel } from '../model/defaults';
import { generateHeadless } from './generate';
import { hubKindDefaults } from '../services/hubKinds';
import { generatePreview } from '../generator/preview';
import { buildRouteTables } from '../services/routeTables';
import { buildGraph } from '../diagram/buildGraph';
import { toDrawioXml } from '../export/toDrawio';
import { createRegionalModel } from '../services/regionalDeployment';
import type { HubKind } from '../model/types';

beforeAll(() => setAssetLoader(async () => ({ wasmBinary: readFileSync('3rd/go-jsonnet/libjsonnet.wasm') })));

it.each<HubKind>(['hub_a', 'hub_b', 'hub_c', 'hub_e'])('headless %s preserves every canonical JSON file byte-for-byte', async (hubKind) => {
  const model = emptyLzModel();
  model.network = { hubKind, ...hubKindDefaults(hubKind) };
  const expected = await generateOutputs(model);
  const actual = await generateHeadless(model, 'Parity');
  for (const [file, contents] of Object.entries(expected.files)) expect(actual[file]).toBe(contents);
  expect(actual['config.jsonnet']).toBe(expected.config);
  expect(Object.keys(actual)).toHaveLength(Object.keys(expected.files).length + 2);
});

it('regional diagram matches the browser preview including home-owned compartment inventory', async () => {
  const model = createRegionalModel();
  model.foundation = { ...model.foundation, homeRegion: 'eu-frankfurt-1', region: 'eu-amsterdam-1', regionShortName: 'ams' };
  model.network = { hubKind: 'hub_a', ...hubKindDefaults('hub_a') };
  const preview = await generatePreview(model);
  const tables = buildRouteTables(model, preview.network);
  const expected = toDrawioXml(buildGraph(model, Infinity, { showDots: true, showEndpoints: true, openTables: tables.map((table) => table.id) }, undefined, tables, preview.inventory), 'Regional');
  expect((await generateHeadless(model, 'Regional'))['architecture.drawio']).toBe(expected);
});

it.each(['exacc', 'exacs'] as const)('headless %s preserves explicit service and placement outputs', async (type) => {
  const model = emptyLzModel();
  const extension = model.exadata[type];
  extension.enabled = true; extension.service = 'both'; extension.database = 'shared';
  extension.environments = model.environments.map((env) => env.id);
  extension.projectDb = Object.fromEntries(model.environments.map((env) => [env.id, [model.projects[0].id]]));
  extension.notifications.default = 'operations@example.com';
  const expected = await generateOutputs(model);
  const actual = await generateHeadless(model, 'Exadata');
  for (const [file, contents] of Object.entries(expected.files)) expect(actual[file]).toBe(contents);
  expect(actual['architecture.drawio']).toContain(type);
});
