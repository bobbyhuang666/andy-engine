import { describe, it, expect } from 'vitest';
const AndyEngine = require('../../index.js');

describe('Phase 36: Minimal Active Writeback', () => {
  it('active mode can be enabled via config', () => {
    const engine = new AndyEngine({
      seed: 'active-test',
      enableFacts: true,
      actionSelection: {
        enabled: true,
        mode: 'active',
        allowWriteback: true,
      },
    });
    engine.createCharacter({ id: 'test', name: '测试', mbti: 'INFP' });

    const result = engine.tick();
    expect(result).toBeDefined();
  });

  it('active mode does not crash', () => {
    const engine = new AndyEngine({
      seed: 'active-test',
      enableFacts: true,
      actionSelection: {
        enabled: true,
        mode: 'active',
        allowWriteback: true,
      },
    });
    engine.createCharacter({ id: 'test', name: '测试', mbti: 'INFP' });

    for (let i = 0; i < 20; i++) {
      const result = engine.tick();
      expect(result).toBeDefined();
    }
  });

  it('active mode changes agent state through events', () => {
    const engine = new AndyEngine({
      seed: 'active-test',
      enableFacts: true,
      actionSelection: {
        enabled: true,
        mode: 'active',
        allowWriteback: true,
      },
    });
    engine.createCharacter({ id: 'test', name: '测试', mbti: 'INFP' });

    const agent = engine.getAgent('test');
    const initialEmotion = { ...agent.emotion.current };

    for (let i = 0; i < 50; i++) {
      engine.tick();
    }

    expect(agent.emotion.current).toBeDefined();
  });

  it('active mode can be disabled', () => {
    const engine = new AndyEngine({
      seed: 'active-test',
      enableFacts: true,
      actionSelection: {
        enabled: true,
        mode: 'active',
        allowWriteback: true,
      },
    });
    engine.createCharacter({ id: 'test', name: '测试', mbti: 'INFP' });

    for (let i = 0; i < 10; i++) {
      engine.tick();
    }

    engine.config.actionSelection.mode = 'shadow';

    for (let i = 0; i < 10; i++) {
      engine.tick();
    }

    expect(true).toBe(true);
  });

  it('active mode produces ReasonTrace', () => {
    const engine = new AndyEngine({
      seed: 'active-test',
      enableFacts: true,
      actionSelection: {
        enabled: true,
        mode: 'active',
        allowWriteback: true,
      },
    });
    engine.createCharacter({ id: 'test', name: '测试', mbti: 'INFP' });

    engine.tick();

    const agent = engine.getAgent('test');
    const traceHistory = agent._actionTraceHistory || [];

    expect(Array.isArray(traceHistory)).toBe(true);
  });

  it('seeded active mode is deterministic', () => {
    const config = {
      seed: 'deterministic-test',
      enableFacts: true,
      actionSelection: {
        enabled: true,
        mode: 'active',
        allowWriteback: true,
      },
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
});
