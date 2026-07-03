/**
 * PersonalMemory - 动态个人记忆系统
 *
 * 与静态种子记忆的区别：
 *   - 静态种子记忆是预设的背景故事
 *   - PersonalMemory 是动态积累的（Agent 真实经历过的事件）
 *
 * 基于 ACT-R 记忆模型 (Anderson, 2007):
 *   - 基础激活度: B_i = ln(Σ t_j^(-d))
 *   - 总激活度: A_i = B_i + Σ(W_j * S_ji) + noise
 *   - 检索概率: P = 1/(1+exp(-(A-tau)/s))
 *
 * 记忆衰减: 混合模型（近期指数衰减 + 远期幂律衰减）
 */

const { ANDY_DEFAULTS, SEMANTIC_EVENT_CATEGORIES } = require('../../config/defaults');
const cfg = ANDY_DEFAULTS.memory;

const { RNG } = require('../../shared/rng');

function mergeRecallEmotionDelta(userRecallConfig = null) {
  const merged = { ...cfg.recallEmotionDelta };
  if (!userRecallConfig) return merged;

  for (const [key, value] of Object.entries(userRecallConfig)) {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      merged[key] = {
        ...(cfg.recallEmotionDelta[key] || {}),
        ...value,
      };
    } else {
      merged[key] = value;
    }
  }
  return merged;
}

function mergeMemoryConfig(memoryConfig = null) {
  return {
    ...cfg,
    ...(memoryConfig || {}),
    spreadingActivation: {
      ...cfg.spreadingActivation,
      ...(memoryConfig?.spreadingActivation || {}),
    },
    recallEmotionDelta: mergeRecallEmotionDelta(memoryConfig?.recallEmotionDelta),
  };
}

function nextDynamicMemoryId(agentId, memories = []) {
  const escapedAgentId = String(agentId).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(`^mem_${escapedAgentId}_(\\d+)$`);
  let max = -1;
  for (const memory of memories) {
    const match = typeof memory.id === 'string' ? memory.id.match(pattern) : null;
    if (match) max = Math.max(max, Number(match[1]));
  }
  return max + 1;
}

class PersonalMemory {
  /**
   * @param {string} agentId - 所属 Agent ID
   * @param {Object[]} [seedMemories] - 种子记忆（角色背景）
   * @param {Object[]} [savedMemories] - 恢复的序列化记忆
   * @param {Object} [domain] - DomainRegistry 实例
   */
  constructor(agentId, seedMemories = [], savedMemories = null, domain = null, rng = null, memoryConfig = null) {
    this.agentId = agentId;
    if (!domain) throw new Error('PersonalMemory requires a domain config');
    this.domain = domain;
    this._rng = rng || new RNG(0);
    this._cfg = mergeMemoryConfig(memoryConfig);

    // 从 domain 取语义分类
    this._semanticCategories = this.domain.memoryTemplates.semanticCategories || SEMANTIC_EVENT_CATEGORIES;

    this._tickCache = new Map();
    this._tickCacheTick = -1;
    // v2.3-W1: deterministic 初值（与 ProceduralMemory 一致），消除构造到 setSimTime
    // 间的墙上时钟渗漏（line 97 createdAt / line 172-174 seed memory timestamp）。
    // setSimTime（每 tick 由 AgentRuntime.tick 调用）覆盖为 sim time。
    this._simTime = 0;
    const restoredMemories = savedMemories ? (Array.isArray(savedMemories) ? savedMemories : (savedMemories.memories || [])) : [];
    // R8 fix: use serialized _nextMemId if available, preventing ID collision
    // after prune+restore. Fallback to recomputation for backward compat.
    this._nextMemId = (savedMemories && !Array.isArray(savedMemories) && typeof savedMemories._nextMemId === 'number')
      ? savedMemories._nextMemId
      : nextDynamicMemoryId(agentId, restoredMemories);
    this.appraisalBiases = [];

    if (savedMemories) {
      const memArray = Array.isArray(savedMemories) ? savedMemories : (savedMemories.memories || []);
      this.memories = memArray.map(m => {
        // R34 P1 fix: validate timestamps from saved data. Invalid Date
        // propagates into ACT-R base-level activation, tick decay, and
        // prompt generation, producing NaN throughout the memory system.
        const safeDate = (v) => {
          const d = new Date(v);
          return Number.isFinite(d.getTime()) ? d : new Date(this._simTime || 0);
        };
        return {
          ...m,
          timestamp: safeDate(m.timestamp),
          lastAccessed: safeDate(m.lastAccessed),
          presentations: (m.presentations || []).map(t => safeDate(t)),
          semanticCategory: m.semanticCategory || null,
          // R34 P2 fix: validate importance from saved data.
          importance: typeof m.importance === 'number' && Number.isFinite(m.importance) ? m.importance : 0.5,
          // R12: deep-copy nested objects to prevent shared reference mutation
          associations: [...(m.associations || [])],
          // R34 P2 fix: validate emotionSnapshot numeric values.
          emotionSnapshot: m.emotionSnapshot
            ? Object.fromEntries(Object.entries(m.emotionSnapshot).map(([k, v]) =>
                [k, typeof v === 'number' && Number.isFinite(v) ? v : 0]))
            : {},
          appraisal: m.appraisal ? { ...m.appraisal } : null,
        };
      });
      if (!Array.isArray(savedMemories) && savedMemories.appraisalBiases) {
        // R12: deep-copy appraisalBiases to prevent shared reference
        this.appraisalBiases = savedMemories.appraisalBiases.map(b => ({ ...b }));
      }
    } else {
      // R36 P2 fix: validate seed memory timestamps, matching savedMemories safeDate.
      // A truthy but non-parseable timestamp string (e.g., "yesterday") produces
      // Invalid Date, corrupting ACT-R base-level activation.
      const safeDate = (v) => {
        const d = new Date(v);
        return Number.isFinite(d.getTime()) ? d : new Date(this._simTime || 0);
      };
      this.memories = seedMemories.map((m, i) => ({
        id: `seed_${i}`,
        content: m.content || m,
        category: m.category || 'background',
        emotionTag: m.emotionTag || 'neutral',
        importance: m.importance ?? 0.8,
        timestamp: safeDate(m.timestamp || this._simTime || 0),
        lastAccessed: new Date(this._simTime || 0),
        presentations: [new Date(this._simTime || 0)],
        accessCount: 1,
        associations: m.associations || [],
      }));
    }
  }

