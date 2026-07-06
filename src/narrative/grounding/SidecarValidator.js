/**
 * SidecarValidator — 解析、校验、normalize LLM 输出的结构化 claim sidecar
 *
 * 职责：
 *   - 把 LLM 输出的可选结构化 claim sidecar 解析成 v3 schema claims 数组
 *   - 每条 malformed claim → 丢弃 + 产出 violation 报告
 *   - 整体 malformed → 返回空 claims + 报告
 *   - 绝不信任 sidecar 内容；绝不抛未捕获异常
 *
 * 红线规则（对应 plan §3 Non-Goals + v3 红线）：
 *   - sidecar 中 type==='event' && predicate==='did' 的 claim（新事件创建）
 *     保留但标记 extractionMethod:'sidecar-mistrusted' 并产出 untrusted_new_event issue。
 *   - sidecar 中 type==='relationship' 的 claim（关系变化）
 *     保留但标记 extractionMethod:'sidecar-mistrusted' 并产出 untrusted_new_relationship issue。
 *   - 这些 mistrusted claims 进 checker 后会被 v2 策略拒绝。
 *   - 核心：sidecar claim 永远不能绕过 EvidenceBinder/Policy 直接 pass。
 *
 * W2 工作包 — M2-W2 Sidecar Validator 模块
 */

const { ClaimTypes, Polarity, Modality, createClaim } = require('./ClaimSchema');

// ─── 已知 modality 集合 ──────────────────────────────────────────────────────

const KNOWN_MODALITIES = new Set([
  Modality.CERTAIN,
  Modality.UNCERTAIN,
  Modality.HYPOTHETICAL,
  Modality.INFERRED,
  Modality.REPORTED,
]);

// ─── 不可信 claim 类型（红线）────────────────────────────────────────────────

const UNTRUSTED_EVENT_PREDICATE = 'did';

// ─── 辅助函数 ────────────────────────────────────────────────────────────────

/**
 * 解析 subject：string → agentNames/selfId 查找 → {kind, id, raw}
 *
 * @private
 */
function _resolveSubject(subject, selfId, agentNames) {
  // 已经是 {kind, id, raw} 结构
  if (typeof subject === 'object' && subject !== null) {
    if (subject.id == null && subject.raw == null) {
      return null;
    }
    return {
      kind: subject.kind || 'agent',
      id: subject.id || null,
      raw: subject.raw || String(subject.id || ''),
    };
  }

  // string 形式
  if (typeof subject !== 'string') {
    return null;
  }

  const raw = subject.trim();
  if (raw === '') {
    return null;
  }

  // selfId 匹配
  if (raw === selfId) {
    return { kind: 'agent', id: selfId, raw };
  }

  // agentNames 查找（displayName → agentId）
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

  // 无法解析 → 仍作为 agent 保留，用 raw 作为 id
  return { kind: 'agent', id: raw, raw };
}

/**
 * 解析 object：根据 claim type 决定 kind
 *
 * @private
 */
function _resolveObject(obj, claimType) {
  if (obj == null) {
    return { kind: 'generic', id: null, raw: '' };
  }

  // 已经是 {kind, id, raw} 结构
  if (typeof obj === 'object' && obj !== null) {
    return {
      kind: obj.kind || 'generic',
      id: obj.id || null,
      raw: obj.raw || String(obj.id || ''),
    };
  }

  // string 形式
  if (typeof obj !== 'string') {
    return { kind: 'generic', id: null, raw: String(obj) };
  }

  const raw = obj;

  // location 类型 → object 是 location
  if (claimType === 'location') {
    return { kind: 'location', id: raw, raw };
  }

  // 其他类型 → generic
  return { kind: 'generic', id: null, raw };
}

/**
 * 解析 span：string → {start, end, raw}；object → 直接使用
 *
 * @private
 */
function _resolveSpan(span) {
  if (span == null) {
    return null;
  }

  if (typeof span === 'string') {
    return { start: null, end: null, raw: span };
  }

  if (typeof span === 'object' && !Array.isArray(span)) {
    return {
      start: span.start || null,
      end: span.end || null,
      raw: span.raw || '',
    };
  }

  return null;
}

/**
 * 根据 claim type/predicate/source 推断 evidenceRequirement
 *
 * @private
 */
function _inferEvidenceRequirement(type, source) {
  switch (type) {
    case 'location':
      return 'observed';
    case 'event':
      return 'any';
    case 'relationship':
      return 'any';
    case 'state':
      return 'observed';
    case 'source_attribution':
      return 'self';
    case 'time':
      return 'any';
    case 'memory':
      return 'self';
    case 'causal':
      return 'any';
    case 'comparison':
      return 'any';
    case 'quote_or_report':
      return 'self';
    default:
      return null;
  }
}

