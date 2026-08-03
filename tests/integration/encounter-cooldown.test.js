import { describe, it, expect } from 'vitest';
import EventDispatcher from '../../src/runtime/EventDispatcher.js';
import SocialGraph from '../../src/social/SocialGraph.js';
import { RNG } from '../../src/shared/rng.js';
import { getDefaultDomain } from '../../src/domain/DomainRegistry.js';

const campusDomain = getDefaultDomain();
const START = new Date('2026-09-01T08:00:00Z');
const REGION = '校园广场';

function createScenario({ cooldown = 120, lastInteraction = new Date(0) } = {}) {
  const dispatcher = new EventDispatcher(campusDomain, new RNG('encounter-cooldown'), {
    encounterCooldownMinutes: cooldown,
  });
  const socialGraph = new SocialGraph();
  socialGraph.addAgent('alice');
  socialGraph.addAgent('bob');
  const relation = socialGraph.getOrCreateRelationship('alice', 'bob');
  relation.strength = 0.8;
  relation.lastInteraction = new Date(lastInteraction);
  dispatcher._rand = () => 0;
  return { dispatcher, socialGraph, relation };
}

function generateAt(scenario, elapsedMinutes) {
  scenario.dispatcher.setSimTime(new Date(START.getTime() + elapsedMinutes * 60 * 1000));
  return scenario.dispatcher.generateEncounterEvent(
    'alice', 'bob', REGION, scenario.socialGraph
  );
}

describe('natural encounter cooldown', () => {
  it('default 120 minutes gates recent interactions and allows exactly at the boundary', () => {
    const scenario = createScenario({ lastInteraction: START });

    expect(generateAt(scenario, 119)).toBeNull();
    expect(generateAt(scenario, 120)).not.toBeNull();
  });

  it('cooldown 0 disables the gate', () => {
    const scenario = createScenario({ cooldown: 0, lastInteraction: START });

    expect(generateAt(scenario, 5)).not.toBeNull();
  });

  it('new and epoch-sentinel relationships remain eligible', () => {
    const epoch = createScenario();
    expect(generateAt(epoch, 5)).not.toBeNull();

    const fresh = createScenario();
    fresh.socialGraph = new SocialGraph();
    fresh.socialGraph.addAgent('alice');
    fresh.socialGraph.addAgent('bob');
    expect(generateAt(fresh, 5)).not.toBeNull();
  });

  it('restored lastInteraction continues enforcing the cooldown', () => {
    const original = createScenario({ lastInteraction: START });
    const restoredGraph = SocialGraph.fromJSON(original.socialGraph.toJSON());
    const restored = createScenario({ lastInteraction: restoredGraph.getRelationship('alice', 'bob').lastInteraction });
    restored.socialGraph = restoredGraph;

    expect(restored.relation.lastInteraction.getTime()).toBe(START.getTime());
    expect(generateAt(restored, 5)).toBeNull();
    expect(generateAt(restored, 120)).not.toBeNull();
  });

  it('same simulated cooldown sequence replays deterministically', () => {
    const replay = () => {
      const scenario = createScenario({ lastInteraction: START });
      return [119, 120].map(minutes => {
        const event = generateAt(scenario, minutes);
        return event ? {
          type: event.type,
          participants: event.participants,
          content: event.content,
          effects: event.effects,
        } : null;
      });
    };

    expect(replay()).toEqual(replay());
  });
});
