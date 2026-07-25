import { describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { EffectCommitter } = require('../../../src/effects/EffectCommitter.js');
const { NeedDelta } = require('../../../src/effects/NeedDelta.js');
const { PositionDelta } = require('../../../src/effects/PositionDelta.js');
const AndyEngine = require('../../../index.js');

function throwAfter(committer, failingDelta) {
  const original = committer._applyDelta.bind(committer);
  committer._applyDelta = (delta) => {
    if (delta === failingDelta) throw new Error('injected delta failure');
    return original(delta);
  };
}

describe('EffectCommitter transactional batches', () => {
  it('rolls back an earlier need write when a later delta throws', () => {
    const agent = { id: 'a', needs: { needs: { energy: 0.5 } } };
    const committer = new EffectCommitter({ world: { time: new Date(0) }, agents: new Map([['a', agent]]) });
    const first = new NeedDelta('a', { energy: 0.25 });
    const failing = { type: 'injected', agentId: 'a' };
    throwAfter(committer, failing);

    const result = committer.commit({ deltas: [first, failing] });

    expect(agent.needs.needs.energy).toBe(0.5);
    expect(result.applied).toEqual([]);
    expect(result.rolledBack).toEqual([first]);
    expect(result.errors).toHaveLength(1);
  });

  it('restores both position and RegionGrid occupancy on a later failure', () => {
    const engine = new AndyEngine({ seed: 'effect-rollback' });
    const agent = engine.createCharacter({ id: 'a', name: 'A', initialPosition: '宿舍' });
    const committer = engine.world.effectCommitter;
    const destination = engine.domain.regions.find(region => region !== agent.position);
    const first = new PositionDelta(agent.id, { to: destination });
    const failing = { type: 'injected', agentId: agent.id };
    throwAfter(committer, failing);

    const result = committer.commit({ deltas: [first, failing] });

    expect(agent.position).toBe('宿舍');
    expect(engine.world.regions.getRegion(agent.id)).toBe('宿舍');
    expect(result.applied).toEqual([]);
    expect(result.rolledBack).toEqual([first]);
    expect(result.errors).toHaveLength(1);
  });

  it('keeps legacy guard-rejected deltas as skipped without rolling back valid peers', () => {
    const agent = { id: 'a', needs: { needs: { energy: 0.5 } } };
    const committer = new EffectCommitter({ world: { time: new Date(0) }, agents: new Map([['a', agent]]) });
    const valid = new NeedDelta('a', { energy: 0.1 });
    const optionalUnknown = { type: 'optional-extension', agentId: 'a' };

    const result = committer.commit({ deltas: [valid, optionalUnknown] });

    expect(agent.needs.needs.energy).toBeCloseTo(0.6);
    expect(result.applied).toEqual([valid]);
    expect(result.skipped).toEqual([optionalUnknown]);
    expect(result.rolledBack).toEqual([]);
  });
});
