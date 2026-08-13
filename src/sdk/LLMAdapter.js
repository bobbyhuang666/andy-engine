/**
 * LLMAdapter — LLM 调用适配器
 *
 * 支持：
 *   - 自定义函数：async (messages) => string
 *   - OpenAI API / OpenAI 兼容
 *   - Anthropic API
 *   - Ollama（本地，零成本）
 *   - 流式输出（chatStream）
 *   - 自动重试（线性退避）
 *
 * RFC W3 / Patch D1: 请求生命周期由三层有界超时 + 单一 AbortController +
 * try/finally 资源清理管理。此前 30s 超时只覆盖响应头,body/stream 可无限等待,
 * 生成器退出时不释放 reader。
 */

const SUPPORTED_PROVIDERS = ['openai', 'openai-compatible', 'anthropic', 'ollama', 'custom'];

/**
 * RFC W3 / Patch D1: stable machine-readable error reason codes via `err.code`.
 * Note: timeout `message` text now names the failing stage
 * ("timed out (headers)" / "timed out (body)" / "stream idle timeout")
 * instead of the old blanket "timed out after 30s"; consumers should match
 * on `err.code` and on `err.name === 'AbortError'`-free control flow, not on
 * the exact message string.
 */
const LLM_ERROR_REASONS = {
  HEADERS_TIMEOUT: 'headers_timeout',
  BODY_TIMEOUT: 'body_timeout',
  STREAM_IDLE_TIMEOUT: 'stream_idle_timeout',
  CONSUMER_CANCELLED: 'consumer_cancelled',
  PROVIDER_HTTP_ERROR: 'provider_http_error',
  PARSE_ERROR: 'parse_error',
};

/**
 * Create an LLM error carrying a stable `code` (see LLM_ERROR_REASONS).
 * Non-timeout messages keep their previous wording; timeout messages now
 * name the failing stage (headers/body/idle) rather than "after 30s".
 * @private
 */
function llmError(message, code) {
  const err = new Error(message);
  err.code = code;
  return err;
}

/**
 * Request context: manages three-tier timeouts + single AbortController.
 *
 *   headersTimeoutMs   — connect → response headers
 *   overallTimeoutMs   — full request upper bound (includes body)
 *   streamIdleTimeoutMs — max idle between adjacent stream chunks
 *
 * @private
 */
class RequestContext {
  constructor({ headersTimeoutMs, overallTimeoutMs, streamIdleTimeoutMs }) {
    this.controller = new AbortController();
    this.headersTimeoutMs = headersTimeoutMs;
    this.overallTimeoutMs = overallTimeoutMs;
    this.streamIdleTimeoutMs = streamIdleTimeoutMs;
    this._headersTimer = null;
    this._overallTimer = null;
    this._idleTimer = null;
    this._settled = false;
  }

  /** Start the headers + overall timers. */
  start() {
    if (this.headersTimeoutMs > 0) {
      this._headersTimer = setTimeout(() => {
        this.controller.abort();
        this._abortReason = LLM_ERROR_REASONS.HEADERS_TIMEOUT;
      }, this.headersTimeoutMs);
    }
    if (this.overallTimeoutMs > 0) {
      this._overallTimer = setTimeout(() => {
        this.controller.abort();
        this._abortReason = LLM_ERROR_REASONS.BODY_TIMEOUT;
      }, this.overallTimeoutMs);
    }
  }

  /** Clear the headers timer once headers are received. */
  clearHeaders() {
    if (this._headersTimer) {
      clearTimeout(this._headersTimer);
      this._headersTimer = null;
    }
  }

  /** Reset the stream idle timer (call before each reader.read()). */
  resetIdle() {
    if (this._idleTimer) clearTimeout(this._idleTimer);
    if (this.streamIdleTimeoutMs > 0) {
      this._idleTimer = setTimeout(() => {
        this.controller.abort();
        this._abortReason = LLM_ERROR_REASONS.STREAM_IDLE_TIMEOUT;
      }, this.streamIdleTimeoutMs);
    }
  }

  /** Clear the idle timer (after read completes or on cleanup). */
  clearIdle() {
    if (this._idleTimer) {
      clearTimeout(this._idleTimer);
      this._idleTimer = null;
    }
  }

  /** Idempotent cleanup: abort + clear all timers. */
  cleanup() {
    if (this._settled) return;
    this._settled = true;
    try { this.controller.abort(); } catch (_) {}
    this.clearHeaders();
    this.clearIdle();
    if (this._overallTimer) {
      clearTimeout(this._overallTimer);
      this._overallTimer = null;
    }
  }

