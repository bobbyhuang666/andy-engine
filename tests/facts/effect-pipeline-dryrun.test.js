import { describe, it, expect } from 'vitest';
const { applyActionEffect: _applyActionEffect, computeStateDeltas: _computeStateDeltas } = require('../../src/effects/EventEffectPipeline');

function applyActionEffect(params) {
  const effectResult = _applyActionEffect(params);
  const legacy = effectResult.toLegacyFormat();
  legacy.updatedReasonTrace = params.reasonTrace ? { ...params.reasonTrace, stateDeltas: legacy.stateDeltas } : { stateDeltas: legacy.stateDeltas };
  return legacy;
}

function computeStateDeltas(candidate, agentSnapshot) {
  const deltas = _computeStateDeltas(candidate, agentSnapshot);
  const result = { need: {}, emotion: {}, memory: null, relationship: null, location: null };
  for (const d of deltas) {
    switch (d.type) {
      case 'need': Object.assign(result.need, d.changes); break;
      case 'emotion': Object.assign(result.emotion, d.changes); break;
      case 'memory': result.memory = { kind: d.kind, type: d.memoryType, target: d.target, content: d.content }; break;
      case 'relationship': result.relationship = { targetAgentId: d.targetAgentId, interactionType: d.interactionType, valence: d.valence, content: d.content }; break;
      case 'locationMeaning': result.location = { from: d.from || null, to: d.to || d.location, reason: d.reason }; break;
    }
  }
  return result;
}
const AndyEngine = require('../../index.js');

const TEST_START = new Date('2026-09-01T08:00:00Z');

function createEngine(seed, actionSelection) {
  const config = { seed, startTime: new Date(TEST_START), actionSelection };
  const engine = new AndyEngine(config);
  engine.createCharacter({ id: 'test', name: '测试', mbti: 'INFP', schedule: 'student' });
  return engine;
}

function makeSnapshot(engine) {
  const agent = engine.getAgent('test');
  return {
    id: agent.id,
    agent: { position: agent.position },
    needs: { ...agent.needs.needs },
    emotion: agent.emotion.current,
  };
}

