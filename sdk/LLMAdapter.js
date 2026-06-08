/**
 * LLMAdapter — LLM 调用适配器
 *
 * 支持：
 *   - 自定义函数：async (messages) => string
 *   - OpenAI API / OpenAI 兼容
 *   - Anthropic API
 *   - Ollama（本地，零成本）
 *   - 流式输出（chatStream）
 *   - 自动重试（指数退避）
 */

const SUPPORTED_PROVIDERS = ['openai', 'openai-compatible', 'anthropic', 'ollama', 'custom'];

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
        this.apiKey = config.apiKey ?? process.env.OPENAI_API_KEY ?? process.env.ANTHROPIC_API_KEY ?? '';
      }

      this.model = config.model || LLMAdapter._defaultModel(this.provider);
      if (this.provider !== 'ollama') {
        this.baseUrl = config.baseUrl || LLMAdapter._defaultBaseUrl(this.provider);
      }
      this.maxTokens = config.maxTokens || 1024;
      this.temperature = config.temperature ?? 0.8;
      this.maxRetries = config.maxRetries ?? 2;
      this._customFn = config.llm || null;

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

    switch (this.provider) {
      case 'openai':
      case 'openai-compatible':
      case 'ollama':
        yield* this._streamOpenAI(messages);
        break;
      case 'anthropic':
        yield* this._streamAnthropic(messages);
        break;
      default:
        throw new Error(`Streaming not supported for provider: ${this.provider}`);
    }
  }

  // ═══════════════════════════════════════════
  // OpenAI（Ollama 也走这条路）
  // ═══════════════════════════════════════════

  async _callOpenAI(messages, stream = false) {
    const url = `${this.baseUrl}/chat/completions`;
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
    });

    if (!response.ok) {
      const err = await response.text().catch(() => '');
      const providerHint = this.provider === 'ollama'
        ? '\n提示：确保 Ollama 正在运行（ollama serve）且模型已拉取（ollama pull ' + this.model + '）'
        : '';
      throw new Error(`${this.provider} API error ${response.status}: ${err}${providerHint}`);
    }

    if (stream) return response;

    const data = await response.json();
    return data.choices?.[0]?.message?.content || '';
  }

  async *_streamOpenAI(messages) {
    const response = await this._callOpenAI(messages, true);
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const data = line.slice(6).trim();
        if (data === '[DONE]') return;

        try {
          const parsed = JSON.parse(data);
          const content = parsed.choices?.[0]?.delta?.content;
          if (content) yield content;
        } catch {}
      }
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

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const err = await response.text().catch(() => '');
      throw new Error(`Anthropic API error ${response.status}: ${err}`);
    }

    if (stream) return response;

    const data = await response.json();
    return data.content?.[0]?.text || '';
  }

  async *_streamAnthropic(messages) {
    const response = await this._callAnthropic(messages, true);
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        try {
          const parsed = JSON.parse(line.slice(6));
          if (parsed.type === 'content_block_delta' && parsed.delta?.text) {
            yield parsed.delta.text;
          }
        } catch {}
      }
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
}

module.exports = LLMAdapter;
