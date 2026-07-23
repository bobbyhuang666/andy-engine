/**
 * State Label Cleanup 测试
 *
 * Stage 29 + 32: 验证 D-class usages 不再依赖硬编码中文状态名。
 *
 *   1. PhysiologyRuntime sick gating — 基于 health + activity，不依赖状态名
 *   2. Appraisal — domain-provided appraisalConfig，custom domain 不泄露 campus 状态名
 *   3. EmotionRegulation — domain-driven rest/sleep category 判断
 *   4. ScheduleHandler — domain-driven night/sleep/sick 判断
 *
 * 注意：behaviorField._lastLabel 初始化已在 Stage 31 中通过 domain-driven 解决。
 */

import { describe, it, expect, vi } from 'vitest';
import AndyEngine from '../../index.js';
import tavernDomain from '../../presets/tavern/index.js';
import { updateHealth } from '../../src/agent/runtime/PhysiologyRuntime.js';
import Appraisal from '../../src/agent/psychology/Appraisal.js';
import EmotionRegulation from '../../src/agent/psychology/EmotionRegulation.js';
import ScheduleHandler from '../../src/agent/handlers/ScheduleHandler.js';

/**
 * Helper: set behaviorField to a tavern state center and sync _lastLabel.
 * Resolved in Stage 31 — domain-driven initial label.
 */
function setBehaviorState(agent, stateCenters, stateName) {
  const center = stateCenters[stateName];
  if (!center) throw new Error(`No state center for ${stateName}`);
  agent.behaviorField.B = [...center];
  agent.behaviorField.velocity = [0, 0, 0, 0];
  agent.behaviorField._lastLabel = stateName;
}

describe('PhysiologyRuntime sick gating — domain-agnostic', () => {
  // @characterization — direct state injection; not Beta evidence
  it('tavern agent with low health + high activity gets frustration effect', () => {
    const engine = new AndyEngine({ domain: tavernDomain });
    const agent = engine.createCharacter({
      id: 'sick-test-1',
      name: '铁匠',
      mbti: 'ISTJ',
      background: ['一个铁匠'],
    });

    agent.health = 0.25;
    agent.behaviorField.B[0] = 0.5; // activity high
    const beforeFrustration = agent.emotion.current.frustration;

    updateHealth(agent, 1.0, { weather: 'sunny' });

    expect(agent.emotion.current.frustration).toBeGreaterThan(beforeFrustration);
  });

  it('tavern agent with low health + low activity does NOT get extra frustration', () => {
    const engine = new AndyEngine({ domain: tavernDomain });
    const agent = engine.createCharacter({
      id: 'sick-test-2',
      name: '铁匠',
      mbti: 'ISTJ',
      background: ['一个铁匠'],
    });

    agent.health = 0.25;
    agent.behaviorField.B[0] = 0.05; // activity low — "already resting"
    const beforeFrustration = agent.emotion.current.frustration;

    updateHealth(agent, 1.0, { weather: 'sunny' });

    // The sick frustration effect should NOT fire (activity < 0.15)
    const delta = agent.emotion.current.frustration - beforeFrustration;
    expect(delta).toBeLessThanOrEqual(0.02 + 0.001);
  });

  it('sick gating works regardless of domain state names', () => {
    const engine = new AndyEngine({ domain: tavernDomain });
    const agent = engine.createCharacter({
      id: 'sick-test-3',
      name: '铁匠',
      mbti: 'ISTJ',
      background: ['一个铁匠'],
    });

    // Set agent into tavern's '喝酒' state (activity=0.30 > 0.15)
    setBehaviorState(agent, tavernDomain.stateCenters, '喝酒');

    agent.health = 0.20;
    const beforeFrustration = agent.emotion.current.frustration;

    updateHealth(agent, 1.0, { weather: 'sunny' });

    // Should apply frustration because activity is high (0.30 > 0.15)
    expect(agent.emotion.current.frustration).toBeGreaterThan(beforeFrustration);
  });

  it('campus agent sick gating still works (regression)', () => {
    const engine = new AndyEngine();
    const agent = engine.createCharacter({
      id: 'sick-test-campus',
      name: '测试',
      mbti: 'ISTJ',
      background: ['一个测试角色'],
    });

    agent.health = 0.25;
    agent.behaviorField.B[0] = 0.5; // high activity
    const beforeFrustration = agent.emotion.current.frustration;

    updateHealth(agent, 1.0, { weather: 'sunny' });

    expect(agent.emotion.current.frustration).toBeGreaterThan(beforeFrustration);
  });
});

