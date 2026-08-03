import { describe, it, expect, vi } from 'vitest';
import AndyEngine from '../../index.js';
import tavernDomain from '../../presets/tavern/index.js';
const { diagnostics } = require('../../src/shared/Diagnostics');

const TEST_START = new Date('2026-09-01T08:00:00Z');

function movementCandidate(type) {
  return {
    id: `${type}-test`,
    type,
    source: 'test',
    target: '广场',
    label: type,
    constraints: {},
    metadata: {},
  };
}

function createMovementEngine(seed, type, enableFacts) {
  const engine = new AndyEngine({
    seed,
    startTime: new Date(TEST_START),
    domain: tavernDomain,
    ...(enableFacts ? { enableFacts: true } : {}),
    actionSelection: {
      enabled: true,
      mode: 'active',
      temperature: 0,
      recordTraces: true,
      maxTraceHistory: 20,
    },
  });
  engine.createCharacter({
    id: 'alice',
    name: 'Alice',
    mbti: 'INFP',
    schedule: { entries: [] },
    initialPosition: '小屋',
  });

  const agent = engine.getAgent('alice');
  agent.runtime.handlers.schedule.tick = () => {};
  agent._candidateProviderManager = {
    generateAll() {
      return [movementCandidate(type)];
    },
  };
  return engine;
}

function locationMeaningSkips(warnSpy) {
  return warnSpy.mock.calls.filter(([message, details]) => (
    message === 'delta_skipped' && details?.type === 'locationMeaning'
  ));
}

describe('active action selection facts capability', () => {
  it.each(['move', 'explore'])(
    'facts disabled: %s applies position and does not emit an uncommittable location meaning delta',
    (type) => {
      const engine = createMovementEngine(`facts-disabled-${type}`, type, false);
      const agent = engine.getAgent('alice');
      const warnSpy = vi.spyOn(diagnostics, 'warn').mockImplementation(() => {});

      try {
        expect(engine.world.factStore).toBeFalsy();
        engine.tick();

        expect(agent.position).toBe('广场');
        expect(engine.world.regions.getRegion('alice')).toBe('广场');
        expect(engine.world.regions.getAgentsInRegion('广场')).toContain('alice');
        expect(locationMeaningSkips(warnSpy)).toHaveLength(0);
      } finally {
        warnSpy.mockRestore();
      }
    }
  );

  it.each(['move', 'explore'])(
    'facts enabled: %s applies position and records location meaning',
    (type) => {
      const engine = createMovementEngine(`facts-enabled-${type}`, type, true);
      const agent = engine.getAgent('alice');

      engine.tick();

      expect(agent.position).toBe('广场');
      expect(engine.world.factStore.getLocationMeaning('广场')).toMatchObject({
        location: '广场',
        meaningType: 'movement_target',
      });
    }
  );

  it('keeps active movement replay deterministic for the same seed', () => {
    function run(seed) {
      const engine = createMovementEngine(seed, 'explore', false);
      for (let i = 0; i < 5; i++) engine.tick();
      const agent = engine.getAgent('alice');
      return {
        position: agent.position,
        traces: agent._actionTraceHistory,
      };
    }

    expect(run('active-facts-capability-replay'))
      .toEqual(run('active-facts-capability-replay'));
  });
});
