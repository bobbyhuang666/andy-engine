/**
 * GroundingChecker — D5 v2 结构化一致性校验器
 *
 * 主实现：LLM Output → ClaimExtractor → structured claims →
 *         claim normalization → fact/knowledge entailment →
 *         deterministic violation report
 *
 * 设计原则：
 *   - 只读校验器，不写入 WorldFactStore / KnowledgeStore
 *   - confidence < 0.65 的 claim 只进入 claims 数组，不产生 blocking violation
 *   - polarity === uncertain 的 claim 不按确定事实硬拦截
 *   - 否定 claim 不能被当作正向 claim
 *   - 保留 FactConsistencyChecker 的 { valid, violations, severity, suggestion } API shape
 *   - 附加可选字段：claims, checkerVersion: 'v2-structured', groundingVersion: 'v3-semantic-alpha'
 */

const ClaimExtractor = require('./ClaimExtractor');
const { FactType, FactScope } = require('../canon/FactSchema');
const { diagnostics } = require('../shared/Diagnostics');
const { translateV2Claim, isBlocking: v3IsBlocking, ClaimTypes } = require('./grounding/ClaimSchema');
const { EvidenceBinder } = require('./grounding/EvidenceBinder');
const { createSidecarValidator } = require('./grounding/SidecarValidator');
const { createCoreferenceResolver } = require('./grounding/CoreferenceResolver');
const { createGroundingVerifierAdapter, NoOpVerifier } = require('./grounding/GroundingVerifier');

// ─── Severity 映射 ───
const SEVERITY_ORDER = ['reject', 'rewrite', 'warning', 'degrade_to_template', 'pass'];

const SEVERITY_RULES = {
  reject:     ['new_event', 'new_relationship'],
  rewrite:    ['unsupported_claim', 'agent_state_leak', 'local_scope_leak', 'unknown_character', 'unknown_location'],
  warning:    ['missing_source_attribution'],
  degrade_to_template: ['time_conflict', 'unknown_event'],
};

class GroundingChecker {
  /**
   * @param {import('../canon/WorldFactStore')} worldFactStore
   * @param {Object} domain - DomainRegistry 实例
   */
  constructor(worldFactStore, domain) {
    this.store = worldFactStore;
    this.domain = domain;
    this._locationAliases = domain?.locationAliases || {};
  }

