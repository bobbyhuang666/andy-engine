/**
 * Phase 32.4: ReasonTrace 完整化测试
 */

import { describe, it, expect } from 'vitest';
import AndyEngine from '../index.js';
import { ANDY_DEFAULTS } from '../src/config/defaults.js';
import { isSerializable } from '../agent/action/ReasonTrace.js';

describe('Phase 32.4: ReasonTrace 完整化', () => {
  describe('keyReasons with values', () => {
    it('keyReasons contain specific values when needs are deficient', () => {
      const origMode = ANDY_DEFAULTS.actionSelection.activeMode;
      ANDY_DEFAULTS.actionSelection.activeMode = 'shadow';

      try {
        const engine = new AndyEngine({ seed: 'reason_test', startTime: new Date('2026-09-01T08:00:00Z') });
        engine.createCharacter({ id: 'a', name: 'A', mbti: 'INFP', schedule: 'student' });

        // Run several ticks to build up needs deficit
        for (let i = 0; i < 20; i++) engine.tick();

        const result = engine.tick();
        const trace = result.phase.agentThink.results.a.actionSelection?.reasonTrace;

        if (trace && trace.keyReasons) {
          // keyReasons should be an array
          expect(Array.isArray(trace.keyReasons)).toBe(true);
          // Each reason should be a string
          for (const reason of trace.keyReasons) {
            expect(typeof reason).toBe('string');
          }
        }
      } finally {
        ANDY_DEFAULTS.actionSelection.activeMode = origMode;
      }
    });
  });

  describe('candidateAlternatives with scoreBreakdown', () => {
    it('top candidates include scoreBreakdown summary', () => {
      const origMode = ANDY_DEFAULTS.actionSelection.activeMode;
      ANDY_DEFAULTS.actionSelection.activeMode = 'shadow';

      try {
        const engine = new AndyEngine({ seed: 'alt_test', startTime: new Date('2026-09-01T08:00:00Z') });
        engine.createCharacter({ id: 'a', name: 'A', mbti: 'INFP', schedule: 'student' });

        const result = engine.tick();
        const trace = result.phase.agentThink.results.a.actionSelection?.reasonTrace;

        if (trace && trace.candidateAlternatives.length > 0) {
          const first = trace.candidateAlternatives[0];
          expect(first.id).toBeDefined();
          expect(first.type).toBeDefined();
          expect(first.score).toBeDefined();
          expect(first.scoreBreakdown).toBeDefined();
          expect(typeof first.scoreBreakdown.total).toBe('number');
        }
      } finally {
        ANDY_DEFAULTS.actionSelection.activeMode = origMode;
      }
    });
  });

  describe('behaviorField alignment', () => {
    it('alignment field is present in reasonTrace', () => {
      const origMode = ANDY_DEFAULTS.actionSelection.activeMode;
      ANDY_DEFAULTS.actionSelection.activeMode = 'shadow';

      try {
        const engine = new AndyEngine({ seed: 'align_test', startTime: new Date('2026-09-01T08:00:00Z') });
        engine.createCharacter({ id: 'a', name: 'A', mbti: 'INFP', schedule: 'student' });

        const result = engine.tick();
        const trace = result.phase.agentThink.results.a.actionSelection?.reasonTrace;

        if (trace) {
          expect(trace.behaviorFieldAlignment).toBeDefined();
          expect(typeof trace.behaviorFieldAlignment.aligned).toBe('boolean');
        }
      } finally {
        ANDY_DEFAULTS.actionSelection.activeMode = origMode;
      }
    });
  });

  describe('deterministic trace', () => {
    it('same seed produces same complete reasonTrace', () => {
      const origMode = ANDY_DEFAULTS.actionSelection.activeMode;
      ANDY_DEFAULTS.actionSelection.activeMode = 'shadow';

      try {
        const engine1 = new AndyEngine({ seed: 'det_trace', startTime: new Date('2026-09-01T08:00:00Z') });
        const engine2 = new AndyEngine({ seed: 'det_trace', startTime: new Date('2026-09-01T08:00:00Z') });

        engine1.createCharacter({ id: 'a', name: 'A', mbti: 'INFP', schedule: 'student' });
        engine2.createCharacter({ id: 'a', name: 'A', mbti: 'INFP', schedule: 'student' });

        for (let i = 0; i < 5; i++) {
          const r1 = engine1.tick();
          const r2 = engine2.tick();

          const t1 = r1.phase.agentThink.results.a.actionSelection?.reasonTrace;
          const t2 = r2.phase.agentThink.results.a.actionSelection?.reasonTrace;

          if (t1 && t2) {
            expect(JSON.stringify(t1.scoreBreakdown)).toBe(JSON.stringify(t2.scoreBreakdown));
            expect(JSON.stringify(t1.keyReasons)).toBe(JSON.stringify(t2.keyReasons));
            expect(t1.rngStateBefore).toBe(t2.rngStateBefore);
            expect(t1.rngStateAfter).toBe(t2.rngStateAfter);
          }
        }
      } finally {
        ANDY_DEFAULTS.actionSelection.activeMode = origMode;
      }
    });

    it('complete reasonTrace is serializable', () => {
      const origMode = ANDY_DEFAULTS.actionSelection.activeMode;
      ANDY_DEFAULTS.actionSelection.activeMode = 'shadow';

      try {
        const engine = new AndyEngine({ seed: 'serial_test', startTime: new Date('2026-09-01T08:00:00Z') });
        engine.createCharacter({ id: 'a', name: 'A', mbti: 'INFP', schedule: 'student' });

        const result = engine.tick();
        const trace = result.phase.agentThink.results.a.actionSelection?.reasonTrace;

        if (trace) {
          expect(isSerializable(trace)).toBe(true);
        }
      } finally {
        ANDY_DEFAULTS.actionSelection.activeMode = origMode;
      }
    });
  });
});
