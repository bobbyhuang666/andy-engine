import { describe, expect, it, vi } from 'vitest';
import {
  FactConsistencyChecker,
  FactEmitter,
  WorldFactStore,
  createIntentionFact,
} from '../../facts/index.js';
import Schedule from '../../src/agent/schedule/Schedule.js';
import Character from '../../src/sdk/Character.js';

const domain = { regions: [] };

function makeGrounding(allowedFacts) {
  return {
    allowedFacts,
    forbiddenFacts: [],
    metadata: {
      agentId: 'alice',
      agentNames: { alice: 'Alice', bob: 'Bob' },
    },
  };
}

function checkReference(grounding, structuredClaims) {
  return new FactConsistencyChecker(new WorldFactStore(), domain).check(
    '事实',
    grounding,
    { structuredClaims },
  );
}

describe('grounding hardening', () => {
  it('facade rejects unsupported memory, intention, relationship, and event references', () => {
    const result = checkReference(makeGrounding([
      { id: 'memory_1', type: 'memory', agentId: 'alice', content: '太阳' },
      { id: 'intention_1', type: 'intention', agentId: 'alice', intent: '工作' },
      { id: 'relationship_1', type: 'relationship', agentA: 'alice', agentB: 'bob', relationType: '朋友' },
      { id: 'event_1', type: 'event', description: '一起聊天' },
    ]), [
      { type: 'memory', subject: 'alice', predicate: 'remembers', object: '太阳已经爆炸', span: '事实' },
      { type: 'intention', subject: 'alice', predicate: 'plans_to', object: '工作并偷王冠', span: '事实' },
      { type: 'relationship', subject: 'alice', predicate: 'is_relation', object: { kind: 'agent', id: 'bob', raw: 'Bob' }, relationType: '死敌', span: '事实' },
      { type: 'event', subject: 'alice', predicate: 'refers_to', object: '一起聊天后杀了人', span: '事实' },
    ]);

    expect(result.valid).toBe(false);
    expect(result.severity).toBe('rewrite');
    expect(result.violations.filter(v => v.type === 'unsupported_claim')).toHaveLength(4);
    expect(result.evidenceTrace.map(trace => trace.support)).toEqual([
      'unsupported', 'unsupported', 'unsupported', 'unsupported',
    ]);
  });

  it('facade accepts exact normalized references and requires relationType', () => {
    const grounding = makeGrounding([
      { id: 'memory_1', type: 'memory', agentId: 'alice', content: '太阳' },
      { id: 'intention_1', type: 'intention', agentId: 'alice', intent: '工作' },
      { id: 'relationship_1', type: 'relationship', agentA: 'alice', agentB: 'bob', relationType: '朋友' },
      { id: 'event_1', type: 'event', description: '一起聊天' },
    ]);

    const valid = checkReference(grounding, [
      { type: 'memory', subject: 'alice', predicate: 'remembers', object: ' 太阳 ', span: '事实' },
      { type: 'intention', subject: 'alice', predicate: 'plans_to', object: '工作', span: '事实' },
      { type: 'relationship', subject: 'alice', predicate: 'is_relation', object: { kind: 'agent', id: 'bob', raw: 'Bob' }, relationType: '朋友', span: '事实' },
      { type: 'event', subject: 'alice', predicate: 'refers_to', object: '一起聊天', span: '事实' },
    ]);
    expect(valid.valid).toBe(true);

    const missingRelationType = checkReference(grounding, [
      { type: 'relationship', subject: 'alice', predicate: 'is_relation', object: { kind: 'agent', id: 'bob', raw: 'Bob' }, span: '事实' },
    ]);
    expect(missingRelationType.valid).toBe(false);
    expect(missingRelationType.evidenceTrace[0].support).toBe('unsupported');
  });
});

describe('FactEmitter schedule and memory boundaries', () => {
  it('delegates intention derivation to Schedule.getNextActivity with date context', () => {
    const store = new WorldFactStore();
    const emitter = new FactEmitter(store);
    const schedule = new Schedule({ entries: [] });
    vi.spyOn(schedule, 'getNextActivity').mockReturnValue({
      entry: { startHour: 8, region: 'work', activity: 'focus' },
      startsIn: 1,
      isTomorrow: false,
    });

    const facts = emitter.emitIntentionFacts(new Map([
      ['alice', { schedule }],
    ]), 7, 2, '2026-08-02');

    expect(schedule.getNextActivity).toHaveBeenCalledWith(7, 2, '2026-08-02');
    expect(facts[0].intent).toBe('focus');
    expect(facts[0].scheduledHour).toBe(8);
  });

  it('honors Schedule days and probability instead of scanning entries', () => {
    const noDayStore = new WorldFactStore();
    const noDayEmitter = new FactEmitter(noDayStore);
    const noDaySchedule = new Schedule({ entries: [
      { startHour: 8, endHour: 9, days: [1], probability: 1, noise: 0, activity: 'weekday', region: 'work' },
    ] });
    expect(noDayEmitter.emitIntentionFacts(new Map([['alice', { schedule: noDaySchedule }]]), 7, 2, '2026-08-02')).toEqual([]);

    const noProbabilityStore = new WorldFactStore();
    const noProbabilityEmitter = new FactEmitter(noProbabilityStore);
    const noProbabilitySchedule = new Schedule({ entries: [
      { startHour: 8, endHour: 9, days: [2], probability: 0, noise: 0, activity: 'never', region: 'work' },
    ] });
    expect(noProbabilityEmitter.emitIntentionFacts(new Map([['alice', { schedule: noProbabilitySchedule }]]), 7, 2, '2026-08-02')).toEqual([]);
  });

  it('does not emit memories marked as grounding-excluded conversation records', () => {
    const store = new WorldFactStore();
    const emitter = new FactEmitter(store);
    const facts = emitter.emitMemoryFacts(new Map([
      ['alice', {
        memory: { memories: [
          { content: '世界事件', category: 'event', importance: 0.8 },
          { content: '用户说的原话', category: 'social', importance: 0.8, groundingExcluded: true },
        ] },
      }],
    ]));

    expect(facts.map(fact => fact.content)).toEqual(['世界事件']);
    expect(store.getMemoryFacts().map(fact => fact.content)).toEqual(['世界事件']);
  });

  it('Character.chat conversation records never enter the engine grounding package', async () => {
    const character = new Character({
      id: 'alice',
      name: 'Alice',
      personality: 'INFP',
      enableFacts: true,
      schedule: { entries: [] },
      llm: async () => '助手回复',
    });

    await character.chat('用户原始问题');
    character._engine.tick();

    const memoryFacts = character._engine
      .getGroundingPackage('alice')
      .allowedFacts
      .filter(fact => fact.type === 'memory');
    expect(memoryFacts.some(fact =>
      fact.content.includes('用户原始问题') || fact.content.includes('助手回复')
    )).toBe(false);
  });

  it('exports createIntentionFact through the public facts facade', () => {
    const fact = createIntentionFact({ agentId: 'alice', intent: 'focus' });
    expect(fact.type).toBe('intention');
    expect(fact.agentId).toBe('alice');
  });
});
