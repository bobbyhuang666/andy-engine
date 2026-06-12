/**
 * ProceduralMemory - 程序性记忆系统
 *
 * 灵感来源：
 *   - Anderson's ACT-R: 程序性记忆是"知道怎么做"的记忆
 *   - PIANO (Project Sid): Skill Execution 模块处理重复行为
 *   - Damasio (1996): Somatic Markers — 身体/情绪标记影响决策
 *
 * 在人类认知中：
 *   - 陈述性记忆 = 记住发生了什么（PersonalMemory 处理）
 *   - 程序性记忆 = 记住怎么做某事（本模块处理）
 *
 * 功能：
 *   1. 追踪 Agent 的行为序列（位置 → 状态 → 时间）
 *   2. 检测重复模式（如"每天早上 8 点去工作区"）
 *   3. 形成习惯后加速决策（跳过评估，直接执行）
 *   4. 习惯可以被打破（异常事件、情绪剧变）
 *
 * 模式结构：
 *   { trigger: { hour, dayOfWeek, position, emotion }, action: { region, state }, strength: 0-1 }
 */

class ProceduralMemory {
  constructor(savedState = null) {
    /** @type {Map<string, Object>} 模式签名 → 模式对象 */
    this.patterns = new Map();

    /** @type {Object[]} 最近的行为历史（滑动窗口） */
    this._recentActions = [];

    /** @type {number} 最大历史长度 */
    this._maxHistory = 50;

    // 模拟时间引用（与 PersonalMemory 同理）
    // 使用 0 而非 Date.now()，确保在 setSimTime() 被调用前不会产生错误的时间差计算
    this._simTime = 0;

    if (savedState) {
      for (const [key, pattern] of Object.entries(savedState.patterns || {})) {
        this.patterns.set(key, pattern);
      }
    }
  }

  /**
   * 更新模拟时间
   * @param {Date} simTime
   */
  setSimTime(simTime) {
    this._simTime = simTime.getTime();
  }

  // ═══════════════════════════════════════════
  // 行为记录
  // ═══════════════════════════════════════════

  /**
   * 记录当前行为
   * @param {Object} action - { hour, dayOfWeek, position, state, valence, region }
   */
  recordAction(action) {
    const entry = {
      hour: Math.floor(action.hour || 0),
      dayOfWeek: action.dayOfWeek || 0,
      position: action.position || '',
      state: action.state || '',
      valence: action.valence || 0,
      region: action.region || action.position || '',
      timestamp: this._simTime,
    };

    this._recentActions.push(entry);
    if (this._recentActions.length > this._maxHistory) {
      this._recentActions.shift();
    }

    // 尝试匹配并强化已有模式
    this._matchAndStrengthen(entry);
  }

  // ═══════════════════════════════════════════
  // 模式检测
  // ═══════════════════════════════════════════

  /**
   * 尝试将当前行为与已有模式匹配
   * @private
   */
  _matchAndStrengthen(entry) {
    for (const [key, pattern] of this.patterns) {
      const match = this._matchesPattern(entry, pattern.trigger);
      if (match > 0.6) {
        // 强化模式（Hebbian: 一起激活的连接增强）
        pattern.strength = Math.min(1, pattern.strength + 0.02 * match);
        pattern.lastSeen = this._simTime;
        pattern.occurrences++;
        return;
      }
    }

    // 没有匹配的模式 → 创建新候选模式
    this._maybeCreatePattern(entry);
  }

  /**
   * 检查行为是否匹配某个模式
   * @private
   * @returns {number} 匹配度 0-1
   */
  _matchesPattern(entry, trigger) {
    let score = 0;
    let weights = 0;

    // 时间匹配（权重最高）
    if (trigger.hour !== undefined) {
      const hourDiff = Math.abs(entry.hour - trigger.hour);
      const timeMatch = Math.max(0, 1 - hourDiff / 3); // ±3 小时内匹配
      score += timeMatch * 3;
      weights += 3;
    }

    // 星期匹配
    if (trigger.dayOfWeek !== undefined) {
      const dayMatch = entry.dayOfWeek === trigger.dayOfWeek ? 1 : 0;
      score += dayMatch * 1;
      weights += 1;
    }

    // 位置匹配
    if (trigger.position) {
      const posMatch = entry.position === trigger.position ? 1 : 0;
      score += posMatch * 2;
      weights += 2;
    }

    // 情绪效价匹配（大致相同的情绪状态）
    if (trigger.valence !== undefined) {
      const valDiff = Math.abs(entry.valence - trigger.valence);
      const valMatch = Math.max(0, 1 - valDiff);
      score += valMatch * 1;
      weights += 1;
    }

    return weights > 0 ? score / weights : 0;
  }

