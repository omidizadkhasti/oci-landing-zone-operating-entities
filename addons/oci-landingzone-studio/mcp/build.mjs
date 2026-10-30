import { build } from 'esbuild';
import { readdir, readFile, mkdir, copyFile, writeFile, chmod } from 'node:fs/promises';
import { resolve, relative } from 'node:path';
import { createHash } from 'node:crypto';

const studio = resolve('..');
const gen = resolve(studio, '../../gen');
async function sources(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  return (await Promise.all(entries.map(async (entry) => {
    const path = resolve(dir, entry.name);
    if (entry.isDirectory()) return sources(path);
    return /\.(jsonnet|libsonnet)$/.test(path) ? [[relative(gen, path), await readFile(path, 'utf8')]] : [];
  }))).flat();
}
const files = Object.fromEntries(await sources(gen));
if (!files['landing_zone_multi.jsonnet']) throw new Error('Canonical gen/ sources are missing.');
await mkdir('dist/wasm', { recursive: true });
await copyFile(resolve(studio, '3rd/go-jsonnet/libjsonnet.wasm'), 'dist/wasm/libjsonnet.wasm');
// The upstream build uses mktemp (0600); the public runtime must be readable by the non-root image user.
await chmod('dist/wasm/libjsonnet.wasm', 0o644);
const adapters = {
  name: 'headless-generator-assets',
  setup(builder) {
    builder.onLoad({ filter: /\/generator\/virtualFs\.ts$/ }, () => ({
      contents: `const files = ${JSON.stringify(files)}; export function buildVirtualFs() { return {files, entry:'landing_zone_multi.jsonnet', defaults:'defaults.libsonnet'}; }`,
      loader: 'js',
    }));
    builder.onResolve({ filter: /libjsonnet\.wasm\?url$/ }, () => ({ path: 'wasm-url', namespace: 'headless' }));
    builder.onLoad({ filter: /.*/, namespace: 'headless' }, () => ({ contents: "export default 'wasm/libjsonnet.wasm'", loader: 'js' }));
  },
};
await build({
  entryPoints: ['src/server.ts', 'src/worker.ts', 'src/engine.ts', 'src/schema.ts', 'src/store.ts', 'src/runner.ts'],
  outdir: 'dist', outExtension: { '.js': '.mjs' }, bundle: true, platform: 'node', target: 'node24', format: 'esm',
  external: ['@modelcontextprotocol/sdk/*', 'zod'], plugins: [adapters],
});
const hash = createHash('sha256');
for (const file of ['worker.mjs', 'server.mjs', 'wasm/libjsonnet.wasm', '../package-lock.json']) {
  hash.update(await readFile(`dist/${file}`));
}
await writeFile('dist/version.json', JSON.stringify({ version: '0.1.0', engineSha256: hash.digest('hex') }) + '\n');
// Complete synthetic example, generated from upstream defaults, never customer data.
const { emptyLzModel } = await import('./dist/engine.mjs');
const model = emptyLzModel();
model.foundation.notifications.default = 'operations@example.com';
await writeFile('dist/example-design.json', JSON.stringify({
  schemaVersion: '1.0', projectId: 'smoke-test', revision: 1, name: 'example', configuration: model,
  evidence: [], decisions: [], unresolvedItems: [],
}, null, 2) + '\n');
const { z } = await import('zod');
const { designSchema } = await import('./dist/schema.mjs');
await writeFile('dist/design.schema.json', JSON.stringify(z.toJSONSchema(designSchema), null, 2) + '\n');
