/**
 * NeedsEmotionCoupler - 需求→情绪耦合
 *
 * 封装 Agent._applyNeedsToEmotion()。
 * 需求匮乏直接产生负面情绪效果。
 * 参考: Maslow (1943), Nolen-Hoeksema (1991), Hockey (2013)
 */
class NeedsEmotionCoupler {
  constructor(agent) {
    this.agent = agent;
  }

  /**
   * 执行需求→情绪耦合
   */
  tick() {
    this.agent._applyNeedsToEmotion();
  }
}

module.exports = NeedsEmotionCoupler;