  /**
   * 添加评价偏移（重大事件时调用）
   *
   * @param {Object} bias
   * @param {string} bias.eventType - 事件类型（如 'social', 'conflict'）
   * @param {number} bias.valenceShift - 效价偏移（如 -0.1）
   * @param {number} [bias.decay=0.0005] - 每 tick 衰减量（0.0005 → 约 2000 tick 恢复）
   * @param {string} [bias.reason] - 触发原因
   */
  addAppraisalBias(bias) {
    // R113-002: guard against NaN/Infinity valenceShift and decay (defense-in-depth;
    // these values could come from corrupted delta data or direct construction).
    const valenceShift = Number.isFinite(bias.valenceShift) ? bias.valenceShift : 0;
    const decay = Number.isFinite(bias.decay) ? bias.decay : 0.0005;
    this.appraisalBiases.push({
      eventType: bias.eventType,
      valenceShift,
      decay,
      reason: bias.reason || '',
      createdAt: this._simTime,
    });
    // 最多保留 5 个 bias
    if (this.appraisalBiases.length > 5) {
      this.appraisalBiases.shift();
    }
  }

  /**
   * 获取当前有效的评价偏移（用于 Appraisal.evaluate）
   * @param {string} eventType - 当前事件类型
   * @returns {number} 累积的 valence 偏移
   */
  getAppraisalBias(eventType) {
    let totalShift = 0;
    for (const bias of this.appraisalBiases) {
      if (bias.eventType === eventType || bias.eventType === 'all') {
        totalShift += bias.valenceShift;
      }
    }
    return totalShift;
  }

  /**
   * 推进 appraisal bias 衰减（由 Agent.tick() 调用）
   */
  tickAppraisalBiases() {
    for (let i = this.appraisalBiases.length - 1; i >= 0; i--) {
      const bias = this.appraisalBiases[i];
      bias.valenceShift *= (1 - bias.decay);
      // 偏移量太小时移除
      if (Math.abs(bias.valenceShift) < 0.001) {
        this.appraisalBiases.splice(i, 1);
      }
    }
  }

  /**
   * 更新模拟时间（由 Agent 每 tick 调用）
   * @param {Date} simTime
   */
  setSimTime(simTime) {
    // R34 P1 fix: validate simTime produces a finite timestamp.
    // Invalid Date → getTime() returns NaN → _simTime becomes NaN →
    // all memory timestamps, decay, and ACT-R activation produce NaN.
    const ts = simTime?.getTime?.();
    this._simTime = Number.isFinite(ts) ? ts : this._simTime;
  }

  /**
   * 获取当前模拟时间（毫秒时间戳）
   * @returns {number}
   */
  getSimTime() {
    return this._simTime;
  }

  // ═══════════════════════════════════════════
  // 记忆添加
  // ═══════════════════════════════════════════

  /**
   * 添加新记忆（经历事件时调用）
   * @param {Object} event - 世界事件（可能包含 _appraisal 评价标签）
   * @param {Object} emotionState - 当时的情绪快照
   * @param {number} [appraisalImportance] - 来自 Appraisal 系统的重要性评分（优先使用）
   * @returns {Object} 创建的记忆
   */
  addExperience(event, emotionState, appraisalImportance = null) {
    const memory = {
      id: `mem_${this.agentId}_${this._nextMemId++}`,
      content: event.content || event.description || '',
      category: event.type || 'general',
      emotionTag: this._tagEmotion(emotionState),
      importance: (() => {
        let importance = (appraisalImportance != null
          ? appraisalImportance
          : this._calculateImportance(event, emotionState))
          * (1 + this._getArousal(emotionState?.current || emotionState) * 0.3);
        if (!Number.isFinite(importance)) importance = 0.5;
        return importance;
      })(),
      timestamp: new Date(this._simTime),
      lastAccessed: new Date(this._simTime),
      presentations: [new Date(this._simTime)],
      accessCount: 1,
      associations: [
        ...(event.participants || []),
        event.location || '',
        // 将当前位置和状态添加到关联中（支持区域匹配检索和行为后果评估）
        event._region || '',
        event._currentState || '',
      ].filter(Boolean),
      eventId: event.id,
      emotionSnapshot: this._snapshotEmotion(emotionState),
      // 存储认知评价元数据（用于反思和后续检索）
      appraisal: event._appraisal || null,
      // 语义事件分类（支持基于类别的记忆检索）
      semanticCategory: this._classifySemanticCategory(event),
    };

    this.memories.push(memory);

    // 超过上限时，删除最不重要的记忆
    if (this.memories.length > this._cfg.maxMemories) {
      this._prune();
    }

    return memory;
  }

  // ═══════════════════════════════════════════
  // 记忆检索 (ACT-R 模型)
  // ═══════════════════════════════════════════

