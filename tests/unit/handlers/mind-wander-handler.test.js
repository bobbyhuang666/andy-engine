/**
 * MindWanderHandler 单元测试
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import Agent from '../../../agent/Agent.js';
import { getDefaultDomain } from '../../../src/domain/DomainRegistry.js';
import campusSchedules from '../../../presets/campus/schedules.js';
import MindWanderHandler from '../../../src/agent/handlers/MindWanderHandler.js';

function createAgent(overrides = {}) {
  return new Agent({
    id: 'test',
    name: 'Test',
    personality: { mbti: 'INFP' },
    schedule: campusSchedules.createStudentSchedule().toJSON(),
    seedMemories: [
      { content: '今天很开心', category: 'social', emotionTag: 'happy', importance: 0.8 },
      { content: '有点难过的事', category: 'personal', emotionTag: 'sad', importance: 0.6 },
    ],
    domain: getDefaultDomain(),
    ...overrides,
  });
}

describe('MindWanderHandler', () => {
  let agent;
  let handler;

  beforeEach(() => {
    agent = createAgent();
    handler = new MindWanderHandler(agent);
  });

  it('should be instantiable', () => {
    expect(handler).toBeDefined();
    expect(handler.agent).toBe(agent);
  });

  it('does not trigger when activity is high', () => {
    // High activity = not quiet
    agent.behaviorField.B[0] = 0.8;
    agent.behaviorField.B[2] = 0.1;
    const result = { newEvents: [] };
    handler.tick({ result });
    // With high activity, isQuiet is false, so no mind wander
    // (The random check only happens when isQuiet is true)
    expect(result.newEvents.length).toBe(0);
  });

  it('can trigger when activity and focus are both low', () => {
    agent.behaviorField.B[0] = 0.1;
    agent.behaviorField.B[2] = 0.1;
    const result = { newEvents: [] };
    // Run many times to account for probability
    let triggered = false;
    for (let i = 0; i < 50; i++) {
      result.newEvents = [];
      handler.tick({ result });
      if (result.newEvents.length > 0) {
        triggered = true;
        expect(result.newEvents[0].type).toBe('mind_wander');
        break;
      }
    }
    // With 25% probability and 50 attempts, should trigger at least once
    expect(triggered).toBe(true);
  });

  it('produces thought events with correct structure', () => {
    agent.behaviorField.B[0] = 0.1;
    agent.behaviorField.B[2] = 0.1;
    const result = { newEvents: [] };
    // Force a trigger by running many times
    for (let i = 0; i < 100; i++) {
      result.newEvents = [];
      handler.tick({ result });
      if (result.newEvents.length > 0) {
        const thought = result.newEvents[0];
        expect(thought.type).toBe('mind_wander');
        expect(thought.thoughtType).toBeDefined();
        expect(thought.content).toBeDefined();
        expect(thought.time).toBeDefined();
        break;
      }
    }
  });

  it('routes thought emotion feedback through EffectCommitter when env is available', () => {
    agent.behaviorField.B[0] = 0.1;
    agent.behaviorField.B[2] = 0.1;
    agent.rand = vi
      .fn()
      .mockReturnValueOnce(0)
      .mockReturnValueOnce(0);
    agent.emotion.applyEffect = vi.fn();
    agent.memory.retrieve = vi.fn(() => ({
      memories: [{
        content: '今天很开心',
        timestamp: new Date('2025-06-15T09:00:00Z'),
        emotionTag: 'happy',
      }],
      recallEmotionDelta: { joy: 0.04 },
    }));
    agent.memory.getSimTime = () => new Date('2025-06-15T10:00:00Z').getTime();

    const commit = vi.fn();
    const result = { newEvents: [] };
    handler.tick({ result, env: { effectCommitter: { commit } } });

    expect(result.newEvents[0].type).toBe('mind_wander');
    expect(commit).toHaveBeenCalledWith({
      deltas: [expect.objectContaining({
        type: 'emotion',
        target: 'agent',
        agentId: 'test',
        changes: expect.objectContaining({ joy: expect.any(Number) }),
      })],
    });
    expect(agent.emotion.applyEffect).not.toHaveBeenCalled();
  });
});
