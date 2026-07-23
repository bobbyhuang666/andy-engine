/**
 * CoreferenceResolver — v3 代词解析模块（M3-R1）
 *
 * 职责：
 *   - 对一批 claim 做保守、确定性代词解析
 *   - 识别 subject 为代词且未绑定的 claim，在同句范围（同 sourceSpan 或紧邻前文 N 字符内）
 *     尝试绑定到已解析的显式命名 agent claim
 *   - 歧义时标 coreference_ambiguous，绝不让歧义代词让 claim 变 pass
 *
 * 红线：
 *   - 绝不跨长上下文解析代词（K=40 字符上限）
 *   - 绝不 mutate 输入
 *   - 不写事实存储 / 知识存储
 *   - 不改 evidence bindings（那是 EvidenceBinder 的事）
 *   - CommonJS require + JSDoc，与 src/narrative/grounding/ 现有风格一致
 *
 * Coreference resolution for the structured grounding pipeline.
 */

'use strict';

// ─── 中文代词表（与 ClaimExtractor PRONOUN_WORDS 一致或超集）────────────────────

const PRONOUNS_ZH = Object.freeze([
  '他', '她', '它',
  '你', '你们',
  '他们', '她们', '它们',
  '咱', '咱们',
]);

// ─── 第三人称复数（群体代词，永远 ambiguous）───────────────────────────────────

const PLURAL_PRONOUNS_ZH = Object.freeze(['他们', '她们', '它们', '咱们', '咱']);

// ─── 第二人称代词──────────────────────────────────────────────────────────────

const SECOND_PERSON_PRONOUNS = Object.freeze(['你', '你们']);

// ─── 同句搜索窗口（字符数）────────────────────────────────────────────────────

const SENTENCE_WINDOW_K = 40;

// ─── ResolveNote 类型──────────────────────────────────────────────────────────

/**
 * @typedef {Object} ResolveNote
 * @property {string} claimId - claim id
 * @property {'resolved_to'|'coreference_ambiguous'|'no_resolver'|'sidecar_bound'} kind
 * @property {string} [reason] - 简短说明
 * @property {string} [resolvedTo] - 解析到的 agentId
 * @property {string[]} [ambiguousCandidates] - 歧义候选 agentId 列表
 */

// ─── 辅助：检查 raw 是否是代词─────────────────────────────────────────────────

/**
 * @param {string} raw
 * @returns {boolean}
 */
function isPronoun(raw) {
  if (!raw || typeof raw !== 'string') return false;
  return PRONOUNS_ZH.includes(raw);
}

/**
 * 检查 raw 是否是第三人称复数代词
 * @param {string} raw
 * @returns {boolean}
 */
function isPluralPronoun(raw) {
  if (!raw || typeof raw !== 'string') return false;
  return PLURAL_PRONOUNS_ZH.includes(raw);
}

/**
 * 检查 raw 是否是第二人称代词
 * @param {string} raw
 * @returns {boolean}
 */
function isSecondPerson(raw) {
  if (!raw || typeof raw !== 'string') return false;
  return SECOND_PERSON_PRONOUNS.includes(raw);
}

// ─── 辅助：从 claim 提取 subject raw───────────────────────────────────────────

/**
 * 从 claim.subject 提取 raw string。
 * subject 可能是 string（v2 风格）或 {kind, id, raw}（v3 风格）。
 * @param {Object} claim
 * @returns {string|null}
 */
function getSubjectRaw(claim) {
  if (!claim.subject) return null;
  if (typeof claim.subject === 'string') return claim.subject;
  if (typeof claim.subject === 'object' && claim.subject.raw) return claim.subject.raw;
  return null;
}

/**
 * 从 claim.subject 提取 id。
 * @param {Object} claim
 * @returns {string|null}
 */
function getSubjectId(claim) {
  if (!claim.subject) return null;
  if (typeof claim.subject === 'string') return null; // v2 string 风格，id 为空
  if (typeof claim.subject === 'object') return claim.subject.id || null;
  return null;
}

