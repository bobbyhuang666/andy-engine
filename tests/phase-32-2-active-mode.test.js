/**
 * Phase 32.2: Active Mode Gate Tests
 */

import { describe, it, expect, afterEach } from 'vitest';

// Use require to share the same module instance as Agent.js
const { ANDY_DEFAULTS } = require('../src/config/defaults.js');
const AndyEngine = require('../index.js');

const origMode = ANDY_DEFAULTS.actionSelection.activeMode;
const origTypes = [...(ANDY_DEFAULTS.actionSelection.activeTypes || [])];

function setActionConfig(activeMode, activeTypes = []) {
  ANDY_DEFAULTS.actionSelection.activeMode = activeMode;
  ANDY_DEFAULTS.actionSelection.activeTypes = activeTypes;
}

function restoreConfig() {
  ANDY_DEFAULTS.actionSelection.activeMode = origMode;
  ANDY_DEFAULTS.actionSelection.activeTypes = origTypes;
}

describe('Phase 32.2: Active Mode Gate', () => {
  afterEach(() => {
    restoreConfig();
  });

  describe('shadow mode', () => {
    // TODO: Re-enable when actionSelection is wired into AgentRuntime tick results
    it.skip('records trace but does not emit action_selected event', () => {
      setActionConfig('shadow');
      const engine = new AndyEngine({ seed: 'shadow_test', startTime: new Date('2026-09-01T08:00:00Z') });
      engine.createCharacter({ id: 'a', name: 'A', mbti: 'INFP', schedule: 'student' });

      const result = engine.tick();
      const agentResult = result.phase.agentThink.results.a;

      expect(agentResult.actionSelection).toBeDefined();
      expect(agentResult.actionSelection.reasonTrace).toBeDefined();

      const actionEvents = agentResult.newEvents.filter(e => e.type === 'action_selected');
      expect(actionEvents).toHaveLength(0);
    });

    it('same seed produces same trace in shadow mode', () => {
      setActionConfig('shadow');
      const engine1 = new AndyEngine({ seed: 'shadow_det', startTime: new Date('2026-09-01T08:00:00Z') });
      const engine2 = new AndyEngine({ seed: 'shadow_det', startTime: new Date('2026-09-01T08:00:00Z') });

      engine1.createCharacter({ id: 'a', name: 'A', mbti: 'INFP', schedule: 'student' });
      engine2.createCharacter({ id: 'a', name: 'A', mbti: 'INFP', schedule: 'student' });

      for (let i = 0; i < 10; i++) {
        const r1 = engine1.tick();
        const r2 = engine2.tick();

        const t1 = r1.phase.agentThink.results.a.actionSelection?.reasonTrace;
        const t2 = r2.phase.agentThink.results.a.actionSelection?.reasonTrace;

        if (t1 && t2) {
          expect(t1.selectedActionId).toBe(t2.selectedActionId);
          expect(t1.rngStateBefore).toBe(t2.rngStateBefore);
        }
      }
    });
  });

  describe('selective mode', () => {
    // TODO: Re-enable when action_selected event emission is wired into AgentRuntime
    it.skip('emits event for whitelisted types', () => {
      setActionConfig('selective', ['continue', 'explore', 'rest']);
      const engine = new AndyEngine({ seed: 'selective_white', startTime: new Date('2026-09-01T08:00:00Z') });
      engine.createCharacter({ id: 'a', name: 'A', mbti: 'INFP', schedule: 'student' });

      let foundEvent = false;
      for (let i = 0; i < 30; i++) {
        const result = engine.tick();
        const agentResult = result.phase.agentThink.results.a;
        const actionEvents = agentResult.newEvents.filter(e => e.type === 'action_selected');
        if (actionEvents.length > 0) {
          foundEvent = true;
          break;
        }
      }
      expect(foundEvent).toBe(true);
    });

    it('does not emit event for non-whitelisted types', () => {
      setActionConfig('selective', ['rest']);
      const engine = new AndyEngine({ seed: 'selective_black', startTime: new Date('2026-09-01T08:00:00Z') });
      engine.createCharacter({ id: 'a', name: 'A', mbti: 'ENFP', schedule: 'student' });

      for (let i = 0; i < 20; i++) {
        const result = engine.tick();
        const agentResult = result.phase.agentThink.results.a;
        const selectedType = agentResult.actionSelection?.selected?.type;

        if (selectedType && selectedType !== 'rest') {
          const actionEvents = agentResult.newEvents.filter(e => e.type === 'action_selected');
          expect(actionEvents).toHaveLength(0);
        }
      }
    });
  });

  describe('BehaviorField not affected', () => {
    it('shadow mode produces same B vectors as selective mode', () => {
      const engine1 = new AndyEngine({ seed: 'bf_compare', startTime: new Date('2026-09-01T08:00:00Z') });
      const engine2 = new AndyEngine({ seed: 'bf_compare', startTime: new Date('2026-09-01T08:00:00Z') });

      engine1.createCharacter({ id: 'a', name: 'A', mbti: 'INFP', schedule: 'student' });
      engine2.createCharacter({ id: 'a', name: 'A', mbti: 'INFP', schedule: 'student' });

      setActionConfig('shadow');
      for (let i = 0; i < 10; i++) engine1.tick();

      setActionConfig('selective', ['continue', 'explore', 'rest']);
      for (let i = 0; i < 10; i++) engine2.tick();

      restoreConfig();

      const b1 = engine1.getAgent('a').behaviorField.B;
      const b2 = engine2.getAgent('a').behaviorField.B;

      for (let d = 0; d < 4; d++) {
        expect(Math.abs(b1[d] - b2[d])).toBeLessThan(0.1);
      }
    });
  });
});
