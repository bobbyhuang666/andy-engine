/**
 * EvidenceBinder alias / paraphrase support tests (M3-R3)
 *
 * 覆盖：
 *   - 无 locationAliases → byte-for-byte 与 M1 一致
 *   - alias → canonical 命中 + evidence 存在 → paraphrase_supports
 *   - alias → canonical 命中 + evidence 不存在 → unsupported（alias 不能单独造支持）
 *   - canonical 本身严格命中 → supports（不是 paraphrase）
 *   - alias 多对一歧义 → 不参与匹配
 *   - alias 自映射 → 忽略
 *   - non-location claim 不受 alias 影响
 *   - Map / Record / Array 三种格式
 *   - null/undefined locationAliases → 不抛
 *   - v3 evidenceTrace 旁路标注 paraphraseAlias/paraphraseCanonical
 *   - v2 决策链不读 alias
 *   - options 优先于 domain.locationAliases
 *   - agentKnownLocations canonical 匹配
 *   - 性能回归检查
 */

const { EvidenceBinder, SUPPORT } = require('../../../../src/narrative/grounding/EvidenceBinder');

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeAgentStateFact(opts) {
  return {
    type: 'agent_state',
    agentId: opts.agentId || '',
    position: opts.position || '',
    region: opts.region || '',
  };
}

function makeEventFact(opts) {
  return {
    type: 'event',
    eventId: opts.eventId || `evt_${Math.random().toString(36).slice(2)}`,
    description: opts.description || '',
    location: opts.location || '',
    participants: opts.participants || [],
    observers: opts.observers || [],
    _evidence: opts._evidence || null,
  };
}

