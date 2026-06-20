/**
 * Simulator — 向后兼容层
 *
 * Phase 9: 编排逻辑已移至 src/runtime/AndyWorld.step()。
 * 本文件保持向后兼容，Simulator.tick() 委托给 world.step()。
 *
 * 所有 require('./core/Simulator') 的代码无需修改。
 */

class Simulator {
  /**
   * @param {import('./World')} world - AndyWorld 实例（runtime 版本）
   */
  constructor(world) {
    this.world = world;
  }

  /**
   * 执行一个 tick — 委托给 world.step()
   * @returns {Object} tick 结果摘要
   */
  tick() {
    return this.world.step();
  }

  /**
   * 运行多个 tick
   * @param {number} count
   * @returns {Object[]}
   */
  runTicks(count) {
    const results = [];
    for (let i = 0; i < count; i++) {
      results.push(this.tick());
    }
    return results;
  }

  /**
   * 调度延迟事件 — 委托给 world
   * @param {Object} eventParams
   * @param {number} delayMs
   */
  scheduleEvent(eventParams, delayMs) {
    this.world.scheduleEvent(eventParams, delayMs);
  }

  /**
   * 注册 tick 回调 — 委托给 world
   * @param {Function} callback
   */
  onTick(callback) {
    this.world.onTick(callback);
  }

  /**
   * 获取性能统计 — 委托给 world
   */
  getStats() {
    return this.world.getStats();
  }

  /**
   * 构建 blended emotion cache（per-tick snapshot semantics）
   * 委托给 world 的同名方法
   * @private
   */
  _buildEmotionBlendCache() {
    return this.world._buildEmotionBlendCache();
  }

  /**
   * 收集社交传染输入
   * 委托给 world 的同名方法
   * @private
   */
  _gatherContagionInputs(agentId, agent, emotionBlendCache) {
    return this.world._gatherContagionInputs(agentId, agent, emotionBlendCache);
  }
}

module.exports = Simulator;
