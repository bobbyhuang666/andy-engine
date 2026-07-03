/**
 * P0-1: Event lifecycle deduplication tests
 *
 * Verifies that encounter events appear in eventLog exactly ONCE,
 * relationship effects are applied exactly ONCE, and canon facts
 * (when enableFacts=true) are created exactly ONCE.
 *
 * Invariant: Tick-generated events (encounter, random, environment,
 * scheduled) are created only in Phase 7. External world APIs
 * (setWeather) may enqueue immediate events outside this phase.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import AndyEngine from '../../index.js';
import AndyWorld from '../../src/runtime/AndyWorld.js';
import EventDispatcher from '../../src/runtime/EventDispatcher.js';
import SocialGraph from '../../src/social/SocialGraph.js';
import { perceiveEvents } from '../../src/agent/runtime/PerceptionRuntime.js';
import { RNG } from '../../src/shared/rng.js';
import { getDefaultDomain } from '../../src/domain/DomainRegistry.js';

const campusDomain = getDefaultDomain();

// R7 fix: use a valid domain region name instead of VALID_REGION which doesn't exist
// in the campus domain (the actual region is '校园广场'). RegionGrid now
// rejects unknown regions instead of auto-creating phantom ones.
const VALID_REGION = '校园广场';

function createMockAgent(id, position, socialGraph) {
  const agent = {
    id,
    name: id,
    position,
    emotion: {
      getValence: () => 0,
      mood: { joy: 0, sadness: 0, anger: 0, fear: 0, disgust: 0, surprise: 0 },
      current: { joy: 0, sadness: 0, anger: 0, fear: 0, disgust: 0, surprise: 0 },
    },
    socialEnergy: 0.5,
    _behavior: { expressiveness: 0.5 },
    memory: { memories: [] },
    tick: () => ({ newEvents: [], regionChanged: false }),
    getStatus: () => ({ id }),
    toJSON: () => ({ id }),
    setSocialGraph: (sg) => { agent.socialGraph = sg; },
  };
  if (socialGraph) {
    agent.socialGraph = socialGraph;
  }
  return agent;
}

describe('Event Lifecycle Dedup (P0-1)', () => {
  describe('perception event-id dedup', () => {
    it('applies emotion and memory effects once for the same perceived event id', () => {
      const engine = new AndyEngine({
        seed: 'perception-dedup',
        startTime: new Date('2026-09-01T08:00:00Z'),
      });
      const agent = engine.createCharacter({
        id: 'alice',
        name: 'Alice',
        mbti: 'INFP',
        background: [],
      });
      let applyCount = 0;
      let memoryCount = 0;
      const originalApplyEffect = agent.emotion.applyEffect.bind(agent.emotion);
      const originalAddExperience = agent.memory.addExperience.bind(agent.memory);
      agent.emotion.applyEffect = (...args) => {
        applyCount++;
        return originalApplyEffect(...args);
      };
      agent.memory.addExperience = (...args) => {
        memoryCount++;
        return originalAddExperience(...args);
      };

      const event = {
        id: 'evt_seen_once',
        type: 'random',
        scope: 'public',
        participants: [],
        observers: [],
        content: 'a single visible event',
        effects: [{ target: 'alice', type: 'emotion', delta: { joy: 0.2 } }],
      };

      perceiveEvents(agent, [event]);
      perceiveEvents(agent, [event]);

      expect(applyCount).toBe(1);
      expect(memoryCount).toBe(1);
      expect(agent._perceivedEventIds.has('evt_seen_once')).toBe(true);
    });

    it('persists perceived event ids so save/restore does not replay old eventLog effects', () => {
      const engine = new AndyEngine({
        seed: 'perception-dedup-restore',
        startTime: new Date('2026-09-01T08:00:00Z'),
      });
      const agent = engine.createCharacter({
        id: 'alice',
        name: 'Alice',
        mbti: 'INFP',
        background: [],
      });
      const event = {
        id: 'evt_restore_seen',
        type: 'random',
        scope: 'public',
        participants: [],
        observers: [],
        content: 'already seen before save',
        effects: [{ target: 'alice', type: 'emotion', delta: { joy: 0.2 } }],
      };

      perceiveEvents(agent, [event]);
      const saved = agent.toJSON();
      expect(saved._perceivedEventIds).toContain('evt_restore_seen');

      const restored = new AndyEngine({
        seed: 'perception-dedup-restore',
        startTime: new Date('2026-09-01T08:00:00Z'),
      }, {
        time: new Date('2026-09-01T08:00:00Z').toISOString(),
        tickCount: 0,
        agents: { alice: saved },
        socialGraph: [],
        events: { eventLog: [], _nextId: 0 },
      }).getAgent('alice');
      let applyCount = 0;
      restored.emotion.applyEffect = () => { applyCount++; };

      perceiveEvents(restored, [event]);

      expect(applyCount).toBe(0);
      expect(restored._perceivedEventIds.has('evt_restore_seen')).toBe(true);
    });
  });

  describe('generateEncounterEvent returns draft (not in pendingEvents)', () => {
    it('does not push to pendingEvents', () => {
      const rng = new RNG(42);
      const dispatcher = new EventDispatcher(campusDomain, rng);
      const socialGraph = new SocialGraph();
      socialGraph.addAgent('a');
      socialGraph.addAgent('b');
      const rel = socialGraph.getOrCreateRelationship('a', 'b');
      rel.strength = 0.8;

      const agents = new Map();
      agents.set('a', createMockAgent('a', VALID_REGION));
      agents.set('b', createMockAgent('b', VALID_REGION));

      // Mock _rand to guarantee encounter
      let callIdx = 0;
      dispatcher._rand = () => {
        callIdx++;
        if (callIdx <= 2) return 0.1;
        return 0.5;
      };

      const draft = dispatcher.generateEncounterEvent('a', 'b', VALID_REGION, socialGraph, agents);
      expect(draft).not.toBeNull();
      expect(draft.type).toBe('social');
      expect(dispatcher.pendingEvents).toHaveLength(0);
    });
  });

  describe('generateRandomEvent returns draft (not in pendingEvents)', () => {
    it('does not push to pendingEvents', () => {
      const rng = new RNG(1);
      const dispatcher = new EventDispatcher(campusDomain, rng);
      // Force random event probability
      const originalRand = dispatcher._rand.bind(dispatcher);
      let callCount = 0;
      dispatcher._rand = () => {
        callCount++;
        if (callCount === 1) return 0.01; // pass probability check
        return 0.5;
      };

      const draft = dispatcher.generateRandomEvent('agent1', VALID_REGION, { hour: 14 });
      expect(draft).not.toBeNull();
      expect(draft.type).toBe('random');
      expect(dispatcher.pendingEvents).toHaveLength(0);
    });
  });

  describe('generateEnvironmentEvent returns draft (not in pendingEvents)', () => {
    it('does not push to pendingEvents', () => {
      const dispatcher = new EventDispatcher(campusDomain);
      const draft = dispatcher.generateEnvironmentEvent('rain', ['a', 'b']);
      expect(draft).not.toBeNull();
      expect(draft.type).toBe('weather');
      expect(dispatcher.pendingEvents).toHaveLength(0);
    });
  });

  describe('AndyWorld.step() creates encounter event exactly once', () => {
    it('eventLog has encounter exactly ONCE after one tick', () => {
      const rng = new RNG(42);
      const world = new AndyWorld({
        startTime: new Date('2024-06-15T10:00:00'),
      }, null, campusDomain, rng);

      const agentA = createMockAgent('alice', VALID_REGION, world.socialGraph);
      const agentB = createMockAgent('bob', VALID_REGION, world.socialGraph);
      world.addAgent(agentA);
      world.addAgent(agentB);

      // Pre-create relationship so encounter is guaranteed
      const rel = world.socialGraph.getOrCreateRelationship('alice', 'bob');
      rel.strength = 0.9;

      // Mock RNG on eventDispatcher to always allow encounter
      let callIdx = 0;
      world.eventDispatcher._rand = () => {
        callIdx++;
        if (callIdx <= 2) return 0.1;
        return 0.5;
      };

      world.step();

      const encounterEvents = world.eventDispatcher.eventLog.filter(
        e => e.type === 'social' && e.participants.includes('alice') && e.participants.includes('bob')
      );
      expect(encounterEvents).toHaveLength(1);
    });

    it('relationship effect is applied exactly ONCE (history length +1, not +2)', () => {
      const rng = new RNG(42);
      const world = new AndyWorld({
        startTime: new Date('2024-06-15T10:00:00'),
      }, null, campusDomain, rng);

      const agentA = createMockAgent('alice', VALID_REGION, world.socialGraph);
      const agentB = createMockAgent('bob', VALID_REGION, world.socialGraph);
      world.addAgent(agentA);
      world.addAgent(agentB);

      const rel = world.socialGraph.getOrCreateRelationship('alice', 'bob');
      rel.strength = 0.9;
      const strengthBefore = rel.strength;
      const historyBefore = rel.history.length;
      const interactionCountBefore = rel.interactionCount;

      // Mock RNG to guarantee encounter
      let callIdx = 0;
      world.eventDispatcher._rand = () => {
        callIdx++;
        if (callIdx <= 2) return 0.1;
        return 0.5;
      };

      world.step();

      const relAfter = world.socialGraph.getRelationship('alice', 'bob');
      // History should increase by exactly 1 (not 2 from double application)
      expect(relAfter.history.length).toBe(historyBefore + 1);
      // Interaction count should increase by exactly 1
      expect(relAfter.interactionCount).toBe(interactionCountBefore + 1);
      // Strength should have changed (effect applied)
      expect(relAfter.strength).not.toBe(strengthBefore);
      // Only one social event in the log
      const socialEvents = world.eventDispatcher.eventLog.filter(
        e => e.type === 'social'
      );
      expect(socialEvents).toHaveLength(1);
    });

    it('canon event fact created exactly ONCE when enableFacts=true', () => {
      const rng = new RNG(42);
      const world = new AndyWorld({
        startTime: new Date('2024-06-15T10:00:00'),
        enableFacts: true,
      }, null, campusDomain, rng);

      const agentA = createMockAgent('alice', VALID_REGION, world.socialGraph);
      const agentB = createMockAgent('bob', VALID_REGION, world.socialGraph);
      world.addAgent(agentA);
      world.addAgent(agentB);

      const rel = world.socialGraph.getOrCreateRelationship('alice', 'bob');
      rel.strength = 0.9;

      // Mock RNG to guarantee encounter
      let callIdx = 0;
      world.eventDispatcher._rand = () => {
        callIdx++;
        if (callIdx <= 2) return 0.1;
        return 0.5;
      };

      world.step();

      // Count event-type facts that reference the encounter participants
      const allFacts = world.factStore.getFactsForAgent('alice', { types: ['event'] });
      const encounterFacts = allFacts.filter(
        f => f.participants && f.participants.includes('alice') && f.participants.includes('bob')
      );
      // Should be exactly 1 event fact for this encounter, not 2
      expect(encounterFacts).toHaveLength(1);

      // Verify no duplicate observation facts for same observer/target pair
      const observationFacts = world.factStore.getFactsForAgent('alice', { types: ['observation'] });
      const encounterObs = observationFacts.filter(
        f => f.participants && f.participants.includes('alice') && f.participants.includes('bob')
      );
      // Each observer should have exactly 1 observation fact
      const aliceObs = encounterObs.filter(f => f.observers && f.observers.includes('alice'));
      expect(aliceObs).toHaveLength(1);
    });
  });

  describe('random events are not duplicated in eventLog', () => {
    it('each random event appears exactly once by id', () => {
      const rng = new RNG(1);
      const world = new AndyWorld({
        startTime: new Date('2024-06-15T10:00:00'),
      }, null, campusDomain, rng);

      world.addAgent(createMockAgent('a', VALID_REGION, world.socialGraph));

      // Force random event by mocking _rand
      let callCount = 0;
      world.eventDispatcher._rand = () => {
        callCount++;
        if (callCount === 1) return 0.01; // pass probability check
        return 0.5;
      };

      world.step();

      const randomEvents = world.eventDispatcher.eventLog.filter(e => e.type === 'random');
      for (const evt of randomEvents) {
        const count = world.eventDispatcher.eventLog.filter(e => e.id === evt.id).length;
        expect(count).toBe(1);
      }
    });
  });

  describe('pendingEvents not double-populated', () => {
    it('generate*Event returns draft but does not populate pendingEvents', () => {
      const rng = new RNG(42);
      const dispatcher = new EventDispatcher(campusDomain, rng);

      // Before any generate calls, pendingEvents is empty
      expect(dispatcher.pendingEvents).toHaveLength(0);

      // generateEncounterEvent returns draft, pendingEvents stays empty
      const socialGraph = new SocialGraph();
      socialGraph.addAgent('a');
      socialGraph.addAgent('b');
      const rel = socialGraph.getOrCreateRelationship('a', 'b');
      rel.strength = 0.8;
      const agents = new Map();
      agents.set('a', createMockAgent('a', VALID_REGION));
      agents.set('b', createMockAgent('b', VALID_REGION));

      let callIdx = 0;
      dispatcher._rand = () => {
        callIdx++;
        if (callIdx <= 2) return 0.1;
        return 0.5;
      };

      const encounterDraft = dispatcher.generateEncounterEvent('a', 'b', VALID_REGION, socialGraph, agents);
      expect(encounterDraft).not.toBeNull();
      expect(dispatcher.pendingEvents).toHaveLength(0);

      // generateRandomEvent returns draft, pendingEvents stays empty
      let callCount = 0;
      dispatcher._rand = () => {
        callCount++;
        if (callCount === 1) return 0.01;
        return 0.5;
      };
      const randomDraft = dispatcher.generateRandomEvent('a', VALID_REGION, { hour: 14 });
      expect(randomDraft).not.toBeNull();
      expect(dispatcher.pendingEvents).toHaveLength(0);

      // generateEnvironmentEvent returns draft, pendingEvents stays empty
      const envDraft = dispatcher.generateEnvironmentEvent('rain', ['a']);
      expect(envDraft).not.toBeNull();
      expect(dispatcher.pendingEvents).toHaveLength(0);

      // Only createEvent should populate pendingEvents
      dispatcher.createEvent(encounterDraft);
      expect(dispatcher.pendingEvents).toHaveLength(1);
    });
  });

  describe('setWeather is an exception — immediate enqueue outside Phase 7', () => {
    it('weather event appears in pendingEvents immediately (not in next dispatch)', () => {
      const world = new AndyWorld({
        startTime: new Date('2024-06-15T10:00:00'),
      }, null, campusDomain);
      world.addAgent(createMockAgent('a', VALID_REGION, world.socialGraph));

      world.setWeather('rain');

      // Event should be in pendingEvents (not yet dispatched)
      expect(world.eventDispatcher.pendingEvents).toHaveLength(1);
      expect(world.eventDispatcher.pendingEvents[0].type).toBe('weather');

      // After dispatch it goes to eventLog
      const dispatched = world.eventDispatcher.dispatch();
      expect(dispatched).toHaveLength(1);
      expect(world.eventDispatcher.eventLog).toHaveLength(1);
    });
  });

  describe('_processScheduledEvents returns drafts (not double-created)', () => {
    it('scheduled events created exactly once in eventLog', () => {
      const world = new AndyWorld({
        startTime: new Date('2024-06-15T10:00:00'),
      }, null, campusDomain);

      world.scheduleEvent({ type: 'test_event', content: 'hello' }, 0);

      world.step();

      const testEvents = world.eventDispatcher.eventLog.filter(
        e => e.type === 'test_event'
      );
      expect(testEvents).toHaveLength(1);
    });
  });
});