/**
 * 判断 subject 是否已经解析到具体 agentId。
 * 已解析：id 非空且 id !== raw（即 id 是一个实际 agentId，不是 raw 本身）
 * @param {Object} claim
 * @returns {boolean}
 */
function isAlreadyResolved(claim) {
  const sid = getSubjectId(claim);
  const raw = getSubjectRaw(claim);
  if (sid == null) return false;
  if (raw && sid === raw) return false; // id === raw 表示未绑到具体 agent
  return true;
}

/**
 * 判断 claim 的 subject 是否是代词且未绑定
 * @param {Object} claim
 * @returns {boolean}
 */
function needsResolution(claim) {
  const raw = getSubjectRaw(claim);
  if (!raw) return false;
  if (!isPronoun(raw)) return false;
  if (isAlreadyResolved(claim)) return false;
  return true;
}

// ─── 辅助：深拷贝 claim────────────────────────────────────────────────────────

/**
 * 浅拷贝 claim（不 mutate 输入），subject/object 也拷贝一层
 * 对于 v2 风格（subject 是 string），转为 {kind, id, raw} 对象
 * @param {Object} claim
 * @param {Object} [agentNames] - id → displayName 映射，用于反查 v2 string subject
 * @returns {Object}
 */
function cloneClaim(claim, agentNames) {
  const copy = { ...claim };
  // v2 → v3 subject 兼容：string subject → {kind, id, raw}
  if (copy.subject && typeof copy.subject === 'string') {
    const raw = copy.subject;
    let resolvedId = null;
    // 尝试从 agentNames 反查
    if (agentNames) {
      resolvedId = lookupAgentId(agentNames, raw);
    }
    copy.subject = { kind: 'agent', id: resolvedId, raw };
  }
  if (copy.subject && typeof copy.subject === 'object') {
    copy.subject = { ...copy.subject };
  }
  if (copy.object && typeof copy.object === 'object') {
    copy.object = { ...copy.object };
  }
  if (copy.source && typeof copy.source === 'object') {
    copy.source = { ...copy.source };
  }
  if (copy.span && typeof copy.span === 'object') {
    copy.span = { ...copy.span };
  }
  if (Array.isArray(copy.evidence)) {
    copy.evidence = [...copy.evidence];
  }
  if (Array.isArray(copy.dependencies)) {
    copy.dependencies = [...copy.dependencies];
  }
  return copy;
}

// ─── 辅助：从 agentNames 反查 displayName → agentId────────────────────────────

/**
 * @param {Object} agentNames - id → displayName 映射（如 {bob: '鲍勃'}）
 * @param {string} displayName
 * @returns {string|null}
 */
function lookupAgentId(agentNames, displayName) {
  if (!agentNames || typeof agentNames !== 'object') return null;
  const lower = displayName.toLowerCase();
  for (const [id, name] of Object.entries(agentNames)) {
    if (name && name.toLowerCase() === lower) return id;
  }
  return null;
}

// ─── 辅助：claim 的 span 起始位置───────────────────────────────────────────────

/**
 * 获取 claim 对应的 sourceSpan.start 用于距离计算。
 * @param {Object} claim
 * @returns {number}
 */
function getSpanStart(claim) {
  if (claim.span && typeof claim.span === 'object' && claim.span.start != null) {
    return claim.span.start;
  }
  return 0;
}

/**
 * 获取 claim 对应的 sourceSpan.raw 用于距离计算
 * @param {Object} claim
 * @returns {string}
 */
function getSpanRaw(claim) {
  if (claim.span && typeof claim.span === 'object' && claim.span.raw) {
    return claim.span.raw;
  }
  return '';
}

// ══════════════════════════════════════════════════════════════════════════════
// CoreferenceResolver 类
// ══════════════════════════════════════════════════════════════════════════════

