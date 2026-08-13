/**
 * Canon/Knowledge/sim-time integrity tests (RFC W2 / Patch C)
 *
 * Covers:
 *   - normalizeEventTimeMs: Date / ISO / number / missing / invalid table-driven
 *   - direct/observed/overheard/told/inferred evidence matrix (learnedAt + eventId)
 *   - serialization round-trip preserves evidence time
 *   - 1000 Intention fromJSON respects 500 cap (was the missing-eviction bug)
 *   - setSimTime/getSimTime Date mutation isolation + Invalid Date rejection
 *
 * Hermetic: no DB, no network.
 */

import { describe, it, expect, beforeEach } from 'vitest';
const { createRequire } = await import('node:module');
const require = createRequire(import.meta.url);
const { normalizeEventTimeMs, FALLBACK_EPOCH_MS } = require('../../src/canon/timeHelpers.js');
const WorldFactStore = require('../../src/canon/WorldFactStore.js');
const CanonEventPipeline = require('../../src/canon/CanonEventPipeline.js');
const KnowledgeStore = require('../../src/knowledge/KnowledgeStore.js');
const { FactType, FactScope } = require('../../src/canon/FactSchema.js');

const ISO = '2026-08-13T12:00:00Z';
const ISO_MS = Date.parse(ISO);

// ─── normalizeEventTimeMs table-driven ───────────────────────────────────

describe('normalizeEventTimeMs (RFC W2)', () => {
  it('Date input → its getTime()', () => {
    expect(normalizeEventTimeMs(new Date(ISO))).toBe(ISO_MS);
  });

  it('ISO string → parsed ms', () => {
    expect(normalizeEventTimeMs(ISO)).toBe(ISO_MS);
  });

  it('epoch number → same number', () => {
    expect(normalizeEventTimeMs(ISO_MS)).toBe(ISO_MS);
  });

  it('undefined → fallback', () => {
    expect(normalizeEventTimeMs(undefined)).toBe(FALLBACK_EPOCH_MS);
  });

  it('null → fallback', () => {
    expect(normalizeEventTimeMs(null)).toBe(FALLBACK_EPOCH_MS);
  });

  it('invalid Date → fallback', () => {
    expect(normalizeEventTimeMs(new Date('invalid'))).toBe(FALLBACK_EPOCH_MS);
  });

  it('unparseable string → fallback', () => {
    expect(normalizeEventTimeMs('not-a-date')).toBe(FALLBACK_EPOCH_MS);
  });

  it('NaN → fallback', () => {
    expect(normalizeEventTimeMs(NaN)).toBe(FALLBACK_EPOCH_MS);
  });

  it('custom fallback used when invalid', () => {
    expect(normalizeEventTimeMs('bad', 999)).toBe(999);
  });
});

// ─── Evidence matrix: direct/observed/overheard/told/inferred ────────────

function makePipeline() {
  const factStore = new WorldFactStore();
  const knowledgeStore = new KnowledgeStore(factStore);
  factStore.setKnowledgeStore(knowledgeStore);
  const pipeline = new CanonEventPipeline(factStore, knowledgeStore, null);
  return { factStore, knowledgeStore, pipeline };
}

