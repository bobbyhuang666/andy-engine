/**
 * NeedsEmotionCoupler 单元测试
 */
import { describe, it, expect, beforeEach } from 'vitest';
import Agent from '../../../agent/Agent.js';
import Schedule from '../../../src/agent/schedule/Schedule.js';
import NeedsEmotionCoupler from '../../../src/agent/handlers/NeedsEmotionCoupler.js';

function createAgent(overrides = {}) {
  return new Agent({
    id: 'test',
    name: 'Test',
    personality: { mbti: 'ISFJ' },
    schedule: Schedule.createStudentSchedule().toJSON(),
    ...overrides,
  });
}

describe('NeedsEmotionCoupler', () => {
  let agent;
  let handler;

  beforeEach(() => {
    agent = createAgent();
    handler = new NeedsEmotionCoupler(agent);
  });

  it('should be instantiable', () => {
    expect(handler).toBeDefined();
    expect(handler.agent).toBe(agent);
  });

  it('applies negative emotion when hunger is low', () => {
    agent.needs.needs.hunger = 0.1;
    const beforeFrustration = agent.emotion.current.frustration || 0;
    handler.tick();
    expect(agent.emotion.current.frustration).toBeGreaterThanOrEqual(beforeFrustration);
  });

  it('applies negative emotion when energy is low', () => {
    agent.needs.needs.energy = 0.1;
    const beforeSadness = agent.emotion.current.sadness || 0;
    handler.tick();
    expect(agent.emotion.current.sadness).toBeGreaterThanOrEqual(beforeSadness);
  });

  it('applies loneliness when social need is low', () => {
    agent.needs.needs.social = 0.05;
    const beforeLoneliness = agent.emotion.current.loneliness || 0;
    handler.tick();
    expect(agent.emotion.current.loneliness).toBeGreaterThanOrEqual(beforeLoneliness);
  });

  it('does nothing when all needs are satisfied', () => {
    agent.needs.needs.hunger = 0.8;
    agent.needs.needs.energy = 0.8;
    agent.needs.needs.social = 0.8;
    agent.needs.needs.comfort = 0.8;
    agent.needs.needs.stimulation = 0.8;
    const before = { ...agent.emotion.current };
    handler.tick();
    // No significant change expected
    for (const dim of Object.keys(before)) {
      expect(Math.abs((agent.emotion.current[dim] || 0) - before[dim])).toBeLessThan(0.01);
    }
  });
});
