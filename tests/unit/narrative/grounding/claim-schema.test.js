/**
 * ClaimSchema v3 — 单元测试
 *
 * 覆盖：
 *   - createClaim 默认值齐全（id 格式 claim_001/递增）
 *   - translateV2Claim 对 v2 location/event/state/source_attribution/time claim 各送真实样本
 *   - v2 polarity → v3 polarity/modality 映射
 *   - 未知字段安全忽略
 *   - normalize 不 mutate 输入
 *   - isBlocking 边界（confidence 0.64 vs 0.65；modality uncertain 即使高 confidence 也非 blocking）
 *   - 模块不导入/不写入 canon 或 store（grep 断言）
 */

import { describe, it, expect } from 'vitest';
// CJS require: 与运行时同一模块实例
const { createRequire } = await import('node:module');
const require = createRequire(import.meta.url);
const fs = await import('node:fs');
const path = await import('node:path');

const {
  ClaimTypes,
  Polarity,
  Modality,
  createClaim,
  translateV2Claim,
  isBlocking,
  normalize,
} = require('../../../../src/narrative/grounding/ClaimSchema.js');

// ─── 读取 ClaimSchema.js 源码用于边界检查 ──────────────────────────────────

const schemaPath = path.default.resolve(
  import.meta.dirname,
  '../../../../src/narrative/grounding/ClaimSchema.js'
);
const schemaSource = fs.default.readFileSync(schemaPath, 'utf-8');

// ═══════════════════════════════════════════
// 常量定义
// ═══════════════════════════════════════════

describe('ClaimSchema — 常量定义', () => {
  it('ClaimTypes 包含所有 v3 claim 类型', () => {
    expect(ClaimTypes.location).toBe('location');
    expect(ClaimTypes.event).toBe('event');
    expect(ClaimTypes.relationship).toBe('relationship');
    expect(ClaimTypes.state).toBe('state');
    expect(ClaimTypes.memory).toBe('memory');
    expect(ClaimTypes.source_attribution).toBe('source_attribution');
    expect(ClaimTypes.time).toBe('time');
    expect(ClaimTypes.causal).toBe('causal');
    expect(ClaimTypes.comparison).toBe('comparison');
    expect(ClaimTypes.quote_or_report).toBe('quote_or_report');
  });

  it('Polarity 包含 affirmative 和 negative', () => {
    expect(Polarity.AFFIRMATIVE).toBe('affirmative');
    expect(Polarity.NEGATIVE).toBe('negative');
  });

  it('Modality 包含所有 5 种模态', () => {
    expect(Modality.CERTAIN).toBe('certain');
    expect(Modality.UNCERTAIN).toBe('uncertain');
    expect(Modality.HYPOTHETICAL).toBe('hypothetical');
    expect(Modality.INFERRED).toBe('inferred');
    expect(Modality.REPORTED).toBe('reported');
  });
});

// ═══════════════════════════════════════════
// createClaim 工厂
// ═══════════════════════════════════════════

describe('createClaim — 默认值', () => {
  it('创建空 claim 时 id 格式为 claim_XXX', () => {
    const claim = createClaim({});
    expect(claim.id).toMatch(/^claim_\d{3}$/);
  });

  it('连续调用 createClaim 时 id 递增', () => {
    const c1 = createClaim({});
    const c2 = createClaim({});
    const idx1 = parseInt(c1.id.split('_')[1], 10);
    const idx2 = parseInt(c2.id.split('_')[1], 10);
    expect(idx2).toBe(idx1 + 1);
  });

  it('空 claim 默认值齐全', () => {
    const claim = createClaim({});
    expect(claim.type).toBe('state');
    expect(claim.subject).toBeNull();
    expect(claim.predicate).toBeNull();
    expect(claim.object).toBeNull();
    expect(claim.polarity).toBe('affirmative');
    expect(claim.modality).toBe('certain');
    expect(claim.source).toBeNull();
    expect(claim.span).toBeNull();
    expect(Array.isArray(claim.evidence)).toBe(true);
    expect(claim.evidence.length).toBe(0);
    expect(Array.isArray(claim.dependencies)).toBe(true);
    expect(claim.dependencies.length).toBe(0);
    expect(claim.confidence).toBe(0);
    expect(claim.evidenceRequirement).toBeNull();
    expect(claim.extractionMethod).toBe('manual');
  });

  it('传入自定义字段时覆盖默认值', () => {
    const claim = createClaim({
      type: 'location',
      confidence: 0.95,
      extractionMethod: 'custom',
    });
    expect(claim.type).toBe('location');
    expect(claim.confidence).toBe(0.95);
    expect(claim.extractionMethod).toBe('custom');
  });

  it('传入已知字段外的多余 key 不会导致错误', () => {
    const claim = createClaim({ foo: 'bar', baz: 123 });
    // 输出不应包含未知字段
    expect(claim).not.toHaveProperty('foo');
    expect(claim).not.toHaveProperty('baz');
  });
});

