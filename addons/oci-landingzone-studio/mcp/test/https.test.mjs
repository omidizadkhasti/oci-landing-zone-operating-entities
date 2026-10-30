import { test } from 'node:test';
import assert from 'node:assert/strict';
import https from 'node:https';
import net from 'node:net';
import { spawn, execFileSync } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { once } from 'node:events';
import { connectClient } from '../client.mjs';

async function freePort() {
  const server = net.createServer(); server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const port = server.address().port; await new Promise((resolve) => server.close(resolve)); return port;
}
test('HTTPS rejects absent/unbound certificates, spoofed identity, invalid origin/host and malformed/oversized input', async () => {
  const root = await mkdtemp(join(tmpdir(), 'lz-tls-'));
  execFileSync('bash', ['deploy/create-test-pki.sh', root], { stdio: 'pipe' });
  const port = await freePort(); const healthPort = await freePort();
  const server = spawn(process.execPath, ['dist/server.mjs'], { env: {
    ...process.env, PORT: String(port), HEALTH_PORT: String(healthPort), LZ_ALLOWED_HOSTS: `localhost:${port}`,
    LZ_CLIENTS_FILE: join(root, 'clients.json'), LZ_DATA_DIR: join(root, 'data'),
    LZ_TLS_KEY_FILE: join(root, 'tls.key'), LZ_TLS_CERT_FILE: join(root, 'tls.crt'), LZ_TLS_CA_FILE: join(root, 'ca.crt'),
  }, stdio: ['ignore', 'pipe', 'pipe'] });
  const ready = new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Server did not become ready.')), 15000);
    server.stdout.on('data', (data) => { if (data.toString().includes('"event":"ready"')) { clearTimeout(timeout); resolve(); } });
    server.once('exit', () => { clearTimeout(timeout); reject(new Error('Server exited.')); });
  });
  const ca = await readFile(join(root, 'ca.crt'));
  const certificate = async (identity) => identity ? { cert: await readFile(join(root, `${identity}.crt`)), key: await readFile(join(root, `${identity}.key`)) } : {};
  const request = async (identity, headers = {}, body = '{}') => {
    const credentials = await certificate(identity);
    return await new Promise((resolve, reject) => {
      const req = https.request(`https://localhost:${port}/mcp`, { ca, ...credentials, servername: 'localhost', method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers } }, (response) => {
        response.resume(); response.once('end', () => resolve(response.statusCode));
      });
      req.once('error', reject); req.end(body);
    });
  };
  try {
    await ready;
    await assert.rejects(request(undefined));
    assert.equal(await request('unbound', { 'X-Client-Id': 'planning' }), 403);
    assert.equal(await request('planning', { Origin: 'https://attacker.invalid' }), 403);
    assert.equal(await request('planning', { Host: 'attacker.invalid' }), 403);
    assert.equal(await request('planning', {}, '{bad json'), 400);
    assert.equal(await request('planning', {}, '[{}]'), 400);
    assert.equal(await request('planning', {}, '{"__proto__":{}}'), 400);
    assert.equal(await request('planning', { 'Content-Type': 'text/plain' }), 415);
    assert.equal(await request('planning', {}, 'a'.repeat(1024 * 1024 + 8192)), 413);
    const connection = await connectClient({ LZ_MCP_URL: `https://localhost:${port}/mcp`,
      LZ_CLIENT_CA_FILE: join(root, 'ca.crt'), LZ_CLIENT_CERT_FILE: join(root, 'planning.crt'), LZ_CLIENT_KEY_FILE: join(root, 'planning.key') });
    try { assert.equal((await connection.client.listTools()).tools.length, 5); } finally { await connection.close(); }
  } finally {
    server.kill('SIGTERM'); await once(server, 'exit'); await rm(root, { recursive: true, force: true });
  }
});
