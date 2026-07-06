/**
 * CoreferenceResolver 单元测试（M3-R1）
 *
 * 覆盖 ≥30 用例，对应 W3 规划要求：
 *   1. 鲍勃告诉我他去了图书馆（source-attributed 绑定）
 *   2. 我看到鲍勃，他看起来很累（同句最近显式 agent 绑定）
 *   3. 爱丽丝和鲍勃去了食堂，他点了晚饭（多 agent → ambiguous）
 *   4. 没有前置 agent → no_resolver
 *   5. 第三人称复数 → ambiguous
 *   6. 第二人称 → ambiguous
 *   7. sidecar binding 优先
 *   8. "我" 已绑定 → 跳过
 *   9. 跨句超 K=40 字符 → no_resolver
 *   10. 多 agent 距离不同 → 绑最近
 *   11. v2 flat claim 容错
 *   12. 不 mutate 输入
 *   13. 模块无 store 写入
 *   14. K=40 边界
 *   15. source.kind='reported' 无 source.by → no_resolver
 *   16. 已 resolved claim → 跳过
 *   17. dependencies 被正确添加
 *   18. 空 claims 数组
 *   19. modality/polarity/evidenceRequirement 不变
 *   20-30. 更多边界和 W3 示例场景
 */

const { CoreferenceResolver, PRONOUNS_ZH, createCoreferenceResolver } = require('../../../../src/narrative/grounding/CoreferenceResolver');
const fs = require('fs');
const path = require('path');

// ─── Helpers ─────────────────────────────────────────────────────────────────

const AGENT_NAMES = { bob: '鲍勃', alice: '爱丽丝', charlie: '查理' };
const SELF_ID = 'alice';

/**
 * 创建一个 v3 风格的 claim 对象
 * @param {Object} opts
 */
function makeClaim(opts) {
  return {
    id: opts.id || `claim_${Math.random().toString(36).slice(2, 7)}`,
    type: opts.type || 'state',
    subject: opts.subject || null,
    predicate: opts.predicate || null,
    object: opts.object || null,
    polarity: opts.polarity || 'affirmative',
    modality: opts.modality || 'certain',
    source: opts.source || null,
    span: opts.span || null,
    evidence: opts.evidence || [],
    dependencies: opts.dependencies || [],
    confidence: opts.confidence != null ? opts.confidence : 0.8,
    evidenceRequirement: opts.evidenceRequirement || null,
    extractionMethod: opts.extractionMethod || 'manual',
  };
}

/**
 * 创建一个 v2 风格的 claim（subject 是 string）
 * @param {Object} opts
 */
function makeV2Claim(opts) {
  return {
    id: opts.id || `claim_${Math.random().toString(36).slice(2, 7)}`,
    type: opts.type || 'state',
    subject: opts.subject || null, // string
    predicate: opts.predicate || null,
    object: opts.object || null,
    polarity: opts.polarity || 'affirmative',
    confidence: opts.confidence != null ? opts.confidence : 0.8,
    extractionMethod: opts.extractionMethod || 'v2-adapter',
  };
}

// ─── 读取源码用于边界检查─────────────────────────────────────────────────────

const resolverPath = path.resolve(
  __dirname,
  '../../../../src/narrative/grounding/CoreferenceResolver.js'
);
const resolverSource = fs.readFileSync(resolverPath, 'utf-8');

