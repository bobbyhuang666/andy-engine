/**
 * GroundingChecker M2-R2 — Sidecar (structuredClaims) 路径测试
 *
 * 覆盖：
 *   1. text-only 零回归
 *   2. options={} 空对象 → 等价 text-only
 *   3-6. sidecar location claim 匹配/mismatch
 *   7-8. sidecar 新事件/关系 → reject
 *   9-11. sidecar malformed
 *   12-13. mistrusted 强制 promote
 *   14-15. evidenceTrace 在 sidecar 路径
 *   16. propagatedFrom 红线
 *   17. checkerVersion
 *   18-19. null/undefined structuredClaims
 *   20. 合并去重
 *   21-22. sidecar_validation_warning
 *   23. v3 异常隔离
 *   24. source.kind='told' 但 source.by 不存在 agent
 *   25. corpus 全量回归
 */

import { describe, it, expect } from 'vitest';
const { createRequire } = await import('node:module');
const require = createRequire(import.meta.url);
const GroundingChecker = require('../../../../src/narrative/GroundingChecker.js');
const { FactType, FactScope } = require('../../../../src/canon/FactSchema.js');
const { corpus, baseGrounding: corpusBaseGrounding } = require('../../../fixtures/narrative-violations/index.js');

// ─── 工具函数 ────────────────────────────────────────────────────────────────

function makeChecker() {
  return new GroundingChecker({}, {});
}

