/**
 * Relationship - 社交关系模型
 *
 * 基于信任的社会关系模型 (Sutcliffe et al., 2012)
 *
 * 关系演化规则：
 *   - 初期（calculative mode）：关系强度线性增长
 *   - 后期（relational mode）：对数增长（收益递减）
 *   - 无交互时指数衰减
 *   - 情感纽带减缓衰减
 *
 * 关系层级（Dunbar 层级）：
 *   - 陌生人 (0-0.15)
 *   - 认识 (0.15-0.4)
 *   - 朋友 (0.4-0.7)
 *   - 亲密朋友 (0.7+)
 */

const { ANDY_DEFAULTS } = require('../config/defaults');
const cfg = ANDY_DEFAULTS.relationship;

class Relationship {
  /**
   * @param {string} agentA - Agent A 的 ID
   * @param {string} agentB - Agent B 的 ID
   * @param {Object} [savedState] - 恢复状态
   */
  constructor(agentA, agentB, savedState = null) {
    this.agentA = agentA;
    this.agentB = agentB;

    if (savedState) {
      this.type = savedState.type || 'stranger';
      this.strength = Number.isFinite(savedState.strength) ? savedState.strength : cfg.initialStrength;
      // R23 P0 fix: guard against undefined/null lastInteraction.
      // new Date(undefined) → Invalid Date → toISOString() crashes;
      // new Date(null) → epoch (1970) which silently corrupts recency.
      this.lastInteraction = (savedState.lastInteraction != null)
        ? new Date(savedState.lastInteraction)
        : new Date(0); // epoch sentinel: deterministic fallback, matches R84 pattern
      this._hoursSinceLastInteraction = savedState._hoursSinceLastInteraction || 0;
      this.interactionCount = savedState.interactionCount || 0;
      this._relationalInteractions = savedState._relationalInteractions || 0;
      this.impression = {
        positive: Number.isFinite(savedState.impression?.positive) ? savedState.impression.positive : 0,
        negative: Number.isFinite(savedState.impression?.negative) ? savedState.impression.negative : 0,
      };
      // R8 fix: restore history entries, converting time strings back to Date objects
      this.history = (savedState.history || []).slice(-20).map(entry => ({
        ...entry,
        time: entry.time instanceof Date ? entry.time : new Date(entry.time),
      }));
    } else {
      this.type = 'stranger';
      this.strength = cfg.initialStrength;
      this.lastInteraction = new Date(0); // epoch sentinel: deterministic fallback for new relationships
      this._hoursSinceLastInteraction = 0;
      this.interactionCount = 0;
      this._relationalInteractions = 0;
      this.impression = { positive: 0, negative: 0 };
      this.history = [];
    }
  }

  /**
   * 获取另一个 Agent 的 ID
   * @param {string} myId
   * @returns {string}
   */
  getOther(myId) {
    return myId === this.agentA ? this.agentB : this.agentA;
  }