// ═══════════════════════════════════════════
// translateV2Claim — v2 → v3 翻译
// ═══════════════════════════════════════════

describe('translateV2Claim — v2 → v3 翻译', () => {
  const selfId = 'alice';
  const agentNames = { alice: '爱丽丝', bob: '鲍勃' };

  it('翻译 v2 location claim 样本', () => {
    const v2Claim = {
      type: 'location',
      subject: 'alice',
      predicate: 'is_at',
      object: '图书馆',
      polarity: 'affirmative',
      confidence: 0.85,
      evidenceRequired: 'self',
      sourceMarker: null,
      sourceSpan: { start: 0, end: 6, raw: '我在图书馆' },
    };

    const v3Claim = translateV2Claim(v2Claim, { selfId, agentNames, index: 1 });

    expect(v3Claim.type).toBe('location');
    expect(v3Claim.id).toBe('claim_001');
    expect(v3Claim.subject.kind).toBe('agent');
    expect(v3Claim.subject.id).toBe('alice');
    expect(v3Claim.subject.raw).toBe('alice');
    expect(v3Claim.predicate).toBe('is_at');
    expect(v3Claim.object.kind).toBe('location');
    expect(v3Claim.object.raw).toBe('图书馆');
    expect(v3Claim.polarity).toBe('affirmative');
    expect(v3Claim.modality).toBe('certain');
    expect(v3Claim.source).toBeNull();
    expect(v3Claim.span).toEqual({ start: 0, end: 6, raw: '我在图书馆' });
    expect(v3Claim.confidence).toBe(0.85);
    expect(v3Claim.evidenceRequirement).toBe('self');
    expect(v3Claim.extractionMethod).toBe('v2-adapter');
    expect(v3Claim.evidence).toEqual([]);
    expect(v3Claim.dependencies).toEqual([]);
  });

  it('翻译 v2 location claim（subject 为 displayName → 解析为 agentId）', () => {
    const v2Claim = {
      type: 'location',
      subject: '鲍勃',
      predicate: 'went_to',
      object: '食堂',
      polarity: 'affirmative',
      confidence: 0.8,
      evidenceRequired: 'observed',
      sourceMarker: null,
      sourceSpan: { start: 0, end: 8, raw: '鲍勃去了食堂' },
    };

    const v3Claim = translateV2Claim(v2Claim, { selfId, agentNames, index: 2 });

    expect(v3Claim.subject.kind).toBe('agent');
    expect(v3Claim.subject.id).toBe('bob');
    expect(v3Claim.subject.raw).toBe('鲍勃');
  });

  it('翻译 v2 location claim（subject 为 selfId）', () => {
    const v2Claim = {
      type: 'location',
      subject: 'alice',
      predicate: 'is_at',
      object: '图书馆',
      polarity: 'affirmative',
      confidence: 0.9,
      evidenceRequired: 'self',
      sourceMarker: null,
      sourceSpan: { start: 0, end: 6, raw: '我在图书馆' },
    };

    const v3Claim = translateV2Claim(v2Claim, { selfId: 'alice', agentNames, index: 3 });

    expect(v3Claim.subject.kind).toBe('agent');
    expect(v3Claim.subject.id).toBe('alice');
  });

  it('翻译 v2 event claim 样本', () => {
    const v2Claim = {
      type: 'event',
      subject: null,
      predicate: 'did',
      object: '吃了一顿饭',
      polarity: 'affirmative',
      confidence: 0.8,
      evidenceRequired: 'any',
      sourceMarker: null,
      sourceSpan: { start: 0, end: 10, raw: '刚刚吃了一顿饭了' },
    };

    const v3Claim = translateV2Claim(v2Claim, { selfId, agentNames, index: 4 });

    expect(v3Claim.type).toBe('event');
    expect(v3Claim.subject.kind).toBe('generic');
    expect(v3Claim.subject.id).toBeNull();
    expect(v3Claim.predicate).toBe('did');
    expect(v3Claim.object.kind).toBe('generic');
    expect(v3Claim.polarity).toBe('affirmative');
    expect(v3Claim.modality).toBe('certain');
  });

  it('翻译 v2 state claim 样本', () => {
    const v2Claim = {
      type: 'state',
      subject: 'bob',
      rawSubject: '鲍勃',
      predicate: 'feels',
      object: '焦虑',
      polarity: 'affirmative',
      confidence: 0.85,
      evidenceRequired: 'self',
      stateType: 'emotion',
      sourceMarker: null,
      sourceSpan: { start: 0, end: 6, raw: '鲍勃很焦虑' },
    };

    const v3Claim = translateV2Claim(v2Claim, { selfId, agentNames, index: 5 });

    expect(v3Claim.type).toBe('state');
    expect(v3Claim.subject.kind).toBe('agent');
    expect(v3Claim.subject.id).toBe('bob');
    expect(v3Claim.predicate).toBe('feels');
    expect(v3Claim.object.kind).toBe('generic');
    expect(v3Claim.object.raw).toBe('焦虑');
    // stateType 是 v2 特有字段，不应出现在 v3 输出中
    expect(v3Claim).not.toHaveProperty('stateType');
  });

  it('翻译 v2 source_attribution claim 样本', () => {
    const v2Claim = {
      type: 'source_attribution',
      subject: 'alice',
      predicate: 'heard',
      object: '鲍勃发现了一本好书',
      polarity: 'affirmative',
      confidence: 0.8,
      evidenceRequired: 'self',
      sourceMarker: 'told',
      sourceSpan: { start: 0, end: 14, raw: '听说鲍勃发现了一本好书' },
    };

    const v3Claim = translateV2Claim(v2Claim, { selfId, agentNames, index: 6 });

    expect(v3Claim.type).toBe('source_attribution');
    expect(v3Claim.source).toEqual({ kind: 'told' });
    expect(v3Claim.polarity).toBe('affirmative');
    expect(v3Claim.modality).toBe('certain');
  });

  it('翻译 v2 time claim 样本', () => {
    const v2Claim = {
      type: 'time',
      subject: null,
      predicate: 'time_ref',
      object: '深夜',
      polarity: 'affirmative',
      confidence: 0.9,
      evidenceRequired: 'any',
      sourceMarker: null,
      sourceSpan: { start: 0, end: 4, raw: '深夜的时候' },
    };

    const v3Claim = translateV2Claim(v2Claim, { selfId, agentNames, index: 7 });

    expect(v3Claim.type).toBe('time');
    expect(v3Claim.subject.kind).toBe('generic');
    expect(v3Claim.subject.id).toBeNull();
    expect(v3Claim.predicate).toBe('time_ref');
    expect(v3Claim.object.kind).toBe('generic');
    expect(v3Claim.object.raw).toBe('深夜');
  });
});

