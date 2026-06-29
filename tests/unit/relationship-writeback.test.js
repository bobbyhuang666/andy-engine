/**
 * Phase 38: Minimal Relationship Writeback Gate
 *
 * active mode can write back a minimal relationship update for 'socialize'
 * when candidate.target is a valid target agent id.
 *
 * dryRunEffects computes relationship delta but does not mutate SocialGraph.
 * Invalid/self targets no-op without throwing.
 */

import { describe, it, expect } from 'vitest';
const AndyEngine = require('../../index.js');
const tavernDomain = require('../../presets/tavern/index.js');

const TEST_START = new Date('2026-09-01T08:00:00Z');

const SHADOW = { enabled: true, mode: 'shadow', temperature: 0, recordTraces: true, maxTraceHistory: 100 };
const DRY_RUN = { ...SHADOW, mode: 'dryRunEffects' };
const ACTIVE = { ...SHADOW, mode: 'active' };

function createEngineWithTwoAgents(seed, actionSelection, domain = null) {
  const config = { seed, startTime: new Date(TEST_START), actionSelection };
  if (domain) config.domain = domain;
  const engine = new AndyEngine(config);
  engine.createCharacter({ id: 'alice', name: 'Alice', mbti: 'ENFJ', schedule: { entries: [] }, initialPosition: '宿舍' });
  engine.createCharacter({ id: 'bob', name: 'Bob', mbti: 'ISTP', schedule: { entries: [] }, initialPosition: '宿舍' });
  return engine;
}

function stubProvider(candidates) {
  return { generateAll() { return candidates; } };
}

function stubEmptyProvider() {
  return { generateAll() { return []; } };
}

function makeSocializeCandidate(targetAgentId) {
  return { id: `cand_socialize_${targetAgentId}`, type: 'socialize', source: 'behaviorField', target: targetAgentId, label: `talk to ${targetAgentId}`, constraints: {}, metadata: {} };
}

const REST_CANDIDATE = { id: 'cand_rest_1', type: 'rest', source: 'need', target: '', label: 'rest', constraints: {}, metadata: {} };

function aliceActionEvents(engine) {
  return engine.world.eventDispatcher.eventLog.filter(e => e.type === 'action_selected' && e.agentId === 'alice');
}

// ═══════════════════════════════════════════
// Phase 38: Relationship Writeback
// ═══════════════════════════════════════════

