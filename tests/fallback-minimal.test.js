/**
 * Fallback 测试
 *
 * 构造极简 custom domain，故意缺少 appraisalConfig / narrativeTemplates / skipBehavior / needRegionConfig。
 * 验证不会 fallback 到 campus terms。
 */

import { describe, it, expect } from 'vitest';
import AndyEngine from '../index.js';
import { DomainRegistry } from '../domain/DomainRegistry.js';

// 极简 domain，故意缺少多个配置
const minimalDomain = {
  id: 'minimal',
  name: '极简世界观',
  version: '1.0.0',

  regions: ['小屋', '广场', '酒馆'],
  adjacency: [['小屋', '广场', 1], ['广场', '酒馆', 1]],
  regionCoords: {
    '小屋': { shape: 'rect', x: 50, y: 50, w: 60, h: 40 },
    '广场': { shape: 'circle', cx: 200, cy: 150, radius: 50 },
    '酒馆': { shape: 'rect', x: 300, y: 100, w: 80, h: 60 },
  },

  placeTypes: {
    food: ['酒馆'],
    rest: ['小屋'],
    social: ['酒馆', '广场'],
    work: [],
    sleep: ['小屋'],
    explore: ['广场'],
    outdoor: ['广场'],
  },

  states: {
    '睡觉': { next: ['醒来'], hours: [0,1,2,3,4,5,6,7,8], category: 'sleep' },
    '醒来': { next: ['闲逛', '工作'], hours: [6,7,8,9], category: 'morning' },
    '闲逛': { next: ['喝酒', '工作', '休息'], hours: [8,9,10,11,12,13,14,15,16,17,18,19], category: 'social' },
    '喝酒': { next: ['闲逛', '休息'], hours: [10,11,12,13,14,15,16,17,18,19,20,21,22,23], category: 'social' },
    '工作': { next: ['休息', '闲逛'], hours: [8,9,10,11,12,13,14,15,16,17], category: 'active' },
    '休息': { next: ['闲逛', '睡觉'], hours: [0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23], category: 'rest' },
  },

  stateCenters: {
    '睡觉': [0.00, 0.00, 0.00, 0.00],
    '醒来': [0.15, 0.05, 0.10, 0.08],
    '闲逛': [0.40, 0.60, 0.15, 0.50],
    '喝酒': [0.30, 0.80, 0.20, 0.70],
    '工作': [0.70, 0.15, 0.75, 0.20],
    '休息': [0.10, 0.10, 0.10, 0.10],
  },

  labelTimePenalties: {},

  needSatisfactionMap: {
    hunger: { states: ['喝酒'], regions: ['酒馆'] },
    energy: { states: ['睡觉', '休息'], regions: [] },
    social: { states: ['喝酒', '闲逛'], regions: ['酒馆', '广场'] },
    comfort: { states: ['休息', '睡觉'], regions: ['小屋'] },
    stimulation: { states: ['闲逛'], regions: ['广场'] },
  },

  needDriveStates: {
    hunger: ['喝酒'],
    energy: ['休息', '睡觉'],
    social: ['喝酒', '闲逛'],
    comfort: ['休息', '睡觉'],
    stimulation: ['闲逛'],
  },

  eventTemplates: {
    genericEvents: [
      { content: '看到一只猫', delta: { interest: 0.03 } },
    ],
    timeEvents: {},
    weatherEvents: {},
    regionEvents: {},
  },

  memoryTemplates: {
    semanticCategories: {
      typeMap: { social: '社交', general: '日常' },
      keywordMap: {},
      stateCategoryMap: {},
    },
  },

  // 故意缺少 appraisalConfig
  // 故意缺少 intrinsicMotivationConfig
  // 故意缺少 skipBehavior
  // 故意缺少 needRegionConfig
  // 故意缺少 narrativeTemplates
  // 故意缺少 roleArchetypes

  fallback: {
    defaultRegion: '小屋',
    defaultState: '休息',
    unknownState: '闲逛',
    unknownRegion: '广场',
  },

  forbiddenTerms: ['教室', '图书馆', '宿舍', '食堂', '学生', '老师'],
};

// 校园词列表
const CAMPUS_WORDS = [
  '教室', '图书馆', '宿舍', '食堂', '操场', '校园广场',
  '学生', '老师', '上课', '自习', '翘课', '考试', '作业',
];

function containsCampusWords(text) {
  return CAMPUS_WORDS.filter(word => text.includes(word));
}

describe('Fallback 测试：极简 domain 不泄漏 campus terms', () => {
  it('极简 domain tick 正常工作', () => {
    const engine = new AndyEngine({ domain: minimalDomain });
    engine.createCharacter({
      id: 'test1',
      name: '居民',
      mbti: 'ISTJ',
      background: ['一个居民'],
    });

    expect(() => engine.tick()).not.toThrow();
  });

  it('极简 domain position 属于 domain regions', () => {
    const engine = new AndyEngine({ domain: minimalDomain });
    const agent = engine.createCharacter({
      id: 'test1',
      name: '居民',
      mbti: 'ISTJ',
      background: ['一个居民'],
    });

    for (let i = 0; i < 30; i++) {
      engine.tick();
    }

    expect(minimalDomain.regions).toContain(agent.position);
  });

  it('极简 domain state 属于 domain states', () => {
    const engine = new AndyEngine({ domain: minimalDomain });
    const agent = engine.createCharacter({
      id: 'test1',
      name: '居民',
      mbti: 'ISTJ',
      background: ['一个居民'],
    });

    const states = Object.keys(minimalDomain.states);

    for (let i = 0; i < 30; i++) {
      engine.tick();
      expect(states).toContain(agent.stateMachine.currentState);
    }
  });

  it('极简 domain narrative 不含 campus words', () => {
    const engine = new AndyEngine({ domain: minimalDomain });
    const agent = engine.createCharacter({
      id: 'test1',
      name: '居民',
      mbti: 'ISTJ',
      background: ['一个居民'],
    });

    for (let i = 0; i < 30; i++) {
      engine.tick();
    }

    const narrative = agent.toNarrative();
    const violations = containsCampusWords(narrative);
    expect(violations).toEqual([]);
  });

  it('极简 domain worldContext 不含 campus words', () => {
    const engine = new AndyEngine({ domain: minimalDomain });
    engine.createCharacter({
      id: 'test1',
      name: '居民',
      mbti: 'ISTJ',
      background: ['一个居民'],
    });

    for (let i = 0; i < 20; i++) {
      engine.tick();
    }

    const ctx = engine.getWorldContext('test1');
    const violations = [];

    if (ctx.currentRegion) {
      const found = containsCampusWords(ctx.currentRegion);
      if (found.length > 0) violations.push({ field: 'currentRegion', words: found });
    }

    if (ctx.recentEvents) {
      const found = containsCampusWords(ctx.recentEvents);
      if (found.length > 0) violations.push({ field: 'recentEvents', words: found });
    }

    expect(violations).toEqual([]);
  });
});