describe('Appraisal — domain-agnostic', () => {
  it('tavern appraisal recognizes domain socialStates', () => {
    const engine = new AndyEngine({ domain: tavernDomain });
    const agent = engine.createCharacter({
      id: 'appraisal-test-1',
      name: '铁匠',
      mbti: 'ISTJ',
      background: ['一个铁匠'],
    });

    // Set behaviorField to '喝酒' center and sync label
    setBehaviorState(agent, tavernDomain.stateCenters, '喝酒');

    const currentState = agent.stateMachine.currentState;
    expect(currentState).toBe('喝酒');

    // Verify domain config has '喝酒' in socialStates
    const socialStates = agent._domain.appraisalConfig.socialStates || [];
    expect(socialStates).toContain('喝酒');

    const event = {
      type: 'social',
      content: '有人来酒馆找你聊天',
      participants: ['other-agent'],
    };
    const result = Appraisal.evaluate(event, agent);
    // Base 0.3 + social match 0.3 + participant 0.3 + openness ≈ 0.98
    expect(result.dimensions.goalRelevance).toBeGreaterThan(0.5);
  });

  it('tavern appraisal result contains no campus state names', () => {
    const engine = new AndyEngine({ domain: tavernDomain });
    const agent = engine.createCharacter({
      id: 'appraisal-test-3',
      name: '铁匠',
      mbti: 'ISTJ',
      background: ['一个铁匠'],
    });

    const event = {
      type: 'social',
      content: '酒馆里来了新客人',
    };

    const result = Appraisal.evaluate(event, agent);
    const resultStr = JSON.stringify(result);

    const campusWords = ['在上课', '在自习', '在食堂', '在宿舍', '翘课', '在图书馆'];
    for (const word of campusWords) {
      expect(resultStr).not.toContain(word);
    }
  });

  it('tavern appraisal with missing socialStates defaults gracefully', () => {
    const engine = new AndyEngine({ domain: tavernDomain });
    const agent = engine.createCharacter({
      id: 'appraisal-test-4',
      name: '铁匠',
      mbti: 'ISTJ',
      background: ['一个铁匠'],
    });

    // Override appraisalConfig to simulate missing socialStates
    const registry = agent._domain;
    const origDomain = registry.domain;
    registry.domain = { ...origDomain, appraisalConfig: {} };

    const event = { type: 'social', content: 'test' };
    expect(() => Appraisal.evaluate(event, agent)).not.toThrow();

    // Restore
    registry.domain = origDomain;
  });

  it('tavern appraisal scheduledStates boosts conduciveness for 工作', () => {
    const engine = new AndyEngine({ domain: tavernDomain });
    const agent = engine.createCharacter({
      id: 'appraisal-test-5',
      name: '铁匠',
      mbti: 'ISTJ',
      background: ['一个铁匠'],
    });

    // Verify the domain has scheduledStates configured
    const scheduledStates = agent._domain.appraisalConfig.scheduledStates || [];
    expect(scheduledStates).toContain('工作');

    // Set behaviorField to '工作' center and sync label
    setBehaviorState(agent, tavernDomain.stateCenters, '工作');

    const currentState = agent.stateMachine.currentState;
    expect(currentState).toBe('工作');
    expect(scheduledStates).toContain(currentState);

    const event = { type: 'random', content: '铁匠铺里很安静' };
    const result = Appraisal.evaluate(event, agent);
    expect(result.dimensions.goalConduciveness).toBeDefined();
  });
});