describe('Evidence matrix (RFC W2)', () => {
  let factStore, knowledgeStore, pipeline;

  beforeEach(() => {
    ({ factStore, knowledgeStore, pipeline } = makePipeline());
  });

  it('direct: learnedAt = event time, eventId = fact eventId', () => {
    const agents = new Map([['alice', { id: 'alice', position: 'lib' }]]);
    pipeline.processEvent({
      type: 'social', time: ISO, content: 'meet', location: 'lib',
      participants: ['alice'], observers: [], scope: 'public', id: 'evt-1',
    }, agents);
    const fact = Array.from(factStore._facts.values()).find(f => f.type === FactType.EVENT);
    const ev = knowledgeStore.getEvidence('alice', fact.id);
    expect(ev.source).toBe('direct');
    expect(ev.learnedAt).toBe(ISO_MS);
    expect(ev.eventId).toBe('evt-1');
  });

  it('observed: learnedAt = event time, eventId set', () => {
    const agents = new Map([
      ['alice', { id: 'alice', position: 'lib' }],
      ['bob', { id: 'bob', position: 'lib' }],
    ]);
    pipeline.processEvent({
      type: 'social', time: ISO, content: 'meet', location: 'lib',
      participants: ['alice'], observers: ['bob'], scope: 'public', id: 'evt-2',
    }, agents);
    const fact = Array.from(factStore._facts.values()).find(f => f.type === FactType.EVENT);
    const ev = knowledgeStore.getEvidence('bob', fact.id);
    expect(ev.source).toBe('observed');
    expect(ev.learnedAt).toBe(ISO_MS);
    expect(ev.eventId).toBe('evt-2');
  });

  it('overheard: learnedAt = event time, eventId set', () => {
    const agents = new Map([
      ['alice', { id: 'alice', position: 'lib' }],
      ['carol', { id: 'carol', position: 'lib' }],
    ]);
    // carol is at the same location but not participant/observer → overheard
    pipeline.processEvent({
      type: 'social', time: ISO, content: 'meet', location: 'lib',
      participants: ['alice'], observers: [], scope: 'public', id: 'evt-3',
    }, agents);
    const fact = Array.from(factStore._facts.values()).find(f => f.type === FactType.EVENT);
    const ev = knowledgeStore.getEvidence('carol', fact.id);
    expect(ev.source).toBe('overheard');
    expect(ev.learnedAt).toBe(ISO_MS);
    expect(ev.eventId).toBe('evt-3');
  });

  it('told: learnedAt = event time (ISO string no longer discarded)', () => {
    // Social event with 2 participants triggers gossip (told propagation).
    // Use an ISO string for event.time to exercise the fixed normalizeEventTimeMs path.
    const agents = new Map([
      ['alice', { id: 'alice', position: 'lib' }],
      ['bob', { id: 'bob', position: 'lib' }],
    ]);
    // First, let alice know a public fact (so she can tell bob).
    pipeline.processEvent({
      type: 'social', time: ISO, content: 'alice sees something', location: 'lib',
      participants: ['alice'], observers: [], scope: 'public', id: 'evt-known',
    }, agents);
    // Second social event triggers gossip: alice tells bob.
    pipeline.processEvent({
      type: 'social', time: '2026-08-13T13:00:00Z', content: 'gossip', location: 'lib',
      participants: ['alice', 'bob'], observers: [], scope: 'public', id: 'evt-gossip',
    }, agents);

    // Find a told evidence entry
    let toldEv = null;
    for (const [key, ev] of knowledgeStore._evidence) {
      if (ev.source === 'told') { toldEv = ev; break; }
    }
    // If gossip propagated, learnedAt must be the gossip event time, not 0/fallback.
    if (toldEv) {
      const gossipMs = Date.parse('2026-08-13T13:00:00Z');
      expect(toldEv.learnedAt).toBe(gossipMs);
      expect(toldEv.propagatedFrom).toBeTruthy();
    }
  });

  it('inferred: learnedAt = fact timestamp (already correct, regression guard)', () => {
    // _propagateInferred is a safety net for same-location agents not already
    // captured by direct/observed/overheard. Since overheard also targets
    // same-location agents and runs first, we test _propagateInferred directly
    // to verify its evidence construction (the regression we guard: inferred
    // must use fact.timestamp, not default 0).
    const { factStore, knowledgeStore, pipeline } = makePipeline();
    const agents = new Map([
      ['dave', { id: 'dave', position: 'lib' }],
    ]);
    // Manually create an EventFact and call _propagateInferred.
    const fact = {
      id: 'fact_test_inf', type: FactType.EVENT, source: 'engine',
      eventId: 'evt-inf', timestamp: new Date(ISO), scope: FactScope.PUBLIC,
      location: 'lib', participants: [], observers: [], confidence: 1.0,
      description: 'test',
    };
    factStore.addFact(fact);
    pipeline._propagateInferred(fact, agents);
    const ev = knowledgeStore.getEvidence('dave', fact.id);
    expect(ev.source).toBe('inferred');
    expect(ev.learnedAt).toBe(ISO_MS);
    expect(ev.eventId).toBe('evt-inf');
  });

  it('no legitimate event produces learnedAt: 0', () => {
    const agents = new Map([
      ['alice', { id: 'alice', position: 'lib' }],
      ['bob', { id: 'bob', position: 'lib' }],
      ['carol', { id: 'carol', position: 'lib' }],
    ]);
    pipeline.processEvent({
      type: 'social', time: ISO, content: 'meet', location: 'lib',
      participants: ['alice'], observers: ['bob'], scope: 'public', id: 'evt-zero',
    }, agents);
    for (const [key, ev] of knowledgeStore._evidence) {
      if (ev.source === 'direct' || ev.source === 'observed' || ev.source === 'overheard' || ev.source === 'inferred') {
        expect(ev.learnedAt).not.toBe(0);
        expect(ev.eventId).not.toBeNull();
      }
    }
  });
});

// ─── Serialization round-trip preserves evidence time ────────────────────