  /** The reason code for the last abort (for error classification). */
  get abortReason() {
    return this._abortReason || null;
  }
}

class LLMAdapter {
  constructor(config = {}) {
    if (typeof config === 'function') {
      this._customFn = config;
      this.provider = 'custom';
      this.maxRetries = 2;
    } else {
      this.provider = config.provider || 'openai';

      if (!SUPPORTED_PROVIDERS.includes(this.provider)) {
        throw new Error(
          `LLMAdapter: 不支持的 provider "${this.provider}"。可选: ${SUPPORTED_PROVIDERS.join(', ')}`
        );
      }

      // Ollama 默认走本地，不需要 apiKey
      if (this.provider === 'ollama') {
        this.apiKey = config.apiKey ?? 'ollama';
        this.baseUrl = config.baseUrl || 'http://localhost:11434/v1';
      } else {
        // 用 ?? 而非 ||：apiKey: '' 应该保留空字符串（用户显式清空），不应回退到环境变量
        this.apiKey = config.apiKey ?? LLMAdapter._defaultApiKey(this.provider);
      }

      this.model = config.model || LLMAdapter._defaultModel(this.provider);
      if (this.provider !== 'ollama') {
        this.baseUrl = config.baseUrl || LLMAdapter._defaultBaseUrl(this.provider);
      }
      this.maxTokens = config.maxTokens || 1024;
      this.temperature = config.temperature ?? 0.8;
      this.maxRetries = config.maxRetries ?? 2;
      this._customFn = config.llm || null;

      // RFC W3 / Patch D1: three-tier timeout config (conservative defaults).
      // headers: 30s (connect → headers), overall: 120s (full body), idle: 30s.
      this.headersTimeoutMs = config.headersTimeoutMs ?? 30000;
      this.overallTimeoutMs = config.overallTimeoutMs ?? 120000;
      this.streamIdleTimeoutMs = config.streamIdleTimeoutMs ?? 30000;

      // apiKey 检查延迟到 chat()/chatStream() 时（构造时可能只是用于 tick，不需要 LLM）
    }
  }