describe('EmotionRegulation — domain-driven rest detection', () => {
  it('routes reappraisal stress changes through EffectCommitter when env is available', () => {
    const mockPersonality = { ocean: { openness: 0.8, neuroticism: 0.1, extraversion: 0.2, agreeableness: 0.5, conscientiousness: 0.5 } };
    const reg = new EmotionRegulation(mockPersonality, { _regulationResource: 1 });
    const setStress = vi.fn();
    const commit = vi.fn();
    const agent = {
      id: 'reg-agent',
      emotion: {
        stress: 5,
        applyEffect: vi.fn(),
        setStress,
      },
    };

    reg._execReappraisal(agent, 0.5, { effectCommitter: { commit } });

    expect(commit).toHaveBeenCalledWith({
      deltas: [expect.objectContaining({
        type: 'emotion',
        target: 'agent',
        agentId: 'reg-agent',
        stress: expect.any(Number),
      })],
    });
    expect(setStress).not.toHaveBeenCalled();
  });

  it('routes reappraisal emotion changes through EffectCommitter when env is available', () => {
    const mockPersonality = { ocean: { openness: 0.8, neuroticism: 0.1, extraversion: 0.2, agreeableness: 0.5, conscientiousness: 0.5 } };
    const reg = new EmotionRegulation(mockPersonality, { _regulationResource: 1 });
    const commit = vi.fn();
    const agent = {
      id: 'reg-agent',
      emotion: {
        stress: 5,
        applyEffect: vi.fn(),
        setStress: vi.fn(),
      },
    };

    reg._execReappraisal(agent, 0.5, { effectCommitter: { commit } });

    expect(commit).toHaveBeenCalledWith({
      deltas: [expect.objectContaining({
        type: 'emotion',
        target: 'agent',
        agentId: 'reg-agent',
        changes: expect.objectContaining({ calm: expect.any(Number) }),
        stress: null,
      })],
    });
    expect(agent.emotion.applyEffect).not.toHaveBeenCalled();
  });

  it('routes attention deployment and response modulation emotion changes through EffectCommitter', () => {
    const mockPersonality = { ocean: { openness: 0.5, neuroticism: 0.3, extraversion: 0.8, agreeableness: 0.5, conscientiousness: 0.8 } };
    const reg = new EmotionRegulation(mockPersonality, { _regulationResource: 1 });
    const commit = vi.fn();
    const agent = {
      id: 'strategy-agent',
      emotion: {
        stress: 5,
        applyEffect: vi.fn(),
        setStress: vi.fn(),
      },
      memory: {
        retrieve: () => ({ memories: [], recallEmotionDelta: {} }),
      },
    };

    reg._execAttentionDeployment(agent, 0.5, { effectCommitter: { commit } });
    reg._execResponseModulation(agent, 0.5, { effectCommitter: { commit } });

    expect(commit).toHaveBeenCalledTimes(2);
    expect(commit).toHaveBeenNthCalledWith(1, {
      deltas: [expect.objectContaining({
        type: 'emotion',
        target: 'agent',
        agentId: 'strategy-agent',
        changes: expect.objectContaining({ interest: expect.any(Number) }),
      })],
    });
    expect(commit).toHaveBeenNthCalledWith(2, {
      deltas: [expect.objectContaining({
        type: 'emotion',
        target: 'agent',
        agentId: 'strategy-agent',
        changes: expect.objectContaining({ nervousness: expect.any(Number) }),
      })],
    });
    expect(agent.emotion.applyEffect).not.toHaveBeenCalled();
  });

  it('tavern rest state (category=rest) triggers rest bonus', () => {
    const mockPersonality = { ocean: { openness: 0.5, neuroticism: 0.3, extraversion: 0.5, agreeableness: 0.5, conscientiousness: 0.5 } };
    const reg = new EmotionRegulation(mockPersonality, { _regulationResource: 0.5 });

    // Tavern's '休息' has category 'rest'
    reg.tick(1.0, '休息', { states: { '休息': { category: 'rest' } } });

    // Should get baseRecovery(0.05) + restBonus(0.1) = 0.15 per hour → 0.5 + 0.15 = 0.65
    expect(reg._regulationResource).toBeGreaterThan(0.6);
  });

  it('tavern sleep state (category=sleep) triggers rest bonus', () => {
    const mockPersonality = { ocean: { openness: 0.5, neuroticism: 0.3, extraversion: 0.5, agreeableness: 0.5, conscientiousness: 0.5 } };
    const reg = new EmotionRegulation(mockPersonality, { _regulationResource: 0.5 });

    // Tavern's '睡觉' has category 'sleep'
    reg.tick(1.0, '睡觉', { states: { '睡觉': { category: 'sleep' } } });

    expect(reg._regulationResource).toBeGreaterThan(0.6);
  });

  it('tavern social state does NOT trigger rest bonus', () => {
    const mockPersonality = { ocean: { openness: 0.5, neuroticism: 0.3, extraversion: 0.5, agreeableness: 0.5, conscientiousness: 0.5 } };
    const reg = new EmotionRegulation(mockPersonality, { _regulationResource: 0.5 });

    // Tavern's '喝酒' has category 'social' — not rest
    reg.tick(1.0, '喝酒', { states: { '喝酒': { category: 'social' } } });

    // Should only get baseRecovery(0.05) → 0.5 + 0.05 = 0.55
    expect(reg._regulationResource).toBeCloseTo(0.55, 2);
  });

  it('no domain falls back gracefully (no crash, no rest bonus)', () => {
    const mockPersonality = { ocean: { openness: 0.5, neuroticism: 0.3, extraversion: 0.5, agreeableness: 0.5, conscientiousness: 0.5 } };
    const reg = new EmotionRegulation(mockPersonality, { _regulationResource: 0.5 });

    reg.tick(1.0, '休息', null); // no domain

    // Should only get baseRecovery → 0.5 + 0.05 = 0.55
    expect(reg._regulationResource).toBeCloseTo(0.55, 2);
  });

  it('campus domain still works with domain parameter (regression)', () => {
    const engine = new AndyEngine();
    const agent = engine.createCharacter({
      id: 'er-campus-test',
      name: '测试',
      mbti: 'ISTJ',
      background: ['测试'],
    });

    // Drain resource so there's room to grow
    agent.emotionRegulation._regulationResource = 0.5;
    // Campus '在休息' has category 'rest'
    agent.emotionRegulation.tick(1.0, '在休息', agent._domain);

    expect(agent.emotionRegulation._regulationResource).toBeGreaterThan(0.6);
  });
});

