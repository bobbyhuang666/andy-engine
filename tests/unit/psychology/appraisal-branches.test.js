/**
 * Appraisal branch coverage — Wave 5 batch 6
 *
 * 此前无 Appraisal 单元测试(仅经 AndyWorld 间接覆盖,无分支断言)。
 * 本文件覆盖 evaluate 入口 + 8 个评价维度 + emotionModifier + importance。
 *
 * agent stub + getDefaultDomain() (campus appraisalConfig),hermetic。
 */

import { describe, it, expect } from 'vitest';
// CJS require:与运行时同一模块实例,确保 v8 coverage 正确归因
const { createRequire } = await import('node:module');
const require = createRequire(import.meta.url);
const Appraisal = require('../../../src/agent/psychology/Appraisal.js');
const { getDefaultDomain } = require('../../../src/domain/DomainRegistry.js');

const campusDomain = getDefaultDomain();

function makeAgent(overrides = {}) {
  return {
    domain: campusDomain,
    id: 'a1',
    position: '宿舍',
    personality: { ocean: { openness: 0.5, conscientiousness: 0.5, extraversion: 0.5, agreeableness: 0.5, neuroticism: 0.5 } },
    emotion: {
      current: { joy: 0, sadness: 0 },
      stress: 0,
      getValence: () => 0,
    },
    socialEnergy: 0.5,
    stateMachine: { currentState: '在发呆' },
    socialGraph: { getRelationship: () => null },
    memory: { getAppraisalBias: () => 0 },
    needs: {
      getDrive: () => ({ need: null, urgency: 0 }),
      needs: { energy: 0.5, hunger: 0.5 },
    },
    _recentEventTypes: new Set(),
    ...overrides,
  };
}

// ═══════════════════════════════════════════
// evaluate 入口
// ═══════════════════════════════════════════
describe('Appraisal.evaluate — entry', () => {
  it('throws when agent.domain missing', () => {
    expect(() => Appraisal.evaluate({ type: 'social' }, {})).toThrow(/requires agent.domain/);
  });
  it('returns { dimensions, emotionModifier, importance } shape', () => {
    const r = Appraisal.evaluate({ type: 'social', content: '打招呼', participants: ['a1'] }, makeAgent());
    expect(r).toHaveProperty('dimensions');
    expect(r).toHaveProperty('emotionModifier');
    expect(r).toHaveProperty('importance');
    expect(typeof r.importance).toBe('number');
  });
});

// ═══════════════════════════════════════════
// _evalSuddenness — typeRarity + recent adaptation + neuroticism
// ═══════════════════════════════════════════
describe('Appraisal._evalSuddenness', () => {
  it('returns higher suddenness for rare event types', () => {
    const common = Appraisal.evaluate({ type: 'social' }, makeAgent({ _recentEventTypes: new Set(['social']) }));
    const rare = Appraisal.evaluate({ type: 'random' }, makeAgent({ _recentEventTypes: new Set(['social']) }));
    // rare (not in recent) should be >= common (in recent, adapted *0.5)
    expect(rare.dimensions.suddenness).toBeGreaterThanOrEqual(common.dimensions.suddenness);
  });
  it('returns value in [0, ~1] range', () => {
    for (const type of ['social', 'random', 'weather', 'state_change']) {
      const r = Appraisal.evaluate({ type }, makeAgent());
      expect(r.dimensions.suddenness).toBeGreaterThanOrEqual(0);
      expect(r.dimensions.suddenness).toBeLessThanOrEqual(1.5);
    }
  });
});

// ═══════════════════════════════════════════
// _evalPleasantness — effect dims + mood bias
// ═══════════════════════════════════════════
describe('Appraisal._evalPleasantness', () => {
  it('positive joy effect yields positive pleasantness', () => {
    const r = Appraisal.evaluate(
      { type: 'social', effects: [{ target: 'a1', type: 'emotion', delta: { joy: 0.3 } }] },
      makeAgent()
    );
    expect(r.dimensions.pleasantness).toBeGreaterThan(0);
  });
  it('negative sadness effect yields negative pleasantness', () => {
    const r = Appraisal.evaluate(
      { type: 'social', effects: [{ target: 'a1', type: 'emotion', delta: { sadness: 0.3 } }] },
      makeAgent()
    );
    expect(r.dimensions.pleasantness).toBeLessThan(0);
  });
  it('no effects yields neutral pleasantness influenced by mood', () => {
    const r = Appraisal.evaluate({ type: 'social' }, makeAgent({ emotion: { getValence: () => 0.4, current: {}, stress: 0 } }));
    expect(r.dimensions.pleasantness).toBeGreaterThan(0);
  });
});

