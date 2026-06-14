import { describe, it, expect } from 'vitest';
import AndyEngine from '../../index.js';
import tavernDomain from '../../presets/tavern/index.js';

describe('Phase 33: Shadow Trace Quality Gate', () => {
  it('same seed produces identical behavior', () => {
    const config = {
      seed: 'test-seed-123',
      enableFacts: true,
    };

    const engine1 = new AndyEngine(config);
    engine1.createCharacter({ id: 'test', name: '测试', mbti: 'INFP' });

    const engine2 = new AndyEngine(config);
    engine2.createCharacter({ id: 'test', name: '测试', mbti: 'INFP' });

    for (let i = 0; i < 5; i++) {
      engine1.tick();
      engine2.tick();
    }

    const agent1 = engine1.getAgent('test');
    const agent2 = engine2.getAgent('test');

    expect(agent1.behaviorField.label).toBe(agent2.behaviorField.label);
    for (let d = 0; d < 4; d++) {
      expect(agent1.behaviorField.B[d]).toBeCloseTo(agent2.behaviorField.B[d], 2);
    }
  });

  it('shadow mode does not crash', () => {
    const engine = new AndyEngine({
      enableFacts: true,
    });
    engine.createCharacter({ id: 'test', name: '测试', mbti: 'INFP' });

    for (let i = 0; i < 10; i++) {
      const result = engine.tick();
      expect(result).toBeDefined();
    }
  });

  it('tavern domain facts contain no campus terms', () => {
    const engine = new AndyEngine({
      domain: tavernDomain,
      enableFacts: true,
    });
    engine.createCharacter({ id: 'test', name: '测试', mbti: 'INFP' });

    for (let i = 0; i < 10; i++) {
      engine.tick();
    }

    const facts = engine.world.factStore.getAllFacts();
    const campusTerms = ['图书馆', '食堂', '宿舍', '教学楼'];
    const allText = facts.map(f => JSON.stringify(f)).join(' ');

    for (const term of campusTerms) {
      expect(allText).not.toContain(term);
    }
  });

  it('grounding package is valid', () => {
    const engine = new AndyEngine({ enableFacts: true });
    engine.createCharacter({ id: 'test', name: '测试', mbti: 'INFP' });
    engine.tick();

    const grounding = engine.getGroundingPackage('test');
    expect(grounding).not.toBeNull();
    expect(grounding.allowedFacts).toBeDefined();
    expect(Array.isArray(grounding.allowedFacts)).toBe(true);
  });

  it('consistency check works', () => {
    const engine = new AndyEngine({ enableFacts: true });
    engine.createCharacter({ id: 'test', name: '测试', mbti: 'INFP' });
    engine.tick();

    const result = engine.checkConsistency('我在图书馆看书', 'test');
    expect(result).toHaveProperty('valid');
    expect(result).toHaveProperty('violations');
    expect(result).toHaveProperty('severity');
  });
});
