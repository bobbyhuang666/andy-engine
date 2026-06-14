/**
 * CandidateProvider — 基类
 *
 * 纯接口，所有 provider 继承。
 * generate(context) -> ActionCandidate[]
 */

class CandidateProvider {
  constructor(name) {
    this.name = name;
  }

  /**
   * 生成候选列表（纯函数，不修改 context）
   * @param {Object} context - 评分上下文快照
   * @returns {Object[]} ActionCandidate[]
   */
  generate(context) {
    throw new Error(`${this.name}.generate() not implemented`);
  }
}

module.exports = { CandidateProvider };
