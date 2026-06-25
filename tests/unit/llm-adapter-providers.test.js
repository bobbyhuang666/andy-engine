/**
 * LLMAdapter provider coverage — Wave 5 hardening
 *
 * 此前 LLMAdapter ~40% 覆盖:仅 custom-fn 路径被测。
 * 本文件补 OpenAI / Anthropic / Ollama provider 路径 + streaming + 默认值,
 * 全部通过 stubGlobal('fetch') + fake reader 实现 hermetic(无真实网络)。
 *
 * 覆盖目标:
 *   - _callOpenAI (chat 非流式): 成功 / !ok 错误格式(含 ollama hint) / choices 空回 ''
 *   - _callAnthropic: system 消息分离 / x-api-key header / content[0].text 回 ''
 *   - _streamOpenAI: delta.content yield / [DONE] 终止
 *   - _streamAnthropic: content_block_delta.text yield
 *   - _defaultModel / _defaultBaseUrl: 各 provider 默认值
 *   - _ensureApiKey: ollama 跳过 apiKey
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import LLMAdapter from '../../src/sdk/LLMAdapter.js';

// 构造 fake fetch Response(非流式)
function fakeJsonResponse(payload, { ok = true, status = 200, text = '' } = {}) {
  return {
    ok,
    status,
    json: async () => payload,
    text: async () => text,
  };
}

// 构造 fake fetch Response(流式),reader 按 chunks 依次返回
function fakeStreamResponse(chunks) {
  const remaining = [...chunks];
  return {
    ok: true,
    status: 200,
    body: {
      getReader: () => ({
        read: async () => {
          if (remaining.length === 0) return { done: true, value: undefined };
          const value = remaining.shift();
          return { done: false, value: typeof value === 'string' ? new TextEncoder().encode(value) : value };
        },
      }),
    },
  };
}

describe('LLMAdapter — OpenAI provider (chat non-stream)', () => {
  let originalFetch;
  let fetchMock;
  beforeEach(() => {
    originalFetch = global.fetch;
    fetchMock = vi.fn();
    global.fetch = fetchMock;
  });
  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('chat() routes openai through _callOpenAI and returns choices[0].message.content', async () => {
    fetchMock.mockResolvedValue(fakeJsonResponse({ choices: [{ message: { content: 'hi' } }] }));
    const adapter = new LLMAdapter({ provider: 'openai', apiKey: 'k' });
    const result = await adapter.chat([{ role: 'user', content: 'x' }]);
    expect(result).toBe('hi');
    const [url, opts] = fetchMock.mock.calls[0];
    expect(url).toMatch(/\/chat\/completions$/);
    const body = JSON.parse(opts.body);
    expect(body.model).toBe('gpt-4o');
    expect(opts.headers.Authorization).toBe('Bearer k');
  });

  it('_callOpenAI returns "" when choices[0].message.content missing', async () => {
    fetchMock.mockResolvedValue(fakeJsonResponse({ choices: [] }));
    const adapter = new LLMAdapter({ provider: 'openai', apiKey: 'k', maxRetries: 0 });
    const result = await adapter.chat([{ role: 'user', content: 'x' }]);
    expect(result).toBe('');
  });

  it('chat() _callOpenAI throws formatted error with ollama hint on !response.ok', async () => {
    fetchMock.mockResolvedValue(fakeJsonResponse({}, { ok: false, status: 500, text: 'boom' }));
    const adapter = new LLMAdapter({ provider: 'ollama', maxRetries: 0 });
    await expect(adapter.chat([{ role: 'user', content: 'x' }])).rejects.toThrow(/ollama API error 500: boom.*ollama serve/s);
  });

  it('chat() openai !response.ok error has no ollama hint', async () => {
    fetchMock.mockResolvedValue(fakeJsonResponse({}, { ok: false, status: 429, text: 'rate limited' }));
    const adapter = new LLMAdapter({ provider: 'openai', apiKey: 'k', maxRetries: 0 });
    await expect(adapter.chat([{ role: 'user', content: 'x' }])).rejects.toThrow(/openai API error 429: rate limited$/);
  });

  it('chat() retries on failure then succeeds (maxRetries=1)', async () => {
    fetchMock
      .mockResolvedValueOnce(fakeJsonResponse({}, { ok: false, status: 500, text: 'err' }))
      .mockResolvedValueOnce(fakeJsonResponse({ choices: [{ message: { content: 'ok' } }] }));
    const adapter = new LLMAdapter({ provider: 'openai', apiKey: 'k', maxRetries: 1 });
    vi.useFakeTimers();
    const p = adapter.chat([{ role: 'user', content: 'x' }]);
    await vi.runAllTimersAsync();
    const result = await p;
    expect(result).toBe('ok');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });
});

describe('LLMAdapter — Anthropic provider (chat non-stream)', () => {
  let originalFetch;
  let fetchMock;
  beforeEach(() => {
    originalFetch = global.fetch;
    fetchMock = vi.fn();
    global.fetch = fetchMock;
  });
  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('chat() anthropic separates system message into body.system and uses x-api-key header', async () => {
    fetchMock.mockResolvedValue(fakeJsonResponse({ content: [{ text: 'ok' }] }));
    const adapter = new LLMAdapter({ provider: 'anthropic', apiKey: 'a' });
    const result = await adapter.chat([
      { role: 'system', content: 'sys' },
      { role: 'user', content: 'hi' },
    ]);
    expect(result).toBe('ok');
    const [, opts] = fetchMock.mock.calls[0];
    const body = JSON.parse(opts.body);
    expect(body.system).toBe('sys');
    expect(body.messages).toEqual([{ role: 'user', content: 'hi' }]);
    expect(opts.headers['x-api-key']).toBe('a');
    expect(opts.headers['anthropic-version']).toBe('2023-06-01');
  });

  it('_callAnthropic returns "" when content[0].text missing', async () => {
    fetchMock.mockResolvedValue(fakeJsonResponse({ content: [] }));
    const adapter = new LLMAdapter({ provider: 'anthropic', apiKey: 'a', maxRetries: 0 });
    const result = await adapter.chat([{ role: 'user', content: 'x' }]);
    expect(result).toBe('');
  });

  it('chat() anthropic !response.ok throws formatted error', async () => {
    fetchMock.mockResolvedValue(fakeJsonResponse({}, { ok: false, status: 401, text: 'unauthorized' }));
    const adapter = new LLMAdapter({ provider: 'anthropic', apiKey: 'a', maxRetries: 0 });
    await expect(adapter.chat([{ role: 'user', content: 'x' }])).rejects.toThrow(/Anthropic API error 401: unauthorized/);
  });
});

describe('LLMAdapter — streaming (chatStream)', () => {
  let originalFetch;
  beforeEach(() => {
    originalFetch = global.fetch;
  });
  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('chatStream() openai yields delta tokens and stops on [DONE]', async () => {
    global.fetch = vi.fn().mockResolvedValue(fakeStreamResponse([
      'data: {"choices":[{"delta":{"content":"He"}}]}\n',
      'data: {"choices":[{"delta":{"content":"llo"}}]}\n',
      'data: [DONE]\n',
    ]));
    const adapter = new LLMAdapter({ provider: 'openai', apiKey: 'k' });
    const tokens = [];
    for await (const t of adapter.chatStream([{ role: 'user', content: 'x' }])) tokens.push(t);
    expect(tokens.join('')).toBe('Hello');
  });

  it('chatStream() anthropic yields content_block_delta.text', async () => {
    global.fetch = vi.fn().mockResolvedValue(fakeStreamResponse([
      'data: {"type":"content_block_delta","delta":{"text":"hi"}}\n',
      'data: {"type":"message_stop"}\n',
    ]));
    const adapter = new LLMAdapter({ provider: 'anthropic', apiKey: 'a' });
    const tokens = [];
    for await (const t of adapter.chatStream([{ role: 'user', content: 'x' }])) tokens.push(t);
    expect(tokens).toEqual(['hi']);
  });

  it('chatStream() empty messages throws', async () => {
    const adapter = new LLMAdapter({ provider: 'openai', apiKey: 'k' });
    await expect(async () => {
      for await (const _ of adapter.chatStream([])) { /* consume */ }
    }).rejects.toThrow(/messages 必须是非空数组/);
  });
});

