/**
 * ClaimSchema — v3 Claim 数据模型与 v2→v3 适配器
 *
 * 纯函数 schema 模块，不写入任何世界状态。
 * 职责：
 *   - 定义 v3 claim 的结构常量
 *   - 提供 createClaim 工厂 / translateV2Claim 翻译器 / normalize 规范化
 *   - isBlocking 辅助判断（与 v2 blockingClaims 语义等价）
 *
 * W1 工作包 — M1-W1 Claim Schema 模块
 */

// ─── Claim Types ─────────────────────────────────────────────────────────────

const ClaimTypes = Object.freeze({
  location: 'location',
  event: 'event',
  relationship: 'relationship',
  state: 'state',
  memory: 'memory',
  intention: 'intention',
  source_attribution: 'source_attribution',
  time: 'time',
  causal: 'causal',
  comparison: 'comparison',
  quote_or_report: 'quote_or_report',
});

// ─── Polarity ────────────────────────────────────────────────────────────────

const Polarity = Object.freeze({
  AFFIRMATIVE: 'affirmative',
  NEGATIVE: 'negative',
});

// ─── Modality ────────────────────────────────────────────────────────────────

const Modality = Object.freeze({
  CERTAIN: 'certain',
  UNCERTAIN: 'uncertain',
  HYPOTHETICAL: 'hypothetical',
  INFERRED: 'inferred',
  REPORTED: 'reported',
});

// ─── Default claim template ──────────────────────────────────────────────────

const DEFAULTS = Object.freeze({
  type: 'state',
  subject: null,
  predicate: null,
  object: null,
  relationType: null,
  polarity: Polarity.AFFIRMATIVE,
  modality: Modality.CERTAIN,
  source: null,
  span: null,
  evidence: [],
  dependencies: [],
  confidence: 0,
  evidenceRequirement: null,
  extractionMethod: 'manual',
});

// ─── 自增计数器 ──────────────────────────────────────────────────────────────

let _nextClaimIndex = 1;

/**
 * 生成下一个 claim id（claim_001 风格）。
 * @returns {string}
 */
function nextClaimId() {
  const id = `claim_${String(_nextClaimIndex).padStart(3, '0')}`;
  _nextClaimIndex++;
  return id;
}

// ─── v2 polarity → v3 polarity / modality ────────────────────────────────────

/**
 * 将 v2 polarity 映射为 v3 polarity + modality。
 *
 *   v2 'uncertain'   → polarity 'affirmative', modality 'uncertain'
 *   v2 'affirmative' → polarity 'affirmative', modality 'certain'
 *   v2 'negative'    → polarity 'negative', modality 'certain'
 *
 * @param {string} v2Polarity
 * @returns {{ polarity: string, modality: string }}
 */
function mapV2PolarityToV3(v2Polarity) {
  if (v2Polarity === 'uncertain') {
    return { polarity: Polarity.AFFIRMATIVE, modality: Modality.UNCERTAIN };
  }
  if (v2Polarity === 'negative') {
    return { polarity: Polarity.NEGATIVE, modality: Modality.CERTAIN };
  }
  // default: affirmative
  return { polarity: Polarity.AFFIRMATIVE, modality: Modality.CERTAIN };
}

// ─── subject / object 归一化 ─────────────────────────────────────────────────

/**
 * 将 v2 的原始 subject/object 字符串转换为 v3 的结构化形式。
 *
 * v3 subject/object 结构：
 *   { kind: 'agent' | 'location' | 'generic', id: string|null, raw: string }
 *
 * @param {string} value - v2 原始值
 * @param {string} selfId - 当前 agent id
 * @param {Object} agentNames - displayName → agentId 映射
 * @returns {{ kind: string, id: string|null, raw: string }}
 */
function normalizeEntity(value, selfId, agentNames) {
  if (value == null) {
    return { kind: 'generic', id: null, raw: String(value ?? '') };
  }

  const raw = String(value);

  // self → kind 'agent'
  if (raw === selfId) {
    return { kind: 'agent', id: selfId, raw };
  }

  // agentNames 查找
  if (agentNames && typeof agentNames === 'object') {
    for (const [id, name] of Object.entries(agentNames)) {
      if (name && name.toLowerCase() === raw.toLowerCase()) {
        return { kind: 'agent', id, raw };
      }
      if (id && id.toLowerCase() === raw.toLowerCase()) {
        return { kind: 'agent', id, raw };
      }
    }
  }

  // 无法解析 → 默认 kind 'agent'
  return { kind: 'agent', id: raw, raw };
}

/**
 * 将 v2 的 object 字段转换为 v3 的结构化形式。
 * object 可能是 location 或 generic entity。
 *
 * @param {string} value
 * @param {string} selfId
 * @param {Object} agentNames
 * @param {string} claimType - 上层 claim 类型，用于判断 object 是否为 location
 * @returns {{ kind: string, id: string|null, raw: string }}
 */