  /**
   * 完整调用（非流式）
   * @param {Object[]} messages
   * @returns {Promise<string>}
   */
  async chat(messages) {
    if (!Array.isArray(messages) || messages.length === 0) {
      throw new Error('LLMAdapter.chat(): messages 必须是非空数组');
    }
    this._ensureApiKey();

    let lastError = null;
    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        if (this._customFn) return await this._customFn(messages);
        switch (this.provider) {
          case 'openai':
          case 'openai-compatible':
          case 'ollama':
            return await this._callOpenAI(messages, false);
          case 'anthropic':
            return await this._callAnthropic(messages, false);
          default:
            throw new Error(`Unsupported provider: ${this.provider}`);
        }
      } catch (e) {
        lastError = e;
        if (attempt < this.maxRetries) await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
      }
    }
    throw lastError;
  }

  /**
   * 流式调用（返回 async generator，逐 token 产出）
   *
   * @param {Object[]} messages
   * @returns {AsyncGenerator<string>} 逐 token 产出
   *
   * @example
   *   for await (const token of adapter.chatStream(messages)) {
   *     process.stdout.write(token);
   *   }
   */
  async *chatStream(messages) {
    if (!Array.isArray(messages) || messages.length === 0) {
      throw new Error('LLMAdapter.chatStream(): messages 必须是非空数组');
    }
    this._ensureApiKey();

    if (this._customFn) {
      // 自定义函数不支持流式，回退到完整调用（含重试）
      let lastError = null;
      for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
        try {
          const result = await this._customFn(messages);
          yield result;
          return;
        } catch (e) {
          lastError = e;
          if (attempt < this.maxRetries) await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
        }
      }
      throw lastError;
    }

    let anyTokenYielded = false;
    let lastError = null;
    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        const stream = this.provider === 'anthropic'
          ? this._streamAnthropic(messages)
          : this._streamOpenAI(messages);
        for await (const token of stream) {
          anyTokenYielded = true;
          yield token;
        }
        // P1 fix: 零 token 流 (所有 SSE parse fail 或空 body) 不能静默成功。
        // 抛有意义错误以触发 retry；已 yield token 时不会走到此处 (提前 return)。
        if (!anyTokenYielded) {
          throw new Error('LLMAdapter.chatStream(): stream completed with zero tokens');
        }
        return;
      } catch (e) {
        lastError = e;
        if (anyTokenYielded) throw e;
        if (attempt < this.maxRetries) await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
      }
    }
    // P1 fix: lastError 为 null (无异常但零 token) 时抛出有意义错误，不 throw null。
    throw lastError || new Error('LLMAdapter.chatStream(): all attempts failed to produce tokens');
  }

  // ═══════════════════════════════════════════
  // OpenAI（Ollama 也走这条路）
  // ═══════════════════════════════════════════

  async _callOpenAI(messages, stream = false) {
    const url = `${this.baseUrl}/chat/completions`;
    // RFC W3 / Patch D1: single RequestContext spans headers + body + stream.
    const ctx = new RequestContext(this);
    ctx.start();
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: this.model,
          messages,
          max_tokens: this.maxTokens,
          temperature: this.temperature,
          stream,
        }),
        signal: ctx.controller.signal,
      });
      // Headers received — clear the headers timer. overall timer still guards body.
      ctx.clearHeaders();

      if (!response.ok) {
        const err = await response.text().catch(() => '');
        const providerHint = this.provider === 'ollama'
          ? '\n提示：确保 Ollama 正在运行（ollama serve）且模型已拉取（ollama pull ' + this.model + '）'
          : '';
        throw llmError(`${this.provider} API error ${response.status}: ${err}${providerHint}`, LLM_ERROR_REASONS.PROVIDER_HTTP_ERROR);
      }

      if (stream) {
        // Stream path: hand the context to the generator for idle/cleanup.
        return { response, ctx };
      }

      const data = await response.json();
      return data.choices?.[0]?.message?.content || '';
    } catch (err) {
      if (err.name === 'AbortError') {
        const reason = ctx.abortReason || LLM_ERROR_REASONS.HEADERS_TIMEOUT;
        const label = reason === LLM_ERROR_REASONS.BODY_TIMEOUT ? 'body' : 'headers';
        throw llmError(`LLM request timed out (${label})`, reason);
      }
      throw err;
    } finally {
      // For non-stream: cleanup now. For stream: the generator owns cleanup.
      if (!stream) ctx.cleanup();
    }
  }

  async *_streamOpenAI(messages) {
    // RFC W3 / Patch D1: _callOpenAI returns {response, ctx} in stream mode.
    const { response, ctx } = await this._callOpenAI(messages, true);
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    try {
      ctx.resetIdle();
      while (true) {
        const { done, value } = await reader.read();
        ctx.resetIdle();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = LLMAdapter._drainSseLines(buffer);
        buffer = lines.remainder;

        for (const line of lines.complete) {
          const content = LLMAdapter._parseOpenAIStreamLine(line);
          if (content === LLMAdapter.STREAM_DONE) return;
          if (content) yield content;
        }
      }

      if (buffer.trim()) {
        const content = LLMAdapter._parseOpenAIStreamLine(buffer);
        if (content !== LLMAdapter.STREAM_DONE && content) yield content;
      }
    } catch (err) {
      if (err.name === 'AbortError') {
        const reason = ctx.abortReason || LLM_ERROR_REASONS.STREAM_IDLE_TIMEOUT;
        throw llmError(`LLM stream idle timeout`, reason);
      }
      throw err;
    } finally {
      // Idempotent cleanup: abort + cancel reader + release lock + clear timers.
      ctx.cleanup();
      if (typeof reader.cancel === 'function') await reader.cancel().catch(() => {});
      if (typeof reader.releaseLock === 'function') { try { reader.releaseLock(); } catch (_) {} }
    }
  }

  // ═══════════════════════════════════════════
  // Anthropic
  // ═══════════════════════════════════════════

  async _callAnthropic(messages, stream = false) {
    const url = `${this.baseUrl}/messages`;
    const systemMsg = messages.find(m => m.role === 'system');
    const chatMessages = messages.filter(m => m.role !== 'system');

    const body = {
      model: this.model,
      max_tokens: this.maxTokens,
      temperature: this.temperature,
      messages: chatMessages,
      stream,
    };
    if (systemMsg) body.system = systemMsg.content;

    // RFC W3 / Patch D1: single RequestContext spans headers + body + stream.
    const ctx = new RequestContext(this);
    ctx.start();
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': this.apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify(body),
        signal: ctx.controller.signal,
      });
      ctx.clearHeaders();

      if (!response.ok) {
        const err = await response.text().catch(() => '');
        throw llmError(`Anthropic API error ${response.status}: ${err}`, LLM_ERROR_REASONS.PROVIDER_HTTP_ERROR);
      }

      if (stream) {
        return { response, ctx };
      }

      const data = await response.json();
      return data.content?.[0]?.text || '';
    } catch (err) {
      if (err.name === 'AbortError') {
        const reason = ctx.abortReason || LLM_ERROR_REASONS.HEADERS_TIMEOUT;
        const label = reason === LLM_ERROR_REASONS.BODY_TIMEOUT ? 'body' : 'headers';
        throw llmError(`LLM request timed out (${label})`, reason);
      }
      throw err;
    } finally {
      if (!stream) ctx.cleanup();
    }
  }

  async *_streamAnthropic(messages) {
    // RFC W3 / Patch D1: _callAnthropic returns {response, ctx} in stream mode.
    const { response, ctx } = await this._callAnthropic(messages, true);
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    try {
      ctx.resetIdle();
      while (true) {
        const { done, value } = await reader.read();
        ctx.resetIdle();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = LLMAdapter._drainSseLines(buffer);
        buffer = lines.remainder;

        for (const line of lines.complete) {
          const content = LLMAdapter._parseAnthropicStreamLine(line);
          if (content) yield content;
        }
      }

      if (buffer.trim()) {
        const content = LLMAdapter._parseAnthropicStreamLine(buffer);
        if (content) yield content;
      }
    } catch (err) {
      if (err.name === 'AbortError') {
        const reason = ctx.abortReason || LLM_ERROR_REASONS.STREAM_IDLE_TIMEOUT;
        throw llmError(`LLM stream idle timeout`, reason);
      }
      throw err;
    } finally {
      ctx.cleanup();
      if (typeof reader.cancel === 'function') await reader.cancel().catch(() => {});
      if (typeof reader.releaseLock === 'function') { try { reader.releaseLock(); } catch (_) {} }
    }
  }

  // ═══════════════════════════════════════════
  // 内部校验
  // ═══════════════════════════════════════════

  /** @private */
  _ensureApiKey() {
    if (!this._customFn && this.provider !== 'ollama' && !this.apiKey) {
      throw new Error(
        `LLMAdapter: provider "${this.provider}" 需要 apiKey。` +
        `传入 config.apiKey 或设置环境变量 OPENAI_API_KEY / ANTHROPIC_API_KEY。` +
        `如果想本地运行，用 { provider: "ollama" }。`
      );
    }
  }

  // ═══════════════════════════════════════════
  // 默认值
  // ═══════════════════════════════════════════

  static _defaultModel(provider) {
    return {
      'openai': 'gpt-4o',
      'openai-compatible': 'gpt-4o',
      'anthropic': 'claude-sonnet-4-20250514',
      'ollama': 'qwen2.5:7b',
    }[provider] || 'gpt-4o';
  }

  static _defaultBaseUrl(provider) {
    return {
      'openai': 'https://api.openai.com/v1',
      'openai-compatible': 'https://api.openai.com/v1',
      'anthropic': 'https://api.anthropic.com/v1',
      'ollama': 'http://localhost:11434/v1',
    }[provider] || '';
  }

  static _defaultApiKey(provider) {
    if (provider === 'anthropic') {
      return process.env.ANTHROPIC_API_KEY ?? '';
    }
    return process.env.OPENAI_API_KEY ?? '';
  }

  static _drainSseLines(buffer) {
    const lines = buffer.split('\n');
    return {
      complete: lines.slice(0, -1),
      remainder: lines.at(-1) || '',
    };
  }

  static _parseOpenAIStreamLine(line) {
    if (!line.startsWith('data: ')) return '';
    const data = line.slice(6).trim();
    if (data === '[DONE]') return LLMAdapter.STREAM_DONE;

    try {
      const parsed = JSON.parse(data);
      return parsed.choices?.[0]?.delta?.content || '';
    } catch (e) {
      LLMAdapter._debugStreamParse('OpenAI', e);
      return '';
    }
  }

  static _parseAnthropicStreamLine(line) {
    if (!line.startsWith('data: ')) return '';

    try {
      const parsed = JSON.parse(line.slice(6));
      return parsed.type === 'content_block_delta' ? parsed.delta?.text || '' : '';
    } catch (e) {
      LLMAdapter._debugStreamParse('Anthropic', e);
      return '';
    }
  }

  static _debugStreamParse(provider, error) {
    if (typeof process !== 'undefined' && process.env?.DEBUG_LLM_STREAM) {
      process.stderr.write(`[LLMAdapter/${provider} stream parse] ${error.message}\n`);
    }
  }
}

LLMAdapter.STREAM_DONE = Symbol('STREAM_DONE');
LLMAdapter.LLM_ERROR_REASONS = LLM_ERROR_REASONS;

module.exports = LLMAdapter;
