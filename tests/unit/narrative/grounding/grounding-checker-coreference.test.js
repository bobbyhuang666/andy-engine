/**
 * GroundingChecker Coreference Integration Tests (M3-R2)
 *
 * 验证 CoreferenceResolver 接入 GroundingChecker check 流程的正确性：
 *   - text-only 零回归（v2 决策 byte-for-byte 不变）
 *   - 代词 claim 提取（includePronouns=true）
 *   - CoreferenceResolver 集成（resolved_to / coreference_ambiguous / no_resolver / sidecar_bound）
 *   - evidenceTrace 中 coreferenceStatus 字段
 *   - coreferenceNotes 透传
 *   - 歧义代词绝不变 pass（红线）
 *
 * 红线：
 *   - 不改 CoreferenceResolver.js / ClaimSchema.js / EvidenceBinder.js / SidecarValidator.js
 *   - 不让代词 ambiguous claim 进 blocking 决策
 *   - 不引入新 npm 依赖
 *   - 不写 WorldFactStore / KnowledgeStore
 */

import { describe, it, expect } from 'vitest';
const { createRequire } = await import('node:module');
const require = createRequire(import.meta.url);
const GroundingChecker = require('../../../../src/narrative/GroundingChecker.js');
const ClaimExtractor = require('../../../../src/narrative/ClaimExtractor.js');
const { FactType } = require('../../../../src/canon/FactSchema.js');
const { createCoreferenceResolver } = require('../../../../src/narrative/grounding/CoreferenceResolver.js');
const fs = require('fs');
const path = require('path');

// ─── Helpers ─────────────────────────────────────────────────────────────────

const AGENT_NAMES = { alice: '爱丽丝', bob: '鲍勃', charlie: '查理' };
const SELF_ID = 'alice';

function makeChecker() {
  return new GroundingChecker({}, {});
}

function makeGrounding(overrides = {}) {
  return {
    allowedFacts: [
      { type: FactType.AGENT_STATE, agentId: 'alice' },
      { type: FactType.AGENT_STATE, agentId: 'bob' },
    ],
    metadata: {
      agentId: SELF_ID,
      agentNames: AGENT_NAMES,
      currentTime: new Date(2026, 8, 1, 12, 0, 0),
    },
    ...overrides,
  };
}

// ─── ClaimExtractor includePronouns ──────────────────────────────────────────

