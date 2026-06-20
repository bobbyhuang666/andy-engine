/**
 * NeedPressure — 需求压力层
 *
 * 纯函数/只读模块，从 agent needs 快照计算需求匮乏压力。
 * 需求值范围 [0,1]，1=满足，0=极度匮乏。
 * 压力 = 1 - 需求值（匮乏越大，压力越大）。
 */

const DEFAULT_NEED_KEYS = ['hunger', 'energy', 'social', 'comfort', 'stimulation'];

class NeedPressure {
  /**
   * @param {Object} agentSnapshot - agent 状态快照（只读）
   * @param {Object} agentSnapshot.needs - needs 对象 { hunger, energy, social, ... }
   * @param {string[]} [needKeys] - 要计算的需求键名列表
   * @returns {Object} pressure - { hunger, energy, social, comfort, stimulation, total }
   */
  static compute(agentSnapshot, needKeys = DEFAULT_NEED_KEYS) {
    if (!agentSnapshot || !agentSnapshot.needs) {
      return NeedPressure._empty();
    }

    const needs = agentSnapshot.needs;
    const pressure = {};
    let sum = 0;
    let count = 0;

    for (const key of needKeys) {
      const value = needs[key];
      if (typeof value === 'number') {
        const p = Math.max(0, Math.min(1, 1 - value));
        pressure[key] = p;
        sum += p;
        count++;
      } else {
        pressure[key] = 0;
      }
    }

    pressure.total = count > 0 ? sum / count : 0;

    return pressure;
  }

  /**
   * 计算最匮乏的需求及其压力值
   * @param {Object} agentSnapshot
   * @param {string[]} [needKeys]
   * @returns {{ key: string, pressure: number } | null}
   */
  static computeMostDeficient(agentSnapshot, needKeys = DEFAULT_NEED_KEYS) {
    if (!agentSnapshot || !agentSnapshot.needs) return null;

    const needs = agentSnapshot.needs;
    let maxKey = null;
    let maxPressure = -1;

    for (const key of needKeys) {
      const value = needs[key];
      if (typeof value === 'number') {
        const p = 1 - value;
        if (p > maxPressure) {
          maxPressure = p;
          maxKey = key;
        }
      }
    }

    return maxKey ? { key: maxKey, pressure: maxPressure } : null;
  }

  static _empty() {
    const pressure = { total: 0 };
    for (const key of DEFAULT_NEED_KEYS) {
      pressure[key] = 0;
    }
    return pressure;
  }
}

module.exports = { NeedPressure };
