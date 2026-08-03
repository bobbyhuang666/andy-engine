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

describe('runtime-generated third-party observation grounding', () => {
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
