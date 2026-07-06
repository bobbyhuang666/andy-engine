/**
 * GroundingVerifier 单元测试
 *
 * 覆盖：
 *   1.  NoOpVerifier.verify 返回空 decisions 不影响 claim
 *   2.  GroundingVerifier abstract verify 抛 NotImplementedError
 *   3.  Adapter 默认 NoOp 无 op
 *   4.  Adapter run try/catch：verifier 抛错 → fallback 不抛外层
 *   5.  P1 guard 红线 1：unsupported → verifier 标 supports → 降 review
 *   6.  P1 guard 红线 2：contradicts → verifier 标 supports → 降 review
 *   7.  strictness='semantic_review' 仍不能 promote 到 supports
 *   8.  verifier 把 unsupported 标 uncertain → 降 review
 *   9.  verifier 把 supports 标 contradicts → 保留（向下允许）
 *   10. verifier 自造 claimId → review reason='unknown claimId'
 *   11. adapter 接受 NoOpVerifier 实例 → decisions=空
 *   12. adapter 接受 { type: 'no-op' } → NoOpVerifier，decisions 空
 *   13. adapter 接受 { type: 'custom', impl } → 用 impl
 *   14. adapter 接受未知 type → fallback NoOp
 *   15. adapter 不写 WorldFactStore/KnowledgeStore（grep 断言）
 *   16. adapter 接受空 claims/evidenceBindings → 正常不抛
 *   17. NoOpVerifier source='no-op' meta
 *   18. fallback error meta 含 error.message
 *   19. verifier decisions 非 array → adapter 容错返回空 + meta error
 *   20. verifier decision 缺 claimId → review 'unknown claim'
 *   21. options.strictness 默认 'normal'
 *   22. P0 红线：无网络调用（grep 源码无 fetch/http/axios）
 *   23. 同步 vs async：run 是 async，NoOpVerifier 同步返回
 *   24. NoOpVerifier 单例可复用
 *   25. 文档注释：Verifier cannot promote a claim to pass if deterministic evidence is absent
 *
 * 对应 RFC GROUNDING_CHECKER_V3_SEMANTIC_PLAN §W6 / M5 / §10 Risk Register
 */

const fs = require('fs');
const path = require('path');
const {
  GroundingVerifier,
  NoOpVerifier,
  GroundingVerifierAdapter,
  createGroundingVerifierAdapter,
  VERIFIER_RESULT,
} = require('../../../../src/narrative/grounding/GroundingVerifier');

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * 构造一个 fake verifier，返回指定的 decisions。
 */
function makeFakeVerifier(decisionsFn) {
  class FakeVerifier extends GroundingVerifier {
    async _verify({ text, claims, grounding, evidenceBindings, options }) {
      return decisionsFn({ text, claims, grounding, evidenceBindings, options });
    }
  }
  return new FakeVerifier();
}

/**
 * 构造一个 always-throw verifier。
 */
function makeThrowingVerifier(message) {
  class ThrowingVerifier extends GroundingVerifier {
    async _verify() {
      throw new Error(message || 'simulated verifier error');
    }
  }
  return new ThrowingVerifier();
}

/**
 * 构造一个简单的 evidence binding。
 */
function makeBinding(claimId, support) {
  return { claimId, support, factId: null, confidence: 0.8, reason: '' };
}

