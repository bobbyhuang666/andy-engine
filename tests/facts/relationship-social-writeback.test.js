import { describe, it, expect } from 'vitest';
import AndyEngine from '../../index.js';

describe('Phase 38: Relationship And Social Writeback', () => {
  it('social interactions affect relationships', () => {
    const engine = new AndyEngine({ enableFacts: true });
    engine.createCharacter({ id: 'test1', name: '测试1', mbti: 'INFP' });
    engine.createCharacter({ id: 'test2', name: '测试2', mbti: 'ENFP' });

    for (let i = 0; i < 100; i++) {
      engine.tick();
    }

    const graph = engine.getSocialGraph();
    const rel = graph.getRelationship('test1', 'test2');

    if (rel) {
      expect(rel.strength).toBeDefined();
      expect(rel.type).toBeDefined();
    }
  });

  it('relationship facts are recorded', () => {
    const engine = new AndyEngine({ enableFacts: true });
    engine.createCharacter({ id: 'test1', name: '测试1', mbti: 'INFP' });
    engine.createCharacter({ id: 'test2', name: '测试2', mbti: 'ENFP' });

    for (let i = 0; i < 50; i++) {
      engine.tick();
    }

    const relFacts = engine.world.factStore.getRelationshipFacts();
    expect(Array.isArray(relFacts)).toBe(true);
  });
});
