/**
 * ActionSelectionHandler 单元测试
 */
import { describe, it, expect, beforeEach } from 'vitest';
import Agent from '../../../agent/Agent.js';
import Schedule from '../../../agent/Schedule.js';
import ActionSelectionHandler from '../../../src/agent/handlers/ActionSelectionHandler.js';

function createAgent(overrides = {}) {
  return new Agent({
    id: 'test',
    name: 'Test',
    personality: { mbti: 'ENTP' },
    schedule: Schedule.createStudentSchedule().toJSON(),
    ...overrides,
  });
}

describe('ActionSelectionHandler', () => {
  let agent;
  let handler;

  beforeEach(() => {
    agent = createAgent();
    handler = new ActionSelectionHandler(agent);
  });

  it('should be instantiable', () => {
    expect(handler).toBeDefined();
    expect(handler.agent).toBe(agent);
  });

  it('does not crash when action selection is disabled', () => {
    agent._actionSelectionConfig = { enabled: false };
    const result = { newEvents: [] };
    expect(() => {
      handler.tick({ env: { hour: 10, dayOfWeek: 1, simTime: new Date() }, result });
    }).not.toThrow();
    expect(result.newEvents.length).toBe(0);
  });

  it('runs shadow pipeline when enabled', () => {
    agent._actionSelectionConfig = { enabled: true, mode: 'shadow', recordTraces: false };
    const result = { newEvents: [] };
    expect(() => {
      handler.tick({ env: { hour: 10, dayOfWeek: 1, simTime: new Date() }, result });
    }).not.toThrow();
  });
});
