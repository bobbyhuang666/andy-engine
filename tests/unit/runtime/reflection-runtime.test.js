/**
 * ReflectionRuntime coverage — Wave 5 batch 5
 *
 * 此前无直接测试(仅经 AgentRuntime 间接覆盖 reflect happy path)。
 * 本文件覆盖 reflect / assessStateConsequences / stateToKeywords 各分支。
 *
 * agent stub + getDefaultDomain (campus STATES),hermetic。
 */

import { describe, it, expect, vi } from 'vitest';
// CJS require:与运行时同一模块实例,确保 v8 coverage 正确归因
const { createRequire } = await import('node:module');
const require = createRequire(import.meta.url);
const { reflect, assessStateConsequences, stateToKeywords } = require('../../../src/agent/runtime/ReflectionRuntime.js');

function makeAgent(overrides = {}) {
  return {
    memory: {
      consolidate: () => {},
      retrieve: () => ({ memories: [], recallEmotionDelta: {} }),
      _getValence: () => 0,
      _getArousal: () => 0,
    },
    intrinsicMotivation: { curiosity: 0, getStatus: () => ({ activeGoals: 0 }), satisfyCuriosity: () => {} },
    emotion: {
      current: { joy: 0, sadness: 0, anger: 0, fear: 0, calm: 0, nervousness: 0, loneliness: 0 },
      baseline: { joy: 0, sadness: 0, anger: 0, fear: 0, calm: 0, nervousness: 0, loneliness: 0 },
      stress: 0,
      getValence: () => 0,
      setStress: () => {},
      applyEffect: () => {},
      adaptBaseline: () => {}, // R28 P1-001: added for route-through fix
    },
    socialEnergy: 0.5,
    position: '宿舍',
    stateMachine: { currentState: '在发呆' },
    personality: { ocean: { neuroticism: 0.5 } },
    ...overrides,
  };
}

// ═══════════════════════════════════════════
// stateToKeywords — 纯函数
// ═══════════════════════════════════════════
describe('ReflectionRuntime.stateToKeywords', () => {
  it('strips leading prefixes and splits into keywords', () => {
    expect(stateToKeywords('在上课')).toContain('上课');
    expect(stateToKeywords('刚出门')).toContain('出门');
    expect(stateToKeywords('快睡了')).toContain('睡了');
    expect(stateToKeywords('还没睡呢')).toContain('睡呢');
  });
  it('includes the full state name as a keyword', () => {
    const kws = stateToKeywords('在图书馆');
    expect(kws).toContain('在图书馆');
  });
  it('returns state name when no prefix match', () => {
    const kws = stateToKeywords('闲逛');
    expect(kws).toContain('闲逛');
  });
});