  /**
   * 检索与上下文相关的记忆
   * @param {Object} context - 检索上下文 { keywords: string[], emotion: Object, region: string }
   * @param {number} [limit=5] - 最多返回条数
   * @returns {Object[]} 按相关性排序的记忆
   */
  retrieve(context, limit = 5) {
    const now = this._simTime;

    // ── tick 级缓存命中（P0 性能优化）──
    const cacheKey = this._buildCacheKey(context, limit);
    const cached = this._tickCache.get(cacheKey);
    if (cached) return cached;

    // 预计算当前情绪状态（用于 mood-congruent recall）
    const currentValence = context.emotion ? this._getValence(context.emotion) : 0;
    const currentArousal = context.emotion ? this._getArousal(context.emotion) : 0.5;

    // ─── 预计算关键词频率索引（避免 O(M²×K) 重复计算）───
    // 原实现：每个 memory × 每个 keyword 都调用 _countKeywordMatches 遍历全部记忆
    // 优化：只遍历一次，建立 keyword → count 映射
    const keywordFreqCache = {};
    if (context.keywords && context.keywords.length > 0) {
      for (const keyword of context.keywords) {
        const kw = keyword.toLowerCase();
        let count = 0;
        for (const m of this.memories) {
          if (m.content.toLowerCase().includes(kw)) count++;
        }
        keywordFreqCache[kw] = Math.max(1, count);
      }
    }

    // 临时存储关键词频率缓存（供 _spreadingActivation 使用）
    this._kwFreqCache = keywordFreqCache;

    // 部分选择优化：只保留 top-N 候选，避免为全部 500 条记忆创建临时对象
    // 使用插入排序维护一个容量为 limit 的有序缓冲区
    // 复杂度从 O(N log N) 全排序降到 O(N log K)，K = limit（通常 2-5）
    const topK = []; // 按 probability 降序排列的 { memory, activation, probability }

    for (const memory of this.memories) {
      // ─── 1. ACT-R 基础激活度 ───
      const B = this._baseLevelActivation(memory, now);

      // ─── 2. 上下文扩散激活（语义 + 实体 + 区域）───
      const spreading = this._spreadingActivation(memory, context);

      // ─── 3. 情绪一致性偏差（Mood-congruent recall, Bower 1981）───
      const moodCongruence = this._moodCongruence(currentValence, memory);

      // ─── 4. 情绪增强效应（Emotional Enhancement, Cahill & McGaugh 1995）───
      const emotionalBoost = memory.appraisal
        ? memory.appraisal.importance * 0.3
        : 0;

      // ─── 5. 不自主记忆（Proust Effect, Berntsen 2009）───
      const involuntary = this._involuntaryRecall(memory, currentArousal);

      // ─── 6. 噪声 ───
      const noise = this._logisticNoise(this._cfg.retrievalNoise);

      const A = B
        + spreading * 1.0
        + moodCongruence * this._cfg.moodCongruenceWeight
        + emotionalBoost
        + involuntary * 0.6
        + noise;

      const P = 1 / (1 + Math.exp(-(A - this._cfg.retrievalThreshold) / this._cfg.retrievalNoise));

      // 只有概率足够高的记忆才值得进入候选池
      if (P <= 0.1) continue;

      // 插入排序到 topK（保持降序）
      const entry = { memory, activation: A, probability: P };
      if (topK.length < limit) {
        // 还有空位——找到插入位置
        let pos = topK.length;
        for (let j = 0; j < topK.length; j++) {
          if (P > topK[j].probability) { pos = j; break; }
        }
        topK.splice(pos, 0, entry);
      } else if (P > topK[topK.length - 1].probability) {
        // 比最弱的候选强——替换并重新定位
        topK.pop();
        let pos = topK.length;
        for (let j = 0; j < topK.length; j++) {
          if (P > topK[j].probability) { pos = j; break; }
        }
        topK.splice(pos, 0, entry);
      }
    }

    // topK 已按 probability 降序排列
    const results = topK;

    for (const { memory } of results) {
      this._touchMemory(memory);
      // 记忆再巩固（Reconsolidation, Nader et al. 2000）
      // 每次回忆，情绪标签会轻微偏移向当前情绪状态
      this._reconsolidate(memory, currentValence, currentArousal);
    }

    // ─── 记忆→情绪反向通路（Recall → Emotion Feedback）───
    // 检索出的记忆根据情绪标签和重要性直接产生情绪增量
    // 这是双向耦合的反向通路：记忆内容 Appraisal → 情绪状态更新
    const recallEmotionDelta = this._computeRecallDelta(
      results.map(r => r.memory),
      currentValence,
    );

    // 清理临时缓存
    this._kwFreqCache = null;

    const result = { memories: results.map(r => r.memory), recallEmotionDelta };

    // 写入 tick 缓存
    this._tickCache.set(cacheKey, result);

    return result;
  }

  /**
   * ACT-R 基础激活度
   * B_i = ln(Σ t_j^(-d))
   * 使用最小时间阈值防止 log(∞)
   * @private
   */
  _baseLevelActivation(memory, now) {
    const d = this._cfg.decayRate;
    let sum = 0;
    const minHours = 0.016; // ~1 分钟最小值，防止 log(∞)

    for (const t of memory.presentations) {
      const hoursSince = Math.max(minHours, (now - t.getTime()) / (1000 * 60 * 60));
      sum += Math.pow(hoursSince, -d);
    }

    return sum > 0 ? Math.log(Math.max(sum, 0.001)) : -10;
  }