  /**
   * 主入口：校验 LLM 输出
   * @param {string} llmOutput
   * @param {Object} grounding - grounding package from FactProvider
   * @param {Object} [options] - optional sidecar support
   * @param {*} [options.structuredClaims] - sidecar claims from LLM structured output
   * @returns {Object} { valid, violations, severity, suggestion, claims?, checkerVersion?, groundingVersion? }
   */
  check(llmOutput, grounding, options = {}) {
    const structuredClaims = options?.structuredClaims;
    if (!llmOutput && !structuredClaims) {
      return { valid: true, violations: [], severity: 'pass', suggestion: null };
    }

    // When grounding is missing but we have structuredClaims, use empty grounding
    if (!grounding && !structuredClaims) {
      return { valid: true, violations: [], severity: 'pass', suggestion: null };
    }

    const selfId = grounding?.metadata?.agentId;
    const agentNames = grounding?.metadata?.agentNames || {};
    const currentTime = grounding?.metadata?.currentTime;
    const allowedFacts = grounding?.allowedFacts || [];
    const forbiddenFacts = grounding?.forbiddenFacts || [];

    // 1. Extract structured claims from text
    const extractor = new ClaimExtractor(selfId, agentNames);
    const allClaimsFromText = extractor.extract(llmOutput);

    // ─── Sidecar path ────────────────────────────────────────────────────────────
    let sidecarClaims = [];
    let sidecarIssues = [];

    if (structuredClaims != null && structuredClaims !== undefined) {
      const validator = createSidecarValidator(agentNames, selfId);
      const result = validator.validate(structuredClaims);
      sidecarClaims = result.claims || [];
      sidecarIssues = result.issues || [];
    }

    // Merge claims: sidecar claims + text extractor claims
    // Dedup by overlapping sourceSpan.raw — keep sidecar version (more precise)
    const allClaims = this._mergeClaims(allClaimsFromText, sidecarClaims);

    // 2. Separate blocking vs debug claims
    // v2 claims use polarity; v3 claims use modality.
    // Mistrusted sidecar claims (new events/relationships) are always promoted to blocking.
    const blockingClaims = allClaims.filter(c => {
      // Mistrusted sidecar claims always blocking
      if (c.extractionMethod === 'sidecar-mistrusted') return true;
      // v3: confidence >= 0.65 && modality !== 'uncertain'
      if (c.modality !== undefined) {
        return c.confidence >= 0.65 && c.modality !== 'uncertain';
      }
      // v2: confidence >= 0.65 && polarity !== 'uncertain'
      return c.confidence >= 0.65 && c.polarity !== 'uncertain';
    });
    const debugClaims = allClaims.filter(c => {
      if (c.extractionMethod === 'sidecar-mistrusted') return false;
      if (c.modality !== undefined) {
        return c.confidence < 0.65 || c.modality === 'uncertain';
      }
      return c.confidence < 0.65 || c.polarity === 'uncertain';
    });

    // 3. Build evidence index from allowedFacts
    const selfAgentStateLocations = new Set(); // selfId → position/region
    const agentKnownLocations = new Map();     // agentId → Set<location>
    const knownEventDescriptions = new Set();  // lowercased description fragments
    const knownRelationships = new Map();      // 'agentA:agentB' → relationType
    const toldFacts = [];                      // facts with _evidence.source === 'told'
    const inferredFacts = [];                  // facts with _evidence.source === 'inferred'

    for (const fact of allowedFacts) {
      if (!fact || fact._invalidated) continue;

      // Self AGENT_STATE for location/state support
      if (fact.type === FactType.AGENT_STATE && fact.agentId === selfId) {
        if (fact.position) selfAgentStateLocations.add(fact.position);
        if (fact.region) selfAgentStateLocations.add(fact.region);
      }

      // EVENT facts: build agent→location map (requires location)
      if (fact.type === FactType.EVENT && fact.location) {
        if (fact.participants) {
          for (const pid of fact.participants) {
            if (!agentKnownLocations.has(pid)) agentKnownLocations.set(pid, new Set());
            agentKnownLocations.get(pid).add(fact.location);
          }
        }
        if (fact.observers) {
          for (const oid of fact.observers) {
            if (!agentKnownLocations.has(oid)) agentKnownLocations.set(oid, new Set());
            agentKnownLocations.get(oid).add(fact.location);
          }
        }
      }

      // EVENT facts: index description regardless of location
      if (fact.type === FactType.EVENT && fact.description) {
        knownEventDescriptions.add(fact.description.toLowerCase());
      }

      // OBSERVATION facts: observer→target→context (location stored in context)
      if (fact.type === FactType.OBSERVATION && fact.context && fact.observerId) {
        if (!agentKnownLocations.has(fact.observerId)) agentKnownLocations.set(fact.observerId, new Set());
        agentKnownLocations.get(fact.observerId).add(fact.context);
      }

      // RELATIONSHIP facts
      if (fact.type === FactType.RELATIONSHIP && fact.agentA && fact.agentB) {
        const key = `${fact.agentA}:${fact.agentB}`;
        knownRelationships.set(key, fact.relationType);
        // Also store reverse
        const reverseKey = `${fact.agentB}:${fact.agentA}`;
        knownRelationships.set(reverseKey, fact.relationType);
      }

      // Evidence tracking for source attribution
      if (fact._evidence) {
        if (fact._evidence.source === 'told') toldFacts.push(fact);
        if (fact._evidence.source === 'inferred') inferredFacts.push(fact);
      }
    }

    // 4. Validate each blocking claim
    const violations = [];

    // 4a. Convert sidecar issues to violations
    for (const issue of sidecarIssues) {
      if (issue.kind === 'untrusted_new_event') {
        violations.push({
          type: 'new_event',
          message: issue.message,
          severity: 'reject',
        });
      } else if (issue.kind === 'untrusted_new_relationship') {
        violations.push({
          type: 'new_relationship',
          message: issue.message,
          severity: 'reject',
        });
      } else if (issue.kind === 'malformed') {
        violations.push({
          type: 'malformed_sidecar',
          message: issue.message,
          severity: 'degrade_to_template',
        });
      } else {
        // unknown_type / missing_field / invalid_subject / invalid_modality → warning
        violations.push({
          type: 'sidecar_validation_warning',
          message: issue.message,
          severity: 'warning',
        });
      }
    }

    for (const claim of blockingClaims) {
      const claimViolations = this._validateClaim(claim, {
        selfId,
        agentNames,
        selfAgentStateLocations,
        agentKnownLocations,
        knownEventDescriptions,
        knownRelationships,
        toldFacts,
        inferredFacts,
        allowedFacts,
        forbiddenFacts,
        currentTime,
        llmOutput,
      });

      violations.push(...claimViolations);
    }

    // 5. Run regex-based checks that are NOT yet covered by claims
    // (time_conflict, unknown_character, unknown_location via text-level patterns
    //  that don't produce structured claims — kept as fallback for coverage)
    const regexViolations = this._runRegexFallbackChecks(llmOutput, grounding);
    // Only add regex violations that don't duplicate claim-based ones
    for (const rv of regexViolations) {
      const duplicate = violations.some(v =>
        v.type === rv.type &&
        (v.agent === rv.agent || v.location === rv.location || v.event === rv.event)
      );
      if (!duplicate) violations.push(rv);
    }

    // 6. Compute severity (highest priority wins)
    const severity = this._computeSeverity(violations);

    // 7. Generate suggestion
    const suggestion = violations.length > 0 ? this._suggestFix(violations) : null;

    // 8. Optional v3 evidence trace (旁路，不影响 v2 决策)
    let evidenceTrace = undefined;
    let coreferenceNotes = undefined;
    let verifierDecisions = undefined;
    try {
      // ── Step A: Extract pronoun claims (includePronouns=true) ──
      let pronounClaimsRaw = [];
      let corefResolver = null;
      if (agentNames && Object.keys(agentNames).length > 0) {
        const pronounExtractor = new ClaimExtractor(selfId, agentNames);
        const allPronounClaims = pronounExtractor.extract(llmOutput, { includePronouns: true });
        pronounClaimsRaw = allPronounClaims.filter(c => c.extractionMethod === 'extractor-pronoun');
        // Ensure pronoun claims have span field for CoreferenceResolver distance calc
        for (const pc of pronounClaimsRaw) {
          if (pc.sourceSpan && !pc.span) {
            pc.span = {
              start: pc.sourceSpan.start,
              end: pc.sourceSpan.end,
              raw: pc.sourceSpan.raw || '',
            };
          }
        }
      }

      // ── Step B: Run CoreferenceResolver on ALL claims (so pronoun claims
      // can find candidate agents among non-pronoun claims) ──
      let resolvedPronounClaims = [];
      let resolvedPronounNotes = [];
      if (pronounClaimsRaw.length > 0 && agentNames && Object.keys(agentNames).length > 0) {
        corefResolver = createCoreferenceResolver(agentNames, selfId);
        // Ensure all claims have span field and v3-style subjects for CoreferenceResolver
        const allClaimsForCoref = allClaims.map(c => {
          const enriched = { ...c };
          if (enriched.sourceSpan && !enriched.span) {
            enriched.span = {
              start: enriched.sourceSpan.start,
              end: enriched.sourceSpan.end,
              raw: enriched.sourceSpan.raw || '',
            };
          }
          // Convert string subject to v3-style {kind, id, raw} so the resolver
          // can recognize explicit agent candidates. The subject may be an agentId
          // (e.g., 'bob') or a displayName (e.g., '鲍勃').
          if (typeof enriched.subject === 'string') {
            const raw = enriched.subject;
            // Check if it's an agentId (key in agentNames)
            let resolvedId = raw; // default: treat as agentId
            // If raw matches a displayName value, use the key as agentId
            for (const [id, name] of Object.entries(agentNames)) {
              if (name && name.toLowerCase() === raw.toLowerCase()) {
                resolvedId = id;
                break;
              }
            }
            enriched.subject = { kind: 'agent', id: resolvedId, raw };
          }
          return enriched;
        });
        // Pass all claims so the resolver can find explicit agent candidates
        const corefResult = corefResolver.resolve([...allClaimsForCoref, ...pronounClaimsRaw]);
        resolvedPronounNotes = corefResult.notes || [];

        // Extract only the resolved pronoun claims from the result.
        // Match by extractionMethod since subject.raw may change after resolution.
        resolvedPronounClaims = (corefResult.claims || []).filter(c =>
          c.extractionMethod === 'extractor-pronoun'
        );
      }

      // ── Step C: Combine allClaims (from default extractor) with resolved pronoun claims ──
      let combinedClaims = allClaims;
      if (resolvedPronounClaims.length > 0) {
        // Assign IDs to resolved pronoun claims that may not have them
        let nextPronounIdx = allClaims.length + 1;
        const enrichedPronounClaims = resolvedPronounClaims.map((pc, idx) => {
          const enriched = { ...pc };
          if (!enriched.id) {
            enriched.id = `claim_${String(nextPronounIdx + idx).padStart(3, '0')}`;
          }
          // Ensure span is set for binding
          if (enriched.span && typeof enriched.span === 'object') {
            // already set from translateV2Claim
          } else if (enriched.sourceSpan) {
            enriched.span = {
              start: enriched.sourceSpan.start,
              end: enriched.sourceSpan.end,
              raw: enriched.sourceSpan.raw || '',
            };
          }
          return enriched;
        });
        combinedClaims = [...allClaims, ...enrichedPronounClaims];
      }

      // ── Step D: Build evidence trace from combined claims ──
      if (combinedClaims.length > 0 && allowedFacts) {
        // Translate v2 flat claims → v3 claims; v3 claims (sidecar) pass through.
        const v3Claims = combinedClaims.map((c, i) => {
          if (c.extractionMethod && c.extractionMethod !== 'v2-adapter') {
            // Already v3 — pass through
            return c;
          }
          // v2 flat claim → translate to v3
          return translateV2Claim(c, { selfId, agentNames, index: i + 1 });
        });

        // Flatten v3 structured subject/object → plain strings for EvidenceBinder compatibility.
        const binderClaims = v3Claims.map((vc) => {
          const flat = { ...vc };
          if (flat.subject && typeof flat.subject === 'object') {
            flat.subject = flat.subject.id ?? flat.subject.raw ?? null;
          }
          if (flat.object && typeof flat.object === 'object') {
            flat.object = flat.object.id ?? flat.object.raw ?? null;
          }
          return flat;
        });

        // Bind claims to evidence
        const binder = new EvidenceBinder({ selfId, agentNames, forbiddenFacts });
        const binderLocationAliases = options?.locationAliases || this._locationAliases;
        const { bindings } = binder.bind(binderClaims, allowedFacts, {
          selfId,
          agentNames,
          forbiddenFacts,
          locationAliases: binderLocationAliases,
        });

        // ── Step D1: Optional verifier (sync path, diagnostic only) ──
        try {
          const strictness = options.strictness || 'normal';
          const adapter = createGroundingVerifierAdapter(options.verifier);
          const verifierResult = adapter.runSync({
            text: llmOutput,
            claims: binderClaims,
            grounding,
            evidenceBindings: bindings,
            options: { strictness },
          });
          if (verifierResult && Array.isArray(verifierResult.decisions) && verifierResult.decisions.length > 0) {
            verifierDecisions = verifierResult.decisions;
          }
        } catch (err) {
          // verifier 异常不影响主路径
          diagnostics?.warnOnce?.('grounding-checker:verifier-error',
            `verifier sync failed: ${err?.message || err}`,
            { stack: err?.stack }
          );
        }

        // Build evidenceTrace: join v3 claims with bindings
        const bindingsByClaim = new Map();
        for (const b of bindings) {
          if (!bindingsByClaim.has(b.claimId)) bindingsByClaim.set(b.claimId, []);
          bindingsByClaim.get(b.claimId).push(b);
        }

        // Build a set of pronoun claim indices for coreference annotation
        const pronounClaimIndices = new Set();
        for (let i = 0; i < combinedClaims.length; i++) {
          if (combinedClaims[i].extractionMethod === 'extractor-pronoun') {
            pronounClaimIndices.add(i);
          }
        }

        // Map notes to pronoun claim indices by matching order.
        // resolvedPronounNotes correspond to resolvedPronounClaims in order.
        // We need to find which combinedClaims indices those pronoun claims occupy.
        const noteByPronounIndex = new Map();
        let noteIdx = 0;
        for (let i = 0; i < combinedClaims.length; i++) {
          if (combinedClaims[i].extractionMethod === 'extractor-pronoun' && noteIdx < resolvedPronounNotes.length) {
            noteByPronounIndex.set(i, resolvedPronounNotes[noteIdx]);
            noteIdx++;
          }
        }

        evidenceTrace = v3Claims.map((v3Claim, i) => {
          const claimBindings = bindingsByClaim.get(v3Claim.id) || [];
          const support = claimBindings.length > 0
            ? claimBindings.find(b => b.support === 'supports')?.support ?? claimBindings[0].support
            : 'unsupported';
          const firstBinding = claimBindings[0] || {};

          // Coreference annotation for pronoun claims
          // Match by index position in combinedClaims
          let coreferenceStatus = undefined;
          let coreferenceResolvedTo = undefined;
          if (pronounClaimIndices.has(i)) {
            const note = noteByPronounIndex.get(i);
            if (note) {
              coreferenceStatus = note.kind; // 'resolved_to' | 'coreference_ambiguous' | 'no_resolver' | 'sidecar_bound'
              coreferenceResolvedTo = note.resolvedTo || undefined;
            }
          }

          // For non-pronoun claims that were resolved_to via coreference,
          // also annotate with coreference info if applicable
          // (pronoun claims that got resolved will have subject.id set to resolved agent)

          return {
            claimId: v3Claim.id,
            type: v3Claim.type,
            subjectId: v3Claim.subject?.id ?? v3Claim.subject ?? null,
            objectRaw: v3Claim.object?.raw ?? v3Claim.object ?? null,
            predicate: v3Claim.predicate,
            polarity: v3Claim.polarity,
            modality: v3Claim.modality,
            support,
            evidenceSource: firstBinding.evidenceSource ?? null,
            confidence: firstBinding.confidence ?? v3Claim.confidence ?? 0,
            reason: firstBinding.reason ?? null,
            factId: firstBinding.factId ?? null,
            sourceSpanRaw: v3Claim.span?.raw ?? null,
            blocking: v3IsBlocking(v3Claim),
            evidence: claimBindings.length > 0 ? claimBindings : undefined,
            ...(firstBinding.paraphraseAlias !== undefined ? { paraphraseAlias: firstBinding.paraphraseAlias } : {}),
            ...(firstBinding.paraphraseCanonical !== undefined ? { paraphraseCanonical: firstBinding.paraphraseCanonical } : {}),
            ...(coreferenceStatus !== undefined ? { coreferenceStatus } : {}),
            ...(coreferenceResolvedTo !== undefined ? { coreferenceResolvedTo } : {}),
          };
        });
      }

      // ── Step E: Attach coreference notes if any ──
      if (resolvedPronounNotes.length > 0) {
        coreferenceNotes = resolvedPronounNotes;
      }
    } catch (err) {
      diagnostics?.warnOnce?.('grounding-checker:v3-trace-error',
        `v3 evidence trace computation failed: ${err?.message || err}`,
        { stack: err?.stack }
      );
      // evidenceTrace stays undefined — v2 path unaffected
    }

    return {
      valid: violations.length === 0,
      violations,
      severity,
      suggestion,
      claims: debugClaims.length > 0 ? debugClaims : undefined,
      checkerVersion: 'v2-structured',
      groundingVersion: 'v3-semantic-alpha',
      ...(evidenceTrace !== undefined ? { evidenceTrace } : {}),
      ...(coreferenceNotes !== undefined ? { coreferenceNotes } : {}),
      ...(verifierDecisions !== undefined ? { verifierDecisions } : {}),
    };
  }