// ═══════════════════════════════════════════
// reflect — 各分支
// ═══════════════════════════════════════════
describe('ReflectionRuntime.reflect', () => {
  it('runs without throwing on minimal agent', () => {
    expect(() => reflect(makeAgent())).not.toThrow();
  });
  it('satisfies curiosity when curiosity>0.6 and activeGoals>0', () => {
    const satisfied = { called: false };
    const agent = makeAgent({
      intrinsicMotivation: {
        curiosity: 0.8,
        getStatus: () => ({ activeGoals: 2 }),
        satisfyCuriosity: () => { satisfied.called = true; },
      },
    });
    reflect(agent);
    expect(satisfied.called).toBe(true);
  });
  it('adapts baseline when current deviates from baseline by >0.2', () => {
    let adaptCalled = false;
    let adaptArgs = null;
    const agent = makeAgent({
      emotion: {
        current: { joy: 0.5, sadness: 0, anger: 0, fear: 0, calm: 0, nervousness: 0, loneliness: 0 },
        baseline: { joy: 0.1, sadness: 0, anger: 0, fear: 0, calm: 0, nervousness: 0, loneliness: 0 },
        stress: 0, getValence: () => 0, setStress: () => {}, applyEffect: () => {},
        adaptBaseline: (driftMap, clampMax) => { adaptCalled = true; adaptArgs = { driftMap, clampMax }; },
      },
    });
    reflect(agent);
    expect(adaptCalled).toBe(true);
    expect(adaptArgs.driftMap.joy).toBeCloseTo(0.0008, 6); // (0.5-0.1)*0.002
    expect(adaptArgs.clampMax).toBe(0.4);
  });
  it('reduces stress when valence>0.1 and socialEnergy>0.3', () => {
    let stressSet = null;
    const agent = makeAgent({
      emotion: { current: {}, baseline: {}, stress: 5, getValence: () => 0.5, setStress: (v) => { stressSet = v; }, applyEffect: () => {}, adaptBaseline: () => {} },
      socialEnergy: 0.5,
    });
    reflect(agent);
    expect(stressSet).toBe(4.8); // 5 - 0.2
  });
  it('routes stress reappraisal through EffectCommitter when env is available', () => {
    const setStress = vi.fn();
    const commit = vi.fn();
    const agent = makeAgent({
      id: 'reflect-agent',
      emotion: { current: {}, baseline: {}, stress: 5, getValence: () => 0.5, setStress, applyEffect: () => {}, adaptBaseline: () => {} },
      socialEnergy: 0.5,
    });
    reflect(agent, { effectCommitter: { commit } });
    expect(commit).toHaveBeenCalledWith({
      deltas: [expect.objectContaining({
        type: 'emotion',
        target: 'agent',
        agentId: 'reflect-agent',
        stress: 4.8,
      })],
    });
    expect(setStress).not.toHaveBeenCalled();
  });
  it('increases stress when loneliness>0.3', () => {
    let stressSet = null;
    const agent = makeAgent({
      emotion: { current: { loneliness: 0.5 }, baseline: {}, stress: 5, getValence: () => 0, setStress: (v) => { stressSet = v; }, applyEffect: () => {}, adaptBaseline: () => {} },
    });
    reflect(agent);
    expect(stressSet).toBe(5.1); // 5 + 0.1
  });
  it('clamps baseline to [-0.4, 0.4] via adaptBaseline', () => {
    let adaptCalled = false;
    let adaptArgs = null;
    const agent = makeAgent({
      emotion: {
        current: { joy: 0.9 }, baseline: { joy: 0.9, sadness: 0, anger: 0, fear: 0, calm: 0, nervousness: 0, loneliness: 0 },
        stress: 0, getValence: () => 0.8, setStress: () => {}, applyEffect: () => {},
        adaptBaseline: (driftMap, clampMax) => { adaptCalled = true; adaptArgs = { driftMap, clampMax }; },
      },
      socialEnergy: 0.5,
    });
    reflect(agent);
    // R28 P1-001: clamp is now done by adaptBaseline's clampMax parameter
    expect(adaptCalled).toBe(true);
    expect(adaptArgs.clampMax).toBe(0.4);
  });
});

// ═══════════════════════════════════════════
// assessStateConsequences
// ═══════════════════════════════════════════
describe('ReflectionRuntime.assessStateConsequences', () => {
  it('returns null when state has no next states', () => {
    // 找一个无 next 的 state 或用不存在的 state
    const agent = makeAgent({ stateMachine: { currentState: 'nonexistent' } });
    expect(assessStateConsequences(agent)).toBeNull();
  });
  it('returns null when no relevant memories found', () => {
    const agent = makeAgent({
      stateMachine: { currentState: '在发呆' }, // campus 在发呆 has next states
      memory: {
        retrieve: () => ({ memories: [], recallEmotionDelta: {} }),
        _getValence: () => 0,
        _getArousal: () => 0,
      },
    });
    expect(assessStateConsequences(agent)).toBeNull();
  });
  it('applies recallEmotionDelta when present', () => {
    const applied = { called: false };
    const agent = makeAgent({
      stateMachine: { currentState: '在发呆' },
      memory: {
        retrieve: () => ({ memories: [], recallEmotionDelta: { joy: 0.1 } }),
        _getValence: () => 0,
        _getArousal: () => 0,
      },
      emotion: {
        current: {}, baseline: {}, stress: 0, getValence: () => 0,
        setStress: () => {}, applyEffect: (eff) => { applied.called = true; }, adaptBaseline: () => {},
      },
    });
    assessStateConsequences(agent);
    expect(applied.called).toBe(true);
  });
  it('routes consequence recall emotion through EffectCommitter when env is available', () => {
    const applyEffect = vi.fn();
    const commit = vi.fn();
    const agent = makeAgent({
      id: 'consequence-agent',
      stateMachine: { currentState: '在发呆' },
      memory: {
        retrieve: () => ({ memories: [], recallEmotionDelta: { joy: 0.1 } }),
        _getValence: () => 0,
        _getArousal: () => 0,
      },
      emotion: {
        current: {}, baseline: {}, stress: 0, getValence: () => 0,
        setStress: () => {}, applyEffect, adaptBaseline: () => {},
      },
    });
    assessStateConsequences(agent, { effectCommitter: { commit } });
    expect(commit).toHaveBeenCalledWith({
      deltas: [expect.objectContaining({
        type: 'emotion',
        target: 'agent',
        agentId: 'consequence-agent',
        changes: { joy: 0.1 },
        multiplier: 0.5,
      })],
    });
    expect(applyEffect).not.toHaveBeenCalled();
  });
});
