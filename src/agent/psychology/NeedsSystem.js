/**
 * Psychology re-export: NeedsSystem
 * 从 agent/NeedsSystem.js 重新导出，供 src/agent/ 内部使用。
 */
module.exports = process.env.ANDY_USE_NATIVE === '1'
  ? require('../../../agent/NeedsSystem.native')
  : require('../../../agent/NeedsSystem');
