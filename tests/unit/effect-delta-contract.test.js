/**
 * Phase 5: Effect Result and Delta Contract tests
 *
 * Tests for:
 *   - StateDelta type hierarchy
 *   - EffectResult container
 *   - EffectCommitter dispatch
 *   - Typed pipeline functions
 *   - Backward compatibility (legacy format)
 *
 * Note: instanceof checks only work when class and instance share the same
 * require context.  For pipeline-produced instances (CJS), we use the `type`
 * discriminator instead.
 */

import { describe, it, expect, vi } from 'vitest';
import { StateDelta } from '../../src/effects/StateDelta.js';
import { NeedDelta } from '../../src/effects/NeedDelta.js';
import { EmotionDelta } from '../../src/effects/EmotionDelta.js';
import { MemoryDelta } from '../../src/effects/MemoryDelta.js';
import { RelationshipDelta } from '../../src/effects/RelationshipDelta.js';
import { LocationMeaningDelta } from '../../src/effects/LocationMeaningDelta.js';
import { FutureTendencyDelta } from '../../src/effects/FutureTendencyDelta.js';
import { EffectResult } from '../../src/effects/EffectResult.js';
import { EffectCommitter } from '../../src/effects/EffectCommitter.js';
import { applyActionEffect, computeDeltas, applyEventConsequences } from '../../src/effects/EventEffectPipeline.js';

const TEST_TIME = new Date('2026-09-01T14:00:00Z');

// ─── StateDelta types ───

describe('Phase 5: StateDelta type hierarchy', () => {
  it('StateDelta is the base class', () => {
    const d = new StateDelta('test', 'agent', 'a1');
    expect(d.type).toBe('test');
    expect(d.target).toBe('agent');
    expect(d.agentId).toBe('a1');
    expect(d.timestamp).toBeNull();
  });

  it('NeedDelta has correct type discriminator', () => {
    const d = new NeedDelta('a1', { energy: 0.4 });
    expect(d.type).toBe('need');
    expect(d.target).toBe('agent');
    expect(d.changes).toEqual({ energy: 0.4 });
  });

  it('EmotionDelta has correct type discriminator', () => {
    const d = new EmotionDelta('a1', { calm: 0.1, joy: 0.05 });
    expect(d.type).toBe('emotion');
    expect(d.changes).toEqual({ calm: 0.1, joy: 0.05 });
  });

  it('MemoryDelta has correct type discriminator', () => {
    const d = new MemoryDelta('a1', { kind: 'candidate', type: 'observation', target: 'lib', content: 'see' });
    expect(d.type).toBe('memory');
    expect(d.kind).toBe('candidate');
    expect(d.memoryType).toBe('observation');
    expect(d.target).toBe('lib');
    expect(d.content).toBe('see');
  });

  it('RelationshipDelta has correct type discriminator', () => {
    const d = new RelationshipDelta('a1', { targetAgentId: 'a2', interactionType: 'socialize', valence: 0.3, content: 'hi' });
    expect(d.type).toBe('relationship');
    expect(d.targetAgentId).toBe('a2');
    expect(d.valence).toBe(0.3);
  });

  it('LocationMeaningDelta has correct type discriminator', () => {
    const d = new LocationMeaningDelta('a1', { location: 'lib', meaningType: 'study', weight: 0.5, reason: 'event' });
    expect(d.type).toBe('locationMeaning');
    expect(d.target).toBe('world');
    expect(d.location).toBe('lib');
  });

  it('FutureTendencyDelta has correct type discriminator', () => {
    const d = new FutureTendencyDelta('a1', { location: 'cafe', delta: [0.1, 0, 0, 0], importance: 0.5 });
    expect(d.type).toBe('futureTendency');
    expect(d.target).toBe('agent');
    expect(d.delta).toEqual([0.1, 0, 0, 0]);
  });

  it('all deltas have toJSON()', () => {
    const deltas = [
      new NeedDelta('a1', { energy: 0.4 }),
      new EmotionDelta('a1', { calm: 0.1 }),
      new MemoryDelta('a1', { kind: 'candidate', type: 'obs', target: null, content: 'x' }),
      new RelationshipDelta('a1', { targetAgentId: 'a2', interactionType: 's', valence: 0.1, content: '' }),
      new LocationMeaningDelta(null, { location: 'l', meaningType: 'm', weight: 0.5, reason: 'r' }),
      new FutureTendencyDelta('a1', { location: 'l', delta: [0, 0, 0, 0], importance: 0.3 }),
    ];
    for (const d of deltas) {
      const json = d.toJSON();
      expect(json).toHaveProperty('type');
      expect(json).toHaveProperty('target');
    }
  });
});

