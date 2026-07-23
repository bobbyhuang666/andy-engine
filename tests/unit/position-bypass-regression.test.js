/**
 * Position fallback regression coverage.
 *
 * Invalid regions must be repaired through PositionDelta + EffectCommitter,
 * never through a direct agent.position write in the world runtime.
 */

import { describe, it, expect } from 'vitest';
const AndyEngine = require('../../index.js');
const campusDomain = require('../../presets/campus/index.js');

describe('position fallback uses the canonical effect pipeline', () => {
  it('repairs an invalid initial position through EffectCommitter', () => {
    const engine = new AndyEngine({
      startTime: new Date('2026-01-15T08:00:00'),
      seed: 42,
      domain: campusDomain,
      enableFacts: false,
    });
    const world = engine.world;
    const committedDeltas = [];
    const originalCommit = world.effectCommitter.commit.bind(world.effectCommitter);
    world.effectCommitter.commit = result => {
      committedDeltas.push(...(result.deltas || []));
      return originalCommit(result);
    };

    engine.createCharacter({
      id: 'alice',
      name: 'Alice',
      mbti: 'INFP',
      schedule: 'student',
      initialPosition: '不存在的区域',
    });

    const agent = world.getAgent('alice');
    expect(agent.position).toBe('宿舍');
    expect(world.regions.getRegion('alice')).toBe('宿舍');
    expect(committedDeltas).toContainEqual(expect.objectContaining({
      type: 'position',
      from: '不存在的区域',
      to: '宿舍',
      reason: 'fallback_region_placement',
    }));
  });

  it('repairs an invalid post-tick position through EffectCommitter', () => {
    const engine = new AndyEngine({
      startTime: new Date('2026-01-15T08:00:00'),
      seed: 42,
      domain: campusDomain,
      enableFacts: false,
      actionSelection: { enabled: false },
    });
    engine.createCharacter({
      id: 'bob',
      name: 'Bob',
      mbti: 'ISTJ',
      schedule: 'student',
      initialPosition: '图书馆',
    });

    const world = engine.world;
    const agent = world.getAgent('bob');
    agent.tick = () => {
      agent.position = '不存在的区域';
      return {
        stateChanged: false,
        regionChanged: true,
        newEvents: [],
        emotionSnapshot: null,
      };
    };

    const committedDeltas = [];
    const originalCommit = world.effectCommitter.commit.bind(world.effectCommitter);
    world.effectCommitter.commit = result => {
      committedDeltas.push(...(result.deltas || []));
      return originalCommit(result);
    };

    engine.tick();

    expect(agent.position).toBe('宿舍');
    expect(world.regions.getRegion('bob')).toBe('宿舍');
    expect(committedDeltas).toContainEqual(expect.objectContaining({
      type: 'position',
      from: '不存在的区域',
      to: '宿舍',
      reason: 'fallback_region_placement',
    }));
  });
});
