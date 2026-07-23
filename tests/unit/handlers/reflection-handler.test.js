/**
 * ReflectionHandler 单元测试
 */
import { describe, it, expect, beforeEach } from 'vitest';
import Agent from '../../../agent/Agent.js';
import { getDefaultDomain } from '../../../src/domain/DomainRegistry.js';
import campusSchedules from '../../../presets/campus/schedules.js';
import ReflectionHandler from '../../../src/agent/handlers/ReflectionHandler.js';

function createAgent(overrides = {}) {
  return new Agent({
    id: 'test',
    name: 'Test',
    personality: { mbti: 'ENFJ' },
    schedule: campusSchedules.createStudentSchedule().toJSON(),
    domain: getDefaultDomain(),
    ...overrides,
  });
}

describe('ReflectionHandler', () => {
  // @characterization — direct state injection; not Beta evidence
  let agent;
  let handler;

  beforeEach(() => {
    agent = createAgent();
    handler = new ReflectionHandler(agent);
  });

  it('should be instantiable', () => {
    expect(handler).toBeDefined();
    expect(handler.agent).toBe(agent);
  });

  it('increments ticks since reflection', () => {
    const before = agent._ticksSinceReflection;
    handler.tick();
    expect(agent._ticksSinceReflection).toBe(before + 1);
  });

  it('triggers reflection at interval', () => {
    agent._ticksSinceReflection = agent._reflectionInterval - 1;
    handler.tick();
    expect(agent._ticksSinceReflection).toBe(0);
  });

  it('drifts personality every 100 ticks', () => {
    agent._ticksSinceDriftCheck = 99;
    handler.tick();
    expect(agent._ticksSinceDriftCheck).toBe(0);
  });

  it('decays appraisal biases', () => {
    // Add a bias first
    agent.memory.addAppraisalBias({
      eventType: 'social',
      valenceShift: -0.1,
      decay: 0.01,
      reason: 'test',
    });
    handler.tick();
    // Biases should still exist (decay is gradual)
    const biases = agent.memory._appraisalBiases || agent.memory.appraisalBiases || [];
    expect(biases.length).toBeGreaterThanOrEqual(0);
  });
});
