import { describe, expect, it, vi } from 'vitest';
import AndyEngine from '../../index.js';
import { Character } from '../../sdk/index.js';
import { FactScope, FactSource, createEventFact, createObservationFact } from '../../facts/index.js';

const START = new Date('2026-09-01T08:00:00Z');

function makeEngine() {
  return new AndyEngine({
    enableFacts: true,
    seed: 'third-party-knowledge-chat',
    startTime: START,
  });
}

function addObservation(engine, overrides = {}) {
  const fact = createObservationFact({
    observerId: 'alice',
    targetId: 'bob',
    action: '正在酒馆里休息',
    context: '酒馆',
    timestamp: START,
    source: FactSource.OBSERVATION,
    confidence: 0.9,
    scope: FactScope.LOCAL,
    participants: ['alice', 'bob'],
    observers: ['alice'],
    ...overrides,
  });
  engine.world.factStore.addFact(fact);
  return fact;
}

function addToldEvent(engine) {
  const fact = createEventFact({
    eventId: 'third_party_recent_event',
    description: 'Bob在广场参加了集市',
    location: '广场',
    timestamp: START,
    source: FactSource.ENGINE,
    confidence: 1,
    scope: FactScope.LOCAL,
    participants: ['bob'],
    observers: [],
  });
  engine.world.factStore.addFact(fact);
  engine.world.knowledgeStore.addKnowledge('alice', fact.id, 'told');
  return fact;
}

function setup({ observation = true } = {}) {
  const engine = makeEngine();
  const provider = vi.fn(async () => 'Bob在想王冠。');
  const alice = new Character({
    id: 'alice', name: 'Alice', personality: 'INFP', engine, llm: provider,
  });
  engine.createCharacter({ id: 'bob', name: 'Bob', mbti: 'ESTJ', schedule: 'student' });
  const fact = observation ? addObservation(engine) : null;
  return { engine, alice, provider, fact };
}

describe('third-party knowledge Character.chat surface', () => {
  it('answers an observed third-party fact with a checker-bound factId', async () => {
    const { engine, alice, provider, fact } = setup();

    const reply = await alice.chat('Bob最近在做什么？');
    const checked = engine.checkConsistency(reply, 'alice');
    const sidecarChecked = engine.checkConsistency(reply, 'alice', {
      structuredClaims: [{
        type: 'event',
        subject: 'alice',
        predicate: 'observed',
        object: JSON.stringify([fact.targetId, fact.action, fact.context]),
        span: reply,
        confidence: 1,
      }],
    });

    expect(provider).not.toHaveBeenCalled();
    expect(reply).toContain('Bob');
    expect(reply).toContain(fact.action);
    expect(sidecarChecked.valid).toBe(true);
    expect(sidecarChecked.evidenceTrace.some((trace) => trace.factId === fact.id)).toBe(true);
    expect(checked.valid).toBe(true);
  });

  it('answers an observed third-party location with the same observation factId', async () => {
    const { engine, alice, provider, fact } = setup();

    const reply = await alice.chat('Bob在哪里？');
    const checked = engine.checkConsistency(reply, 'alice', {
      structuredClaims: [{
        type: 'event',
        subject: 'alice',
        predicate: 'observed',
        object: JSON.stringify([fact.targetId, fact.action, fact.context]),
        span: reply,
        confidence: 1,
      }],
    });

    expect(provider).not.toHaveBeenCalled();
    expect(reply).toContain('Bob');
    expect(reply).toContain(fact.context);
    expect(checked.valid).toBe(true);
    expect(checked.evidenceTrace.some((trace) => trace.factId === fact.id)).toBe(true);
  });

  it('answers from an explicitly told third-party event, not from hidden state', async () => {
    const { engine, alice, provider } = setup({ observation: false });
    const fact = addToldEvent(engine);

    const reply = await alice.chat('Bob最近发生了什么？');
    const checked = engine.checkConsistency(reply, 'alice', {
      structuredClaims: [{
        type: 'event',
        subject: 'alice',
        predicate: 'refers_to',
        object: fact.description,
        span: reply,
        confidence: 1,
      }],
    });

    expect(provider).not.toHaveBeenCalled();
    expect(reply).toContain(fact.description);
    expect(checked.valid).toBe(true);
    expect(checked.evidenceTrace.some((trace) => trace.factId === fact.id)).toBe(true);
  });

  it('returns epistemic unknown when the third party was not observed', async () => {
    const { engine, alice, provider } = setup({ observation: false });

    const reply = await alice.chat('Bob在哪里？');
    const checked = engine.checkConsistency(reply, 'alice');

    expect(provider).not.toHaveBeenCalled();
    expect(reply).toContain('不知道');
    expect(reply).not.toContain('酒馆');
    expect(checked.valid).toBe(true);
    expect((engine.getGroundingPackage('alice').forbiddenFacts || []).some((fact) =>
      fact.type === 'agent_state' && fact.agentId === 'bob'
    )).toBe(false);
  });

  it.each([
    'Bob在想什么？',
    'Bob感觉如何？',
    'Bob记得什么？',
    'Bob接下来打算做什么？',
  ])('never derives forbidden third-party internals from another agent: %s', async (question) => {
    const { engine, alice, provider } = setup();

    const reply = await alice.chat(question);
    const checked = engine.checkConsistency(reply, 'alice');

    expect(provider).not.toHaveBeenCalled();
    expect(reply).toContain('不知道');
    expect(reply).not.toContain('酒馆');
    expect(checked.valid).toBe(true);
  });
});
