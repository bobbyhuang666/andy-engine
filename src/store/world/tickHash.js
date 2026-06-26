/**
 * tickHash — per-tick world state hash (REPLAY_TRUST_ROADMAP §6)
 *
 * 把 world state 规范化为 canonical JSON 后 sha256，用于回放一致性比对。
 * 设计为纯函数：不读文件系统，不依赖 sim 运行时状态，便于 replay-diff 复用。
 *
 * 三条规定（REPLAY_TRUST §6）：
 *   1. canonical JSON：递归 key sort + 无空格
 *   2. 浮点量化：number 按 Math.round(x * 1e9) / 1e9（9 位小数）
 *   3. 字段过滤：仅 hash 规范字段，排除 _meta/narrative/墙上时间戳/rngState
 *
 * 注意：rngState 不进 tickHash（单独验证，避免语义混淆）。
 */

const crypto = require('crypto');

// 参与 hash 的规范字段（worldState 顶层 key）
const HASHED_FIELDS = [
  'worldClock',
  'characters',
  'relationships',
  'canonFacts',
  'positions',
];

// 量化精度（1e9 = 9 位小数，审计 Q2 裁定合适）
const QUANT = 1e9;

/**
 * 递归 canonical 化：对象 key 排序 + 数值量化
 * @param {*} value - 任意 JSON 可序列化值
 * @returns {*} canonical 化后的值
 */
function canonicalize(value) {
  if (value === null) return null;
  if (Array.isArray(value)) {
    return value.map(canonicalize);
  }
  if (typeof value === 'object') {
    const sortedKeys = Object.keys(value).sort();
    const out = {};
    for (const k of sortedKeys) {
      out[k] = canonicalize(value[k]);
    }
    return out;
  }
  if (typeof value === 'number') {
    return Number.isFinite(value) ? Math.round(value * QUANT) / QUANT : String(value);
  }
  return value;
}

/**
 * 从 worldState 提取参与 hash 的规范字段
 * @param {Object} worldState - Stable Envelope world state
 * @returns {Object} 仅含规范字段的对象
 */
function extractHashedFields(worldState) {
  if (!worldState || typeof worldState !== 'object') return {};
  const out = {};
  for (const field of HASHED_FIELDS) {
    if (field in worldState) {
      out[field] = worldState[field];
    }
  }
  return out;
}

/**
 * 计算 worldState 的 tickHash
 * @param {Object} worldState - Stable Envelope world state（含或不含 _meta 均可）
 * @param {number} [tick] - tick 序号（仅写入返回值，不参与 hash 内容）
 * @returns {{ tick: number|null, hash: string }} sha256 hex
 */
function computeTickHash(worldState, tick = null) {
  const hashedFields = extractHashedFields(worldState);
  const canonical = canonicalize(hashedFields);
  const canonicalStr = JSON.stringify(canonical);
  const hash = crypto.createHash('sha256').update(canonicalStr).digest('hex');
  return { tick: tick, hash };
}

/**
 * 计算 hash 序列：对一组 worldState（按 tick 排序）逐个 hash
 * @param {Array<{ tick: number, worldState: Object }>} ticks - tick 序列
 * @returns {Array<{ tick: number, hash: string }>}
 */
function computeTickHashSeries(ticks) {
  if (!Array.isArray(ticks)) return [];
  return ticks
    .slice()
    .sort((a, b) => a.tick - b.tick)
    .map(t => computeTickHash(t.worldState, t.tick));
}

module.exports = {
  computeTickHash,
  computeTickHashSeries,
  canonicalize,
  extractHashedFields,
  HASHED_FIELDS,
  QUANT,
};