function normalizeObject(value, selfId, agentNames, claimType) {
  if (value == null) {
    return { kind: 'generic', id: null, raw: String(value ?? '') };
  }

  const raw = String(value);

  // 如果 claim 类型是 location 且 object 看起来像地点名，标记为 location
  if (claimType === 'location') {
    return { kind: 'location', id: raw, raw };
  }

  // 其他类型（event, state, time 等）的 object 视为 generic
  return { kind: 'generic', id: null, raw };
}

// ─── Factory ─────────────────────────────────────────────────────────────────

/**
 * 创建 v3 claim 对象。
 *
 * @param {Object} [partial] - 部分字段
 * @returns {Object} 完整的 v3 claim
 */
function createClaim(partial) {
  const merged = { ...DEFAULTS, ...partial };

  // 自动生成 id
  if (!merged.id) {
    merged.id = nextClaimId();
  }

  // 构建输出：仅包含已知 v3 字段，忽略未知 key
  return {
    id: merged.id,
    type: merged.type,
    subject: merged.subject,
    predicate: merged.predicate,
    object: merged.object,
    relationType: merged.relationType,
    polarity: merged.polarity,
    modality: merged.modality,
    source: merged.source,
    span: merged.span,
    evidence: merged.evidence || [],
    dependencies: merged.dependencies || [],
    confidence: merged.confidence,
    evidenceRequirement: merged.evidenceRequirement,
    extractionMethod: merged.extractionMethod,
  };
}

// ─── V2 → V3 Translator ──────────────────────────────────────────────────────

/**
 * 将 ClaimExtractor 输出的 v2 flat claim 翻译为 v3 schema。
 *
 * @param {Object} v2Claim - ClaimExtractor 输出的 claim 对象
 * @param {Object} options
 * @param {string} options.selfId - 当前 agent id
 * @param {Object} [options.agentNames] - displayName → agentId 映射
 * @param {number} [options.index] - 翻译索引（用于 id 生成）
 * @returns {Object} v3 claim
 */
function translateV2Claim(v2Claim, options = {}) {
  const { selfId, agentNames = {}, index = 0 } = options;

  // v2 polarity → v3 polarity + modality
  const { polarity, modality } = mapV2PolarityToV3(v2Claim.polarity);

  // subject 转换
  const subject = normalizeEntity(v2Claim.subject, selfId, agentNames);

  // object 转换：location 类型的 object 标记为 location kind
  const object = normalizeObject(v2Claim.object, selfId, agentNames, v2Claim.type);

  // source 映射
  let source = null;
  if (v2Claim.sourceMarker != null) {
    source = { kind: v2Claim.sourceMarker };
  }

  // span 映射
  let span = null;
  if (v2Claim.sourceSpan) {
    span = {
      start: v2Claim.sourceSpan.start,
      end: v2Claim.sourceSpan.end,
      raw: v2Claim.sourceSpan.raw || '',
    };
  }

  return createClaim({
    id: index > 0 ? `claim_${String(index).padStart(3, '0')}` : undefined,
    type: v2Claim.type || DEFAULTS.type,
    subject,
    predicate: v2Claim.predicate || null,
    object,
    relationType: v2Claim.relationType || null,
    polarity,
    modality,
    source,
    span,
    confidence: v2Claim.confidence || 0,
    evidenceRequirement: v2Claim.evidenceRequired || null,
    extractionMethod: 'v2-adapter',
  });
}

// ─── Blocking Check ──────────────────────────────────────────────────────────

/**
 * 判断 v3 claim 是否是 blocking claim。
 *
 * 与 v2 GroundingChecker 的 blockingClaims 分离逻辑等价：
 *   v2: confidence >= 0.65 && polarity !== 'uncertain'
 *   v3: confidence >= 0.65 && modality !== 'uncertain'
 *
 * @param {Object} claim - v3 claim 对象
 * @returns {boolean}
 */
function isBlocking(claim) {
  return (claim.confidence >= 0.65 && claim.modality !== 'uncertain');
}

// ─── Normalize ───────────────────────────────────────────────────────────────

/**
 * 确保 claim 所有必填字段存在，补默认值，返回新对象（不 mutate 输入）。
 *
 * @param {Object} claim
 * @returns {Object}
 */
function normalize(claim) {
  // 深拷贝避免 mutate 输入
  const copy = { ...claim };

  // 填充缺失字段
  for (const [key, defaultValue] of Object.entries(DEFAULTS)) {
    if (!(key in copy)) {
      if (Array.isArray(defaultValue)) {
        copy[key] = [];
      } else {
        copy[key] = defaultValue;
      }
    }
  }

  // 自动生成 id
  if (!copy.id) {
    copy.id = nextClaimId();
  }

  // 只输出已知 v3 字段（过滤掉未知 key）
  // id 不在 DEFAULTS 中，需要单独加入
  const knownKeys = Object.keys(DEFAULTS);
  const result = { id: copy.id };
  for (const key of knownKeys) {
    result[key] = copy[key];
  }

  return result;
}

// ─── Exports ─────────────────────────────────────────────────────────────────

module.exports = {
  ClaimTypes,
  Polarity,
  Modality,
  createClaim,
  translateV2Claim,
  isBlocking,
  normalize,
};