  // ═══════════════════════════════════════════
  // Claim validation
  // ═══════════════════════════════════════════

  /**
   * Helper: extract flat subjectId/object/sourceSpan from both v2 and v3 claims.
   * v2: claim.subject = string id, claim.object = string, claim.sourceSpan = {raw}
   * v3: claim.subject = {kind, id, raw}, claim.object = {kind, id, raw}, claim.span = {raw}
   * @private
   */
  _normalizeClaimForValidation(claim) {
    const normalized = { ...claim };
    // subjectId
    if (normalized.subject && typeof normalized.subject === 'object') {
      normalized.subjectId = normalized.subject.id || normalized.subject.raw || null;
    } else {
      normalized.subjectId = normalized.subject || null;
    }
    // object (for location/event/state)
    if (normalized.object && typeof normalized.object === 'object') {
      normalized.objectRaw = normalized.object.raw || normalized.object.id || null;
    } else {
      normalized.objectRaw = normalized.object || null;
    }
    // sourceSpan (v2 uses sourceSpan, v3 uses span)
    normalized.sourceSpan = normalized.sourceSpan || normalized.span || { raw: '' };
    return normalized;
  }

  _validateClaim(claim, ctx) {
    const violations = [];
    const nc = this._normalizeClaimForValidation(claim);

    switch (claim.type) {
      case 'location':
        violations.push(...this._validateLocationClaim(nc, ctx));
        break;

      case 'event':
        violations.push(...this._validateEventClaim(nc, ctx));
        break;

      case 'relationship':
        violations.push(...this._validateRelationshipClaim(nc, ctx));
        break;

      case 'state':
        violations.push(...this._validateStateClaim(nc, ctx));
        break;

      case 'source_attribution':
        violations.push(...this._validateSourceClaim(nc, ctx));
        break;

      case 'time':
        violations.push(...this._validateTimeClaim(nc, ctx));
        break;
    }

    return violations;
  }

