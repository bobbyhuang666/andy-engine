/**
 * Narrative Violation Corpus 检出率测试 (ALIVENESS_BENCHMARK_RFC v0.3 §D5, B3 修正)
 *
 * 遍历 corpus，对每条跑 FactConsistencyChecker，断言检出 expectedViolations 类别。
 * 统计整体检出率，B3 裁定：检出率 <80% → fail（暴露漏报）；≥80% → pass。
 * 误报率作为辅助记录输出，不触发 fail（待 corpus 扩到 ≥30 后纳入）。
 *
 * 不调 checker 掩盖漏报（任务卡 §6）。若某样本 checker 客观检不出，
 * 应调整样本对齐 checker 实际能力，而非改 checker。
 */

import { describe, it, expect } from 'vitest';
const { createRequire } = await import('node:module');
const require = createRequire(import.meta.url);
const FactConsistencyChecker = require('../../src/narrative/FactConsistencyChecker.js');
const { corpus, KNOWN_REGIONS } = require('../fixtures/narrative-violations/index.js');

const DETECTION_THRESHOLD = 0.80; // B3 裁定

describe('Narrative Violation Corpus — 检出率基线 (W8)', () => {
  const checker = new FactConsistencyChecker({}, { regions: KNOWN_REGIONS });

  it('corpus 至少 10 条', () => {
    expect(corpus.length).toBeGreaterThanOrEqual(10);
  });

  // 每条样本单独断言（便于失败时定位）
  for (const sample of corpus) {
    it(`${sample.id} [${sample.category}] 应检出 ${sample.expectedViolations.map(v => v.type).join(',')}`, () => {
      const result = checker.check(sample.llmOutput, sample.grounding);
      const gotTypes = result.violations.map(v => v.type);
      for (const expected of sample.expectedViolations) {
        expect(gotTypes, `样本 ${sample.id} 应检出 ${expected.type}，实际检出: ${gotTypes.join(',') || '(none)'}`).toContain(expected.type);
      }
    });
  }

  it('整体检出率 ≥80% (B3 裁定)', () => {
    let detected = 0;
    const details = [];
    for (const sample of corpus) {
      const result = checker.check(sample.llmOutput, sample.grounding);
      const gotTypes = result.violations.map(v => v.type);
      const expectedTypes = sample.expectedViolations.map(v => v.type);
      const matched = expectedTypes.some(t => gotTypes.includes(t));
      if (matched) {
        detected++;
      } else {
        details.push(`${sample.id} MISS (expected ${expectedTypes.join(',')}, got ${gotTypes.join(',') || '(none)'})`);
      }
    }
    const rate = detected / corpus.length;
    if (rate < DETECTION_THRESHOLD) {
      expect.fail(
        `检出率 ${(rate * 100).toFixed(0)}% < ${(DETECTION_THRESHOLD * 100).toFixed(0)}% 阈值。\n` +
        `漏报样本:\n${details.map(d => '  ' + d).join('\n')}\n\n` +
        `不要调 checker 掩盖漏报（W8 任务卡 §6）。检查样本是否对齐 checker 实际触发条件。`
      );
    }
  });

  it('corpus 覆盖至少 5 类 violation', () => {
    const categories = new Set(corpus.map(s => s.category));
    expect(categories.size).toBeGreaterThanOrEqual(5);
  });
});
