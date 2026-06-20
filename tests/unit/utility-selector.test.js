/**
 * UtilitySelector 测试套件
 */

import { describe, it, expect } from 'vitest';
import { selectAction } from '../../agent/action/UtilitySelector.js';
import { createCandidate } from '../../agent/action/ActionCandidate.js';
import { RNG } from '../../src/shared/rng.js';

describe('UtilitySelector', () => {
  const scoredCandidates = [
    {
      candidate: createCandidate({ type: 'rest', source: 'need' }),
      score: { total: 0.8, need: 0.7, emotion: 0.1, behavior: 0, memory: 0, relationship: 0, habit: 0, goal: 0, location: 0, world: 0, time: 0, constraint: 0 },
    },
    {
      candidate: createCandidate({ type: 'work', source: 'schedule' }),
      score: { total: 0.4, need: 0.1, emotion: 0.1, behavior: 0.2, memory: 0, relationship: 0, habit: 0, goal: 0, location: 0, world: 0, time: 0, constraint: 0 },
    },
    {
      candidate: createCandidate({ type: 'explore', source: 'intrinsic' }),
      score: { total: 0.6, need: 0.2, emotion: 0.2, behavior: 0.2, memory: 0, relationship: 0, habit: 0, goal: 0, location: 0, world: 0, time: 0, constraint: 0 },
    },
  ];

  describe('selectAction', () => {
    it('temperature=0 时选 argmax', () => {
      const { selected } = selectAction(scoredCandidates, { temperature: 0 });
      expect(selected.type).toBe('rest');
    });

    it('空列表返回 null', () => {
      const { selected, trace } = selectAction([], {});
      expect(selected).toBeNull();
      expect(trace.keyReasons).toContain('no-valid-candidates');
    });

    it('所有候选无效时返回 null', () => {
      const invalid = [{ candidate: {}, score: { total: NaN } }];
      const { selected } = selectAction(invalid, {});
      expect(selected).toBeNull();
    });

    it('相同 seed 产生相同选择', () => {
      const rng1 = new RNG(42);
      const rng2 = new RNG(42);

      const { selected: s1 } = selectAction(scoredCandidates, { temperature: 0.5, rng: rng1 });
      const { selected: s2 } = selectAction(scoredCandidates, { temperature: 0.5, rng: rng2 });

      expect(s1.type).toBe(s2.type);
    });

    it('temperature > 0 时必须显式传入 RNG', () => {
      expect(() => selectAction(scoredCandidates, { temperature: 0.5 }))
        .toThrow('requires a seeded RNG');
    });

    it('不同 seed 可能产生不同选择', () => {
      // 多次运行，不同 seed 应该有概率选到不同结果
      const results = new Set();
      for (let seed = 0; seed < 100; seed++) {
        const rng = new RNG(seed);
        const { selected } = selectAction(scoredCandidates, { temperature: 1.0, rng });
        if (selected) results.add(selected.type);
      }
      // 高温度下应该有多种选择
      expect(results.size).toBeGreaterThan(1);
    });

    it('trace 包含完整信息', () => {
      const rng = new RNG(42);
      const { trace } = selectAction(scoredCandidates, { temperature: 0.5, rng });

      expect(trace.selectedAction).toBeDefined();
      expect(trace.selectedCandidate).toBeDefined();
      expect(trace.candidateAlternatives.length).toBe(3);
      expect(trace.scoreBreakdown).toBeDefined();
      expect(trace.keyReasons).toBeDefined();
      expect(trace.rngStateBefore).toBeDefined();
      expect(trace.randomDraw).toBeDefined();
      expect(trace.rngStateAfter).toBeDefined();
      expect(trace.temperature).toBe(0.5);
      expect(trace.stateDeltas).toBeNull(); // 占位符
    });

    it('trace 是纯 JSON（可序列化）', () => {
      const rng = new RNG(42);
      const { trace } = selectAction(scoredCandidates, { temperature: 0.5, rng });

      const json = JSON.stringify(trace);
      const parsed = JSON.parse(json);
      expect(parsed.selectedAction).toBe(trace.selectedAction);
    });
  });
});