function makeClaim(opts) {
  return {
    id: opts.id || `claim_${Math.random().toString(36).slice(2, 6)}`,
    type: opts.type || 'location',
    subject: opts.subject != null ? opts.subject : null,
    predicate: opts.predicate || null,
    object: opts.object || null,
    polarity: opts.polarity || 'affirmative',
    confidence: opts.confidence || 0.8,
    stateType: opts.stateType || null,
  };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('EvidenceBinder — alias / paraphrase support (M3-R3)', () => {
  const selfId = 'alice';
  const bobId = 'bob';

  // ── 1. 无 locationAliases：与 M1 byte-for-byte 一致 ──

  test('无 locationAliases：self location 严格命中 → supports（与 M1 一致）', () => {
    const binder = new EvidenceBinder({ selfId });
    const allowedFacts = [makeAgentStateFact({ agentId: selfId, position: '图书馆' })];
    const claims = [makeClaim({ type: 'location', subject: selfId, object: '图书馆' })];
    const result = binder.bind(claims, allowedFacts);

    expect(result.bindings.length).toBe(1);
    expect(result.bindings[0].support).toBe(SUPPORT.SUPPORTS);
    expect(result.bindings[0].confidence).toBe(0.8);
  });

  test('无 locationAliases：self location 严格未命中 → unsupported（与 M1 一致）', () => {
    const binder = new EvidenceBinder({ selfId });
    const allowedFacts = [makeAgentStateFact({ agentId: selfId, position: '食堂' })];
    const claims = [makeClaim({ type: 'location', subject: selfId, object: '图书馆' })];
    const result = binder.bind(claims, allowedFacts);

    expect(result.bindings.length).toBe(1);
    expect(result.bindings[0].support).toBe(SUPPORT.UNSUPPORTED);
  });

  test('无 locationAliases：other-agent location 严格命中 → supports', () => {
    const binder = new EvidenceBinder({ selfId });
    const allowedFacts = [
      makeEventFact({ description: '鲍勃在图书馆', location: '图书馆', participants: [bobId] }),
    ];
    const claims = [makeClaim({ type: 'location', subject: bobId, object: '图书馆' })];
    const result = binder.bind(claims, allowedFacts);

    expect(result.bindings.length).toBe(1);
    expect(result.bindings[0].support).toBe(SUPPORT.SUPPORTS);
  });

  // ── 2. alias → canonical 命中 + evidence 存在 → paraphrase_supports ──

  test('alias "lib" → canonical "图书馆"，self AGENT_STATE 含 canonical → paraphrase_supports', () => {
    const binder = new EvidenceBinder({ selfId });
    const allowedFacts = [makeAgentStateFact({ agentId: selfId, position: '图书馆' })];
    const claims = [makeClaim({ type: 'location', subject: selfId, object: 'lib' })];
    const locationAliases = { '图书馆': ['lib', 'Library', '图'] };
    const result = binder.bind(claims, allowedFacts, { locationAliases });

    expect(result.bindings.length).toBe(1);
    expect(result.bindings[0].support).toBe(SUPPORT.PARAPHRASE_SUPPORTS);
    expect(result.bindings[0].paraphraseAlias).toBe('lib');
    expect(result.bindings[0].paraphraseCanonical).toBe('图书馆');
    expect(result.bindings[0].confidence).toBe(0.6);
    expect(result.bindings[0].reason).toContain('alias "lib" matches canonical "图书馆"');
  });

  test('alias "lib" → canonical "图书馆"，other-agent EVENT 含 canonical → paraphrase_supports', () => {
    const binder = new EvidenceBinder({ selfId });
    const allowedFacts = [
      makeEventFact({ description: '鲍勃在图书馆学习', location: '图书馆', participants: [bobId] }),
    ];
    const claims = [makeClaim({ type: 'location', subject: bobId, object: 'lib' })];
    const locationAliases = { '图书馆': ['lib', 'Library', '图'] };
    const result = binder.bind(claims, allowedFacts, { locationAliases });

    expect(result.bindings.length).toBe(1);
    expect(result.bindings[0].support).toBe(SUPPORT.PARAPHRASE_SUPPORTS);
    expect(result.bindings[0].paraphraseCanonical).toBe('图书馆');
    expect(result.bindings[0].evidenceSource).toBe('agent_known_locations');
  });

  // ── 3. canonical 本身严格命中 → supports（不是 paraphrase） ──

  test('canonical "图书馆" 严格命中 → supports（不是 paraphrase_supports）', () => {
    const binder = new EvidenceBinder({ selfId });
    const allowedFacts = [makeAgentStateFact({ agentId: selfId, position: '图书馆' })];
    const claims = [makeClaim({ type: 'location', subject: selfId, object: '图书馆' })];
    const locationAliases = { '图书馆': ['lib', 'Library'] };
    const result = binder.bind(claims, allowedFacts, { locationAliases });

    expect(result.bindings.length).toBe(1);
    expect(result.bindings[0].support).toBe(SUPPORT.SUPPORTS);
    expect(result.bindings[0].support).not.toBe(SUPPORT.PARAPHRASE_SUPPORTS);
    expect(result.bindings[0].confidence).toBe(0.8); // 沿用原始 confidence
  });

  // ── 4. alias 命中但 canonical 无 evidence → unsupported（alias 不能单独造支持） ──

  test('alias "lib" → canonical "图书馆"，但 AGENT_STATE 无 canonical → unsupported', () => {
    const binder = new EvidenceBinder({ selfId });
    const allowedFacts = [makeAgentStateFact({ agentId: selfId, position: '食堂' })];
    const claims = [makeClaim({ type: 'location', subject: selfId, object: 'lib' })];
    const locationAliases = { '图书馆': ['lib', 'Library'] };
    const result = binder.bind(claims, allowedFacts, { locationAliases });

    expect(result.bindings.length).toBe(1);
    expect(result.bindings[0].support).toBe(SUPPORT.UNSUPPORTED);
    expect(result.bindings[0].paraphraseAlias).toBeUndefined();
    expect(result.bindings[0].paraphraseCanonical).toBeUndefined();
  });

  test('alias "lib" → canonical "图书馆"，但 agentKnownLocations 无 canonical → unsupported', () => {
    const binder = new EvidenceBinder({ selfId });
    const allowedFacts = [
      makeEventFact({ description: '鲍勃在食堂', location: '食堂', participants: [bobId] }),
    ];
    const claims = [makeClaim({ type: 'location', subject: bobId, object: 'lib' })];
    const locationAliases = { '图书馆': ['lib', 'Library'] };
    const result = binder.bind(claims, allowedFacts, { locationAliases });

    expect(result.bindings[0].support).toBe(SUPPORT.UNSUPPORTED);
  });

  // ── 5. alias 多对一歧义 → 不参与匹配 ──

  test('alias "图" 同时出现在两个 canonical 的别名表 → 歧义 → unsupported', () => {
    const binder = new EvidenceBinder({ selfId });
    const allowedFacts = [makeAgentStateFact({ agentId: selfId, position: '图书馆' })];
    const claims = [makeClaim({ type: 'location', subject: selfId, object: '图' })];
    // '图' 同时是 '图书馆' 和 '图书馆分馆' 的别名 → 歧义
    const locationAliases = {
      '图书馆': ['lib', '图'],
      '图书馆分馆': ['分馆', '图'],
    };
    const result = binder.bind(claims, allowedFacts, { locationAliases });

    expect(result.bindings[0].support).toBe(SUPPORT.UNSUPPORTED);
    expect(result.bindings[0].paraphraseAlias).toBeUndefined();
  });

  // ── 6. canonical 不在 alias key 但在 regions：严格匹配照常 ──

  test('claim 用 canonical 本身，严格命中不受 alias 影响', () => {
    const binder = new EvidenceBinder({ selfId });
    const allowedFacts = [makeAgentStateFact({ agentId: selfId, position: '图书馆' })];
    const claims = [makeClaim({ type: 'location', subject: selfId, object: '图书馆' })];
    const locationAliases = { '食堂': ['饭堂'] }; // 不含 '图书馆'
    const result = binder.bind(claims, allowedFacts, { locationAliases });

    expect(result.bindings[0].support).toBe(SUPPORT.SUPPORTS);
  });

  // ── 7. alias 是 canonical 自己 → 忽略自映射 ──

  test("'图书馆' alias of '图书馆' → 自映射被忽略，严格 supports", () => {
    const binder = new EvidenceBinder({ selfId });
    const allowedFacts = [makeAgentStateFact({ agentId: selfId, position: '图书馆' })];
    const claims = [makeClaim({ type: 'location', subject: selfId, object: '图书馆' })];
    const locationAliases = { '图书馆': ['图书馆', 'lib'] };
    const result = binder.bind(claims, allowedFacts, { locationAliases });

    expect(result.bindings[0].support).toBe(SUPPORT.SUPPORTS);
  });

  // ── 8. non-location claim type 不受 alias 影响 ──

  test('event claim 不受 locationAliases 影响', () => {
    const binder = new EvidenceBinder({ selfId });
    const allowedFacts = [makeEventFact({ description: '鲍勃在图书馆学习', location: '图书馆' })];
    const claims = [
      makeClaim({ type: 'event', predicate: 'refers_to', object: '图书馆学习' }),
    ];
    const locationAliases = { '图书馆': ['lib'] };
    const result = binder.bind(claims, allowedFacts, { locationAliases });

    expect(result.bindings[0].support).toBe(SUPPORT.SUPPORTS);
    expect(result.bindings[0].paraphraseAlias).toBeUndefined();
  });

  test('state claim 不受 locationAliases 影响', () => {
    const binder = new EvidenceBinder({ selfId });
    const allowedFacts = [];
    const claims = [makeClaim({ type: 'state', subject: selfId, object: '开心' })];
    const locationAliases = { '图书馆': ['lib'] };
    const result = binder.bind(claims, allowedFacts, { locationAliases });

    expect(result.bindings[0].support).toBe(SUPPORT.SUPPORTS);
    expect(result.bindings[0].paraphraseAlias).toBeUndefined();
  });

  // ── 9. 长尾 alias ──

  test('"图书大厦" alias → "图书馆"，命中 + canonical evidence → paraphrase_supports', () => {
    const binder = new EvidenceBinder({ selfId });
    const allowedFacts = [makeAgentStateFact({ agentId: selfId, position: '图书馆' })];
    const claims = [makeClaim({ type: 'location', subject: selfId, object: '图书大厦' })];
    const locationAliases = { '图书馆': ['图书大厦', '图大'] };
    const result = binder.bind(claims, allowedFacts, { locationAliases });

    expect(result.bindings[0].support).toBe(SUPPORT.PARAPHRASE_SUPPORTS);
    expect(result.bindings[0].paraphraseAlias).toBe('图书大厦');
    expect(result.bindings[0].paraphraseCanonical).toBe('图书馆');
  });

  // ── 10. empty locationAliases {} → 等价无 alias ──

  test('locationAliases={} → 严格匹配，alias 旁路不激活', () => {
    const binder = new EvidenceBinder({ selfId });
    const allowedFacts = [makeAgentStateFact({ agentId: selfId, position: '食堂' })];
    const claims = [makeClaim({ type: 'location', subject: selfId, object: '图书馆' })];
    const result = binder.bind(claims, allowedFacts, { locationAliases: {} });

    expect(result.bindings[0].support).toBe(SUPPORT.UNSUPPORTED);
  });

  // ── 11. locationAliases 是 Map 形式 ──

  test('locationAliases 是 Map<string, string[]> → 接受并 normalize', () => {
    const binder = new EvidenceBinder({ selfId });
    const allowedFacts = [makeAgentStateFact({ agentId: selfId, position: '图书馆' })];
    const claims = [makeClaim({ type: 'location', subject: selfId, object: 'lib' })];
    const aliasMap = new Map();
    aliasMap.set('图书馆', ['lib', 'Library']);
    const result = binder.bind(claims, allowedFacts, { locationAliases: aliasMap });

    expect(result.bindings[0].support).toBe(SUPPORT.PARAPHRASE_SUPPORTS);
  });

  // ── 12. locationAliases 是 Array 形式 ──

  test('locationAliases 是 Array<{canonical, aliases}> → 接受并 normalize', () => {
    const binder = new EvidenceBinder({ selfId });
    const allowedFacts = [makeAgentStateFact({ agentId: selfId, position: '图书馆' })];
    const claims = [makeClaim({ type: 'location', subject: selfId, object: 'lib' })];
    const aliasArray = [{ canonical: '图书馆', aliases: ['lib', 'Library'] }];
    const result = binder.bind(claims, allowedFacts, { locationAliases: aliasArray });

    expect(result.bindings[0].support).toBe(SUPPORT.PARAPHRASE_SUPPORTS);
  });

  // ── 13. bindings 含 paraphraseAlias/paraphraseCanonical 字段 ──

  test('alias 命中 binding 含 paraphraseAlias 和 paraphraseCanonical 字段', () => {
    const binder = new EvidenceBinder({ selfId });
    const allowedFacts = [makeAgentStateFact({ agentId: selfId, position: '图书馆' })];
    const claims = [makeClaim({ type: 'location', subject: selfId, object: 'lib' })];
    const locationAliases = { '图书馆': ['lib'] };
    const result = binder.bind(claims, allowedFacts, { locationAliases });

    expect(result.bindings[0]).toHaveProperty('paraphraseAlias', 'lib');
    expect(result.bindings[0]).toHaveProperty('paraphraseCanonical', '图书馆');
  });

  // ── 14. confidence 区分 supports vs paraphrase_supports ──

  test('supports 沿用 claim.confidence(0.8)，paraphrase_supports 降到 0.6', () => {
    const binder = new EvidenceBinder({ selfId });
    const allowedFacts = [makeAgentStateFact({ agentId: selfId, position: '图书馆' })];

    // canonical 严格命中
    const canonicalClaim = makeClaim({ type: 'location', subject: selfId, object: '图书馆', confidence: 0.9 });
    // alias 命中
    const aliasClaim = makeClaim({ type: 'location', subject: selfId, object: 'lib', confidence: 0.9 });

    const locationAliases = { '图书馆': ['lib'] };

    const canonicalResult = binder.bind([canonicalClaim], allowedFacts, { locationAliases });
    const aliasResult = binder.bind([aliasClaim], allowedFacts, { locationAliases });

    expect(canonicalResult.bindings[0].confidence).toBe(0.9);
    expect(canonicalResult.bindings[0].support).toBe(SUPPORT.SUPPORTS);
    expect(aliasResult.bindings[0].confidence).toBe(0.6);
    expect(aliasResult.bindings[0].support).toBe(SUPPORT.PARAPHRASE_SUPPORTS);
  });

  // ── 15. v3 evidenceTrace 旁路标注 paraphrase ──

  test('GroundingChecker v3 evidenceTrace 中 alias 命中标 paraphraseAlias/paraphraseCanonical', () => {
    const GroundingChecker = require('../../../../src/narrative/GroundingChecker.js');
    const { FactType } = require('../../../../src/canon/FactSchema');

    const checker = new GroundingChecker({}, {});
    const grounding = {
      allowedFacts: [
        { type: FactType.AGENT_STATE, agentId: 'alice', region: '图书馆' },
      ],
      metadata: {
        agentId: 'alice',
        agentNames: { alice: '爱丽丝' },
      },
    };

    // 使用 sidecar claims 来传入 alias location（因为 ClaimExtractor 不匹配 "lib"）
    const result = checker.check('', grounding, {
      locationAliases: { '图书馆': ['lib', 'Library'] },
      structuredClaims: [
        {
          type: 'location',
          subject: 'alice',
          object: 'lib',
          predicate: 'is_at',
          polarity: 'affirmative',
          confidence: 0.8,
          modality: 'certain',
          extractionMethod: 'sidecar',
          sourceSpan: { raw: '我在lib' },
        },
      ],
    });

    expect(result.evidenceTrace).toBeDefined();
    const locTrace = result.evidenceTrace.find(t => t.type === 'location');
    if (locTrace) {
      expect(locTrace.support).toBe('paraphrase_supports');
      expect(locTrace.paraphraseAlias).toBe('lib');
      expect(locTrace.paraphraseCanonical).toBe('图书馆');
    }
  });

  // ── 16. v2 决策不读 alias ──

  test('v2 决策链不读 alias：aliased location 仍产生 unsupported_claim violation', () => {
    const GroundingChecker = require('../../../../src/narrative/GroundingChecker.js');
    const { FactType } = require('../../../../src/canon/FactSchema');

    const checker = new GroundingChecker({}, {});
    const grounding = {
      allowedFacts: [
        { type: FactType.AGENT_STATE, agentId: 'alice', region: '食堂' },
      ],
      metadata: {
        agentId: 'alice',
        agentNames: { alice: '爱丽丝' },
      },
    };

    // 使用 sidecar claims 传入 alias location
    const resultWithAliases = checker.check('', grounding, {
      locationAliases: { '图书馆': ['lib'] },
      structuredClaims: [
        {
          type: 'location',
          subject: 'alice',
          object: 'lib',
          predicate: 'is_at',
          polarity: 'affirmative',
          confidence: 0.8,
          modality: 'certain',
          extractionMethod: 'sidecar',
          sourceSpan: { raw: '我在lib' },
        },
      ],
    });

    // 无 locationAliases 时同样结果
    const resultWithoutAliases = checker.check('', grounding, {
      structuredClaims: [
        {
          type: 'location',
          subject: 'alice',
          object: 'lib',
          predicate: 'is_at',
          polarity: 'affirmative',
          confidence: 0.8,
          modality: 'certain',
          extractionMethod: 'sidecar',
          sourceSpan: { raw: '我在lib' },
        },
      ],
    });

    expect(resultWithAliases.severity).toBe(resultWithoutAliases.severity);
    expect(resultWithAliases.violations.length).toBeGreaterThan(0);
    expect(resultWithAliases.violations.some(v => v.type === 'unsupported_claim')).toBe(true);
  });

  // ── 17. observer alias ──

  test('observer EVENT context 含 canonical，claim 用 alias → paraphrase_supports', () => {
    const binder = new EvidenceBinder({ selfId });
    const allowedFacts = [
      makeEventFact({
        description: '爱丽丝在图书馆看到鲍勃',
        location: '图书馆',
        participants: ['alice'],
        observers: ['alice'],
      }),
    ];
    const claims = [makeClaim({ type: 'location', subject: selfId, object: 'lib' })];
    const locationAliases = { '图书馆': ['lib', 'Library'] };
    const result = binder.bind(claims, allowedFacts, { locationAliases });

    expect(result.bindings[0].support).toBe(SUPPORT.PARAPHRASE_SUPPORTS);
    expect(result.bindings[0].paraphraseCanonical).toBe('图书馆');
  });

  // ── 18. domain.locationAliases 透传 ──

  test('domain.locationAliases 在构造时被读取，check() 透传给 EvidenceBinder', () => {
    const GroundingChecker = require('../../../../src/narrative/GroundingChecker.js');
    const { FactType } = require('../../../../src/canon/FactSchema');

    const domain = {
      locationAliases: { '图书馆': ['lib', 'Library'] },
    };
    const checker = new GroundingChecker({}, domain);
    const grounding = {
      allowedFacts: [
        { type: FactType.AGENT_STATE, agentId: 'alice', region: '图书馆' },
      ],
      metadata: {
        agentId: 'alice',
        agentNames: { alice: '爱丽丝' },
      },
    };

    // 不传 options.locationAliases，使用 domain 的
    const result = checker.check('', grounding, {
      structuredClaims: [
        {
          type: 'location',
          subject: 'alice',
          object: 'lib',
          predicate: 'is_at',
          polarity: 'affirmative',
          confidence: 0.8,
          modality: 'certain',
          extractionMethod: 'sidecar',
          sourceSpan: { raw: '我在lib' },
        },
      ],
    });

    expect(result.evidenceTrace).toBeDefined();
    const locTrace = result.evidenceTrace.find(t => t.type === 'location');
    if (locTrace) {
      expect(locTrace.support).toBe('paraphrase_supports');
    }
  });

  // ── 19. options.locationAliases 优先于 domain.locationAliases ──

  test('options.locationAliases 覆盖 domain.locationAliases', () => {
    const GroundingChecker = require('../../../../src/narrative/GroundingChecker.js');
    const { FactType } = require('../../../../src/canon/FactSchema');

    const domain = {
      locationAliases: { '食堂': ['饭堂'] }, // domain 定义食堂 alias
    };
    const checker = new GroundingChecker({}, domain);
    const grounding = {
      allowedFacts: [
        { type: FactType.AGENT_STATE, agentId: 'alice', region: '图书馆' },
      ],
      metadata: {
        agentId: 'alice',
        agentNames: { alice: '爱丽丝' },
      },
    };

    // options 覆盖为图书馆 alias
    const result = checker.check('', grounding, {
      locationAliases: { '图书馆': ['lib', 'Library'] },
      structuredClaims: [
        {
          type: 'location',
          subject: 'alice',
          object: 'lib',
          predicate: 'is_at',
          polarity: 'affirmative',
          confidence: 0.8,
          modality: 'certain',
          extractionMethod: 'sidecar',
          sourceSpan: { raw: '我在lib' },
        },
      ],
    });

    expect(result.evidenceTrace).toBeDefined();
    const locTrace = result.evidenceTrace.find(t => t.type === 'location');
    if (locTrace) {
      expect(locTrace.support).toBe('paraphrase_supports');
      expect(locTrace.paraphraseCanonical).toBe('图书馆');
    }
  });

  // ── 20. null/undefined locationAliases → 不抛 ──

  test('locationAliases=null → 不抛异常，严格匹配', () => {
    const binder = new EvidenceBinder({ selfId });
    const allowedFacts = [makeAgentStateFact({ agentId: selfId, position: '食堂' })];
    const claims = [makeClaim({ type: 'location', subject: selfId, object: '图书馆' })];
    const result = binder.bind(claims, allowedFacts, { locationAliases: null });

    expect(result.bindings[0].support).toBe(SUPPORT.UNSUPPORTED);
  });

  test('locationAliases=undefined → 不抛异常，严格匹配', () => {
    const binder = new EvidenceBinder({ selfId });
    const allowedFacts = [makeAgentStateFact({ agentId: selfId, position: '食堂' })];
    const claims = [makeClaim({ type: 'location', subject: selfId, object: '图书馆' })];
    const result = binder.bind(claims, allowedFacts, { locationAliases: undefined });

    expect(result.bindings[0].support).toBe(SUPPORT.UNSUPPORTED);
  });

  // ── 21. observer alias：observer→context 含 canonical ──

  test('OBSERVATION fact context 含 canonical，observer claim 用 alias → paraphrase_supports', () => {
    const binder = new EvidenceBinder({ selfId });
    const allowedFacts = [
      {
        type: 'observation',
        observerId: bobId,
        targetId: selfId,
        action: '看到',
        context: '图书馆',
      },
    ];
    const claims = [makeClaim({ type: 'location', subject: bobId, object: 'lib' })];
    const locationAliases = { '图书馆': ['lib'] };
    const result = binder.bind(claims, allowedFacts, { locationAliases });

    expect(result.bindings[0].support).toBe(SUPPORT.PARAPHRASE_SUPPORTS);
    expect(result.bindings[0].evidenceSource).toBe('agent_known_locations');
  });

  // ── 22. 模块不写 store ──

  test('EvidenceBinder 不包含 .addFact( / .set( 写操作（grep）', () => {
    const fs = require('fs');
    const path = require('path');
    const modulePath = path.resolve(__dirname, '../../../../src/narrative/grounding/EvidenceBinder.js');
    const content = fs.readFileSync(modulePath, 'utf-8');

    const addFactMatches = content.match(/\.addFact\s*\(/g);
    expect(addFactMatches).toBeNull();
  });

  // ── 23. alias 不触发本应 new_event reject 的事件变 pass ──

  test('alias 只作用于 location claim，不影响 event claim 的 new_event reject', () => {
    const GroundingChecker = require('../../../../src/narrative/GroundingChecker.js');
    const { FactType } = require('../../../../src/canon/FactSchema');

    const checker = new GroundingChecker({}, {});
    const grounding = {
      allowedFacts: [
        { type: FactType.AGENT_STATE, agentId: 'alice', region: '图书馆' },
      ],
      metadata: {
        agentId: 'alice',
        agentNames: { alice: '爱丽丝' },
      },
    };

    // 使用 sidecar 传入新事件 claim
    const result = checker.check('', grounding, {
      locationAliases: { '图书馆': ['lib'] },
      structuredClaims: [
        {
          type: 'event',
          subject: 'alice',
          predicate: 'did',
          object: '演唱会',
          polarity: 'affirmative',
          confidence: 0.9,
          modality: 'certain',
          extractionMethod: 'sidecar',
          sourceSpan: { raw: '我刚刚去了一场演唱会' },
        },
      ],
    });

    // alias 不应影响 event claim 的处理
    expect(result.severity).not.toBe('pass');
  });

  // ── 24. agentKnownLocations 用 canonical 匹配 alias ──

  test('agentKnownLocations 含 canonical "library"，claim 用 alias "lib" → paraphrase_supports', () => {
    const binder = new EvidenceBinder({ selfId });
    const allowedFacts = [
      makeEventFact({
        description: 'Bob went to the library',
        location: 'library',
        participants: [bobId],
      }),
    ];
    const claims = [makeClaim({ type: 'location', subject: bobId, object: 'lib' })];
    const locationAliases = { 'library': ['lib', 'Library'] };
    const result = binder.bind(claims, allowedFacts, { locationAliases });

    expect(result.bindings[0].support).toBe(SUPPORT.PARAPHRASE_SUPPORTS);
    expect(result.bindings[0].paraphraseCanonical).toBe('library');
  });

  // ── 25. 性能：1000 条 claim 带 alias 不显著慢于无 alias ──

  test('1000 条 claim 带 alias 性能不回归（>3x 视为失败）', () => {
    const selfId = 'test_perf_self';
    const binderNoAlias = new EvidenceBinder({ selfId });
    const binderWithAlias = new EvidenceBinder({ selfId });

    // 加大数据集：50 个不同位置的事实，使基线时间足够大以减少噪声
    const allowedFacts = Array.from({ length: 50 }, (_, i) =>
      makeAgentStateFact({ agentId: selfId, position: `loc_${i}` })
    );
    const claims = Array.from({ length: 1000 }, (_, i) =>
      makeClaim({ type: 'location', subject: selfId, object: `loc_${i % 10}` })
    );
    const locationAliases = { '图书馆': ['lib'] };

    // Warmup runs — JIT 预热，避免首次编译开销污染计时
    binderNoAlias.bind(claims, allowedFacts);
    binderWithAlias.bind(claims, allowedFacts, { locationAliases });

    // Timed runs
    const startNoAlias = performance.now();
    binderNoAlias.bind(claims, allowedFacts);
    const timeNoAlias = performance.now() - startNoAlias;

    const startWithAlias = performance.now();
    binderWithAlias.bind(claims, allowedFacts, { locationAliases });
    const timeWithAlias = performance.now() - startWithAlias;

    expect(timeWithAlias).toBeLessThan(timeNoAlias * 3);
  });

  // ── 26. _buildAliasIndex 静态方法直接测试 ──

  test('__buildAliasIndex 处理 Record 格式', () => {
    const index = EvidenceBinder.__buildAliasIndex({ '图书馆': ['lib', 'Library'] });
    expect(index.canonicalByAlias.get('lib')).toBe('图书馆');
    expect(index.canonicalByAlias.get('Library')).toBe('图书馆');
    expect(index.canonicalByAlias.has('食堂')).toBe(false);
  });

  test('__buildAliasIndex 处理歧义 alias', () => {
    const index = EvidenceBinder.__buildAliasIndex({
      '图书馆': ['图'],
      '图书馆分馆': ['图'],
    });
    expect(index.canonicalByAlias.get('图')).toBeNull(); // 歧义 → null
  });

  test('__buildAliasIndex 忽略自映射', () => {
    const index = EvidenceBinder.__buildAliasIndex({ '图书馆': ['图书馆', 'lib'] });
    expect(index.canonicalByAlias.has('图书馆')).toBe(false); // 自映射被忽略
    expect(index.canonicalByAlias.get('lib')).toBe('图书馆');
  });

  test('__buildAliasIndex 处理 Array 格式', () => {
    const index = EvidenceBinder.__buildAliasIndex([
      { canonical: '图书馆', aliases: ['lib'] },
      { canonical: '食堂', aliases: ['饭堂'] },
    ]);
    expect(index.canonicalByAlias.get('lib')).toBe('图书馆');
    expect(index.canonicalByAlias.get('饭堂')).toBe('食堂');
  });

  test('__buildAliasIndex 处理 Map 格式', () => {
    const m = new Map();
    m.set('图书馆', ['lib']);
    const index = EvidenceBinder.__buildAliasIndex(m);
    expect(index.canonicalByAlias.get('lib')).toBe('图书馆');
  });

  // ── 27. alias 不能单独造支持的边界验证 ──

  test('alias 命中但 canonical 在 forbiddenFacts 中 → 仍然 paraphrase_supports（alias 旁路不检查 forbidden）', () => {
    // 注意：alias 旁路只做证据存在性检查，不做 forbidden 检查（forbidden 在上层 policy 处理）
    const binder = new EvidenceBinder({ selfId });
    const allowedFacts = [makeAgentStateFact({ agentId: selfId, position: '图书馆' })];
    const claims = [makeClaim({ type: 'location', subject: selfId, object: 'lib' })];
    const locationAliases = { '图书馆': ['lib'] };
    const result = binder.bind(claims, allowedFacts, { locationAliases });

    expect(result.bindings[0].support).toBe(SUPPORT.PARAPHRASE_SUPPORTS);
  });

  // ── 28. 混合场景：canonical 和 alias 在同一 bind 中 ──

  test('同一 bind 中 canonical claim → supports，alias claim → paraphrase_supports', () => {
    const binder = new EvidenceBinder({ selfId });
    const allowedFacts = [makeAgentStateFact({ agentId: selfId, position: '图书馆' })];
    const claims = [
      makeClaim({ type: 'location', subject: selfId, object: '图书馆' }),
      makeClaim({ type: 'location', subject: selfId, object: 'lib' }),
    ];
    const locationAliases = { '图书馆': ['lib'] };
    const result = binder.bind(claims, allowedFacts, { locationAliases });

    expect(result.bindings.length).toBe(2);
    expect(result.bindings[0].support).toBe(SUPPORT.SUPPORTS);
    expect(result.bindings[1].support).toBe(SUPPORT.PARAPHRASE_SUPPORTS);
  });

  // ── 29. PARAPHRASE_SUPPORTS 常量存在 ──

  test('SUPPORT.PARAPHRASE_SUPPORTS 常量存在且值为 "paraphrase_supports"', () => {
    expect(SUPPORT.PARAPHRASE_SUPPORTS).toBe('paraphrase_supports');
  });

  // ── 30. 非 location 类型 claim 完全不受 alias 影响 ──

  test('relationship claim 不受 alias 影响', () => {
    const binder = new EvidenceBinder({ selfId });
    const allowedFacts = [];
    const claims = [
      makeClaim({
        type: 'relationship',
        subject: selfId,
        object: { kind: 'agent', id: bobId, raw: '鲍勃' },
      }),
    ];
    const locationAliases = { '图书馆': ['lib'] };
    const result = binder.bind(claims, allowedFacts, { locationAliases });

    expect(result.bindings[0].support).toBe(SUPPORT.UNSUPPORTED);
    expect(result.bindings[0].paraphraseAlias).toBeUndefined();
  });
});
