/**
 * LLMAdapter — LLM 调用适配器
 *
 * 支持三种模式：
 *   1. 自定义函数：async (messages) => string
 *   2. OpenAI API：{ provider: 'openai', apiKey, model }
 *   3. Anthropic API：{ provider: 'anthropic', apiKey, model }
 *   4. OpenAI 兼容：{ provider: 'openai-compatible', baseUrl, apiKey, model }
 *
 * 不依赖任何第三方 SDK，用原生 fetch() 调用。
 * 内置重试逻辑（指数退避）。
 */

class LLMAdapter {
  /**
   * @param {Object|Function} config
   */
  constructor(config = {}) {
    if (typeof config === 'function') {
      this._customFn = config;
      this.provider = 'custom';
      this.maxRetries = 2;
    } else {
      this.provider = config.provider || 'openai';
      this.apiKey = config.apiKey || process.env.OPENAI_API_KEY || process.env.ANTHROPIC_API_KEY || '';
      this.model = config.model || LLMAdapter._defaultModel(this.provider);
      this.baseUrl = config.baseUrl || LLMAdapter._defaultBaseUrl(this.provider);
      this.maxTokens = config.maxTokens || 1024;
      this.temperature = config.temperature ?? 0.8;
      this.maxRetries = config.maxRetries ?? 2;
      this._customFn = config.llm || null;
    }
  }

  /**
   * 调用 LLM（内置重试）
   *
   * @param {Object[]} messages - [{ role: 'system'|'user'|'assistant', content: '...' }]
   * @returns {Promise<string>} LLM 回复文本
   */
  async chat(messages) {
    let lastError = null;
    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        if (this._customFn) {
          return await this._customFn(messages);
        }
        switch (this.provider) {
          case 'openai':
          case 'openai-compatible':
            return await this._callOpenAI(messages);
          case 'anthropic':
            return await this._callAnthropic(messages);
          default:
            throw new Error(`Unsupported LLM provider: ${this.provider}`);
        }
      } catch (e) {
        lastError = e;
        if (attempt < this.maxRetries) {
          await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
        }
      }
    }
    throw lastError;
  }

  /**
   * OpenAI / OpenAI-compatible API 调用
   * @private
   */
  async _callOpenAI(messages) {
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
      }),
    });

    if (!response.ok) {
      const err = await response.text().catch(() => '');
      throw new Error(`OpenAI API error ${response.status}: ${err}`);
    }

    const data = await response.json();
    return data.choices?.[0]?.message?.content || '';
  }

  /**
   * Anthropic API 调用
   * @private
   */
  async _callAnthropic(messages) {
    const url = `${this.baseUrl}/messages`;
    const systemMsg = messages.find(m => m.role === 'system');
    const chatMessages = messages.filter(m => m.role !== 'system');

    const body = {
      model: this.model,
      max_tokens: this.maxTokens,
      temperature: this.temperature,
      messages: chatMessages,
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

    const data = await response.json();
    return data.content?.[0]?.text || '';
  }

  static _defaultModel(provider) {
    return { 'openai': 'gpt-4o', 'openai-compatible': 'gpt-4o', 'anthropic': 'claude-sonnet-4-20250514' }[provider] || 'gpt-4o';
  }

  static _defaultBaseUrl(provider) {
    return { 'openai': 'https://api.openai.com/v1', 'openai-compatible': 'https://api.openai.com/v1', 'anthropic': 'https://api.anthropic.com/v1' }[provider] || '';
  }
}

module.exports = LLMAdapter;
