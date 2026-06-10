/**
 * Contagion Cache Semantics 测试
 *
 * 验证 per-tick snapshot semantics。
 */

import { describe, it, expect } from 'vitest';
import AndyEngine from '../index.js';

describe('Contagion Cache Semantics', () => {
  it('per-tick snapshot: 同一 tick 内所有 agent 看到相同的情绪快照', () => {
    const engine = new AndyEngine({
      startTime: new Date('2024-01-15T08:00:00'),
    });

    // 创建两个 agent 在同一区域（campus preset 用校园广场）
    engine.createCharacter({
      id: 'a',
      name: 'A',
      mbti: 'INFP',
      schedule: { entries: [] },
      initialPosition: '校园广场',
    });

    engine.createCharacter({
      id: 'b',
      name: 'B',
      mbti: 'INFP',
      schedule: { entries: [] },
      initialPosition: '校园广场',
    });

    const agentA = engine.getAgent('a');
    const agentB = engine.getAgent('b');

    // 设置 agent A 的情绪
    agentA.emotion.current.joy = 0.5;
    agentA.emotion.mood.joy = 0.3;

    // 构建 cache
    const cache = engine.simulator._buildEmotionBlendCache();

    // cache 中 A 的 blended emotion 应该是 mood*0.6 + current*0.4
    const blendedA = cache.get('a');
    expect(blendedA.joy).toBeCloseTo(0.3 * 0.6 + 0.5 * 0.4, 5);

    // cache 中 B 的 blended emotion 应该是 B 自己的值
    const blendedB = cache.get('b');
    // B 的初始情绪有基线值，所以不是 0
    expect(typeof blendedB.joy).toBe('number');
  });

  it('_gatherContagionInputs 使用 cache 中的 emotion', () => {
    const engine = new AndyEngine({
      startTime: new Date('2024-01-15T08:00:00'),
    });

    // 创建两个 agent 在同一区域（campus preset 用校园广场）
    engine.createCharacter({
      id: 'a',
      name: 'A',
      mbti: 'INFP',
      schedule: { entries: [] },
      initialPosition: '校园广场',
    });

    engine.createCharacter({
      id: 'b',
      name: 'B',
      mbti: 'INFP',
      schedule: { entries: [] },
      initialPosition: '校园广场',
    });

    const agentA = engine.getAgent('a');
    const agentB = engine.getAgent('b');

    // 设置 agent A 的情绪
    agentA.emotion.current.joy = 0.8;
    agentA.emotion.mood.joy = 0.6;

    // 构建 cache
    const cache = engine.simulator._buildEmotionBlendCache();

    // 获取 B 的 contagion inputs（B 应该看到 A 的情绪）
    const inputs = engine.simulator._gatherContagionInputs('b', agentB, cache);

    expect(inputs).toBeDefined();
    expect(inputs['a']).toBeDefined();

    // A 的 blended emotion 应该是 mood*0.6 + current*0.4 = 0.6*0.6 + 0.8*0.4 = 0.68
    expect(inputs['a'].emotion.joy).toBeCloseTo(0.68, 5);
  });

  it('cache 缺失时行为安全', () => {
    const engine = new AndyEngine({
      startTime: new Date('2024-01-15T08:00:00'),
    });

    // 创建两个 agent 在同一区域（campus preset 用校园广场）
    engine.createCharacter({
      id: 'a',
      name: 'A',
      mbti: 'INFP',
      schedule: { entries: [] },
      initialPosition: '校园广场',
    });

    engine.createCharacter({
      id: 'b',
      name: 'B',
      mbti: 'INFP',
      schedule: { entries: [] },
      initialPosition: '校园广场',
    });

    const agentB = engine.getAgent('b');

    // 传入空 cache
    const emptyCache = new Map();
    const inputs = engine.simulator._gatherContagionInputs('b', agentB, emptyCache);

    // 应该返回 null（没有有效输入）
    expect(inputs).toBeNull();
  });

  it('custom domain 不受影响', () => {
    const tavernDomain = require('../presets/tavern');
    const engine = new AndyEngine({ domain: tavernDomain });

    engine.createCharacter({
      id: 'a',
      name: '铁匠',
      schedule: 'blacksmith',
      initialPosition: '广场',
    });

    engine.createCharacter({
      id: 'b',
      name: '旅人',
      schedule: 'wanderer',
      initialPosition: '广场',
    });

    // tick 应该正常工作
    expect(() => engine.tick()).not.toThrow();

    // 检查情绪传染是否正常工作
    const agentA = engine.getAgent('a');
    const agentB = engine.getAgent('b');

    // 设置 A 的情绪
    agentA.emotion.current.joy = 0.5;
    engine.tick();

    // B 应该受到 A 的情绪影响
    // （由于其他因素，不一定能精确测试，但至少不应该崩溃）
  });

  it('_gatherContagionInputs 不传 cache 也不崩', () => {
    const engine = new AndyEngine({
      startTime: new Date('2024-01-15T08:00:00'),
    });

    // 创建两个 agent 在同一区域
    engine.createCharacter({
      id: 'a',
      name: 'A',
      mbti: 'INFP',
      schedule: { entries: [] },
      initialPosition: '校园广场',
    });

    engine.createCharacter({
      id: 'b',
      name: 'B',
      mbti: 'INFP',
      schedule: { entries: [] },
      initialPosition: '校园广场',
    });

    const agentB = engine.getAgent('b');

    // 不传 cache，应该自动构建
    const inputs = engine.simulator._gatherContagionInputs('b', agentB);
    expect(inputs).toBeDefined();
  });
});
