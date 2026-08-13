/**
 * LLM Request Lifecycle Tests (RFC W3 / Patch D1)
 *
 * Uses a local controllable HTTP server (node:http, no real provider) to
 * verify three-tier timeout + single AbortController + try/finally cleanup.
 *
 * Scenarios:
 *   - Normal JSON body (non-stream)
 *   - Body stall after headers → body_timeout
 *   - Normal SSE stream with *   - Stream idle stall (one token then hang) → stream_idle_timeout
 *   - Consumer early break → cleanup (no open handle)
 *   - Error reason codes on timeout
 *
 * All timeouts use short values (50-200ms) for fast tests.
 * The server is closed in afterEach to prevent open handles.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import http from 'node:http';
import LLMAdapter from '../../src/sdk/LLMAdapter.js';
const { LLM_ERROR_REASONS } = LLMAdapter;

/**
 * Create a controllable HTTP server. The `handler` receives (req, res) and
 * can delay/abort responses to simulate stalls.
 */
function makeServer(handler) {
  return new Promise((resolve) => {
    const server = http.createServer(handler);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      resolve({ server, baseUrl: `http://127.0.0.1:${port}` });
    });
  });
}

function closeServer(server) {
  return new Promise((resolve) => server.close(() => resolve()));
}

describe('LLM Request Lifecycle (RFC W3 / Patch D1)', () => {
  let server, baseUrl, originalFetch;

  beforeEach(() => { originalFetch = global.fetch; });
  afterEach(async () => {
    global.fetch = originalFetch;
    if (server) await closeServer(server);
  });

  it('non-stream: normal JSON body returns content', async () => {
    ({ server, baseUrl } = await makeServer((req, res) => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ choices: [{ message: { content: 'hello world' } }] }));
    }));

    const adapter = new LLMAdapter({
      provider: 'openai', apiKey: 'test', baseUrl,
      headersTimeoutMs: 5000, overallTimeoutMs: 5000,
    });
    const result = await adapter.chat([{ role: 'user', content: 'hi' }]);
    expect(result).toBe('hello world');
  });

  it('non-stream: body stall after headers → body_timeout error code', async () => {
    ({ server, baseUrl } = await makeServer((req, res) => {
      // Send headers immediately, then never send body.
      res.writeHead(200, { 'Content-Type': 'application/json' });
      // Intentionally do not res.end()
    }));

    const adapter = new LLMAdapter({
      provider: 'openai', apiKey: 'test', baseUrl,
      headersTimeoutMs: 5000, overallTimeoutMs: 200,
    });
    await expect(adapter.chat([{ role: 'user', content: 'hi' }]))
      .rejects.toMatchObject({ code: LLM_ERROR_REASONS.BODY_TIMEOUT });
  });

  it('stream: normal SSE with tokens and cleans up', async () => {
    ({ server, baseUrl } = await makeServer((req, res) => {
      res.writeHead(200, { 'Content-Type': 'text/event-stream' });
      res.write('data: {"choices":[{"delta":{"content":"Hello"}}]}\n\n');
      res.write('data: [DONE]\n\n');
      res.end();
    }));

    const adapter = new LLMAdapter({
      provider: 'openai', apiKey: 'test', baseUrl,
      headersTimeoutMs: 5000, overallTimeoutMs: 5000, streamIdleTimeoutMs: 5000,
    });
    const tokens = [];
    for await (const token of adapter.chatStream([{ role: 'user', content: 'hi' }])) {
      tokens.push(token);
    }
    expect(tokens).toEqual(['Hello']);
  });

  it('stream: idle stall (one token then hang) → stream_idle_timeout', async () => {
    ({ server, baseUrl } = await makeServer((req, res) => {
      res.writeHead(200, { 'Content-Type': 'text/event-stream' });
      res.write('data: {"choices":[{"delta":{"content":"one"}}]}\n\n');
      // Never send more; never end. Idle timer should fire.
    }));

    const adapter = new LLMAdapter({
      provider: 'openai', apiKey: 'test', baseUrl,
      headersTimeoutMs: 5000, overallTimeoutMs: 5000, streamIdleTimeoutMs: 100,
    });
    let threw = false;
    try {
      for await (const token of adapter.chatStream([{ role: 'user', content: 'hi' }])) {
        // yielded "one"
      }
    } catch (e) {
      threw = true;
      expect(e.code).toBe(LLM_ERROR_REASONS.STREAM_IDLE_TIMEOUT);
    }
    expect(threw).toBe(true);
  });

  it('stream: consumer early break → no open handle (cleanup runs)', async () => {
    ({ server, baseUrl } = await makeServer((req, res) => {
      res.writeHead(200, { 'Content-Type': 'text/event-stream' });
      // Send tokens slowly; consumer will break after first.
      let i = 0;
      const interval = setInterval(() => {
        if (i >= 10) { clearInterval(interval); res.end(); return; }
        res.write(`data: {"choices":[{"delta":{"content":"t${i}"}}]}\n\n`);
        i++;
      }, 50);
      req.on('close', () => clearInterval(interval));
    }));

    const adapter = new LLMAdapter({
      provider: 'openai', apiKey: 'test', baseUrl,
      headersTimeoutMs: 5000, overallTimeoutMs: 5000, streamIdleTimeoutMs: 5000,
    });
    const tokens = [];
    for await (const token of adapter.chatStream([{ role: 'user', content: 'hi' }])) {
      tokens.push(token);
      break; // early exit
    }
    expect(tokens.length).toBe(1);
    // If cleanup didn't run, the server connection stays open and closeServer
    // hangs. The afterEach closeServer completing proves cleanup ran.
  });

  it('stream: provider HTTP error → provider_http_error code', async () => {
    ({ server, baseUrl } = await makeServer((req, res) => {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'internal' }));
    }));

    const adapter = new LLMAdapter({
      provider: 'openai', apiKey: 'test', baseUrl,
      headersTimeoutMs: 5000, overallTimeoutMs: 5000,
      maxRetries: 0,
    });
    // chatStream will attempt, get 500, throw provider_http_error (no retry after 0).
    let threw = false;
    try {
      for await (const token of adapter.chatStream([{ role: 'user', content: 'hi' }])) {
        // should not yield
      }
    } catch (e) {
      threw = true;
      // 500 is caught before stream starts → provider_http_error
      expect(e.code).toBe(LLM_ERROR_REASONS.PROVIDER_HTTP_ERROR);
    }
    expect(threw).toBe(true);
  });

  it('Anthropic path: normal SSE stream yields tokens', async () => {
    ({ server, baseUrl } = await makeServer((req, res) => {
      res.writeHead(200, { 'Content-Type': 'text/event-stream' });
      res.write('data: {"type":"content_block_delta","delta":{"text":"Hi"}}\n\n');
      res.write('data: {"type":"content_block_delta","delta":{"text":" there"}}\n\n');
      res.end();
    }));

    const adapter = new LLMAdapter({
      provider: 'anthropic', apiKey: 'test', baseUrl,
      headersTimeoutMs: 5000, overallTimeoutMs: 5000, streamIdleTimeoutMs: 5000,
    });
    const tokens = [];
    for await (const token of adapter.chatStream([
      { role: 'user', content: 'hi' },
    ])) {
      tokens.push(token);
    }
    expect(tokens).toEqual(['Hi', ' there']);
  });
});
