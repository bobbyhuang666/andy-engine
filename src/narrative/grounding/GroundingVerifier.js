/**
 * GroundingVerifier — v3 Optional Semantic Verifier Adapter
 *
 * 职责：
 *   - 定义 verifier adapter 接口（abstract base）。
 *   - 提供默认 NoOpVerifier（rule-only no-op，disabled by default）。
 *   - GroundingVerifierAdapter：包装 verifier 调用，做 policy guard，
 *     保证 verifier 不能把 deterministic unsupported/contradicts claim
 *     提升为 'supports'（P1 Risk Register 红线）。
 *   - 工厂函数 createGroundingVerifierAdapter 方便构造。
 *
 * Part of the D5 Semantic Beta grounding design. The verifier is optional and
 * disabled by default.
 *
 * 设计原则：
 *   - 不引入新 npm 依赖。
 *   - CommonJS require，JSDoc 注释，与 EvidenceBinder.js 同风格。
 *   - 绝不写入事实存储或知识存储。
 *   - 默认 NoOpVerifier 无网络调用（P0 红线）。
 *   - Verifier 不能把 deterministic unsupported/contradicts 提升为 supports（P1 红线）。
 */

'use strict';

// ─── Result constants ────────────────────────────────────────────────────────

const VERIFIER_RESULT = Object.freeze({
  SUPPORTS: 'supports',
  CONTRADICTS: 'contradicts',
  UNSUPPORTED: 'unsupported',
  UNCERTAIN: 'uncertain',
  REVIEW: 'review',
});

/**
 * 按"保守程度"排序（越保守数字越小，越激进越大）。
 * 用于 policy guard 比较：verifier 只能向下（更保守），不能向上（更激进）。
 * @private
 */
const RESULT_ORDER = Object.freeze({
  'contradicts': 0,
  'unsupported': 1,
  'uncertain': 2,
  'review': 3,
  'supports': 4,
});

// ─── GroundingVerifier (abstract base) ───────────────────────────────────────

/**
 * GroundingVerifier — 抽象基类，定义 verifier adapter 接口。
 *
 * 所有具体实现必须继承此类并覆写 `_verify` 方法。
 *
 * @abstract
 */
class GroundingVerifier {
  /**
   * 同步路径入口：用于 GroundingChecker.check（同步函数）的旁路证据追踪。
   *
   * 默认实现：如果 verifier 有 verifySync 则调用，否则 fallback 到空 decisions。
   * 子类应覆写 verifySync 以提供真正的同步实现。
   *
   * @param {Object} params
   * @returns {{decisions: Array<VerifierDecision>, meta?: Object}}
   */
  verifySync({ text, claims, grounding, evidenceBindings, options = {} }) {
    // 默认：如果子类覆写了 verifySync，走同步路径；否则抛 NotSupported
    if (this._verifySyncInternal) {
      return this._verifySyncInternal({ text, claims, grounding, evidenceBindings, options });
    }
    throw new Error(
      'GroundingVerifier.verifySync() is not implemented. ' +
      'Subclasses must implement verifySync() for sync-path usage.'
    );
  }

  /**
   * 主入口：验证文本/claims 与 grounding evidence 的一致性。
   *
   * @param {Object} params
   * @param {string} params.text - 原始 LLM 输出文本
   * @param {Array<Object>} params.claims - v3 claim 数组
   * @param {Object} params.grounding - grounding 上下文（含 allowedFacts 等）
   * @param {Array<Object>} params.evidenceBindings - EvidenceBinder 产出的 bindings
   * @param {Object} [params.options] - 可选配置
   * @param {string} [params.options.strictness] - 'normal' | 'strict' | 'semantic_review'（默认 'normal'）
   * @returns {Promise<{decisions: Array<VerifierDecision>, meta?: Object}>}
   * @throws {NotImplementedError} 如果子类未覆写 _verify
   */
  async verify({ text, claims, grounding, evidenceBindings, options = {} }) {
    const result = await this._verify({ text, claims, grounding, evidenceBindings, options });
    return result;
  }