  /**
   * 扩散激活（上下文关联）
   * @private
   */
  _spreadingActivation(memory, context) {
    let activation = 0;
    const { W, S } = this._cfg.spreadingActivation;

    // 关键词匹配（使用预计算的频率缓存）
    if (context.keywords) {
      const memText = memory.content.toLowerCase();
      for (const keyword of context.keywords) {
        const kw = keyword.toLowerCase();
        if (memText.includes(kw)) {
          // 优先使用缓存，回退到实时计算
          const fanCount = this._kwFreqCache
            ? (this._kwFreqCache[kw] || 1)
            : this._countKeywordMatches(keyword);
          activation += W * (S - Math.log(Math.max(1, fanCount)));
        }
      }
    }

    // 情绪匹配
    if (context.emotion && memory.emotionSnapshot) {
      const similarity = this._emotionSimilarity(context.emotion, memory.emotionSnapshot);
      activation += similarity * W * 0.5;
    }

    // 关联实体匹配
    if (context.agentId && memory.associations.includes(context.agentId)) {
      activation += W * S * 0.3;
    }

    // 区域匹配
    if (context.region && memory.associations.includes(context.region)) {
      activation += W * S * 0.2;
    }

    // 语义类别匹配（Semantic Category Matching）
    // 同一语义类别的记忆更容易被关联检索
    // 权重较高（0.3）：语义类别是强信号，应能克服随机噪声
    if (context.semanticCategory && memory.semanticCategory &&
        context.semanticCategory === memory.semanticCategory) {
      activation += W * S * 0.3;
    }

    return activation;
  }

  /**
   * 情绪相似度计算
   * @private
   */
  _emotionSimilarity(emotionA, emotionB) {
    if (!emotionA || !emotionB) return 0;

    const dims = Object.keys(emotionA);
    let sumSqDiff = 0;
    let count = 0;

    for (const dim of dims) {
      if (emotionB[dim] !== undefined) {
        sumSqDiff += (emotionA[dim] - emotionB[dim]) ** 2;
        count++;
      }
    }

    if (count === 0) return 0;

    // 余弦相似度的近似：距离越小，相似度越高
    const dist = Math.sqrt(sumSqDiff / count);
    return Math.max(0, 1 - dist);
  }

  /**
   * 情绪一致性偏差（Mood-congruent recall, Bower 1981）
   *
   * 当前情绪效价与记忆情绪效价的一致程度。
   * 忧郁时更容易想起悲伤的记忆，快乐时更容易想起快乐的记忆。
   *
   * @param {number} currentValence - 当前情绪效价 [-1, 1]
   * @param {Object} memory - 记忆对象
   * @returns {number} 一致性激活值 [-0.5, 0.5]
   * @private
   */
  _moodCongruence(currentValence, memory) {
    if (!memory.emotionSnapshot) return 0;

    const memValence = this._getValence(memory.emotionSnapshot);

    // 同号（同为正或同为负）→ 正激活
    // 异号 → 负激活（抑制）
    const congruence = currentValence * memValence;

    // 归一化到 [-scale, scale]，可配置标量
    return congruence * this._cfg.moodCongruenceScale;
  }

  /**
   * 不自主记忆（Proust Effect, Berntsen 2009）
   *
   * 极端情绪的记忆会不自主浮现，即使线索很弱。
   * 这是 EAAM 的"Involuntary pathway"。
   *
   * @param {Object} memory - 记忆对象
   * @param {number} currentArousal - 当前唤醒度
   * @returns {number} 不自主激活值
   * @private
   */
  _involuntaryRecall(memory, currentArousal) {
    if (!memory.emotionSnapshot) return 0;

    const memArousal = this._getArousal(memory.emotionSnapshot);

    // 高唤醒记忆 + 当前高唤醒 → 不自主浮现
    // McGaugh (2004): 杏仁核激活增强海马编码
    if (memArousal > 0.7 && currentArousal > 0.5) {
      return memArousal * currentArousal * 0.4;
    }

    // 评价重要性极高的记忆也容易不自主浮现
    if (memory.appraisal && memory.appraisal.importance > 0.7) {
      return memory.appraisal.importance * 0.3;
    }

    return 0;
  }

  /**
   * 计算记忆回溯的情绪反馈增量（Recall → Emotion Feedback）
   *
   * 双向耦合的反向通路：检索出的记忆根据情绪标签和重要性
   * 直接产生情绪状态增量。
   *
   * 基于 Appraisal 理论 (Lazarus 1991, Scherer 2001)：
   *   - 记忆的情绪标签决定了情绪效价方向
   *   - 记忆重要性缩放影响强度
   *   - 负性反刍增强：当前负性情绪状态下，悲伤记忆的反馈更强
   *
   * @param {Object[]} memories - 检索出的记忆列表
   * @param {number} currentValence - 当前情绪效价
   * @returns {Object} 情绪维度 → 增量值
   * @private
   */
  _computeRecallDelta(memories, currentValence) {
    if (!memories || memories.length === 0) return {};

    const rCfg = this._cfg.recallEmotionDelta;
    if (!rCfg) return {};

    const delta = {};

    for (const memory of memories) {
      const tag = memory.emotionTag || 'neutral';
      const baseDelta = rCfg[tag];
      if (!baseDelta) continue;

      // 重要性缩放：越重要的记忆，情绪反馈越强
      const importanceFactor = 1 + (memory.importance - 0.5) * rCfg.importanceScale;

      // 负性反刍增强：当前负性情绪时，悲伤记忆的反馈被放大
      let ruminationFactor = 1.0;
      if (tag === 'sad' && currentValence < -0.1) {
        ruminationFactor = rCfg.ruminationMultiplier;
      }

      const scale = importanceFactor * ruminationFactor;

      for (const [dim, value] of Object.entries(baseDelta)) {
        if (dim === 'importanceScale' || dim === 'ruminationMultiplier') continue; // 跳过非维度配置
        delta[dim] = (delta[dim] || 0) + value * scale;
      }
    }

    return delta;
  }