  /**
   * 从行为历史中创建新候选模式
   * @private
   */
  _maybeCreatePattern(entry) {
    // 检查最近历史中是否有相似行为
    const similar = this._recentActions.filter(a =>
      a.position === entry.position &&
      a.state === entry.state &&
      Math.abs(a.hour - entry.hour) <= 1
    );

    // 至少出现 3 次才会形成模式
    if (similar.length >= 3) {
      const key = `${entry.hour}_${entry.dayOfWeek}_${entry.position}`;
      if (!this.patterns.has(key)) {
        this.patterns.set(key, {
          trigger: {
            hour: entry.hour,
            dayOfWeek: entry.dayOfWeek,
            position: entry.position,
            valence: entry.valence,
          },
          action: {
            region: entry.region,
            state: entry.state,
          },
          strength: 0.3, // 初始强度
          occurrences: similar.length,
          lastSeen: this._simTime,
          createdAt: this._simTime,
        });
      }
    }
  }

  // ═══════════════════════════════════════════
  // 模式查询
  // ═══════════════════════════════════════════

  /**
   * 查询当前情况下是否有匹配的习惯行为
   *
   * @param {Object} context - { hour, dayOfWeek, position, valence }
   * @returns {Object|null} { action, confidence } 或 null
   */
  query(context) {
    let bestMatch = null;
    let bestScore = 0;

    for (const [key, pattern] of this.patterns) {
      // 低强度模式不触发习惯行为
      if (pattern.strength < 0.5) continue;

      const match = this._matchesPattern(context, pattern.trigger);
      const confidence = match * pattern.strength;

      if (confidence > bestScore && confidence > 0.4) {
        bestScore = confidence;
        bestMatch = {
          action: pattern.action,
          confidence,
          patternKey: key,
        };
      }
    }

    return bestMatch;
  }

  /**
   * 获取所有足够强的模式（用于调试/展示）
   * @returns {Object[]}
   */
  getStrongPatterns() {
    return [...this.patterns.values()]
      .filter(p => p.strength >= 0.4)
      .sort((a, b) => b.strength - a.strength);
  }

  // ═══════════════════════════════════════════
  // 模式衰减
  // ═══════════════════════════════════════════

  /**
   * 推进模式衰减（长时间不重复的行为模式会消退）
   * @param {number} hoursElapsed
   */
  tick(hoursElapsed) {
    const now = this._simTime;
    const decayRate = 0.001; // 每小时衰减

    for (const [key, pattern] of this.patterns) {
      const hoursSinceLastSeen = (now - (pattern.lastSeen || now)) / (1000 * 60 * 60);

      // 长时间未重复的模式衰减
      if (hoursSinceLastSeen > 24) {
        pattern.strength *= Math.exp(-decayRate * hoursSinceLastSeen);
      }

      // 强度太低的模式删除
      if (pattern.strength < 0.05) {
        this.patterns.delete(key);
      }
    }
  }

  /**
   * 打破习惯（当发生意外事件或情绪剧变时）
   * @param {number} disruptionStrength - 干扰强度 0-1
   */
  disrupt(disruptionStrength = 0.5) {
    for (const [key, pattern] of this.patterns) {
      pattern.strength *= (1 - disruptionStrength * 0.3);
    }
  }

  // ═══════════════════════════════════════════
  // 序列化
  // ═══════════════════════════════════════════

  toJSON() {
    const patterns = {};
    for (const [key, pattern] of this.patterns) {
      patterns[key] = { ...pattern };
    }
    return { patterns };
  }
}

module.exports = ProceduralMemory;
