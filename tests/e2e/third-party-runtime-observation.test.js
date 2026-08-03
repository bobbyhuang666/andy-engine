import { describe, expect, it, vi } from 'vitest';
import AndyEngine from '../../index.js';
import { Character } from '../../sdk/index.js';

const START = new Date('2026-09-01T08:00:00Z');

function setup() {
  const engine = new AndyEngine({
    enableFacts: true,
    seed: 'x',
    startTime: START,
    actionSelection: { enabled: false },
    events: { randomEventProbability: 0 },
  });
  const provider = vi.fn(async () => {
    throw new Error('provider must not be invoked for grounded third-party questions');
  });
  const alice = new Character({
    id: 'alice',
    name: 'Alice',
    personality: 'INFP',
    schedule: { entries: [] },
    initialPosition: '校园广场',
    engine,
    llm: provider,
  });
  engine.createCharacter({
    id: 'bob',
    name: 'Bob',
    mbti: 'ESTJ',
    schedule: { entries: [] },
    initialPosition: '校园广场',
  });
  return { engine, alice, provider };
}

function findRuntimeObservation(engine) {
  for (let tick = 0; tick < 6; tick++) {
    engine.tick();
    const grounding = engine.getGroundingPackage('alice');
    const fact = grounding.allowedFacts.find(candidate =>
      candidate.type === 'observation'
      && candidate.observerId === 'alice'
      && candidate.targetId === 'bob'
      && candidate.id
    );
    if (fact) return fact;
  }
  return null;
}

function setupNaturalAudit() {
  const engine = new AndyEngine({
    enableFacts: true,
    seed: 'natural-audit',
    startTime: START,
  });
  const provider = vi.fn(async () => {
    throw new Error('provider must not be invoked for grounded natural facts');
  });
  const alice = new Character({
    id: 'alice',
    name: 'Alice',
    personality: 'INFP',
    schedule: 'student',
    initialPosition: '校园广场',
    engine,
    llm: provider,
  });
  for (const [id, name] of [['bob', 'Bob'], ['carol', 'Carol'], ['dave', 'Dave'], ['erin', 'Erin']]) {
    engine.createCharacter({ id, name, mbti: 'ESTJ', schedule: 'student', initialPosition: '校园广场' });
  }
  return { engine, alice, provider };
}

function findNaturalAuditFacts(engine) {
  for (let tick = 0; tick < 288; tick++) {
    engine.tick();
    const facts = engine.getGroundingPackage('alice').allowedFacts;
    const selected = {
      observation: facts.find(fact => fact.type === 'observation' && fact.observerId === 'alice' && fact.id),
      relationship: facts.find(fact => fact.type === 'relationship' && fact.id
        && (fact.agentA === 'alice' || fact.agentB === 'alice')),
      memory: facts.find(fact => fact.type === 'memory' && fact.agentId === 'alice' && fact.id),
      intention: facts.find(fact => fact.type === 'intention' && fact.agentId === 'alice' && fact.id),
      event: facts.find(fact => fact.type === 'event' && fact.description && fact.id),
    };
    if (Object.values(selected).every(Boolean)) return selected;
  }
  return null;
}