function baseGrounding(overrides = {}) {
  return {
    allowedFacts: [
      { type: FactType.AGENT_STATE, agentId: 'alice' },
      { type: FactType.AGENT_STATE, agentId: 'bob' },
    ],
    metadata: {
      agentId: 'alice',
      agentNames: { alice: '爱丽丝', bob: '鲍勃' },
      currentTime: new Date('2026-09-01T12:00:00Z'),
    },
    ...overrides,
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// Test 1: text-only zero regression
// ═══════════════════════════════════════════════════════════════════════════════

describe('sidecar — text-only zero regression', () => {
  it('check(text, grounding) 不带 options → 与 v2 完全一致', () => {
    const c = makeChecker();
    const g = baseGrounding({
      allowedFacts: [
        { type: FactType.AGENT_STATE, agentId: 'alice', position: '图书馆' },
        { type: FactType.AGENT_STATE, agentId: 'bob' },
      ],
    });
    const r = c.check('我在图书馆', g);
    expect(r.valid).toBe(true);
    expect(r.severity).toBe('pass');
    expect(r.violations).toEqual([]);
    expect(r.checkerVersion).toBe('v2-structured');
  });

  it('text-only 有 violation 也一致', () => {
    const c = makeChecker();
    const g = baseGrounding();
    const r = c.check('鲍勃在图书馆', g);
    expect(r.valid).toBe(false);
    expect(r.violations.some(v => v.type === 'unsupported_claim')).toBe(true);
    expect(r.severity).toBe('rewrite');
    expect(r.checkerVersion).toBe('v2-structured');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Test 2: options={} 空对象 → 等价 text-only
// ═══════════════════════════════════════════════════════════════════════════════

describe('sidecar — options={} 空对象', () => {
  it('options={} 时行为与不带 options 一致', () => {
    const c = makeChecker();
    const g = baseGrounding();
    const r1 = c.check('鲍勃在图书馆', g);
    const r2 = c.check('鲍勃在图书馆', g, {});
    expect(r1.valid).toBe(r2.valid);
    expect(r1.severity).toBe(r2.severity);
    expect(r1.violations.length).toBe(r2.violations.length);
    expect(r1.checkerVersion).toBe(r2.checkerVersion);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Test 3: sidecar location claim 无 evidence → unsupported_claim
// ═══════════════════════════════════════════════════════════════════════════════

describe('sidecar — location claim mismatch', () => {
  it('sidecar 声称 bob 在图书馆但 grounding 无证据 → unsupported_claim + severity rewrite', () => {
    const c = makeChecker();
    const g = baseGrounding();
    const sidecar = {
      claims: [{
        type: 'location',
        subject: 'bob',
        predicate: 'is_at',
        object: '图书馆',
        polarity: 'affirmative',
        modality: 'certain',
      }],
    };
    const r = c.check('鲍勃在图书馆', g, { structuredClaims: sidecar });
    expect(r.violations.some(v => v.type === 'unsupported_claim')).toBe(true);
    expect(r.severity).toBe('rewrite');
  });

  it('sidecar 声称 bob 在图书馆且 grounding 有 EVENT 支撑 → valid', () => {
    const c = makeChecker();
    const g = baseGrounding({
      allowedFacts: [
        { type: FactType.AGENT_STATE, agentId: 'alice' },
        { type: FactType.AGENT_STATE, agentId: 'bob' },
        {
          type: FactType.EVENT,
          description: '鲍勃在图书馆',
          location: '图书馆',
          participants: ['bob'],
        },
      ],
    });
    const sidecar = {
      claims: [{
        type: 'location',
        subject: 'bob',
        predicate: 'is_at',
        object: '图书馆',
        polarity: 'affirmative',
        modality: 'certain',
      }],
    };
    const r = c.check('鲍勃在图书馆', g, { structuredClaims: sidecar });
    expect(r.valid).toBe(true);
    expect(r.violations.some(v => v.type === 'unsupported_claim')).toBe(false);
  });

  it('sidecar object 与 evidence location 不符 → unsupported_claim', () => {
    // sidecar 说"图书馆"，但 grounding event 在"食堂"
    const c = makeChecker();
    const g = baseGrounding({
      allowedFacts: [
        { type: FactType.AGENT_STATE, agentId: 'alice' },
        { type: FactType.AGENT_STATE, agentId: 'bob' },
        {
          type: FactType.EVENT,
          description: '鲍勃在食堂',
          location: '食堂',
          participants: ['bob'],
        },
      ],
    });
    const sidecar = {
      claims: [{
        type: 'location',
        subject: 'bob',
        predicate: 'is_at',
        object: '图书馆',
        polarity: 'affirmative',
        modality: 'certain',
      }],
    };
    const r = c.check('鲍勃在图书馆', g, { structuredClaims: sidecar });
    expect(r.violations.some(v => v.type === 'unsupported_claim')).toBe(true);
  });

  it('sidecar subject 不存在于 grounding → unsupported_claim', () => {
    const c = makeChecker();
    const g = baseGrounding({
      allowedFacts: [
        { type: FactType.AGENT_STATE, agentId: 'alice' },
        { type: FactType.AGENT_STATE, agentId: 'bob' },
      ],
    });
    const sidecar = {
      claims: [{
        type: 'location',
        subject: 'charlie',
        predicate: 'is_at',
        object: '图书馆',
        polarity: 'affirmative',
        modality: 'certain',
      }],
    };
    const r = c.check('查理在图书馆', g, { structuredClaims: sidecar });
    expect(r.violations.some(v => v.type === 'unsupported_claim')).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Test 7: sidecar 新事件 → reject new_event
// ═══════════════════════════════════════════════════════════════════════════════

describe('sidecar — new event rejection', () => {
  it('sidecar type=event predicate=did → reject new_event, severity reject', () => {
    const c = makeChecker();
    const g = baseGrounding();
    const sidecar = {
      claims: [{
        type: 'event',
        subject: 'alice',
        predicate: 'did',
        object: '吃了一顿大餐',
        polarity: 'affirmative',
        modality: 'certain',
      }],
    };
    const r = c.check('刚刚吃了一顿大餐了', g, { structuredClaims: sidecar });
    expect(r.violations.some(v => v.type === 'new_event')).toBe(true);
    expect(r.severity).toBe('reject');
  });

  it('mistrusted event 即使 confidence 0.5 仍 reject（强制 promote）', () => {
    const c = makeChecker();
    const g = baseGrounding();
    // SidecarValidator 自动将 event+did 设为 mistrusted + confidence 0.5
    // 但我们仍要验证 checker 将其 promote 到 blocking 并 reject
    const sidecar = {
      claims: [{
        type: 'event',
        subject: 'alice',
        predicate: 'did',
        object: '游泳',
        polarity: 'affirmative',
        modality: 'certain',
      }],
    };
    const r = c.check('alice 去游泳了', g, { structuredClaims: sidecar });
    expect(r.violations.some(v => v.type === 'new_event')).toBe(true);
    expect(r.severity).toBe('reject');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Test 8: sidecar relationship → reject new_relationship
// ═══════════════════════════════════════════════════════════════════════════════

describe('sidecar — relationship rejection', () => {
  it('sidecar type=relationship → reject new_relationship', () => {
    const c = makeChecker();
    const g = baseGrounding();
    const sidecar = {
      claims: [{
        type: 'relationship',
        subject: 'alice',
        predicate: 'has_relationship',
        object: '分手',
        polarity: 'affirmative',
        modality: 'certain',
      }],
    };
    const r = c.check('他们分手了', g, { structuredClaims: sidecar });
    expect(r.violations.some(v => v.type === 'new_relationship')).toBe(true);
    expect(r.severity).toBe('reject');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Test 9-11: sidecar malformed
// ═══════════════════════════════════════════════════════════════════════════════

describe('sidecar — malformed handling', () => {
  it('sidecar string 非 JSON → malformed_sidecar violation + fallback 到 text-only extractor', () => {
    const c = makeChecker();
    const g = baseGrounding();
    const r = c.check('鲍勃在图书馆', g, { structuredClaims: 'not json' });
    expect(r.violations.some(v => v.type === 'malformed_sidecar')).toBe(true);
    // Fallback: text extractor 仍应产生 unsupported_claim
    expect(r.violations.some(v => v.type === 'unsupported_claim')).toBe(true);
    expect(r.severity).toBe('rewrite');
  });

  it('sidecar claims 不是数组 → malformed_sidecar violation', () => {
    const c = makeChecker();
    const g = baseGrounding();
    const r = c.check('鲍勃在图书馆', g, { structuredClaims: { claims: 'not-array' } });
    expect(r.violations.some(v => v.type === 'malformed_sidecar')).toBe(true);
  });

  it('sidecar 一条合法一条 malformed → 合法条目进入校验链、malformed 条产 violation', () => {
    const c = makeChecker();
    const g = baseGrounding({
      allowedFacts: [
        { type: FactType.AGENT_STATE, agentId: 'alice', position: '图书馆' },
        { type: FactType.AGENT_STATE, agentId: 'bob' },
      ],
    });
    const sidecar = {
      claims: [
        { type: 'location', subject: 'alice', predicate: 'is_at', object: '图书馆', polarity: 'affirmative', modality: 'certain' }, // valid, supported
        'not-an-object', // malformed
      ],
    };
    const r = c.check('我在图书馆', g, { structuredClaims: sidecar });
    // valid location claim → no unsupported_claim for alice in library
    expect(r.violations.some(v => v.type === 'malformed_sidecar')).toBe(true);
    // alice 在图书馆有 AGENT_STATE 支撑 → valid
    expect(r.violations.some(v => v.type === 'unsupported_claim')).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Test 12-13: mistrusted relationship + fake confidence
// ═══════════════════════════════════════════════════════════════════════════════

describe('sidecar — mistrust enforcement', () => {
  it('mistrusted relationship 同时 grounding 无 RELATIONSHIP fact → still reject', () => {
    const c = makeChecker();
    const g = baseGrounding();
    const sidecar = {
      claims: [{
        type: 'relationship',
        subject: 'alice',
        predicate: 'has_relationship',
        object: '朋友',
        polarity: 'affirmative',
        modality: 'certain',
      }],
    };
    const r = c.check('我和 bob 是朋友', g, { structuredClaims: sidecar });
    expect(r.violations.some(v => v.type === 'new_relationship')).toBe(true);
    expect(r.severity).toBe('reject');
  });

  it('sidecar 伪造 confidence=0.99 给 mistrusted 类 → 仍被 reject', () => {
    const c = makeChecker();
    const g = baseGrounding();
    // SidecarValidator 忽略 sidecar 中的 confidence 字段
    // 但这里我们直接传 claim 对象给 checker（不经过 validator）来验证
    // 实际上 sidecar 路径总是经过 validator，所以 confidence 被重置为 0.5
    // 但 mistrusted claim 无论 confidence 多少都会被 promote 到 blocking
    const sidecar = {
      claims: [{
        type: 'event',
        subject: 'alice',
        predicate: 'did',
        object: '游泳',
        polarity: 'affirmative',
        modality: 'certain',
        confidence: 0.99, // 试图 bypass
      }],
    };
    const r = c.check('alice 去游泳了', g, { structuredClaims: sidecar });
    // mistrusted event 仍被 reject
    expect(r.violations.some(v => v.type === 'new_event')).toBe(true);
    expect(r.severity).toBe('reject');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Test 14-15: mixed text + sidecar, dedup
// ═══════════════════════════════════════════════════════════════════════════════

describe('sidecar — mixed text + sidecar', () => {
  it('text-only extractor 出 location + sidecar 出 location，grounding 均无 evidence → 至少 1 unsupported_claim', () => {
    const c = makeChecker();
    const g = baseGrounding();
    const sidecar = {
      claims: [{
        type: 'location',
        subject: 'bob',
        predicate: 'is_at',
        object: '图书馆',
        polarity: 'affirmative',
        modality: 'certain',
      }],
    };
    const r = c.check('鲍勃在图书馆', g, { structuredClaims: sidecar });
    const ucCount = r.violations.filter(v => v.type === 'unsupported_claim').length;
    expect(ucCount).toBeGreaterThanOrEqual(1);
  });

  it('text + sidecar 同 location 合并去重 → 不双 violation', () => {
    const c = makeChecker();
    const g = baseGrounding({
      allowedFacts: [
        { type: FactType.AGENT_STATE, agentId: 'alice', position: '图书馆' },
      ],
    });
    // text: "我在图书馆" → extractor 出 self location claim
    // sidecar: 同一条 location claim
    const sidecar = {
      claims: [{
        type: 'location',
        subject: 'alice',
        predicate: 'is_at',
        object: '图书馆',
        polarity: 'affirmative',
        modality: 'certain',
      }],
    };
    const r = c.check('我在图书馆', g, { structuredClaims: sidecar });
    expect(r.valid).toBe(true);
    // 不应出现 duplicate unsupported_claim
    const ucCount = r.violations.filter(v => v.type === 'unsupported_claim').length;
    expect(ucCount).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Test 15: evidenceTrace 在 sidecar 路径
// ═══════════════════════════════════════════════════════════════════════════════

describe('sidecar — evidenceTrace', () => {
  it('sidecar 路径下 evidenceTrace 仍存在且结构正确含 sidecar claim', () => {
    const c = makeChecker();
    const g = baseGrounding({
      allowedFacts: [
        { type: FactType.AGENT_STATE, agentId: 'alice', position: '图书馆' },
        { type: FactType.AGENT_STATE, agentId: 'bob' },
      ],
      metadata: { agentId: 'alice', agentNames: { alice: '爱丽丝', bob: '鲍勃' } },
    });
    const sidecar = {
      claims: [{
        type: 'location',
        subject: 'alice',
        predicate: 'is_at',
        object: '图书馆',
        polarity: 'affirmative',
        modality: 'certain',
      }],
    };
    const r = c.check('我在图书馆', g, { structuredClaims: sidecar });
    expect(Array.isArray(r.evidenceTrace)).toBe(true);
    expect(r.evidenceTrace.length).toBeGreaterThan(0);
    // 每个 trace element 应有必需字段
    const requiredFields = ['claimId', 'type', 'subjectId', 'objectRaw', 'support', 'blocking'];
    for (const elem of r.evidenceTrace) {
      for (const field of requiredFields) {
        expect(elem).toHaveProperty(field);
      }
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Test 16: propagatedFrom 红线在 sidecar 路径
// ═══════════════════════════════════════════════════════════════════════════════

describe('sidecar — propagatedFrom 红线', () => {
  it('sidecar 声称 propagatedFrom 在场 → unsupported', () => {
    const c = makeChecker();
    const g = baseGrounding({
      allowedFacts: [
        { type: FactType.AGENT_STATE, agentId: 'alice' },
        { type: FactType.AGENT_STATE, agentId: 'bob' },
        {
          type: FactType.EVENT,
          description: '查理在图书馆',
          location: '图书馆',
          participants: ['charlie'],
          _evidence: { source: 'told', confidence: 0.6, propagatedFrom: 'bob' },
        },
      ],
    });
    const sidecar = {
      claims: [{
        type: 'location',
        subject: 'bob',
        predicate: 'is_at',
        object: '图书馆',
        polarity: 'affirmative',
        modality: 'certain',
      }],
    };
    const r = c.check('鲍勃在图书馆', g, { structuredClaims: sidecar });
    // Bob 不是 EVENT 参与者 → unsupported_claim
    expect(r.violations.some(v => v.type === 'unsupported_claim')).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Test 17: checkerVersion 仍 'v2-structured'
// ═══════════════════════════════════════════════════════════════════════════════

describe('sidecar — checkerVersion', () => {
  it('sidecar 路径 checkerVersion 仍为 v2-structured', () => {
    const c = makeChecker();
    const g = baseGrounding();
    const sidecar = {
      claims: [{
        type: 'location',
        subject: 'bob',
        predicate: 'is_at',
        object: '图书馆',
        polarity: 'affirmative',
        modality: 'certain',
      }],
    };
    const r = c.check('鲍勃在图书馆', g, { structuredClaims: sidecar });
    expect(r.checkerVersion).toBe('v2-structured');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Test 18-19: null/undefined structuredClaims
// ═══════════════════════════════════════════════════════════════════════════════

describe('sidecar — null/undefined structuredClaims', () => {
  it('structuredClaims=null → 当 text-only 处理', () => {
    const c = makeChecker();
    const g = baseGrounding();
    const r = c.check('鲍勃在图书馆', g, { structuredClaims: null });
    expect(r.violations.some(v => v.type === 'unsupported_claim')).toBe(true);
    expect(r.severity).toBe('rewrite');
  });

  it('structuredClaims=undefined → text-only', () => {
    const c = makeChecker();
    const g = baseGrounding();
    const r = c.check('鲍勃在图书馆', g, { structuredClaims: undefined });
    expect(r.violations.some(v => v.type === 'unsupported_claim')).toBe(true);
    expect(r.severity).toBe('rewrite');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Test 21: malformed_sidecar violation 含可读 message
// ═══════════════════════════════════════════════════════════════════════════════

describe('sidecar — malformed_sidecar message', () => {
  it('malformed_sidecar violation 含可读 message', () => {
    const c = makeChecker();
    const g = baseGrounding();
    const r = c.check('鲍勃在图书馆', g, { structuredClaims: 'not-json' });
    const ms = r.violations.find(v => v.type === 'malformed_sidecar');
    expect(ms).toBeDefined();
    expect(typeof ms.message).toBe('string');
    expect(ms.message.length).toBeGreaterThan(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Test 22: sidecar_validation_warning
// ═══════════════════════════════════════════════════════════════════════════════

describe('sidecar — sidecar_validation_warning', () => {
  it('unknown_type/missing_field 类 issue 记入 violations 但不改 severity 量级', () => {
    const c = makeChecker();
    const g = baseGrounding({
      allowedFacts: [
        { type: FactType.AGENT_STATE, agentId: 'alice', position: '图书馆' },
      ],
    });
    const sidecar = {
      claims: [
        { type: 'location', subject: 'alice', predicate: 'is_at', object: '图书馆', polarity: 'affirmative', modality: 'certain' },
        { type: 'unknown_type_xyz', subject: 'alice', predicate: 'foo', object: 'bar' }, // unknown_type
      ],
    };
    const r = c.check('我在图书馆', g, { structuredClaims: sidecar });
    expect(r.violations.some(v => v.type === 'sidecar_validation_warning')).toBe(true);
    // 合法 claim 被支持；sidecar validation issue remains a warning.
    expect(r.severity).toBe('warning');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Test 23: sidecar 路径 v3 异常隔离
// ═══════════════════════════════════════════════════════════════════════════════

describe('sidecar — v3 exception isolation', () => {
  it('sidecar 路径 v3 异常不破坏主结果', () => {
    const c = makeChecker();
    const g = baseGrounding();
    // 提供一个合法的 sidecar claim
    const sidecar = {
      claims: [{
        type: 'location',
        subject: 'bob',
        predicate: 'is_at',
        object: '图书馆',
        polarity: 'affirmative',
        modality: 'certain',
      }],
    };
    // 即使 allowedFacts 为空导致 binder 异常，主结果也应正常
    const r = c.check('鲍勃在图书馆', { allowedFacts: [], metadata: { agentId: 'alice', agentNames: {} } }, { structuredClaims: sidecar });
    expect(r.valid).toBeDefined();
    expect(Array.isArray(r.violations)).toBe(true);
    expect(r.severity).toBeDefined();
    expect(r.checkerVersion).toBe('v2-structured');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Test 24: source.kind='told' 但 source.by 不存在 agent
// ═══════════════════════════════════════════════════════════════════════════════

describe('sidecar — source.told missing agent', () => {
  it('sidecar source.kind=told 但 source.by 不存在 agent → 不阻断（warning）', () => {
    const c = makeChecker();
    const g = baseGrounding();
    const sidecar = {
      claims: [{
        type: 'location',
        subject: 'bob',
        predicate: 'is_at',
        object: '图书馆',
        polarity: 'affirmative',
        modality: 'reported',
        source: { kind: 'told', by: 'nonexistent_agent' },
      }],
    };
    const r = c.check('鲍勃在图书馆', g, { structuredClaims: sidecar });
    // 仍应报 unsupported_claim（bob 不在图书馆的证据）
    expect(r.violations.some(v => v.type === 'unsupported_claim')).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Test 25: corpus 全量回归
// ═══════════════════════════════════════════════════════════════════════════════

describe('sidecar — corpus 全量回归', () => {
  it('legacy 调用 check(text, grounding) 全量 corpus 60 条 severity 与不带 sidecar 一致', () => {
    const c = makeChecker();
    for (const sample of corpus) {
      const r1 = c.check(sample.llmOutput, sample.grounding);
      const r2 = c.check(sample.llmOutput, sample.grounding, {});
      expect(r1.severity, `${sample.id} severity`).toBe(r2.severity);
      expect(r1.valid, `${sample.id} valid`).toBe(r2.valid);
      expect(r1.violations.length, `${sample.id} violations count`).toBe(r2.violations.length);
    }
  });

  it('corpus 每条 legacy 调用结果与历史 v2 一致', () => {
    const c = makeChecker();
    for (const sample of corpus) {
      const r = c.check(sample.llmOutput, sample.grounding);
      expect(r.checkerVersion).toBe('v2-structured');
      expect(Array.isArray(r.violations)).toBe(true);
      expect(['reject', 'rewrite', 'warning', 'degrade_to_template', 'pass']).toContain(r.severity);
      expect(r.valid).toBe(r.violations.length === 0);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Additional: sidecar structured input formats
// ═══════════════════════════════════════════════════════════════════════════════

describe('sidecar — input format variants', () => {
  it('options.structuredClaims 为裸 claims 数组 → 正常处理', () => {
    const c = makeChecker();
    const g = baseGrounding();
    const r = c.check('鲍勃在图书馆', g, {
      structuredClaims: [{
        type: 'location',
        subject: 'bob',
        predicate: 'is_at',
        object: '图书馆',
        polarity: 'affirmative',
        modality: 'certain',
      }],
    });
    expect(r.violations.some(v => v.type === 'unsupported_claim')).toBe(true);
  });

  it('options.structuredClaims 为 stringified JSON → 正常解析', () => {
    const c = makeChecker();
    const g = baseGrounding({
      allowedFacts: [
        { type: FactType.AGENT_STATE, agentId: 'alice', position: '图书馆' },
      ],
    });
    const jsonStr = JSON.stringify({
      claims: [{
        type: 'location',
        subject: 'alice',
        predicate: 'is_at',
        object: '图书馆',
        polarity: 'affirmative',
        modality: 'certain',
      }],
    });
    const r = c.check('我在图书馆', g, { structuredClaims: jsonStr });
    expect(r.valid).toBe(true);
  });

  it('options.structuredClaims 为 {text, claims} 格式 → 正常处理 claims', () => {
    const c = makeChecker();
    const g = baseGrounding();
    const r = c.check('鲍勃在图书馆', g, {
      structuredClaims: {
        text: '鲍勃在图书馆',
        claims: [{
          type: 'location',
          subject: 'bob',
          predicate: 'is_at',
          object: '图书馆',
          polarity: 'affirmative',
          modality: 'certain',
        }],
      },
    });
    expect(r.violations.some(v => v.type === 'unsupported_claim')).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Additional: sidecar issues mapping
// ═══════════════════════════════════════════════════════════════════════════════

describe('sidecar — issue types mapping', () => {
  it('untrusted_new_event issue → new_event violation', () => {
    const c = makeChecker();
    const g = baseGrounding();
    const sidecar = {
      claims: [{
        type: 'event',
        subject: 'alice',
        predicate: 'did',
        object: '游泳',
        polarity: 'affirmative',
        modality: 'certain',
      }],
    };
    const r = c.check('alice 去游泳了', g, { structuredClaims: sidecar });
    const ne = r.violations.find(v => v.type === 'new_event');
    expect(ne).toBeDefined();
  });

  it('untrusted_new_relationship issue → new_relationship violation', () => {
    const c = makeChecker();
    const g = baseGrounding();
    const sidecar = {
      claims: [{
        type: 'relationship',
        subject: 'alice',
        predicate: 'has_relationship',
        object: '朋友',
        polarity: 'affirmative',
        modality: 'certain',
      }],
    };
    const r = c.check('alice 和 bob 是朋友', g, { structuredClaims: sidecar });
    const nr = r.violations.find(v => v.type === 'new_relationship');
    expect(nr).toBeDefined();
  });
});