describe('LLMAdapter — defaults & apikey guard', () => {
  it('_defaultModel returns correct model per provider', () => {
    expect(LLMAdapter._defaultModel('openai')).toBe('gpt-4o');
    expect(LLMAdapter._defaultModel('openai-compatible')).toBe('gpt-4o');
    expect(LLMAdapter._defaultModel('anthropic')).toBe('claude-sonnet-4-20250514');
    expect(LLMAdapter._defaultModel('ollama')).toBe('qwen2.5:7b');
    expect(LLMAdapter._defaultModel('unknown')).toBe('gpt-4o');
  });

  it('_defaultBaseUrl returns correct base url per provider', () => {
    expect(LLMAdapter._defaultBaseUrl('openai')).toBe('https://api.openai.com/v1');
    expect(LLMAdapter._defaultBaseUrl('anthropic')).toBe('https://api.anthropic.com/v1');
    expect(LLMAdapter._defaultBaseUrl('ollama')).toBe('http://localhost:11434/v1');
    expect(LLMAdapter._defaultBaseUrl('unknown')).toBe('');
  });

  it('_ensureApiKey skips for ollama (chat without apiKey works)', async () => {
    const fetchMock = vi.fn().mockResolvedValue(fakeJsonResponse({ choices: [{ message: { content: 'ok' } }] }));
    const originalFetch = global.fetch;
    global.fetch = fetchMock;
    try {
      const adapter = new LLMAdapter({ provider: 'ollama' });
      expect(adapter.apiKey).toBe('ollama');
      const result = await adapter.chat([{ role: 'user', content: 'x' }]);
      expect(result).toBe('ok');
    } finally {
      global.fetch = originalFetch;
    }
  });
});
