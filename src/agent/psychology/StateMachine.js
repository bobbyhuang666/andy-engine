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

// 向后兼容：默认 STATES（从 campus domain 取）
const defaultDomain = getDefaultDomain();
const STATES = defaultDomain.states;

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
    this.domain = domain || defaultDomain;
    this._states = this.domain.states;

    if (savedState) {
      this.currentState = savedState.currentState;
      this.stateEnteredAt = new Date(savedState.stateEnteredAt);
      this.history = savedState.history || [];
    } else {
      this.currentState = initialState || this.domain.fallback.defaultState;
      this.stateEnteredAt = new Date();
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
    const elapsed = simTime
      ? Math.max(0, (simTime - this.stateEnteredAt) / (1000 * 60))
      : 0;
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
}

module.exports = { StateMachine, STATES };