  /**
   * 记忆再巩固（Reconsolidation, Nader et al. 2000）
   *
   * 每次记忆被回忆时，其情绪标签会轻微偏移向当前情绪状态。
   * 这模拟了人类记忆的重构特性：每次回忆都是一次重建。
   *
   * @param {Object} memory - 被回忆的记忆
   * @param {number} currentValence - 当前情绪效价
   * @param {number} currentArousal - 当前唤醒度
   * @private
   */
  _reconsolidate(memory, currentValence, currentArousal) {
    if (!memory.emotionSnapshot) return;

    // 再巩固漂移率：非常小，防止记忆快速变形
    const driftRate = 0.02;

    // 计算记忆的情绪效价和唤醒度
    const memValence = this._getValence(memory.emotionSnapshot);
    const memArousal = this._getArousal(memory.emotionSnapshot);

    // 应用微量漂移（朝当前情绪方向）
    const newValence = memValence + (currentValence - memValence) * driftRate;
    const newArousal = memArousal + (currentArousal - memArousal) * driftRate;

    // 更新记忆的情绪快照（只更新效价/唤醒相关的维度）
    // 注意：这会逐渐改变记忆的情绪"颜色"
    const valenceUpdate = newValence - memValence;
    const positiveDims = ['joy', 'contentment', 'satisfaction', 'calm', 'hope'];
    const negativeDims = ['sadness', 'anger', 'fear', 'loneliness', 'frustration'];

    for (const dim of positiveDims) {
      if (memory.emotionSnapshot[dim] !== undefined) {
        const newVal = memory.emotionSnapshot[dim] + valenceUpdate * 0.3;
        // R9 fix: clamp to valid range to prevent unbounded drift
        // R41 M1 fix: guard against NaN before Math.max/Math.min.
        // Math.max(-1, NaN) → NaN, permanently corrupting the dimension.
        memory.emotionSnapshot[dim] = Number.isFinite(newVal)
          ? Math.max(-1, Math.min(1, newVal))
          : 0;
      }
    }
    for (const dim of negativeDims) {
      if (memory.emotionSnapshot[dim] !== undefined) {
        const newVal = memory.emotionSnapshot[dim] - valenceUpdate * 0.2;
        // R9 fix: clamp to valid range to prevent unbounded drift
        // R41 M1 fix: guard against NaN before Math.max/Math.min.
        memory.emotionSnapshot[dim] = Number.isFinite(newVal)
          ? Math.max(-1, Math.min(1, newVal))
          : 0;
      }
    }
  }

  /**
   * 计算情绪向量的效价（简化版）
   * @private
   */
  _getValence(emotion) {
    if (!emotion) return 0;
    // 与 EmotionVector.getValence() 保持一致的维度列表
    const positive = ['joy', 'contentment', 'satisfaction', 'excitement', 'calm',
                      'hope', 'love', 'pride', 'gratitude', 'relief', 'triumph', 'amusement'];
    const negative = ['sadness', 'anger', 'fear', 'disgust', 'loneliness',
                      'nervousness', 'frustration', 'guilt', 'shame', 'horror'];

    let sum = 0;
    let count = 0;
    for (const dim of positive) {
      if (emotion[dim] !== undefined) { sum += emotion[dim]; count++; }
    }
    for (const dim of negative) {
      if (emotion[dim] !== undefined) { sum -= emotion[dim]; count++; }
    }
    return count > 0 ? sum / count : 0;
  }

  /**
   * 计算情绪向量的唤醒度（简化版）
   * @private
   */
  _getArousal(emotion) {
    if (!emotion) return 0.5;
    // 与 EmotionVector.getArousal() 保持一致的维度列表
    const highArousal = ['anger', 'fear', 'excitement', 'surprise', 'nervousness', 'horror', 'pride', 'love', 'triumph'];
    const lowArousal = ['calm', 'boredom', 'contentment', 'sadness'];

    let arousal = 0.5;
    for (const dim of highArousal) {
      if (emotion[dim] !== undefined) arousal += Math.abs(emotion[dim]) * 0.1;
    }
    for (const dim of lowArousal) {
      if (emotion[dim] !== undefined) arousal -= Math.abs(emotion[dim]) * 0.05;
    }
    return Math.max(0, Math.min(1, arousal));
  }

  // ═══════════════════════════════════════════
  // tick 级缓存管理（P0 性能优化）
  // ═══════════════════════════════════════════

  /**
   * 清空 tick 级检索缓存（每个 tick 结束时调用）
   */
  clearTickCache() {
    this._tickCache.clear();
  }

  /**
   * 构建缓存键：keywords 排序 + limit + region
   * @private
   */
  _buildCacheKey(context, limit) {
    const kw = (context.keywords || []).slice().sort().join(',');
    const region = context.region || '';
    // R9 fix: include emotion valence/arousal and semanticCategory in cache key.
    // Without these, retrieve() calls with different emotion contexts or
    // semanticCategory values but same keywords/region/limit return stale results.
    const emVal = context.emotion ? Math.round((context.emotion.valence || 0) * 100) : '';
    const emAro = context.emotion ? Math.round((context.emotion.arousal || 0) * 100) : '';
    const semCat = context.semanticCategory || '';
    const agentId = context.agentId || '';
    return `${kw}|${limit}|${region}|v${emVal}|a${emAro}|${semCat}|${agentId}`;
  }

  // ═══════════════════════════════════════════
  // 记忆维护
  // ═══════════════════════════════════════════

