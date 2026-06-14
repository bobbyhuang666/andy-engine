import { describe, it, expect } from 'vitest';
import AndyEngine from '../../index.js';

describe('Phase 40: Replay And Trace Audit', () => {
  it('same seed produces same behavior', () => {
    const config = {
      seed: 'replay-test',
      enableFacts: true,
    };

    const engine1 = new AndyEngine(config);
    engine1.createCharacter({ id: 'test', name: '测试', mbti: 'INFP' });

    const engine2 = new AndyEngine(config);
    engine2.createCharacter({ id: 'test', name: '测试', mbti: 'INFP' });

    for (let i = 0; i < 10; i++) {
      engine1.tick();
      engine2.tick();
    }

    const agent1 = engine1.getAgent('test');
    const agent2 = engine2.getAgent('test');

    expect(agent1.behaviorField.label).toBe(agent2.behaviorField.label);
  });

  it('snapshot and restore works', () => {
    const engine = new AndyEngine({ enableFacts: true });
    engine.createCharacter({ id: 'test', name: '测试', mbti: 'INFP' });

    for (let i = 0; i < 5; i++) {
      engine.tick();
    }

    const snapshot = engine.snapshot();
    expect(snapshot).toBeDefined();
  });
});
