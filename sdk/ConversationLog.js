/**
 * ConversationLog — 对话历史管理
 *
 * 职责：
 *   1. 记录用户和角色的对话
 *   2. 维护滑动窗口（避免 token 超限）
 *   3. 生成对话历史摘要（用于长期记忆）
 *   4. 导出为 LLM messages 格式
 */

class ConversationLog {
  /**
   * @param {Object} options
   * @param {number} options.maxMessages - 最大保留消息数（默认 50）
   * @param {number} options.maxTokens - 估算的最大 token 数（默认 4000）
   * @param {string} options.characterName - 角色名
   */
  constructor(options = {}) {
    this.maxMessages = options.maxMessages || 50;
    this.maxTokens = options.maxTokens || 4000;
    this.characterName = options.characterName || '角色';
    this.messages = [];
    this._summarizedHistory = '';
  }

  /**
   * 添加用户消息
   * @param {string} text
   */
  addUserMessage(text) {
    this.messages.push({
      role: 'user',
      content: text,
      timestamp: Date.now(),
    });
    this._trim();
  }

  /**
   * 添加角色回复
   * @param {string} text
   */
  addAssistantMessage(text) {
    this.messages.push({
      role: 'assistant',
      content: text,
      timestamp: Date.now(),
    });
    this._trim();
  }

  /**
   * 获取 LLM 格式的 messages 数组
   * （不含 system message，system 由 NarrativeBuilder 构建）
   *
   * @returns {Object[]} [{ role: 'user'|'assistant', content: '...' }]
   */
  toMessages() {
    return this.messages.map(m => ({
      role: m.role,
      content: m.content,
    }));
  }

  /**
   * 获取对话历史摘要（用于长期记忆注入）
   * 提取最近对话中的关键话题和事实
   *
   * @returns {string}
   */
  getSummary() {
    if (this.messages.length === 0) return '';

    // 提取最近 10 轮对话的关键信息
    const recent = this.messages.slice(-20);
    const topics = new Set();

    for (const msg of recent) {
      if (msg.role === 'user' && msg.content.length > 5) {
        // 提取用户消息的关键短语（简化版）
        const content = msg.content;
        if (content.length > 20) {
          topics.add(content.substring(0, 20) + '...');
        } else {
          topics.add(content);
        }
      }
    }

    if (topics.size === 0) return this._summarizedHistory;

    const topicList = [...topics].slice(0, 5);
    return `最近聊过的话题：${topicList.join('、')}。` +
      (this._summarizedHistory ? `\n${this._summarizedHistory}` : '');
  }

  /**
   * 获取对话轮数
   */
  get turnCount() {
    return Math.floor(this.messages.filter(m => m.role === 'user').length);
  }

  /**
   * 获取消息数量
   */
  get length() {
    return this.messages.length;
  }

  /**
   * 清空对话历史
   */
  clear() {
    // 在清空前生成摘要（保留长期记忆）
    if (this.messages.length > 10) {
      this._summarizedHistory = this.getSummary();
    }
    this.messages = [];
  }

  /**
   * 序列化
   */
  toJSON() {
    return {
      messages: this.messages,
      summarizedHistory: this._summarizedHistory,
      characterName: this.characterName,
    };
  }

  /**
   * 反序列化
   */
  static fromJSON(data) {
    const log = new ConversationLog({ characterName: data.characterName });
    log.messages = data.messages || [];
    log._summarizedHistory = data.summarizedHistory || '';
    return log;
  }

  /**
   * 滑动窗口裁剪
   * @private
   */
  _trim() {
    // 按消息数裁剪
    if (this.messages.length > this.maxMessages) {
      const overflow = this.messages.length - this.maxMessages;
      // 保留偶数条（保持 user/assistant 配对）
      const trimCount = overflow % 2 === 0 ? overflow : overflow + 1;
      const trimmed = this.messages.splice(0, trimCount);
      // 将被裁剪的消息生成摘要
      const userMsgs = trimmed.filter(m => m.role === 'user').map(m => m.content);
      if (userMsgs.length > 0) {
        const oldSummary = this._summarizedHistory ? `${this._summarizedHistory}\n` : '';
        this._summarizedHistory = `${oldSummary}更早聊过：${userMsgs.slice(0, 3).join('、')}`;
      }
    }

    // 按估算 token 数裁剪（粗略：1 中文字 ≈ 2 token）
    let totalChars = 0;
    for (const msg of this.messages) {
      totalChars += msg.content.length;
    }
    const estimatedTokens = totalChars * 2;
    if (estimatedTokens > this.maxTokens && this.messages.length > 4) {
      // 移除最旧的 2 条（保持配对）
      const trimmed = this.messages.splice(0, 2);
      const oldSummary = this._summarizedHistory ? `${this._summarizedHistory}\n` : '';
      this._summarizedHistory = `${oldSummary}更早聊过：${trimmed.map(m => m.content.substring(0, 15)).join('、')}`;
    }
  }
}

module.exports = ConversationLog;