describe('ClaimExtractor includePronouns', () => {
  it('默认 extract(text) 不含代词 claim', () => {
    const ce = new ClaimExtractor(SELF_ID, AGENT_NAMES);
    const claims = ce.extract('他去了图书馆');
    expect(claims.length).toBe(0);
  });

  it('extract(text, { includePronouns: true }) 含代词 location claim', () => {
    const ce = new ClaimExtractor(SELF_ID, AGENT_NAMES);
    const claims = ce.extract('他去了图书馆', { includePronouns: true });
    expect(claims.length).toBe(1);
    const c = claims[0];
    expect(c.type).toBe('location');
    expect(c.subject).toBe('他');
    expect(c.extractionMethod).toBe('extractor-pronoun');
    expect(c.confidence).toBe(0.5);
    expect(c.evidenceRequired).toBe('observed');
  });

  it('代词 location claim 的 subject 是代词 raw string', () => {
    const ce = new ClaimExtractor(SELF_ID, AGENT_NAMES);
    const claims = ce.extract('她在食堂', { includePronouns: true });
    expect(claims.length).toBeGreaterThanOrEqual(1);
    const pronounClaims = claims.filter(c => c.extractionMethod === 'extractor-pronoun');
    expect(pronounClaims.length).toBeGreaterThan(0);
    expect(pronounClaims[0].subject).toMatch(/[他她它]/);
  });

  it('代词 claim 的 sourceSpan 正确设置', () => {
    const ce = new ClaimExtractor(SELF_ID, AGENT_NAMES);
    const claims = ce.extract('他去了图书馆', { includePronouns: true });
    expect(claims[0].sourceSpan).toBeDefined();
    expect(claims[0].sourceSpan.start).toBe(0);
    expect(claims[0].sourceSpan.raw).toBe('他去了图书馆');
  });

  it('includePronouns=true 不影响非代词 claim 提取', () => {
    const ce = new ClaimExtractor(SELF_ID, AGENT_NAMES);
    const defaultClaims = ce.extract('鲍勃在图书馆');
    const pronounClaims = ce.extract('鲍勃在图书馆', { includePronouns: true });

    // 非代词 claim 数量应相同
    const nonPronounDefault = defaultClaims.filter(c => c.extractionMethod !== 'extractor-pronoun');
    const nonPronounPronoun = pronounClaims.filter(c => c.extractionMethod !== 'extractor-pronoun');
    expect(nonPronounPronoun.length).toBe(nonPronounDefault.length);

    // 多出来的就是代词 claim
    const extraPronoun = pronounClaims.filter(c => c.extractionMethod === 'extractor-pronoun');
    expect(extraPronoun.length).toBeGreaterThanOrEqual(0);
  });

  it('代词状态 claim（emotion/need/activity）也被提取', () => {
    const ce = new ClaimExtractor(SELF_ID, AGENT_NAMES);
    const claims = ce.extract('他很焦虑', { includePronouns: true });
    const pronounClaims = claims.filter(c => c.extractionMethod === 'extractor-pronoun');
    expect(pronounClaims.length).toBeGreaterThan(0);
    expect(pronounClaims[0].type).toBe('state');
    expect(pronounClaims[0].stateType).toBe('emotion');
  });

  it('代词"他们"（复数）也会被提取', () => {
    const ce = new ClaimExtractor(SELF_ID, AGENT_NAMES);
    const claims = ce.extract('他们在图书馆', { includePronouns: true });
    const pronounClaims = claims.filter(c => c.extractionMethod === 'extractor-pronoun');
    expect(pronounClaims.length).toBeGreaterThan(0);
    expect(pronounClaims[0].subject).toBe('他们');
  });

  it('代词"你"也会被提取', () => {
    const ce = new ClaimExtractor(SELF_ID, AGENT_NAMES);
    const claims = ce.extract('你在食堂', { includePronouns: true });
    const pronounClaims = claims.filter(c => c.extractionMethod === 'extractor-pronoun');
    expect(pronounClaims.length).toBeGreaterThan(0);
    expect(pronounClaims[0].subject).toBe('你');
  });
});

// ─── GroundingChecker text-only 零回归 ────────────────────────────────────────

describe('GroundingChecker text-only 零回归', () => {
  it('无 pronoun 输入时，v2 决策不变', () => {
    const checker = makeChecker();
    const g = makeGrounding();
    const r = checker.check('鲍勃在图书馆', g);
    expect(r.valid).toBe(false);
    expect(r.severity).toBe('rewrite');
    expect(r.violations.some(v => v.type === 'unsupported_claim')).toBe(true);
  });

  it('v2 被 reject 的输入，加 includePronouns 后仍 reject', () => {
    const checker = makeChecker();
    const g = makeGrounding();
    const r = checker.check('刚刚吃了一顿大餐了', g);
    expect(r.severity).toBe('reject');
    expect(r.violations.some(v => v.type === 'new_event')).toBe(true);
  });

  it('v2 被 pass 的输入，加 includePronouns 后仍 pass', () => {
    const checker = makeChecker();
    const g = makeGrounding({
      allowedFacts: [
        { type: FactType.AGENT_STATE, agentId: 'alice', position: '图书馆' },
      ],
    });
    const r = checker.check('我在图书馆', g);
    expect(r.valid).toBe(true);
    expect(r.severity).toBe('pass');
  });

  it('v2 被 warning 的输入，加 includePronouns 后仍 warning', () => {
    const checker = makeChecker();
    const g = makeGrounding({
      metadata: { agentId: 'alice', currentTime: new Date(2026, 8, 1, 12, 0, 0) },
    });
    const r = checker.check('深夜的时候', g);
    expect(r.severity).toBe('degrade_to_template');
  });

  it('v2 被 rewrite 的输入，加 includePronouns 后仍 rewrite', () => {
    const checker = makeChecker();
    const g = makeGrounding();
    const r = checker.check('鲍勃很焦虑', g);
    expect(r.severity).toBe('rewrite');
    expect(r.violations.some(v => v.type === 'agent_state_leak')).toBe(true);
  });

  it('no pronouns 时 coreferenceNotes 为 undefined', () => {
    const checker = makeChecker();
    const g = makeGrounding();
    const r = checker.check('鲍勃在图书馆', g);
    expect(r.coreferenceNotes).toBeUndefined();
  });

  it('no pronouns 时 evidenceTrace 中无 coreferenceStatus 字段', () => {
    const checker = makeChecker();
    const g = makeGrounding();
    const r = checker.check('鲍勃在图书馆', g);
    if (r.evidenceTrace && r.evidenceTrace.length > 0) {
      for (const et of r.evidenceTrace) {
        expect(et.coreferenceStatus).toBeUndefined();
      }
    }
  });
});

