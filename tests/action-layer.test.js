/**
 * Phase 7: Action Layer Hardening — Tests
 *
 * Tests for:
 *   - ActionCandidate deterministic ID
 *   - SelectedAction structure
 *   - ReasonTrace completeness
 *   - Purity (no state modification)
 *   - Canonical src/action implementation behavior
 */

import { describe, it, expect } from 'vitest';

const path = require('path');
const ROOT = process.cwd();

// ═══════════════════════════════════════════
// src/action/ — new formalized types
// ═══════════════════════════════════════════

const {
  ActionCandidate,
  ACTION_TYPES,
  CANDIDATE_SOURCES,
  makeCandidateId,
  SelectedAction,
  ReasonTrace,
  scoreCandidate,
  scoreCandidates,
  selectAction,
  CandidateProvider,
  CandidateProviderManager,
} = require('../src/action');

// ═══════════════════════════════════════════
// ActionCandidate tests
// ═══════════════════════════════════════════

describe('ActionCandidate', () => {
  it('creates with deterministic ID', () => {
    const a = new ActionCandidate({ type: 'rest', source: 'need', target: 'energy' });
    const b = new ActionCandidate({ type: 'rest', source: 'need', target: 'energy' });
    expect(a.id).toBe(b.id);
    expect(a.id).toBe('cand_need_rest_energy');
  });

  it('different targets produce different IDs', () => {
    const a = new ActionCandidate({ type: 'move', source: 'schedule', target: 'library' });
    const b = new ActionCandidate({ type: 'move', source: 'schedule', target: 'cafe' });
    expect(a.id).not.toBe(b.id);
  });

  it('rejects invalid action type', () => {
    expect(() => new ActionCandidate({ type: 'fly', source: 'need' })).toThrow('Invalid action type');
  });

  it('rejects invalid source', () => {
    expect(() => new ActionCandidate({ type: 'rest', source: 'telepathy' })).toThrow('Invalid candidate source');
  });

  it('defaults target to null', () => {
    const c = new ActionCandidate({ type: 'rest', source: 'need' });
    expect(c.target).toBeNull();
  });

  it('generates label when not provided', () => {
    const c = new ActionCandidate({ type: 'rest', source: 'need', target: 'energy' });
    expect(c.label).toBe('need:rest→energy');
  });

  it('preserves custom label', () => {
    const c = new ActionCandidate({ type: 'rest', source: 'need', label: 'custom label' });
    expect(c.label).toBe('custom label');
  });

  it('deep-clones constraints and metadata', () => {
    const constraints = { timeRange: [9, 17] };
    const metadata = { needKey: 'hunger' };
    const c = new ActionCandidate({ type: 'consume', source: 'need', constraints, metadata });
    constraints.timeRange[0] = 0;
    metadata.needKey = 'changed';
    expect(c.constraints.timeRange[0]).toBe(9);
    expect(c.metadata.needKey).toBe('hunger');
  });

  it('toJSON returns plain object', () => {
    const c = new ActionCandidate({ type: 'rest', source: 'need', target: 'energy' });
    const json = c.toJSON();
    expect(json.id).toBe(c.id);
    expect(json.type).toBe('rest');
    expect(typeof json).toBe('object');
    expect(json.constructor).toBe(Object);
  });
});

// ═══════════════════════════════════════════
// SelectedAction tests
// ═══════════════════════════════════════════

describe('SelectedAction', () => {
  it('delegates type/target/source/label to candidate', () => {
    const candidate = new ActionCandidate({ type: 'work', source: 'schedule', target: 'office', label: 'work at office' });
    const selected = new SelectedAction({
      candidate,
      score: { total: 0.8 },
      temperature: 0.3,
      alternatives: [],
      reasonTrace: {},
    });
    expect(selected.type).toBe('work');
    expect(selected.target).toBe('office');
    expect(selected.source).toBe('schedule');
    expect(selected.label).toBe('work at office');
  });

  it('stores score, temperature, alternatives, reasonTrace', () => {
    const candidate = new ActionCandidate({ type: 'rest', source: 'need' });
    const trace = new ReasonTrace({
      agentId: 'agent1',
      candidate,
      scoreBreakdown: { total: 0.5 },
      keyReasons: ['need-drive'],
    });
    const selected = new SelectedAction({
      candidate,
      score: { total: 0.5, need: 0.5 },
      temperature: 0.5,
      alternatives: [{ candidate, score: { total: 0.3 } }],
      reasonTrace: trace,
    });
    expect(selected.score.total).toBe(0.5);
    expect(selected.temperature).toBe(0.5);
    expect(selected.alternatives).toHaveLength(1);
    expect(selected.reasonTrace).toBe(trace);
  });

  it('toJSON returns plain object', () => {
    const candidate = new ActionCandidate({ type: 'rest', source: 'need' });
    const selected = new SelectedAction({
      candidate,
      score: { total: 0.5 },
      temperature: 0.5,
      alternatives: [],
      reasonTrace: {},
    });
    const json = selected.toJSON();
    expect(json.candidate.type).toBe('rest');
    expect(json.score.total).toBe(0.5);
  });
});

