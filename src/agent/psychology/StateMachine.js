/**
 * StateMachine — 状态定义 + 轻量状态追踪器
 *
 * 行为决策已迁移到 BehaviorField（连续行为空间 + 朗之万动力学）。
 * 本模块保留：
 *   - STATES 对象：状态元数据（被 BehaviorLabeler、PersonalMemory、StoryGenerator 等引用）
 *   - StateMachine 类：仅追踪 history 和 stateEnteredAt
 *     由 Agent._wireBehaviorFieldToStateMachine() 注入 getter
 */

const { getDefaultDomain } = require('../../domain/DomainRegistry');

function safeDate(value, fallback = new Date(0)) {
  if (value == null) return new Date(fallback.getTime());
  const date = value instanceof Date ? value : new Date(value);
  return Number.isFinite(date.getTime()) ? date : new Date(fallback.getTime());
}

// 向后兼容：默认 STATES（从 campus domain 取）
// 不在模块顶层调用 getDefaultDomain()——改为惰性求值，消除模块级硬绑定（Wave 3b-0）。

// ═══════════════════════════════════════════
// 轻量状态追踪器
// ═══════════════════════════════════════════
class StateMachine {
  /**
   * @param {string} [initialState] - 初始状态
   * @param {Object} [savedState] - 恢复状态
   * @param {Object} [domain] - DomainRegistry 实例
   */
 constructor(initialState = null, savedState = null, domain = null) {
    if (!domain) throw new Error('StateMachine requires a domain config');
    this.domain = domain;
    this._states = this.domain.states;

    if (savedState) {
      this.currentState = savedState.currentState;
      this.stateEnteredAt = safeDate(savedState.stateEnteredAt);
      this.history = [...(savedState.history || [])];
    } else {
      this.currentState = initialState || this.domain.fallback.defaultState;
      this.stateEnteredAt = new Date(0); // deterministic sentinel — simTime provided via tick()
      this.history = [];
    }
  }

  /**
   * 获取当前状态信息（只读，不触发转移）
   * @param {Date} [simTime]
   * @returns {{ state, category, elapsed, validTransitions }}
   */
  getInfo(simTime) {
    const def = this._states[this.currentState];
    const simMs = simTime instanceof Date ? simTime.getTime() : new Date(simTime).getTime();
    const enteredMs = this.stateEnteredAt.getTime();
    const rawElapsed = Number.isFinite(simMs) && Number.isFinite(enteredMs)
      ? (simMs - enteredMs) / (1000 * 60)
      : 0;
    const elapsed = Math.max(0, rawElapsed);
    return {
      state: this.currentState,
      category: def ? def.category : 'unknown',
      elapsed,
      validTransitions: def ? def.next : [],
    };
  }

  toJSON() {
    return {
      currentState: this.currentState,
      stateEnteredAt: this.stateEnteredAt.toISOString(),
      history: this.history.slice(-10),
    };
  }

  /**
   * 从 toJSON 输出反序列化为 StateMachine 实例。
   * @param {Object} json - toJSON() 产出
   * @param {Object} [domain] - DomainRegistry 实例
   * @returns {StateMachine}
   */
  static fromJSON(json, domain = null) {
    return new StateMachine(null, json, domain);
  }
}

module.exports = { StateMachine };

// STATES 惰性导出：首次访问时才调用 getDefaultDomain()，消除模块级硬绑定（Wave 3b-0）。
Object.defineProperty(module.exports, 'STATES', {
  enumerable: true,
  get() {
    return getDefaultDomain().states;
  },
});