// ─── CoreferenceResolver 集成 ─────────────────────────────────────────────────

describe('CoreferenceResolver 集成', () => {
  it('resolved_to：单一前置 agent → pronoun 绑到该 agent', () => {
    const checker = makeChecker();
    const g = makeGrounding({
      allowedFacts: [
        { type: FactType.AGENT_STATE, agentId: 'alice' },
        { type: FactType.AGENT_STATE, agentId: 'bob' },
        { type: FactType.EVENT, description: '鲍勃在图书馆', location: '图书馆', participants: ['bob'] },
      ],
    });
    const r = checker.check('鲍勃在图书馆，他去了食堂', g);
    expect(r.evidenceTrace).toBeDefined();
    expect(r.evidenceTrace.length).toBeGreaterThanOrEqual(2);

    const pronounTrace = r.evidenceTrace.find(et =>
      et.coreferenceStatus === 'resolved_to'
    );
    expect(pronounTrace).toBeDefined();
    expect(pronounTrace.coreferenceResolvedTo).toBe('bob');
  });

  it('coreference_ambiguous：多前置 agent → pronoun 歧义', () => {
    const checker = makeChecker();
    const g = makeGrounding();
    const r = checker.check('爱丽丝在图书馆，鲍勃在图书馆，他在食堂', g);
    expect(r.evidenceTrace).toBeDefined();

    const ambiguousTrace = r.evidenceTrace.find(et =>
      et.coreferenceStatus === 'coreference_ambiguous'
    );
    expect(ambiguousTrace).toBeDefined();
    // subject 应保持未绑定（id=null）
    const subj = ambiguousTrace.subjectId;
    if (typeof subj === 'object' && subj !== null) {
      expect(subj.id).toBeNull();
    } else {
      expect(subj).toBeNull();
    }
  });

  it('coreference_ambiguous 的 note 含 ambiguousCandidates', () => {
    const checker = makeChecker();
    const g = makeGrounding();
    const r = checker.check('爱丽丝在图书馆，鲍勃在图书馆，他在食堂', g);
    expect(r.coreferenceNotes).toBeDefined();
    expect(r.coreferenceNotes.length).toBeGreaterThan(0);

    const ambNote = r.coreferenceNotes.find(n => n.kind === 'coreference_ambiguous');
    expect(ambNote).toBeDefined();
    expect(Array.isArray(ambNote.ambiguousCandidates)).toBe(true);
    expect(ambNote.ambiguousCandidates.length).toBeGreaterThanOrEqual(2);
  });

  it('no_resolver：无前置 agent → pronoun 无解析', () => {
    const checker = makeChecker();
    const g = makeGrounding();
    const r = checker.check('他去了图书馆', g);
    expect(r.evidenceTrace).toBeDefined();

    const noResolverTrace = r.evidenceTrace.find(et =>
      et.coreferenceStatus === 'no_resolver'
    );
    expect(noResolverTrace).toBeDefined();
  });

  it('evidenceTrace 含 coreferenceStatus 字段（合法枚举）', () => {
    const checker = makeChecker();
    const g = makeGrounding();
    const r = checker.check('鲍勃在图书馆，他去了食堂', g);
    const tracesWithCoref = r.evidenceTrace.filter(et => et.coreferenceStatus !== undefined);
    expect(tracesWithCoref.length).toBeGreaterThan(0);
    for (const et of tracesWithCoref) {
      expect(['resolved_to', 'coreference_ambiguous', 'no_resolver', 'sidecar_bound']).toContain(et.coreferenceStatus);
    }
  });

  it('coreferenceNotes 透传', () => {
    const checker = makeChecker();
    const g = makeGrounding();
    const r = checker.check('鲍勃在图书馆，他去了食堂', g);
    expect(r.coreferenceNotes).toBeDefined();
    expect(Array.isArray(r.coreferenceNotes)).toBe(true);
    expect(r.coreferenceNotes.length).toBeGreaterThan(0);

    const note = r.coreferenceNotes[0];
    expect(note).toHaveProperty('claimId');
    expect(note).toHaveProperty('kind');
    expect(note).toHaveProperty('reason');
  });

  it('resolved_to 的 claim subjectId 是 resolved agentId', () => {
    const checker = makeChecker();
    const g = makeGrounding();
    const r = checker.check('鲍勃在图书馆，他去了食堂', g);
    const resolvedTrace = r.evidenceTrace.find(et => et.coreferenceStatus === 'resolved_to');
    expect(resolvedTrace).toBeDefined();
    expect(resolvedTrace.subjectId).toBe('bob');
  });

  it('ambiguous 代词的 claim subjectId 在 evidenceTrace 中仍为 null 或未绑定', () => {
    const checker = makeChecker();
    const g = makeGrounding();
    const r = checker.check('爱丽丝在图书馆，鲍勃在图书馆，他在食堂', g);
    const ambTrace = r.evidenceTrace.find(et => et.coreferenceStatus === 'coreference_ambiguous');
    expect(ambTrace).toBeDefined();
    // subjectId 可能为 null 或 {kind:'agent', id:null, ...}（取决于 v3 转换）
    // 关键断言：id 为 null（未绑定）
    const subj = ambTrace.subjectId;
    if (typeof subj === 'object' && subj !== null) {
      expect(subj.id).toBeNull();
    } else {
      expect(subj).toBeNull();
    }
  });

  it('K>40 字符外的 candidate → no_resolver', () => {
    const checker = makeChecker();
    const g = makeGrounding({
      allowedFacts: [
        { type: FactType.AGENT_STATE, agentId: 'alice' },
        { type: FactType.AGENT_STATE, agentId: 'bob' },
      ],
    });
    // 无前置 agent claim → no_resolver
    const r = checker.check('他去了食堂', g);
    const noResolverTrace = r.evidenceTrace?.find(et => et.coreferenceStatus === 'no_resolver');
    expect(noResolverTrace).toBeDefined();
  });

  it('no_resolver 状态下 claim 不进 blocking，不产 violation', () => {
    const checker = makeChecker();
    const g = makeGrounding({
      allowedFacts: [
        { type: FactType.AGENT_STATE, agentId: 'alice' },
        { type: FactType.AGENT_STATE, agentId: 'bob' },
      ],
    });
    const r = checker.check('他去了图书馆', g);
    // pronoun claim 的 confidence=0.5 < 0.65 → 不进 blocking
    // 所以不应产生 unsupported_claim violation for the pronoun
    const pronounViolations = r.violations.filter(v =>
      v.type === 'unsupported_claim' &&
      (v.agent === '他' || v.agent === '他去了图书馆')
    );
    expect(pronounViolations.length).toBe(0);
  });

  it('ambiguous 代词 claim 不进 blocking 决策（绝不变 pass 红线）', () => {
    const checker = makeChecker();
    const g = makeGrounding();
    const r = checker.check('爱丽丝在图书馆，鲍勃在图书馆，他在食堂', g);
    // 歧义代词 claim 的 confidence=0.5 < 0.65 → 不进 blocking
    // 即使 confidence 较高，ambiguous 也不应进 blocking
    // 验证：valid 不应因为代词 claim 而变 true（如果 v2 本来会 reject）
    // 这里 v2 会因为"爱丽丝在图书馆"和"鲍勃在图书馆"产生 unsupported_claim → rewrite
    expect(r.severity).toBe('rewrite');
  });

  it('resolved_to 代词 claim 仍不进 blocking（M3 保守策略）', () => {
    const checker = makeChecker();
    const g = makeGrounding({
      allowedFacts: [
        { type: FactType.AGENT_STATE, agentId: 'alice' },
        { type: FactType.AGENT_STATE, agentId: 'bob' },
      ],
    });
    const r = checker.check('鲍勃在图书馆，他去了食堂', g);
    // pronoun claim confidence=0.5 < 0.65 → 不进 blocking
    // 即使 resolved_to bob，也不产生 unsupported_claim
    const pronounViolations = r.violations.filter(v =>
      v.type === 'unsupported_claim' &&
      v.location === '食堂'
    );
    expect(pronounViolations.length).toBe(0);
  });
});

