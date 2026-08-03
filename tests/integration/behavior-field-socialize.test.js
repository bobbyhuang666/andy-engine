import { describe, it, expect } from 'vitest';
import AndyEngine from '../../index.js';
import RuntimeContext from '../../src/runtime/RuntimeContext.js';
import { BehaviorFieldCandidateProvider } from '../../src/action/providers/BehaviorFieldCandidateProvider.js';
import tavernDomain from '../../presets/tavern/index.js';

const TEST_START = new Date('2026-09-01T08:00:00Z');

function createRuntime({ mode = 'active', seed = 'behavior-socialize', present = true } = {}) {
  const engine = new AndyEngine({
    seed,
    startTime: new Date(TEST_START),
    tickMinutes: 5,
    domain: tavernDomain,
    actionSelection: {
      enabled: true,
      mode,
      temperature: 0,
      recordTraces: true,
      maxTraceHistory: 10,
    },
  });
  engine.createCharacter({
    id: 'alice', name: 'Alice', mbti: 'ENFP',
    schedule: { entries: [] }, initialPosition: '小屋',
  });
  engine.createCharacter({
    id: 'bob', name: 'Bob', mbti: 'ISTJ',
    schedule: { entries: [] }, initialPosition: present ? '小屋' : '酒馆',
  });

  const alice = engine.getAgent('alice');
  const relation = engine.world.socialGraph.getOrCreateRelationship('alice', 'bob');
  alice.needs.needs = { hunger: 0.8, energy: 0.8, social: 0.8, stimulation: 0.8, comfort: 0.8 };
  alice.behaviorField.B = [0.5, 0.8, 0.5, 0.5];
  alice.runtime.handlers.schedule.tick = () => {};
  engine.getAgent('bob')._actionSelectionConfig.enabled = false;
  alice._candidateProviderManager = {
    generateAll(context) {
      return new BehaviorFieldCandidateProvider().generate(context);
    },
  };

  const context = new RuntimeContext({
    world: engine.world,
    clock: engine.world.clock,
    config: engine.world.runtimeConfig,
    domain: engine.world.domain,
    rng: engine.world.rng,
  });
  return { engine, alice, relation, env: context.buildAgentEnv(5) };
}

function run(runtime) {
  runtime.alice.tick(runtime.env, [], null);
  return runtime.alice._actionTraceHistory.at(-1);
}

describe('behavior-field socialize presence grounding', () => {
  it('co-present high sociality selects a real target and writes scaled effects', () => {
    const active = createRuntime({ mode: 'active', seed: 'behavior-socialize-present' });
    const dryRun = createRuntime({ mode: 'dryRunEffects', seed: 'behavior-socialize-present' });
    const activeBefore = active.alice.needs.needs.social;
    const dryBefore = dryRun.alice.needs.needs.social;
    const activeTrace = run(active);
    const dryTrace = run(dryRun);
    const expected = active.alice.needs._cfg.recoveryRate.social * (5 / 60);

    expect(activeTrace.selectedAction).toBe('socialize');
    expect(activeTrace.selectedCandidate.target).toBe('bob');
    expect(activeTrace.stateDeltas.relationship.targetAgentId).toBe('bob');
    expect(activeTrace.stateDeltas.need.social).toBeCloseTo(expected, 12);
    expect(dryTrace.selectedAction).toBe('socialize');
    expect(dryTrace.stateDeltas.need.social).toBeCloseTo(expected, 12);
    expect(active.alice.needs.needs.social - dryRun.alice.needs.needs.social)
      .toBeCloseTo(expected, 12);
    expect(active.alice.needs.needs.social - activeBefore)
      .toBeCloseTo(dryRun.alice.needs.needs.social - dryBefore + expected, 12);
    expect(active.relation.history).toHaveLength(1);
    expect(dryRun.relation.history).toHaveLength(0);
  });

  it('without a co-present other, high sociality does not select socialize', () => {
    const runtime = createRuntime({ present: false, seed: 'behavior-socialize-remote' });
    const trace = run(runtime);

    expect(trace.selectedAction).not.toBe('socialize');
    expect(trace.stateDeltas?.relationship ?? null).toBeNull();
    expect(trace.stateDeltas?.need?.social ?? null).toBeNull();
    expect(runtime.relation.history).toHaveLength(0);
  });

  it('same seed keeps behavior-field socialize replay deterministic', () => {
    const first = createRuntime({ seed: 'behavior-socialize-replay' });
    const second = createRuntime({ seed: 'behavior-socialize-replay' });

    expect(run(first)).toEqual(run(second));
    expect(first.alice.needs.needs).toEqual(second.alice.needs.needs);
    expect(first.relation.history).toEqual(second.relation.history);
  });
});