  /**
   * 推进记忆衰减（每次 tick 调用）
   * @param {number} hoursElapsed
   */
  tick(hoursElapsed) {
    const now = this._simTime;

    // 每 tick 开始时清空上一轮缓存
    this.clearTickCache();

    for (const memory of this.memories) {
      // 基于创建时间的衰减（防止频繁访问的记忆永不衰减）
      const hoursSinceCreation = Math.max(0.01, (now - memory.timestamp.getTime()) / (1000 * 60 * 60));
      const blend = Math.min(hoursSinceCreation / 168, 1); // 1 周过渡

      const expDecay = Math.exp(-hoursSinceCreation / 24); // 半衰期 24h
      const powerDecay = Math.pow(1 + hoursSinceCreation, -0.5); // beta=0.5
      let decayFactor = expDecay * (1 - blend) + powerDecay * blend;

      // 最近访问的记忆衰减更慢（基于 lastAccessed，但上限 0.3）
      const hoursSinceAccess = (now - memory.lastAccessed.getTime()) / (1000 * 60 * 60);
      const accessBoost = Math.min(0.3, hoursSinceAccess < 1 ? 0.15 : hoursSinceAccess < 6 ? 0.08 : 0);
      decayFactor = Math.min(1, decayFactor + accessBoost);

      if (!Number.isFinite(memory.importance)) {
        memory.importance = this._cfg.pruneThreshold;
      } else {
        memory.importance = Math.min(1, Math.max(
          this._cfg.pruneThreshold,
          memory.importance * decayFactor
        ));
      }
    }

    // 定期清理
    if (this.memories.length > this._cfg.maxMemories * 0.9) {
      this._prune();
    }
  }

  /**
   * 尝试合并相似记忆
   *
   * 优化：按类别分桶比较，只比较同桶内的记忆。
   * 同时添加时间窗口限制：只比较时间相近的记忆（减少无意义比较）。
   */
  consolidate() {
    const toRemove = new Set();
    const merged = [];
    const maxCompareWindow = 50; // 每个桶内最多比较的记忆对数

    // 按 category 分桶
    const buckets = new Map();
    for (let i = 0; i < this.memories.length; i++) {
      const cat = this.memories[i].category || 'general';
      if (!buckets.has(cat)) buckets.set(cat, []);
      buckets.get(cat).push(i);
    }

    // 在每个桶内进行比较
    for (const [, indices] of buckets) {
      // 桶太大时按重要性截取前 N 个（避免 O(N²) 爆炸）
      const candidates = indices.length > maxCompareWindow
        ? [...indices].sort((a, b) => this.memories[b].importance - this.memories[a].importance).slice(0, maxCompareWindow)
        : indices;

      for (let ci = 0; ci < candidates.length; ci++) {
        const i = candidates[ci];
        if (toRemove.has(i)) continue;

        for (let cj = ci + 1; cj < candidates.length; cj++) {
          const j = candidates[cj];
          if (toRemove.has(j)) continue;

          // 快速预筛选：前5个字符不同则跳过（编辑距离一定不近）
          const contentI = this.memories[i].content || '';
          const contentJ = this.memories[j].content || '';
          if (contentI.length > 5 && contentJ.length > 5) {
            let prefixMatch = true;
            for (let k = 0; k < Math.min(5, contentI.length, contentJ.length); k++) {
              if (contentI[k] !== contentJ[k]) { prefixMatch = false; break; }
            }
            if (!prefixMatch && this.memories[i].emotionTag !== this.memories[j].emotionTag) continue;
          }

          const sim = this._memorySimilarity(this.memories[i], this.memories[j]);
          if (sim > this._cfg.consolidationThreshold) {
            const [keep, remove] = this.memories[i].importance >= this.memories[j].importance
              ? [i, j] : [j, i];

            this.memories[keep].importance = Math.min(1,
              this.memories[keep].importance + 0.1
            );
            this.memories[keep].accessCount += this.memories[remove].accessCount;
            // R9 fix: deduplicate presentation timestamps during merge.
            // Without dedup, shared timestamps inflate base-level activation.
            const existingTimes = new Set(
              this.memories[keep].presentations.map(t => t instanceof Date ? t.getTime() : t)
            );
            for (const p of this.memories[remove].presentations) {
              const key = p instanceof Date ? p.getTime() : p;
              if (!existingTimes.has(key)) {
                this.memories[keep].presentations.push(p);
                existingTimes.add(key);
              }
            }
            // R7 fix: cap presentations after consolidation merge
            if (this.memories[keep].presentations.length > this._cfg.maxPresentationsPerMemory) {
              this.memories[keep].presentations = this.memories[keep].presentations.slice(-this._cfg.maxPresentationsPerMemory);
            }

            toRemove.add(remove);
            merged.push({ kept: this.memories[keep].id, removed: this.memories[remove].id });
          }
        }
      }
    }

    // 从后往前删除，避免索引偏移
    const removeIndices = [...toRemove].sort((a, b) => b - a);
    for (const idx of removeIndices) {
      this.memories.splice(idx, 1);
    }

    return merged;
  }