  // ═══════════════════════════════════════════
  // Location claim validation
  // ═══════════════════════════════════════════

  _validateLocationClaim(claim, ctx) {
    const violations = [];
    const { selfId, selfAgentStateLocations, agentKnownLocations, agentNames, forbiddenFacts } = ctx;

    const subjectId = claim.subjectId;
    const isSelf = subjectId === selfId;
    const displayName = claim.rawSubject || agentNames[subjectId] || subjectId;
    const location = claim.objectRaw;
    const sourceSpanRaw = claim.sourceSpan?.raw || '';

    // 否定 claim 不进入 blocking violation（只记录，不硬拦截）
    if (claim.polarity === 'negative') {
      diagnostics?.warnOnce?.('grounding-checker:negation-location',
        `否定 location claim "${sourceSpanRaw}" 不触发 blocking violation`);
      return violations;
    }

    if (isSelf) {
      // Self location: 由 AGENT_STATE 支撑
      if (!selfAgentStateLocations.has(location)) {
        violations.push({
          type: 'unsupported_claim',
          agent: displayName,
          location,
          message: `你声称"${sourceSpanRaw}"，但你的状态中不记录你在${location}`,
        });
      }
    } else {
      // Other-agent location: 需要 EVENT/OBSERVATION 支撑
      const knownLocs = agentKnownLocations.get(subjectId);
      if (!knownLocs || !knownLocs.has(location)) {
        violations.push({
          type: 'unsupported_claim',
          agent: displayName,
          location,
          message: `没有证据表明${displayName}在${location}`,
        });
      }
    }

    return violations;
  }

