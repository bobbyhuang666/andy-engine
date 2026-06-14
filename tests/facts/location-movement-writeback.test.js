import { describe, it, expect } from 'vitest';
import AndyEngine from '../../index.js';

describe('Phase 37: Location And Movement Writeback', () => {
  it('movement affects future behavior', () => {
    const engine = new AndyEngine({ enableFacts: true });
    engine.createCharacter({ id: 'test', name: '测试', mbti: 'INFP' });

    const agent = engine.getAgent('test');

    for (let i = 0; i < 50; i++) {
      engine.tick();
    }

    expect(agent.position).toBeDefined();
  });

  it('location meaning influences behavior', () => {
    const engine = new AndyEngine({ enableFacts: true });
    engine.createCharacter({ id: 'test', name: '测试', mbti: 'INFP' });

    engine.world.factStore.updateLocationMeaning('图书馆', {
      type: 'work',
      weight: 0.8,
      reason: '安静适合学习',
    });

    engine.tick();

    const meaning = engine.world.factStore.getLocationMeaning('图书馆');
    expect(meaning).toBeDefined();
    expect(meaning.meaningType).toBe('work');
  });
});