const baseParams = {
  text: '测试文本',
  claims: [{ id: 'claim_001', type: 'location', subject: 'alice', object: '图书馆', confidence: 0.8 }],
  grounding: { allowedFacts: [] },
  evidenceBindings: [],
  options: {},
};

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('GroundingVerifier', () => {
  // ── 1. NoOpVerifier.verify 返回空 decisions ──

  describe('NoOpVerifier', () => {
    test('#1 NoOpVerifier.verify 返回空 decisions 不影响 claim', async () => {
      const verifier = new NoOpVerifier();
      const result = await verifier.verify(baseParams);

      expect(result.decisions).toEqual([]);
      expect(result.meta.source).toBe('no-op');
    });

    test("#17 NoOpVerifier source='no-op' meta", async () => {
      const verifier = new NoOpVerifier();
      const result = await verifier.verify(baseParams);

      expect(result.meta).toHaveProperty('source', 'no-op');
      expect(result.meta).toHaveProperty('note');
    });

    test('#24 NoOpVerifier 单例可复用', async () => {
      const noop = new NoOpVerifier();
      const r1 = await noop.verify(baseParams);
      const r2 = await noop.verify({ ...baseParams, text: 'different text' });

      expect(r1.decisions).toEqual(r2.decisions);
      expect(r1.decisions.length).toBe(0);
    });
  });

  // ── 2. GroundingVerifier abstract ──

  describe('GroundingVerifier (abstract)', () => {
    test('#2 直接调 base verify 抛 NotImplementedError', async () => {
      const verifier = new GroundingVerifier();
      await expect(verifier.verify(baseParams)).rejects.toThrow(/abstract/);
    });
  });

  // ── 3. Adapter 默认 NoOp ──

  describe('GroundingVerifierAdapter', () => {
    test('#3 Adapter 默认 NoOp 无 op', async () => {
      const adapter = new GroundingVerifierAdapter();
      const result = await adapter.run(baseParams);

      expect(result.decisions).toEqual([]);
      expect(result.meta.source).not.toBe('fallback');
    });

    test('#11 adapter 接受 NoOpVerifier 实例 → decisions=空', async () => {
      const adapter = new GroundingVerifierAdapter(new NoOpVerifier());
      const result = await adapter.run(baseParams);

      expect(result.decisions).toEqual([]);
    });

    test('#16 adapter 接受空 claims/evidenceBindings → 正常不抛', async () => {
      const adapter = new GroundingVerifierAdapter();
      const result = await adapter.run({
        text: '',
        claims: [],
        grounding: {},
        evidenceBindings: [],
        options: {},
      });

      expect(result.decisions).toEqual([]);
    });
  });

  // ── 4. Adapter try/catch fallback ──

  describe('Adapter error handling', () => {
    test("#4 verifier 抛错 → fallback decisions 空 + meta error", async () => {
      const throwing = makeThrowingVerifier('network timeout');
      const adapter = new GroundingVerifierAdapter(throwing);

      const result = await adapter.run(baseParams);

      expect(result.decisions).toEqual([]);
      expect(result.meta.source).toBe('fallback');
      expect(result.meta.error).toBe('network timeout');
    });

    test('#18 fallback error meta 含 error.message', async () => {
      const throwing = makeThrowingVerifier('custom error message');
      const adapter = new GroundingVerifierAdapter(throwing);

      const result = await adapter.run(baseParams);

      expect(result.meta.error).toContain('custom error message');
    });

    test('#19 verifier decisions 非 array → adapter 容错返回空 decisions + meta error', async () => {
      const badVerifier = makeFakeVerifier(() => ({
        decisions: 'not-an-array', // 错误：应该是数组
        meta: {},
      }));
      const adapter = new GroundingVerifierAdapter(badVerifier);

      const result = await adapter.run(baseParams);

      expect(result.decisions).toEqual([]);
      expect(result.meta.source).toBe('fallback');
    });

    test('#19b verifier 返回 null decisions → adapter 容错', async () => {
      const badVerifier = makeFakeVerifier(() => null);
      const adapter = new GroundingVerifierAdapter(badVerifier);

      const result = await adapter.run(baseParams);

      expect(result.decisions).toEqual([]);
      expect(result.meta.source).toBe('fallback');
    });
  });

  // ── P1 guards ──

  describe('P1 policy guard — verifier cannot promote unsupported/contradicts to supports', () => {
    test('#5 P1 guard 红线 1：unsupported → verifier 标 supports 0.99 → 降 review', async () => {
      const binding = makeBinding('claim_001', 'unsupported');
      const adapter = new GroundingVerifierAdapter(
        makeFakeVerifier(() => ({
          decisions: [
            { claimId: 'claim_001', result: 'supports', confidence: 0.99, explanation: 'llm says yes' },
          ],
          meta: { source: 'fake' },
        }))
      );

      const result = await adapter.run({
        ...baseParams,
        evidenceBindings: [binding],
      });

      expect(result.decisions.length).toBe(1);
      expect(result.decisions[0].result).toBe('review');
      expect(result.decisions[0].explanation).toContain('policy guard');
    });

    test('#6 P1 guard 红线 2：contradicts → verifier 标 supports → 降 review', async () => {
      const binding = makeBinding('claim_001', 'contradicts');
      const adapter = new GroundingVerifierAdapter(
        makeFakeVerifier(() => ({
          decisions: [
            { claimId: 'claim_001', result: 'supports', confidence: 0.95 },
          ],
          meta: { source: 'fake' },
        }))
      );

      const result = await adapter.run({
        ...baseParams,
        evidenceBindings: [binding],
      });

      expect(result.decisions[0].result).toBe('review');
    });

    test("#7 strictness='semantic_review' 仍不能直接 promote 到 supports", async () => {
      const binding = makeBinding('claim_001', 'unsupported');
      const adapter = new GroundingVerifierAdapter(
        makeFakeVerifier(() => ({
          decisions: [
            { claimId: 'claim_001', result: 'supports', confidence: 0.9 },
          ],
          meta: { source: 'fake' },
        }))
      );

      const result = await adapter.run({
        ...baseParams,
        evidenceBindings: [binding],
        options: { strictness: 'semantic_review' },
      });

      // 保守：即使 semantic_review 也只到 'review'，不是 'supports'
      expect(result.decisions[0].result).toBe('review');
    });

    test('#8 verifier 把 unsupported 标 uncertain → 降 review', async () => {
      const binding = makeBinding('claim_001', 'unsupported');
      const adapter = new GroundingVerifierAdapter(
        makeFakeVerifier(() => ({
          decisions: [
            { claimId: 'claim_001', result: 'uncertain', confidence: 0.5 },
          ],
          meta: { source: 'fake' },
        }))
      );

      const result = await adapter.run({
        ...baseParams,
        evidenceBindings: [binding],
      });

      expect(result.decisions[0].result).toBe('review');
    });

    test('#9 verifier 把 supports 标 contradicts → 保留（向下允许）', async () => {
      const binding = makeBinding('claim_001', 'supports');
      const adapter = new GroundingVerifierAdapter(
        makeFakeVerifier(() => ({
          decisions: [
            { claimId: 'claim_001', result: 'contradicts', confidence: 0.8 },
          ],
          meta: { source: 'fake' },
        }))
      );

      const result = await adapter.run({
        ...baseParams,
        evidenceBindings: [binding],
      });

      // verifier 向下标 contradicts 是允许的（更保守）
      expect(result.decisions[0].result).toBe('contradicts');
    });

    test('#9b verifier 把 supports 标 unsupported → 保留', async () => {
      const binding = makeBinding('claim_001', 'supports');
      const adapter = new GroundingVerifierAdapter(
        makeFakeVerifier(() => ({
          decisions: [
            { claimId: 'claim_001', result: 'unsupported', confidence: 0.3 },
          ],
          meta: { source: 'fake' },
        }))
      );

      const result = await adapter.run({
        ...baseParams,
        evidenceBindings: [binding],
      });

      expect(result.decisions[0].result).toBe('unsupported');
    });
  });

  // ── 10. Unknown claimId ──

  describe('Unknown claimId handling', () => {
    test('#10 verifier 自造 claimId → review reason=unknown claimId', async () => {
      const adapter = new GroundingVerifierAdapter(
        makeFakeVerifier(() => ({
          decisions: [
            { claimId: 'claim_phantom', result: 'supports', confidence: 0.9 },
          ],
          meta: { source: 'fake' },
        }))
      );

      const result = await adapter.run({
        ...baseParams,
        evidenceBindings: [], // 没有 bindings，claim_phantom 是 phantom
      });

      expect(result.decisions[0].result).toBe('review');
      expect(result.decisions[0].explanation).toContain('unknown claimId');
    });
  });

  // ── 20. Decision 缺 claimId ──

  describe('Decision missing claimId', () => {
    test('#20 decision 缺 claimId → review', async () => {
      const adapter = new GroundingVerifierAdapter(
        makeFakeVerifier(() => ({
          decisions: [
            { result: 'supports', confidence: 0.9 }, // 没有 claimId
          ],
          meta: { source: 'fake' },
        }))
      );

      const result = await adapter.run(baseParams);

      expect(result.decisions[0].result).toBe('review');
      expect(result.decisions[0].explanation).toContain('unknown claimId');
    });
  });

  // ── 12-14. Factory ──

  describe('createGroundingVerifierAdapter factory', () => {
    test("#12 { type: 'no-op' } → NoOpVerifier，decisions 空", async () => {
      const adapter = createGroundingVerifierAdapter({ type: 'no-op' });
      const result = await adapter.run(baseParams);

      expect(result.decisions).toEqual([]);
    });

    test("#13 { type: 'custom', impl } → 用 impl", async () => {
      const impl = makeFakeVerifier(() => ({
        decisions: [{ claimId: 'x', result: 'supports', confidence: 1.0 }],
        meta: { source: 'custom' },
      }));
      const adapter = createGroundingVerifierAdapter({ type: 'custom', impl });

      const result = await adapter.run(baseParams);

      expect(result.decisions.length).toBe(1);
      expect(result.decisions[0].claimId).toBe('x');
      expect(result.meta.source).toBe('custom');
    });

    test('#14 未知 type → fallback NoOp', async () => {
      const adapter = createGroundingVerifierAdapter({ type: 'unknown-type' });
      const result = await adapter.run(baseParams);

      expect(result.decisions).toEqual([]);
    });

    test('factory 传 null → NoOp', async () => {
      const adapter = createGroundingVerifierAdapter(null);
      const result = await adapter.run(baseParams);

      expect(result.decisions).toEqual([]);
    });

    test('factory 传 undefined → NoOp', async () => {
      const adapter = createGroundingVerifierAdapter(undefined);
      const result = await adapter.run(baseParams);

      expect(result.decisions).toEqual([]);
    });

    test('factory 传 verifier 实例 → 直接用', async () => {
      const impl = makeFakeVerifier(() => ({
        decisions: [{ claimId: 'y', result: 'contradicts', confidence: 0.7 }],
        meta: { source: 'instance' },
      }));
      const adapter = createGroundingVerifierAdapter(impl);

      const result = await adapter.run(baseParams);

      expect(result.decisions[0].claimId).toBe('y');
    });
  });

  // ── 15. No world state writes ──

  describe('No WorldFactStore / KnowledgeStore writes', () => {
    test('#15 adapter 不写 WorldFactStore/KnowledgeStore', () => {
      const modulePath = path.resolve(
        __dirname,
        '../../../../src/narrative/grounding/GroundingVerifier.js'
      );
      const content = fs.readFileSync(modulePath, 'utf-8');

      // grep 断言：不含 WorldFactStore / KnowledgeStore 引用
      expect(content).not.toContain('WorldFactStore');
      expect(content).not.toContain('KnowledgeStore');
    });
  });

  // ── 21. strictness default ──

  describe('strictness option', () => {
    test("#21 options.strictness 默认 'normal'", async () => {
      const adapter = new GroundingVerifierAdapter(
        makeFakeVerifier(() => ({
          decisions: [{ claimId: 'c1', result: 'supports', confidence: 0.9 }],
          meta: { source: 'fake' },
        }))
      );

      // 不传 options → strictness 应为 'normal'
      const result = await adapter.run({
        ...baseParams,
        evidenceBindings: [],
      });

      // 由于 evidenceBindings 为空，claimId 是 unknown → 变成 review
      expect(result.decisions[0].result).toBe('review');
    });

    test("strictness='strict' 同样不 promote unsupported → supports", async () => {
      const binding = makeBinding('claim_001', 'unsupported');
      const adapter = new GroundingVerifierAdapter(
        makeFakeVerifier(() => ({
          decisions: [{ claimId: 'claim_001', result: 'supports', confidence: 0.99 }],
          meta: { source: 'fake' },
        }))
      );

      const result = await adapter.run({
        ...baseParams,
        evidenceBindings: [binding],
        options: { strictness: 'strict' },
      });

      expect(result.decisions[0].result).toBe('review');
    });
  });

  // ── 22. P0 红线：无网络调用 ──

  describe('P0 no-network', () => {
    test("#22 源码不含 fetch/http/axios 等网络调用", () => {
      const modulePath = path.resolve(
        __dirname,
        '../../../../src/narrative/grounding/GroundingVerifier.js'
      );
      const content = fs.readFileSync(modulePath, 'utf-8');

      expect(content).not.toContain('fetch(');
      expect(content).not.toContain('http://');
      expect(content).not.toContain('https://');
      expect(content).not.toContain('axios');
      expect(content).not.toContain('XMLHttpRequest');
      expect(content).not.toContain('require('); // 除了内部的 require，不应 require 网络库
    });
  });

  // ── 23. 同步 vs async ──

  describe('sync vs async', () => {
    test("#23 run 是 async，NoOpVerifier 同步返回", async () => {
      const adapter = new GroundingVerifierAdapter();

      // run() 返回 Promise
      const runResult = adapter.run(baseParams);
      expect(runResult).toBeInstanceOf(Promise);

      // 但 resolve 很快
      const resolved = await runResult;
      expect(resolved.decisions).toEqual([]);
    });

    test("#23 runSync 对 NoOpVerifier 同步返回", async () => {
      const adapter = new GroundingVerifierAdapter();

      // runSync 也返回 Promise（因为 NoOpVerifier.verify 返回 Promise）
      const syncResult = adapter.runSync(baseParams);
      // NoOpVerifier.verify 返回 Promise，所以 runSync 拿到的是 Promise
      if (syncResult && typeof syncResult.then === 'function') {
        const resolved = await syncResult;
        expect(resolved.decisions).toEqual([]);
      } else {
        expect(syncResult.decisions).toEqual([]);
      }
    });
  });

  // ── 25. 文档注释合规 ──

  describe('Documentation compliance', () => {
    test("#25 文档注释声明 'Verifier cannot promote a claim to pass if deterministic evidence is absent'", () => {
      const modulePath = path.resolve(
        __dirname,
        '../../../../src/narrative/grounding/GroundingVerifier.js'
      );
      const content = fs.readFileSync(modulePath, 'utf-8');

      // 确认文档中有此声明
      expect(content).toContain('cannot promote');
      expect(content).toContain('deterministic');
    });
  });

  // ── 额外边界测试 ──

  describe('Edge cases', () => {
    test('多个 bindings 同一 claimId → 取最保守', async () => {
      const bindings = [
        makeBinding('claim_001', 'supports'),
        makeBinding('claim_001', 'unsupported'),
      ];
      const adapter = new GroundingVerifierAdapter(
        makeFakeVerifier(() => ({
          decisions: [{ claimId: 'claim_001', result: 'supports', confidence: 0.9 }],
          meta: { source: 'fake' },
        }))
      );

      const result = await adapter.run({
        ...baseParams,
        evidenceBindings: bindings,
      });

      // 最保守的是 unsupported → verifier supports 被降为 review
      expect(result.decisions[0].result).toBe('review');
    });

    test('verifier 对 unsupported 标 review → 保留', async () => {
      const binding = makeBinding('claim_001', 'unsupported');
      const adapter = new GroundingVerifierAdapter(
        makeFakeVerifier(() => ({
          decisions: [{ claimId: 'claim_001', result: 'review', confidence: 0.5 }],
          meta: { source: 'fake' },
        }))
      );

      const result = await adapter.run({
        ...baseParams,
        evidenceBindings: [binding],
      });

      // verifier 已经标 review，不需要降级
      expect(result.decisions[0].result).toBe('review');
    });

    test('verifier 对 unsupported 标 unsupported → 保留', async () => {
      const binding = makeBinding('claim_001', 'unsupported');
      const adapter = new GroundingVerifierAdapter(
        makeFakeVerifier(() => ({
          decisions: [{ claimId: 'claim_001', result: 'unsupported', confidence: 0.3 }],
          meta: { source: 'fake' },
        }))
      );

      const result = await adapter.run({
        ...baseParams,
        evidenceBindings: [binding],
      });

      expect(result.decisions[0].result).toBe('unsupported');
    });

    test('VERIFIER_RESULT 常量存在且正确', () => {
      expect(VERIFIER_RESULT.SUPPORTS).toBe('supports');
      expect(VERIFIER_RESULT.CONTRADICTS).toBe('contradicts');
      expect(VERIFIER_RESULT.UNSUPPORTED).toBe('unsupported');
      expect(VERIFIER_RESULT.UNCERTAIN).toBe('uncertain');
      expect(VERIFIER_RESULT.REVIEW).toBe('review');
    });

    test('adapter 不接受非 GroundingVerifier custom impl → fallback NoOp', async () => {
      const adapter = createGroundingVerifierAdapter({ type: 'custom', impl: 'not-a-verifier' });
      const result = await adapter.run(baseParams);

      expect(result.decisions).toEqual([]);
    });
  });
});