// ─── EffectResult ───

describe('Phase 5: EffectResult container', () => {
  it('constructs with event, deltas, reasonTrace', () => {
    const r = new EffectResult({
      event: { type: 'test' },
      deltas: [new NeedDelta('a1', { energy: 0.4 })],
      reasonTrace: { keyReasons: [] },
    });
    expect(r.event.type).toBe('test');
    expect(r.deltas).toHaveLength(1);
    expect(r.reasonTrace.keyReasons).toEqual([]);
  });

  it('hasChanges reflects delta count', () => {
    expect(new EffectResult({ event: {}, deltas: [], reasonTrace: {} }).hasChanges).toBe(false);
    expect(new EffectResult({ event: {}, deltas: [new NeedDelta('a1', {})], reasonTrace: {} }).hasChanges).toBe(true);
  });

  it('memoryDeltas filters by type discriminator', () => {
    const r = new EffectResult({
      event: {},
      deltas: [
        new NeedDelta('a1', { energy: 0.4 }),
        new MemoryDelta('a1', { kind: 'candidate', type: 'obs', target: null, content: 'x' }),
        new EmotionDelta('a1', { calm: 0.1 }),
      ],
      reasonTrace: {},
    });
    expect(r.memoryDeltas).toHaveLength(1);
    expect(r.memoryDeltas[0].type).toBe('memory');
  });

  it('relationshipDeltas filters correctly', () => {
    const r = new EffectResult({
      event: {},
      deltas: [
        new RelationshipDelta('a1', { targetAgentId: 'a2', interactionType: 's', valence: 0.1, content: '' }),
      ],
      reasonTrace: {},
    });
    expect(r.relationshipDeltas).toHaveLength(1);
    expect(r.relationshipDeltas[0].type).toBe('relationship');
  });

  it('needDeltas, emotionDeltas, locationMeaningDeltas, futureTendencyDeltas', () => {
    const r = new EffectResult({
      event: {},
      deltas: [
        new NeedDelta('a1', { energy: 0.4 }),
        new EmotionDelta('a1', { calm: 0.1 }),
        new LocationMeaningDelta(null, { location: 'l', meaningType: 'm', weight: 0.5, reason: 'r' }),
        new FutureTendencyDelta('a1', { location: 'l', delta: [0, 0, 0, 0], importance: 0.3 }),
      ],
      reasonTrace: {},
    });
    expect(r.needDeltas).toHaveLength(1);
    expect(r.emotionDeltas).toHaveLength(1);
    expect(r.locationMeaningDeltas).toHaveLength(1);
    expect(r.futureTendencyDeltas).toHaveLength(1);
  });

  it('toLegacyFormat converts deltas back to old shape', () => {
    const r = new EffectResult({
      event: { type: 'action_selected' },
      deltas: [
        new NeedDelta('a1', { energy: 0.4 }),
        new EmotionDelta('a1', { calm: 0.1, joy: 0.05 }),
        new MemoryDelta('a1', { kind: 'candidate', type: 'observation', target: 'lib', content: 'see' }),
        new RelationshipDelta('a1', { targetAgentId: 'a2', interactionType: 'socialize', valence: 0.3, content: 'hi' }),
      ],
      reasonTrace: { keyReasons: ['r1'] },
    });

    const legacy = r.toLegacyFormat();
    expect(legacy.event.type).toBe('action_selected');
    expect(legacy.stateDeltas.need).toEqual({ energy: 0.4 });
    expect(legacy.stateDeltas.emotion).toEqual({ calm: 0.1, joy: 0.05 });
    expect(legacy.stateDeltas.memory).toEqual({ kind: 'candidate', type: 'observation', target: 'lib', content: 'see' });
    expect(legacy.stateDeltas.relationship).toEqual({ targetAgentId: 'a2', interactionType: 'socialize', valence: 0.3, content: 'hi' });
    expect(legacy.updatedReasonTrace.keyReasons).toEqual(['r1']);
  });
});

// ─── EffectCommitter ───