  /**
   * 记录一次交互
   * @param {string} type - 交互类型 ('talk', 'help', 'conflict', 'ignore', ...)
   * @param {number} valence - 情感效价 (-1 到 +1)
   * @param {string} [content] - 交互内容描述
   * @param {Date} [simTime] - 模拟时间（不传则用真实时间，仅测试用）
   */
  recordInteraction(type, valence, content = '', simTime = null) {
    if (!Number.isFinite(valence)) return;
    this.interactionCount++;
    this.lastInteraction = simTime || new Date(0); // epoch sentinel: deterministic fallback
    this._hoursSinceLastInteraction = 0; // 重置自上次交互以来的小时数

    // R41 H3 fix: NaN guard BEFORE branching decision, not after.
    // NaN < 0.55 → false, routing strength to the relational growth branch,
    // where _relationalInteractions increments and NaN propagates further.
    if (!Number.isFinite(this.strength)) this.strength = cfg.initialStrength;

    // 计算关系强度变化
    // R5 修复：调整 calculative→relational 阈值从 0.4 到 0.55，
    // 使线性增长阶段更长，关系强度能突破 0.41 天花板到达 closeFriend 区间
    let delta;
    if (this.strength < 0.55) {
      // calculative mode: 线性增长（R5: 阈值从 0.4 提高到 0.55）
      delta = cfg.strengthIncrement * (1 + valence) * 0.6; // R5: 0.5→0.6 略增线性速度
    } else {
      // relational mode: 对数增长（收益递减）
      // 关键修复：使用 relationalInteractions（进入此模式后的交互次数）
      // 而非 interactionCount（全局），避免 calculative 阶段的交互拖累增长
      this._relationalInteractions++;
      const logFactor = Math.log2(this._relationalInteractions + 8); // R5: +4→+8 使初始增长更平滑
      delta = cfg.strengthIncrement * (1 + valence) * 0.5 / logFactor;

      // 深度交互奖励：高情感效价的交互比日常寒暄更有价值
      // |valence| > 0.5 的交互（深聊、冲突、帮助）增长加倍
      if (Math.abs(valence) > 0.5) {
        delta *= 1.0 + Math.abs(valence); // 最多 2x
      }
    }

    // 关系越接近上限，增长越慢（自然饱和曲线）
    // R5: 饱和阈值从 0.65 提高到 0.75，配合更长的线性阶段
    if (this.strength > 0.75) {
      delta *= Math.max(0.05, (1 - this.strength) * 3); // 保留最低 5% 增长
    }

    // 负面交互减少关系（受关系深度调节：越亲密的关系对冲突更有韧性）
    if (valence < 0) {
      const negativity = Math.abs(valence);
      // 基础惩罚
      let negDelta = -cfg.strengthDecrement * negativity;
      // 关系韧性：亲密关系对冲突有一定缓冲（修复：原先完全覆盖 delta，丢失关系深度信息）
      // 朋友间的争吵不会像陌生人之间的冲突那样破坏关系
      const resilience = Math.min(0.6, this.strength * 0.5);
      negDelta *= (1 - resilience);
      delta = negDelta;
    }

    // R41 H3 fix: NaN guard is now at the top of recordInteraction() (line 90).
    // The guard below was duplicated — kept for defense-in-depth if strength
    // was re-corrupted between the guard and here.
    if (!Number.isFinite(this.strength)) this.strength = cfg.initialStrength;
    this.strength = Math.max(0, Math.min(1, this.strength + delta));

    // 更新印象（R11: cap at 5.0 to prevent unbounded growth; bondStrength * 0.1
    // is clamped at 0.5 anyway, so values above 5.0 have no behavioral effect)
    if (valence > 0) {
      this.impression.positive = Math.min(this.impression.positive + valence, 5.0);
    } else {
      this.impression.negative = Math.min(this.impression.negative + Math.abs(valence), 5.0);
    }

    // 更新关系类型
    this._updateType();

    // 记录历史（上限 20 条，用于上下文注入的最近互动查询）
    this.history.push({
      type,
      valence,
      content,
      time: (simTime || new Date(0)).toISOString(), // epoch sentinel: deterministic fallback
      strengthAfter: this.strength,
    });
    if (this.history.length > 20) {
      this.history = this.history.slice(-20);
    }
  }

