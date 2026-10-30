import type { LzModel } from '../model/types';
import { generateOutputSnapshot } from '../generator/generate';
import { buildGraph } from '../diagram/buildGraph';
import { toDrawioXml } from '../export/toDrawio';
import { buildRouteTables } from '../services/routeTables';
import { extractGeneratedResources } from '../services/generatedResources';

/** Browser-independent facade. The host supplies the generator's runtime assets. */
export async function generateHeadless(model: LzModel, name: string): Promise<Record<string, string>> {
  const outputs = await generateOutputSnapshot(model);
  const parsed = Object.fromEntries(Object.entries(outputs.files).map(([file, body]) => [file, JSON.parse(body)]));
  const inventoryFiles = Object.fromEntries(Object.entries(parsed).filter(([file]) =>
    !file.endsWith('_pre.json') && !['network.json', 'network_backends.json', 'iam.json', 'governance.json'].includes(file)));
  const inventory = extractGeneratedResources(inventoryFiles, outputs.compartments);
  const tables = buildRouteTables(model, parsed['network.json']);
  const diagram = buildGraph(model, Infinity, { showDots: true, showEndpoints: true, openTables: tables.map((table) => table.id) }, undefined, tables, inventory);
  return { ...outputs.files, 'config.jsonnet': outputs.config, 'architecture.drawio': toDrawioXml(diagram, name) };
}