describe('runtime-generated third-party observation grounding', () => {
  it('naturally rechecks observation, relationship, memory, intention, and event facts', async () => {
    const surfaces = [
      { key: 'memory', predicate: 'remembers', type: 'memory', question: () => '你记得什么？', value: fact => fact.content },
      { key: 'event', predicate: 'refers_to', type: 'event', question: () => '刚才发生了什么？', value: fact => fact.description },
      { key: 'observation', predicate: 'observed', type: 'observation', traceType: 'event', question: (fact, names) => `${names[fact.targetId]}最近在做什么？`, value: fact => fact.action },
      { key: 'relationship', predicate: 'is_relation', type: 'relationship', question: (fact, names) => `你和${names[fact.agentA === 'alice' ? fact.agentB : fact.agentA]}是什么关系？`, value: fact => fact.relationType },
      { key: 'intention', predicate: 'plans_to', type: 'intention', question: () => '你接下来打算做什么？', value: fact => fact.intent },
    ];

    for (const surface of surfaces) {
      const { engine, alice, provider } = setupNaturalAudit();
      const selected = findNaturalAuditFacts(engine);
      expect(selected, `natural-audit must produce all five fact categories before ${surface.key}`).toBeDefined();
      const targetFact = selected[surface.key];
      const names = engine.getGroundingPackage('alice').metadata.agentNames;
      const reply = await alice.chat(surface.question(targetFact, names));
      const check = engine.checkConsistency(reply, 'alice');

      expect(provider).not.toHaveBeenCalled();
      expect(check.valid).toBe(true);
      const trace = check.evidenceTrace.find(entry =>
        entry.type === (surface.traceType || surface.type)
        && entry.predicate === surface.predicate
        && entry.support === 'supports'
        && entry.factId
      );
      expect(trace, `natural ${surface.predicate} trace`).toBeDefined();
      const boundFact = engine.getGroundingPackage('alice').allowedFacts.find(fact => fact.id === trace.factId);
      expect(boundFact?.type).toBe(surface.type);
      expect(reply).toContain(surface.value(boundFact));

      if (surface.key === 'intention') {
        const wrongIntent = engine.checkConsistency(
          `我接下来打算去${boundFact.region}在偷王冠。`,
          'alice',
        );
        expect(wrongIntent.valid).toBe(false);
        expect(wrongIntent.evidenceTrace.some(entry =>
          entry.predicate === 'plans_to' && entry.support !== 'supports'
        )).toBe(true);
      }
    }
  });

  it('answers only allowed evidence and preserves it across Character save/load', async () => {
    const { engine, alice, provider } = setup();
    const observation = findRuntimeObservation(engine);

    expect(observation, 'normal ticks must produce an OBSERVATION fact').toBeDefined();
    expect(observation.source).toBe('observation');
    expect(observation.id).toMatch(/^fact_observation_/);

    const selfLocationReply = await alice.chat('你在哪里？');
    const selfLocationCheck = engine.checkConsistency(selfLocationReply, 'alice');
    const selfStateReply = await alice.chat('你现在是什么状态？');
    const selfStateCheck = engine.checkConsistency(selfStateReply, 'alice');
    const beforeSaveReply = await alice.chat('Bob在哪里？');
    const beforeSaveCheck = engine.checkConsistency(beforeSaveReply, 'alice');
    const runtimeObservationIds = new Set(
      engine.getGroundingPackage('alice').allowedFacts
        .filter(fact => fact.type === 'observation'
          && new Set([fact.observerId, fact.targetId]).size === 2
          && new Set([fact.observerId, fact.targetId]).has('alice')
          && new Set([fact.observerId, fact.targetId]).has('bob'))
        .map(fact => fact.id)
    );

    expect(provider).not.toHaveBeenCalled();
    expect(selfLocationCheck.valid).toBe(true);
    expect(selfLocationCheck.evidenceTrace.some(trace => trace.factId)).toBe(true);
    expect(selfStateCheck.valid).toBe(true);
    expect(selfStateCheck.evidenceTrace.some(trace => trace.factId)).toBe(true);
    expect(beforeSaveCheck.valid).toBe(true);
    expect(beforeSaveCheck.evidenceTrace.some(trace =>
      trace.factId && runtimeObservationIds.has(trace.factId)
    )).toBe(true);

    const saved = alice.save();
    const resumedEngine = AndyEngine.fromJSON(saved.engineState);
    const restoredAlice = Character.load(saved, provider);
    const afterResumeReply = await restoredAlice.chat('Bob在哪里？');
    const afterResumeCheck = resumedEngine.checkConsistency(afterResumeReply, 'alice');

    expect(afterResumeReply).toBe(beforeSaveReply);
    expect(afterResumeCheck.valid).toBe(true);
    expect(afterResumeCheck.evidenceTrace.some(trace =>
      trace.factId && runtimeObservationIds.has(trace.factId)
    )).toBe(true);
    expect(provider).not.toHaveBeenCalled();

    const forbiddenReply = await restoredAlice.chat('Bob在想什么？');
    const forbiddenCheck = resumedEngine.checkConsistency(forbiddenReply, 'alice');
    expect(forbiddenReply).toContain('不知道');
    expect(forbiddenReply).not.toContain(observation.action);
    expect(forbiddenReply).not.toContain(observation.context);
    expect(forbiddenCheck.valid).toBe(true);
    expect(provider).not.toHaveBeenCalled();
  });

  it('short-circuits the same direct surfaces in chatStream but preserves ordinary provider calls', async () => {
    const { engine, alice, provider } = setup();
    const observation = findRuntimeObservation(engine);
    expect(observation).toBeDefined();

    const streamReply = async question => {
      const chunks = [];
      for await (const chunk of alice.chatStream(question)) chunks.push(chunk);
      return chunks.join('');
    };

    const selfLocationReply = await streamReply('你在哪里？');
    const selfLocationCheck = engine.checkConsistency(selfLocationReply, 'alice');
    const selfStateReply = await streamReply('你现在是什么状态？');
    const selfStateCheck = engine.checkConsistency(selfStateReply, 'alice');
    const thirdPartyLocationReply = await streamReply('Bob在哪里？');
    const thirdPartyLocationCheck = engine.checkConsistency(thirdPartyLocationReply, 'alice');
    const forbiddenReply = await streamReply('Bob在想什么？');
    const forbiddenCheck = engine.checkConsistency(forbiddenReply, 'alice');

    expect(provider).not.toHaveBeenCalled();
    expect(selfLocationCheck.valid).toBe(true);
    expect(selfLocationCheck.evidenceTrace.some(trace => trace.factId)).toBe(true);
    expect(selfStateCheck.valid).toBe(true);
    expect(selfStateCheck.evidenceTrace.some(trace => trace.factId)).toBe(true);
    expect(thirdPartyLocationCheck.valid).toBe(true);
    expect(thirdPartyLocationCheck.evidenceTrace.some(trace => trace.factId)).toBe(true);
    expect(forbiddenReply).toContain('不知道');
    expect(forbiddenCheck.valid).toBe(true);

    const ordinaryProvider = vi.fn(async () => '这是普通回复。');
    const ordinary = new Character({
      id: 'ordinary',
      name: 'Ordinary',
      personality: 'INFP',
      schedule: { entries: [] },
      initialPosition: '校园广场',
      engine,
      llm: ordinaryProvider,
    });
    await ordinary.chat('给我讲一个故事。');
    expect(ordinaryProvider).toHaveBeenCalledOnce();
  });
});
