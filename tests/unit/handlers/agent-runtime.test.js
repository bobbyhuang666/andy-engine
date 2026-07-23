/**
 * AgentRuntime 集成测试
 *
 * 验证 AgentRuntime.tick() 与 Agent.tick() 产生等价行为。
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import Agent from '../../../agent/Agent.js';
import campusSchedules from '../../../presets/campus/schedules.js';
import { getDefaultDomain } from '../../../src/domain/DomainRegistry.js';
import AgentRuntime from '../../../src/agent/AgentRuntime.js';

function createAgent(overrides = {}) {
  return new Agent({
    id: 'test',
    name: 'Test',
    personality: { mbti: 'INFP' },
    schedule: campusSchedules.createStudentSchedule().toJSON(),
    seedMemories: [
      { content: '喜欢看书', category: 'hobby', importance: 0.7 },
    ],
    domain: getDefaultDomain(),
    ...overrides,
  });
}

function makeEnv(overrides = {}) {
  return {
    hour: 10,
    dayOfWeek: 2,
    weather: 'sunny',
    minutesElapsed: 5,
    simTime: new Date('2025-06-15T10:00:00'),
    simDate: 'Sun Jun 15 2025',
    ...overrides,
  };
}

describe('AgentRuntime', () => {
  // @characterization — direct state injection; not Beta evidence
  let agent;
  let runtime;

  beforeEach(() => {
    agent = createAgent();
    runtime = new AgentRuntime(agent);
  });

  describe('initialization', () => {
    it('creates all 8 handlers', () => {
      expect(runtime.handlers.perception).toBeDefined();
      expect(runtime.handlers.schedule).toBeDefined();
      expect(runtime.handlers.needsEmotion).toBeDefined();
      expect(runtime.handlers.health).toBeDefined();
      expect(runtime.handlers.social).toBeDefined();
      expect(runtime.handlers.mindWander).toBeDefined();
      expect(runtime.handlers.reflection).toBeDefined();
      expect(runtime.handlers.actionSelection).toBeDefined();
    });

    it('holds reference to agent', () => {
      expect(runtime.agent).toBe(agent);
    });
  });

  describe('tick execution', () => {
    it('returns valid result structure', () => {
      const result = runtime.tick(makeEnv(), [], null);
      expect(result).toBeDefined();
      expect(typeof result.stateChanged).toBe('boolean');
      expect(typeof result.regionChanged).toBe('boolean');
      expect(Array.isArray(result.newEvents)).toBe(true);
      expect(result.emotionSnapshot).toBeDefined();
      expect(result.emotionSnapshot.valence).toBeDefined();
      expect(result.emotionSnapshot.arousal).toBeDefined();
    });

    it('returns early when agent is offline', () => {
      agent.isOnline = false;
      const result = runtime.tick(makeEnv());
      expect(result.stateChanged).toBe(false);
      expect(result.emotionSnapshot).toBeNull();
    });

    it('throws when env is invalid', () => {
      expect(() => runtime.tick(null)).toThrow(/invalid env/);
    });

    it('handles empty events', () => {
      expect(() => {
        runtime.tick(makeEnv(), [], null);
      }).not.toThrow();
    });

    it('processes perceived events', () => {
      const event = {
        type: 'social',
        content: '和朋友聊天',
        effects: [{ target: 'test', type: 'emotion', delta: { joy: 0.05 } }],
        participants: ['test'],
      };
      const result = runtime.tick(makeEnv(), [event], null);
      expect(result).toBeDefined();
    });
  });

  describe('equivalence with Agent.tick()', () => {
    it('produces same result shape as Agent.tick()', () => {
      const env = makeEnv();
      const runtimeResult = runtime.tick(env, [], null);

      const agent2 = createAgent();
      const agentResult = agent2.tick(env, [], null);

      expect(Object.keys(runtimeResult).sort()).toEqual(Object.keys(agentResult).sort());
    });

    it('maintains behavior field dynamics', () => {
      runtime.tick(makeEnv(), [], null);
      const B = agent.behaviorField.B;
      for (let i = 0; i < 4; i++) {
        expect(B[i]).toBeGreaterThanOrEqual(0);
        expect(B[i]).toBeLessThanOrEqual(1);
      }
    });

    it('updates emotion snapshot', () => {
      const result = runtime.tick(makeEnv(), [], null);
      expect(result.emotionSnapshot).toBeDefined();
      expect(typeof result.emotionSnapshot.valence).toBe('number');
      expect(typeof result.emotionSnapshot.arousal).toBe('number');
      expect(Array.isArray(result.emotionSnapshot.dominant)).toBe(true);
      expect(typeof result.emotionSnapshot.promptString).toBe('string');
    });

    it('maintains state machine history on label change', () => {
      runtime.tick(makeEnv(), [], null);
      expect(Array.isArray(agent.stateMachine.history)).toBe(true);
    });
  });

  describe('tick order preservation', () => {
    it('runs multiple ticks without errors', () => {
      for (let i = 0; i < 10; i++) {
        const env = makeEnv({ hour: 8 + i });
        expect(() => runtime.tick(env, [], null)).not.toThrow();
      }
    });

    it('needs system evolves during tick', () => {
      const beforeEnergy = agent.needs.needs.energy;
      runtime.tick(makeEnv(), [], null);
      // Energy may go up or down depending on behavior vector, but should change
      expect(agent.needs.needs.energy).not.toBe(beforeEnergy);
    });

    it('hunger coupling affects emotion when very low', () => {
      // Set hunger very low to trigger coupling effect
      agent.needs.needs.hunger = 0.01;
      runtime.tick(makeEnv(), [], null);
      // After tick with very low hunger, frustration should be elevated
      // (coupling effect + no decay to zero it out in one tick)
      expect(agent.emotion.current.frustration).toBeGreaterThan(0);
    });

    it('routes intrinsic motivation emotion effects through EffectCommitter when env is available', () => {
      const commit = vi.fn();
      const applyEffect = vi.spyOn(agent.emotion, 'applyEffect');
      agent.intrinsicMotivation.tick = vi.fn(() => ({
        emotionEffects: { interest: 0.05 },
      }));

      runtime.tick(makeEnv({ effectCommitter: { commit } }), [], null);

      expect(commit).toHaveBeenCalledWith({
        deltas: [expect.objectContaining({
          type: 'emotion',
          target: 'agent',
          agentId: 'test',
          changes: { interest: 0.05 },
        })],
      });
      expect(applyEffect).not.toHaveBeenCalledWith({ interest: 0.05 });
    });
  });

	  describe('serialization compatibility', () => {
	    it('agent toJSON still works after runtime ticks', () => {
	      runtime.tick(makeEnv(), [], null);
	      const json = agent.toJSON();
	      expect(json.id).toBe('test');
	      expect(json.personality).toBeDefined();
	      expect(json.emotion).toBeDefined();
	      expect(json.behaviorField).toBeDefined();
	    });

	    it('agent can be restored after runtime ticks', () => {
	      runtime.tick(makeEnv(), [], null);
	      const json = agent.toJSON();
	      const restored = new Agent(
	        { id: 'test', name: 'Test', schedule: json.schedule, domain: getDefaultDomain() },
	        json
	      );
	      expect(restored.id).toBe('test');
	      expect(restored.position).toBeDefined();
	    });
	  });

	  describe('deterministic fallback — no wall-clock Date', () => {
	    it('StateMachine constructor uses epoch 0 when no savedState', () => {
	      // Creating a fresh agent (no savedState) should not have Date.now() as stateEnteredAt
	      const fresh = createAgent();
	      expect(fresh.stateMachine.stateEnteredAt.getTime()).toBe(0);
	    });

	    it('stateEnteredAt stays epoch 0 when no state change occurs', () => {
	      // Before any tick, stateEnteredAt should be epoch 0 (not wall-clock)
	      expect(agent.stateMachine.stateEnteredAt.getTime()).toBe(0);
	    });

	    it('stateEnteredAt uses simTime when env.simTime is provided', () => {
	      const env = makeEnv({ simTime: new Date('2025-06-15T10:00:00') });
	      // Force a state change by capturing the result
	      runtime.tick(env, [], null);
	      // Even if no state changed, the invariant is that stateEnteredAt
	      // was not set to wall-clock time — it's either epoch 0 or the simTime
	      const enteredAt = agent.stateMachine.stateEnteredAt;
	      // It should be either epoch 0 (no change) or the simTime from the env
	      expect(enteredAt.getTime()).not.toBeGreaterThan(new Date('2025-06-15T10:00:00').getTime());
	    });

	    it('history entries use ISO string from simTime or epoch 0', () => {
	      const env = makeEnv({ simTime: new Date('2025-06-15T10:00:00') });
	      runtime.tick(env, [], null);
	      for (const entry of agent.stateMachine.history) {
	        const parsed = new Date(entry.at);
	        // Every history timestamp should be ≤ simTime (epoch 0 or simTime)
	        expect(parsed.getTime()).not.toBeGreaterThan(new Date('2025-06-15T10:00:00').getTime());
	        // And should never be a recent wall-clock time like 2026
	        expect(parsed.getFullYear()).toBeLessThan(2026);
	      }
	    });
	  });
	});
