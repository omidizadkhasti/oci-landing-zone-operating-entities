import https from 'node:https';
import { readFile } from 'node:fs/promises';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

/** Operator-configured mTLS fetch adapter for the official MCP client. No URL comes from a tool argument. */
export async function connectClient(environment = process.env) {
  const endpoint = new URL(environment.LZ_MCP_URL);
  if (endpoint.protocol !== 'https:' || endpoint.username || endpoint.password || endpoint.search || endpoint.hash || endpoint.pathname !== '/mcp') throw new Error('Expected an HTTPS /mcp endpoint.');
  const agent = new https.Agent({
    ca: await readFile(environment.LZ_CLIENT_CA_FILE), cert: await readFile(environment.LZ_CLIENT_CERT_FILE),
    key: await readFile(environment.LZ_CLIENT_KEY_FILE), minVersion: 'TLSv1.2', keepAlive: true,
  });
  const secureFetch = async (url, init = {}) => {
    if (new URL(url).href !== endpoint.href) throw new Error('Unexpected MCP endpoint.');
    return await new Promise((resolve, reject) => {
      const request = https.request(endpoint, {
        agent, method: init.method ?? 'POST', headers: Object.fromEntries(new Headers(init.headers)),
        servername: environment.LZ_MCP_SERVERNAME ?? endpoint.hostname,
      }, (response) => {
        const chunks = []; let size = 0;
        response.on('data', (chunk) => {
          size += chunk.length;
          if (size > 4 * 1024 * 1024) request.destroy(new Error('MCP response too large.'));
          else chunks.push(chunk);
        });
        response.once('error', reject);
        response.once('end', () => resolve(new Response(response.statusCode === 204 || response.statusCode === 202 ? null : Buffer.concat(chunks), {
          status: response.statusCode, headers: Object.fromEntries(Object.entries(response.headers).filter(([, value]) => typeof value === 'string')),
        })));
      });
      request.setTimeout(75_000, () => request.destroy(new Error('MCP request timed out.')));
      request.once('error', reject);
      const abort = () => request.destroy(new Error('MCP request cancelled.'));
      init.signal?.addEventListener('abort', abort, { once: true });
      request.once('close', () => init.signal?.removeEventListener('abort', abort));
      if (init.signal?.aborted) abort();
      request.end(init.body);
    });
  };
  const client = new Client({ name: 'studio-mcp-client', version: '0.1.0' });
  const transport = new StreamableHTTPClientTransport(endpoint, { fetch: secureFetch });
  await client.connect(transport);
  return { client, close: async () => { await client.close(); agent.destroy(); } };
}