/**
 * CoreferenceResolver — 保守代词解析器
 *
 * @class
 */
class CoreferenceResolver {
  /**
   * @param {Object} [options]
   * @param {Object} [options.agentNames] - id → displayName 映射（如 {bob: '鲍勃'}）
   * @param {string} [options.selfId] - 当前 agent id
   */
  constructor(options = {}) {
    this.agentNames = options.agentNames || {};
    this.selfId = options.selfId || null;
  }

  /**
   * 对一批 claim 做代词解析。
   *
   * @param {Array<Object>} claims - v3 claim 数组（也兼容 v2 flat claim：subject 是 string）
   * @returns {{ claims: Array<Object>, notes: Array<ResolveNote> }}
   *   - claims: 解析后的新 claim 数组（不 mutate 输入）
   *   - notes: 解析备注列表
   */
  resolve(claims) {
    const notes = [];
    const resolved = [];

    if (!claims || !Array.isArray(claims)) {
      return { claims: [], notes: [] };
    }

    // 第一阶段：预处理 — 对所有 claim 做浅拷贝，建立索引
    const cloned = claims.map((c) => cloneClaim(c, this.agentNames));

    // 第二阶段：找出所有代词 claim 和所有显式 agent claim（用于候选查找）
    const pronounIndices = [];
    const explicitAgentClaims = []; // { index, claim, agentId }

    for (let i = 0; i < cloned.length; i++) {
      const claim = cloned[i];
      if (!claim || typeof claim !== 'object') {
        resolved.push(claim);
        continue;
      }

      if (needsResolution(claim)) {
        pronounIndices.push(i);
      } else {
        // 非代词 claim，检查是否可以作为候选
        const raw = getSubjectRaw(claim);
        const sid = getSubjectId(claim);
        if (raw && !isPronoun(raw) && sid) {
          // 已解析的显式 agent claim
          explicitAgentClaims.push({ index: i, claim, agentId: sid });
        }
        resolved.push(claim);
      }
    }

    // 第三阶段：对每个代词 claim 做解析
    for (const pi of pronounIndices) {
      const claim = cloned[pi];
      const raw = getSubjectRaw(claim);
      let note = null;

      // 规则 5：第三人称复数 → ambiguous
      if (isPluralPronoun(raw)) {
        note = {
          claimId: claim.id || 'unknown',
          kind: 'coreference_ambiguous',
          reason: 'plural pronoun',
          ambiguousCandidates: [],
        };
        notes.push(note);
        resolved.push(claim);
        continue;
      }

      // 规则 6：第二人称 → 保守 ambiguous
      if (isSecondPerson(raw)) {
        note = {
          claimId: claim.id || 'unknown',
          kind: 'coreference_ambiguous',
          reason: 'second-person pronoun',
          ambiguousCandidates: [],
        };
        notes.push(note);
        resolved.push(claim);
        continue;
      }

      // 规则 1：优先 sidecar binding
      const sidecarResult = _trySidecarBinding(claim, this.agentNames, this.selfId);
      if (sidecarResult) {
        const binding = sidecarResult;
        // 更新 subject 为解析结果
        claim.subject = { kind: 'agent', id: binding.agentId, raw: binding.raw };
        if (!Array.isArray(claim.dependencies)) claim.dependencies = [];
        if (!claim.dependencies.includes(binding.agentId)) {
          claim.dependencies.push(binding.agentId);
        }
        note = {
          claimId: claim.id || 'unknown',
          kind: 'sidecar_bound',
          reason: 'sidecar binding',
          resolvedTo: binding.agentId,
        };
        notes.push(note);
        resolved.push(claim);
        // 加入显式 agent 候选列表供后续代词使用
        explicitAgentClaims.push({ index: pi, claim, agentId: binding.agentId });
        continue;
      }

      // 规则 2 & 3：同句最近显式 agent + source-attributed 优先
      const candidates = _findCandidates(
        claim, cloned, explicitAgentClaims, SENTENCE_WINDOW_K,
        this.agentNames, this.selfId,
      );

      if (candidates.length === 0) {
        // 规则 4：无 candidate → no_resolver
        note = {
          claimId: claim.id || 'unknown',
          kind: 'no_resolver',
          reason: 'no candidate in sentence window',
        };
        notes.push(note);
        resolved.push(claim);
      } else if (candidates.length === 1) {
        // 唯一候选 → resolved_to
        const cand = candidates[0];
        claim.subject = { kind: 'agent', id: cand.agentId, raw: cand.raw };
        if (!Array.isArray(claim.dependencies)) claim.dependencies = [];
        if (!claim.dependencies.includes(cand.agentId)) {
          claim.dependencies.push(cand.agentId);
        }
        note = {
          claimId: claim.id || 'unknown',
          kind: 'resolved_to',
          reason: 'resolved to nearest explicit agent in sentence window',
          resolvedTo: cand.agentId,
        };
        notes.push(note);
        resolved.push(claim);
        // 加入显式 agent 候选列表
        explicitAgentClaims.push({ index: pi, claim, agentId: cand.agentId });
      } else {
        // 多个候选 → ambiguous
        const candIds = candidates.map((c) => c.agentId);
        note = {
          claimId: claim.id || 'unknown',
          kind: 'coreference_ambiguous',
          reason: 'multiple candidates in sentence window',
          ambiguousCandidates: candIds,
        };
        notes.push(note);
        resolved.push(claim); // subject 不变（保持代词未绑定）
      }
    }

    // 第四阶段：补充 notes 给非代词 claim（no_resolver 标记）
    for (let i = 0; i < cloned.length; i++) {
      if (!cloned[i]) continue;
      const alreadyHandled = resolved.some((r) => r && r.id === cloned[i].id);
      if (!alreadyHandled) {
        // 这个 claim 在 cloned 中但不在 resolved 中（可能是 null 或非 object）
        continue;
      }
    }

    return { claims: resolved, notes };
  }
}

