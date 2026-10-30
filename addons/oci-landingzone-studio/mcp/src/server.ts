import { createServer as createHttpsServer } from 'node:https';
import { createServer as createHttpServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { TLSSocket } from 'node:tls';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { ArtifactStore } from './store';
import { EngineRunner } from './runner';
import { key, parseDesign, MAX_INPUT_BYTES, rejectUnsafeKeys } from './schema';

const clientsSchema = z.array(z.strictObject({ id: key, certificateSha256: z.string().regex(/^[a-f0-9]{64}$/), projectIds: z.array(key).min(1).max(64) })).min(1).max(16);
export type ClientIdentity = z.infer<typeof clientsSchema>[number];
const result = (value: Record<string, unknown>) => ({ content: [{ type: 'text' as const, text: JSON.stringify(value) }], structuredContent: value });
const toolError = (message: string) => ({ content: [{ type: 'text' as const, text: message }], isError: true });

export function authorizeProject(client: ClientIdentity, projectId: string) {
  key.parse(projectId);
  if (!client.projectIds.includes(projectId)) throw new Error('Project access denied.');
}
export function createMcpServer(client: ClientIdentity, store: ArtifactStore, runner: EngineRunner) {
  const server = new McpServer({ name: 'oci-landing-zone-studio', version: '0.1.0' });
  server.registerTool('landingzone_capabilities', {
    description: 'Get the supported design JSON Schema, limits and synthetic example. Examples are not customer facts.',
    inputSchema: z.strictObject({}), annotations: { readOnlyHint: true, openWorldHint: false },
  }, async () => result({
    schemaVersion: '1.0', engineSha256: store.engineSha256, maxInputBytes: MAX_INPUT_BYTES,
    transport: 'streamable-http', generation: 'bounded-synchronous', maxConcurrent: 1, retentionHours: 24,
    outputs: ['drawio', 'jsonnet', 'generated-json', 'zip'], artifactReferenceInput: false,
    projectIds: client.projectIds,
    schema: JSON.parse(await readFile(new URL('./design.schema.json', import.meta.url), 'utf8')),
    example: JSON.parse(await readFile(new URL('./example-design.json', import.meta.url), 'utf8')),
  }));
  for (const action of ['validate', 'generate'] as const) server.registerTool(`landingzone_${action}`, {
    description: action === 'generate'
      ? 'Generate review-required Draw.io and all supported configuration files from one complete design JSON. Does not deploy OCI resources.'
      : 'Validate a complete design JSON against the current Studio contract. Does not generate or deploy resources.',
    inputSchema: z.strictObject({ design: z.unknown() }),
    annotations: { readOnlyHint: action === 'validate', destructiveHint: false, idempotentHint: true, openWorldHint: false },
  }, async ({ design: input }, extra) => {
    const parsed = (() => { try { return parseDesign(input); } catch { return undefined; } })();
    if (!parsed) return toolError('Invalid design. Use the capabilities JSON Schema; unknown fields, reserved keys and oversized designs are rejected.');
    try {
      authorizeProject(client, parsed.projectId);
      if (action === 'generate') {
        const previous = await store.get(client.id, parsed.projectId, store.generationId(parsed));
        if (previous) return result({ ...previous });
      }
      const output = await runner.run(action, parsed, extra.signal);
      if (!output.validation.valid || action === 'validate') return result({ ...output.validation });
      return result({ ...await store.put(client.id, parsed, output.files!) });
    } catch (error) {
      const message = error instanceof Error ? error.message : '';
      const safe = ['Project access denied.', 'Generator busy. Retry later.', 'Request cancelled.', 'Generation timed out.', 'Project artifact quota reached.'];
      return toolError(safe.includes(message) ? message : 'Generation failed. Check design validation or contact the service operator.');
    }
  });
  server.registerTool('landingzone_get_generation', {
    description: 'Get a completed generation manifest within the authenticated caller and project scope.',
    inputSchema: z.strictObject({ projectId: key, generationId: z.string().regex(/^[a-f0-9]{64}$/) }),
    annotations: { readOnlyHint: true, openWorldHint: false },
  }, async ({ projectId, generationId }) => {
    try { authorizeProject(client, projectId); return result({ manifest: await store.get(client.id, projectId, generationId) ?? null }); }
    catch { return toolError('Generation unavailable or access denied.'); }
  });
  server.registerTool('landingzone_read_artifact', {
    description: 'Read a bounded base64 artifact chunk. Reassemble and verify its SHA-256 outside model context. Prefer bundle.zip.',
    inputSchema: z.strictObject({ projectId: key, generationId: z.string().regex(/^[a-f0-9]{64}$/),
      name: z.string().max(128), offset: z.number().int().min(0).max(16 * 1024 * 1024).default(0) }),
    annotations: { readOnlyHint: true, openWorldHint: false },
  }, async ({ projectId, generationId, name, offset }) => {
    try { authorizeProject(client, projectId); return result(await store.read(client.id, projectId, generationId, name, offset)); }
    catch { return toolError('Artifact unavailable or access denied.'); }
  });
  return server;
}

export async function startServer() {
  const required = (name: string) => { const value = process.env[name]; if (!value) throw new Error(`Missing ${name}.`); return value; };
  const clients = clientsSchema.parse(JSON.parse(await readFile(required('LZ_CLIENTS_FILE'), 'utf8')));
  if (new Set(clients.map((c) => c.id)).size !== clients.length || new Set(clients.map((c) => c.certificateSha256)).size !== clients.length) throw new Error('Duplicate client binding.');
  const version = JSON.parse(await readFile(new URL('./version.json', import.meta.url), 'utf8'));
  const store = new ArtifactStore(required('LZ_DATA_DIR'), version.engineSha256);
  await store.sweep();
  const runner = new EngineRunner();
  const hosts = required('LZ_ALLOWED_HOSTS').split(',');
  const origins = (process.env.LZ_ALLOWED_ORIGINS ?? '').split(',').filter(Boolean);
  let requests = 0;
  const handler = async (request: IncomingMessage, response: ServerResponse) => {
    const started = Date.now();
    let caller = 'unbound';
    response.once('finish', () => console.log(JSON.stringify({ event: 'mcp_request', caller,
      status: response.statusCode, durationMs: Date.now() - started })));
    response.setHeader('Cache-Control', 'no-store'); response.setHeader('X-Content-Type-Options', 'nosniff');
    if (!hosts.includes(request.headers.host ?? '') || (request.headers.origin && !origins.includes(request.headers.origin))) {
      response.writeHead(403).end(); return;
    }
    const socket = request.socket;
    const fingerprint = socket instanceof TLSSocket && socket.authorized ? socket.getPeerCertificate().fingerprint256?.replaceAll(':', '').toLowerCase() : '';
    const client = clients.find((entry) => entry.certificateSha256 === fingerprint);
    if (!client) { response.writeHead(403).end(); return; }
    caller = client.id;
    if (request.url !== '/mcp') { response.writeHead(404).end(); return; }
    if (request.method !== 'POST') { response.writeHead(405, { Allow: 'POST' }).end(); return; }
    if (!/^application\/json(?:\s*;|$)/i.test(request.headers['content-type'] ?? '') || request.headers['content-encoding']) {
      response.writeHead(415).end(); return;
    }
    if (requests >= 16) { response.writeHead(429, { 'Retry-After': '5' }).end(); return; }
    requests++;
    const controller = new AbortController();
    response.once('close', () => { if (!response.writableEnded) controller.abort(); });
    try {
      let size = 0;
      const chunks: Buffer[] = [];
      for await (const chunk of request) {
        size += chunk.length;
        if (size > MAX_INPUT_BYTES + 4096) { response.writeHead(413).end(); return; }
        chunks.push(chunk);
      }
      let body;
      try { body = JSON.parse(Buffer.concat(chunks).toString('utf8')); rejectUnsafeKeys(body); }
      catch { response.writeHead(400).end(); return; }
      if (Array.isArray(body)) { response.writeHead(400).end(); return; }
      const server = createMcpServer(client, store, runner);
      const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
      response.once('close', () => { void transport.close(); void server.close(); });
      // SDK propagates connection cancellation to each tool's AbortSignal.
      controller.signal.addEventListener('abort', () => { void transport.close(); }, { once: true });
      await server.connect(transport);
      await transport.handleRequest(request, response, body);
    } catch {
      if (!response.headersSent) response.writeHead(500).end();
    } finally { requests--; }
  };
  const server = createHttpsServer({
    key: await readFile(required('LZ_TLS_KEY_FILE')), cert: await readFile(required('LZ_TLS_CERT_FILE')),
    ca: await readFile(required('LZ_TLS_CA_FILE')), requestCert: true, rejectUnauthorized: true,
    minVersion: 'TLSv1.2', maxHeaderSize: 8192,
  }, (req, res) => { void handler(req, res); });
  server.requestTimeout = 75_000; server.headersTimeout = 10_000; server.maxConnections = 64;
  server.keepAliveTimeout = 5_000;
  server.setTimeout(75_000, (socket) => socket.destroy());
  const health = createHttpServer((request, response) => {
    if (request.method === 'GET' && ['/healthz', '/readyz'].includes(request.url ?? '')) response.writeHead(200).end('ok');
    else response.writeHead(404).end();
  });
  health.maxConnections = 16; health.requestTimeout = 5_000;
  const port = Number(process.env.PORT ?? 8443);
  const healthPort = Number(process.env.HEALTH_PORT ?? 8081);
  await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(port, '0.0.0.0', () => resolve()); });
  await new Promise<void>((resolve, reject) => { health.once('error', reject); health.listen(healthPort, '0.0.0.0', () => resolve()); });
  const sweep = setInterval(() => { void store.sweep().catch(() => console.error('Artifact retention sweep failed.')); }, 3600_000).unref();
  const stop = () => { clearInterval(sweep); server.close(); health.close(); setTimeout(() => process.exit(0), 10_000).unref(); };
  process.once('SIGTERM', stop); process.once('SIGINT', stop);
  console.log(JSON.stringify({ event: 'ready', version: version.version, engineSha256: version.engineSha256 }));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  startServer().catch(() => { console.error('MCP startup failed. Verify operator configuration, storage and TLS files.'); process.exitCode = 1; });
}