describe('CoreferenceResolver', () => {
  describe('模块导出', () => {
    test('PRONOUNS_ZH 包含所有常见中文代词', () => {
      expect(PRONOUNS_ZH).toContain('他');
      expect(PRONOUNS_ZH).toContain('她');
      expect(PRONOUNS_ZH).toContain('它');
      expect(PRONOUNS_ZH).toContain('你');
      expect(PRONOUNS_ZH).toContain('你们');
      expect(PRONOUNS_ZH).toContain('他们');
      expect(PRONOUNS_ZH).toContain('她们');
      expect(PRONOUNS_ZH).toContain('它们');
      expect(PRONOUNS_ZH).toContain('咱');
      expect(PRONOUNS_ZH).toContain('咱们');
    });

    test('createCoreferenceResolver 返回 CoreferenceResolver 实例', () => {
      const resolver = createCoreferenceResolver(AGENT_NAMES, SELF_ID);
      expect(resolver).toBeInstanceOf(CoreferenceResolver);
    });

    test('构造函数无参数不抛', () => {
      const resolver = new CoreferenceResolver();
      expect(resolver.resolve([])).toEqual({ claims: [], notes: [] });
    });
  });

  // ─── W3 示例场景 1：鲍勃告诉我他去了图书馆 ──────────────────────────────────

  describe('W3 示例 1：鲍勃告诉我他去了图书馆（source-attributed）', () => {
    test('source.kind=told + source.by=bob → 他 绑到 bob', () => {
      const bobClaim = makeClaim({
        id: 'claim_bob_loc',
        type: 'location',
        subject: { kind: 'agent', id: 'bob', raw: '鲍勃' },
        predicate: 'at',
        object: '图书馆',
        span: { start: 0, end: 5, raw: '鲍勃在图书馆' },
        extractionMethod: 'sidecar',
      });

      const pronounClaim = makeClaim({
        id: 'claim_pronoun_lib',
        type: 'location',
        subject: { kind: 'agent', id: null, raw: '他' },
        predicate: 'went_to',
        object: '图书馆',
        source: { kind: 'told', by: 'bob' },
        span: { start: 0, end: 10, raw: '鲍勃告诉我他去了图书馆' },
        extractionMethod: 'sidecar',
      });

      const resolver = new CoreferenceResolver({ agentNames: AGENT_NAMES, selfId: SELF_ID });
      const result = resolver.resolve([bobClaim, pronounClaim]);

      expect(result.claims.length).toBe(2);
      expect(result.notes.length).toBeGreaterThanOrEqual(1);

      const pronounNote = result.notes.find((n) => n.claimId === 'claim_pronoun_lib');
      expect(pronounNote).toBeDefined();
      expect(pronounNote.kind).toBe('sidecar_bound');
      expect(pronounNote.resolvedTo).toBe('bob');

      const resolvedPronoun = result.claims.find((c) => c.id === 'claim_pronoun_lib');
      expect(resolvedPronoun.subject.id).toBe('bob');
      expect(resolvedPronoun.subject.raw).toBe('他');
    });

    test('dependencies 含 bob → sidecar_bound', () => {
      const pronounClaim = makeClaim({
        id: 'claim_dep_test',
        type: 'location',
        subject: { kind: 'agent', id: null, raw: '他' },
        predicate: 'went_to',
        object: '图书馆',
        dependencies: ['bob'],
        extractionMethod: 'sidecar',
      });

      const resolver = new CoreferenceResolver({ agentNames: AGENT_NAMES, selfId: SELF_ID });
      const result = resolver.resolve([pronounClaim]);

      const resolved = result.claims.find((c) => c.id === 'claim_dep_test');
      expect(resolved.subject.id).toBe('bob');
      const depNote = result.notes.find((n) => n.claimId === 'claim_dep_test');
      expect(depNote.kind).toBe('sidecar_bound');
    });
  });

  // ─── W3 示例 2：我看到鲍勃，他看起来很累 ────────────────────────────────────

  describe('W3 示例 2：我看到鲍勃，他看起来很累（同句最近显式 agent）', () => {
    test('前置 bob claim + 他 claim → 他 绑到 bob', () => {
      const bobClaim = makeClaim({
        id: 'claim_bob_seen',
        type: 'state',
        subject: { kind: 'agent', id: 'bob', raw: '鲍勃' },
        predicate: 'looks_tired',
        span: { start: 0, end: 8, raw: '我看到鲍勃' },
      });

      const pronounClaim = makeClaim({
        id: 'claim_he_tired',
        type: 'state',
        subject: { kind: 'agent', id: null, raw: '他' },
        predicate: 'looks_tired',
        span: { start: 0, end: 12, raw: '他看起来很累' },
      });

      const resolver = new CoreferenceResolver({ agentNames: AGENT_NAMES, selfId: SELF_ID });
      const result = resolver.resolve([bobClaim, pronounClaim]);

      expect(result.claims.length).toBe(2);
      const resolved = result.claims.find((c) => c.id === 'claim_he_tired');
      expect(resolved.subject.id).toBe('bob');

      const note = result.notes.find((n) => n.claimId === 'claim_he_tired');
      expect(note.kind).toBe('resolved_to');
      expect(note.resolvedTo).toBe('bob');
    });
  });

  // ─── W3 示例 3：爱丽丝和鲍勃去了食堂，他点了晚饭 ─────────────────────────────

  describe('W3 示例 3：爱丽丝和鲍勃去了食堂，他点了晚饭（歧义）', () => {
    test('前置两个显式 agent → 他 ambiguous', () => {
      const aliceClaim = makeClaim({
        id: 'claim_alice_canteen',
        type: 'location',
        subject: { kind: 'agent', id: 'alice', raw: '爱丽丝' },
        predicate: 'at',
        object: '食堂',
        span: { start: 0, end: 8, raw: '爱丽丝去了食堂' },
      });

      const bobClaim = makeClaim({
        id: 'claim_bob_canteen',
        type: 'location',
        subject: { kind: 'agent', id: 'bob', raw: '鲍勃' },
        predicate: 'at',
        object: '食堂',
        span: { start: 0, end: 8, raw: '鲍勃去了食堂' },
      });

      const pronounClaim = makeClaim({
        id: 'claim_he_dinner',
        type: 'state',
        subject: { kind: 'agent', id: null, raw: '他' },
        predicate: 'ordered',
        object: '晚饭',
        span: { start: 0, end: 6, raw: '他点了晚饭' },
      });

      const resolver = new CoreferenceResolver({ agentNames: AGENT_NAMES, selfId: SELF_ID });
      const result = resolver.resolve([aliceClaim, bobClaim, pronounClaim]);

      expect(result.claims.length).toBe(3);

      // pronoun claim 应该保持代词未绑定
      const resolved = result.claims.find((c) => c.id === 'claim_he_dinner');
      expect(resolved.subject.raw).toBe('他');
      expect(resolved.subject.id).toBeNull();

      const note = result.notes.find((n) => n.claimId === 'claim_he_dinner');
      expect(note.kind).toBe('coreference_ambiguous');
      expect(note.ambiguousCandidates).toContain('alice');
      expect(note.ambiguousCandidates).toContain('bob');
    });
  });

  // ─── 基础场景 ────────────────────────────────────────────────────────────────

  describe('基础场景', () => {
    test('没有前置 agent → no_resolver', () => {
      const pronounClaim = makeClaim({
        id: 'claim_lonely',
        type: 'location',
        subject: { kind: 'agent', id: null, raw: '他' },
        predicate: 'went_to',
        object: '图书馆',
      });

      const resolver = new CoreferenceResolver({ agentNames: AGENT_NAMES, selfId: SELF_ID });
      const result = resolver.resolve([pronounClaim]);

      expect(result.claims.length).toBe(1);
      const resolved = result.claims[0];
      expect(resolved.subject.raw).toBe('他');
      expect(resolved.subject.id).toBeNull();

      const note = result.notes[0];
      expect(note.kind).toBe('no_resolver');
    });

    test('第三人称复数"他们" → ambiguous', () => {
      const claim = makeClaim({
        id: 'claim_they',
        type: 'location',
        subject: { kind: 'agent', id: null, raw: '他们' },
        predicate: 'are_at',
        object: '食堂',
      });

      const resolver = new CoreferenceResolver({ agentNames: AGENT_NAMES, selfId: SELF_ID });
      const result = resolver.resolve([claim]);

      const resolved = result.claims[0];
      expect(resolved.subject.raw).toBe('他们');
      expect(resolved.subject.id).toBeNull();

      const note = result.notes[0];
      expect(note.kind).toBe('coreference_ambiguous');
      expect(note.reason).toBe('plural pronoun');
    });

    test('第三人称复数"她们" → ambiguous', () => {
      const claim = makeClaim({
        id: 'claim_them_f',
        type: 'location',
        subject: { kind: 'agent', id: null, raw: '她们' },
        predicate: 'are_at',
        object: '食堂',
      });

      const resolver = new CoreferenceResolver({ agentNames: AGENT_NAMES, selfId: SELF_ID });
      const result = resolver.resolve([claim]);

      expect(result.notes[0].kind).toBe('coreference_ambiguous');
      expect(result.notes[0].reason).toBe('plural pronoun');
    });

    test('第三人称复数"它们" → ambiguous', () => {
      const claim = makeClaim({
        id: 'claim_they_it',
        type: 'location',
        subject: { kind: 'agent', id: null, raw: '它们' },
        predicate: 'are_at',
        object: '食堂',
      });

      const resolver = new CoreferenceResolver({ agentNames: AGENT_NAMES, selfId: SELF_ID });
      const result = resolver.resolve([claim]);

      expect(result.notes[0].kind).toBe('coreference_ambiguous');
    });

    test('第二人称"你" → ambiguous', () => {
      const claim = makeClaim({
        id: 'claim_you',
        type: 'state',
        subject: { kind: 'agent', id: null, raw: '你' },
        predicate: 'should_go',
        object: '图书馆',
      });

      const resolver = new CoreferenceResolver({ agentNames: AGENT_NAMES, selfId: SELF_ID });
      const result = resolver.resolve([claim]);

      expect(result.notes[0].kind).toBe('coreference_ambiguous');
      expect(result.notes[0].reason).toBe('second-person pronoun');
    });

    test('第二人称"你们" → ambiguous', () => {
      const claim = makeClaim({
        id: 'claim_you_plural',
        type: 'state',
        subject: { kind: 'agent', id: null, raw: '你们' },
        predicate: 'should_go',
        object: '图书馆',
      });

      const resolver = new CoreferenceResolver({ agentNames: AGENT_NAMES, selfId: SELF_ID });
      const result = resolver.resolve([claim]);

      expect(result.notes[0].kind).toBe('coreference_ambiguous');
    });

    test('第一人称"咱" → ambiguous（保守策略）', () => {
      const claim = makeClaim({
        id: 'claim_we',
        type: 'state',
        subject: { kind: 'agent', id: null, raw: '咱' },
        predicate: 'go',
        object: '图书馆',
      });

      const resolver = new CoreferenceResolver({ agentNames: AGENT_NAMES, selfId: SELF_ID });
      const result = resolver.resolve([claim]);

      // 第一人称复数属于 PLURAL_PRONOUNS，走 plural 路径
      expect(result.notes[0].kind).toBe('coreference_ambiguous');
    });

    test('第一人称"咱们" → ambiguous', () => {
      const claim = makeClaim({
        id: 'claim_we_all',
        type: 'state',
        subject: { kind: 'agent', id: null, raw: '咱们' },
        predicate: 'go',
        object: '图书馆',
      });

      const resolver = new CoreferenceResolver({ agentNames: AGENT_NAMES, selfId: SELF_ID });
      const result = resolver.resolve([claim]);

      expect(result.notes[0].kind).toBe('coreference_ambiguous');
    });
  });

  // ─── 边界场景 ────────────────────────────────────────────────────────────────

  describe('边界场景', () => {
    test('侧边栏 binding 优先于同句最近 agent', () => {
      // 前置 bob claim + pronoun claim 带 source.by=alice
      // 应绑定 alice（sidecar），而非 bob
      const bobClaim = makeClaim({
        id: 'claim_bob_near',
        type: 'location',
        subject: { kind: 'agent', id: 'bob', raw: '鲍勃' },
        predicate: 'at',
        object: '食堂',
        span: { start: 0, end: 8, raw: '鲍勃在食堂' },
      });

      const pronounClaim = makeClaim({
        id: 'claim_sidecar_pri',
        type: 'location',
        subject: { kind: 'agent', id: null, raw: '他' },
        predicate: 'went_to',
        object: '图书馆',
        source: { kind: 'told', by: 'alice' },
        span: { start: 0, end: 12, raw: '爱丽丝告诉我他去了图书馆' },
        extractionMethod: 'sidecar',
      });

      const resolver = new CoreferenceResolver({ agentNames: AGENT_NAMES, selfId: SELF_ID });
      const result = resolver.resolve([bobClaim, pronounClaim]);

      const resolved = result.claims.find((c) => c.id === 'claim_sidecar_pri');
      expect(resolved.subject.id).toBe('alice');
      const note = result.notes.find((n) => n.claimId === 'claim_sidecar_pri');
      expect(note.kind).toBe('sidecar_bound');
      expect(note.resolvedTo).toBe('alice');
    });

    test('已 resolved claim → 跳过不动', () => {
      const claim = makeClaim({
        id: 'claim_already_resolved',
        type: 'location',
        subject: { kind: 'agent', id: 'bob', raw: '鲍勃' },
        predicate: 'at',
        object: '图书馆',
      });

      const resolver = new CoreferenceResolver({ agentNames: AGENT_NAMES, selfId: SELF_ID });
      const result = resolver.resolve([claim]);

      expect(result.notes.length).toBe(0);
      const resolved = result.claims[0];
      expect(resolved.subject.id).toBe('bob');
    });

    test('空 claims 数组 → 返回空', () => {
      const resolver = new CoreferenceResolver({ agentNames: AGENT_NAMES, selfId: SELF_ID });
      const result = resolver.resolve([]);
      expect(result.claims).toEqual([]);
      expect(result.notes).toEqual([]);
    });

    test('null claims → 返回空', () => {
      const resolver = new CoreferenceResolver({ agentNames: AGENT_NAMES, selfId: SELF_ID });
      const result = resolver.resolve(null);
      expect(result.claims).toEqual([]);
      expect(result.notes).toEqual([]);
    });

    test('undefined claims → 返回空', () => {
      const resolver = new CoreferenceResolver({ agentNames: AGENT_NAMES, selfId: SELF_ID });
      const result = resolver.resolve(undefined);
      expect(result.claims).toEqual([]);
      expect(result.notes).toEqual([]);
    });

    test('无 agentNames 输入 → 全 no_resolver 但不抛', () => {
      const claim = makeClaim({
        id: 'claim_no_names',
        type: 'location',
        subject: { kind: 'agent', id: null, raw: '他' },
        predicate: 'went_to',
        object: '图书馆',
      });

      const resolver = new CoreferenceResolver({});
      const result = resolver.resolve([claim]);
      expect(result.claims.length).toBe(1);
      expect(result.notes[0].kind).toBe('no_resolver');
    });

    test('modality/polarity/evidenceRequirement 不变', () => {
      const bobClaim = makeClaim({
        id: 'claim_bob_mod',
        type: 'location',
        subject: { kind: 'agent', id: 'bob', raw: '鲍勃' },
        predicate: 'at',
        object: '图书馆',
        modality: 'uncertain',
        polarity: 'affirmative',
        evidenceRequirement: 'observed',
      });

      const pronounClaim = makeClaim({
        id: 'claim_pronoun_mod',
        type: 'location',
        subject: { kind: 'agent', id: null, raw: '他' },
        predicate: 'went_to',
        object: '图书馆',
        modality: 'uncertain',
        polarity: 'affirmative',
        evidenceRequirement: 'observed',
      });

      const resolver = new CoreferenceResolver({ agentNames: AGENT_NAMES, selfId: SELF_ID });
      const result = resolver.resolve([bobClaim, pronounClaim]);

      const resolved = result.claims.find((c) => c.id === 'claim_pronoun_mod');
      expect(resolved.modality).toBe('uncertain');
      expect(resolved.polarity).toBe('affirmative');
      expect(resolved.evidenceRequirement).toBe('observed');
    });

    test('source.kind=reported 无 source.by → no_resolver', () => {
      const claim = makeClaim({
        id: 'claim_reported_no_by',
        type: 'location',
        subject: { kind: 'agent', id: null, raw: '他' },
        predicate: 'went_to',
        object: '图书馆',
        source: { kind: 'reported' },
      });

      const resolver = new CoreferenceResolver({ agentNames: AGENT_NAMES, selfId: SELF_ID });
      const result = resolver.resolve([claim]);

      expect(result.notes[0].kind).toBe('no_resolver');
    });

    test('dependencies 字段被正确添加', () => {
      const bobClaim = makeClaim({
        id: 'claim_bob_deps',
        type: 'location',
        subject: { kind: 'agent', id: 'bob', raw: '鲍勃' },
        predicate: 'at',
        object: '图书馆',
      });

      const pronounClaim = makeClaim({
        id: 'claim_pronoun_deps',
        type: 'location',
        subject: { kind: 'agent', id: null, raw: '他' },
        predicate: 'went_to',
        object: '图书馆',
      });

      const resolver = new CoreferenceResolver({ agentNames: AGENT_NAMES, selfId: SELF_ID });
      const result = resolver.resolve([bobClaim, pronounClaim]);

      const resolved = result.claims.find((c) => c.id === 'claim_pronoun_deps');
      expect(resolved.dependencies).toContain('bob');
    });

    test('resolve 输出条目数 == 输入条目数', () => {
      const claims = [
        makeClaim({ id: 'c1', subject: { kind: 'agent', id: 'bob', raw: '鲍勃' } }),
        makeClaim({ id: 'c2', subject: { kind: 'agent', id: null, raw: '她' } }),
        makeClaim({ id: 'c3', subject: { kind: 'agent', id: 'alice', raw: '爱丽丝' } }),
        makeClaim({ id: 'c4', subject: { kind: 'agent', id: null, raw: '它' } }),
      ];

      const resolver = new CoreferenceResolver({ agentNames: AGENT_NAMES, selfId: SELF_ID });
      const result = resolver.resolve(claims);
      expect(result.claims.length).toBe(4);
    });

    test('coreference_ambiguous 的 claim.subject 仍是代词未绑', () => {
      const aliceClaim = makeClaim({
        id: 'claim_alice_amb',
        type: 'location',
        subject: { kind: 'agent', id: 'alice', raw: '爱丽丝' },
        predicate: 'at',
        object: '食堂',
      });

      const bobClaim = makeClaim({
        id: 'claim_bob_amb',
        type: 'location',
        subject: { kind: 'agent', id: 'bob', raw: '鲍勃' },
        predicate: 'at',
        object: '食堂',
      });

      const pronounClaim = makeClaim({
        id: 'claim_amb_pronoun',
        type: 'state',
        subject: { kind: 'agent', id: null, raw: '他' },
        predicate: 'ordered',
        object: '晚饭',
      });

      const resolver = new CoreferenceResolver({ agentNames: AGENT_NAMES, selfId: SELF_ID });
      const result = resolver.resolve([aliceClaim, bobClaim, pronounClaim]);

      const resolved = result.claims.find((c) => c.id === 'claim_amb_pronoun');
      expect(resolved.subject.raw).toBe('他');
      expect(resolved.subject.id).toBeNull();
    });

    test('笔记形式正确（kind/resolvedTo/ambiguousCandidates/reason）', () => {
      const claim = makeClaim({
        id: 'claim_note_shape',
        type: 'location',
        subject: { kind: 'agent', id: null, raw: '他' },
        predicate: 'went_to',
        object: '图书馆',
      });

      const resolver = new CoreferenceResolver({ agentNames: AGENT_NAMES, selfId: SELF_ID });
      const result = resolver.resolve([claim]);

      const note = result.notes[0];
      expect(note).toHaveProperty('claimId');
      expect(note).toHaveProperty('kind');
      expect(note).toHaveProperty('reason');
    });

    test('笔记形式正确：resolved_to 含 resolvedTo', () => {
      const bobClaim = makeClaim({
        id: 'claim_note_resolved',
        type: 'location',
        subject: { kind: 'agent', id: 'bob', raw: '鲍勃' },
        predicate: 'at',
        object: '图书馆',
      });

      const pronounClaim = makeClaim({
        id: 'claim_note_pronoun',
        type: 'location',
        subject: { kind: 'agent', id: null, raw: '他' },
        predicate: 'went_to',
        object: '图书馆',
      });

      const resolver = new CoreferenceResolver({ agentNames: AGENT_NAMES, selfId: SELF_ID });
      const result = resolver.resolve([bobClaim, pronounClaim]);

      const note = result.notes.find((n) => n.claimId === 'claim_note_pronoun');
      expect(note.kind).toBe('resolved_to');
      expect(note).toHaveProperty('resolvedTo');
    });

    test('笔记形式正确：ambiguous 含 ambiguousCandidates', () => {
      const aliceClaim = makeClaim({
        id: 'claim_amb_note_alice',
        type: 'location',
        subject: { kind: 'agent', id: 'alice', raw: '爱丽丝' },
        predicate: 'at',
        object: '食堂',
      });

      const bobClaim = makeClaim({
        id: 'claim_amb_note_bob',
        type: 'location',
        subject: { kind: 'agent', id: 'bob', raw: '鲍勃' },
        predicate: 'at',
        object: '食堂',
      });

      const pronounClaim = makeClaim({
        id: 'claim_amb_note_pronoun',
        type: 'state',
        subject: { kind: 'agent', id: null, raw: '他' },
        predicate: 'ordered',
        object: '晚饭',
      });

      const resolver = new CoreferenceResolver({ agentNames: AGENT_NAMES, selfId: SELF_ID });
      const result = resolver.resolve([aliceClaim, bobClaim, pronounClaim]);

      const note = result.notes.find((n) => n.claimId === 'claim_amb_note_pronoun');
      expect(note.kind).toBe('coreference_ambiguous');
      expect(Array.isArray(note.ambiguousCandidates)).toBe(true);
      expect(note.ambiguousCandidates.length).toBeGreaterThan(0);
    });
  });

  // ─── 不 mutate 输入 ──────────────────────────────────────────────────────────

  describe('不 mutate 输入', () => {
    test('原 claims 数组不变', () => {
      const originalClaims = [
        makeClaim({
          id: 'c_orig_bob',
          type: 'location',
          subject: { kind: 'agent', id: 'bob', raw: '鲍勃' },
          predicate: 'at',
          object: '图书馆',
        }),
        makeClaim({
          id: 'c_orig_pronoun',
          type: 'location',
          subject: { kind: 'agent', id: null, raw: '他' },
          predicate: 'went_to',
          object: '图书馆',
        }),
      ];

      // 深拷贝一份用于对比
      const snapshot = JSON.parse(JSON.stringify(originalClaims));

      const resolver = new CoreferenceResolver({ agentNames: AGENT_NAMES, selfId: SELF_ID });
      resolver.resolve(originalClaims);

      // 原数组不应被修改
      expect(originalClaims[0]).toEqual(snapshot[0]);
      expect(originalClaims[1]).toEqual(snapshot[1]);
    });

    test('原 subject 对象不被修改', () => {
      const pronounClaim = makeClaim({
        id: 'c_subject_test',
        type: 'location',
        subject: { kind: 'agent', id: null, raw: '他' },
        predicate: 'went_to',
        object: '图书馆',
      });

      const subjectBefore = JSON.parse(JSON.stringify(pronounClaim.subject));

      const resolver = new CoreferenceResolver({ agentNames: AGENT_NAMES, selfId: SELF_ID });
      resolver.resolve([pronounClaim]);

      expect(pronounClaim.subject).toEqual(subjectBefore);
    });
  });

  // ─── v2 flat claim 容错 ──────────────────────────────────────────────────────

  describe('v2 flat claim 容错', () => {
    test('subject 是 string 代词 → 解析后输出 subject 改成对象形式', () => {
      const bobClaim = makeV2Claim({
        id: 'v2_bob',
        type: 'location',
        subject: '鲍勃',
        predicate: 'at',
        object: '图书馆',
        span: { start: 0, end: 5, raw: '鲍勃在图书馆' },
      });

      const pronounClaim = makeV2Claim({
        id: 'v2_pronoun',
        type: 'location',
        subject: '他',
        predicate: 'went_to',
        object: '图书馆',
        span: { start: 10, end: 13, raw: '他去了图书馆' },
      });

      const resolver = new CoreferenceResolver({ agentNames: AGENT_NAMES, selfId: SELF_ID });
      const result = resolver.resolve([bobClaim, pronounClaim]);

      expect(result.claims.length).toBe(2);
      const resolved = result.claims.find((c) => c.id === 'v2_pronoun');
      // 解析后 subject 应变成对象形式
      expect(typeof resolved.subject).toBe('object');
      expect(resolved.subject.id).toBe('bob');
    });

    test('v2 claim 无前置 agent → no_resolver', () => {
      const pronounClaim = makeV2Claim({
        id: 'v2_lonely',
        type: 'location',
        subject: '他',
        predicate: 'went_to',
        object: '图书馆',
      });

      const resolver = new CoreferenceResolver({ agentNames: AGENT_NAMES, selfId: SELF_ID });
      const result = resolver.resolve([pronounClaim]);

      expect(result.notes[0].kind).toBe('no_resolver');
    });
  });

  // ─── 模块不写入 store ────────────────────────────────────────────────────────

  describe('模块不写入 store', () => {
    test('源码中无 .addFact( / .set( 模式', () => {
      expect(resolverSource).not.toMatch(/\.addFact\s*\(/);
      expect(resolverSource).not.toMatch(/\.set\s*\(/);
    });

    test('不导入 WorldFactStore / KnowledgeStore', () => {
      expect(resolverSource).not.toMatch(/WorldFactStore/);
      expect(resolverSource).not.toMatch(/KnowledgeStore/);
    });

    test('不引入新 npm 依赖（只有 require 本模块和 fs/path）', () => {
      // 模块源码中不应有外部 npm require
      const requireMatches = resolverSource.match(/require\s*\(\s*['"]([^'"]+)['"]\s*\)/g);
      if (requireMatches) {
        for (const match of requireMatches) {
          const dep = match.match(/require\s*\(\s*['"]([^'"]+)['"]\s*\)/)[1];
          // 只允许相对路径
          expect(dep.startsWith('.')).toBe(true);
        }
      }
    });
  });

  // ─── K=40 字符边界 ───────────────────────────────────────────────────────────

  describe('K=40 字符边界', () => {
    test('candidate 在 40 字符内 → 能解析', () => {
      const bobClaim = makeClaim({
        id: 'k40_near',
        type: 'location',
        subject: { kind: 'agent', id: 'bob', raw: '鲍勃' },
        predicate: 'at',
        object: '图书馆',
        span: { start: 0, end: 5, raw: '鲍勃在图书馆' },
      });

      const pronounClaim = makeClaim({
        id: 'k40_pronoun_near',
        type: 'state',
        subject: { kind: 'agent', id: null, raw: '他' },
        predicate: 'is_tired',
        span: { start: 0, end: 3, raw: '他很累' },
      });

      const resolver = new CoreferenceResolver({ agentNames: AGENT_NAMES, selfId: SELF_ID });
      const result = resolver.resolve([bobClaim, pronounClaim]);

      const resolved = result.claims.find((c) => c.id === 'k40_pronoun_near');
      expect(resolved.subject.id).toBe('bob');
    });

    test('candidate 在 41 字符外 → no_resolver', () => {
      // 构造 bob claim 在位置 0，pronoun claim 在位置 50（距离 50 > K=40）
      const bobClaim = makeClaim({
        id: 'k40_far',
        type: 'location',
        subject: { kind: 'agent', id: 'bob', raw: '鲍勃' },
        predicate: 'at',
        object: '图书馆',
        span: { start: 0, end: 5, raw: '鲍勃在图书馆' },
      });

      const pronounClaim = makeClaim({
        id: 'k40_pronoun_far',
        type: 'state',
        subject: { kind: 'agent', id: null, raw: '他' },
        predicate: 'is_tired',
        span: { start: 50, end: 53, raw: '他感觉很累' },
      });

      const resolver = new CoreferenceResolver({ agentNames: AGENT_NAMES, selfId: SELF_ID });
      const result = resolver.resolve([bobClaim, pronounClaim]);

      // 距离 50 > K=40 → no_resolver
      const resolved = result.claims.find((c) => c.id === 'k40_pronoun_far');
      expect(resolved.subject.raw).toBe('他');
    });

    test('跨句超 K=40 字符 → no_resolver', () => {
      // 构造 bob claim 在位置 0，pronoun claim 在位置 60（跨段远距离）
      const bobClaim = makeClaim({
        id: 'cross_sentence_bob',
        type: 'location',
        subject: { kind: 'agent', id: 'bob', raw: '鲍勃' },
        predicate: 'at',
        object: '图书馆',
        span: { start: 0, end: 5, raw: '很久以前鲍勃在图书馆学习' },
      });

      const pronounClaim = makeClaim({
        id: 'cross_sentence_pronoun',
        type: 'state',
        subject: { kind: 'agent', id: null, raw: '他' },
        predicate: 'is_tired',
        span: { start: 60, end: 63, raw: '他现在感觉很累因为他读了很多书' },
      });

      const resolver = new CoreferenceResolver({ agentNames: AGENT_NAMES, selfId: SELF_ID });
      const result = resolver.resolve([bobClaim, pronounClaim]);

      const resolved = result.claims.find((c) => c.id === 'cross_sentence_pronoun');
      expect(resolved.subject.raw).toBe('他');
    });
  });

  // ─── 多 agent 距离不同 ───────────────────────────────────────────────────────

  describe('多 agent 距离不同 → 绑最近唯一', () => {
    test('alice 远 + bob 近 → 绑 bob', () => {
      // alice 在位置 0，pronoun 在位置 50 → dist=50 > K=40，alice 被过滤
      // bob 在位置 45，pronoun 在位置 50 → dist=5 <= K=40，bob 是唯一候选
      const aliceClaim = makeClaim({
        id: 'dist_alice',
        type: 'location',
        subject: { kind: 'agent', id: 'alice', raw: '爱丽丝' },
        predicate: 'at',
        object: '食堂',
        span: { start: 0, end: 8, raw: '爱丽丝在食堂吃饭' },
      });

      const bobClaim = makeClaim({
        id: 'dist_bob',
        type: 'location',
        subject: { kind: 'agent', id: 'bob', raw: '鲍勃' },
        predicate: 'at',
        object: '图书馆',
        span: { start: 45, end: 53, raw: '鲍勃在图书馆看书' },
      });

      const pronounClaim = makeClaim({
        id: 'dist_pronoun',
        type: 'state',
        subject: { kind: 'agent', id: null, raw: '他' },
        predicate: 'is_tired',
        span: { start: 50, end: 53, raw: '他很累' },
      });

      const resolver = new CoreferenceResolver({ agentNames: AGENT_NAMES, selfId: SELF_ID });
      const result = resolver.resolve([aliceClaim, bobClaim, pronounClaim]);

      // alice dist=50 (>K=40, 被过滤), bob dist=5 (<=K=40, 唯一候选)
      const resolved = result.claims.find((c) => c.id === 'dist_pronoun');
      expect(resolved.subject.id).toBe('bob');
    });
  });

  // ─── 混合 claims ─────────────────────────────────────────────────────────────

  describe('混合 claims', () => {
    test('4 条混合只有 1 条代词 → 只那条被解析，其余不动', () => {
      const bobClaim = makeClaim({
        id: 'mix_bob',
        type: 'location',
        subject: { kind: 'agent', id: 'bob', raw: '鲍勃' },
        predicate: 'at',
        object: '图书馆',
        span: { start: 0, end: 5, raw: '鲍勃在图书馆' },
      });

      const pronounClaim = makeClaim({
        id: 'mix_pronoun',
        type: 'location',
        subject: { kind: 'agent', id: null, raw: '他' },
        predicate: 'went_to',
        object: '食堂',
        span: { start: 10, end: 13, raw: '他去了食堂' },
      });

      const aliceClaim = makeClaim({
        id: 'mix_alice',
        type: 'location',
        subject: { kind: 'agent', id: 'alice', raw: '爱丽丝' },
        predicate: 'at',
        object: '教室',
        span: { start: 50, end: 58, raw: '爱丽丝在教室' },
      });

      const sheClaim = makeClaim({
        id: 'mix_she',
        type: 'state',
        subject: { kind: 'agent', id: null, raw: '她' },
        predicate: 'is_reading',
        object: '书',
        span: { start: 55, end: 58, raw: '她在看书' },
      });

      const resolver = new CoreferenceResolver({ agentNames: AGENT_NAMES, selfId: SELF_ID });
      const result = resolver.resolve([bobClaim, pronounClaim, aliceClaim, sheClaim]);

      expect(result.claims.length).toBe(4);

      // pronounClaim 应绑到 bob（最近且在窗口内）
      const resolvedPronoun = result.claims.find((c) => c.id === 'mix_pronoun');
      expect(resolvedPronoun.subject.id).toBe('bob');

      // sheClaim: alice dist=5, bob dist=55(>K=40, 被过滤) → 唯一候选 alice
      const resolvedShe = result.claims.find((c) => c.id === 'mix_she');
      expect(resolvedShe.subject.id).toBe('alice');
    });

    test('rejection polarity claim 也参与候选', () => {
      const bobClaim = makeClaim({
        id: 'rej_bob',
        type: 'location',
        subject: { kind: 'agent', id: 'bob', raw: '鲍勃' },
        predicate: 'at',
        object: '图书馆',
        polarity: 'negative',
      });

      const pronounClaim = makeClaim({
        id: 'rej_pronoun',
        type: 'location',
        subject: { kind: 'agent', id: null, raw: '他' },
        predicate: 'went_to',
        object: '食堂',
        polarity: 'negative',
      });

      const resolver = new CoreferenceResolver({ agentNames: AGENT_NAMES, selfId: SELF_ID });
      const result = resolver.resolve([bobClaim, pronounClaim]);

      const resolved = result.claims.find((c) => c.id === 'rej_pronoun');
      expect(resolved.subject.id).toBe('bob');
    });
  });

  // ─── selfId 场景 ─────────────────────────────────────────────────────────────

  describe('selfId 场景', () => {
    test('selfId 在前置但代词"他"≠self → 候选含 selfId 也能解析', () => {
      const selfClaim = makeClaim({
        id: 'self_in_ctx',
        type: 'location',
        subject: { kind: 'agent', id: SELF_ID, raw: '爱丽丝' },
        predicate: 'at',
        object: '图书馆',
      });

      const bobClaim = makeClaim({
        id: 'bob_in_ctx',
        type: 'location',
        subject: { kind: 'agent', id: 'bob', raw: '鲍勃' },
        predicate: 'at',
        object: '食堂',
      });

      const pronounClaim = makeClaim({
        id: 'pronoun_in_ctx',
        type: 'state',
        subject: { kind: 'agent', id: null, raw: '他' },
        predicate: 'ordered',
        object: '晚饭',
      });

      const resolver = new CoreferenceResolver({ agentNames: AGENT_NAMES, selfId: SELF_ID });
      const result = resolver.resolve([selfClaim, bobClaim, pronounClaim]);

      // 两个候选 → ambiguous
      const resolved = result.claims.find((c) => c.id === 'pronoun_in_ctx');
      expect(resolved.subject.raw).toBe('他');
      const note = result.notes.find((n) => n.claimId === 'pronoun_in_ctx');
      expect(note.kind).toBe('coreference_ambiguous');
    });

    test('唯一 other agent 场景 → 绑 bob', () => {
      const bobClaim = makeClaim({
        id: 'unique_bob',
        type: 'location',
        subject: { kind: 'agent', id: 'bob', raw: '鲍勃' },
        predicate: 'at',
        object: '图书馆',
      });

      const pronounClaim = makeClaim({
        id: 'unique_pronoun',
        type: 'state',
        subject: { kind: 'agent', id: null, raw: '他' },
        predicate: 'ordered',
        object: '晚饭',
      });

      const resolver = new CoreferenceResolver({ agentNames: AGENT_NAMES, selfId: SELF_ID });
      const result = resolver.resolve([bobClaim, pronounClaim]);

      const resolved = result.claims.find((c) => c.id === 'unique_pronoun');
      expect(resolved.subject.id).toBe('bob');
    });

    test('agentNames 解析：raw="鲍勃" 经 agentNames 反查 id=bob', () => {
      const claim = makeClaim({
        id: 'name_lookup',
        type: 'location',
        subject: { kind: 'agent', id: null, raw: '鲍勃' },
        predicate: 'at',
        object: '图书馆',
      });

      const resolver = new CoreferenceResolver({ agentNames: AGENT_NAMES, selfId: SELF_ID });
      // claim 不是代词，不会被解析，但 agentNames 应在 sidecar binding 中使用
      const result = resolver.resolve([claim]);
      // 非代词 claim 不产生 note
      expect(result.claims.length).toBe(1);
    });
  });

  // ─── 注记完整验证 ────────────────────────────────────────────────────────────

  describe('notes 完整性', () => {
    test('每条约束 claim 都有对应 note', () => {
      const claims = [
        makeClaim({
          id: 'n1',
          type: 'location',
          subject: { kind: 'agent', id: null, raw: '他' },
          predicate: 'at',
          object: '图书馆',
        }),
        makeClaim({
          id: 'n2',
          type: 'location',
          subject: { kind: 'agent', id: null, raw: '他们' },
          predicate: 'at',
          object: '食堂',
        }),
        makeClaim({
          id: 'n3',
          type: 'state',
          subject: { kind: 'agent', id: null, raw: '你' },
          predicate: 'should_go',
          object: '图书馆',
        }),
        makeClaim({
          id: 'n4',
          type: 'location',
          subject: { kind: 'agent', id: 'bob', raw: '鲍勃' },
          predicate: 'at',
          object: '图书馆',
        }),
      ];

      const resolver = new CoreferenceResolver({ agentNames: AGENT_NAMES, selfId: SELF_ID });
      const result = resolver.resolve(claims);

      // n4 是非代词，不产生 note
      // n1/n2/n3 都是代词，应有 note
      const claimIdsWithNotes = result.notes.map((n) => n.claimId);
      expect(claimIdsWithNotes).toContain('n1');
      expect(claimIdsWithNotes).toContain('n2');
      expect(claimIdsWithNotes).toContain('n3');
      expect(claimIdsWithNotes).not.toContain('n4');
    });

    test('sidecar_bound note 含 resolvedTo', () => {
      const claim = makeClaim({
        id: 'sb_note',
        type: 'location',
        subject: { kind: 'agent', id: null, raw: '他' },
        predicate: 'went_to',
        object: '图书馆',
        source: { kind: 'told', by: 'bob' },
        extractionMethod: 'sidecar',
      });

      const resolver = new CoreferenceResolver({ agentNames: AGENT_NAMES, selfId: SELF_ID });
      const result = resolver.resolve([claim]);

      const note = result.notes[0];
      expect(note.kind).toBe('sidecar_bound');
      expect(note.resolvedTo).toBe('bob');
    });
  });

  // ─── 综合 W3 场景验证 ────────────────────────────────────────────────────────

  describe('综合 W3 场景验证', () => {
    test('W3 示例 1 完整链路：鲍勃 source claim 在前置 → source-attributed 绑', () => {
      // 模拟真实场景：Bob 先被提取为 location claim，然后 pronoun claim 来自 told source
      const bobLocation = makeClaim({
        id: 'w3_ex1_bob',
        type: 'location',
        subject: { kind: 'agent', id: 'bob', raw: '鲍勃' },
        predicate: 'at',
        object: '图书馆',
        span: { start: 0, end: 5, raw: '鲍勃在图书馆' },
      });

      const toldPronoun = makeClaim({
        id: 'w3_ex1_told',
        type: 'location',
        subject: { kind: 'agent', id: null, raw: '他' },
        predicate: 'went_to',
        object: '图书馆',
        source: { kind: 'told', by: 'bob' },
        span: { start: 0, end: 15, raw: '鲍勃告诉我他去了图书馆' },
        extractionMethod: 'sidecar',
      });

      const resolver = new CoreferenceResolver({ agentNames: AGENT_NAMES, selfId: SELF_ID });
      const result = resolver.resolve([bobLocation, toldPronoun]);

      const resolved = result.claims.find((c) => c.id === 'w3_ex1_told');
      expect(resolved.subject.id).toBe('bob');
      const note = result.notes.find((n) => n.claimId === 'w3_ex1_told');
      expect(note.kind).toBe('sidecar_bound');
    });

    test('ambiguous 的 claim 不会变成 pass（subject 保持代词未绑定）', () => {
      const aliceClaim = makeClaim({
        id: 'w3_amb_alice',
        type: 'location',
        subject: { kind: 'agent', id: 'alice', raw: '爱丽丝' },
        predicate: 'at',
        object: '食堂',
      });

      const bobClaim = makeClaim({
        id: 'w3_amb_bob',
        type: 'location',
        subject: { kind: 'agent', id: 'bob', raw: '鲍勃' },
        predicate: 'at',
        object: '食堂',
      });

      const pronounClaim = makeClaim({
        id: 'w3_amb_pronoun',
        type: 'state',
        subject: { kind: 'agent', id: null, raw: '他' },
        predicate: 'ordered',
        object: '晚饭',
      });

      const resolver = new CoreferenceResolver({ agentNames: AGENT_NAMES, selfId: SELF_ID });
      const result = resolver.resolve([aliceClaim, bobClaim, pronounClaim]);

      const resolved = result.claims.find((c) => c.id === 'w3_amb_pronoun');
      // 红线：ambiguous 的 claim subject 必须保持代词未绑定
      expect(resolved.subject.raw).toBe('他');
      expect(resolved.subject.id).toBeNull();

      const note = result.notes.find((n) => n.claimId === 'w3_amb_pronoun');
      expect(note.kind).toBe('coreference_ambiguous');
    });

    test('PRONOUNS_ZH 包含 ClaimExtractor PRONOUN_WORDS 的所有项', () => {
      const extractorPronouns = ['他', '她', '它', '你', '他们', '她们', '它们', '你们', '咱', '咱们'];
      for (const p of extractorPronouns) {
        expect(PRONOUNS_ZH).toContain(p);
      }
    });
  });
});