  /**
   * 抽象方法：由子类覆写实现具体验证逻辑。
   *
   * @protected
   * @abstract
   * @param {Object} params
   * @returns {Promise<{decisions: Array<VerifierDecision>, meta?: Object}>}
   * @throws {NotImplementedError} 始终抛出，强制子类覆写
   */
  async _verify(/* params */) {
    throw new Error(
      'GroundingVerifier._verify() is abstract. Subclasses must implement _verify().'
    );
  }
}

// ─── NoOpVerifier (default) ──────────────────────────────────────────────────

/**
 * NoOpVerifier — 默认 no-op 实现。
 *
 * 职责：
 *   - 永远返回空 decisions，不参与任何 claim 验证。
 *   - 作为默认 verifier，确保 verifier 功能处于 disabled 状态。
 *   - 零网络依赖，零副作用。
 *
 * 这是 P0 红线（禁用默认 verifier，无网络调用）和 P1 红线
 * （不参与就不可能 promote claim）的核心保障。
 *
 * @extends GroundingVerifier
 */
class NoOpVerifier extends GroundingVerifier {
  /**
   * @override
   */
  async _verify({ text, claims, grounding, evidenceBindings, options }) {
    return {
      decisions: [],
      meta: {
        source: 'no-op',
        note: 'verifier disabled — no claims evaluated',
      },
    };
  }

  /**
   * 同步路径：NoOpVerifier 是 sync-capable 的，直接返回空 decisions。
   * @override
   */
  verifySync({ text, claims, grounding, evidenceBindings, options }) {
    return {
      decisions: [],
      meta: {
        source: 'no-op',
        note: 'verifier disabled — no claims evaluated',
      },
    };
  }
}

// ─── GroundingVerifierAdapter ────────────────────────────────────────────────

/**
 * GroundingVerifierAdapter — verifier 适配器。
 *
 * 职责：
 *   - 包装任意 verifierImpl 的 verify() 调用。
 *   - 异常安全：verifier 出错时 fallback 到空 decisions，不破坏主路径。
 *   - Policy guard：防止 verifier 把 deterministic unsupported/contradicts
 *     claim 提升为 'supports'（P1 Risk Register 红线）。
 *   - 永远不允许 verifier 把 deterministic unsupported/contradicts 直接变 'supports'。
 *     最高只能降级到 'review'（即使 strictness === 'semantic_review'）。
 *
 * @see docs/quality/d5-semantic-beta-report.md
 */
class GroundingVerifierAdapter {
  /**
   * @param {GroundingVerifier} [verifierImpl] - verifier 实现实例，默认 NoOpVerifier
   */
  constructor(verifierImpl) {
    this._verifier = verifierImpl || new NoOpVerifier();
  }

  /**
   * 运行 verifier 并应用 policy guard。
   *
   * @param {Object} params
   * @param {string} params.text - 原始 LLM 输出文本
   * @param {Array<Object>} params.claims - v3 claim 数组
   * @param {Object} params.grounding - grounding 上下文
   * @param {Array<Object>} params.evidenceBindings - EvidenceBinder bindings
   * @param {Object} [params.options] - 可选配置
   * @param {string} [params.options.strictness] - 'normal' | 'strict' | 'semantic_review'（默认 'normal'）
   * @returns {Promise<{decisions: Array<VerifierDecision>, meta?: Object}>}
   */
  async run({ text, claims, grounding, evidenceBindings, options = {} }) {
    const strictness = options.strictness || 'normal';

    // 构建 claimId → deterministic support 映射
    const claimSupportMap = this._buildClaimSupportMap(evidenceBindings);

    let verifierResult;
    try {
      verifierResult = await this._verifier.verify({
        text,
        claims,
        grounding,
        evidenceBindings,
        options,
      });
    } catch (err) {
      // P0 红线：verifier 异常绝不破坏主路径
      return {
        decisions: [],
        meta: {
          source: 'fallback',
          error: err.message,
          note: 'verifier threw; degraded to deterministic result',
        },
      };
    }

    // 容错：verifier 返回 null 或非对象
    if (!verifierResult || typeof verifierResult !== 'object' || !Array.isArray(verifierResult.decisions)) {
      return {
        decisions: [],
        meta: {
          source: 'fallback',
          error: 'verifier returned null or malformed result',
          note: 'verifier output malformed; degraded',
        },
      };
    }

    const guardedDecisions = [];
    for (const decision of verifierResult.decisions) {
      guardedDecisions.push(this._guardDecision(decision, claimSupportMap, strictness));
    }

    return {
      decisions: guardedDecisions,
      meta: verifierResult.meta || { source: 'adapter' },
    };
  }

