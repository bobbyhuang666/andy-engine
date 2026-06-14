import { describe, it, expect } from 'vitest';
import AndyEngine from '../../index.js';

describe('Phase 41: Performance Rebaseline', () => {
  it('facts system does not significantly slow down simulation', () => {
    const start = Date.now();

    const engine = new AndyEngine({ enableFacts: true });
    engine.createCharacter({ id: 'test', name: '测试', mbti: 'INFP' });

    for (let i = 0; i < 100; i++) {
      engine.tick();
    }

    const duration = Date.now() - start;
    expect(duration).toBeLessThan(30000);
  });

  it('fact store size is bounded', () => {
    const engine = new AndyEngine({ enableFacts: true });
    engine.createCharacter({ id: 'test', name: '测试', mbti: 'INFP' });

    for (let i = 0; i < 200; i++) {
      engine.tick();
    }

    const stats = engine.world.factStore.getStats();
    expect(stats.total).toBeLessThan(10000);
  });
});
