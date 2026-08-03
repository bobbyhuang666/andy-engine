import { describe, it, expect, vi } from 'vitest';
import AndyEngine from '../../index.js';
import RuntimeContext from '../../src/runtime/RuntimeContext.js';
import { SocializeCandidateProvider } from '../../src/action/providers/SocializeCandidateProvider.js';
const { diagnostics } = require('../../src/shared/Diagnostics');
import tavernDomain from '../../presets/tavern/index.js';

const TEST_START = new Date('2026-09-01T08:00:00Z');

function socializeCandidate(target) {
  return {
    id: `socialize-${target}`,
    type: 'socialize',
    source: 'test',
    target,
    label: 'socialize',
    constraints: {},
    metadata: {},
  };
}

function createRuntime({ seed, alicePosition, bobPosition, spatial = null }) {
  const engine = new AndyEngine({
    seed,
    startTime: new Date(TEST_START),
    domain: tavernDomain,
    ...(spatial ? { spatial } : {}),
    actionSelection: {
      enabled: true,
      mode: 'active',
      temperature: 0,
      recordTraces: true,
      maxTraceHistory: 10,
    },
  });
  engine.createCharacter({
    id: 'alice', name: 'Alice', mbti: 'INFP',
    schedule: { entries: [] }, initialPosition: alicePosition,
  });
  engine.createCharacter({
    id: 'bob', name: 'Bob', mbti: 'ISTJ',
    schedule: { entries: [] }, initialPosition: bobPosition,
  });

  const relation = engine.world.socialGraph.getOrCreateRelationship('alice', 'bob');
  relation.strength = 0.8;

  const alice = engine.getAgent('alice');
  const bob = engine.getAgent('bob');
  alice.runtime.handlers.schedule.tick = () => {};
  bob.runtime.handlers.schedule.tick = () => {};
  bob._actionSelectionConfig.enabled = false;

  const context = new RuntimeContext({
    world: engine.world,
    clock: engine.world.clock,
    config: engine.world.runtimeConfig,
    domain: engine.world.domain,
    rng: engine.world.rng,
  });
  return { engine, alice, bob, relation, env: context.buildAgentEnv(5) };
}

function runAliceAction(runtime, target) {
  runtime.alice._candidateProviderManager = {
    generateAll() {
      return [socializeCandidate(target)];
    },
  };
  runtime.alice.tick(runtime.env, [], null);
}

function relationshipSkips(warnSpy) {
  return warnSpy.mock.calls.filter(([message, details]) => (
    message === 'delta_skipped' && details?.type === 'relationship'
  ));
}

describe('active socialize presence guard', () => {
  it.each([
    ['bob', 'forced remote target'],
    ['social', 'NeedCandidateProvider target'],
  ])('%s (%s) produces no relationship delta or skipped warning', (target) => {
    const runtime = createRuntime({
      seed: 'remote-socialize',
      alicePosition: '小屋',
      bobPosition: '酒馆',
    });
    const warnSpy = vi.spyOn(diagnostics, 'warn').mockImplementation(() => {});

    try {
      runAliceAction(runtime, 'bob');

      expect(runtime.alice._actionTraceHistory.at(-1).stateDeltas.relationship).toBeNull();
      expect(runtime.alice._actionTraceHistory.at(-1).stateDeltas.need).toEqual({});
      expect(runtime.relation.history).toHaveLength(0);
      expect(runtime.relation.interactionCount).toBe(0);
      expect(relationshipSkips(warnSpy)).toHaveLength(0);
    } finally {
      warnSpy.mockRestore();
    }
  });

  it('co-present socialize produces exactly one relationship writeback', () => {
    const runtime = createRuntime({
      seed: 'present-socialize',
      alicePosition: '小屋',
      bobPosition: '小屋',
    });
    const recordSpy = vi.spyOn(runtime.relation, 'recordInteraction');

    runAliceAction(runtime, 'bob');

    expect(runtime.alice._actionTraceHistory.at(-1).stateDeltas.relationship).toMatchObject({
      targetAgentId: 'bob',
    });
    expect(recordSpy).toHaveBeenCalledTimes(1);
    expect(runtime.relation.history).toHaveLength(1);
    expect(runtime.relation.interactionCount).toBe(1);
  });

  it('continuous spatial setup uses the frozen RegionGrid ID snapshot, not world handles', () => {
    const runtime = createRuntime({
      seed: 'continuous-socialize-snapshot',
      alicePosition: '小屋',
      bobPosition: '小屋',
      spatial: 'continuous',
    });
    const aliceContext = runtime.alice._buildActionContext(runtime.env);
    const snapshot = runtime.env.coPresentAgentIdsByAgent;

    expect(runtime.engine.world.spatial).toBeTruthy();
    expect(Object.isFrozen(snapshot)).toBe(true);
    expect(Object.isFrozen(snapshot.alice)).toBe(true);
    expect(aliceContext.coPresentAgentIds).toEqual(['bob']);
    expect(aliceContext.coPresentAgentIds.every(id => typeof id === 'string')).toBe(true);
    expect(aliceContext.world).toEqual(expect.objectContaining({ time: expect.any(String) }));
    expect(aliceContext.world).not.toHaveProperty('agents');
    expect(new SocializeCandidateProvider().generate(aliceContext)).toHaveLength(1);
  });

  it('same seed keeps active socialize selection deterministic', () => {
    function run(seed) {
      const runtime = createRuntime({
        seed,
        alicePosition: '小屋',
        bobPosition: '酒馆',
      });
      runAliceAction(runtime, 'bob');
      const trace = runtime.alice._actionTraceHistory.at(-1);
      return {
        selectedAction: trace.selectedAction,
        relationship: trace.stateDeltas.relationship,
        historyLength: runtime.relation.history.length,
      };
    }

    expect(run('socialize-presence-replay')).toEqual(run('socialize-presence-replay'));
  });
});
