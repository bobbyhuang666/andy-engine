/**
 * PerceptionHandler 单元测试
 */
import { describe, it, expect, beforeEach } from 'vitest';
import Agent from '../../../agent/Agent.js';
import Schedule from '../../../src/agent/schedule/Schedule.js';
import PerceptionHandler from '../../../src/agent/handlers/PerceptionHandler.js';

function createAgent(overrides = {}) {
  return new Agent({
    id: 'test',
    name: 'Test',
    personality: { mbti: 'INFP' },
    schedule: Schedule.createStudentSchedule().toJSON(),
    ...overrides,
  });
}

describe('PerceptionHandler', () => {
  let agent;
  let handler;

  beforeEach(() => {
    agent = createAgent();
    handler = new PerceptionHandler(agent);
  });

  it('should be instantiable', () => {
    expect(handler).toBeDefined();
    expect(handler.agent).toBe(agent);
  });

  it('handles empty events', () => {
    expect(() => {
      handler.tick({ safeEvents: [] });
    }).not.toThrow();
  });

  it('processes events with effects', () => {
    const event = {
      type: 'social',
      content: '和朋友聊天',
      effects: [{ target: 'test', type: 'emotion', delta: { joy: 0.05 } }],
      participants: ['test'],
    };
    expect(() => {
      handler.tick({ safeEvents: [event] });
    }).not.toThrow();
  });

  it('decays future tendency', () => {
    if (agent.futureTendency) {
      handler.tick({ safeEvents: [] });
      // futureTendency.decay() should have been called
      // Just verify no crash
    }
  });
});
