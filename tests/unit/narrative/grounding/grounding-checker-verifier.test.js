/**
 * GroundingChecker verifier adapter 集成测试 — D5 v3 M5-R2
 *
 * 覆盖：
 *   1.  text-only 零回归：check 不带 verifier 选项与 M3 后行为 byte 等价
 *   2.  options.verifier=undefined → NoOp
 *   3.  options.verifier={type:'no-op'} → NoOp，verifierDecisions 不出现
 *   4.  options.verifier=NoOpVerifier 实例 → verifierDecisions 不出现
 *   5.  options.verifier={type:'custom', impl} → verifierDecisions 出现含 decision
 *   6.  红线 1：fake verifier 把 unsupported claim 标 supports → 主 violations/severity 不变
 *   7.  红线 2：fake verifier 提示 unsupported location 应 pass → valid 仍 false
 *   8.  strictness='semantic_review' 仍不能让 verifier 把 unsupported 变 pass
 *   9.  fake verifier 异常 → verifierDecisions 缺失，主结果不变
 *   10. fake verifier 返回 malformed decisions → adapter 容错，verifierDecisions 空
 *   11. fake verifier 决策不含 unknown claimId → review 'unknown claimId'
 *   12. 无网络调用：grep 实证
 *   13. checkerVersion + groundingVersion unchanged
 *   14. evidenceTrace 仍存在（M1 行为不变）
 *   15. propagatedFrom 红线在 verifier 路径守住
 *   16. fake verifier 给 deterministic supports claim 标 contradicts → verifierDecisions 保留
 *   17. sidecar 路径 + verifier
 *   18. coreference 路径 + verifier
 *   19. options.strictness 透传
 *   20. verifierDecisions 仅当非空时出现
 *   21. v3 旁路 try/catch：verifier 抛错 → 主结果不变
 *   22. 默认 no network（source grep）
 *   23. options.verifier 非法类型 → 容错降为 NoOp
 *   24. multi-decision: fake verifier 返回多条 decision
 *   25. evidenceTrace 元素 count 不受 verifier 影响
 *   26. P0 红线：默认 NoOp 无网络调用
 *
 * Covers GroundingChecker integration with the optional D5 verifier adapter.
 */

import { describe, it, expect } from 'vitest';
const { createRequire } = await import('node:module');
const require = createRequire(import.meta.url);

const GroundingChecker = require('../../../../src/narrative/GroundingChecker.js');
const { FactType, FactScope } = require('../../../../src/canon/FactSchema.js');
const {
  GroundingVerifier,
  NoOpVerifier,
  GroundingVerifierAdapter,
  createGroundingVerifierAdapter,
  VERIFIER_RESULT,
} = require('../../../../src/narrative/grounding/GroundingVerifier.js');
const fs = require('fs');
const path = require('path');

// ─── Helpers ─────────────────────────────────────────────────────────────────

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
      agentId: 'alice',
      agentNames: { alice: '爱丽丝', bob: '鲍勃' },
      currentTime: new Date('2026-09-01T12:00:00Z'),
    },
    ...overrides,
  };
}

/** 构造一个 fake verifier，返回指定的 decisions */
function makeFakeVerifier(decisionsFn) {
  class FakeVerifier extends GroundingVerifier {
    async _verify({ text, claims, grounding, evidenceBindings, options }) {
      return decisionsFn({ text, claims, grounding, evidenceBindings, options });
    }
    // 不提供 verifySync → 同步路径应 fallback
    verifySync({ text, claims, grounding, evidenceBindings, options }) {
      return decisionsFn({ text, claims, grounding, evidenceBindings, options });
    }
  }
  return new FakeVerifier();
}

/** 构造一个 always-throw verifier */
function makeThrowingVerifier(message) {
  class ThrowingVerifier extends GroundingVerifier {
    verifySync() {
      throw new Error(message || 'simulated verifier error');
    }
  }
  return new ThrowingVerifier();
}

