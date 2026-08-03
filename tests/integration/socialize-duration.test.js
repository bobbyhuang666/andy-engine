import { describe, it, expect } from 'vitest';
import AndyEngine from '../../index.js';
import RuntimeContext from '../../src/runtime/RuntimeContext.js';
import Relationship from '../../src/social/Relationship.js';
import { RelationshipDelta } from '../../src/effects/RelationshipDelta.js';
import { EffectResult } from '../../src/effects/EffectResult.js';
import { applyActionEffect } from '../../src/effects/EventEffectPipeline.js';
import tavernDomain from '../../presets/tavern/index.js';

const TEST_START = new Date('2026-09-01T08:00:00Z');
const FULL_LINEAR_EFFECT = 0.012 * (1 + 0.3) * 0.6;

function socializeCandidate() {
  return {
    id: 'socialize-duration',
    type: 'socialize',
    source: 'test',
    target: 'bob',
    label: 'socialize',
    constraints: {},
    metadata: {},
  };
}

function createRuntime({ mode = 'active', seed, tickMinutes = 5 }) {
  const engine = new AndyEngine({
    seed,
    startTime: new Date(TEST_START),
    tickMinutes,
    domain: tavernDomain,
    actionSelection: {
      enabled: true,
      mode,
      temperature: 0,
      recordTraces: true,
      maxTraceHistory: 20,
    },
  });
  engine.createCharacter({
    id: 'alice', name: 'Alice', mbti: 'INFP',
    schedule: { entries: [] }, initialPosition: '小屋',
  });
  engine.createCharacter({
    id: 'bob', name: 'Bob', mbti: 'ISTJ',
    schedule: { entries: [] }, initialPosition: '小屋',
  });

  const relation = engine.world.socialGraph.getOrCreateRelationship('alice', 'bob');
  // Keep all repeated-effect assertions in Relationship's simple linear regime.
  relation.strength = 0.2;

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
  alice._candidateProviderManager = {
    generateAll() {
      return [socializeCandidate()];
    },
  };

  return {
    engine,
    alice,
    relation,
    env: context.buildAgentEnv(tickMinutes),
  };
}

function runSelectedSocialize(runtime) {
  runtime.alice.tick(runtime.env, [], null);
}

describe('socialize action duration calibration', () => {
  it('direct Relationship call without duration keeps the full legacy effect', () => {
    const relation = new Relationship('alice', 'bob', null, {
      initialStrength: 0.2,
      strengthIncrement: 0.012,
    });

    relation.recordInteraction('action_socialize', 0.3, 'socialize');

    expect(relation.strength).toBeCloseTo(0.2 + FULL_LINEAR_EFFECT, 12);
    expect(relation.impression.positive).toBeCloseTo(0.3, 12);
    expect(relation.interactionCount).toBe(1);
    expect(relation.history).toHaveLength(1);
  });

  it('explicit invalid duration fails safe without a numeric relationship effect', () => {
    const relation = new Relationship('alice', 'bob', null, {
      initialStrength: 0.2,
      strengthIncrement: 0.012,
    });

    relation.recordInteraction('action_socialize', 0.3, 'socialize', null, Number.NaN);

    expect(relation.strength).toBeCloseTo(0.2, 12);
    expect(relation.impression.positive).toBeCloseTo(0, 12);
    expect(relation.interactionCount).toBe(1);
    expect(relation.history).toHaveLength(1);
  });

  it('legacy EffectCommitter RelationshipDelta without duration keeps full effect', () => {
    const runtime = createRuntime({ seed: 'socialize-legacy-committer' });
    const delta = new RelationshipDelta('alice', {
      targetAgentId: 'bob',
      interactionType: 'action_socialize',
      valence: 0.3,
      content: 'socialize',
    });

    const result = runtime.engine.world.effectCommitter.commit(new EffectResult({
      event: {},
      deltas: [delta],
      reasonTrace: {},
    }));

    expect(result.applied).toHaveLength(1);
    expect(delta.durationHours).toBeUndefined();
    expect(runtime.relation.strength).toBeCloseTo(0.2 + FULL_LINEAR_EFFECT, 12);
    expect(runtime.relation.impression.positive).toBeCloseTo(0.3, 12);
  });

  it('pipeline carries duration on the typed socialize delta', () => {
    const result = applyActionEffect({
      agentSnapshot: { id: 'alice', agent: { position: '小屋' } },
      selectedCandidate: socializeCandidate(),
      reasonTrace: {},
      simTime: TEST_START,
      coPresentAgentIds: ['bob'],
      durationHours: 5 / 60,
    });

    expect(result.deltas[0].durationHours).toBeCloseTo(5 / 60, 12);
  });

  it('5-minute selected socialize scales strength and impression, while 60 minutes is full effect', () => {
    const five = createRuntime({ seed: 'socialize-5-minute', tickMinutes: 5 });
    const sixty = createRuntime({ seed: 'socialize-60-minute', tickMinutes: 60 });

    runSelectedSocialize(five);
    runSelectedSocialize(sixty);

    expect(five.relation.strength - 0.2).toBeCloseTo(FULL_LINEAR_EFFECT / 12, 12);
    expect(five.relation.impression.positive).toBeCloseTo(0.3 / 12, 12);
    expect(sixty.relation.strength - 0.2).toBeCloseTo(FULL_LINEAR_EFFECT, 12);
    expect(sixty.relation.impression.positive).toBeCloseTo(0.3, 12);
    expect(five.relation.interactionCount).toBe(1);
    expect(five.relation.history).toHaveLength(1);
    expect(sixty.relation.interactionCount).toBe(1);
    expect(sixty.relation.history).toHaveLength(1);
  });

  it('twelve five-minute selected actions approximate one full-hour effect in linear regime', () => {
    const twelve = createRuntime({ seed: 'socialize-twelve-five-minute', tickMinutes: 5 });
    const sixty = createRuntime({ seed: 'socialize-one-hour', tickMinutes: 60 });

    for (let i = 0; i < 12; i++) runSelectedSocialize(twelve);
    runSelectedSocialize(sixty);

    expect(twelve.relation.strength).toBeCloseTo(sixty.relation.strength, 12);
    expect(twelve.relation.impression.positive).toBeCloseTo(sixty.relation.impression.positive, 12);
    expect(twelve.relation.interactionCount).toBe(12);
    expect(twelve.relation.history).toHaveLength(12);
  });

  it('active duration-scaled socialize replay is deterministic', () => {
    const first = createRuntime({ seed: 'socialize-duration-replay', tickMinutes: 5 });
    const second = createRuntime({ seed: 'socialize-duration-replay', tickMinutes: 5 });
    for (let i = 0; i < 5; i++) {
      runSelectedSocialize(first);
      runSelectedSocialize(second);
    }

    expect(first.relation.strength).toBe(second.relation.strength);
    expect(first.relation.impression).toEqual(second.relation.impression);
    expect(JSON.stringify(first.alice._actionTraceHistory))
      .toBe(JSON.stringify(second.alice._actionTraceHistory));
  });
});
