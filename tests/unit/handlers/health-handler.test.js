/**
 * HealthHandler 单元测试
 */
import { describe, it, expect, beforeEach } from 'vitest';
import Agent from '../../../agent/Agent.js';
import Schedule from '../../../src/agent/schedule/Schedule.js';
import HealthHandler from '../../../src/agent/handlers/HealthHandler.js';

function createAgent(overrides = {}) {
  return new Agent({
    id: 'test',
    name: 'Test',
    personality: { mbti: 'ENFP' },
    schedule: Schedule.createStudentSchedule().toJSON(),
    ...overrides,
  });
}

describe('HealthHandler', () => {
  let agent;
  let handler;

  beforeEach(() => {
    agent = createAgent();
    handler = new HealthHandler(agent);
  });

  it('should be instantiable', () => {
    expect(handler).toBeDefined();
    expect(handler.agent).toBe(agent);
  });

  it('decreases health when energy and hunger are both very low', () => {
    agent.health = 0.8;
    agent.needs.needs.energy = 0.05;
    agent.needs.needs.hunger = 0.05;
    agent.emotion.stress = 8;
    handler.tick({ hoursElapsed: 2, env: { weather: 'sunny' } });
    expect(agent.health).toBeLessThan(0.8);
  });

  it('increases health during rest (low activity)', () => {
    agent.health = 0.5;
    agent.needs.needs.energy = 0.8;
    agent.needs.needs.hunger = 0.8;
    agent.emotion.stress = 2;
    agent.behaviorField.B[0] = 0.05;
    agent.behaviorField.B[1] = 0.05;
    handler.tick({ hoursElapsed: 1, env: { weather: 'sunny' } });
    expect(agent.health).toBeGreaterThan(0.5);
  });

  it('clamps health to [0.1, 1.0]', () => {
    agent.health = 0.15;
    agent.needs.needs.energy = 0.0;
    agent.emotion.stress = 10;
    agent.needs.needs.hunger = 0.0;
    handler.tick({ hoursElapsed: 100, env: { weather: 'cold' } });
    expect(agent.health).toBeGreaterThanOrEqual(0.1);
    expect(agent.health).toBeLessThanOrEqual(1.0);
  });

  it('decreases health in bad weather when outdoors', () => {
    agent.health = 0.8;
    agent.position = '运动场';
    agent.needs.needs.energy = 0.8;
    agent.needs.needs.hunger = 0.8;
    agent.emotion.stress = 2;
    handler.tick({ hoursElapsed: 1, env: { weather: 'rain' } });
    expect(agent.health).toBeLessThan(0.8);
  });
});