/**
 * 验证并 normalize 单条 sidecar claim。
 * 返回 normalize 后的 v3 claim 或 null（被丢弃时）。
 *
 * @private
 */
function _validateSingleClaim(rawClaim, index, issues, selfId, agentNames) {
  // 检查 rawClaim 本身是对象
  if (rawClaim == null || typeof rawClaim !== 'object' || Array.isArray(rawClaim)) {
    issues.push({
      kind: 'malformed',
      claimIndex: index,
      raw: rawClaim,
      message: 'Claim at index ' + index + ' is not an object',
    });
    return null;
  }

  // ── 规则 1: 类型已知 ──────────────────────────────────────────────────────

  const type = rawClaim.type;
  if (type == null || !(type in ClaimTypes)) {
    issues.push({
      kind: 'unknown_type',
      claimIndex: index,
      raw: rawClaim,
      message: 'Unknown claim type: ' + String(type) + ' (index ' + index + ')',
    });
    return null;
  }

  // ── 规则 2: 必填字段 ──────────────────────────────────────────────────────

  const subject = rawClaim.subject;
  const predicate = rawClaim.predicate;

  if (subject == null) {
    issues.push({
      kind: 'missing_field',
      claimIndex: index,
      raw: rawClaim,
      message: 'Missing required field: subject (index ' + index + ')',
    });
    return null;
  }

  if (typeof subject !== 'string' && typeof subject !== 'object') {
    issues.push({
      kind: 'invalid_subject',
      claimIndex: index,
      raw: rawClaim,
      message: 'Subject is not a string or object: ' + typeof subject + ' (index ' + index + ')',
    });
    return null;
  }

  if (typeof subject === 'string' && subject.trim() === '') {
    issues.push({
      kind: 'invalid_subject',
      claimIndex: index,
      raw: rawClaim,
      message: 'Subject is empty string (index ' + index + ')',
    });
    return null;
  }

  if (predicate == null || typeof predicate !== 'string') {
    issues.push({
      kind: 'missing_field',
      claimIndex: index,
      raw: rawClaim,
      message: 'Missing required field: predicate (index ' + index + ')',
    });
    return null;
  }

  // ── 规则 3: subject 解析 ──────────────────────────────────────────────────

  const resolvedSubject = _resolveSubject(subject, selfId, agentNames);

  if (resolvedSubject === null) {
    issues.push({
      kind: 'invalid_subject',
      claimIndex: index,
      raw: rawClaim,
      message: 'Subject is invalid (index ' + index + ')',
    });
    return null;
  }

  // ── 规则 4: object 解析 ───────────────────────────────────────────────────

  const resolvedObject = _resolveObject(rawClaim.object, type);

  // ── 规则 5: modality ──────────────────────────────────────────────────────

  let modality = Modality.CERTAIN; // 默认
  if (rawClaim.modality != null) {
    if (KNOWN_MODALITIES.has(rawClaim.modality)) {
      modality = rawClaim.modality;
    } else {
      issues.push({
        kind: 'invalid_modality',
        claimIndex: index,
        raw: rawClaim,
        message: 'Invalid modality: ' + String(rawClaim.modality) + ' (index ' + index + '), defaulting to certain',
      });
    }
  }

  // 若 source.kind 是 'told' 或 'reported'，modality 默认为 'reported'
  if (rawClaim.source && rawClaim.source.kind && (rawClaim.source.kind === 'told' || rawClaim.source.kind === 'reported')) {
    if (rawClaim.modality == null) {
      modality = Modality.REPORTED;
    }
  }

  // ── 规则 6: polarity ──────────────────────────────────────────────────────

  let polarity = Polarity.AFFIRMATIVE; // 默认
  if (rawClaim.polarity != null) {
    if (rawClaim.polarity === Polarity.AFFIRMATIVE || rawClaim.polarity === Polarity.NEGATIVE) {
      polarity = rawClaim.polarity;
    }
    // 非法 polarity 忽略，用默认
  }

  // ── 规则 7: source ────────────────────────────────────────────────────────

  const source = (rawClaim.source && typeof rawClaim.source === 'object') ? rawClaim.source : null;

  // ── 规则 7: span ──────────────────────────────────────────────────────────

  const span = _resolveSpan(rawClaim.span);

  // ── 规则 7: confidence ────────────────────────────────────────────────────

  let confidence = 0.9; // sidecar 显式结构化，默认 0.9

  // ── 规则 7: evidenceRequirement ───────────────────────────────────────────

  const evidenceRequirement = _inferEvidenceRequirement(type, source);

  // ── 规则 6: 红线检测 ──────────────────────────────────────────────────────

  const isUntrustedEvent = (type === 'event' && predicate === UNTRUSTED_EVENT_PREDICATE);
  const isUntrustedRelationship = (type === 'relationship');

  if (isUntrustedEvent) {
    issues.push({
      kind: 'untrusted_new_event',
      claimIndex: index,
      raw: rawClaim,
      message: 'New event claim (type=event, predicate=did) from sidecar is untrusted; kept but flagged for rejection by policy',
    });
    confidence = 0.5;
  }

  if (isUntrustedRelationship) {
    issues.push({
      kind: 'untrusted_new_relationship',
      claimIndex: index,
      raw: rawClaim,
      message: 'Relationship claim from sidecar is untrusted; kept but flagged for rejection by policy',
    });
    confidence = 0.5;
  }

  // ── 构建 v3 claim ─────────────────────────────────────────────────────────

  const extractionMethod = (isUntrustedEvent || isUntrustedRelationship)
    ? 'sidecar-mistrusted'
    : 'sidecar';

  // 忽略 sidecar 中的 confidence/evidence/bindings/dependencies 字段
  // 这些由 EvidenceBinder/checker 决定

  const v3Claim = createClaim({
    type,
    subject: resolvedSubject,
    predicate,
    object: resolvedObject,
    polarity,
    modality,
    source,
    span,
    confidence,
    evidenceRequirement,
    extractionMethod,
    dependencies: [],
  });

  return v3Claim;
}

