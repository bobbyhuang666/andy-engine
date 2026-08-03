/**
 * Candidate Providers 测试套件
 */

import { describe, it, expect } from 'vitest';
import { ContinueCandidateProvider } from '../../src/action/providers/ContinueCandidateProvider.js';
import { NeedCandidateProvider } from '../../src/action/providers/NeedCandidateProvider.js';
import { ScheduleCandidateProvider } from '../../src/action/providers/ScheduleCandidateProvider.js';
import { BehaviorFieldCandidateProvider } from '../../src/action/providers/BehaviorFieldCandidateProvider.js';
import { ExploreCandidateProvider } from '../../src/action/providers/ExploreCandidateProvider.js';
import { SocializeCandidateProvider } from '../../src/action/providers/SocializeCandidateProvider.js';
import { CandidateProviderManager } from '../../src/action/providers/CandidateProviderManager.js';

// 合成 context（无 campus terms）
function makeContext(overrides = {}) {
  return {
    behaviorField: { B: [0.5, 0.5, 0.5, 0.5], label: 'resting' },
    needs: { hunger: 0.8, energy: 0.8, social: 0.8, stimulation: 0.8 },
    schedule: null,
    intrinsic: { curiosity: 0.1 },
    relationships: [],
    agent: { position: 'home' },
    world: { time: '2026-09-01T14:00:00Z' },
    ...overrides,
  };
}

// 通用断言：候选是 JSON 可序列化纯对象
function expectValidCandidate(cand) {
  expect(cand).toHaveProperty('id');
  expect(cand).toHaveProperty('type');
  expect(cand).toHaveProperty('source');
  expect(typeof cand.id).toBe('string');
  expect(cand.id.length).toBeGreaterThan(0);
  // JSON 可序列化
  const json = JSON.stringify(cand);
  const parsed = JSON.parse(json);
  expect(parsed.id).toBe(cand.id);
}

describe('ContinueCandidateProvider', () => {
  it('从 behaviorField label 生成一个 continue 候选', () => {
    const provider = new ContinueCandidateProvider();
    const ctx = makeContext({ behaviorField: { B: [0.5, 0.5, 0.5, 0.5], label: 'working' } });
    const result = provider.generate(ctx);

    expect(result.length).toBe(1);
    expect(result[0].type).toBe('continue');
    expect(result[0].source).toBe('behaviorField');
    expect(result[0].label).toContain('working');
    expectValidCandidate(result[0]);
  });

  it('无 behaviorField 时返回空', () => {
    const provider = new ContinueCandidateProvider();
    expect(provider.generate(makeContext({ behaviorField: null }))).toEqual([]);
  });

  it('不修改 context', () => {
    const provider = new ContinueCandidateProvider();
    const ctx = makeContext();
    const ctxCopy = JSON.parse(JSON.stringify(ctx));
    provider.generate(ctx);
    expect(ctx).toEqual(ctxCopy);
  });
});

describe('NeedCandidateProvider', () => {
  it('低 hunger 生成 consume 候选', () => {
    const provider = new NeedCandidateProvider();
    const ctx = makeContext({ needs: { hunger: 0.1, energy: 0.8, social: 0.8, stimulation: 0.8 } });
    const result = provider.generate(ctx);

    expect(result.length).toBeGreaterThan(0);
    const consume = result.find(c => c.type === 'consume');
    expect(consume).toBeDefined();
    expect(consume.target).toBe('hunger');
    expectValidCandidate(consume);
  });

  it('低 energy 生成 rest 候选', () => {
    const provider = new NeedCandidateProvider();
    const ctx = makeContext({ needs: { hunger: 0.8, energy: 0.1, social: 0.8, stimulation: 0.8 } });
    const result = provider.generate(ctx);
    expect(result.some(c => c.type === 'rest')).toBe(true);
  });

  it('低 social 生成 socialize 候选', () => {
    const provider = new NeedCandidateProvider();
    const ctx = makeContext({ needs: { hunger: 0.8, energy: 0.8, social: 0.1, stimulation: 0.8 } });
    const result = provider.generate(ctx);
    expect(result.some(c => c.type === 'socialize')).toBe(true);
  });

  it('低 stimulation 生成 explore 候选', () => {
    const provider = new NeedCandidateProvider();
    const ctx = makeContext({ needs: { hunger: 0.8, energy: 0.8, social: 0.8, stimulation: 0.1 } });
    const result = provider.generate(ctx);
    expect(result.some(c => c.type === 'explore')).toBe(true);
  });

  it('所有需求充足时返回空', () => {
    const provider = new NeedCandidateProvider();
    const ctx = makeContext({ needs: { hunger: 0.9, energy: 0.9, social: 0.9, stimulation: 0.9 } });
    expect(provider.generate(ctx)).toEqual([]);
  });

  it('不修改 context', () => {
    const provider = new NeedCandidateProvider();
    const ctx = makeContext({ needs: { hunger: 0.1, energy: 0.8, social: 0.8, stimulation: 0.8 } });
    const ctxCopy = JSON.parse(JSON.stringify(ctx));
    provider.generate(ctx);
    expect(ctx).toEqual(ctxCopy);
  });
});