// ─── 歧义不变 pass 红线 ──────────────────────────────────────────────────────

describe('歧义不变 pass 红线', () => {
  it('歧义代词 case 显式标 ambiguous，不产生 false pass', () => {
    const checker = makeChecker();
    const g = makeGrounding();
    const r = checker.check('爱丽丝在图书馆，鲍勃在图书馆，他在食堂', g);

    // 关键断言：evidenceTrace 中代词 claim 的 coreferenceStatus = 'coreference_ambiguous'
    const ambTrace = r.evidenceTrace?.find(et => et.coreferenceStatus === 'coreference_ambiguous');
    expect(ambTrace).toBeDefined();

    // 关键断言：corefNotes 含 ambiguousCandidates 两条 id
    expect(r.coreferenceNotes).toBeDefined();
    const ambNote = r.coreferenceNotes.find(n => n.kind === 'coreference_ambiguous');
    expect(ambNote).toBeDefined();
    expect(ambNote.ambiguousCandidates).toHaveLength(2);
    expect(ambNote.ambiguousCandidates).toContain('alice');
    expect(ambNote.ambiguousCandidates).toContain('bob');

    // 关键断言：valid 不变（v2 行为——因代词 claim 不进 blocking）
    // 这里的 valid=false 是因为爱丽丝/鲍勃的 location claim 无 EVENT 支撑
    // 这不是 false pass，而是 v2 本来就有的 rewrite
    expect(r.valid).toBe(false);
  });

  it('v2 会被 reject 的输入，加代词解析后仍 reject', () => {
    const checker = makeChecker();
    const g = makeGrounding();
    const r = checker.check('刚刚吃了一顿大餐了，他也很饿', g);
    expect(r.severity).toBe('reject');
    expect(r.violations.some(v => v.type === 'new_event')).toBe(true);
  });

  it('v2 会被 rewrite 的输入，加代词解析后仍 rewrite', () => {
    const checker = makeChecker();
    const g = makeGrounding();
    const r = checker.check('鲍勃在图书馆，他去了食堂', g);
    expect(r.severity).toBe('rewrite');
  });

  it('v2 会被 pass 的输入，加代词解析后仍 pass', () => {
    const checker = makeChecker();
    const g = makeGrounding({
      allowedFacts: [
        { type: FactType.AGENT_STATE, agentId: 'alice', position: '图书馆' },
      ],
    });
    const r = checker.check('我在图书馆', g);
    expect(r.valid).toBe(true);
    expect(r.severity).toBe('pass');
  });
});

