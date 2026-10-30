import { mkdir, readFile, writeFile, mkdtemp, rename, rm, readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { zipSync, strToU8 } from 'fflate';
import { key, type Design } from './schema';

const sha = (value: string | Uint8Array) => createHash('sha256').update(value).digest('hex');
const digestPattern = /^[a-f0-9]{64}$/;
const filenamePattern = /^[a-z0-9][a-z0-9_.-]{0,100}\.(json|jsonnet|drawio|zip)$/;
export function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.entries(value).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(',')}}`;
  return JSON.stringify(value);
}
export interface Artifact { name: string; bytes: number; sha256: string }
export interface Manifest {
  generationId: string; projectId: string; revision: number; engineSha256: string;
  createdAt: string; status: 'review_required'; artifacts: Artifact[];
}
export class ArtifactStore {
  constructor(private readonly root: string, readonly engineSha256: string, private readonly ttlMs = 86400_000) {
    if (!digestPattern.test(engineSha256)) throw new Error('Invalid engine digest.');
  }
  generationId(design: Design) { return sha(canonical({ design, engineSha256: this.engineSha256 })); }
  private scope(client: string, project: string) { return join(this.root, key.parse(client), key.parse(project)); }
  private directory(client: string, project: string, id: string) {
    if (!digestPattern.test(id)) throw new Error('Invalid generation ID.');
    return join(this.scope(client, project), id);
  }
  async get(client: string, project: string, id: string): Promise<Manifest | undefined> {
    const directory = this.directory(client, project, id);
    try {
      const manifest = JSON.parse(await readFile(join(directory, 'manifest.json'), 'utf8')) as Manifest;
      if (Date.now() - Date.parse(manifest.createdAt) > this.ttlMs) return undefined;
      return manifest;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
      throw new Error('Artifact metadata unavailable.', { cause: error });
    }
  }
  async put(client: string, design: Design, generated: Record<string, string>): Promise<Manifest> {
    const id = this.generationId(design);
    const existing = await this.get(client, design.projectId, id);
    if (existing) return existing;
    const scope = this.scope(client, design.projectId);
    await mkdir(scope, { recursive: true, mode: 0o700 });
    await this.cleanScope(scope);
    if ((await readdir(scope)).filter((name) => digestPattern.test(name)).length >= 100) throw new Error('Project artifact quota reached.');
    const files: Record<string, Uint8Array> = {};
    for (const [name, body] of Object.entries(generated)) {
      if (!filenamePattern.test(name) || ['manifest.json', 'design.json', 'bundle.zip'].includes(name)) throw new Error('Unexpected generated filename.');
      files[name] = strToU8(body);
    }
    files['design.json'] = strToU8(JSON.stringify(design, null, 2) + '\n');
    const artifacts = () => Object.entries(files).map(([name, bytes]) => ({ name, bytes: bytes.byteLength, sha256: sha(bytes) }));
    const manifest: Manifest = { generationId: id, projectId: design.projectId, revision: design.revision,
      engineSha256: this.engineSha256, createdAt: new Date().toISOString(), status: 'review_required', artifacts: artifacts() };
    const manifestBytes = strToU8(JSON.stringify(manifest, null, 2) + '\n');
    files['bundle.zip'] = zipSync({ ...files, 'manifest.json': manifestBytes });
    manifest.artifacts = artifacts();
    const temporary = await mkdtemp(join(scope, '.pending-'));
    try {
      for (const [name, bytes] of Object.entries(files)) await writeFile(join(temporary, name), bytes, { mode: 0o600, flag: 'wx' });
      await writeFile(join(temporary, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n', { mode: 0o600, flag: 'wx' });
      await rename(temporary, this.directory(client, design.projectId, id));
    } catch (error) {
      await rm(temporary, { recursive: true, force: true });
      const concurrent = await this.get(client, design.projectId, id);
      if (concurrent) return concurrent;
      throw error;
    }
    return manifest;
  }
  async read(client: string, project: string, id: string, name: string, offset = 0) {
    if (!Number.isSafeInteger(offset) || offset < 0 || !filenamePattern.test(name)) throw new Error('Invalid artifact request.');
    const manifest = await this.get(client, project, id);
    const artifact = manifest?.artifacts.find((entry) => entry.name === name);
    if (!artifact) throw new Error('Artifact not found.');
    const bytes = await readFile(join(this.directory(client, project, id), name));
    if (sha(bytes) !== artifact.sha256) throw new Error('Artifact integrity check failed.');
    if (offset > bytes.length) throw new Error('Offset exceeds artifact size.');
    const end = Math.min(bytes.length, offset + 192 * 1024);
    return { ...artifact, encoding: 'base64', offset, nextOffset: end < bytes.length ? end : null, data: bytes.subarray(offset, end).toString('base64') };
  }
  private async cleanScope(scope: string) {
    for (const entry of await readdir(scope, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const dir = join(scope, entry.name);
      const age = Date.now() - (await stat(dir)).mtimeMs;
      if ((digestPattern.test(entry.name) && age > this.ttlMs) || (entry.name.startsWith('.pending-') && age > 3600_000)) await rm(dir, { recursive: true, force: true });
    }
  }
  async sweep() {
    await mkdir(this.root, { recursive: true, mode: 0o700 });
    for (const client of await readdir(this.root, { withFileTypes: true })) if (client.isDirectory() && key.safeParse(client.name).success) {
      for (const project of await readdir(join(this.root, client.name), { withFileTypes: true })) if (project.isDirectory() && key.safeParse(project.name).success) {
        await this.cleanScope(join(this.root, client.name, project.name));
      }
    }
  }
}