// ═══════════════════════════════════════════
// v2 polarity → v3 polarity / modality 映射
// ═══════════════════════════════════════════

describe('translateV2Claim — polarity/modality 映射', () => {
  const selfId = 'alice';
  const agentNames = { alice: '爱丽丝' };

  it('v2 polarity "uncertain" → v3 polarity "affirmative" + modality "uncertain"', () => {
    const v2Claim = {
      type: 'location',
      subject: 'alice',
      predicate: 'is_at',
      object: '酒馆',
      polarity: 'uncertain',
      confidence: 0.7,
      evidenceRequired: 'self',
      sourceMarker: null,
      sourceSpan: { start: 0, end: 8, raw: '鲍勃可能在酒馆' },
    };

    const v3Claim = translateV2Claim(v2Claim, { selfId, agentNames, index: 10 });

    expect(v3Claim.polarity).toBe('affirmative');
    expect(v3Claim.modality).toBe('uncertain');
  });

  it('v2 polarity "negative" → v3 polarity "negative" + modality "certain"', () => {
    const v2Claim = {
      type: 'location',
      subject: 'alice',
      predicate: 'is_at',
      object: '图书馆',
      polarity: 'negative',
      confidence: 0.85,
      evidenceRequired: 'self',
      sourceMarker: null,
      sourceSpan: { start: 0, end: 6, raw: '我不在图书馆' },
    };

    const v3Claim = translateV2Claim(v2Claim, { selfId, agentNames, index: 11 });

    expect(v3Claim.polarity).toBe('negative');
    expect(v3Claim.modality).toBe('certain');
  });

  it('v2 polarity "affirmative" → modality "certain"', () => {
    const v2Claim = {
      type: 'location',
      subject: 'alice',
      predicate: 'is_at',
      object: '图书馆',
      polarity: 'affirmative',
      confidence: 0.85,
      evidenceRequired: 'self',
      sourceMarker: null,
      sourceSpan: { start: 0, end: 6, raw: '我在图书馆' },
    };

    const v3Claim = translateV2Claim(v2Claim, { selfId, agentNames, index: 12 });

    expect(v3Claim.polarity).toBe('affirmative');
    expect(v3Claim.modality).toBe('certain');
  });
});

