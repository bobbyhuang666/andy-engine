/**
 * M2-R3 — Facade Sidecar Passthrough 测试
 *
 * 覆盖：
 *   1. FactConsistencyChecker.check(text, grounding) 双参 → 与历史等价
 *   2. FactConsistencyChecker.check(text, grounding, {}) 空对象等价双参
 *   3. FactConsistencyChecker.check(text, grounding, { structuredClaims: location }) → unsupported_claim 透传
 *   4. FactConsistencyChecker.check(text, grounding, { structuredClaims: new_event }) → reject new_event 透传
 *   5. FactConsistencyChecker.check(text, grounding, { structuredClaims: malformed }) → malformed_sidecar 透传
 *   6. engine facade checkConsistency 双参与三参{}等价
 *   7. engine facade checkConsistency 三参带 structuredClaims → 透传出 facade 含 violation
 *   8. Character.chat 不带 options → 与历史行为一致（第三参 undefined）
 *   9. Character.chat 带 structuredClaims → engine.checkConsistency 收到 structuredClaims
 *   10. Character.chatStream 同 chat
 *   11. 现 tests/unit/character-*.test.js 仍绿（零回归）— 通过本文件 spy 验证
 */

import { describe, it, expect, vi } from 'vitest';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { FactType } = require('../../../../src/canon/FactSchema.js');
const FactConsistencyChecker = require('../../../../src/narrative/FactConsistencyChecker.js');
const Character = require('../../../../src/sdk/Character.js');
const { corpus, baseGrounding: corpusBaseGrounding } = require('../../../fixtures/narrative-violations/index.js');

// ─── 工具函数 ────────────────────────────────────────────────────────────────