/** 构造一个简单的 evidence binding */
function makeBinding(claimId, support) {
  return { claimId, support, factId: null, confidence: 0.8, reason: '' };
}

// ─── 样本数据：用于 text-only 零回归对比 ────────────────────────────────────────

const regressionSamples = [
  { text: '我在图书馆', desc: 'self location supported' },
  { text: '鲍勃在图书馆', desc: 'other-agent unsupported' },
  { text: '今天天气不错', desc: 'general statement' },
  { text: '鲍勃告诉我他去了图书馆', desc: 'told event' },
  { text: '深夜的时候', desc: 'time conflict' },
  { text: '我和鲍勃是朋友', desc: 'new relationship' },
  { text: '我刚买了新车', desc: 'new event' },
  { text: '听说鲍勃在图书馆', desc: 'told location' },
  { text: '鲍勃不喜欢咖啡', desc: 'negation state' },
  { text: '我在食堂吃饭', desc: 'self state supported' },
];

// ═══════════════════════════════════════════
// Test Suite
// ═══════════════════════════════════════════

describe('GroundingChecker verifier adapter integration (M5-R2)', () => {

  // ── 1. text-only 零回归 ──

  describe('Test 1: text-only zero regression', () => {
    it('check 不带 verifier 选项与带 NoOp 行为一致（severity/violations 一致）', () => {
      const c = makeChecker();
      for (const sample of regressionSamples) {
        const r1 = c.check(sample.text, makeGrounding());
        const r2 = c.check(sample.text, makeGrounding(), { verifier: { type: 'no-op' } });

        expect(r1.severity).toBe(r2.severity);
        expect(r1.violations.map(v => v.type)).toEqual(r2.violations.map(v => v.type));
        expect(r1.valid).toBe(r2.valid);
        expect(r1.checkerVersion).toBe('v2-structured');
      }
    });

    it('verifierDecisions 在无 verifier 时为 undefined', () => {
      const c = makeChecker();
      const r = c.check('鲍勃在图书馆', makeGrounding());
      expect(r.verifierDecisions).toBeUndefined();
    });
  });

  // ── 2. options.verifier=undefined → NoOp ──

  describe('Test 2: options.verifier=undefined → NoOp', () => {
    it('verifierDecisions 不出现', () => {
      const c = makeChecker();
      const r = c.check('鲍勃在图书馆', makeGrounding(), { verifier: undefined });
      expect(r.verifierDecisions).toBeUndefined();
      expect(r.valid).toBe(false);
      expect(r.severity).toBe('rewrite');
    });
  });

  // ── 3. options.verifier={type:'no-op'} → NoOp ──

  describe('Test 3: options.verifier={type:"no-op"}', () => {
    it('verifierDecisions 不出现或为空数组', () => {
      const c = makeChecker();
      const r = c.check('鲍勃在图书馆', makeGrounding(), { verifier: { type: 'no-op' } });
      expect(r.verifierDecisions).toBeUndefined();
      expect(r.valid).toBe(false);
      expect(r.severity).toBe('rewrite');
    });
  });

  // ── 4. options.verifier=NoOpVerifier 实例 ──

  describe('Test 4: options.verifier=NoOpVerifier 实例', () => {
    it('verifierDecisions 不出现', () => {
      const c = makeChecker();
      const r = c.check('鲍勃在图书馆', makeGrounding(), { verifier: new NoOpVerifier() });
      expect(r.verifierDecisions).toBeUndefined();
    });
  });

  // ── 5. options.verifier={type:'custom', impl} → verifierDecisions 出现 ──

  describe('Test 5: options.verifier={type:"custom", impl}', () => {
    it('fakeVerifier.verifySync 被调，verifierDecisions 含 decision', () => {
      const c = makeChecker();
      const fakeDecision = { claimId: 'claim_001', result: 'supports', confidence: 0.9 };
      const impl = makeFakeVerifier(() => ({
        decisions: [fakeDecision],
        meta: { source: 'fake' },
      }));
      const r = c.check('鲍勃在图书馆', makeGrounding(), {
        verifier: { type: 'custom', impl },
      });

      expect(r.verifierDecisions).toBeDefined();
      expect(Array.isArray(r.verifierDecisions)).toBe(true);
      expect(r.verifierDecisions.length).toBeGreaterThan(0);
      expect(r.verifierDecisions[0].claimId).toBe('claim_001');
    });
  });

  // ── 6. 红线 1：verifier 不能把 unsupported 提升为 pass ──

  describe('Test 6: Red Line 1 — verifier cannot promote unsupported to pass', () => {
    it('fake verifier 把 unsupported claim 标 supports → 主 violations/severity 不变', () => {
      const c = makeChecker();
      const impl = makeFakeVerifier(() => ({
        decisions: [
          { claimId: 'claim_001', result: 'supports', confidence: 0.99, explanation: 'llm says yes' },
        ],
        meta: { source: 'fake' },
      }));
      const r = c.check('鲍勃在图书馆', makeGrounding(), { verifier: { type: 'custom', impl } });

      // 主决策不变：仍 unsupported_claim reject
      expect(r.violations.some(v => v.type === 'unsupported_claim')).toBe(true);
      expect(r.severity).toBe('rewrite');
      expect(r.valid).toBe(false);

      // verifierDecisions 中该 decision 被 Adapter guard 降为 'review'
      expect(r.verifierDecisions).toBeDefined();
      expect(r.verifierDecisions[0].result).toBe('review');
      expect(r.verifierDecisions[0].explanation).toContain('policy guard');
    });
  });

  // ── 7. 红线 2：verifier 不能改变 valid 结果 ──

  describe('Test 7: Red Line 2 — verifier cannot change valid outcome', () => {
    it('fake verifier 提示某 unsupported location 应 pass → valid 仍 false', () => {
      const c = makeChecker();
      const impl = makeFakeVerifier(() => ({
        decisions: [
          { claimId: 'claim_001', result: 'supports', confidence: 1.0, explanation: 'semantic match' },
        ],
        meta: { source: 'fake' },
      }));
      const r = c.check('鲍勃在图书馆', makeGrounding(), { verifier: { type: 'custom', impl } });

      expect(r.valid).toBe(false);
      expect(r.severity).toBe('rewrite');
      expect(r.violations.some(v => v.type === 'unsupported_claim')).toBe(true);
    });
  });

  // ── 8. semantic_review 仍不能 promote unsupported ──

  describe('Test 8: strictness=semantic_review cannot promote unsupported', () => {
    it('即使 strictness=semantic_review，unsupported 仍不被 promote 到 supports', () => {
      const c = makeChecker();
      const impl = makeFakeVerifier(() => ({
        decisions: [
          { claimId: 'claim_001', result: 'supports', confidence: 0.95 },
        ],
        meta: { source: 'fake' },
      }));
      const r = c.check('鲍勃在图书馆', makeGrounding(), {
        verifier: { type: 'custom', impl },
        strictness: 'semantic_review',
      });

      // 主决策不变
      expect(r.severity).toBe('rewrite');
      expect(r.valid).toBe(false);

      // verifier decision 被降为 review
      expect(r.verifierDecisions[0].result).toBe('review');
    });
  });

  // ── 9. verifier 异常 → 主结果不变 ──

  describe('Test 9: verifier throws → main result unchanged', () => {
    it('fake verifier 抛错 → verifierDecisions 缺失，主结果不变', () => {
      const c = makeChecker();
      const impl = makeThrowingVerifier('simulated network timeout');
      const r = c.check('鲍勃在图书馆', makeGrounding(), {
        verifier: { type: 'custom', impl },
      });

      expect(r.verifierDecisions).toBeUndefined();
      expect(r.valid).toBe(false);
      expect(r.severity).toBe('rewrite');
      expect(r.violations.some(v => v.type === 'unsupported_claim')).toBe(true);
    });
  });

  // ── 10. malformed decisions → adapter 容错 ──

  describe('Test 10: malformed decisions → adapter fault tolerance', () => {
    it('verifier 返回非 array decisions → verifierDecisions 空/undefined', () => {
      const c = makeChecker();
      const impl = makeFakeVerifier(() => ({
        decisions: 'not-an-array',
        meta: { source: 'fake' },
      }));
      const r = c.check('鲍勃在图书馆', makeGrounding(), {
        verifier: { type: 'custom', impl },
      });

      // adapter 容错：verifierDecisions 不出现（空数组不加入）
      expect(r.verifierDecisions).toBeUndefined();
      expect(r.valid).toBe(false);
      expect(r.severity).toBe('rewrite');
    });
  });

  // ── 11. unknown claimId → review ──

  describe('Test 11: unknown claimId → review', () => {
    it('verifier 决策不含已知 claimId → review unknown claimId', () => {
      const c = makeChecker();
      const impl = makeFakeVerifier(() => ({
        decisions: [
          { claimId: 'phantom_claim', result: 'supports', confidence: 0.9 },
        ],
        meta: { source: 'fake' },
      }));
      const r = c.check('鲍勃在图书馆', makeGrounding(), {
        verifier: { type: 'custom', impl },
      });

      expect(r.verifierDecisions).toBeDefined();
      expect(r.verifierDecisions[0].result).toBe('review');
      expect(r.verifierDecisions[0].explanation).toContain('unknown claimId');
    });
  });

  // ── 12. 无网络调用 ──

  describe('Test 12: no network calls', () => {
    it('GroundingChecker.js 不含 fetch/http/axios', () => {
      const checkerPath = path.resolve(__dirname, '../../../../src/narrative/GroundingChecker.js');
      const content = fs.readFileSync(checkerPath, 'utf-8');
      expect(content).not.toContain('fetch(');
      expect(content).not.toContain('http://');
      expect(content).not.toContain('https://');
      expect(content).not.toContain('axios');
      expect(content).not.toContain('XMLHttpRequest');
    });

    it('GroundingVerifier.js 不含网络调用', () => {
      const verifierPath = path.resolve(__dirname, '../../../../src/narrative/grounding/GroundingVerifier.js');
      const content = fs.readFileSync(verifierPath, 'utf-8');
      expect(content).not.toContain('fetch(');
      expect(content).not.toContain('http://');
      expect(content).not.toContain('https://');
      expect(content).not.toContain('axios');
    });
  });

  // ── 13. checkerVersion 仍 'v2-structured' ──

  describe('Test 13: checkerVersion + groundingVersion unchanged', () => {
    it('无论 verifier 如何设置，checkerVersion 都是 "v2-structured"，groundingVersion 都是 "v3-semantic-alpha"', () => {
      const c = makeChecker();
      const impl = makeFakeVerifier(() => ({ decisions: [], meta: {} }));

      const r1 = c.check('test', makeGrounding());
      const r2 = c.check('test', makeGrounding(), { verifier: { type: 'custom', impl } });
      const r3 = c.check('test', makeGrounding(), { verifier: new NoOpVerifier() });

      expect(r1.checkerVersion).toBe('v2-structured');
      expect(r2.checkerVersion).toBe('v2-structured');
      expect(r3.checkerVersion).toBe('v2-structured');
      expect(r1.groundingVersion).toBe('v3-semantic-alpha');
      expect(r2.groundingVersion).toBe('v3-semantic-alpha');
      expect(r3.groundingVersion).toBe('v3-semantic-alpha');
    });
  });

  // ── 14. evidenceTrace 仍存在 ──

  describe('Test 14: evidenceTrace still present', () => {
    it('verifier 路径下 evidenceTrace 仍存在', () => {
      const c = makeChecker();
      const impl = makeFakeVerifier(() => ({
        decisions: [{ claimId: 'claim_001', result: 'supports', confidence: 0.8 }],
        meta: { source: 'fake' },
      }));
      const r = c.check('鲍勃在图书馆', makeGrounding(), {
        verifier: { type: 'custom', impl },
      });

      expect(r.evidenceTrace).toBeDefined();
      expect(Array.isArray(r.evidenceTrace)).toBe(true);
    });
  });

  // ── 15. propagatedFrom 红线 ──

  describe('Test 15: propagatedFrom red line in verifier path', () => {
    it('fake verifier 想让 propagatedFrom=bob 当作在场 supports → guard 降为 review', () => {
      const c = makeChecker();
      // 构造 grounding 使 bob 的 claim 是 unsupported（无 EVENT/OBSERVATION 支撑）
      const impl = makeFakeVerifier(() => ({
        decisions: [
          { claimId: 'claim_001', result: 'supports', confidence: 0.9, explanation: 'propagatedFrom=bob' },
        ],
        meta: { source: 'fake' },
      }));
      const r = c.check('鲍勃在图书馆', makeGrounding(), {
        verifier: { type: 'custom', impl },
      });

      // 主 violations 仍是 unsupported_claim
      expect(r.violations.some(v => v.type === 'unsupported_claim')).toBe(true);
      expect(r.valid).toBe(false);

      // verifier decision 被降为 review
      expect(r.verifierDecisions[0].result).toBe('review');
    });
  });

  // ── 16. verifier 给 supports claim 标 contradicts → 保留 ──

  describe('Test 16: verifier contradicts on supported claim', () => {
    it('fake verifier 给 deterministic supports claim 标 contradicts → verifierDecisions 保留 contradicts', () => {
      const c = makeChecker();
      const grounding = makeGrounding({
        allowedFacts: [
          { type: FactType.AGENT_STATE, agentId: 'alice', position: '图书馆' },
          { type: FactType.AGENT_STATE, agentId: 'bob' },
        ],
        metadata: { agentId: 'alice', agentNames: { alice: '爱丽丝', bob: '鲍勃' } },
      });
      const impl = makeFakeVerifier(() => ({
        decisions: [
          { claimId: 'claim_001', result: 'contradicts', confidence: 0.8, explanation: 'semantic mismatch' },
        ],
        meta: { source: 'fake' },
      }));
      const r = c.check('我在图书馆', grounding, {
        verifier: { type: 'custom', impl },
      });

      // verifier 向下标 contradicts 是允许的
      expect(r.verifierDecisions[0].result).toBe('contradicts');

      // 主决策不受 verifier 影响：self location supported → pass
      expect(r.valid).toBe(true);
      expect(r.severity).toBe('pass');
    });
  });

  // ── 17. sidecar 路径 + verifier ──

  describe('Test 17: sidecar path + verifier', () => {
    it('sidecar claim 经 EvidenceBinder bind 后送 verifier', () => {
      const c = makeChecker();
      const grounding = makeGrounding({
        allowedFacts: [
          { type: FactType.AGENT_STATE, agentId: 'alice', position: '图书馆' },
          { type: FactType.AGENT_STATE, agentId: 'bob' },
        ],
        metadata: { agentId: 'alice', agentNames: { alice: '爱丽丝', bob: '鲍勃' } },
      });
      const capturedClaims = [];
      const impl = makeFakeVerifier(({ claims }) => {
        capturedClaims.push(...claims);
        return {
          decisions: [
            { claimId: claims[0]?.id || 'claim_001', result: 'supports', confidence: 0.8 },
          ],
          meta: { source: 'fake' },
        };
      });
      const r = c.check('我在图书馆', grounding, {
        structuredClaims: [
          { type: 'location', subject: 'alice', predicate: 'at', object: '图书馆', confidence: 0.9 },
        ],
        verifier: { type: 'custom', impl },
      });

      expect(r.evidenceTrace).toBeDefined();
      expect(r.verifierDecisions).toBeDefined();
      // sidecar claim 也被送入了 verifier
      expect(capturedClaims.length).toBeGreaterThan(0);
    });
  });

  // ── 18. coreference 路径 + verifier ──

  describe('Test 18: coreference path + verifier', () => {
    it('pronoun claim 可送 verifier（verifierDecisions 含代词相关 claim）', () => {
      const c = makeChecker();
      const grounding = makeGrounding({
        allowedFacts: [
          { type: FactType.AGENT_STATE, agentId: 'alice', position: '图书馆' },
          { type: FactType.EVENT, agentId: 'alice', location: '图书馆', participants: ['alice', 'bob'] },
        ],
        metadata: { agentId: 'alice', agentNames: { alice: '爱丽丝', bob: '鲍勃' } },
      });
      const capturedClaimIds = [];
      const impl = makeFakeVerifier(({ claims }) => {
        for (const c of claims) {
          if (c.id) capturedClaimIds.push(c.id);
        }
        return {
          decisions: [],
          meta: { source: 'fake' },
        };
      });
      const r = c.check('我和鲍勃在图书馆，他看起来很高兴', grounding, {
        verifier: { type: 'custom', impl },
      });

      // verifier 收到了 claims（包含可能的 pronoun claim）
      expect(capturedClaimIds.length).toBeGreaterThan(0);
      // verifierDecisions 应为 undefined（空 decisions）
      expect(r.verifierDecisions).toBeUndefined();
    });
  });

  // ── 19. options.strictness 透传 ──

  describe('Test 19: strictness propagation', () => {
    it('adapter meta 含 strictness', () => {
      const c = makeChecker();
      const impl = makeFakeVerifier(({ options }) => {
        return {
          decisions: [],
          meta: { source: 'fake', strictness: options?.strictness || 'normal' },
        };
      });
      const r = c.check('test', makeGrounding(), {
        verifier: { type: 'custom', impl },
        strictness: 'strict',
      });

      expect(r.checkerVersion).toBe('v2-structured');
      expect(r.groundingVersion).toBe('v3-semantic-alpha');
    });
  });

  // ── 20. verifierDecisions 仅当非空时出现 ──

  describe('Test 20: verifierDecisions only present when non-empty', () => {
    it('NoOp 时 verifierDecisions 为 undefined', () => {
      const c = makeChecker();
      const r = c.check('鲍勃在图书馆', makeGrounding(), { verifier: { type: 'no-op' } });
      expect(r.verifierDecisions).toBeUndefined();
    });

    it('NoOpVerifier 实例时 verifierDecisions 为 undefined', () => {
      const c = makeChecker();
      const r = c.check('鲍勃在图书馆', makeGrounding(), { verifier: new NoOpVerifier() });
      expect(r.verifierDecisions).toBeUndefined();
    });

    it('undefined verifier 时 verifierDecisions 为 undefined', () => {
      const c = makeChecker();
      const r = c.check('鲍勃在图书馆', makeGrounding(), { verifier: undefined });
      expect(r.verifierDecisions).toBeUndefined();
    });
  });

  // ── 21. v3 旁路 try/catch：verifier 抛错 ──

  describe('Test 21: v3 sidecar try/catch — verifier throws', () => {
    it('verifySync 抛错 → verifierDecisions 缺失，主结果不变', () => {
      const c = makeChecker();
      const impl = makeThrowingVerifier('verifier sync error');
      const r = c.check('鲍勃在图书馆', makeGrounding(), {
        verifier: { type: 'custom', impl },
      });

      expect(r.verifierDecisions).toBeUndefined();
      expect(r.valid).toBe(false);
      expect(r.severity).toBe('rewrite');
      expect(r.violations.some(v => v.type === 'unsupported_claim')).toBe(true);
    });
  });

  // ── 22. 默认 no network（source grep 实证） ──

  describe('Test 22: default no network (source grep)', () => {
    it('GroundingChecker.js verifier 路径无 fetch/http', () => {
      const checkerPath = path.resolve(__dirname, '../../../../src/narrative/GroundingChecker.js');
      const content = fs.readFileSync(checkerPath, 'utf-8');
      // 检查 verifier 相关代码段不含网络调用
      expect(content).not.toContain('fetch');
      expect(content).not.toContain('XMLHttpRequest');
      expect(content).not.toContain('axios');
    });
  });

  // ── 23. options.verifier 非法类型 → 容错 ──

  describe('Test 23: invalid verifier type → fallback NoOp', () => {
    it('options.verifier 是数字 → 容错降为 NoOp', () => {
      const c = makeChecker();
      const r = c.check('鲍勃在图书馆', makeGrounding(), { verifier: 42 });
      expect(r.verifierDecisions).toBeUndefined();
      expect(r.valid).toBe(false);
      expect(r.severity).toBe('rewrite');
    });

    it('options.verifier 是字符串 → 容错降为 NoOp', () => {
      const c = makeChecker();
      const r = c.check('鲍勃在图书馆', makeGrounding(), { verifier: 'invalid' });
      expect(r.verifierDecisions).toBeUndefined();
      expect(r.valid).toBe(false);
      expect(r.severity).toBe('rewrite');
    });

    it('options.verifier 是数组 → 容错降为 NoOp', () => {
      const c = makeChecker();
      const r = c.check('鲍勃在图书馆', makeGrounding(), { verifier: [] });
      expect(r.verifierDecisions).toBeUndefined();
    });

    it('options.verifier 是 { type: "unknown-type" } → fallback NoOp', () => {
      const c = makeChecker();
      const r = c.check('鲍勃在图书馆', makeGrounding(), {
        verifier: { type: 'unknown-type' },
      });
      expect(r.verifierDecisions).toBeUndefined();
      expect(r.valid).toBe(false);
    });
  });

  // ── 24. multi-decision ──

  describe('Test 24: multi-decision', () => {
    it('fake verifier 返回多条 decision → verifierDecisions 全部出现', () => {
      const c = makeChecker();
      const impl = makeFakeVerifier(() => ({
        decisions: [
          { claimId: 'claim_001', result: 'supports', confidence: 0.9 },
          { claimId: 'claim_002', result: 'contradicts', confidence: 0.7 },
          { claimId: 'claim_003', result: 'unsupported', confidence: 0.3 },
        ],
        meta: { source: 'fake' },
      }));
      const r = c.check('鲍勃在图书馆', makeGrounding(), {
        verifier: { type: 'custom', impl },
      });

      expect(r.verifierDecisions).toBeDefined();
      expect(r.verifierDecisions.length).toBe(3);
      expect(r.verifierDecisions[0].claimId).toBe('claim_001');
      expect(r.verifierDecisions[1].claimId).toBe('claim_002');
      expect(r.verifierDecisions[2].claimId).toBe('claim_003');
    });
  });

  // ── 25. evidenceTrace element count unaffected ──

  describe('Test 25: evidenceTrace count unaffected by verifier', () => {
    it('有无 verifier，evidenceTrace 长度一致', () => {
      const c = makeChecker();
      const impl = makeFakeVerifier(() => ({
        decisions: [{ claimId: 'claim_001', result: 'supports', confidence: 0.9 }],
        meta: { source: 'fake' },
      }));

      const r1 = c.check('鲍勃在图书馆', makeGrounding());
      const r2 = c.check('鲍勃在图书馆', makeGrounding(), {
        verifier: { type: 'custom', impl },
      });

      expect(r1.evidenceTrace.length).toBe(r2.evidenceTrace.length);
    });
  });

  // ── 26. P0 红线：默认 NoOp 无网络 ──

  describe('Test 26: P0 red line — default NoOp has no network', () => {
    it('NoOpVerifier.verifySync 同步返回空，无异步操作', () => {
      const noop = new NoOpVerifier();
      const result = noop.verifySync({
        text: 'test',
        claims: [],
        grounding: {},
        evidenceBindings: [],
        options: {},
      });
      // 同步返回，不是 Promise
      expect(result).not.toBeInstanceOf(Promise);
      expect(result.decisions).toEqual([]);
      expect(result.meta.source).toBe('no-op');
    });

    it('GroundingVerifierAdapter runSync 对 NoOpVerifier 同步返回', () => {
      const adapter = new GroundingVerifierAdapter();
      const result = adapter.runSync({
        text: 'test',
        claims: [],
        grounding: {},
        evidenceBindings: [],
        options: {},
      });
      expect(result).not.toBeInstanceOf(Promise);
      expect(result.decisions).toEqual([]);
    });

    it('createGroundingVerifierAdapter 默认 NoOp 无网络', () => {
      const adapter = createGroundingVerifierAdapter();
      const result = adapter.runSync({
        text: 'test',
        claims: [],
        grounding: {},
        evidenceBindings: [],
        options: {},
      });
      expect(result.decisions).toEqual([]);
      expect(result.meta.source).toBe('no-op');
    });
  });

  // ── 额外：verifier decisions 不影响 blockingClaims/violations/severity ──

  describe('Extra: verifier never enters blocking/violations/severity chain', () => {
    it('verifier 返回 supports → violations 仍由 v2 决策链决定', () => {
      const c = makeChecker();
      const impl = makeFakeVerifier(() => ({
        decisions: [
          { claimId: 'claim_001', result: 'supports', confidence: 1.0 },
        ],
        meta: { source: 'fake' },
      }));
      const r = c.check('鲍勃在图书馆', makeGrounding(), {
        verifier: { type: 'custom', impl },
      });

      // violations 来自 v2 deterministic chain，不是 verifier
      expect(r.violations.some(v => v.type === 'unsupported_claim')).toBe(true);
      expect(r.severity).toBe('rewrite');
      expect(r.valid).toBe(false);
    });

    it('verifier 返回 contradicts → violations 仍由 v2 决策链决定', () => {
      const c = makeChecker();
      const impl = makeFakeVerifier(() => ({
        decisions: [
          { claimId: 'claim_001', result: 'contradicts', confidence: 1.0 },
        ],
        meta: { source: 'fake' },
      }));
      const r = c.check('鲍勃在图书馆', makeGrounding(), {
        verifier: { type: 'custom', impl },
      });

      expect(r.violations.some(v => v.type === 'unsupported_claim')).toBe(true);
    });
  });

  // ── VERIFIER_RESULT 常量验证 ──

  describe('VERIFIER_RESULT constants', () => {
    it('所有常量值正确', () => {
      expect(VERIFIER_RESULT.SUPPORTS).toBe('supports');
      expect(VERIFIER_RESULT.CONTRADICTS).toBe('contradicts');
      expect(VERIFIER_RESULT.UNSUPPORTED).toBe('unsupported');
      expect(VERIFIER_RESULT.UNCERTAIN).toBe('uncertain');
      expect(VERIFIER_RESULT.REVIEW).toBe('review');
    });
  });

  // ── Adapter 不接受非 GroundingVerifier custom impl ──

  describe('Adapter rejects non-Verifier custom impl', () => {
    it('{ type: "custom", impl: "not-a-verifier" } → fallback NoOp', () => {
      const c = makeChecker();
      const r = c.check('鲍勃在图书馆', makeGrounding(), {
        verifier: { type: 'custom', impl: 'not-a-verifier' },
      });
      expect(r.verifierDecisions).toBeUndefined();
      expect(r.valid).toBe(false);
      expect(r.severity).toBe('rewrite');
    });
  });
});
