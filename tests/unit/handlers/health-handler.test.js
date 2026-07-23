/**
 * HealthHandler 单元测试
 */
import { describe, it, expect, beforeEach } from 'vitest';
import Agent from '../../../agent/Agent.js';
import { getDefaultDomain } from '../../../src/domain/DomainRegistry.js';
import campusSchedules from '../../../presets/campus/schedules.js';
import tavernDomain from '../../../presets/tavern/index.js';
import AndyEngine from '../../../index.js';
import HealthHandler from '../../../src/agent/handlers/HealthHandler.js';

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

describe('HealthHandler', () => {
  // @characterization — direct state injection; not Beta evidence
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
    agent.position = '操场';
    agent.needs.needs.energy = 0.8;
    agent.needs.needs.hunger = 0.8;
    agent.emotion.stress = 2;
    handler.tick({ hoursElapsed: 1, env: { weather: 'rain' } });
    expect(agent.health).toBeLessThan(0.8);
  });
});

describe('HealthHandler weather outdoor — domain-driven (Wave 3 leftover 1)', () => {
  // Locks that the cold/rain outdoor branch reads domain.placeTypes.outdoor,
  // not a hardcoded campus word list. Uses tavern domain: its outdoor list is
  // ['广场','森林'] — disjoint from any campus word. If core re-hardcodes a
  // campus list, tavern '广场' would not match and these assertions would
  // fail. Neutralizes every non-weather factor so health delta reflects only
  // the outdoor rain penalty.
  let agent;
  let handler;

  beforeEach(() => {
    const engine = new AndyEngine({ domain: tavernDomain });
    agent = engine.createCharacter({
      id: 'tavern-health',
      name: '铁匠',
      mbti: 'ISTJ',
      background: ['一个铁匠'],
    });
    handler = new HealthHandler(agent);
    // Neutralize non-weather factors: high energy, stress exactly 6 (neither
    // >6 decline nor <6 recovery), hunger in [0.2,0.7) (no decline, no
    // >0.7 recovery), health at 0.8 (avoids stress<6&health<0.8 and
    // health<0.3 recovery), activity 0.5 (avoids <0.15 rest recovery).
    agent.health = 0.8;
    agent.needs.needs.energy = 0.8;
    agent.needs.needs.hunger = 0.5;
    agent.emotion.stress = 6;
    agent.behaviorField.B[0] = 0.5;
  });

  it('applies outdoor rain penalty when position is in domain.placeTypes.outdoor', () => {
    agent.position = '广场'; // tavern outdoor
    handler.tick({ hoursElapsed: 1, env: { weather: 'rain' } });
    expect(agent.health).toBeLessThan(0.8);
  });

  it('does not apply outdoor rain penalty when position is outside domain.placeTypes.outdoor', () => {
    agent.position = '小屋'; // tavern region, not outdoor
    handler.tick({ hoursElapsed: 1, env: { weather: 'rain' } });
    expect(agent.health).toBe(0.8);
  });
});