// ─── SidecarValidator 类 ─────────────────────────────────────────────────────

/**
 * SidecarValidator — 验证并 normalize sidecar 输入。
 *
 * @class
 */
class SidecarValidator {
  /**
   * @param {Object} [options]
   * @param {Object} [options.agentNames] - displayName → agentId 映射
   * @param {string} [options.selfId] - 当前 agent id
   */
  constructor(options = {}) {
    this.agentNames = options.agentNames || {};
    this.selfId = options.selfId || null;
  }

  /**
   * 验证 sidecar 输入，返回 normalize 后的 v3 claims + issues。
   *
   * 入参可以是：
   *   - 对象 { text, claims }
   *   - 对象 { claims }
   *   - 裸 claims 数组
   *   - stringified JSON
   *
   * @param {*} sidecarInput
   * @returns {{ claims: Array<Object>, issues: Array<Object> }}
   */
  validate(sidecarInput) {
    const issues = [];
    let parsedClaims = null;

    // ── Step 1: 解析输入 ──────────────────────────────────────────────────────

    // 尝试 JSON 字符串解析
    if (typeof sidecarInput === 'string') {
      try {
        sidecarInput = JSON.parse(sidecarInput);
      } catch (e) {
        issues.push({
          kind: 'malformed',
          message: 'Invalid JSON string: ' + (e.message || String(e)),
        });
        return { claims: [], issues };
      }
    }

    // 检查基本类型
    if (sidecarInput == null || typeof sidecarInput !== 'object') {
      issues.push({
        kind: 'malformed',
        message: 'Expected an object { text?, claims } or array, got: ' + String(sidecarInput),
      });
      return { claims: [], issues };
    }

    // 裸 claims 数组（包括空数组）— 允许
    if (Array.isArray(sidecarInput)) {
      parsedClaims = sidecarInput;
    } else if (Array.isArray(sidecarInput.claims)) {
      parsedClaims = sidecarInput.claims;
    } else {
      issues.push({
        kind: 'malformed',
        message: 'Expected { claims: [...] } or array, got: ' + JSON.stringify(sidecarInput).slice(0, 200),
      });
      return { claims: [], issues };
    }

    // claims 必须是数组
    if (!Array.isArray(parsedClaims)) {
      issues.push({
        kind: 'malformed',
        message: 'claims field is not an array',
      });
      return { claims: [], issues };
    }

    // ── Step 2: 逐条验证 & normalize ──────────────────────────────────────────

    const results = [];

    for (let i = 0; i < parsedClaims.length; i++) {
      const rawClaim = parsedClaims[i];
      const result = _validateSingleClaim(
        rawClaim, i, issues,
        this.selfId, this.agentNames,
      );
      if (result) {
        results.push(result);
      }
    }

    return { claims: results, issues };
  }
}

// ─── 工厂函数 ────────────────────────────────────────────────────────────────

/**
 * 便捷构造 SidecarValidator。
 *
 * @param {Object} [agentNames] - displayName → agentId 映射
 * @param {string} [selfId] - 当前 agent id
 * @returns {SidecarValidator}
 */
function createSidecarValidator(agentNames, selfId) {
  return new SidecarValidator({ agentNames, selfId });
}

// ─── Exports ─────────────────────────────────────────────────────────────────

module.exports = {
  SidecarValidator,
  createSidecarValidator,
};