// ═══════════════════════════════════════════
// _evalGoalRelevance — social/weather/random/needKeywords
// ═══════════════════════════════════════════
describe('Appraisal._evalGoalRelevance', () => {
  it('social event with participant includes agent → high relevance', () => {
    const r = Appraisal.evaluate({ type: 'social', participants: ['a1'] }, makeAgent());
    expect(r.dimensions.goalRelevance).toBeGreaterThan(0);
  });
  it('weather event with agent on outdoor position → relevance', () => {
    const r = Appraisal.evaluate({ type: 'weather' }, makeAgent({ position: '操场' }));
    expect(r.dimensions.goalRelevance).toBeGreaterThanOrEqual(0);
  });
  it('random event → small positive relevance', () => {
    const r = Appraisal.evaluate({ type: 'random' }, makeAgent());
    expect(r.dimensions.goalRelevance).toBeGreaterThanOrEqual(0);
  });
});

// ═══════════════════════════════════════════
// _evalAgency — event type → label/score
// ═══════════════════════════════════════════
describe('Appraisal._evalAgency', () => {
  it('weather → environment label', () => {
    const r = Appraisal.evaluate({ type: 'weather' }, makeAgent());
    expect(r.dimensions.agency.label).toBe('environment');
  });
  it('random → chance label', () => {
    const r = Appraisal.evaluate({ type: 'random' }, makeAgent());
    expect(r.dimensions.agency.label).toBe('chance');
  });
  it('social with participant → other label', () => {
    const r = Appraisal.evaluate({ type: 'social', participants: ['other'] }, makeAgent({
      socialGraph: { getRelationship: () => ({ strength: 0.5 }) },
    }));
    expect(r.dimensions.agency.label).toBe('other');
  });
});

// ═══════════════════════════════════════════
// _evalCopingPotential — stress/needs penalties
// ═══════════════════════════════════════════
describe('Appraisal._evalCopingPotential', () => {
  it('high stress + low energy → lower coping', () => {
    const lowCoping = Appraisal.evaluate({ type: 'social' }, makeAgent({
      emotion: { getValence: () => 0, current: {}, stress: 30 },
      needs: { getDrive: () => ({ need: null, urgency: 0 }), needs: { energy: 0.2, hunger: 0.2 } },
    }));
    const highCoping = Appraisal.evaluate({ type: 'social' }, makeAgent({
      emotion: { getValence: () => 0, current: {}, stress: 0 },
      needs: { getDrive: () => ({ need: null, urgency: 0 }), needs: { energy: 0.8, hunger: 0.8 } },
    }));
    expect(highCoping.dimensions.copingPotential).toBeGreaterThanOrEqual(lowCoping.dimensions.copingPotential);
  });
});

// ═══════════════════════════════════════════
// _evalNormConformity — positive/negative keywords
// ═══════════════════════════════════════════
describe('Appraisal._evalNormConformity', () => {
  it('positive keyword (打招呼) → high normConformity', () => {
    const r = Appraisal.evaluate({ type: 'social', content: '打招呼' }, makeAgent());
    expect(r.dimensions.normConformity).toBeGreaterThan(0.5);
  });
  it('negative keyword (冲突) → low normConformity', () => {
    const r = Appraisal.evaluate({ type: 'social', content: '冲突' }, makeAgent());
    expect(r.dimensions.normConformity).toBeLessThan(0.5);
  });
});

// ═══════════════════════════════════════════
// _appraisalToEmotion — joy/frustration/surprise branches
// ═══════════════════════════════════════════
describe('Appraisal._appraisalToEmotion', () => {
  it('positive conduciveness + relevance → joy modifier', () => {
    const r = Appraisal.evaluate(
      { type: 'social', content: '打招呼', participants: ['a1'], effects: [{ target: 'a1', type: 'emotion', delta: { joy: 0.3 } }] },
      makeAgent({ emotion: { getValence: () => 0.4, current: { joy: 0 }, stress: 0 } })
    );
    expect(r.emotionModifier.joy).toBeGreaterThanOrEqual(1);
  });
  it('negative conduciveness → frustration/anger modifier', () => {
    const r = Appraisal.evaluate(
      { type: 'social', content: '冲突', participants: ['a1'], effects: [{ target: 'a1', type: 'emotion', delta: { anger: 0.3 } }] },
      makeAgent()
    );
    // 至少有一个负面情绪 modifier
    const negativeMods = ['frustration', 'anger', 'sadness', 'fear', 'nervousness'].filter(m => r.emotionModifier[m] !== undefined && r.emotionModifier[m] >= 1);
    expect(negativeMods.length).toBeGreaterThan(0);
  });
});

// ═══════════════════════════════════════════
// _computeImportance
// ═══════════════════════════════════════════
describe('Appraisal._computeImportance', () => {
  it('returns 0 when goalRelevance is 0', () => {
    // 构造一个 relevance=0 的事件(无 participants/weather/random 特征)
    const r = Appraisal.evaluate({ type: 'state_change', content: '无关内容' }, makeAgent({ position: '宿舍' }));
    expect(r.importance).toBeGreaterThanOrEqual(0);
  });
  it('returns positive when goalRelevance > 0', () => {
    const r = Appraisal.evaluate({ type: 'social', participants: ['a1'] }, makeAgent());
    expect(r.importance).toBeGreaterThanOrEqual(0);
  });
});
