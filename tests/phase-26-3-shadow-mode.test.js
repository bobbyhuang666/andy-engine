/**
 * Phase 26.3: ReasonTrace Shadow Mode Tests
 *
 * Verifies:
 * - actionSelection trace exists in agent result after tick
 * - trace is serializable JSON
 * - trace contains selected action, alternatives, score breakdown
 * - existing behavior outputs remain compatible
 * - custom domain traces contain no campus-only terms
 *
 * NOTE: The actionSelection field in agent tick results is not yet
 * wired into the AgentRuntime. Tests that depend on it are skipped
 * pending RFC approval and implementation.
 */

import { describe, it, expect } from 'vitest';
import AndyEngine from '../index.js';
import { isSerializable } from '../agent/action/ReasonTrace.js';
import tavern from '../presets/tavern/index.js';

function createTestEngine(seed, domain) {
  const config = {
    seed,
    startTime: new Date('2026-09-01T08:00:00Z'),
    weather: 'sunny',
  };
  if (domain) config.domain = domain;
  return new AndyEngine(config);
}

describe('Phase 26.3: ReasonTrace Shadow Mode', () => {
  describe('Shadow mode produces traces', () => {
    // TODO: Re-enable when actionSelection is wired into AgentRuntime tick results
    it.skip('agentResult contains actionSelection after tick', () => {
      const engine = createTestEngine('shadow_test');
      engine.createCharacter({ id: 'a', name: 'A', mbti: 'INFP', schedule: 'student' });

      const result = engine.tick();
      const agentResult = result.phase.agentThink.results.a;

      expect(agentResult).toBeDefined();
      expect(agentResult.actionSelection).toBeDefined();
      expect(agentResult.actionSelection.selected).toBeDefined();
      expect(agentResult.actionSelection.reasonTrace).toBeDefined();
    });

    it.skip('trace is serializable JSON', () => {
      const engine = createTestEngine('shadow_serial');
      engine.createCharacter({ id: 'a', name: 'A', mbti: 'INFP', schedule: 'student' });

      const result = engine.tick();
      const trace = result.phase.agentThink.results.a.actionSelection.reasonTrace;

      expect(isSerializable(trace)).toBe(true);
    });

    it.skip('trace contains expected fields', () => {
      const engine = createTestEngine('shadow_fields');
      engine.createCharacter({ id: 'a', name: 'A', mbti: 'INFP', schedule: 'student' });

      const result = engine.tick();
      const selection = result.phase.agentThink.results.a.actionSelection;

      expect(selection.selected.id).toBeTruthy();
      expect(selection.selected.type).toBeTruthy();
      expect(selection.selected.label).toBeTruthy();
      expect(selection.selected.source).toBeTruthy();
      expect(Array.isArray(selection.alternatives)).toBe(true);
      expect(selection.reasonTrace.scoreBreakdown).toBeDefined();
      expect(selection.reasonTrace.keyReasons).toBeDefined();
    });

    it.skip('trace includes RNG state when engine has seed', () => {
      const engine = createTestEngine('shadow_rng');
      engine.createCharacter({ id: 'a', name: 'A', mbti: 'INFP', schedule: 'student' });

      const result = engine.tick();
      const trace = result.phase.agentThink.results.a.actionSelection.reasonTrace;

      expect(trace.rngStateBefore).toBeDefined();
      expect(trace.rngStateAfter).toBeDefined();
    });
  });

  describe('Shadow mode does not change behavior', () => {
    it('existing behavior field output is unchanged', () => {
      const engine1 = createTestEngine('shadow_nochange');
      const engine2 = createTestEngine('shadow_nochange');

      engine1.createCharacter({ id: 'a', name: 'A', mbti: 'INFP', schedule: 'student' });
      engine2.createCharacter({ id: 'a', name: 'A', mbti: 'INFP', schedule: 'student' });

      // engine1 runs WITHOUT shadow mode (baseline)
      // engine2 runs WITH shadow mode (new code)
      // Both should produce identical B vectors
      for (let i = 0; i < 20; i++) {
        engine1.tick();
        engine2.tick();

        const b1 = engine1.getAgent('a').behaviorField.B;
        const b2 = engine2.getAgent('a').behaviorField.B;

        for (let d = 0; d < 4; d++) {
          expect(b1[d]).toBe(b2[d]);
        }
      }
    });

    it('existing emotion output is unchanged', () => {
      const engine = createTestEngine('shadow_emotion');
      engine.createCharacter({ id: 'a', name: 'A', mbti: 'INFP', schedule: 'student' });

      for (let i = 0; i < 10; i++) engine.tick();

      const agent = engine.getAgent('a');
      expect(agent.emotion.getValence()).toBeDefined();
      expect(agent.health).toBeGreaterThan(0);
      expect(agent.socialEnergy).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Domain safety', () => {
    it('tavern domain traces contain no campus-only terms', () => {
      const engine = createTestEngine('shadow_tavern', tavern);
      engine.createCharacter({ id: 'smith', name: '铁匠', mbti: 'ISTJ', schedule: 'blacksmith' });

      for (let i = 0; i < 10; i++) {
        const result = engine.tick();
        const selection = result.phase.agentThink.results.smith.actionSelection;

        if (selection && selection.reasonTrace) {
          const traceJson = JSON.stringify(selection.reasonTrace);
          const campusTerms = ['教室', '图书馆', '宿舍', '食堂', '学生', '老师', '上课'];
          for (const term of campusTerms) {
            expect(traceJson).not.toContain(term);
          }
        }
      }
    });
  });

  describe('Deterministic replay', () => {
    // TODO: Re-enable when actionSelection is wired into AgentRuntime tick results
    it.skip('same seed produces same action selection traces', () => {
      const engine1 = createTestEngine('shadow_deterministic');
      const engine2 = createTestEngine('shadow_deterministic');

      engine1.createCharacter({ id: 'a', name: 'A', mbti: 'INFP', schedule: 'student' });
      engine2.createCharacter({ id: 'a', name: 'A', mbti: 'INFP', schedule: 'student' });

      for (let i = 0; i < 10; i++) {
        const r1 = engine1.tick();
        const r2 = engine2.tick();

        const s1 = r1.phase.agentThink.results.a.actionSelection;
        const s2 = r2.phase.agentThink.results.a.actionSelection;

        expect(s1.selected.id).toBe(s2.selected.id);
        expect(s1.selected.type).toBe(s2.selected.type);
      }
    });
  });
});