  /**
   * 获取记忆快照（用于 prompt 注入）
   *
   * 实验二结论：时间+情绪加权排序优于纯 importance 排序
   * 增加去重逻辑：同一 category + 相似内容的记忆只保留最相关的一条
   *
   * @param {number} limit
   * @returns {string}
   */
  toPromptString(limit = 8) {
    // _simTime 由 ctor 初始化为时间戳，且每 tick 由 setSimTime 更新，恒非空
    const now = this._simTime;

    // 时间+情绪加权排序（实验二结论）
    const scored = this.memories
      .filter(m => m.importance > 0.1)
      .map(m => {
        const hoursAgo = Math.max(0.01, (now - m.timestamp.getTime()) / (1000 * 60 * 60));
        const recencyScore = Math.exp(-hoursAgo / 48); // 48小时半衰期
        const emotionBonus = (m.emotionTag === 'happy') ? 0.15 : (m.emotionTag === 'sad') ? 0.1 : 0;
        return { memory: m, score: m.importance * 0.6 + recencyScore * 0.3 + emotionBonus * 0.1 };
      })
      .sort((a, b) => b.score - a.score);

    // 去重：同 category + 相似内容 → 只保留得分最高的
    // 改进：使用关键词提取 + 编辑距离，而非简单的前10字符匹配
    // 解决：前10字符相同但语义不同的记忆被错误合并的问题
    const seen = new Map(); // key → { item, keywords }
    const deduped = [];
    for (const item of scored) {
      const content = item.memory.content || '';
      const cat = item.memory.category || '';

      // 提取内容关键词（去掉标点和常见虚词）
      const keywords = content
        .replace(/[，。！？、；：""''（）\s]/g, '')
        .match(/.{1,2}/g) || []; // 按2字分词（中文粗分词）

      // 检查是否与已有记忆相似
      let isDuplicate = false;
      for (const [key, existing] of seen) {
        if (existing.category !== cat) continue;
        // 计算关键词重叠率
        const overlap = keywords.filter(k => existing.keywords.includes(k)).length;
        const maxLen = Math.max(keywords.length, existing.keywords.length, 1);
        const similarity = overlap / maxLen;
        // 重叠率超过50%视为重复
        if (similarity > 0.5) {
          isDuplicate = true;
          break;
        }
      }

      if (!isDuplicate) {
        const key = deduped.length;
        seen.set(key, { category: cat, keywords });
        deduped.push(item);
        if (deduped.length >= limit) break;
      }
    }

    if (deduped.length === 0) return '记忆：没有什么特别的印象。';

    const lines = deduped.map(({ memory: m }) => {
      const timeAgo = this._timeAgo(m.timestamp);
      return `- [${m.category}] ${m.content} (${timeAgo})`;
    });

    return `记忆中的印象：\n${lines.join('\n')}`;
  }

  // ═══════════════════════════════════════════
  // 辅助方法
  // ═══════════════════════════════════════════

  /** @private */
  _touchMemory(memory) {
    memory.lastAccessed = new Date(this._simTime);
    memory.presentations.push(new Date(this._simTime));
    memory.accessCount++;
    memory.importance = Math.min(1, memory.importance + this._cfg.importanceBoostOnAccess);

    // R7 fix: cap presentations to prevent unbounded growth. Each Date object
    // costs ~60 bytes; at 2000 ticks with frequent retrieval, a single memory
    // can accumulate 1000+ presentations (60KB per memory). Cap at
    // cfg.maxPresentationsPerMemory (default 50), keeping the most recent ones
    // which are most relevant for ACT-R base-level activation.
    if (memory.presentations.length > this._cfg.maxPresentationsPerMemory) {
      memory.presentations = memory.presentations.slice(-this._cfg.maxPresentationsPerMemory);
    }
  }

  /** @private */
  _calculateImportance(event, emotionState) {
    let importance = 0.5;

    // 公共事件通常更重要
    if (event.scope === 'public') importance += 0.1;

    // 有人际交互的事件更重要
    if (event.participants && event.participants.length > 0) importance += 0.15;

    // 情绪越强烈越重要
    if (emotionState) {
      const arousal = emotionState.getArousal ? emotionState.getArousal() : 0.5;
      importance += arousal * 0.2;
    }

    return Math.min(1, Math.max(0.1, importance));
  }

  /** @private */
  _tagEmotion(emotionState) {
    if (!emotionState || !emotionState.getValence) return 'neutral';
    const valence = emotionState.getValence();
    if (valence > 0.1) return 'happy';
    if (valence < -0.05) return 'sad';
    return 'neutral';
  }

  /** @private */
  _snapshotEmotion(emotionState) {
    if (!emotionState || !emotionState.current) return {};
    const snap = {};
    const dominant = emotionState.getDominant ? emotionState.getDominant(10) : [];
    for (const { dimension, value } of dominant) {
      snap[dimension] = value;
    }
    return snap;
  }

  /**
   * 语义事件分类
   * 基于事件类型、内容和状态上下文的多级分类
   * @param {Object} event - 事件对象（可含 _region, _currentState 等上下文字段）
   * @returns {string} 语义分类标签
   * @private
   */
  _classifySemanticCategory(event) {
    const cats = this._semanticCategories;

    if (event.type && cats.typeMap[event.type]) {
      return cats.typeMap[event.type];
    }

    const content = (event.content || event.description || '').toLowerCase();
    if (content) {
      for (const [category, keywords] of Object.entries(cats.keywordMap)) {
        for (const kw of keywords) {
          if (content.includes(kw)) return category;
        }
      }
    }

    if (event._currentState) {
      const stateDef = this.domain.states[event._currentState];
      if (stateDef && stateDef.category && cats.stateCategoryMap[stateDef.category]) {
        return cats.stateCategoryMap[stateDef.category];
      }
    }

    return '日常琐事';
  }

  /**
   * 从转移字符串中提取目标状态名
   * @param {string} transition - 格式如 "在阅览处 → 在专注"
   * @returns {string|null} 目标状态名
   * @private
   */
  _stateFromTransition(transition) {
    if (!transition) return null;
    const parts = transition.split(/\s*[→→→]\s*/);
    if (parts.length >= 2) return parts[1].trim();
    return null;
  }

  /** @private */
  _countKeywordMatches(keyword) {
    let count = 0;
    for (const m of this.memories) {
      if (m.content.toLowerCase().includes(keyword.toLowerCase())) count++;
    }
    return Math.max(1, count);
  }

