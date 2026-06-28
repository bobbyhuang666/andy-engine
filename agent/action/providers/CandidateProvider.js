/**
 * CandidateProvider — 候选提供者基类
 *
 * 所有候选提供者继承此类。
 * 只生产候选，不修改状态，不选择行为。
 */

class CandidateProvider {
  constructor(name) {
    this.name = name;
  }

  /**
   * 生成候选列表
   * @param {Object} context - 行为上下文
   * @returns {Object[]} ActionCandidate 列表
   */
  generate(context) {
    return [];
  }
}

module.exports = { CandidateProvider };