  /**
   * 同步路径：仅当 verifier 是 sync-capable 时使用。
   * NoOpVerifier 是 sync-capable 的（verifySync 同步返回）。
   *
   * 如果 verifier 没有 verifySync，fallback 到空 decisions + meta warn。
   *
   * @param {Object} params - 与 run() 相同参数
   * @returns {{decisions: Array<VerifierDecision>, meta?: Object}}
   */
  runSync({ text, claims, grounding, evidenceBindings, options = {} }) {
    const strictness = options.strictness || 'normal';

    // 构建 claimId → deterministic support 映射
    const claimSupportMap = this._buildClaimSupportMap(evidenceBindings);

    // 尝试同步路径
    try {
      let verifierResult;
      if (typeof this._verifier.verifySync === 'function') {
        verifierResult = this._verifier.verifySync({
          text,
          claims,
          grounding,
          evidenceBindings,
          options,
        });
      } else {
        // verifier 没有 verifySync → fallback NoOp 行为
        return {
          decisions: [],
          meta: { source: 'fallback', note: 'verifier not sync-capable (no verifySync)' },
        };
      }

      // 容错：verifier 返回 null 或非对象
      if (!verifierResult || typeof verifierResult !== 'object' || !Array.isArray(verifierResult.decisions)) {
        return {
          decisions: [],
          meta: {
            source: 'fallback',
            error: 'verifier returned null or malformed result',
            note: 'verifier output malformed; degraded',
          },
        };
      }

      // 应用 policy guard
      const guardedDecisions = [];
      for (const decision of verifierResult.decisions) {
        guardedDecisions.push(this._guardDecision(decision, claimSupportMap, strictness));
      }

      return {
        decisions: guardedDecisions,
        meta: verifierResult.meta || { source: 'adapter-sync' },
      };
    } catch (err) {
      // verifier 异常 → fallback 不破坏主路径
      return {
        decisions: [],
        meta: {
          source: 'fallback',
          error: err.message,
          note: 'verifier sync threw; degraded to deterministic result',
        },
      };
    }
  }

  /**
   * 构建 claimId → deterministic support 映射。
   * @private
   */
  _buildClaimSupportMap(evidenceBindings) {
    const map = new Map();
    if (!Array.isArray(evidenceBindings)) return map;

    for (const binding of evidenceBindings) {
      if (!binding || !binding.claimId) continue;
      const claimId = binding.claimId;
      const support = binding.support;

      // 保留最保守的结果（contradicts > unsupported > supports）
      if (!map.has(claimId)) {
        map.set(claimId, support);
      } else {
        const existing = map.get(claimId);
        // 如果已有更保守的结果，保持不变
        if (existing === 'contradicts') continue;
        if (existing === 'supports' && (support === 'unsupported' || support === 'contradicts')) {
          map.set(claimId, support);
        }
      }
    }

    return map;
  }