// ─── 辅助：尝试 sidecar binding────────────────────────────────────────────────

/**
 * 尝试从 claim 的 source / dependencies 中提取明确的 agentId binding。
 * @param {Object} claim
 * @param {Object} agentNames
 * @param {string} selfId
 * @returns {{ agentId: string, raw: string }|null}
 * @private
 */
function _trySidecarBinding(claim, agentNames, selfId) {
  // 检查 extractionMethod === 'sidecar' 且 source.by 是合法 agentId
  if (claim.extractionMethod === 'sidecar') {
    if (claim.source && typeof claim.source === 'object') {
      // source.by 可能是 displayName 或 agentId
      let byId = null;
      if (claim.source.by) {
        byId = claim.source.by;
        // 如果是 displayName，反查 agentId
        if (agentNames) {
          const resolvedId = lookupAgentId(agentNames, byId);
          if (resolvedId) byId = resolvedId;
        }
        // 如果 byId === selfId
        if (byId === selfId) {
          return { agentId: selfId, raw: byId };
        }
        // 只要 source.by 存在且非空，就认为有 sidecar binding
        if (byId) {
          return { agentId: byId, raw: claim.subject.raw || byId };
        }
      }
    }
  }

  // 检查 source.kind === 'told' 或 'reported' 且有 source.by
  if (claim.source && typeof claim.source === 'object') {
    const sourceKind = claim.source.kind;
    if (sourceKind === 'told' || sourceKind === 'reported') {
      if (claim.source.by) {
        let byId = claim.source.by;
        if (agentNames) {
          const resolvedId = lookupAgentId(agentNames, byId);
          if (resolvedId) byId = resolvedId;
        }
        if (byId) {
          return { agentId: byId, raw: claim.subject.raw || byId };
        }
      }
    }
  }

  // 检查 dependencies 中是否有明确的 agentId binding
  if (Array.isArray(claim.dependencies) && claim.dependencies.length > 0) {
    for (const dep of claim.dependencies) {
      if (typeof dep === 'string' && dep.length > 0) {
        // 如果 dep 是已知 agentId 或 displayName
        let resolvedId = dep;
        if (agentNames) {
          const resolvedByName = lookupAgentId(agentNames, dep);
          if (resolvedByName) resolvedId = resolvedByName;
        }
        return { agentId: resolvedId, raw: resolvedId };
      }
    }
  }

  return null;
}

