/**
 * buildNarrative 情绪备份/还原安全性测试
 *
 * 验证 P1-2: 共情计算时 emotion.current 和 emotion.mood 均被完整备份/还原
 */

import { describe, it, expect, beforeEach } from 'vitest';
import Personality from '../../src/agent/psychology/Personality.js';
import EmotionVector from '../../src/agent/psychology/EmotionVector.js';
import { buildNarrative, computeEmpathy } from '../../src/sdk/AndyEngineHelpers.js';

function createMockAgent(overrides = {}) {
  const personality = new Personality({ mbti: 'INFP' });
  const emotion = new EmotionVector(personality);
  return {
    personality,
    emotion,
    socialEnergy: 0.8,
    needs: { needs: { energy: 0.8 } },
    toNarrative: () => 'test narrative',
    ...overrides,
  };
}

describe('buildNarrative 情绪安全', () => {
  let agent;

  beforeEach(() => {
    agent = createMockAgent();
  });

  it('调用后 emotion.current 不变', () => {
    const before = { ...agent.emotion.current };
    buildNarrative(agent, { userText: '我今天好难过', relationship: 50 });
    expect(agent.emotion.current).toEqual(before);
  });

  it('调用后 emotion.mood 不变', () => {
    const before = { ...agent.emotion.mood };
    buildNarrative(agent, { userText: '我今天好难过', relationship: 50 });
    expect(agent.emotion.mood).toEqual(before);
  });

  it('toNarrative 抛异常时情绪仍被还原', () => {
    const beforeCurrent = { ...agent.emotion.current };
    const beforeMood = { ...agent.emotion.mood };
    agent.toNarrative = () => { throw new Error('narrative boom'); };

    const result = buildNarrative(agent, { userText: '我今天好难过', relationship: 50 });
    expect(result).toBe('');
    expect(agent.emotion.current).toEqual(beforeCurrent);
    expect(agent.emotion.mood).toEqual(beforeMood);
  });

  it('native-like emotion mirror is restored after temporary empathy', () => {
    agent.emotion._ev = {};
    const beforeCurrent = { ...agent.emotion.current };
    const beforeMood = { ...agent.emotion.mood };

    buildNarrative(agent, { userText: '我今天好难过', relationship: 50 });

    expect(agent.emotion.current).toEqual(beforeCurrent);
    expect(agent.emotion.mood).toEqual(beforeMood);
  });

  it('personality.ocean 缺失时不报错', () => {
    agent.personality = null;
    expect(() => {
      buildNarrative(agent, { userText: '你好', relationship: 50 });
    }).not.toThrow();
  });

  it('personality 存在但 ocean 缺失时不报错', () => {
    agent.personality = { ocean: null };
    expect(() => {
      buildNarrative(agent, { userText: '你好', relationship: 50 });
    }).not.toThrow();
  });

  it('needs.needs.energy 缺失时不报错', () => {
    agent.needs = null;
    expect(() => {
      buildNarrative(agent, { userText: '你好', relationship: 50 });
    }).not.toThrow();
  });
});

describe('computeEmpathy 容错', () => {
  it('personality 为 null 时返回合理值', () => {
    const agent = { personality: null, socialEnergy: 0.8, emotion: null, needs: null };
    const result = computeEmpathy(agent, 50);
    expect(result).toBeGreaterThanOrEqual(0);
    expect(result).toBeLessThanOrEqual(1);
  });

  it('personality.ocean 为 null 时返回合理值', () => {
    const agent = { personality: { ocean: null }, socialEnergy: 0.8, emotion: null, needs: null };
    const result = computeEmpathy(agent, 50);
    expect(result).toBeGreaterThanOrEqual(0);
    expect(result).toBeLessThanOrEqual(1);
  });
});