  /**
   * Policy guard：根据 deterministic evidence 调整 verifier decision。
   *
   * P1 红线规则：
   *   - 如果 claim 的 deterministic support 是 'unsupported' 或 'contradicts'，
   *     verifier 的 'supports' 结果降级为 'review'（不能 promote pass）。
   *   - 如果 deterministic support 是 'supports'，verifier 可以标 'contradicts'
   *     （向下允许，不破坏）。
   *   - 如果 claimId 不在 evidenceBindings 中 → 标 'review'（unknown claim）。
   *   - 永远不允许 verifier 把 unsupported/contradicts 直接变 supports。
   *
   * @private
   */
  _guardDecision(decision, claimSupportMap, strictness) {
    const result = { ...decision };

    // 处理缺少 claimId 的情况
    if (!result.claimId) {
      result.result = VERIFIER_RESULT.REVIEW;
      result.explanation = (result.explanation || '') + '; unknown claimId (missing)';
      return result;
    }

    const deterministicSupport = claimSupportMap.get(result.claimId);

    // 情况 1：verifier 自造的 claimId（不在 evidenceBindings 中）
    if (deterministicSupport === undefined) {
      result.result = VERIFIER_RESULT.REVIEW;
      result.explanation =
        (result.explanation || '') + '; unknown claimId — not in evidence bindings';
      return result;
    }

    // 情况 2：deterministic 是 'unsupported' 或 'contradicts'
    // verifier 不能往上 promote → 最高只能到 'review'
    if (deterministicSupport === 'unsupported' || deterministicSupport === 'contradicts') {
      if (
        result.result === VERIFIER_RESULT.SUPPORTS ||
        result.result === VERIFIER_RESULT.UNCERTAIN
      ) {
        // P1 红线：降级到 review，不能直接变 supports
        result.result = VERIFIER_RESULT.REVIEW;
        result.explanation =
          (result.explanation || '') +
          '; policy guard: deterministic evidence absent, cannot promote to supports';
      }
      // 如果 verifier 已经标了 contradicts/unsupported/review → 保留（向下允许）
      return result;
    }

    // 情况 3：deterministic 是 'supports' → verifier 可以标任何结果（向下允许）
    // 保留 verifier 的判断
    return result;
  }
}

// ─── Factory ─────────────────────────────────────────────────────────────────

/**
 * 工厂函数：创建 GroundingVerifierAdapter。
 *
 * 支持的形式：
 *   - verifierImpl 实例（直接使用）
 *   - { type: 'no-op' } → 使用 NoOpVerifier
 *   - { type: 'custom', impl } → 使用自定义 impl
 *   - { type: 'rule', impl } → 使用自定义 rule impl
 *   - { type: 'rule', impl, strictness } → 同上 + strictness
 *   - null/undefined → 默认 NoOpVerifier
 *   - 未知 type → fallback NoOpVerifier（meta 标 invalid-type）
 *   - 非对象/非实例 → fallback NoOpVerifier
 *
 * @param {GroundingVerifier|Object} [verifierImplOrConfig]
 * @returns {GroundingVerifierAdapter}
 */
function createGroundingVerifierAdapter(verifierImplOrConfig) {
  // 直接传 verifier 实例
  if (verifierImplOrConfig instanceof GroundingVerifier) {
    return new GroundingVerifierAdapter(verifierImplOrConfig);
  }

  // config 对象
  if (verifierImplOrConfig && typeof verifierImplOrConfig === 'object') {
    const { type, impl } = verifierImplOrConfig;

    if (type === 'no-op') {
      return new GroundingVerifierAdapter(new NoOpVerifier());
    }

    if (type === 'custom' || type === 'rule') {
      if (impl instanceof GroundingVerifier) {
        return new GroundingVerifierAdapter(impl);
      }
      // 非 GroundingVerifier 实例 → fallback NoOp
      return new GroundingVerifierAdapter(new NoOpVerifier());
    }

    // 未知 type → fallback NoOp
    return new GroundingVerifierAdapter(new NoOpVerifier());
  }

  // null/undefined/其他 → 默认 NoOp
  return new GroundingVerifierAdapter(new NoOpVerifier());
}

// ─── Exports ─────────────────────────────────────────────────────────────────

module.exports = {
  GroundingVerifier,
  NoOpVerifier,
  GroundingVerifierAdapter,
  createGroundingVerifierAdapter,
  VERIFIER_RESULT,
};