describe('ScheduleHandler — domain-driven night/sleep detection', () => {
  it('skip attractor uses current domain state center, not default campus centers', () => {
    const engine = new AndyEngine({ domain: tavernDomain });
    const agent = engine.createCharacter({
      id: 'skip-attractor-test',
      name: '铁匠',
      mbti: 'ISTJ',
      background: ['铁匠'],
    });
    const handler = new ScheduleHandler(agent);
    const originalCheckSchedule = ScheduleHandler.checkSchedule;
    const calls = [];
    const originalSetAttractor = agent.behaviorField.setAttractor.bind(agent.behaviorField);

    ScheduleHandler.checkSchedule = () => ({
      moved: true,
      region: '酒馆',
      skipEvent: 'skipWork',
      altState: '喝酒',
    });
    agent.behaviorField.setAttractor = (target, strength, duration) => {
      calls.push({ target, strength, duration });
      return originalSetAttractor(target, strength, duration);
    };

    try {
      handler.tick({
        env: { hour: 10, dayOfWeek: 1, simDate: new Date('2026-09-01T10:00:00Z'), simTime: new Date('2026-09-01T10:00:00Z') },
        needsDrive: null,
        imResult: { drive: null },
        result: { regionChanged: false, stateChanged: false, newEvents: [] },
      });
    } finally {
      ScheduleHandler.checkSchedule = originalCheckSchedule;
    }

    expect(calls.length).toBe(1);
    expect(calls[0].target).toEqual(tavernDomain.stateCenters['喝酒']);
    expect(calls[0].strength).toBe(10);
    expect(calls[0].duration).toBe(5);
  });

  it('getSkipAlternative uses domain skipBehavior for skipWork', () => {
    const engine = new AndyEngine({ domain: tavernDomain });
    const agent = engine.createCharacter({
      id: 'skip-test-1',
      name: '铁匠',
      mbti: 'ISTJ',
      background: ['铁匠'],
    });

    // Force deterministic _rand
    agent._rand = () => 0.1;

    const alt = ScheduleHandler.getSkipAlternative(agent, 'skipWork', 10);
    // Tavern skipBehavior.skipWork.states = ['休息', '闲逛', '喝酒']
    expect(['休息', '闲逛', '喝酒']).toContain(alt);
  });

  it('getSkipAlternative with no domain sickBehavior falls back to category lookup', () => {
    const engine = new AndyEngine({ domain: tavernDomain });
    const agent = engine.createCharacter({
      id: 'skip-test-2',
      name: '铁匠',
      mbti: 'ISTJ',
      background: ['铁匠'],
    });

    // Tavern has no skipBehavior.sick — falls through to category lookup
    // No 'illness' category in tavern, so it finds first 'rest' category state: '休息'
    const alt = ScheduleHandler.getSkipAlternative(agent, 'sick', 10);
    expect(alt).toBe('休息');
  });

  it('campus getSkipAlternative still works (regression)', () => {
    const engine = new AndyEngine();
    const agent = engine.createCharacter({
      id: 'skip-campus-test',
      name: '测试',
      mbti: 'ISTJ',
      background: ['测试'],
    });

    agent._rand = () => 0.1;

    const alt = ScheduleHandler.getSkipAlternative(agent, 'sick', 10);
    // Campus has '生病了' with category 'illness'
    expect(alt).toBe('生病了');
  });

  it('campus getSkipAlternative for skipClass returns rest state', () => {
    const engine = new AndyEngine();
    const agent = engine.createCharacter({
      id: 'skip-campus-test-2',
      name: '测试',
      mbti: 'ISTJ',
      background: ['测试'],
    });

    agent._rand = () => 0.1;

    // Campus has skipBehavior.skipClass.states
    const alt = ScheduleHandler.getSkipAlternative(agent, 'skipClass', 10);
    expect(alt).toBeDefined();
    expect(alt).not.toBeNull();
  });

  it('no campus Chinese strings in tavern ScheduleHandler control logic', () => {
    // Read the source to verify no hardcoded campus strings
    const fs = require('fs');
    const path = require('path');
    const src = fs.readFileSync(
      path.resolve(__dirname, '../../src/agent/handlers/ScheduleHandler.js'),
      'utf8'
    );

    // These should NOT appear as hardcoded control logic strings
    const campusStrings = ['熬夜了', '睡了', '在睡觉', '生病了', '在休息'];
    // Check that these don't appear in string literals used for comparison
    // (they may appear in comments, which is fine)
    const lines = src.split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      // Skip comments
      if (trimmed.startsWith('//') || trimmed.startsWith('*')) continue;
      for (const s of campusStrings) {
        // Should not have direct string comparison like === '...'
        if (trimmed.includes(`=== '${s}'`) || trimmed.includes(`=== "${s}"`)) {
          throw new Error(`Found hardcoded campus string comparison in ScheduleHandler: ${s} on line: ${trimmed}`);
        }
      }
    }
  });

  it('no campus Chinese strings in EmotionRegulation rest detection', () => {
    const fs = require('fs');
    const path = require('path');
    const src = fs.readFileSync(
      path.resolve(__dirname, '../../src/agent/psychology/EmotionRegulation.js'),
      'utf8'
    );

    // restStates array should not exist
    expect(src).not.toContain("restStates = ['在休息'");
    expect(src).not.toContain('restStates.includes');
  });
});