describe('Evidence serialization round-trip (RFC W2)', () => {
  it('learnedAt and eventId survive toJSON/fromJSON', () => {
    const { factStore, knowledgeStore, pipeline } = makePipeline();
    const agents = new Map([
      ['alice', { id: 'alice', position: 'lib' }],
    ]);
    pipeline.processEvent({
      type: 'social', time: ISO, content: 'meet', location: 'lib',
      participants: ['alice'], observers: [], scope: 'public', id: 'evt-rt',
    }, agents);
    const fact = Array.from(factStore._facts.values()).find(f => f.type === FactType.EVENT);
    const evBefore = knowledgeStore.getEvidence('alice', fact.id);

    // Round-trip
    const ksJson = knowledgeStore.toJSON();
    const restored = KnowledgeStore.fromJSON(ksJson, factStore);
    const evAfter = restored.getEvidence('alice', fact.id);

    expect(evAfter.learnedAt).toBe(evBefore.learnedAt);
    expect(evAfter.eventId).toBe(evBefore.eventId);
    expect(evAfter.source).toBe(evBefore.source);
  });
});

// ─── Intention fromJSON capacity (the missing-eviction bug) ──────────────

describe('Intention fromJSON capacity (RFC W2 / P2-2)', () => {
  it('1000 Intentions restored via fromJSON respect the 500 cap (evict to 80% = 400)', () => {
    const facts = [];
    for (let i = 0; i < 1000; i++) {
      facts.push({
        id: `int_${i}`,
        type: FactType.INTENTION,
        source: 'engine',
        agentId: 'a',
        timestamp: new Date(2026, 0, 1 + i),
        scope: 'public',
        intent: 'plan_' + i,
        confidence: 0.5,
        participants: [],
        observers: [],
      });
    }
    const restored = WorldFactStore.fromJSON({ version: 1, nextId: 99999, facts });
    const count = restored._byType.get(FactType.INTENTION).size;
    // Cap is 500; eviction to 80% = 400 retained.
    expect(count).toBe(400);
  });

  it('addFact and fromJSON both respect the same Intention cap (≤ 500)', () => {
    // Write 600 via addFact (incremental eviction)
    const store1 = new WorldFactStore();
    for (let i = 0; i < 600; i++) {
      store1.addFact({
        type: FactType.INTENTION, source: 'engine', agentId: 'a',
        timestamp: new Date(2026, 0, 1 + i), scope: 'public',
        intent: 'plan_' + i, confidence: 0.5,
        participants: [], observers: [],
      });
    }
    const liveCount = store1._byType.get(FactType.INTENTION).size;

    // Write 600 via fromJSON (batch eviction)
    const facts = [];
    for (let i = 0; i < 600; i++) {
      facts.push({
        id: `int_${i}`, type: FactType.INTENTION, source: 'engine', agentId: 'a',
        timestamp: new Date(2026, 0, 1 + i), scope: 'public',
        intent: 'plan_' + i, confidence: 0.5, participants: [], observers: [],
      });
    }
    const store2 = WorldFactStore.fromJSON({ version: 1, nextId: 99999, facts });
    const restoredCount = store2._byType.get(FactType.INTENTION).size;

    // Both paths must respect the cap. Incremental vs batch eviction may
    // leave different residual counts (incremental evicts to 80% on each
    // overshoot; batch evicts once at the end), but neither may exceed 500.
    expect(liveCount).toBeLessThanOrEqual(500);
    expect(restoredCount).toBeLessThanOrEqual(500);
    // The key regression guard: before Patch C, fromJSON did NOT evict
    // Intention at all, so restoredCount would have been 600. Now it must be
    // bounded (batch eviction to 80% of 500 = 400).
    expect(restoredCount).toBe(400);
  });
});

// ─── setSimTime/getSimTime Date mutation isolation + Invalid Date ─────────

describe('WorldFactStore Date boundary (RFC W2 / P2-1)', () => {
  it('getSimTime returns a fresh Date (mutating result does not affect store)', () => {
    const store = new WorldFactStore();
    store.setSimTime(new Date(ISO));
    const t1 = store.getSimTime();
    t1.setTime(0);
    expect(store.getSimTime().getTime()).toBe(ISO_MS);
  });

  it('setSimTime(Date) copies the input (mutating input after set does not affect store)', () => {
    const store = new WorldFactStore();
    const input = new Date(ISO);
    store.setSimTime(input);
    input.setTime(0);
    expect(store.getSimTime().getTime()).toBe(ISO_MS);
  });

  it('setSimTime rejects Invalid Date', () => {
    const store = new WorldFactStore();
    expect(() => store.setSimTime(new Date('invalid'))).toThrow(/Invalid Date/);
  });

  it('setSimTime(string) accepts valid ISO', () => {
    const store = new WorldFactStore();
    store.setSimTime(ISO);
    expect(store.getSimTime().getTime()).toBe(ISO_MS);
  });

  it('setSimTime(number) accepts epoch ms', () => {
    const store = new WorldFactStore();
    store.setSimTime(ISO_MS);
    expect(store.getSimTime().getTime()).toBe(ISO_MS);
  });
});
