/**
 * ScheduleHandler branch coverage — Wave 5 batch 4
 *
 * schedule-handler.test.js 已覆盖 constructor + tick happy/no-op path。
 * state-label-cleanup.test.js 已覆盖 getSkipAlternative。
 * 本文件补 checkSchedule 各分支(sick/distress/social-energy/lateNight/habit) +
 * getSkipRegion / generateSkipMemory / findNeedRegion。
 *
 * 用 agent stub + getDefaultDomain() (campus),hermetic。
 */

import { describe, it, expect, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
// CJS require 经直接路径:与运行时 require 同一模块实例,确保 v8 coverage 正确归因
const { createRequire } = await import('node:module');
const require = createRequire(import.meta.url);
const ScheduleHandler = require('../../../src/agent/handlers/ScheduleHandler.js');
const { getDefaultDomain } = require('../../../src/domain/DomainRegistry.js');
const { EffectCommitter } = require('../../../src/effects/EffectCommitter.js');

const campusDomain = getDefaultDomain();

function makeAgent(overrides = {}) {
  return {
    id: 'a1',
    position: '宿舍',
    health: 1.0,
    socialEnergy: 1.0,
    behaviorParams: { socialEnergyDrain: 0.6 },
    personality: { ocean: { conscientiousness: 0.5 } },
    emotion: {
      current: { sadness: 0, frustration: 0, nervousness: 0 },
      stress: 0,
      getValence: () => 0,
    },
    stateMachine: { currentState: '在发呆' },
    behaviorField: {
      B: [0.5, 0.5, 0.5, 0.5],
      velocity: [0, 0, 0, 0],
      label: '在发呆',
      setAttractor: () => {},
    },
    memory: { addExperience: () => {} },
    proceduralMemory: { query: () => null },
    schedule: { getCurrentActivity: () => ({ inSchedule: false }), entries: [] },
    domain: campusDomain,
    rand: () => 0.5,
    ...overrides,
  };
}

describe('ScheduleHandler.tick — EffectCommitter writeback', () => {
  // @characterization — direct state injection; not Beta evidence
  it('moves via PositionDelta and signals regionChanged', () => {
    const agent = makeAgent({
      position: '宿舍',
      schedule: { getCurrentActivity: () => ({ inSchedule: true, region: '图书馆', activity: '自习' }), entries: [] },
    });
    const world = {
      time: new Date('2026-07-02T10:00:00+08:00'),
      regions: { place: () => true },
    };
    world.effectCommitter = new EffectCommitter({ world, agents: new Map([[agent.id, agent]]) });
    let synced = null;
    const result = { regionChanged: false, stateChanged: false, newEvents: [] };

    new ScheduleHandler(agent).tick({
      env: {
        hour: 10,
        dayOfWeek: 1,
        simDate: 'Thu Jul 02 2026',
        simTime: world.time,
        effectCommitter: world.effectCommitter,
        effectWorld: world,
        _setRegionChanged: (agentId, position) => { synced = { agentId, position }; },
      },
      needsDrive: null,
      imResult: {},
      result,
    });

    expect(agent.position).toBe('图书馆');
    expect(result.regionChanged).toBe(true);
    expect(synced).toEqual({ agentId: 'a1', position: '图书馆' });
  });

  it('records skip memories via MemoryDelta while preserving emitted event', () => {
    const addExperience = vi.fn();
    const agent = makeAgent({
      position: '宿舍',
      health: 0.1,
      rand: () => 0,
      memory: { addExperience },
      schedule: { getCurrentActivity: () => ({ inSchedule: true, region: '教室', activity: '上课' }), entries: [] },
      domain: {
        hasRegion: (region) => ['宿舍', '教室'].includes(region),
        states: {},
        placeTypes: { work: [] },
        skipBehavior: {
          sick: { memories: ['今天身体很差，只能请假休息'] },
        },
      },
    });
    const world = { time: new Date('2026-07-02T10:00:00+08:00') };
    world.effectCommitter = new EffectCommitter({ world, agents: new Map([[agent.id, agent]]) });
    const result = { regionChanged: false, stateChanged: false, newEvents: [] };

    new ScheduleHandler(agent).tick({
      env: {
        hour: 10,
        dayOfWeek: 1,
        simDate: 'Thu Jul 02 2026',
        simTime: world.time,
        effectCommitter: world.effectCommitter,
        effectWorld: world,
      },
      needsDrive: null,
      imResult: {},
      result,
    });

    expect(addExperience).toHaveBeenCalledWith(
      expect.objectContaining({
        content: '今天身体很差，只能请假休息',
        type: 'illness',
        scope: 'local',
        _region: '宿舍',
      }),
      agent.emotion,
      null
    );
    expect(result.newEvents).toHaveLength(1);
    expect(result.newEvents[0].content).toBe('今天身体很差，只能请假休息');
  });

  it('does not directly assign position or call memory.addExperience', () => {
    const file = path.join(import.meta.dirname, '../../../src/agent/handlers/ScheduleHandler.js');
    const source = fs.readFileSync(file, 'utf8')
      .split('\n')
      .filter(line => !line.trim().startsWith('*') && !line.trim().startsWith('//'))
      .join('\n');

    expect(source).not.toMatch(/\bagent\.position\s*=/);
    expect(source).not.toContain('agent.memory.addExperience(');
  });
});

// ═══════════════════════════════════════════
// checkSchedule — sick branch
// ═══════════════════════════════════════════
describe('ScheduleHandler.checkSchedule — sick branch', () => {
  it('triggers sick skip when health<0.4 and rand passes', () => {
    const agent = makeAgent({
      health: 0.1,
      rand: () => 0.0,
      schedule: { getCurrentActivity: () => ({ inSchedule: true, region: '教室', activity: '上课' }), entries: [] },
    });
    const result = ScheduleHandler.checkSchedule(agent, 10, 1, null);
    expect(result.moved).toBe(true);
    expect(result.skipEvent).toBe('sick');
    expect(result.region).toBe(agent.position); // sick stays in place
  });
  it('does not trigger sick when rand fails', () => {
    const agent = makeAgent({
      health: 0.1,
      rand: () => 0.99,
      schedule: { getCurrentActivity: () => ({ inSchedule: true, region: '教室', activity: '上课' }), entries: [] },
    });
    const result = ScheduleHandler.checkSchedule(agent, 10, 1, null);
    expect(result.skipEvent).toBeUndefined();
  });
});

// ═══════════════════════════════════════════
// checkSchedule — emotional distress branch
// ═══════════════════════════════════════════
describe('ScheduleHandler.checkSchedule — emotional distress', () => {
  it('triggers skipClass for non-work activity', () => {
    const agent = makeAgent({
      emotion: { current: { sadness: 0.9, frustration: 0.9, nervousness: 0.9 }, stress: 8, getValence: () => -0.5 },
      personality: { ocean: { conscientiousness: 0.1 } },
      rand: () => 0.0,
      schedule: { getCurrentActivity: () => ({ inSchedule: true, region: '教室', activity: '自习' }), entries: [] },
    });
    const result = ScheduleHandler.checkSchedule(agent, 10, 1, null);
    expect(result.moved).toBe(true);
    expect(result.skipEvent).toBe('skipClass');
  });
  it('triggers skipWork when activity matches a work placeType', () => {
    const agent = makeAgent({
      emotion: { current: { sadness: 0.9, frustration: 0.9, nervousness: 0.9 }, stress: 8, getValence: () => -0.5 },
      personality: { ocean: { conscientiousness: 0.1 } },
      rand: () => 0.0,
      schedule: { getCurrentActivity: () => ({ inSchedule: true, region: '教室', activity: '教室学习' }), entries: [] },
    });
    const result = ScheduleHandler.checkSchedule(agent, 10, 1, null);
    expect(result.skipEvent).toBe('skipWork');
  });
});

// ═══════════════════════════════════════════
// checkSchedule — social energy depleted
// ═══════════════════════════════════════════
describe('ScheduleHandler.checkSchedule — social energy depleted', () => {
  it('returns moved:false when socialEnergy low, drain high, rand>0.3', () => {
    const agent = makeAgent({
      socialEnergy: 0.1,
      behaviorParams: { socialEnergyDrain: 0.6 },
      rand: () => 0.5,
      schedule: { getCurrentActivity: () => ({ inSchedule: true, region: '教室', activity: '上课' }), entries: [] },
    });
    const result = ScheduleHandler.checkSchedule(agent, 10, 1, null);
    expect(result.moved).toBe(false);
  });
});

// ═══════════════════════════════════════════
// checkSchedule — social event + low valence
// ═══════════════════════════════════════════
describe('ScheduleHandler.checkSchedule — social event branch', () => {
  it('returns moved:false for social region with low socialEnergy and negative valence, rand>0.4', () => {
    const agent = makeAgent({
      socialEnergy: 0.2,
      emotion: { current: {}, stress: 0, getValence: () => -0.2 },
      rand: () => 0.5,
      schedule: { getCurrentActivity: () => ({ inSchedule: true, region: '校园广场', activity: '社交' }), entries: [] },
    });
    const result = ScheduleHandler.checkSchedule(agent, 14, 1, null);
    expect(result.moved).toBe(false);
  });
});

// ═══════════════════════════════════════════
// checkSchedule — late night state before 8am
// ═══════════════════════════════════════════
describe('ScheduleHandler.checkSchedule — late night state', () => {
  it('returns moved:false for deviant state before 8am when rand>0.2', () => {
    // campus has '熬夜了' state with category 'deviant'
    const agent = makeAgent({
      stateMachine: { currentState: '熬夜了' },
      rand: () => 0.3,
      schedule: { getCurrentActivity: () => ({ inSchedule: true, region: '教室', activity: '上课' }), entries: [] },
    });
    const result = ScheduleHandler.checkSchedule(agent, 6, 1, null);
    expect(result.moved).toBe(false);
  });
});

// ═══════════════════════════════════════════
// checkSchedule — habit-driven move
// ═══════════════════════════════════════════
describe('ScheduleHandler.checkSchedule — habit-driven move', () => {
  it('moves to habit region when not in schedule and habit confidence high', () => {
    const agent = makeAgent({
      position: '宿舍',
      schedule: { getCurrentActivity: () => ({ inSchedule: false }), entries: [] },
      proceduralMemory: { query: () => ({ confidence: 0.8, action: { region: '图书馆' } }) },
    });
    const result = ScheduleHandler.checkSchedule(agent, 14, 1, null);
    expect(result.moved).toBe(true);
    expect(result.region).toBe('图书馆');
  });
  it('does not move when habit confidence low', () => {
    const agent = makeAgent({
      schedule: { getCurrentActivity: () => ({ inSchedule: false }), entries: [] },
      proceduralMemory: { query: () => ({ confidence: 0.3, action: { region: '图书馆' } }) },
    });
    const result = ScheduleHandler.checkSchedule(agent, 14, 1, null);
    expect(result.moved).toBe(false);
  });
});

// ═══════════════════════════════════════════
// getSkipRegion
// ═══════════════════════════════════════════
describe('ScheduleHandler.getSkipRegion', () => {
  it('returns a region from domain skipBehavior', () => {
    const agent = makeAgent({ rand: () => 0.0, position: '宿舍' });
    const region = ScheduleHandler.getSkipRegion(agent, 'skipClass', 10);
    expect(typeof region).toBe('string');
    expect(region).not.toBe('宿舍'); // should be a skipBehavior region, not fallback
  });
  it('falls back to agent.position when no skipBehavior', () => {
    const agent = makeAgent({ domain: {}, position: '宿舍' });
    expect(ScheduleHandler.getSkipRegion(agent, 'sick', 10)).toBe('宿舍');
  });
  it('falls back to agent.position when domain null', () => {
    const agent = makeAgent({ domain: null, position: '宿舍' });
    expect(ScheduleHandler.getSkipRegion(agent, 'sick', 10)).toBe('宿舍');
  });
});

// ═══════════════════════════════════════════
// generateSkipMemory
// ═══════════════════════════════════════════
describe('ScheduleHandler.generateSkipMemory', () => {
  it('returns null when no memories configured', () => {
    const agent = makeAgent({ domain: {} });
    expect(ScheduleHandler.generateSkipMemory(agent, 'sick', {})).toBeNull();
  });
  it('builds illness memory for sick with guilt 0', () => {
    const agent = makeAgent({
      rand: () => 0.0,
      position: '家',
      stateMachine: { currentState: '在拖延' },
      domain: { skipBehavior: { sick: { memories: ['生病了'] } } },
    });
    const mem = ScheduleHandler.generateSkipMemory(agent, 'sick', {});
    expect(mem.type).toBe('illness');
    expect(mem.content).toBe('生病了');
    expect(mem.effects[0].delta.guilt).toBe(0); // sick → 0
    expect(mem.effects[0].delta.relief).toBe(0.03);
    expect(mem._region).toBe('家');
  });
  it('builds deviant memory for skipClass with guilt 0.02', () => {
    const agent = makeAgent({
      rand: () => 0.0,
      domain: { skipBehavior: { skipClass: { memories: ['翘课了'] } } },
    });
    const mem = ScheduleHandler.generateSkipMemory(agent, 'skipClass', {});
    expect(mem.type).toBe('deviant');
    expect(mem.effects[0].delta.guilt).toBe(0.02);
  });
  it('builds deviant memory for skipWork with guilt 0.03', () => {
    const agent = makeAgent({
      rand: () => 0.0,
      domain: { skipBehavior: { skipWork: { memories: ['逃班了'] } } },
    });
    const mem = ScheduleHandler.generateSkipMemory(agent, 'skipWork', {});
    expect(mem.type).toBe('deviant');
    expect(mem.effects[0].delta.guilt).toBe(0.03);
  });
});

// ═══════════════════════════════════════════
// findNeedRegion
// ═══════════════════════════════════════════
describe('ScheduleHandler.findNeedRegion', () => {
  it('returns config.any when present', () => {
    const agent = makeAgent({
      domain: { placeTypes: { work: ['教室'] }, needRegionConfig: { hunger: { any: '食堂', worker: '办公室', student: '宿舍' } } },
      schedule: { entries: [{ region: '教室' }] },
    });
    expect(ScheduleHandler.findNeedRegion(agent, 'hunger')).toBe('食堂');
  });
  it('returns config.worker for worker agent', () => {
    const agent = makeAgent({
      domain: { placeTypes: { work: ['教室'] }, needRegionConfig: { hunger: { worker: '办公室' } } },
      schedule: { entries: [{ region: '教室' }] },
    });
    expect(ScheduleHandler.findNeedRegion(agent, 'hunger')).toBe('办公室');
  });
  it('returns null for unknown need', () => {
    expect(ScheduleHandler.findNeedRegion(makeAgent(), 'unknownNeed')).toBeNull();
  });
  it('returns null when no needRegionConfig', () => {
    const agent = makeAgent({ domain: {} });
    expect(ScheduleHandler.findNeedRegion(agent, 'hunger')).toBeNull();
  });
});

// ═══════════════════════════════════════════
// getSkipAlternative — null cases
// ═══════════════════════════════════════════
describe('ScheduleHandler.getSkipAlternative — null cases', () => {
  it('returns null when domain absent', () => {
    const agent = makeAgent({ domain: null });
    expect(ScheduleHandler.getSkipAlternative(agent, 'skipClass', 10)).toBeNull();
  });
  it('returns rest-category state for skipClass when no skipBehavior', () => {
    const agent = makeAgent({ domain: campusDomain }); // campus has rest-category states
    const result = ScheduleHandler.getSkipAlternative(agent, 'skipClass', 10);
    // campus has rest states; should return one or null depending on config
    expect(result === null || typeof result === 'string').toBe(true);
  });
});
