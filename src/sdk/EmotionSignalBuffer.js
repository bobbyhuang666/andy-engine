/**
 * EmotionSignalBuffer — 情绪信号缓冲层
 *
 * 解决时序不对齐问题:
 *   Bobby 对话: 秒级（用户连发 10 条消息）
 *   Andy tick: 分钟级（每 5 分钟一次）
 *
 * 工作方式:
 *   1. 用户每发一条消息 → classify → push 到缓冲
 *   2. Andy tick 时 → consume → 合并 effect → applyEffect
 *   3. 同时生成故事片段
 */

const { EmotionEffectClassifier } = require('./EmotionEffectClassifier');

class EmotionSignalBuffer {
  constructor() {
    /** @type {Array<{ timestamp: number, text: string, result: Object }>} */
    this.pending = [];

    /** 上次消费时间 */
    this.lastConsumeTime = 0;
  }

  /**
   * 推入一条用户消息
   * @param {string} text - 用户消息
   * @returns {Object} 分类结果（可选用于即时反馈）
   */
  push(text) {
    const result = EmotionEffectClassifier.classify(text);

    this.pending.push({
      timestamp: Date.now(),
      text,       // 仅在缓冲中暂存，消费后丢弃
      result,
    });

    return result;
  }

  /**
   * 消费所有待处理信号（Andy tick 时调用）
   *
   * @returns {{
   *   mergedEffect: Object,     // 合并后的 30 维 effect
   *   dominantIntent: string,   // 主要意图
   *   messageCount: number,     // 消息数量
   *   storyText: string|null,   // 生成的故事片段
   * } | null} 无待处理信号时返回 null
   */
  consume() {
    if (this.pending.length === 0) return null;

    const messages = this.pending.map(p => p.text);
    const { mergedEffect, dominantIntent, allKeywords } =
      EmotionEffectClassifier.classifyBatch(messages);

    const messageCount = this.pending.length;
    this.lastConsumeTime = Date.now();

    // 清空缓冲
    this.pending = [];

    // 生成故事文本（脱敏：不包含用户内容）
    const storyText = this._generateStory(messageCount, dominantIntent, allKeywords);

    return {
      mergedEffect,
      dominantIntent,
      messageCount,
      storyText,
    };
  }

  /**
   * 查看待处理信号数量（不消费）
   */
  get pendingCount() {
    return this.pending.length;
  }

  /**
   * 从信号数据生成脱敏故事文本
   * @private
   */
  _generateStory(messageCount, intent, keywords) {
    // 基础故事
    let story = '';

    if (intent === 'care') {
      const variants = [
        '有个人关心了你一下，感觉还不错',
        '被人关心了，心里暖暖的',
        '有人嘘寒问暖，心情好了一点',
      ];
      story = variants[Math.floor(Math.random() * variants.length)];
    } else if (intent === 'praise') {
      const variants = [
        '被人夸了一下，有点开心',
        '有人说你好话，心情不错',
        '收到了一点赞美',
      ];
      story = variants[Math.floor(Math.random() * variants.length)];
    } else if (intent === 'comfort') {
      const variants = [
        '有人安慰了你',
        '得到了一些鼓励',
        '有人说了些暖心的话',
      ];
      story = variants[Math.floor(Math.random() * variants.length)];
    } else if (messageCount >= 5) {
      story = '和一个人聊了很久';
    } else if (messageCount >= 2) {
      story = '和一个人聊了几句';
    } else {
      // 根据关键词判断情绪
      const hasSad = keywords.some(k => ['难过','伤心','累','烦','孤独','寂寞','丧','焦虑'].includes(k));
      const hasHappy = keywords.some(k => ['开心','高兴','哈哈','快乐','爽','太好了'].includes(k));

      if (hasSad) {
        story = '今天和一个人聊天，对方好像心情不太好';
      } else if (hasHappy) {
        story = '今天和一个人聊天，对方心情不错';
      } else {
        story = '今天和一个人聊了会天';
      }
    }

    return story;
  }
}

module.exports = { EmotionSignalBuffer };