describe('Phase 5: EffectCommitter', () => {
  function makeMockAgents() {
    const agents = new Map();
    const agent = {
      id: 'a1',
      needs: { needs: { energy: 0.5, hunger: 0.5 } },
      emotion: { applyEffect: vi.fn() },
      memory: { addExperience: vi.fn() },
      socialGraph: {
        hasAgent: (id) => id === 'a1' || id === 'a2',
        getOrCreateRelationship: () => ({ recordInteraction: vi.fn() }),
      },
      futureTendency: { updateTendency: vi.fn() },
    };
    agents.set('a1', agent);
    return agents;
  }

  function makeMockWorld() {
    return {
      time: TEST_TIME,
      factStore: { updateLocationMeaning: vi.fn() },
    };
  }

  it('commit sets timestamp on each delta', () => {
    const agents = makeMockAgents();
    const world = makeMockWorld();
    const committer = new EffectCommitter({ world, agents });

    const d1 = new NeedDelta('a1', { energy: 0.4 });
    const d2 = new EmotionDelta('a1', { calm: 0.1 });
    const result = new EffectResult({ event: {}, deltas: [d1, d2], reasonTrace: {} });

    committer.commit(result);

    expect(d1.timestamp).toBe(TEST_TIME);
    expect(d2.timestamp).toBe(TEST_TIME);
  });

  it('commit applies need deltas to agent', () => {
    const agents = makeMockAgents();
    const world = makeMockWorld();
    const committer = new EffectCommitter({ world, agents });

    const result = new EffectResult({
      event: {},
      deltas: [new NeedDelta('a1', { energy: 0.4 })],
      reasonTrace: {},
    });

    committer.commit(result);
    expect(agents.get('a1').needs.needs.energy).toBe(0.9);
  });

  it('commit clamps need values to [0, 1]', () => {
    const agents = makeMockAgents();
    agents.get('a1').needs.needs.energy = 0.8;
    const world = makeMockWorld();
    const committer = new EffectCommitter({ world, agents });

    committer.commit(new EffectResult({
      event: {},
      deltas: [new NeedDelta('a1', { energy: 0.5 })],
      reasonTrace: {},
    }));
    expect(agents.get('a1').needs.needs.energy).toBe(1.0);
  });

  it('commit applies emotion deltas via applyEffect', () => {
    const agents = makeMockAgents();
    const world = makeMockWorld();
    const committer = new EffectCommitter({ world, agents });

    committer.commit(new EffectResult({
      event: {},
      deltas: [new EmotionDelta('a1', { calm: 0.1 })],
      reasonTrace: {},
    }));
    expect(agents.get('a1').emotion.applyEffect).toHaveBeenCalledWith({ calm: 0.1 });
  });

  it('commit applies memory deltas via addExperience', () => {
    const agents = makeMockAgents();
    const world = makeMockWorld();
    const committer = new EffectCommitter({ world, agents });

    committer.commit(new EffectResult({
      event: {},
      deltas: [new MemoryDelta('a1', { kind: 'candidate', type: 'observation', target: 'lib', content: 'see' })],
      reasonTrace: {},
    }));
    expect(agents.get('a1').memory.addExperience).toHaveBeenCalled();
  });

  it('commit skips non-candidate memory deltas', () => {
    const agents = makeMockAgents();
    const world = makeMockWorld();
    const committer = new EffectCommitter({ world, agents });

    committer.commit(new EffectResult({
      event: {},
      deltas: [new MemoryDelta('a1', { kind: 'consolidated', type: 'event', target: null, content: 'x' })],
      reasonTrace: {},
    }));
    expect(agents.get('a1').memory.addExperience).not.toHaveBeenCalled();
  });

  it('commit applies relationship deltas', () => {
    const agents = makeMockAgents();
    const world = makeMockWorld();
    const committer = new EffectCommitter({ world, agents });
    const relMock = { recordInteraction: vi.fn() };
    agents.get('a1').socialGraph.getOrCreateRelationship = () => relMock;

    committer.commit(new EffectResult({
      event: {},
      deltas: [new RelationshipDelta('a1', { targetAgentId: 'a2', interactionType: 'socialize', valence: 0.3, content: 'hi' })],
      reasonTrace: {},
    }));
    expect(relMock.recordInteraction).toHaveBeenCalledWith('socialize', 0.3, 'hi', TEST_TIME);
  });

  it('commit skips self-relationship deltas', () => {
    const agents = makeMockAgents();
    const world = makeMockWorld();
    const committer = new EffectCommitter({ world, agents });
    const relMock = { recordInteraction: vi.fn() };
    agents.get('a1').socialGraph.getOrCreateRelationship = () => relMock;

    committer.commit(new EffectResult({
      event: {},
      deltas: [new RelationshipDelta('a1', { targetAgentId: 'a1', interactionType: 'self', valence: 0, content: '' })],
      reasonTrace: {},
    }));
    expect(relMock.recordInteraction).not.toHaveBeenCalled();
  });

  it('commit applies location meaning deltas via factStore', () => {
    const agents = makeMockAgents();
    const world = makeMockWorld();
    const committer = new EffectCommitter({ world, agents });

    committer.commit(new EffectResult({
      event: {},
      deltas: [new LocationMeaningDelta(null, { location: 'lib', meaningType: 'study', weight: 0.5, reason: 'event' })],
      reasonTrace: {},
    }));
    expect(world.factStore.updateLocationMeaning).toHaveBeenCalledWith('lib', {
      type: 'study',
      weight: 0.5,
      reason: 'event',
    });
  });

  it('commit applies future tendency deltas', () => {
    const agents = makeMockAgents();
    const world = makeMockWorld();
    const committer = new EffectCommitter({ world, agents });

    committer.commit(new EffectResult({
      event: {},
      deltas: [new FutureTendencyDelta('a1', { location: 'cafe', delta: [0.1, 0, 0, 0], importance: 0.5 })],
      reasonTrace: {},
    }));
    expect(agents.get('a1').futureTendency.updateTendency).toHaveBeenCalledWith('cafe', [0.1, 0, 0, 0], 0.5);
  });

  it('commit handles null/missing agents gracefully', () => {
    const agents = new Map();
    const world = makeMockWorld();
    const committer = new EffectCommitter({ world, agents });

    expect(() => {
      committer.commit(new EffectResult({
        event: {},
        deltas: [new NeedDelta('missing', { energy: 0.4 })],
        reasonTrace: {},
      }));
    }).not.toThrow();
  });

  it('commit handles null effectResult gracefully', () => {
    const committer = new EffectCommitter({ world: makeMockWorld(), agents: makeMockAgents() });
    expect(() => committer.commit(null)).not.toThrow();
    expect(() => committer.commit(undefined)).not.toThrow();
  });

  it('commit returns diagnostics shape', () => {
    const agents = makeMockAgents();
    const world = makeMockWorld();
    const committer = new EffectCommitter({ world, agents });

    const result = committer.commit(new EffectResult({
      event: {},
      deltas: [new NeedDelta('a1', { energy: 0.4 })],
      reasonTrace: {},
    }));

    expect(result).toHaveProperty('applied');
    expect(result).toHaveProperty('skipped');
    expect(result).toHaveProperty('errors');
    expect(Array.isArray(result.applied)).toBe(true);
    expect(Array.isArray(result.skipped)).toBe(true);
    expect(Array.isArray(result.errors)).toBe(true);
  });

  it('commit reports valid deltas in applied', () => {
    const agents = makeMockAgents();
    const world = makeMockWorld();
    const committer = new EffectCommitter({ world, agents });

    const d1 = new NeedDelta('a1', { energy: 0.1 });
    const d2 = new EmotionDelta('a1', { calm: 0.05 });
    const result = committer.commit(new EffectResult({
      event: {},
      deltas: [d1, d2],
      reasonTrace: {},
    }));

    expect(result.applied).toHaveLength(2);
    expect(result.skipped).toHaveLength(0);
    expect(result.errors).toHaveLength(0);
  });

  it('commit reports unknown delta types in skipped', () => {
    const agents = makeMockAgents();
    const world = makeMockWorld();
    const committer = new EffectCommitter({ world, agents });

    const unknownDelta = { type: 'teleport', agentId: 'a1', timestamp: null };
    const result = committer.commit(new EffectResult({
      event: {},
      deltas: [unknownDelta],
      reasonTrace: {},
    }));

    expect(result.applied).toHaveLength(0);
    expect(result.skipped).toHaveLength(1);
    expect(result.skipped[0]).toBe(unknownDelta);
    expect(result.errors).toHaveLength(0);
  });

  it('commit mixes applied and skipped deltas', () => {
    const agents = makeMockAgents();
    const world = makeMockWorld();
    const committer = new EffectCommitter({ world, agents });

    const valid = new NeedDelta('a1', { energy: 0.1 });
    const unknown = { type: 'fake', agentId: 'a1', timestamp: null };
    const result = committer.commit(new EffectResult({
      event: {},
      deltas: [valid, unknown],
      reasonTrace: {},
    }));

    expect(result.applied).toHaveLength(1);
    expect(result.applied[0]).toBe(valid);
    expect(result.skipped).toHaveLength(1);
    expect(result.skipped[0]).toBe(unknown);
  });

  it('commit returns empty diagnostics for null input', () => {
    const committer = new EffectCommitter({ world: makeMockWorld(), agents: makeMockAgents() });

    const result = committer.commit(null);
    expect(result.applied).toHaveLength(0);
    expect(result.skipped).toHaveLength(0);
    expect(result.errors).toHaveLength(0);
  });

  it('commit position delta still applies correctly with diagnostics', () => {
    const agents = makeMockAgents();
    const agent = agents.get('a1');
    agent.position = 'cafe';
    const world = makeMockWorld();
    const committer = new EffectCommitter({ world, agents });

    const posDelta = { type: 'position', agentId: 'a1', to: 'library', timestamp: null };
    const result = committer.commit(new EffectResult({
      event: {},
      deltas: [posDelta],
      reasonTrace: {},
    }));

    expect(agent.position).toBe('library');
    expect(result.applied).toHaveLength(1);
    expect(result.applied[0]).toBe(posDelta);
  });
});