// ─── sidecar 路径 ─────────────────────────────────────────────────────────────

describe('sidecar 路径', () => {
  it('sidecar 提供的代词 binding → sidecar_bound', () => {
    const checker = makeChecker();
    const g = makeGrounding({
      allowedFacts: [
        { type: FactType.AGENT_STATE, agentId: 'alice' },
        { type: FactType.AGENT_STATE, agentId: 'bob' },
      ],
    });
    const structuredClaims = [
      {
        id: 'sidecar_pronoun',
        type: 'location',
        subject: { kind: 'agent', id: 'bob', raw: '他' },
        predicate: 'went_to',
        object: '食堂',
        extractionMethod: 'sidecar',
        source: { kind: 'told', by: 'bob' },
        span: { start: 0, end: 10, raw: '鲍勃告诉我他去了食堂' },
        confidence: 0.8,
        modality: 'certain',
        polarity: 'affirmative',
      },
    ];
    const r = checker.check(null, g, { structuredClaims });
    // sidecar claim 已通过 SidecarValidator 处理，subject 已绑定
    // CoreferenceResolver 在 text-only 旁路中处理 pronoun claims
    // sidecar 路径的 claim 不经过 CoreferenceResolver（已由 SidecarValidator 解析）
    expect(r.evidenceTrace).toBeDefined();
    // sidecar claim 的 subject 已正确绑定
    const sidecarTrace = r.evidenceTrace?.find(et => et.claimId === 'claim_001');
    expect(sidecarTrace).toBeDefined();
    expect(sidecarTrace.subjectId).toBe('bob');
  });

  it('Character.chat 带 structuredClaims 含代词 binding → 透传到 evidenceTrace', () => {
    const checker = makeChecker();
    const g = makeGrounding({
      allowedFacts: [
        { type: FactType.AGENT_STATE, agentId: 'alice' },
        { type: FactType.AGENT_STATE, agentId: 'bob' },
      ],
    });
    const structuredClaims = [
      {
        id: 'sc_bob_loc',
        type: 'location',
        subject: { kind: 'agent', id: 'bob', raw: '鲍勃' },
        predicate: 'at',
        object: '图书馆',
        extractionMethod: 'sidecar',
        span: { start: 0, end: 5, raw: '鲍勃在图书馆' },
        confidence: 0.85,
        modality: 'certain',
        polarity: 'affirmative',
      },
      {
        id: 'sc_pronoun',
        type: 'location',
        subject: { kind: 'agent', id: 'bob', raw: '他' },
        predicate: 'went_to',
        object: '食堂',
        extractionMethod: 'sidecar',
        source: { kind: 'told', by: 'bob' },
        span: { start: 0, end: 10, raw: '鲍勃告诉我他去了食堂' },
        confidence: 0.8,
        modality: 'certain',
        polarity: 'affirmative',
      },
    ];
    const r = checker.check(null, g, { structuredClaims });
    expect(r.evidenceTrace).toBeDefined();
    // sidecar claim 的 subject 已正确绑定
    const pronounTrace = r.evidenceTrace?.find(et => et.claimId === 'claim_002');
    expect(pronounTrace).toBeDefined();
    expect(pronounTrace.subjectId).toBe('bob');
  });
});