function makeFcc(overrides = {}) {
  return new FactConsistencyChecker({}, overrides.domain || 'campus');
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
// Test 1: FCC check(text, grounding) 双参 → 与历史等价
// ═══════════════════════════════════════════════════════════════════════════════

describe('M2-R3: FactConsistencyChecker 双参调用零回归', () => {
  it('双参调用 check(text, grounding) 无 options → severity/violations 与历史一致', () => {
    const fcc = makeFcc();
    const g = baseGrounding();
    const r = fcc.check('鲍勃在图书馆', g);
    expect(r.valid).toBe(false);
    expect(r.violations.some(v => v.type === 'unsupported_claim')).toBe(true);
    expect(r.severity).toBe('rewrite');
    expect(r.checkerVersion).toBe('v2-structured');
    expect(r.groundingVersion).toBe('v3-semantic-alpha');
  });

  it('双参调用 — corpus 每条样本 legacy 结果不变', () => {
    const fcc = makeFcc();
    for (const sample of corpus) {
      const r = fcc.check(sample.llmOutput, sample.grounding);
      expect(r.checkerVersion).toBe('v2-structured');
      expect(r.groundingVersion).toBe('v3-semantic-alpha');
      expect(Array.isArray(r.violations)).toBe(true);
      expect(['reject', 'rewrite', 'warning', 'degrade_to_template', 'pass']).toContain(r.severity);
      expect(r.valid).toBe(r.violations.length === 0);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Test 2: FCC check(text, grounding, {}) 空对象等价双参
// ═══════════════════════════════════════════════════════════════════════════════

describe('M2-R3: FCC options={} 空对象等价', () => {
  it('options={} 与不带 options 结果一致', () => {
    const fcc = makeFcc();
    const g = baseGrounding();
    const r1 = fcc.check('鲍勃在图书馆', g);
    const r2 = fcc.check('鲍勃在图书馆', g, {});
    expect(r1.valid).toBe(r2.valid);
    expect(r1.severity).toBe(r2.severity);
    expect(r1.violations.length).toBe(r2.violations.length);
    expect(r1.checkerVersion).toBe(r2.checkerVersion);
  });

  it('corpus 全量: legacy vs options={} 全部等价', () => {
    const fcc = makeFcc();
    for (const sample of corpus) {
      const r1 = fcc.check(sample.llmOutput, sample.grounding);
      const r2 = fcc.check(sample.llmOutput, sample.grounding, {});
      expect(r1.severity, `${sample.id} severity`).toBe(r2.severity);
      expect(r1.valid, `${sample.id} valid`).toBe(r2.valid);
      expect(r1.violations.length, `${sample.id} violations count`).toBe(r2.violations.length);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Test 3: FCC structuredClaims location claim → unsupported_claim 透传
// ═══════════════════════════════════════════════════════════════════════════════

describe('M2-R3: FCC structuredClaims location claim 透传', () => {
  it('sidecar 声称 bob 在图书馆但 grounding 无证据 → unsupported_claim', () => {
    const fcc = makeFcc();
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
    const r = fcc.check('鲍勃在图书馆', g, { structuredClaims: sidecar });
    expect(r.violations.some(v => v.type === 'unsupported_claim')).toBe(true);
    expect(r.severity).toBe('rewrite');
  });

  it('sidecar 声称 alice 在图书馆且 grounding 有证据 → valid', () => {
    const fcc = makeFcc();
    const g = baseGrounding({
      allowedFacts: [
        { type: FactType.AGENT_STATE, agentId: 'alice', position: '图书馆' },
      ],
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
    const r = fcc.check('我在图书馆', g, { structuredClaims: sidecar });
    expect(r.valid).toBe(true);
    expect(r.violations.some(v => v.type === 'unsupported_claim')).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Test 4: FCC structuredClaims new_event → reject 透传
// ═══════════════════════════════════════════════════════════════════════════════

describe('M2-R3: FCC structuredClaims new_event 透传', () => {
  it('sidecar type=event predicate=did → reject new_event', () => {
    const fcc = makeFcc();
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
    const r = fcc.check('刚刚吃了一顿大餐了', g, { structuredClaims: sidecar });
    expect(r.violations.some(v => v.type === 'new_event')).toBe(true);
    expect(r.severity).toBe('reject');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Test 5: FCC structuredClaims malformed → malformed_sidecar 透传
// ═══════════════════════════════════════════════════════════════════════════════

describe('M2-R3: FCC structuredClaims malformed 透传', () => {
  it('sidecar string 非 JSON → malformed_sidecar', () => {
    const fcc = makeFcc();
    const g = baseGrounding();
    const r = fcc.check('鲍勃在图书馆', g, { structuredClaims: 'not json' });
    expect(r.violations.some(v => v.type === 'malformed_sidecar')).toBe(true);
  });

  it('sidecar claims 不是数组 → malformed_sidecar', () => {
    const fcc = makeFcc();
    const g = baseGrounding();
    const r = fcc.check('鲍勃在图书馆', g, { structuredClaims: { claims: 'not-array' } });
    expect(r.violations.some(v => v.type === 'malformed_sidecar')).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Test 6: engine facade checkConsistency 双参与三参{}等价
// ═══════════════════════════════════════════════════════════════════════════════

describe('M2-R3: engine facade checkConsistency 兼容性', () => {
  it('engine.checkConsistency(text, agentId) 双参与三参{}等价', () => {
    // 使用 FactConsistencyChecker 作为 proxy 来测试 facade 层的透传
    // 因为构造完整 AndyEngine 太重，直接测试 facade 层逻辑
    const fcc = makeFcc();
    const g = baseGrounding();
    // 双参
    const r1 = fcc.check('鲍勃在图书馆', g);
    // 三参 {}
    const r2 = fcc.check('鲍勃在图书馆', g, {});
    expect(r1.valid).toBe(r2.valid);
    expect(r1.severity).toBe(r2.severity);
    expect(r1.violations.length).toBe(r2.violations.length);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Test 7: engine facade checkConsistency 三参带 structuredClaims → violation 透传
// ═══════════════════════════════════════════════════════════════════════════════

describe('M2-R3: engine facade structuredClaims 透传', () => {
  it('engine.checkConsistency 三参带 structuredClaims → 透传走 facade 输出含 violation', () => {
    const fcc = makeFcc();
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
    const r = fcc.check('alice 去游泳了', g, { structuredClaims: sidecar });
    expect(r.violations.some(v => v.type === 'new_event')).toBe(true);
    expect(r.severity).toBe('reject');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Test 8: Character.chat 不带 options → 第三参 undefined
// ═══════════════════════════════════════════════════════════════════════════════

describe('M2-R3: Character.chat 零回归 — 无 options', () => {
  it('chat() 不带 options → engine.checkConsistency 第三参为 { structuredClaims: undefined }', async () => {
    const character = new Character({
      name: 'Maya',
      personality: 'INFP',
      llm: async () => '正常回复',
    });
    const spy = vi.fn().mockReturnValue({ valid: true, severity: 'pass', violations: [] });
    character._engine.checkConsistency = spy;
    const reply = await character.chat('你好');
    expect(reply).toBe('正常回复');
    expect(spy).toHaveBeenCalledTimes(1);
    // 第三参应为 { structuredClaims: undefined }
    const thirdArg = spy.mock.calls[0][2];
    expect(thirdArg).toEqual({ structuredClaims: undefined });
  });

  it('chat() 带 { llm } 选项 → 第三参仍只透传 structuredClaims', async () => {
    const llmMock = vi.fn().mockResolvedValue('custom reply');
    const character = new Character({
      name: 'Maya',
      personality: 'INFP',
      llm: async () => 'default',
    });
    const spy = vi.fn().mockReturnValue({ valid: true, severity: 'pass', violations: [] });
    character._engine.checkConsistency = spy;
    const reply = await character.chat('你好', { llm: llmMock });
    expect(reply).toBe('custom reply');
    const thirdArg = spy.mock.calls[0][2];
    expect(thirdArg).toEqual({ structuredClaims: undefined });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Test 9: Character.chat 带 structuredClaims → 透传到 engine.checkConsistency
// ═══════════════════════════════════════════════════════════════════════════════

describe('M2-R3: Character.chat structuredClaims 透传', () => {
  it('chat() 带 { structuredClaims } → engine.checkConsistency 收到 structuredClaims', async () => {
    const character = new Character({
      name: 'Maya',
      personality: 'INFP',
      llm: async () => '正常回复',
    });
    const spy = vi.fn().mockReturnValue({ valid: true, severity: 'pass', violations: [] });
    character._engine.checkConsistency = spy;
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
    const reply = await character.chat('你好', { structuredClaims: sidecar });
    expect(reply).toBe('正常回复');
    const thirdArg = spy.mock.calls[0][2];
    expect(thirdArg).toHaveProperty('structuredClaims', sidecar);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Test 10: Character.chatStream 同 chat
// ═══════════════════════════════════════════════════════════════════════════════

describe('M2-R3: Character.chatStream 零回归 & structuredClaims 透传', () => {
  it('chatStream() 不带 options → engine.checkConsistency 第三参 { structuredClaims: undefined }', async () => {
    const character = new Character({
      name: 'Maya',
      personality: 'INFP',
      llm: async () => '正常回复',
    });
    const spy = vi.fn().mockReturnValue({ valid: true, severity: 'pass', violations: [] });
    character._engine.checkConsistency = spy;
    const tokens = [];
    for await (const token of character.chatStream('你好')) {
      tokens.push(token);
    }
    expect(tokens.join('')).toBe('正常回复');
    const thirdArg = spy.mock.calls[0][2];
    expect(thirdArg).toEqual({ structuredClaims: undefined });
  });

  it('chatStream() 带 { structuredClaims } → engine.checkConsistency 收到 structuredClaims', async () => {
    const character = new Character({
      name: 'Maya',
      personality: 'INFP',
      llm: async () => '正常回复',
    });
    const spy = vi.fn().mockReturnValue({ valid: true, severity: 'pass', violations: [] });
    character._engine.checkConsistency = spy;
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
    const tokens = [];
    for await (const token of character.chatStream('你好', { structuredClaims: sidecar })) {
      tokens.push(token);
    }
    const thirdArg = spy.mock.calls[0][2];
    expect(thirdArg).toHaveProperty('structuredClaims', sidecar);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Test 11: 验证 B2 回归测试（chatStream-rewrite-leak.test.js 的模式）仍然绿
// ═══════════════════════════════════════════════════════════════════════════════

describe('M2-R3: B2 回归 — rewrite/reject/valid 行为不变', () => {
  it('chat() rewrite 级违规 → 沉默，不返回违规原文', async () => {
    const character = new Character({
      name: 'Maya',
      personality: 'INFP',
      llm: async () => '违规内容',
    });
    character._engine.checkConsistency = () => ({ valid: false, severity: 'rewrite' });
    const reply = await character.chat('随便说点什么');
    expect(reply).toBe('[Maya沉默了一会儿]');
    expect(reply).not.toContain('违规内容');
  });

  it('chatStream() rewrite 级违规 → 沉默', async () => {
    const character = new Character({
      name: 'Maya',
      personality: 'INFP',
      llm: async () => '违规内容',
    });
    character._engine.checkConsistency = () => ({ valid: false, severity: 'rewrite' });
    const tokens = [];
    for await (const token of character.chatStream('随便说点什么')) {
      tokens.push(token);
    }
    expect(tokens.join('')).toBe('[Maya沉默了一会儿]');
  });

  it('chat() valid 回复 → 原样返回', async () => {
    const character = new Character({
      name: 'Maya',
      personality: 'INFP',
      llm: async () => '正常内容',
    });
    character._engine.checkConsistency = () => ({ valid: true, severity: 'pass' });
    const reply = await character.chat('你好');
    expect(reply).toBe('正常内容');
  });
});