  /**
   * 推进关系衰减
   * @param {number} hoursElapsed - 自上次 tick 以来经过的模拟小时数
   */
  tick(hoursElapsed) {
    this._hoursSinceLastInteraction += hoursElapsed;

    // 情感纽带减缓衰减
    const impressionPositive = Number.isFinite(this.impression.positive) ? this.impression.positive : 0;
    const impressionNegative = Number.isFinite(this.impression.negative) ? this.impression.negative : 0;
    const bondStrength = Math.max(0, impressionPositive - impressionNegative);
    // R41 M4 fix: guard bondStrength against NaN before using in decay calculation.
    // If either impression is NaN, bondStrength is NaN → effectiveDecay is NaN →
    // decayFactor is NaN → this.strength becomes NaN via NaN multiplication.
    const safeBond = Number.isFinite(bondStrength) ? bondStrength : 0;
    let effectiveDecay = cfg.decayRate * (1 - Math.min(safeBond * 0.1, 0.5));

    // 关系冷却：长期不交互时衰减加速
    // 48小时无交互 → 1.5倍衰减
    // 168小时(7天)无交互 → 2.5倍衰减
    // 336小时(14天)无交互 → 4倍衰减
    if (this._hoursSinceLastInteraction > 336) {
      effectiveDecay *= 4;
    } else if (this._hoursSinceLastInteraction > 168) {
      effectiveDecay *= 2.5;
    } else if (this._hoursSinceLastInteraction > 48) {
      effectiveDecay *= 1.5;
    }

    // 指数衰减
    const decayFactor = Math.exp(-effectiveDecay * hoursElapsed);
    // R41 M4 fix: guard decayFactor against NaN before multiplication.
    // effectiveDecay can be NaN via bondStrength, and Math.exp(NaN) → NaN.
    const safeDecay = Number.isFinite(decayFactor) ? decayFactor : 1;
    if (!Number.isFinite(this.strength)) this.strength = cfg.initialStrength;
    this.strength = Math.max(0, this.strength * safeDecay);

    this._updateType();
  }

  /**
   * 更新关系类型标签
   * 升级使用正常阈值（直接跨越多级），降级使用滞后带防止震荡
   * @private
   */
  _updateType() {
    const t = cfg.threshold;
    // 滞后带：降级阈值比升级阈值低 0.08
    // R5: 从 0.05 增大到 0.08，减少 friend/acquaintance 边界的频繁振荡
    // 例：friend 升级阈值 0.4，降级阈值 0.32
    const hysteresis = 0.08;

    // 升级路径：直接根据强度确定最高可达层级（无逐级限制）
    if (this.strength >= t.closeFriend) {
      this.type = 'closeFriend';
      return;
    }
    if (this.strength >= t.friend) {
      // 当前是 closeFriend 但强度跌到 closeFriend 以下 → 需要滞后检查
      if (this.type === 'closeFriend' && this.strength >= t.closeFriend - hysteresis) {
        return; // 仍在滞后带内，维持 closeFriend
      }
      this.type = 'friend';
      return;
    }
    if (this.strength >= t.acquaintance) {
      if (this.type === 'friend' && this.strength >= t.friend - hysteresis) {
        return; // 滞后带内，维持 friend
      }
      this.type = 'acquaintance';
      return;
    }
    // 强度 < acquaintance
    if (this.type === 'acquaintance' && this.strength >= t.acquaintance - hysteresis) {
      return; // 滞后带内，维持 acquaintance
    }
    this.type = 'stranger';
  }

  /**
   * 是否值得交互（关系强度 + 时间的因素）
   * @returns {number} 交互意愿 (0-1)
   */
  getInteractionWillingness() {
    // 基础意愿 = 关系强度
    let willingness = this.strength;

    // 时间因素：太久没见会增加见面意愿（想念效应）
    const hoursSince = this._hoursSinceLastInteraction || 0;
    if (hoursSince > 24) {
      willingness += Math.min(0.2, hoursSince / 1000);
    }

    return Math.min(1, willingness);
  }

  /**
   * 序列化
   */
  toJSON() {
    return {
      agentA: this.agentA,
      agentB: this.agentB,
      type: this.type,
      strength: this.strength,
      lastInteraction: this.lastInteraction.toISOString(),
      _hoursSinceLastInteraction: this._hoursSinceLastInteraction,
      interactionCount: this.interactionCount,
      _relationalInteractions: this._relationalInteractions,
      impression: { ...this.impression },
      history: this.history.slice(-20).map(entry => ({
        ...entry,
        time: entry.time instanceof Date ? entry.time.toISOString() : entry.time,
      })),
    };
  }

  /**
   * 从 toJSON 输出反序列化为 Relationship 实例。
   * @param {Object} json - toJSON() 产出
   * @returns {Relationship}
   */
  static fromJSON(json) {
    return new Relationship(json.agentA, json.agentB, json);
  }
}

module.exports = Relationship;
