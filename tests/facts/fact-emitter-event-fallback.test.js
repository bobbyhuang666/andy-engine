/**
 * FactEmitter Event Fallback Tests
 *
 * Tests for the legacy emitEventFacts / propagateEventKnowledge methods.
 * These methods are @deprecated — new code must use CanonEventPipeline.
 * This file exists to verify fallback behavior only.
 */

import { describe, it, expect, vi } from 'vitest';
import AndyEngine from '../../index.js';
import { WorldFactStore, FactEmitter } from '../../facts/index.js';

describe('FactEmitter Event Fallback (legacy)', () => {
  it('FactEmitter 对缺失 id 的事件使用可重复 fallback id', () => {
    const engineA = new AndyEngine({ enableFacts: true, seed: 'facts', startTime: new Date('2026-01-01T00:00:00Z') });
    const engineB = new AndyEngine({ enableFacts: true, seed: 'facts', startTime: new Date('2026-01-01T00:00:00Z') });

    engineA.world.factEmitter.setSimTime(engineA.world.time);
    engineB.world.factEmitter.setSimTime(engineB.world.time);

    const [factA] = engineA.world.factEmitter.emitEventFacts([{ type: 'custom', content: '测试事件' }]);
    const [factB] = engineB.world.factEmitter.emitEventFacts([{ type: 'custom', content: '测试事件' }]);

    expect(factA.eventId).toBe(factB.eventId);
    expect(factA.eventId).toContain('2026-01-01T00:00:00.000Z');
  });

  it('P2-1: internal/action_selected events are marked auditOnly in the fallback path', () => {
    const engine = new AndyEngine({ enableFacts: true, seed: 'audit', startTime: new Date('2026-01-01T00:00:00Z') });
    engine.world.factEmitter.setSimTime(engine.world.time);

    const [internalFact] = engine.world.factEmitter.emitEventFacts([
      { type: 'custom', content: '内部事件', scope: 'internal' },
    ]);
    expect(internalFact.scope).toBe('internal');
    expect(internalFact.auditOnly).toBe(true);
    expect(internalFact.eventType).toBe('custom');
    expect(internalFact.originalScope).toBe('internal');

    const [actionSelectedFact] = engine.world.factEmitter.emitEventFacts([
      { type: 'action_selected', content: '动作选择', scope: 'local' },
    ]);
    expect(actionSelectedFact.auditOnly).toBe(true);
    expect(actionSelectedFact.eventType).toBe('action_selected');
    expect(actionSelectedFact.originalScope).toBe('local');
  });

  it('P2-1: propagateEventKnowledge skips auditOnly facts (consistent with CanonEventPipeline)', () => {
    const engine = new AndyEngine({ enableFacts: true, seed: 'audit2', startTime: new Date('2026-01-01T00:00:00Z') });
    engine.world.factEmitter.setSimTime(engine.world.time);
    const agents = engine.world.agents;

    const [internalFact] = engine.world.factEmitter.emitEventFacts([
      { type: 'action_selected', content: '内部动作', scope: 'internal', participants: ['p1'], observers: ['o1'] },
    ]);

    const before = engine.world.knowledgeStore
      ? engine.world.knowledgeStore.getAllKnowledge?.() || []
      : [];
    const beforeCount = Array.isArray(before) ? before.length : 0;

    // Should be a no-op for auditOnly facts.
    engine.world.factEmitter.propagateEventKnowledge(internalFact, agents);

    const after = engine.world.knowledgeStore
      ? engine.world.knowledgeStore.getAllKnowledge?.() || []
      : [];
    const afterCount = Array.isArray(after) ? after.length : 0;

    expect(internalFact.auditOnly).toBe(true);
    expect(afterCount).toBe(beforeCount);
  });
});

describe('FactEmitter memory fact performance guards', () => {
  it('emitMemoryFacts indexes existing memory facts once per call', () => {
    const store = new WorldFactStore();
    const emitter = new FactEmitter(store);
    const getMemoryFactsSpy = vi.spyOn(store, 'getMemoryFacts');
    const agents = new Map([
      ['alice', {
        memory: {
          memories: Array.from({ length: 6 }, (_, i) => ({
            content: `alice memory ${i}`,
            importance: 0.6,
            emotionTag: 'neutral',
            category: 'general',
            timestamp: new Date('2026-01-01T00:00:00Z'),
          })),
        },
      }],
      ['bob', {
        memory: {
          memories: Array.from({ length: 6 }, (_, i) => ({
            content: `bob memory ${i}`,
            importance: 0.7,
            emotionTag: 'neutral',
            category: 'general',
            timestamp: new Date('2026-01-01T00:00:00Z'),
          })),
        },
      }],
    ]);

    const facts = emitter.emitMemoryFacts(agents);

    expect(facts).toHaveLength(12);
    expect(getMemoryFactsSpy).toHaveBeenCalledTimes(1);
  });

  it('emitMemoryFacts updates duplicate memory facts through the prebuilt index', () => {
    const store = new WorldFactStore();
    const emitter = new FactEmitter(store);
    const agents = new Map([
      ['alice', {
        memory: {
          memories: [
            {
              content: 'same memory',
              importance: 0.6,
              emotionTag: 'neutral',
              category: 'general',
              timestamp: new Date('2026-01-01T00:00:00Z'),
            },
          ],
        },
      }],
    ]);

    emitter.emitMemoryFacts(agents);
    agents.get('alice').memory.memories[0].importance = 0.9;
    emitter.emitMemoryFacts(agents);

    const memoryFacts = store.getMemoryFacts();
    expect(memoryFacts).toHaveLength(1);
    expect(memoryFacts[0].importance).toBe(0.9);
  });
});

describe('FactEmitter agent state performance guards', () => {
  it('emitAgentStateFacts indexes existing state facts once per call', () => {
    const store = new WorldFactStore();
    const emitter = new FactEmitter(store);
    const getAgentStateFactsSpy = vi.spyOn(store, 'getAgentStateFacts');
    const agents = new Map([
      ['alice', {
        stateMachine: { currentState: 'focused' },
        position: 'room_a',
        emotion: { getDominant: () => [{ dimension: 'calm', value: 0.2 }] },
      }],
      ['bob', {
        stateMachine: { currentState: 'resting' },
        position: 'room_b',
        emotion: { getDominant: () => [] },
      }],
      ['cara', {
        stateMachine: { currentState: 'walking' },
        position: 'room_c',
        emotion: { getDominant: () => [{ dimension: 'curious', value: 0.3 }] },
      }],
    ]);

    emitter.emitAgentStateFacts(agents);
    agents.get('alice').position = 'room_b';
    const facts = emitter.emitAgentStateFacts(agents);

    expect(facts).toHaveLength(3);
    expect(store.getAgentStateFacts()).toHaveLength(3);
    expect(getAgentStateFactsSpy).toHaveBeenCalledTimes(3);
  });
});