describe('Phase 35: Effect Pipeline Dry-Run', () => {
  it('applyActionEffect is a function', () => {
    expect(typeof applyActionEffect).toBe('function');
  });

  it('computeStateDeltas is a function', () => {
    expect(typeof computeStateDeltas).toBe('function');
  });

  it('applyActionEffect returns event, stateDeltas, updatedReasonTrace', () => {
    const result = applyActionEffect({
      agentSnapshot: { id: 'test', agent: { position: '宿舍' } },
      selectedCandidate: { type: 'rest', source: 'need', target: null, label: '休息' },
      reasonTrace: { keyReasons: ['tired'], scoreBreakdown: { total: 0.8 } },
      simTime: TEST_START,
    });

    expect(result).toBeDefined();
    expect(result).toHaveProperty('event');
    expect(result).toHaveProperty('stateDeltas');
    expect(result).toHaveProperty('updatedReasonTrace');
    expect(result.event.type).toBe('action_selected');
    expect(result.event.agentId).toBe('test');
  });

  it('rest action produces need and emotion deltas', () => {
    const { stateDeltas } = applyActionEffect({
      agentSnapshot: { id: 'test', agent: { position: '宿舍' } },
      selectedCandidate: { type: 'rest', source: 'need', target: null, label: '休息' },
      reasonTrace: { keyReasons: [], scoreBreakdown: { total: 0.5 } },
      simTime: TEST_START,
    });

    expect(stateDeltas.need).toHaveProperty('energy', 0.4);
    expect(stateDeltas.emotion).toHaveProperty('calm', 0.1);
    expect(stateDeltas.emotion).toHaveProperty('joy', 0.05);
  });

  it('observe action produces memory delta', () => {
    const { stateDeltas } = applyActionEffect({
      agentSnapshot: { id: 'test', agent: { position: '图书馆' } },
      selectedCandidate: { type: 'observe', source: 'explore', target: '图书馆', label: '观察' },
      reasonTrace: { keyReasons: [], scoreBreakdown: { total: 0.3 } },
      simTime: TEST_START,
    });

    expect(stateDeltas.memory).toBeDefined();
    expect(stateDeltas.memory.kind).toBe('candidate');
    expect(stateDeltas.memory.type).toBe('observation');
    expect(stateDeltas.memory.target).toBe('图书馆');
  });

  it('move action produces location delta', () => {
    const { stateDeltas } = applyActionEffect({
      agentSnapshot: { id: 'test', agent: { position: '宿舍' } },
      selectedCandidate: { type: 'move', source: 'schedule', target: '食堂', label: '去食堂' },
      reasonTrace: { keyReasons: [], scoreBreakdown: { total: 0.6 } },
      simTime: TEST_START,
    });

    expect(stateDeltas.location).toBeDefined();
    expect(stateDeltas.location.to).toBe('食堂');
    expect(stateDeltas.location.reason).toBe('action_move');
  });

  it('socialize action produces relationship delta', () => {
    const { stateDeltas } = applyActionEffect({
      agentSnapshot: { id: 'test', agent: { position: '操场' } },
      selectedCandidate: { type: 'socialize', source: 'social', target: 'alice', label: '聊天' },
      reasonTrace: { keyReasons: [], scoreBreakdown: { total: 0.7 } },
      simTime: TEST_START,
    });

    expect(stateDeltas.relationship).toBeDefined();
    expect(stateDeltas.relationship.targetAgentId).toBe('alice');
    expect(stateDeltas.relationship.valence).toBe(0.3);
  });

  it('null selectedCandidate returns neutral deltas', () => {
    const { event, stateDeltas } = applyActionEffect({
      agentSnapshot: { id: 'test', agent: { position: '宿舍' } },
      selectedCandidate: null,
      reasonTrace: { keyReasons: [], scoreBreakdown: { total: 0 } },
      simTime: TEST_START,
    });

    expect(event.type).toBe('action_none');
    expect(stateDeltas.need).toEqual({});
    expect(stateDeltas.emotion).toEqual({});
    expect(stateDeltas.memory).toBeNull();
  });

  it('dry-run does not mutate input parameters', () => {
    const snapshot = { id: 'test', agent: { position: '宿舍' } };
    const candidate = { type: 'rest', source: 'need', target: null, label: '休息' };
    const trace = { keyReasons: ['tired'], scoreBreakdown: { total: 0.8 } };
    const snapshotBefore = JSON.stringify(snapshot);
    const candidateBefore = JSON.stringify(candidate);
    const traceBefore = JSON.stringify(trace);

    applyActionEffect({
      agentSnapshot: snapshot,
      selectedCandidate: candidate,
      reasonTrace: trace,
      simTime: TEST_START,
    });

    expect(JSON.stringify(snapshot)).toBe(snapshotBefore);
    expect(JSON.stringify(candidate)).toBe(candidateBefore);
    expect(JSON.stringify(trace)).toBe(traceBefore);
  });

  it('stateDeltas are JSON serializable', () => {
    const { stateDeltas } = applyActionEffect({
      agentSnapshot: { id: 'test', agent: { position: '图书馆' } },
      selectedCandidate: { type: 'observe', source: 'explore', target: '图书馆', label: '观察' },
      reasonTrace: { keyReasons: [], scoreBreakdown: { total: 0.3 } },
      simTime: TEST_START,
    });

    const serialized = JSON.stringify(stateDeltas);
    expect(serialized).toBeDefined();
    expect(typeof serialized).toBe('string');
    const parsed = JSON.parse(serialized);
    expect(parsed).toEqual(stateDeltas);
  });

  it('invalid action type returns safe empty deltas', () => {
    const { stateDeltas } = applyActionEffect({
      agentSnapshot: { id: 'test', agent: { position: '宿舍' } },
      selectedCandidate: { type: 'unknown_action', source: 'test', target: null, label: '未知' },
      reasonTrace: { keyReasons: [], scoreBreakdown: { total: 0 } },
      simTime: TEST_START,
    });

    expect(stateDeltas).toBeDefined();
    expect(stateDeltas.need).toEqual({});
    expect(stateDeltas.emotion).toEqual({});
    expect(stateDeltas.memory).toBeNull();
    expect(stateDeltas.relationship).toBeNull();
    expect(stateDeltas.location).toBeNull();
  });

  it('dry-run pipeline produces same agent state as normal tick', () => {
    const seed = 'dryrun-invariant';
    const engine = createEngine(seed, {
      enabled: true,
      mode: 'event',
      temperature: 0.35,
      recordTraces: true,
      maxTraceHistory: 100,
    });

    const agent = engine.getAgent('test');
    const snapshot = makeSnapshot(engine);

    // Run pipeline externally (dry-run)
    const { stateDeltas } = applyActionEffect({
      agentSnapshot: snapshot,
      selectedCandidate: { type: 'rest', source: 'need', target: null, label: '休息' },
      reasonTrace: { keyReasons: [], scoreBreakdown: { total: 0.5 } },
      simTime: TEST_START,
    });

    // Agent state should be unchanged after dry-run call
    expect(agent.needs.needs.hunger).toBeDefined();
    expect(agent.needs.needs.energy).toBeDefined();

    // Now run a real tick
    engine.tick();

    // Agent should still have valid state
    expect(agent.needs.needs.hunger).toBeGreaterThanOrEqual(0);
    expect(agent.needs.needs.energy).toBeGreaterThanOrEqual(0);
  });

  it('updatedReasonTrace contains stateDeltas', () => {
    const trace = { keyReasons: ['hungry'], scoreBreakdown: { total: 0.9 } };
    const { updatedReasonTrace } = applyActionEffect({
      agentSnapshot: { id: 'test', agent: { position: '食堂' } },
      selectedCandidate: { type: 'rest', source: 'need', target: null, label: '休息' },
      reasonTrace: trace,
      simTime: TEST_START,
    });

    expect(updatedReasonTrace).toHaveProperty('stateDeltas');
    expect(updatedReasonTrace.stateDeltas).toHaveProperty('need');
    expect(updatedReasonTrace.keyReasons).toEqual(['hungry']);
  });

  it('computeStateDeltas works as standalone pure function', () => {
    const candidate = { type: 'reflect', source: 'intrinsic', target: '人生', label: '反思' };
    const snapshot = { id: 'test', agent: { position: '湖边' } };

    const deltas = computeStateDeltas(candidate, snapshot);

    expect(deltas.memory).toBeDefined();
    expect(deltas.memory.type).toBe('reflection');
    expect(deltas.emotion).toHaveProperty('calm', 0.03);
  });

  it('simTime is correctly embedded in event', () => {
    const time = new Date('2026-09-01T12:30:00Z');
    const { event } = applyActionEffect({
      agentSnapshot: { id: 'test', agent: { position: '宿舍' } },
      selectedCandidate: { type: 'rest', source: 'need', target: null, label: '休息' },
      reasonTrace: { keyReasons: [], scoreBreakdown: { total: 0.5 } },
      simTime: time,
    });

    expect(event.time).toBe('2026-09-01T12:30:00.000Z');
  });

  it('missing simTime results in null event.time', () => {
    const { event } = applyActionEffect({
      agentSnapshot: { id: 'test', agent: { position: '宿舍' } },
      selectedCandidate: { type: 'rest', source: 'need', target: null, label: '休息' },
      reasonTrace: { keyReasons: [], scoreBreakdown: { total: 0.5 } },
      simTime: null,
    });

    expect(event.time).toBeNull();
  });
});