  // ═══════════════════════════════════════════
  // Event claim validation
  // ═══════════════════════════════════════════

  _validateEventClaim(claim, ctx) {
    const violations = [];
    const { knownEventDescriptions, selfId, forbiddenFacts, agentNames } = ctx;

    // 否定 claim: 不做反事实证明，不拦截
    if (claim.polarity === 'negative') {
      diagnostics?.warnOnce?.('grounding-checker:negation-event',
        `否定 event claim "${claim.sourceSpan?.raw || ''}" 不触发 blocking violation`);
      return violations;
    }

    // "刚刚XX了" — 新事件创建 → reject
    if (claim.predicate === 'did' && (claim.sourceSpan?.raw || '').startsWith('刚刚')) {
      const eventContent = claim.objectRaw;
      // 检查是否在已知事件中
      let found = false;
      for (const known of knownEventDescriptions) {
        if (known.includes(eventContent?.toLowerCase()) || eventContent?.toLowerCase()?.includes(known)) {
          found = true;
          break;
        }
      }
      if (!found && eventContent && eventContent.length >= 2) {
        violations.push({
          type: 'new_event',
          event: eventContent,
          message: `编造了新事件"${eventContent}"`,
        });
      }
      return violations;
    }

    // "那次XX" / "上次XX" — 引用过去事件
    if (claim.predicate === 'refers_to') {
      const eventRef = claim.objectRaw;
      let found = false;
      for (const known of knownEventDescriptions) {
        if (known.includes(eventRef?.toLowerCase()) || eventRef?.toLowerCase()?.includes(known)) {
          found = true;
          break;
        }
      }
      if (!found && eventRef && eventRef.length > 3) {
        violations.push({
          type: 'unknown_event',
          event: eventRef,
          message: `引用了未知事件"${eventRef}"`,
        });
      }
    }

    return violations;
  }

