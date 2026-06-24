import { describe, it, expect } from 'vitest';
import AndyEngine from '../../index.js';

describe('No raw emotion leak', () => {
  it('narrative should not contain raw emotion labels', () => {
    const engine = new AndyEngine({ seed: 'no-leak-test' });
    const alice = engine.createCharacter({
      id: 'alice',
      name: 'Alice',
      mbti: 'INFP',
      schedule: 'student',
    });
    engine.world.regions.place('alice', '图书馆');

    for (let i = 0; i < 5; i++) {
      engine.tick();
    }

    const narrative = engine.getNarrative('alice');

    expect(narrative).not.toContain('效价=');
    expect(narrative).not.toContain('唤醒=');
    expect(narrative).not.toContain('关键维度：');
  });

  it('grounding package should not contain raw emotionState', () => {
    const engine = new AndyEngine({ seed: 'no-leak-test-2', enableFacts: true });
    const alice = engine.createCharacter({
      id: 'alice',
      name: 'Alice',
      mbti: 'INFP',
      schedule: 'student',
    });
    engine.world.regions.place('alice', '图书馆');

    for (let i = 0; i < 5; i++) {
      engine.tick();
    }

    const grounding = engine.getGroundingPackage('alice');

    expect(grounding.affectFrame).toBeDefined();
    expect(grounding.affectFrame.version).toBe('0.2-basic');

    expect(grounding.emotionState).toBeUndefined();
  });
});