// ─── Typed pipeline ───

describe('Phase 5: typed pipeline functions', () => {
  it('applyActionEffect returns EffectResult', () => {
    const result = applyActionEffect({
      agentSnapshot: { id: 'a1' },
      selectedCandidate: { type: 'rest', source: 'need' },
      reasonTrace: { keyReasons: [], scoreBreakdown: { total: 0.5 } },
      simTime: TEST_TIME,
    });

    expect(result).toHaveProperty('event');
    expect(result).toHaveProperty('deltas');
    expect(result).toHaveProperty('reasonTrace');
    expect(result.event.type).toBe('action_selected');
    expect(result.deltas.length).toBeGreaterThan(0);
    expect(result.hasChanges).toBe(true);
  });

  it('computeDeltas returns array of deltas with type discriminators', () => {
    const deltas = computeDeltas({ type: 'rest', source: 'need' }, { id: 'a1' });
    expect(Array.isArray(deltas)).toBe(true);
    expect(deltas[0]).toHaveProperty('type');
    expect(deltas[0]).toHaveProperty('target');
  });

  it('rest produces need + emotion deltas', () => {
    const deltas = computeDeltas({ type: 'rest', source: 'need' }, { id: 'a1' });
    const needDeltas = deltas.filter(d => d.type === 'need');
    const emotionDeltas = deltas.filter(d => d.type === 'emotion');
    expect(needDeltas).toHaveLength(1);
    expect(needDeltas[0].changes.energy).toBe(0.4);
    expect(emotionDeltas).toHaveLength(1);
    expect(emotionDeltas[0].changes.calm).toBe(0.1);
  });

  it('observe produces memory delta', () => {
    const deltas = computeDeltas({ type: 'observe', source: 'explore', target: 'lib', label: 'see' }, { id: 'a1' });
    expect(deltas).toHaveLength(1);
    expect(deltas[0].type).toBe('memory');
    expect(deltas[0].memoryType).toBe('observation');
    expect(deltas[0].content).toBe('see');
  });

  it('reflect produces memory + emotion deltas', () => {
    const deltas = computeDeltas({ type: 'reflect', source: 'behaviorField', target: '', label: 'think' }, { id: 'a1' });
    expect(deltas.some(d => d.type === 'memory')).toBe(true);
    expect(deltas.some(d => d.type === 'emotion')).toBe(true);
  });

  it('move produces position and locationMeaning deltas', () => {
    // R20 M17: move now produces both PositionDelta and LocationMeaningDelta.
    // PositionDelta carries the actual position change; LocationMeaningDelta
    // carries the semantic meaning of the movement.
    const deltas = computeDeltas({ type: 'move', source: 'schedule', target: 'cafe' }, { id: 'a1' });
    expect(deltas).toHaveLength(2);
    const types = deltas.map(d => d.type);
    expect(types).toContain('position');
    expect(types).toContain('locationMeaning');
    const posDelta = deltas.find(d => d.type === 'position');
    expect(posDelta.to).toBe('cafe');
  });

  it('explore produces position and locationMeaning deltas', () => {
    const deltas = computeDeltas({ type: 'explore', source: 'intrinsic', target: 'library' }, { id: 'a1' });
    expect(deltas).toHaveLength(2);
    const types = deltas.map(d => d.type);
    expect(types).toContain('position');
    expect(types).toContain('locationMeaning');
  });

  it('socialize produces relationship delta', () => {
    const deltas = computeDeltas({ type: 'socialize', source: 'social', target: 'a2', label: 'hi' }, { id: 'a1' });
    expect(deltas).toHaveLength(1);
    expect(deltas[0].type).toBe('relationship');
    expect(deltas[0].targetAgentId).toBe('a2');
  });

  it('null candidate returns empty deltas', () => {
    const result = applyActionEffect({
      agentSnapshot: { id: 'a1' },
      selectedCandidate: null,
      reasonTrace: null,
      simTime: TEST_TIME,
    });
    expect(result.deltas).toHaveLength(0);
    expect(result.hasChanges).toBe(false);
  });
});