  // ═══════════════════════════════════════════
  // Relationship claim validation
  // ═══════════════════════════════════════════

  _validateRelationshipClaim(claim, ctx) {
    const violations = [];

    // 所有关系变化 claim → 不允许 LLM 创建新关系
    if (claim.polarity === 'affirmative') {
      violations.push({
        type: 'new_relationship',
        message: '生成了新的关系变化',
      });
    }

    return violations;
  }

  // ═══════════════════════════════════════════
  // State claim validation (emotion / needs / activity)
  // ═══════════════════════════════════════════

  _validateStateClaim(claim, ctx) {
    const violations = [];
    const { selfId, agentKnownLocations, allowedFacts, agentNames } = ctx;

    const subjectId = claim.subjectId;
    const isSelf = subjectId === selfId;
    const displayName = claim.rawSubject || agentNames[subjectId] || subjectId;

    // 否定 claim 不拦截
    if (claim.polarity === 'negative') {
      diagnostics?.warnOnce?.('grounding-checker:negation-state',
        `否定 state claim "${claim.sourceSpan?.raw || ''}" 不触发 blocking violation`);
      return violations;
    }

    if (isSelf) {
      // Self state claims are always allowed
      return violations;
    }

    // Other-agent state claims: 需要 narrator 亲身参与或观察到
    const knownLocs = agentKnownLocations.get(subjectId);
    const hasDirectKnowledge = knownLocs && knownLocs.size > 0;

    if (!hasDirectKnowledge) {
      const stateType = claim.stateType || 'activity';
      violations.push({
        type: 'agent_state_leak',
        agent: displayName,
        stateType,
        message: `表达了${displayName}的${stateType === 'emotion' ? '情绪' : stateType === 'needs' ? '需求' : '活动'}状态，但你没有证据知道对方的状态`,
      });
    }

    return violations;
  }

  // ═══════════════════════════════════════════
  // Source attribution claim validation
  // ═══════════════════════════════════════════