// ═══════════════════════════════════════════
// 未知字段安全忽略
// ═══════════════════════════════════════════

describe('translateV2Claim — 未知字段安全忽略', () => {
  it('v2 claim 含额外字段时不污染 v3 输出', () => {
    const v2Claim = {
      type: 'state',
      subject: 'alice',
      predicate: 'feels',
      object: '开心',
      polarity: 'affirmative',
      confidence: 0.85,
      evidenceRequired: 'self',
      sourceMarker: null,
      sourceSpan: { start: 0, end: 4, raw: '我很开心' },
      // v2 特有字段
      stateType: 'emotion',
      rawSubject: '爱丽丝',
      // 完全无关的多余字段
      unknownField: 'should_be_ignored',
      nestedExtra: { foo: 'bar' },
    };

    const v3Claim = translateV2Claim(v2Claim, { selfId: 'alice', index: 20 });

    expect(v3Claim).not.toHaveProperty('stateType');
    expect(v3Claim).not.toHaveProperty('rawSubject');
    expect(v3Claim).not.toHaveProperty('unknownField');
    expect(v3Claim).not.toHaveProperty('nestedExtra');
  });
});

// ═══════════════════════════════════════════
// normalize
// ═══════════════════════════════════════════

describe('normalize — 规范化', () => {
  it('normalize 不 mutate 输入对象', () => {
    const input = { type: 'location', confidence: 0.9 };
    const original = JSON.parse(JSON.stringify(input));
    normalize(input);
    expect(input).toEqual(original);
  });

  it('normalize 返回带有所有必填字段的新对象', () => {
    const input = { type: 'event', confidence: 0.8 };
    const result = normalize(input);

    expect(result.type).toBe('event');
    expect(result.subject).toBeNull();
    expect(result.predicate).toBeNull();
    expect(result.object).toBeNull();
    expect(result.polarity).toBe('affirmative');
    expect(result.modality).toBe('certain');
    expect(result.source).toBeNull();
    expect(result.span).toBeNull();
    expect(result.evidence).toEqual([]);
    expect(result.dependencies).toEqual([]);
    expect(result.confidence).toBe(0.8);
    expect(result.extractionMethod).toBe('manual');
  });

  it('normalize 过滤掉未知字段', () => {
    const input = { type: 'state', foo: 'bar', confidence: 0.5 };
    const result = normalize(input);

    expect(result).not.toHaveProperty('foo');
    expect(result.type).toBe('state');
    expect(result.confidence).toBe(0.5);
  });

  it('normalize 对已有完整字段的 claim 原样返回（不改变值）', () => {
    const input = {
      id: 'claim_999',
      type: 'location',
      subject: { kind: 'agent', id: 'bob', raw: '鲍勃' },
      predicate: 'went_to',
      object: { kind: 'location', id: 'library', raw: '图书馆' },
      polarity: 'affirmative',
      modality: 'certain',
      source: { kind: 'told' },
      span: { start: 0, end: 10, raw: '鲍勃去了图书馆' },
      evidence: [{ claimId: 'claim_999', factId: 'fact_1' }],
      dependencies: [],
      confidence: 0.9,
      evidenceRequirement: 'observed',
      extractionMethod: 'manual',
    };
    const result = normalize(input);

    expect(result.id).toBe('claim_999');
    expect(result.type).toBe('location');
    expect(result.evidence.length).toBe(1);
  });
});