  /** @private */
  _memorySimilarity(a, b) {
    if (a.category !== b.category) return 0;

    let similarity = 0;
    let weights = 0;

    // 文本相似度（使用最长公共子序列比率，而非逐字符比较）
    if (a.content && b.content) {
      const shorter = Math.min(a.content.length, b.content.length);
      const longer = Math.max(a.content.length, b.content.length);
      if (longer === 0) return 0;

      // 前缀匹配（快速检查）
      let prefixMatch = 0;
      for (let i = 0; i < Math.min(shorter, 30); i++) {
        if (a.content[i] === b.content[i]) prefixMatch++;
        else break;
      }
      // 关键词重叠
      const wordsA = new Set(a.content.split(/[，。、！？\s]+/).filter(w => w.length > 1));
      const wordsB = new Set(b.content.split(/[，。、！？\s]+/).filter(w => w.length > 1));
      const intersection = [...wordsA].filter(w => wordsB.has(w)).length;
      const union = new Set([...wordsA, ...wordsB]).size;
      const wordOverlap = union > 0 ? intersection / union : 0;

      similarity += (prefixMatch / 30 * 0.3 + wordOverlap * 0.7) * 3;
      weights += 3;
    }

    // 情绪标签匹配
    if (a.emotionTag && b.emotionTag) {
      similarity += (a.emotionTag === b.emotionTag ? 1 : 0) * 1.5;
      weights += 1.5;
    }

    // 认知评价元数据匹配（如果有的话）
    if (a.appraisal && b.appraisal) {
      const apprA = a.appraisal;
      const apprB = b.appraisal;
      // 比较重要性和效价
      const importanceDiff = Math.abs((apprA.importance || 0) - (apprB.importance || 0));
      const valenceDiff = Math.abs((apprA.valence || 0) - (apprB.valence || 0));
      const appraisalSim = 1 - (importanceDiff + valenceDiff) / 2;
      similarity += appraisalSim * 1;
      weights += 1;
    }

    // 语义分类匹配
    if (a.semanticCategory && b.semanticCategory) {
      similarity += (a.semanticCategory === b.semanticCategory ? 1 : 0) * 1.0;
      weights += 1;
    }

    // 参与者匹配
    const assocA = new Set(a.associations || []);
    const assocB = new Set(b.associations || []);
    if (assocA.size > 0 && assocB.size > 0) {
      const assocIntersect = [...assocA].filter(x => assocB.has(x)).length;
      const assocUnion = new Set([...assocA, ...assocB]).size;
      similarity += (assocIntersect / assocUnion) * 1;
      weights += 1;
    }

    return weights > 0 ? similarity / weights : 0;
  }

  /** @private */
  _prune() {
    this.memories.sort((a, b) => b.importance - a.importance);
    this.memories = this.memories.slice(0, Math.floor(this._cfg.maxMemories * 0.8));
  }

  /** @private */
  _logisticNoise(scale) {
    const u = Math.max(0.001, Math.min(0.999, this._rng.next()));
    return scale * Math.log(u / (1 - u));
  }

  /** @private */
  _timeAgo(date) {
    const hours = (this._simTime - date.getTime()) / (1000 * 60 * 60);
    if (hours < 1) return '刚刚';
    if (hours < 24) return `${Math.floor(hours)}小时前`;
    const days = Math.floor(hours / 24);
    if (days < 7) return `${days}天前`;
    return `${Math.floor(days / 7)}周前`;
  }

  // ═══════════════════════════════════════════
  // 序列化
  // ═══════════════════════════════════════════

  toJSON() {
    const memories = this.memories.map(m => ({
      id: m.id,
      content: m.content,
      category: m.category,
      emotionTag: m.emotionTag,
      importance: m.importance,
      timestamp: m.timestamp.toISOString(),
      lastAccessed: m.lastAccessed.toISOString(),
      // W1: 完整持久化 presentations（此前 slice(-20) 截断破坏 restore fidelity，
      // _baseLevelActivation 遍历 presentations 计算，截断后 baseLevel 改变导致 L4 漂移）。
      // 未来若担心 payload 膨胀，另开压缩/摘要设计，当前不得用截断破坏 L4。
      presentations: m.presentations.map(t => t.toISOString()),
      accessCount: m.accessCount,
      associations: [...m.associations],
      eventId: m.eventId,
      // R12: spread-copy to prevent shared reference mutation
      emotionSnapshot: { ...m.emotionSnapshot },
      semanticCategory: m.semanticCategory || null,
      appraisal: m.appraisal ? { ...m.appraisal } : null,
    }));
    // R8 fix: include _nextMemId to prevent ID collision after prune+restore.
    // Previously only the memories array was serialized, so _nextMemId was
    // recomputed from surviving memories — which could be lower than the
    // pre-prune value, causing duplicate IDs on new memory creation.
    return { memories, _nextMemId: this._nextMemId };
  }

  /**
   * 从 toJSON 输出反序列化为 PersonalMemory 实例。
   * toJSON 只序列化 memories 数组；appraisalBiases 由 Agent 层单独序列化/恢复，故此处不处理。
   * 恢复路径中应传入真实 agentId / domain / rng；省略时用桩值，仅供 round-trip / 测试。
   * @param {Object} json - toJSON() 产出（memories 数组）
   * @param {string} [agentId] - 所属 Agent ID
   * @param {Object} [domain] - DomainRegistry 实例
   * @param {Object} [rng] - RNG 实例
   * @returns {PersonalMemory}
   */
  static fromJSON(json, agentId = 'restored', domain = null, rng = null, memoryConfig = null) {
    return new PersonalMemory(agentId, [], json, domain, rng, memoryConfig);
  }

  static mergeConfig(memoryConfig = null) {
    return mergeMemoryConfig(memoryConfig);
  }

  /**
   * 序列化 appraisalBiases（由 Agent.toJSON 调用）
   */
  biasesToJSON() {
    return this.appraisalBiases.map(b => ({
      ...b,
      createdAt: b.createdAt || this._simTime || 0,
    }));
  }
}

module.exports = PersonalMemory;
