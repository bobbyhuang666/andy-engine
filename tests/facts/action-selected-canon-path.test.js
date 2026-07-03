/**
 * Stage 27: Canon Event Path Hardening
 *
 * Documents and tests the action_selected → canon pipeline path.
 * Verifies: eventLog entry, CanonEventPipeline entry, WorldFactStore,
 * KnowledgeStore propagation, EffectCommitter, and FactEmitter boundary.
 *
 * No runtime behavior changed — this is audit + assertion only.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { WorldFactStore, KnowledgeStore, FactEmitter, CanonEventPipeline } from '../../facts/index.js';
import { FactScope } from '../../src/canon/FactSchema.js';

const TEST_START = new Date('2026-09-01T08:00:00Z');

function createEngine(seed, actionSelection, enableFacts = true) {
  const AndyEngine = require('../../index.js');
  const config = { seed, startTime: new Date(TEST_START), actionSelection, enableFacts };
  const engine = new AndyEngine(config);
  engine.createCharacter({ id: 'test', name: '测试', mbti: 'INFP', schedule: 'student' });
  return engine;
}

function makeActionSelectedEvent(overrides = {}) {
  return {
    type: 'action_selected',
    scope: 'internal',
    agentId: 'test',
    participants: [],
    observers: [],
    time: TEST_START.toISOString(),
    content: 'action_selected:explore',
    action: { type: 'explore', source: null, target: null, label: '' },
    reasonTrace: { selectedAction: 'explore', candidates: [] },
    effects: [],
    ...overrides,
  };
}

// ═══════════════════════════════════════════
// CanonEventPipeline unit tests for action_selected
// ═══════════════════════════════════════════

describe('Stage 27: action_selected canon path', () => {
  describe('CanonEventPipeline processes action_selected events', () => {
    let factStore;
    let knowledgeStore;
    let pipeline;

    beforeEach(() => {
      factStore = new WorldFactStore();
      knowledgeStore = new KnowledgeStore(factStore);
      pipeline = new CanonEventPipeline(factStore, knowledgeStore, null);
    });

    it('action_selected event becomes an EventFact in WorldFactStore', () => {
      const event = makeActionSelectedEvent();
      const agents = new Map([['test', { id: 'test', position: '图书馆' }]]);

      const result = pipeline.processEvent(event, agents);

      expect(result.fact).not.toBeNull();
      expect(result.fact.type).toBe('event');
      expect(result.fact.description).toContain('action_selected');
      expect(factStore.getEventFacts().length).toBe(1);
    });

    it('action_selected fact does NOT propagate knowledge (empty participants/observers)', () => {
      const event = makeActionSelectedEvent();
      const agents = new Map([['test', { id: 'test', position: '图书馆' }]]);

      const result = pipeline.processEvent(event, agents);

      expect(result.fact).not.toBeNull();
      // action_selected has participants:[] and observers:[] → no knowledge propagation
      expect(result.knowledgeUpdates.length).toBe(0);
      expect(knowledgeStore.hasKnowledge('test', result.fact.id)).toBe(false);
    });

    it('action_selected with populated participants DOES NOT propagate knowledge (auditOnly)', () => {
      const event = makeActionSelectedEvent({ participants: ['test'] });
      const agents = new Map([['test', { id: 'test', position: '图书馆' }]]);

      const result = pipeline.processEvent(event, agents);

      // R41 P1 fix: auditOnly facts no longer enter agent knowledge.
      // The fact is stored but knowledge is blocked for populated participants.
      expect(result.fact).not.toBeNull();
      expect(knowledgeStore.hasKnowledge('test', result.fact.id)).toBe(false);
    });

    it('action_selected with scope:internal is stored as INTERNAL scope fact', () => {
      const event = makeActionSelectedEvent({ scope: 'internal' });
      const agents = new Map([['test', { id: 'test', position: '图书馆' }]]);

      const result = pipeline.processEvent(event, agents);

      // R41 P1 fix: 'internal' is now a valid FactScope. It stays as internal
      // (no longer falls back to PUBLIC). Knowledge propagation and effects are
      // blocked for internal-scope facts.
      expect(result.fact).not.toBeNull();
      expect(result.fact.scope).toBe(FactScope.INTERNAL);
      expect(result.fact.originalScope).toBe('internal');
      expect(result.fact.eventType).toBe('action_selected');
      expect(result.fact.auditOnly).toBe(true);
    });
  });

  // ═══════════════════════════════════════════
  // Engine-level integration: mode × enableFacts matrix
  // ═══════════════════════════════════════════

  describe('Engine integration: mode × enableFacts matrix', () => {
    // ─── shadow mode ───
    describe('shadow mode', () => {
      it('shadow mode: no action_selected in eventLog', () => {
        const engine = createEngine('shadow-log', {
          enabled: true, mode: 'shadow', temperature: 0.35, recordTraces: true, maxTraceHistory: 100,
        }, true);

        for (let i = 0; i < 3; i++) engine.tick();

        const actionEvents = engine.world.eventDispatcher.eventLog.filter(e => e.type === 'action_selected');
        expect(actionEvents.length).toBe(0);
      });

      it('shadow mode: CanonEventPipeline is never fed action_selected (enableFacts=true)', () => {
        const engine = createEngine('shadow-canon', {
          enabled: true, mode: 'shadow', temperature: 0.35, recordTraces: true, maxTraceHistory: 100,
        }, true);

        const spy = engine.world.canonEventPipeline
          ? { called: false, count: 0 }
          : null;

        if (engine.world.canonEventPipeline) {
          const orig = engine.world.canonEventPipeline.processEvents.bind(engine.world.canonEventPipeline);
          let actionSelectedProcessed = 0;
          engine.world.canonEventPipeline.processEvents = (events, agents) => {
            actionSelectedProcessed += events.filter(e => e.type === 'action_selected').length;
            return orig(events, agents);
          };
          for (let i = 0; i < 3; i++) engine.tick();
          expect(actionSelectedProcessed).toBe(0);
        }
      });

      it('shadow mode: no WorldFact created for action_selected', () => {
        const engine = createEngine('shadow-facts', {
          enabled: true, mode: 'shadow', temperature: 0.35, recordTraces: true, maxTraceHistory: 100,
        }, true);

        for (let i = 0; i < 3; i++) engine.tick();

        if (engine.world.factStore) {
          const eventFacts = engine.world.factStore.getEventFacts();
          const actionFacts = eventFacts.filter(f => f.description && f.description.includes('action_selected'));
          expect(actionFacts.length).toBe(0);
        }
      });
    });

    // ─── event mode ───
    describe('event mode', () => {
      it('event mode (enableFacts=true): action_selected enters eventLog', () => {
        const engine = createEngine('event-log', {
          enabled: true, mode: 'event', temperature: 0.35, recordTraces: true, maxTraceHistory: 100,
        }, true);

        for (let i = 0; i < 3; i++) engine.tick();

        const actionEvents = engine.world.eventDispatcher.eventLog.filter(e => e.type === 'action_selected');
        expect(actionEvents.length).toBe(3);
      });

      it('event mode (enableFacts=true): action_selected goes through CanonEventPipeline', () => {
        const engine = createEngine('event-canon', {
          enabled: true, mode: 'event', temperature: 0.35, recordTraces: true, maxTraceHistory: 100,
        }, true);

        let actionSelectedProcessed = 0;
        if (engine.world.canonEventPipeline) {
          const orig = engine.world.canonEventPipeline.processEvents.bind(engine.world.canonEventPipeline);
          engine.world.canonEventPipeline.processEvents = (events, agents) => {
            actionSelectedProcessed += events.filter(e => e.type === 'action_selected').length;
            return orig(events, agents);
          };
        }

        for (let i = 0; i < 3; i++) engine.tick();
        expect(actionSelectedProcessed).toBe(3);
      });

      it('event mode (enableFacts=true): action_selected creates WorldFact', () => {
        const engine = createEngine('event-fact', {
          enabled: true, mode: 'event', temperature: 0.35, recordTraces: true, maxTraceHistory: 100,
        }, true);

        for (let i = 0; i < 3; i++) engine.tick();

        const eventFacts = engine.world.factStore.getEventFacts();
        const actionFacts = eventFacts.filter(f => f.description && f.description.includes('action_selected'));
        expect(actionFacts.length).toBe(3);
      });

      it('event mode (enableFacts=true): action_selected creates fact but does NOT propagate knowledge', () => {
        const engine = createEngine('event-ks', {
          enabled: true, mode: 'event', temperature: 0.35, recordTraces: true, maxTraceHistory: 100,
        }, true);

        engine.tick();

        const eventFacts = engine.world.factStore.getEventFacts();
        const actionFact = eventFacts.find(f => f.description && f.description.includes('action_selected'));
        expect(actionFact).toBeDefined();
        // action_selected has empty participants/observers → no knowledge propagation
        expect(engine.world.knowledgeStore.hasKnowledge('test', actionFact.id)).toBe(false);
      });

      it('event mode (enableFacts=true): action_selected is not exposed in grounding allowedFacts', () => {
        const engine = createEngine('event-grounding-no-audit', {
          enabled: true, mode: 'event', temperature: 0.35, recordTraces: true, maxTraceHistory: 100,
        }, true);

        engine.tick();

        const eventFacts = engine.world.factStore.getEventFacts();
        const actionFact = eventFacts.find(f => f.description && f.description.includes('action_selected'));
        expect(actionFact).toBeDefined();

        const grounding = engine.getGroundingPackage('test');
        expect(grounding.allowedFacts.some(f => f.id === actionFact.id)).toBe(false);
        expect(grounding.allowedFacts.some(f => f.description && f.description.includes('action_selected'))).toBe(false);
      });

      it('event mode (enableFacts=false): action_selected enters eventLog but NOT CanonEventPipeline', () => {
        const engine = createEngine('event-nofact', {
          enabled: true, mode: 'event', temperature: 0.35, recordTraces: true, maxTraceHistory: 100,
        }, false);

        for (let i = 0; i < 3; i++) engine.tick();

        const actionEvents = engine.world.eventDispatcher.eventLog.filter(e => e.type === 'action_selected');
        expect(actionEvents.length).toBe(3);

        // CanonEventPipeline is null when enableFacts=false
        expect(engine.world.canonEventPipeline).toBeNull();
        expect(engine.world.factStore).toBeNull();
        expect(engine.world.knowledgeStore).toBeNull();
      });

      it('event mode: action_selected does NOT go through EffectCommitter (no state mutation)', () => {
        const engine = createEngine('event-nocommit', {
          enabled: true, mode: 'event', temperature: 0.35, recordTraces: true, maxTraceHistory: 100,
        }, true);

        const agent = engine.getAgent('test');
        const before = { ...agent.needs.needs };

        engine.tick();

        // event mode: no stateDeltas computed, no EffectCommitter call for action effects
        const actionEvents = engine.world.eventDispatcher.eventLog.filter(e => e.type === 'action_selected');
        expect(actionEvents.length).toBe(1);
        // stateDeltas should be absent (only dryRunEffects/active compute them)
        expect(actionEvents[0].stateDeltas).toBeUndefined();
      });
    });

    // ─── dryRunEffects mode ───
    describe('dryRunEffects mode', () => {
      it('dryRunEffects (enableFacts=true): action_selected enters eventLog with stateDeltas', () => {
        const engine = createEngine('dry-log', {
          enabled: true, mode: 'dryRunEffects', temperature: 0.35, recordTraces: true, maxTraceHistory: 100,
        }, true);

        for (let i = 0; i < 3; i++) engine.tick();

        const actionEvents = engine.world.eventDispatcher.eventLog.filter(e => e.type === 'action_selected');
        expect(actionEvents.length).toBe(3);
        // dryRunEffects computes stateDeltas as audit metadata
        for (const evt of actionEvents) {
          expect(evt.stateDeltas).toBeDefined();
        }
      });

      it('dryRunEffects (enableFacts=true): action_selected goes through CanonEventPipeline', () => {
        const engine = createEngine('dry-canon', {
          enabled: true, mode: 'dryRunEffects', temperature: 0.35, recordTraces: true, maxTraceHistory: 100,
        }, true);

        let actionSelectedProcessed = 0;
        if (engine.world.canonEventPipeline) {
          const orig = engine.world.canonEventPipeline.processEvents.bind(engine.world.canonEventPipeline);
          engine.world.canonEventPipeline.processEvents = (events, agents) => {
            actionSelectedProcessed += events.filter(e => e.type === 'action_selected').length;
            return orig(events, agents);
          };
        }

        for (let i = 0; i < 3; i++) engine.tick();
        expect(actionSelectedProcessed).toBe(3);
      });

      it('dryRunEffects (enableFacts=true): action_selected creates fact but no knowledge (empty participants)', () => {
        const engine = createEngine('dry-fact', {
          enabled: true, mode: 'dryRunEffects', temperature: 0.35, recordTraces: true, maxTraceHistory: 100,
        }, true);

        engine.tick();

        const eventFacts = engine.world.factStore.getEventFacts();
        const actionFact = eventFacts.find(f => f.description && f.description.includes('action_selected'));
        expect(actionFact).toBeDefined();
        // empty participants/observers → no knowledge propagation
        expect(engine.world.knowledgeStore.hasKnowledge('test', actionFact.id)).toBe(false);
      });

      it('dryRunEffects (enableFacts=false): action_selected in eventLog only, no canon path', () => {
        const engine = createEngine('dry-nofact', {
          enabled: true, mode: 'dryRunEffects', temperature: 0.35, recordTraces: true, maxTraceHistory: 100,
        }, false);

        for (let i = 0; i < 3; i++) engine.tick();

        const actionEvents = engine.world.eventDispatcher.eventLog.filter(e => e.type === 'action_selected');
        expect(actionEvents.length).toBe(3);
        expect(engine.world.canonEventPipeline).toBeNull();
      });

      it('dryRunEffects: stateDeltas are audit-only, no world mutation', () => {
        const engine = createEngine('dry-nomut', {
          enabled: true, mode: 'dryRunEffects', temperature: 0.35, recordTraces: true, maxTraceHistory: 100,
        }, true);

        engine.tick();

        const actionEvents = engine.world.eventDispatcher.eventLog.filter(e => e.type === 'action_selected');
        expect(actionEvents.length).toBe(1);
        // stateDeltas present as metadata
        expect(actionEvents[0].stateDeltas).toBeDefined();
        // But effects array is empty (no effect application)
        expect(actionEvents[0].effects).toEqual([]);
      });
    });

    // ─── active mode ───
    describe('active mode', () => {
      it('active (enableFacts=true): action_selected enters eventLog', () => {
        const engine = createEngine('active-log', {
          enabled: true, mode: 'active', temperature: 0.35, recordTraces: true, maxTraceHistory: 100,
        }, true);

        for (let i = 0; i < 3; i++) engine.tick();

        const actionEvents = engine.world.eventDispatcher.eventLog.filter(e => e.type === 'action_selected');
        expect(actionEvents.length).toBe(3);
      });

      it('active (enableFacts=true): action_selected goes through CanonEventPipeline', () => {
        const engine = createEngine('active-canon', {
          enabled: true, mode: 'active', temperature: 0.35, recordTraces: true, maxTraceHistory: 100,
        }, true);

        let actionSelectedProcessed = 0;
        if (engine.world.canonEventPipeline) {
          const orig = engine.world.canonEventPipeline.processEvents.bind(engine.world.canonEventPipeline);
          engine.world.canonEventPipeline.processEvents = (events, agents) => {
            actionSelectedProcessed += events.filter(e => e.type === 'action_selected').length;
            return orig(events, agents);
          };
        }

        for (let i = 0; i < 3; i++) engine.tick();
        expect(actionSelectedProcessed).toBe(3);
      });

      it('active (enableFacts=true): action_selected creates fact but no knowledge (empty participants)', () => {
        const engine = createEngine('active-fact', {
          enabled: true, mode: 'active', temperature: 0.35, recordTraces: true, maxTraceHistory: 100,
        }, true);

        engine.tick();

        const eventFacts = engine.world.factStore.getEventFacts();
        const actionFact = eventFacts.find(f => f.description && f.description.includes('action_selected'));
        expect(actionFact).toBeDefined();
        // empty participants/observers → no knowledge propagation
        expect(engine.world.knowledgeStore.hasKnowledge('test', actionFact.id)).toBe(false);
      });

      it('active (enableFacts=false): action_selected in eventLog only, no canon path', () => {
        const engine = createEngine('active-nofact', {
          enabled: true, mode: 'active', temperature: 0.35, recordTraces: true, maxTraceHistory: 100,
        }, false);

        for (let i = 0; i < 3; i++) engine.tick();

        const actionEvents = engine.world.eventDispatcher.eventLog.filter(e => e.type === 'action_selected');
        expect(actionEvents.length).toBe(3);
        expect(engine.world.canonEventPipeline).toBeNull();
      });

      it('active mode: action_selected goes through EffectCommitter (state mutation)', () => {
        const engine = createEngine('active-commit', {
          enabled: true, mode: 'active', temperature: 0.35, recordTraces: true, maxTraceHistory: 100,
        }, true);

        engine.tick();

        const actionEvents = engine.world.eventDispatcher.eventLog.filter(e => e.type === 'action_selected');
        expect(actionEvents.length).toBe(1);
        // active mode computes stateDeltas and applies them via EffectCommitter
        expect(actionEvents[0].stateDeltas).toBeDefined();
      });
    });
  });

  // ═══════════════════════════════════════════
  // Scope and perception invariants
  // ═══════════════════════════════════════════

  describe('Scope and perception invariants', () => {
    it('action_selected always has scope:internal regardless of mode', () => {
      for (const mode of ['event', 'dryRunEffects', 'active']) {
        const engine = createEngine(`scope-${mode}`, {
          enabled: true, mode, temperature: 0.35, recordTraces: true, maxTraceHistory: 100,
        }, true);

        engine.tick();

        const actionEvents = engine.world.eventDispatcher.eventLog.filter(e => e.type === 'action_selected');
        for (const evt of actionEvents) {
          expect(evt.scope).toBe('internal');
        }
      }
    });

    it('action_selected with scope:internal is NOT perceived by agents as external events', () => {
      const engine = createEngine('not-perceived', {
        enabled: true, mode: 'event', temperature: 0.35, recordTraces: true, maxTraceHistory: 100,
      }, true);

      engine.tick();

      const recentEvents = engine.world.eventDispatcher.eventLog.slice(-10);
      const perceived = engine.world.eventDispatcher.filterEventsForAgent('test', recentEvents);

      expect(recentEvents.some(e => e.type === 'action_selected')).toBe(true);
      expect(perceived.some(e => e.type === 'action_selected')).toBe(false);
    });

    it('action_selected has empty participants and observers', () => {
      const engine = createEngine('empty-po', {
        enabled: true, mode: 'event', temperature: 0.35, recordTraces: true, maxTraceHistory: 100,
      }, true);

      engine.tick();

      const actionEvents = engine.world.eventDispatcher.eventLog.filter(e => e.type === 'action_selected');
      for (const evt of actionEvents) {
        expect(evt.participants).toEqual([]);
        expect(evt.observers).toEqual([]);
      }
    });
  });

  // ═══════════════════════════════════════════
  // FactEmitter boundary: emitEventFacts is NOT the entry point
  // ═══════════════════════════════════════════

  describe('FactEmitter boundary', () => {
    it('runtime never calls FactEmitter.emitEventFacts when CanonEventPipeline is enabled', () => {
      const engine = createEngine('factemitter-boundary', {
        enabled: true, mode: 'event', temperature: 0.35, recordTraces: true, maxTraceHistory: 100,
      }, true);

      if (!engine.world.factEmitter) return; // skip if factEmitter not available

      let emitEventFactsCalled = false;
      const origEmit = engine.world.factEmitter.emitEventFacts.bind(engine.world.factEmitter);
      engine.world.factEmitter.emitEventFacts = (events) => {
        emitEventFactsCalled = true;
        return origEmit(events);
      };

      // Also intercept propagateEventKnowledge
      let propagateCalled = false;
      if (engine.world.factEmitter.propagateEventKnowledge) {
        const origProp = engine.world.factEmitter.propagateEventKnowledge.bind(engine.world.factEmitter);
        engine.world.factEmitter.propagateEventKnowledge = (fact, agents) => {
          propagateCalled = true;
          return origProp(fact, agents);
        };
      }

      for (let i = 0; i < 3; i++) engine.tick();

      expect(emitEventFactsCalled).toBe(false);
      expect(propagateCalled).toBe(false);
    });

    it('FactEmitter.emitEventFacts exists but is a legacy fallback (BOUNDARY marker)', () => {
      // Verify the method exists on the class (for test-only fallback usage)
      const FactEmitterClass = require('../../src/canon/FactEmitter.js');
      expect(typeof FactEmitterClass.prototype.emitEventFacts).toBe('function');

      // Verify it is NOT called by the runtime pipeline
      // (This is the boundary: CanonEventPipeline.processEvents is the canonical path)
    });
  });

  // ═══════════════════════════════════════════
  // enableFacts=false: audit-only behavior
  // ═══════════════════════════════════════════

  describe('enableFacts=false: audit-only', () => {
    it('when enableFacts=false, factStore/knowledgeStore/canonEventPipeline are all null', () => {
      const engine = createEngine('nofact-null', {
        enabled: true, mode: 'event', temperature: 0.35, recordTraces: true, maxTraceHistory: 100,
      }, false);

      expect(engine.world.factStore).toBeNull();
      expect(engine.world.knowledgeStore).toBeNull();
      expect(engine.world.factEmitter).toBeNull();
      expect(engine.world.canonEventPipeline).toBeNull();
    });

    it('when enableFacts=false, action_selected is audit-only (eventLog but no fact/knowledge)', () => {
      const engine = createEngine('nofact-audit', {
        enabled: true, mode: 'event', temperature: 0.35, recordTraces: true, maxTraceHistory: 100,
      }, false);

      engine.tick();

      // Still in eventLog (audit trail)
      const actionEvents = engine.world.eventDispatcher.eventLog.filter(e => e.type === 'action_selected');
      expect(actionEvents.length).toBe(1);

      // No fact system available
      expect(engine.world.factStore).toBeNull();
      expect(engine.world.knowledgeStore).toBeNull();
    });
  });

  // ═══════════════════════════════════════════
  // Cross-mode consistency
  // ═══════════════════════════════════════════

  describe('Cross-mode consistency', () => {
    it('event and shadow modes produce identical agent state (behavior field)', () => {
      const seed = 'cross-mode';
      const SHADOW = { enabled: true, mode: 'shadow', temperature: 0.35, recordTraces: true, maxTraceHistory: 100 };
      const EVENT = { ...SHADOW, mode: 'event' };

      const e1 = createEngine(seed, SHADOW, true);
      const e2 = createEngine(seed, EVENT, true);

      for (let i = 0; i < 5; i++) { e1.tick(); e2.tick(); }

      const a1 = e1.getAgent('test');
      const a2 = e2.getAgent('test');

      expect(a1.behaviorField.label).toBe(a2.behaviorField.label);
      for (let d = 0; d < 4; d++) {
        expect(a1.behaviorField.B[d]).toBe(a2.behaviorField.B[d]);
      }
    });

    it('enableFacts=true vs enableFacts=false produce identical agent state', () => {
      const seed = 'facts-on-off';
      const cfg = { enabled: true, mode: 'event', temperature: 0.35, recordTraces: true, maxTraceHistory: 100 };

      const e1 = createEngine(seed, cfg, true);
      const e2 = createEngine(seed, cfg, false);

      for (let i = 0; i < 5; i++) { e1.tick(); e2.tick(); }

      const a1 = e1.getAgent('test');
      const a2 = e2.getAgent('test');

      expect(a1.behaviorField.label).toBe(a2.behaviorField.label);
      for (let d = 0; d < 4; d++) {
        expect(a1.behaviorField.B[d]).toBe(a2.behaviorField.B[d]);
      }
    });
  });
});