describe('ScheduleCandidateProvider', () => {
  it('activity.actionType 为合法 generic type 时直接使用', () => {
    const provider = new ScheduleCandidateProvider();
    const ctx = makeContext({
      schedule: { currentActivity: { type: 'morning_class', actionType: 'work', location: 'hall' } },
    });
    const result = provider.generate(ctx);

    expect(result.length).toBe(1);
    expect(result[0].type).toBe('work');
    expect(result[0].source).toBe('schedule');
    expectValidCandidate(result[0]);
  });

  it('activity.type 不是合法 generic type 时 fallback 到 continue', () => {
    const provider = new ScheduleCandidateProvider();
    const ctx = makeContext({
      schedule: { currentActivity: { type: 'some_unknown_activity' } },
    });
    const result = provider.generate(ctx);

    expect(result.length).toBe(1);
    expect(result[0].type).toBe('continue');
  });

  it('无 schedule 时返回空', () => {
    const provider = new ScheduleCandidateProvider();
    expect(provider.generate(makeContext({ schedule: null }))).toEqual([]);
  });

  it('无 currentActivity 时返回空', () => {
    const provider = new ScheduleCandidateProvider();
    expect(provider.generate(makeContext({ schedule: {} }))).toEqual([]);
  });

  it('不修改 context', () => {
    const provider = new ScheduleCandidateProvider();
    const ctx = makeContext({ schedule: { currentActivity: { type: 'test', actionType: 'rest' } } });
    const ctxCopy = JSON.parse(JSON.stringify(ctx));
    provider.generate(ctx);
    expect(ctx).toEqual(ctxCopy);
  });
});

describe('BehaviorFieldCandidateProvider', () => {
  it('低活跃生成 rest 候选', () => {
    const provider = new BehaviorFieldCandidateProvider();
    const ctx = makeContext({ behaviorField: { B: [0.1, 0.5, 0.5, 0.5], label: 'low' } });
    const result = provider.generate(ctx);
    expect(result.some(c => c.type === 'rest')).toBe(true);
  });

  it('高社交生成 socialize 候选', () => {
    const provider = new BehaviorFieldCandidateProvider();
    const ctx = makeContext({ behaviorField: { B: [0.5, 0.8, 0.5, 0.5], label: 'social' } });
    const result = provider.generate(ctx);
    expect(result.some(c => c.type === 'socialize')).toBe(true);
  });

  it('高专注生成 work 候选', () => {
    const provider = new BehaviorFieldCandidateProvider();
    const ctx = makeContext({ behaviorField: { B: [0.5, 0.5, 0.8, 0.5], label: 'focused' } });
    const result = provider.generate(ctx);
    expect(result.some(c => c.type === 'work')).toBe(true);
  });

  it('高表达生成 observe 候选', () => {
    const provider = new BehaviorFieldCandidateProvider();
    const ctx = makeContext({ behaviorField: { B: [0.5, 0.5, 0.5, 0.8], label: 'expressive' } });
    const result = provider.generate(ctx);
    expect(result.some(c => c.type === 'observe')).toBe(true);
  });

  it('无 behaviorField 时返回空', () => {
    const provider = new BehaviorFieldCandidateProvider();
    expect(provider.generate(makeContext({ behaviorField: null }))).toEqual([]);
  });
});