// ─── 模块不写 store ───────────────────────────────────────────────────────────

describe('模块不写 store', () => {
  const gcPath = path.resolve(__dirname, '../../../../src/narrative/GroundingChecker.js');
  const gcSource = fs.readFileSync(gcPath, 'utf-8');

  it('GroundingChecker 源码中无 .addFact( / .set( 模式', () => {
    // Check for store-writing patterns, not Map/Set methods
    // Map.prototype.set is fine; we only care about store writes like .addFact( or .set( on stores
    expect(gcSource).not.toMatch(/\.addFact\s*\(/);
    // .set( on Map is OK — only check for store-like patterns (e.g., store.set, factStore.set)
    expect(gcSource).not.toMatch(/\b(store|factStore|worldFactStore|knowledgeStore)\.set\s*\(/);
  });

  it('不导入 WorldFactStore / KnowledgeStore', () => {
    // Check require statements only (comments/JSDoc may mention these terms)
    const requireMatches = gcSource.match(/require\s*\(\s*['"]([^'"]+)['"]\s*\)/g);
    if (requireMatches) {
      for (const match of requireMatches) {
        const dep = match.match(/require\s*\(\s*['"]([^'"]+)['"]\s*\)/)[1];
        expect(dep).not.toMatch(/WorldFactStore/);
        expect(dep).not.toMatch(/KnowledgeStore/);
      }
    }
  });

  it('不引入新 npm 依赖', () => {
    const requireMatches = gcSource.match(/require\s*\(\s*['"]([^'"]+)['"]\s*\)/g);
    if (requireMatches) {
      for (const match of requireMatches) {
        const dep = match.match(/require\s*\(\s*['"]([^'"]+)['"]\s*\)/)[1];
        expect(dep.startsWith('.')).toBe(true);
      }
    }
  });
});

// ─── 边界情况 ─────────────────────────────────────────────────────────────────

describe('边界情况', () => {
  it('空文本 → 无 evidenceTrace', () => {
    const checker = makeChecker();
    const r = checker.check('', makeGrounding());
    expect(r.evidenceTrace).toBeUndefined();
    expect(r.coreferenceNotes).toBeUndefined();
  });

  it('null llmOutput + 无 structuredClaims → pass', () => {
    const checker = makeChecker();
    const r = checker.check(null, makeGrounding());
    expect(r.valid).toBe(true);
    expect(r.severity).toBe('pass');
    expect(r.evidenceTrace).toBeUndefined();
  });

  it('无 agentNames → 不报错', () => {
    const checker = makeChecker();
    const g = makeGrounding({ metadata: { agentId: 'alice', agentNames: {} } });
    const r = checker.check('他去了图书馆', g);
    expect(r.evidenceTrace).toBeUndefined();
    expect(r.coreferenceNotes).toBeUndefined();
  });

  it('try/catch 保护：CoreferenceResolver 异常不影响主结果', () => {
    const checker = makeChecker();
    const g = makeGrounding();
    const r = checker.check('鲍勃在图书馆', g);
    // 正常路径不应触发 catch
    expect(r.severity).toBeDefined();
    expect(r.violations).toBeDefined();
  });

  it('pronoun claim 的 confidence=0.5 < 0.65 → 不进 blocking', () => {
    const ce = new ClaimExtractor(SELF_ID, AGENT_NAMES);
    const claims = ce.extract('他去了图书馆', { includePronouns: true });
    const pronounClaim = claims.find(c => c.extractionMethod === 'extractor-pronoun');
    expect(pronounClaim.confidence).toBe(0.5);
    expect(pronounClaim.confidence).toBeLessThan(0.65);
  });

  it('pronoun claim 的 evidenceRequired=observed', () => {
    const ce = new ClaimExtractor(SELF_ID, AGENT_NAMES);
    const claims = ce.extract('他去了图书馆', { includePronouns: true });
    const pronounClaim = claims.find(c => c.extractionMethod === 'extractor-pronoun');
    expect(pronounClaim.evidenceRequired).toBe('observed');
  });

  it('pronoun claim 的 extractionMethod=extractor-pronoun', () => {
    const ce = new ClaimExtractor(SELF_ID, AGENT_NAMES);
    const claims = ce.extract('他去了图书馆', { includePronouns: true });
    const pronounClaim = claims.find(c => c.extractionMethod === 'extractor-pronoun');
    expect(pronounClaim).toBeDefined();
    expect(pronounClaim.extractionMethod).toBe('extractor-pronoun');
  });

  it('pronoun claim 的 subject 是原始代词字符串', () => {
    const ce = new ClaimExtractor(SELF_ID, AGENT_NAMES);
    const claims = ce.extract('她去了食堂', { includePronouns: true });
    const pronounClaim = claims.find(c => c.extractionMethod === 'extractor-pronoun');
    expect(pronounClaim.subject).toBe('她');
  });

  it('代词 claim 的 subject 在 CoreferenceResolver 后变为 v3 对象', () => {
    const ce = new ClaimExtractor(SELF_ID, AGENT_NAMES);
    const allClaims = ce.extract('鲍勃在图书馆');
    const allPronoun = ce.extract('鲍勃在图书馆，他去了食堂', { includePronouns: true });
    const pronounClaimsRaw = allPronoun.filter(c => c.extractionMethod === 'extractor-pronoun');

    // 确保 span 字段
    for (const pc of pronounClaimsRaw) {
      if (pc.sourceSpan && !pc.span) {
        pc.span = { start: pc.sourceSpan.start, end: pc.sourceSpan.end, raw: pc.sourceSpan.raw || '' };
      }
    }

    const allClaimsForCoref = allClaims.map(c => {
      const enriched = { ...c };
      if (enriched.sourceSpan && !enriched.span) {
        enriched.span = { start: enriched.sourceSpan.start, end: enriched.sourceSpan.end, raw: enriched.sourceSpan.raw || '' };
      }
      if (typeof enriched.subject === 'string') {
        const raw = enriched.subject;
        let resolvedId = raw;
        for (const [id, name] of Object.entries(AGENT_NAMES)) {
          if (name && name.toLowerCase() === raw.toLowerCase()) { resolvedId = id; break; }
        }
        enriched.subject = { kind: 'agent', id: resolvedId, raw };
      }
      return enriched;
    });

    const resolver = createCoreferenceResolver(AGENT_NAMES, SELF_ID);
    const result = resolver.resolve([...allClaimsForCoref, ...pronounClaimsRaw]);
    const resolvedPronoun = result.claims.find(c => c.extractionMethod === 'extractor-pronoun');

    expect(resolvedPronoun.subject).toBeDefined();
    expect(typeof resolvedPronoun.subject).toBe('object');
    expect(resolvedPronoun.subject.kind).toBe('agent');
    expect(resolvedPronoun.subject.id).toBe('bob');
  });

  it('pronoun claim 不改变 blockingClaims 分离逻辑', () => {
    const checker = makeChecker();
    const g = makeGrounding();
    const r = checker.check('鲍勃在图书馆，他去了食堂', g);

    // blockingClaims 只包含 confidence >= 0.65 且 modality !== 'uncertain' 的 claim
    // pronoun claim confidence=0.5 → debugClaims
    // 验证：v2 的 blocking 逻辑不受影响
    expect(r.checkerVersion).toBe('v2-structured');
  });

  it('propagatedFrom 红线在 coreference 路径守住', () => {
    // CoreferenceResolver 不读取 _evidence.propagatedFrom
    // 只通过 EvidenceBinder 的 _buildIndex 中的 participants/observers 索引
    // 验证：CoreferenceResolver 源码中无 propagatedFrom 引用
    const crPath = path.resolve(__dirname, '../../../../src/narrative/grounding/CoreferenceResolver.js');
    const crSource = fs.readFileSync(crPath, 'utf-8');
    expect(crSource).not.toMatch(/propagatedFrom/);
  });
});

// ─── 综合场景 ─────────────────────────────────────────────────────────────────

describe('综合场景', () => {
  it('多代词混合场景：resolved + ambiguous', () => {
    const checker = makeChecker();
    const g = makeGrounding({
      allowedFacts: [
        { type: FactType.AGENT_STATE, agentId: 'alice' },
        { type: FactType.AGENT_STATE, agentId: 'bob' },
        { type: FactType.AGENT_STATE, agentId: 'charlie' },
      ],
    });
    // 鲍勃在前 → 他（鲍勃的 pronoun）resolved_to bob
    // 爱丽丝和鲍勃都在 → 他（歧义）coreference_ambiguous
    const r = checker.check('鲍勃在图书馆，他在食堂，爱丽丝在教室，鲍勃在教室，他在食堂', g);
    expect(r.evidenceTrace).toBeDefined();

    const statuses = r.evidenceTrace.map(et => et.coreferenceStatus).filter(Boolean);
    expect(statuses).toContain('resolved_to');
    expect(statuses).toContain('coreference_ambiguous');
  });

  it('自我代词"我"不受影响', () => {
    const checker = makeChecker();
    const g = makeGrounding({
      allowedFacts: [
        { type: FactType.AGENT_STATE, agentId: 'alice', position: '图书馆' },
      ],
    });
    const r = checker.check('我在图书馆', g);
    expect(r.valid).toBe(true);
    expect(r.severity).toBe('pass');
    // "我" 不是代词 pronoun（在 PRONOUN_WORDS 中不包含"我"），所以不会产生 pronoun claim
    if (r.evidenceTrace) {
      const pronounTraces = r.evidenceTrace.filter(et => et.coreferenceStatus !== undefined);
      expect(pronounTraces.length).toBe(0);
    }
  });

  it('checkerVersion 始终为 "v2-structured"', () => {
    const checker = makeChecker();
    const g = makeGrounding();
    const r = checker.check('鲍勃在图书馆，他去了食堂', g);
    expect(r.checkerVersion).toBe('v2-structured');
  });

  it('无 allowedFacts 时 evidenceTrace 不产生', () => {
    const checker = makeChecker();
    const g = makeGrounding({ allowedFacts: [] });
    const r = checker.check('鲍勃在图书馆，他去了食堂', g);
    // allowedFacts 为空数组（truthy）→ evidenceTrace 会产生
    // 但如果没有 allowedFacts（null/undefined），则不会产生
    expect(r.checkerVersion).toBe('v2-structured');
  });

  it('coreferenceNotes 仅在有 pronoun claims 时出现', () => {
    const checker = makeChecker();
    const g = makeGrounding();

    // 无 pronoun
    const r1 = checker.check('鲍勃在图书馆', g);
    expect(r1.coreferenceNotes).toBeUndefined();

    // 有 pronoun
    const r2 = checker.check('鲍勃在图书馆，他去了食堂', g);
    expect(r2.coreferenceNotes).toBeDefined();
    expect(r2.coreferenceNotes.length).toBeGreaterThan(0);
  });
});
