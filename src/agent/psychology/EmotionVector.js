/**
 * Psychology re-export: EmotionVector
 * 从 agent/EmotionVector.js 重新导出，供 src/agent/ 内部使用。
 */
module.exports = process.env.ANDY_USE_NATIVE === '1'
  ? require('../../../agent/EmotionVector.native')
  : require('../../../agent/EmotionVector');
