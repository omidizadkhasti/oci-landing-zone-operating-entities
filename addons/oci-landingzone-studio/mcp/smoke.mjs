import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { connectClient } from './client.mjs';

const connection = await connectClient();
try {
  const tools = await connection.client.listTools();
  assert.equal(tools.tools.length, 5);
  const capabilities = await connection.client.callTool({ name: 'landingzone_capabilities', arguments: {} });
  assert.equal(capabilities.structuredContent.schemaVersion, '1.0');
  const design = JSON.parse(await readFile(new URL('./dist/example-design.json', import.meta.url), 'utf8'));
  const invalid = structuredClone(design); invalid.projectId = 'forbidden-project';
  assert.equal((await connection.client.callTool({ name: 'landingzone_generate', arguments: { design: invalid } })).isError, true);
  const validated = await connection.client.callTool({ name: 'landingzone_validate', arguments: { design } });
  assert.equal(validated.structuredContent.valid, true);
  const generated = await connection.client.callTool({ name: 'landingzone_generate', arguments: { design } }, undefined, { timeout: 75_000 });
  assert.notEqual(generated.isError, true, generated.content?.[0]?.text);
  const manifest = generated.structuredContent;
  const retried = await connection.client.callTool({ name: 'landingzone_generate', arguments: { design } });
  assert.deepEqual(retried.structuredContent, manifest);
  const chunks = []; let offset = 0;
  do {
    const response = await connection.client.callTool({ name: 'landingzone_read_artifact', arguments: {
      projectId: design.projectId, generationId: manifest.generationId, name: 'bundle.zip', offset,
    } });
    assert.notEqual(response.isError, true);
    chunks.push(Buffer.from(response.structuredContent.data, 'base64'));
    offset = response.structuredContent.nextOffset;
  } while (offset !== null);
  const bundle = Buffer.concat(chunks);
  assert.equal(createHash('sha256').update(bundle).digest('hex'), manifest.artifacts.find((a) => a.name === 'bundle.zip').sha256);
  if (process.env.LZ_SMOKE_BUNDLE_FILE) await writeFile(process.env.LZ_SMOKE_BUNDLE_FILE, bundle, { mode: 0o600 });
  console.log(JSON.stringify({ status: 'passed', tools: tools.tools.map((t) => t.name), generationId: manifest.generationId,
    engineSha256: manifest.engineSha256, artifacts: manifest.artifacts.map(({ name, bytes }) => ({ name, bytes })),
    checks: ['mTLS', 'official-sdk-handshake', 'tools-list', 'schema', 'validation', 'project-denial', 'generation', 'idempotency', 'bundle-sha256'],
  }, null, 2));
} finally { await connection.close(); }