// ─── 辅助：查找候选 agent──────────────────────────────────────────────────────

/**
 * 在同句范围内查找显式 agent 候选。
 * @param {Object} pronounClaim - 代词 claim
 * @param {Array<Object>} allClaims - 所有 claim（已 clone）
 * @param {Array<{index:number, claim:Object, agentId:string}>} explicitAgents - 显式 agent claims
 * @param {number} K - 搜索窗口字符数
 * @param {Object} agentNames - id → displayName 映射
 * @param {string} selfId - 当前 agent id
 * @returns {Array<{agentId: string, raw: string, distance: number}>}
 * @private
 */
function _findCandidates(pronounClaim, allClaims, explicitAgents, K, agentNames, selfId) {
  const candidates = [];

  // source-attributed 优先：若 pronoun claim 有 source.kind='told'/'reported' 且 source.by
  // 且该 agent 在候选列表中 → 优先
  let sourceAttributedId = null;
  if (pronounClaim.source && typeof pronounClaim.source === 'object') {
    const sk = pronounClaim.source.kind;
    if (sk === 'told' || sk === 'reported') {
      if (pronounClaim.source.by) {
        let byId = pronounClaim.source.by;
        if (agentNames) {
          const resolvedId = lookupAgentId(agentNames, byId);
          if (resolvedId) byId = resolvedId;
        }
        if (byId) sourceAttributedId = byId;
      }
    }
  }

  for (const ea of explicitAgents) {
    const eaClaim = ea.claim;
    if (!eaClaim) continue;

    // 用 span start 位置计算距离
    const eaStart = getSpanStart(eaClaim);
    const pronounStart = getSpanStart(pronounClaim);

    // 候选必须在 pronoun 之前（严格小于），或相同位置但出现在更早的数组位置
    if (eaStart > pronounStart) continue;

    // 距离：pronounStart - eaStart，必须在 [0, K] 范围内
    const dist = pronounStart - eaStart;
    if (dist > K) continue;

    // 收集候选
    const raw = getSubjectRaw(eaClaim) || ea.agentId;
    candidates.push({
      agentId: ea.agentId,
      raw,
      distance: dist,
    });
  }

  // source-attributed 优先：如果找到了 source.by 且它在候选列表中
  if (sourceAttributedId) {
    const srcCand = candidates.find((c) => c.agentId === sourceAttributedId);
    if (srcCand) {
      // 将 source-attributed 候选移到最前（优先级最高）
      candidates.splice(candidates.indexOf(srcCand), 1);
      candidates.unshift(srcCand);
    }
  }

  // 去重：同一 agentId 只保留最近的一个
  const seen = new Set();
  const unique = [];
  for (const c of candidates) {
    if (!seen.has(c.agentId)) {
      seen.add(c.agentId);
      unique.push(c);
    }
  }

  return unique;
}

// ─── 工厂函数──────────────────────────────────────────────────────────────────

/**
 * 便捷构造 CoreferenceResolver。
 *
 * @param {Object} [agentNames] - id → displayName 映射
 * @param {string} [selfId] - 当前 agent id
 * @returns {CoreferenceResolver}
 */
function createCoreferenceResolver(agentNames, selfId) {
  return new CoreferenceResolver({ agentNames, selfId });
}

// ─── Exports───────────────────────────────────────────────────────────────────

module.exports = {
  CoreferenceResolver,
  PRONOUNS_ZH,
  createCoreferenceResolver,
};