  _validateSourceClaim(claim, ctx) {
    const violations = [];
    const { toldFacts, inferredFacts } = ctx;

    if (claim.sourceMarker === 'told') {
      // "听说 XX" / "XX告诉我" — told 来源已标注，通过
      return violations;
    }

    if (claim.sourceMarker === 'inferred') {
      // "我推测 XX" / "大概 XX" — inferred 来源已标注，通过
      return violations;
    }

    if (claim.sourceMarker === 'observed') {
      // "我看到 XX" — observed 来源已标注，通过
      return violations;
    }

    // 未标记来源的 told/inferred 事实 → warning
    // 检查 grounding 中是否有 told/inferred 事实被表达但没有来源标记
    const contentLower = claim.object?.toLowerCase() || '';

    for (const fact of toldFacts) {
      if (fact.description && contentLower.includes(fact.description.toLowerCase())) {
        // 检查文本中是否有 told marker
        const toldMarkers = ['听说', '告诉我', '告诉过', '说的', '跟我说的', '跟我讲', '说是', '据说', '风闻', '传闻'];
        if (!toldMarkers.some(m => ctx.llmOutput.includes(m))) {
          violations.push({
            type: 'missing_source_attribution',
            source: 'told',
            fact: fact.description,
            message: `听闻级别事实"${fact.description}"未标注来源`,
          });
        }
        break;
      }
    }

    for (const fact of inferredFacts) {
      if (fact.description && contentLower.includes(fact.description.toLowerCase())) {
        const inferredMarkers = ['推测', '估计', '猜测', '应该', '看来', '想必', '八成'];
        const toldMarkers = ['听说', '告诉我', '告诉过', '说的', '跟我说的', '跟我讲', '说是', '据说', '风闻', '传闻'];
        if (!inferredMarkers.some(m => ctx.llmOutput.includes(m)) &&
            !toldMarkers.some(m => ctx.llmOutput.includes(m))) {
          violations.push({
            type: 'missing_source_attribution',
            source: 'inferred',
            fact: fact.description,
            message: `推断级别事实"${fact.description}"未标注"推测"或"大概"`,
          });
        }
        break;
      }
    }

    return violations;
  }

  // ═══════════════════════════════════════════
  // Time claim validation
  // ═══════════════════════════════════════════

  _validateTimeClaim(claim, ctx) {
    const { currentTime } = ctx;
    if (!currentTime) return [];

    const violations = [];
    const hour = currentTime.getUTCHours ? currentTime.getUTCHours() : 12;
    const timeWord = claim.object;

    // 白天(6-18)提到深夜/凌晨
    if (hour >= 6 && hour < 18) {
      if (timeWord === '深夜' || timeWord === '凌晨') {
        violations.push({
          type: 'time_conflict',
          message: '白天提到了深夜/凌晨',
        });
      }
    }
    // 夜晚(18-6)提到中午/下午
    else {
      if (timeWord === '中午' || timeWord === '下午') {
        violations.push({
          type: 'time_conflict',
          message: '夜晚提到了中午/下午',
        });
      }
    }

    return violations;
  }

  // ═══════════════════════════════════════════
  // Regex fallback checks (for patterns not yet covered by claims)
  // ═══════════════════════════════════════════

  _runRegexFallbackChecks(text, grounding) {
    const violations = [];

    // ── LOCAL scope leak (forbidden facts) ──
    for (const fact of (grounding.forbiddenFacts || [])) {
      if (!fact || fact._invalidated) continue;
      if (fact.type !== FactType.EVENT && fact.type !== FactType.OBSERVATION) continue;
      if (fact.scope !== FactScope.LOCAL) continue;

      const desc = fact.description || '';
      if (desc.length < 2) continue;

      if (this._textContainsFactContent(text, desc)) {
        violations.push({
          type: 'local_scope_leak',
          fact: desc,
          location: fact.location || '',
          message: `提到了你不知道的本地事件"${desc}"`,
        });
      }
    }

    // ── Character name check (unknown_character) ──
    const { nameToId } = this._buildNameLookup(grounding);
    const namePattern = /[，。！？\s]([一-龥]{2,4})(?=[说聊问答告诉来了去了见到])/g;
    let nameMatch;
    while ((nameMatch = namePattern.exec(text)) !== null) {
      const name = nameMatch[1];
      const commonWords = ['大家', '别人', '对方', '朋友', '人们'];
      if (commonWords.includes(name)) continue;
      if (!nameToId.has(name.toLowerCase())) {
        violations.push({
          type: 'unknown_character',
          name,
          message: `提到了未知角色"${name}"`,
        });
      }
    }

    return violations;
  }

  // ═══════════════════════════════════════════
  // Severity computation (same 4-layer as v1)
  // ═══════════════════════════════════════════

  _computeSeverity(violations) {
    if (violations.length === 0) return 'pass';

    // reject: new_event, new_relationship
    if (violations.some(v =>
      v.severity === 'reject' ||
      v.type === 'new_event' ||
      v.type === 'new_relationship'
    )) {
      return 'reject';
    }

    // rewrite: unsupported_claim, agent_state_leak, local_scope_leak, unknown_character, unknown_location
    if (violations.some(v =>
      v.severity === 'rewrite' ||
      v.type === 'unsupported_claim' ||
      v.type === 'agent_state_leak' ||
      v.type === 'local_scope_leak' ||
      v.type === 'unknown_character' ||
      v.type === 'unknown_location'
    )) {
      return 'rewrite';
    }

    // warning: missing_source_attribution
    if (violations.some(v =>
      v.severity === 'warning' ||
      v.type === 'missing_source_attribution'
    )) {
      return 'warning';
    }

    // degrade_to_template: time_conflict, unknown_event
    return 'degrade_to_template';
  }