describe('Phase 38: Minimal Relationship Writeback Gate', () => {

  // ─── 1. Active socialize with valid target updates relationship ───
  it('active socialize: valid target increases interactionCount and history length', () => {
    const engine = createEngineWithTwoAgents('rel-valid', ACTIVE);
    const alice = engine.getAgent('alice');
    const bob = engine.getAgent('bob');
    alice._candidateProviderManager = stubProvider([makeSocializeCandidate('bob')]);
    bob._candidateProviderManager = stubEmptyProvider();
    alice._socialGraphRef = engine.world.socialGraph;

    const relBefore = engine.world.socialGraph.getRelationship('alice', 'bob');
    const countBefore = relBefore ? relBefore.interactionCount : 0;
    const historyBefore = relBefore ? relBefore.history.length : 0;

    engine.tick();

    const relAfter = engine.world.socialGraph.getRelationship('alice', 'bob');
    expect(relAfter).not.toBeNull();
    expect(relAfter.interactionCount).toBe(countBefore + 1);
    expect(relAfter.history.length).toBe(historyBefore + 1);

    // history time is simTime (not Date.now)
    const lastEntry = relAfter.history[relAfter.history.length - 1];
    const simTime = engine.world.time.getTime();
    const entryTime = new Date(lastEntry.time).getTime();
    expect(Math.abs(entryTime - simTime)).toBeLessThan(60000);

    // trace and event present
    const trace = alice._actionTraceHistory[0];
    expect(trace.selectedAction).toBe('socialize');
    expect(trace.stateDeltas.relationship).not.toBeNull();
    expect(trace.stateDeltas.relationship.targetAgentId).toBe('bob');

    const events = aliceActionEvents(engine);
    expect(events.length).toBe(1);
    expect(events[0].stateDeltas.relationship.targetAgentId).toBe('bob');
  });

  // ─── 2. dryRunEffects socialize: same delta, relationship NOT mutated ───
  it('dryRunEffects socialize: delta computed, relationship unchanged', () => {
    // R20: use a seed where alice and bob stay co-located after IM-driven movement.
    // The P0 fix (seed-dependent IM exploration) now makes agents move to different
    // regions with different seeds, so encounters only happen when co-located.
    // Seed 'rel-dry-2' keeps both agents in the same region after the first tick.
    const dry = createEngineWithTwoAgents('rel-dry-2', DRY_RUN);
    const alice = dry.getAgent('alice');
    const bob = dry.getAgent('bob');
    alice._candidateProviderManager = stubProvider([makeSocializeCandidate('bob')]);
    bob._candidateProviderManager = stubEmptyProvider();
    alice._socialGraphRef = dry.world.socialGraph;

    // Pre-create relationship so test doesn't depend on encounter happening
    // (encounter probability varies with position / seed / IM drive)
    if (!dry.world.socialGraph.getRelationship('alice', 'bob')) {
      dry.world.socialGraph.getOrCreateRelationship('alice', 'bob');
    }

    const relBefore = dry.world.socialGraph.getRelationship('alice', 'bob');
    const countBefore = relBefore.interactionCount;

    dry.tick();

    const relAfter = dry.world.socialGraph.getRelationship('alice', 'bob');
    expect(relAfter).not.toBeNull();
    // dryRun does NOT mutate
    expect(relAfter.interactionCount).toBe(countBefore);

    // delta computed
    const trace = alice._actionTraceHistory[0];
    expect(trace.stateDeltas.relationship.targetAgentId).toBe('bob');
    expect(trace.stateDeltas.relationship.interactionType).toBe('action_socialize');
  });

  // ─── 3. Invalid target: no-op, no new node created ───
  it('active socialize: invalid target no-ops, no new SocialGraph node created', () => {
    const engine = createEngineWithTwoAgents('rel-invalid', ACTIVE);
    const alice = engine.getAgent('alice');
    const bob = engine.getAgent('bob');
    alice._candidateProviderManager = stubProvider([makeSocializeCandidate('nonexistent_agent')]);
    bob._candidateProviderManager = stubEmptyProvider();
    alice._socialGraphRef = engine.world.socialGraph;

    const nodesBefore = engine.world.socialGraph._adjacency.size;

    engine.tick();

    // no new node created
    expect(engine.world.socialGraph._adjacency.size).toBe(nodesBefore);

    // no relationship with nonexistent agent
    expect(engine.world.socialGraph.getRelationship('alice', 'nonexistent_agent')).toBeNull();

    // trace still recorded
    const trace = alice._actionTraceHistory[0];
    expect(trace.selectedAction).toBe('socialize');
    expect(trace.stateDeltas.relationship.targetAgentId).toBe('nonexistent_agent');
  });

  // ─── 4. Self target: no-op ───
  it('active socialize: self target no-ops, no self-relationship created', () => {
    const engine = createEngineWithTwoAgents('rel-self', ACTIVE);
    const alice = engine.getAgent('alice');
    const bob = engine.getAgent('bob');
    alice._candidateProviderManager = stubProvider([makeSocializeCandidate('alice')]);
    bob._candidateProviderManager = stubEmptyProvider();
    alice._socialGraphRef = engine.world.socialGraph;

    engine.tick();

    // no self-relationship
    const rel = engine.world.socialGraph.getRelationship('alice', 'alice');
    expect(rel).toBeNull();

    // trace still recorded
    const trace = alice._actionTraceHistory[0];
    expect(trace.selectedAction).toBe('socialize');
  });

  // ─── 5. Determinism: same seed → identical traces and relationship state ───
  it('same seed: identical traces and relationship state', () => {
    const e1 = createEngineWithTwoAgents('rel-det', ACTIVE);
    const e2 = createEngineWithTwoAgents('rel-det', ACTIVE);

    for (const engine of [e1, e2]) {
      const alice = engine.getAgent('alice');
      const bob = engine.getAgent('bob');
      alice._candidateProviderManager = stubProvider([makeSocializeCandidate('bob'), REST_CANDIDATE]);
      bob._candidateProviderManager = stubEmptyProvider();
      alice._socialGraphRef = engine.world.socialGraph;
    }

    for (let i = 0; i < 3; i++) {
      e1.tick();
      e2.tick();
    }

    const t1 = e1.getAgent('alice')._actionTraceHistory;
    const t2 = e2.getAgent('alice')._actionTraceHistory;
    expect(JSON.stringify(t1)).toBe(JSON.stringify(t2));

    const r1 = e1.world.socialGraph.getRelationship('alice', 'bob');
    const r2 = e2.world.socialGraph.getRelationship('alice', 'bob');
    expect(r1.interactionCount).toBe(r2.interactionCount);
    expect(r1.strength).toBe(r2.strength);
  });

  // ─── 6. Tavern domain: valid socialize, no campus forbidden terms ───
  it('tavern domain: valid socialize works, event contains no campus forbidden terms', () => {
    const engine = createEngineWithTwoAgents('rel-tavern', ACTIVE, tavernDomain);
    const alice = engine.getAgent('alice');
    const bob = engine.getAgent('bob');
    alice._candidateProviderManager = stubProvider([makeSocializeCandidate('bob')]);
    bob._candidateProviderManager = stubEmptyProvider();
    alice._socialGraphRef = engine.world.socialGraph;

    engine.tick();

    const rel = engine.world.socialGraph.getRelationship('alice', 'bob');
    expect(rel).not.toBeNull();
    expect(rel.interactionCount).toBeGreaterThan(0);

    const events = aliceActionEvents(engine);
    expect(events.length).toBe(1);

    const text = JSON.stringify(events);
    for (const term of tavernDomain.forbiddenTerms) {
      expect(text).not.toContain(term);
    }
  });

  // ─── 7. Non-socialize actions: no relationship mutation vs dryRun baseline ───
  it('rest: relationship interactionCount unchanged vs dryRun baseline', () => {
    const baseline = createEngineWithTwoAgents('rel-nonrel-base', DRY_RUN);
    const active = createEngineWithTwoAgents('rel-nonrel-act', ACTIVE);

    for (const engine of [baseline, active]) {
      const alice = engine.getAgent('alice');
      const bob = engine.getAgent('bob');
      alice._candidateProviderManager = stubProvider([REST_CANDIDATE]);
      bob._candidateProviderManager = stubEmptyProvider();
      alice._socialGraphRef = engine.world.socialGraph;
    }

    baseline.tick();
    active.tick();

    // rest produces no relationship delta
    const actTrace = active.getAgent('alice')._actionTraceHistory[0];
    expect(actTrace.stateDeltas.relationship).toBeNull();

    // relationship interactionCount matches baseline
    const baseRel = baseline.world.socialGraph.getRelationship('alice', 'bob');
    const actRel = active.world.socialGraph.getRelationship('alice', 'bob');
    if (baseRel) {
      expect(actRel).not.toBeNull();
      expect(actRel.interactionCount).toBe(baseRel.interactionCount);
    }
  });

  // ─── 8. action_selected remains internal, not perceived next tick ───
  it('socialize action_selected is internal and not perceived on next tick', () => {
    const engine = createEngineWithTwoAgents('rel-internal', ACTIVE);
    const alice = engine.getAgent('alice');
    const bob = engine.getAgent('bob');
    alice._candidateProviderManager = stubProvider([makeSocializeCandidate('bob')]);
    bob._candidateProviderManager = stubEmptyProvider();
    alice._socialGraphRef = engine.world.socialGraph;

    engine.tick();

    const events = aliceActionEvents(engine);
    expect(events.length).toBe(1);
    expect(events[0].scope).toBe('internal');

    const recentEvents = engine.world.eventDispatcher.eventLog.slice(-10);
    const perceived = engine.world.eventDispatcher.filterEventsForAgent('alice', recentEvents);
    expect(perceived.some(e => e.type === 'action_selected')).toBe(false);
  });
});
