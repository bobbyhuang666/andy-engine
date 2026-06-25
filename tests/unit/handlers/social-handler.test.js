/**
 * SocialHandler 单元测试
 */
import { describe, it, expect, beforeEach } from 'vitest';
import Agent from '../../../agent/Agent.js';
import { getDefaultDomain } from '../../../src/domain/DomainRegistry.js';
import campusSchedules from '../../../presets/campus/schedules.js';
import SocialHandler from '../../../src/agent/handlers/SocialHandler.js';

function createAgent(overrides = {}) {
  return new Agent({
    id: 'test',
    name: 'Test',
    personality: { mbti: 'ENFP' },
    schedule: campusSchedules.createStudentSchedule().toJSON(),
    domain: getDefaultDomain(),
    ...overrides,
  });
}

describe('SocialHandler', () => {
  let agent;
  let handler;

  beforeEach(() => {
    agent = createAgent();
    handler = new SocialHandler(agent);
  });

  it('should be instantiable', () => {
    expect(handler).toBeDefined();
    expect(handler.agent).toBe(agent);
  });

  it('updates social energy based on B.sociality', () => {
    agent.socialEnergy = 0.5;
    // Set sociality high (social mode)
    agent.behaviorField.B[1] = 0.8;
    handler.tick({ hoursElapsed: 1 });
    expect(agent.socialEnergy).toBeLessThan(0.5);
  });

  it('recovers social energy when alone', () => {
    agent.socialEnergy = 0.3;
    // Set sociality low (alone mode)
    agent.behaviorField.B[1] = 0.1;
    handler.tick({ hoursElapsed: 1 });
    expect(agent.socialEnergy).toBeGreaterThan(0.3);
  });

  it('clamps social energy to [0, 1]', () => {
    agent.socialEnergy = 0.01;
    agent.behaviorField.B[1] = 0.9;
    handler.tick({ hoursElapsed: 10 });
    expect(agent.socialEnergy).toBeGreaterThanOrEqual(0);

    agent.socialEnergy = 0.99;
    agent.behaviorField.B[1] = 0.0;
    handler.tick({ hoursElapsed: 10 });
    expect(agent.socialEnergy).toBeLessThanOrEqual(1);
  });
});