  // ═══════════════════════════════════════════
  // Suggestion generation
  // ═══════════════════════════════════════════

  _suggestFix(violations) {
    if (violations.length === 0) return null;

    const suggestions = [];
    for (const v of violations) {
      switch (v.type) {
        case 'unknown_character':
          suggestions.push(`移除未知角色"${v.name}"`);
          break;
        case 'unknown_location':
          suggestions.push(`移除未知地点"${v.location}"`);
          break;
        case 'unknown_event':
          suggestions.push(`移除未知事件引用"${v.event}"`);
          break;
        case 'time_conflict':
          suggestions.push('修正时间描述');
          break;
        case 'new_relationship':
          suggestions.push('移除新的关系变化');
          break;
        case 'new_event':
          suggestions.push(`移除编造的事件"${v.event}"`);
          break;
        case 'unsupported_claim':
          suggestions.push(`移除不支持的声明"${v.agent}在${v.location}"`);
          break;
        case 'missing_source_attribution':
          suggestions.push(`为"${v.fact}"添加来源标注（${v.source === 'told' ? '听说/XX告诉我' : '推测/大概'}）`);
          break;
        case 'agent_state_leak':
          suggestions.push(`移除对${v.agent}内心状态的表达（你不应该知道对方的状态）`);
          break;
        case 'local_scope_leak':
          suggestions.push(`移除你不知道的事件"${v.fact}"`);
          break;
      }
    }

    return suggestions.join('；');
  }

  // ═══════════════════════════════════════════
  // Claim merging (sidecar + text extractor)
  // ═══════════════════════════════════════════

  /**
   * Merge text-extracted claims with sidecar claims.
   * Dedup by overlapping sourceSpan.raw — keep sidecar version.
   *
   * @private
   */
  _mergeClaims(textClaims, sidecarClaims) {
    if (sidecarClaims.length === 0) return textClaims;
    if (textClaims.length === 0) return sidecarClaims;

    const merged = [...sidecarClaims]; // start with sidecar (higher precision)

    for (const tc of textClaims) {
      const tcSpan = tc.sourceSpan?.raw;
      if (!tcSpan) {
        merged.push(tc);
        continue;
      }

      // Check if any sidecar claim has overlapping span
      let isDuplicate = false;
      for (const sc of merged) {
        const scSpan = sc.sourceSpan?.raw;
        if (!scSpan) continue;
        // Overlap: if spans share significant text, it's a duplicate
        if (tcSpan.includes(scSpan) || scSpan.includes(tcSpan)) {
          isDuplicate = true;
          break;
        }
        // Check proximity: same character range overlap
        const minLen = Math.min(tcSpan.length, scSpan.length);
        if (minLen >= 2) {
          for (let i = 0; i <= tcSpan.length - minLen; i++) {
            if (tcSpan.substring(i, i + minLen) === scSpan) {
              isDuplicate = true;
              break;
            }
          }
        }
        if (isDuplicate) break;
      }

      if (!isDuplicate) {
        merged.push(tc);
      }
    }

    return merged;
  }

  // ═══════════════════════════════════════════
  // Utilities
  // ═══════════════════════════════════════════

  _buildNameLookup(grounding) {
    const nameToId = new Map();
    const agentNames = grounding.metadata?.agentNames || {};

    for (const [agentId, displayName] of Object.entries(agentNames)) {
      nameToId.set(agentId.toLowerCase(), agentId);
      if (displayName) {
        nameToId.set(displayName.toLowerCase(), agentId);
      }
    }

    for (const fact of (grounding.allowedFacts || [])) {
      if (!fact) continue;
      const ids = [];
      if (fact.agentId) ids.push(fact.agentId);
      if (fact.participants) ids.push(...fact.participants);
      if (fact.observers) ids.push(...fact.observers);
      if (fact.observerId) ids.push(fact.observerId);
      if (fact.targetId) ids.push(fact.targetId);
      if (fact.agentA) ids.push(fact.agentA);
      if (fact.agentB) ids.push(fact.agentB);
      for (const id of ids) {
        const key = id.toLowerCase();
        if (!nameToId.has(key)) nameToId.set(key, id);
      }
    }

    if (grounding.metadata?.agentId) {
      nameToId.set(grounding.metadata.agentId.toLowerCase(), grounding.metadata.agentId);
    }

    return { nameToId };
  }

  _textContainsFactContent(text, description) {
    if (text.includes(description)) return true;
    if (description.length >= 4) {
      for (let i = 0; i <= description.length - 4; i++) {
        const fragment = description.substring(i, i + 4);
        if (text.includes(fragment)) return true;
      }
    }
    return false;
  }
}

module.exports = GroundingChecker;