// ═══════════════════════════════════════════
// ReasonTrace tests
// ═══════════════════════════════════════════

describe('ReasonTrace', () => {
  it('stores all fields', () => {
    const candidate = new ActionCandidate({ type: 'explore', source: 'intrinsic' });
    const trace = new ReasonTrace({
      agentId: 'agent1',
      candidate,
      scoreBreakdown: { total: 0.7, need: 0.3, emotion: 0.4 },
      keyReasons: ['need-drive', 'emotion-influence'],
      pressureContext: { needs: { hunger: 0.8 } },
      rngInfo: { rngStateBefore: 42, randomDraw: 0.5, rngStateAfter: 43 },
      temperature: 0.3,
      candidateAlternatives: [{ candidate, score: { total: 0.7 } }],
    });

    expect(trace.agentId).toBe('agent1');
    expect(trace.candidate).toBe(candidate);
    expect(trace.scoreBreakdown.total).toBe(0.7);
    expect(trace.keyReasons).toEqual(['need-drive', 'emotion-influence']);
    expect(trace.pressureContext.needs.hunger).toBe(0.8);
    expect(trace.rngInfo.rngStateBefore).toBe(42);
    expect(trace.temperature).toBe(0.3);
    expect(trace.candidateAlternatives).toHaveLength(1);
  });

  it('stateDeltas is null by default', () => {
    const trace = new ReasonTrace({
      agentId: 'agent1',
      candidate: null,
      scoreBreakdown: null,
      keyReasons: [],
    });
    expect(trace.stateDeltas).toBeNull();
  });

  it('stateDeltas can be set', () => {
    const trace = new ReasonTrace({
      agentId: 'agent1',
      candidate: null,
      scoreBreakdown: null,
      keyReasons: [],
    });
    trace.stateDeltas = { hunger: -0.2 };
    expect(trace.stateDeltas.hunger).toBe(-0.2);
  });

  it('toJSON returns plain object', () => {
    const trace = new ReasonTrace({
      agentId: 'agent1',
      candidate: null,
      scoreBreakdown: { total: 0 },
      keyReasons: ['test'],
    });
    const json = trace.toJSON();
    expect(json.agentId).toBe('agent1');
    expect(json.keyReasons).toEqual(['test']);
  });
});

// ═══════════════════════════════════════════
// Purity tests
// ═══════════════════════════════════════════

describe('Action layer purity', () => {
  it('scoreCandidate does not modify context', () => {
    const candidate = new ActionCandidate({ type: 'rest', source: 'need', target: 'energy' });
    const context = {
      needs: { energy: 0.2, hunger: 0.8 },
      emotion: { valence: -0.3, arousal: 0.1 },
      behaviorField: { B: [0.2, 0.3, 0.4, 0.5], label: 'resting' },
      agent: { position: 'library' },
      world: { time: Date.now() },
    };
    const contextBefore = JSON.parse(JSON.stringify(context));

    scoreCandidate(candidate, context);

    expect(JSON.stringify(context)).toBe(JSON.stringify(contextBefore));
  });

  it('scoreCandidates does not modify candidates or context', () => {
    const candidates = [
      new ActionCandidate({ type: 'rest', source: 'need' }),
      new ActionCandidate({ type: 'work', source: 'schedule' }),
    ];
    const context = {
      needs: { energy: 0.2 },
      behaviorField: { B: [0.5, 0.5, 0.5, 0.5] },
    };
    const candidatesBefore = JSON.parse(JSON.stringify(candidates));
    const contextBefore = JSON.parse(JSON.stringify(context));

    scoreCandidates(candidates, context);

    expect(JSON.stringify(candidates)).toBe(JSON.stringify(candidatesBefore));
    expect(JSON.stringify(context)).toBe(JSON.stringify(contextBefore));
  });

  it('selectAction does not modify scored candidates', () => {
    const candidate = new ActionCandidate({ type: 'rest', source: 'need' });
    const scored = [
      { candidate, score: { total: 0.5, need: 0.5, emotion: 0, behavior: 0, memory: 0, relationship: 0, habit: 0, goal: 0, location: 0, world: 0, time: 0, constraint: 0, tendency: 0 } },
    ];
    const scoredBefore = JSON.parse(JSON.stringify(scored));

    selectAction(scored, { temperature: 0 });

    expect(JSON.stringify(scored)).toBe(JSON.stringify(scoredBefore));
  });

  it('CandidateProviderManager.generateAll does not modify context', () => {
    const manager = new CandidateProviderManager();
    const context = {
      behaviorField: { B: [0.2, 0.3, 0.4, 0.5], label: 'resting' },
      needs: { energy: 0.2 },
      relationships: [{ strength: 0.5 }],
    };
    const contextBefore = JSON.parse(JSON.stringify(context));

    manager.generateAll(context);

    expect(JSON.stringify(context)).toBe(JSON.stringify(contextBefore));
  });
});