describe('ExploreCandidateProvider', () => {
  it('高好奇心生成 explore 候选', () => {
    const provider = new ExploreCandidateProvider();
    const ctx = makeContext({ intrinsic: { curiosity: 0.6 } });
    const result = provider.generate(ctx);

    expect(result.length).toBe(1);
    expect(result[0].type).toBe('explore');
    expect(result[0].source).toBe('intrinsic');
    expectValidCandidate(result[0]);
  });

  it('低好奇心返回空', () => {
    const provider = new ExploreCandidateProvider();
    expect(provider.generate(makeContext({ intrinsic: { curiosity: 0.1 } }))).toEqual([]);
  });

  it('无 intrinsic 时返回空', () => {
    const provider = new ExploreCandidateProvider();
    expect(provider.generate(makeContext({ intrinsic: null }))).toEqual([]);
  });
});

describe('SocializeCandidateProvider', () => {
  it('远程强关系不生成 socialize 候选', () => {
    const provider = new SocializeCandidateProvider();
    const ctx = makeContext({
      agent: { id: 'alice', position: 'home' },
      relationships: [{ agentA: 'alice', agentB: 'bob', strength: 0.5 }],
      coPresentAgentIds: [],
    });
    expect(provider.generate(ctx)).toEqual([]);
  });

  it('只为共处的强关系生成 socialize 候选', () => {
    const provider = new SocializeCandidateProvider();
    const ctx = makeContext({
      agent: { id: 'alice', position: 'home' },
      relationships: [
        { agentA: 'alice', agentB: 'remote', strength: 0.8 },
        { agentA: 'alice', agentB: 'bob', strength: 0.5 },
      ],
      coPresentAgentIds: ['bob'],
    });
    const result = provider.generate(ctx);

    expect(result.length).toBe(1);
    expect(result[0].type).toBe('socialize');
    expect(result[0].target).toBe('bob');
    expectValidCandidate(result[0]);
  });

  it('关系太弱时返回空', () => {
    const provider = new SocializeCandidateProvider();
    const ctx = makeContext({ relationships: [{ strength: 0.05 }] });
    expect(provider.generate(ctx)).toEqual([]);
  });

  it('无 relationships 时返回空', () => {
    const provider = new SocializeCandidateProvider();
    expect(provider.generate(makeContext({ relationships: null }))).toEqual([]);
  });
});

describe('CandidateProviderManager', () => {
  it('确定性顺序：相同 context 两次调用返回相同结果', () => {
    const manager = new CandidateProviderManager();
    const ctx = makeContext({
      needs: { hunger: 0.1, energy: 0.1, social: 0.8, stimulation: 0.8 },
      intrinsic: { curiosity: 0.5 },
      relationships: [{ agentA: 'alice', agentB: 'bob', strength: 0.5 }],
      agent: { id: 'alice', position: 'home' },
      coPresentAgentIds: ['bob'],
    });

    const r1 = manager.generateAll(ctx);
    const r2 = manager.generateAll(ctx);

    expect(r1.length).toBe(r2.length);
    for (let i = 0; i < r1.length; i++) {
      expect(r1[i].id).toBe(r2[i].id);
      expect(r1[i].type).toBe(r2[i].type);
    }
  });

  it('去重：相同 id 候选只保留第一个', () => {
    const manager = new CandidateProviderManager();
    // 构造一个 context 让多个 provider 都产生相同 type 的候选
    const ctx = makeContext({
      behaviorField: { B: [0.1, 0.8, 0.8, 0.8], label: 'test' },
      needs: { hunger: 0.1, energy: 0.8, social: 0.8, stimulation: 0.8 },
      intrinsic: { curiosity: 0.5 },
      relationships: [{ strength: 0.5 }],
    });

    const result = manager.generateAll(ctx);
    const ids = result.map(c => c.id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(ids.length);
  });

  it('输出纯 JSON 可序列化', () => {
    const manager = new CandidateProviderManager();
    const ctx = makeContext({
      needs: { hunger: 0.1, energy: 0.1, social: 0.1, stimulation: 0.1 },
      intrinsic: { curiosity: 0.5 },
      relationships: [{ strength: 0.5 }],
    });

    const result = manager.generateAll(ctx);
    const json = JSON.stringify(result);
    const parsed = JSON.parse(json);
    expect(parsed.length).toBe(result.length);
  });

  it('不修改 context', () => {
    const manager = new CandidateProviderManager();
    const ctx = makeContext({
      needs: { hunger: 0.1, energy: 0.1, social: 0.1, stimulation: 0.1 },
      intrinsic: { curiosity: 0.5 },
      relationships: [{ strength: 0.5 }],
    });
    const ctxCopy = JSON.parse(JSON.stringify(ctx));
    manager.generateAll(ctx);
    expect(ctx).toEqual(ctxCopy);
  });
});
