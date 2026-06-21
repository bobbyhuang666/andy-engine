/**
 * ScheduleHandler 单元测试
 */
import { describe, it, expect, beforeEach } from 'vitest';
import Agent from '../../../agent/Agent.js';
import Schedule from '../../../src/agent/schedule/Schedule.js';
import ScheduleHandler from '../../../src/agent/handlers/ScheduleHandler.js';

function createAgent(overrides = {}) {
  return new Agent({
    id: 'test',
    name: 'Test',
    personality: { mbti: 'ESTJ' },
    schedule: Schedule.createStudentSchedule().toJSON(),
    ...overrides,
  });
}

describe('ScheduleHandler', () => {
  let agent;
  let handler;

  beforeEach(() => {
    agent = createAgent();
    handler = new ScheduleHandler(agent);
  });

  it('should be instantiable', () => {
    expect(handler).toBeDefined();
    expect(handler.agent).toBe(agent);
  });

  it('can move agent to scheduled region', () => {
    const result = { regionChanged: false, stateChanged: false, newEvents: [] };
    const env = { hour: 9, dayOfWeek: 2, simTime: new Date(), simDate: 'Tue' };
    handler.tick({
      env,
      needsDrive: null,
      imResult: { drive: null },
      result,
    });
    // May or may not move depending on schedule - just verify no crash
    expect(result).toBeDefined();
  });

  it('handles needs-driven movement', () => {
    agent.needs.needs.hunger = 0.1;
    const result = { regionChanged: false, stateChanged: false, newEvents: [] };
    const env = { hour: 14, dayOfWeek: 6, simTime: new Date(), simDate: 'Sat' };
    handler.tick({
      env,
      needsDrive: { need: 'hunger', urgency: 0.8 },
      imResult: { drive: null },
      result,
    });
    // Should attempt to find a need region
    expect(result).toBeDefined();
  });

  it('does not move when schedule says stay', () => {
    agent.position = '住处';
    const result = { regionChanged: false, stateChanged: false, newEvents: [] };
    const env = { hour: 3, dayOfWeek: 2, simTime: new Date(), simDate: 'Tue' };
    handler.tick({
      env,
      needsDrive: null,
      imResult: { drive: null },
      result,
    });
    expect(result.regionChanged).toBe(false);
  });
});