// ═══════════════════════════════════════════
// Determinism tests
// ═══════════════════════════════════════════

describe('Action layer determinism', () => {
  it('same inputs produce same ActionCandidate ID', () => {
    const a = new ActionCandidate({ type: 'work', source: 'schedule', target: 'office' });
    const b = new ActionCandidate({ type: 'work', source: 'schedule', target: 'office' });
    expect(a.id).toBe(b.id);
  });

  it('scoreCandidate is deterministic', () => {
    const candidate = new ActionCandidate({ type: 'rest', source: 'need', target: 'energy' });
    const context = {
      needs: { energy: 0.2 },
      behaviorField: { B: [0.2, 0.3, 0.4, 0.5] },
    };

    const s1 = scoreCandidate(candidate, context);
    const s2 = scoreCandidate(candidate, context);

    expect(s1.total).toBe(s2.total);
    expect(JSON.stringify(s1)).toBe(JSON.stringify(s2));
  });

  it('selectAction with temperature=0 is argmax deterministic', () => {
    const c1 = new ActionCandidate({ type: 'rest', source: 'need' });
    const c2 = new ActionCandidate({ type: 'work', source: 'schedule' });
    const scored = [
      { candidate: c1, score: { total: 0.8, need: 0.8, emotion: 0, behavior: 0, memory: 0, relationship: 0, habit: 0, goal: 0, location: 0, world: 0, time: 0, constraint: 0, tendency: 0 } },
      { candidate: c2, score: { total: 0.3, need: 0, emotion: 0, behavior: 0, memory: 0, relationship: 0, habit: 0, goal: 0, location: 0, world: 0, time: 0.3, constraint: 0, tendency: 0 } },
    ];

    const r1 = selectAction(scored, { temperature: 0 });
    const r2 = selectAction(scored, { temperature: 0 });

    expect(r1.selected.id).toBe(r2.selected.id);
    expect(r1.selected.id).toBe(c1.id);
  });

  it('CandidateProviderManager.generateAll is deterministic', () => {
    const manager = new CandidateProviderManager();
    const context = {
      behaviorField: { B: [0.2, 0.3, 0.4, 0.5], label: 'resting' },
      needs: { energy: 0.2 },
    };

    const r1 = manager.generateAll(context);
    const r2 = manager.generateAll(context);

    expect(r1.length).toBe(r2.length);
    for (let i = 0; i < r1.length; i++) {
      expect(r1[i].id).toBe(r2[i].id);
    }
  });
});

// ═══════════════════════════════════════════
// SelectedAction integration with selectAction
// ═══════════════════════════════════════════

describe('SelectedAction integration', () => {
  it('selectAction returns trace that can construct SelectedAction', () => {
    const c1 = new ActionCandidate({ type: 'rest', source: 'need' });
    const c2 = new ActionCandidate({ type: 'work', source: 'schedule' });
    const scored = [
      { candidate: c1, score: { total: 0.8, need: 0.8, emotion: 0, behavior: 0, memory: 0, relationship: 0, habit: 0, goal: 0, location: 0, world: 0, time: 0, constraint: 0, tendency: 0 } },
      { candidate: c2, score: { total: 0.3, need: 0, emotion: 0, behavior: 0, memory: 0, relationship: 0, habit: 0, goal: 0, location: 0, world: 0, time: 0.3, constraint: 0, tendency: 0 } },
    ];

    const { selected, trace } = selectAction(scored, { temperature: 0 });

    const action = new SelectedAction({
      candidate: selected,
      score: trace.scoreBreakdown,
      temperature: trace.temperature,
      alternatives: trace.candidateAlternatives,
      reasonTrace: trace,
    });

    expect(action.type).toBe('rest');
    expect(action.score.total).toBe(0.8);
    expect(action.alternatives).toHaveLength(2);
    expect(action.reasonTrace).toBe(trace);
  });
});

// ═══════════════════════════════════════════
// CandidateProvider base class
// ═══════════════════════════════════════════

describe('CandidateProvider', () => {
  it('throws on unimplemented generate()', () => {
    const provider = new CandidateProvider('TestProvider');
    expect(() => provider.generate({})).toThrow('TestProvider.generate() not implemented');
  });
});