// ═══════════════════════════════════════════
// isBlocking
// ═══════════════════════════════════════════

describe('isBlocking — blocking 判定', () => {
  it('confidence 0.64 → 非 blocking', () => {
    const claim = createClaim({ confidence: 0.64, modality: 'certain' });
    expect(isBlocking(claim)).toBe(false);
  });

  it('confidence 0.65 → blocking', () => {
    const claim = createClaim({ confidence: 0.65, modality: 'certain' });
    expect(isBlocking(claim)).toBe(true);
  });

  it('confidence 0.9 但 modality uncertain → 非 blocking', () => {
    const claim = createClaim({ confidence: 0.9, modality: 'uncertain' });
    expect(isBlocking(claim)).toBe(false);
  });

  it('confidence 0.9 且 modality certain → blocking', () => {
    const claim = createClaim({ confidence: 0.9, modality: 'certain' });
    expect(isBlocking(claim)).toBe(true);
  });

  it('modality hypothetical → blocking（isBlocking 仅排除 uncertain，与 v2 等价）', () => {
    const claim = createClaim({ confidence: 0.95, modality: 'hypothetical' });
    expect(isBlocking(claim)).toBe(true);
  });

  it('modality inferred → blocking（isBlocking 仅排除 uncertain，与 v2 等价）', () => {
    const claim = createClaim({ confidence: 0.9, modality: 'inferred' });
    expect(isBlocking(claim)).toBe(true);
  });

  it('modality reported → blocking（isBlocking 仅排除 uncertain，与 v2 等价）', () => {
    const claim = createClaim({ confidence: 0.9, modality: 'reported' });
    expect(isBlocking(claim)).toBe(true);
  });
});

// ═══════════════════════════════════════════
// 边界检查：模块不导入/不写入 canon 或 store
// ═══════════════════════════════════════════

describe('ClaimSchema — 边界合规性', () => {
  it('源码不包含 .addFact( 写入模式', () => {
    expect(schemaSource).not.toContain('.addFact(');
  });

  it('源码不包含 .set( 写入模式', () => {
    expect(schemaSource).not.toContain('.set(');
  });

  it('源码不包含 .invalidateFact( 写入模式', () => {
    expect(schemaSource).not.toContain('.invalidateFact(');
  });

  it('源码不包含 require canon/WorldFactStore', () => {
    expect(schemaSource).not.toContain('WorldFactStore');
  });

  it('源码不包含 require canon/FactSchema', () => {
    expect(schemaSource).not.toContain('FactSchema');
  });

  it('源码不包含 require knowledge', () => {
    expect(schemaSource).not.toContain('knowledge');
  });

  it('源码不包含 require agent/', () => {
    expect(schemaSource).not.toContain('agent/');
  });
});
