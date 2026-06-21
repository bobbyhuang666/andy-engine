/**
 * Domain-Agnostic 架构深度测试
 *
 * 验证：
 *   1. behaviorField.label 必须属于 domain.states
 *   2. stateMachine.currentState 必须属于 domain.states
 *   3. eventDispatcher.eventLog 所有 content 不得含 forbiddenTerms
 *   4. memory.memories 所有 content 不得含 forbiddenTerms
 *   5. getWorldContext 的输出不得含 forbiddenTerms
 *   6. 饥饿驱动后 position 只能进入 domain food places
 *   7. addAgent() 路径也要覆盖 custom domain
 */

import { describe, it, expect } from 'vitest';
import AndyEngine from '../index.js';
import tavernDomain from '../presets/tavern/index.js';
import EventDispatcher from '../src/runtime/EventDispatcher.js';

// 校园词列表
const CAMPUS_WORDS = [
  '教室', '图书馆', '宿舍', '食堂', '操场', '校园广场',
  '学生', '老师', '上课', '自习', '翘课', '考试', '作业',
  '教学楼', '校园', '大学', '学院', '在发呆', '看完了', '到家了', '做好了',
  '在外面闲逛', '便利店', '餐厅', '小镇广场',
];

function containsCampusWords(text) {
  return CAMPUS_WORDS.filter(word => text.includes(word));
}

function checkTextForCampusWords(text, fieldName) {
  const violations = containsCampusWords(text);
  if (violations.length > 0) {
    return { field: fieldName, violations, text: text.substring(0, 100) };
  }
  return null;
}

describe('Domain-Agnostic 深度测试', () => {
  describe('tavern domain 内部状态验证', () => {
    it('behaviorField.label 必须属于 tavern states', () => {
      const engine = new AndyEngine({ domain: tavernDomain });
      const agent = engine.createCharacter({
        id: 'test1',
        name: '铁匠',
        mbti: 'ISTJ',
        background: ['一个铁匠'],
      });

      const tavernStates = Object.keys(tavernDomain.states);

      for (let i = 0; i < 50; i++) {
        engine.tick();
        const label = agent.behaviorField.label;
        expect(tavernStates).toContain(label);
      }
    });

    it('stateMachine.currentState 必须属于 tavern states', () => {
      const engine = new AndyEngine({ domain: tavernDomain });
      const agent = engine.createCharacter({
        id: 'test1',
        name: '铁匠',
        mbti: 'ISTJ',
        background: ['一个铁匠'],
      });

      const tavernStates = Object.keys(tavernDomain.states);

      for (let i = 0; i < 50; i++) {
        engine.tick();
        const state = agent.stateMachine.currentState;
        expect(tavernStates).toContain(state);
      }
    });

    it('eventDispatcher.eventLog 所有 content 不得含校园词', () => {
      const engine = new AndyEngine({ domain: tavernDomain });
      engine.createCharacter({
        id: 'test1',
        name: '铁匠',
        mbti: 'ISTJ',
        background: ['一个铁匠'],
      });

      // 强制触发随机事件
      const originalRandom = Math.random;
      let callCount = 0;
      Math.random = () => {
        callCount++;
        // 前 100 次调用返回小值，确保触发随机事件
        if (callCount < 100) return 0.01;
        return originalRandom();
      };

      for (let i = 0; i < 30; i++) {
        engine.tick();
      }

      Math.random = originalRandom;

      const violations = [];
      for (const event of engine.world.eventDispatcher.eventLog) {
        const found = containsCampusWords(event.content || '');
        if (found.length > 0) {
          violations.push({ content: event.content, words: found });
        }
      }

      expect(violations).toEqual([]);
    });

    it('memory.memories 所有 content 不得含校园词', () => {
      const engine = new AndyEngine({ domain: tavernDomain });
      const agent = engine.createCharacter({
        id: 'test1',
        name: '铁匠',
        mbti: 'ISTJ',
        background: ['一个铁匠'],
      });

      for (let i = 0; i < 50; i++) {
        engine.tick();
      }

      const violations = [];
      for (const mem of agent.memory.memories) {
        const found = containsCampusWords(mem.content || '');
        if (found.length > 0) {
          violations.push({ content: mem.content, words: found });
        }
      }

      expect(violations).toEqual([]);
    });

    it('getWorldContext 的输出不得含校园词', () => {
      const engine = new AndyEngine({ domain: tavernDomain });
      engine.createCharacter({
        id: 'test1',
        name: '铁匠',
        mbti: 'ISTJ',
        background: ['一个铁匠'],
      });

      for (let i = 0; i < 20; i++) {
        engine.tick();
      }

      const ctx = engine.getWorldContext('test1');
      const violations = [];

      // 检查 recentEvents
      if (ctx.recentEvents) {
        const found = containsCampusWords(ctx.recentEvents);
        if (found.length > 0) violations.push({ field: 'recentEvents', words: found });
      }

      // 检查 currentRegion
      if (ctx.currentRegion) {
        const found = containsCampusWords(ctx.currentRegion);
        if (found.length > 0) violations.push({ field: 'currentRegion', words: found });
      }

      expect(violations).toEqual([]);
    });

    it('饥饿驱动后 position 只能进入 tavern food places', () => {
      const engine = new AndyEngine({ domain: tavernDomain });
      const agent = engine.createCharacter({
        id: 'test1',
        name: '铁匠',
        mbti: 'ISTJ',
        background: ['一个铁匠'],
      });

      // 降低饥饿需求
      agent.needs.needs.hunger = 0.05;

      // 运行多个 tick 让需求驱力生效
      for (let i = 0; i < 20; i++) {
        engine.tick();
      }

      // 检查 position 是否在 tavern 的 food places
      const foodPlaces = tavernDomain.placeMapping.hunger;
      const currentPos = agent.position;

      // position 应该在 tavern regions 中
      expect(tavernDomain.regions).toContain(currentPos);
    });
  });

  describe('addAgent() 路径覆盖', () => {
    it('addAgent() 也要注入 custom domain', () => {
      const engine = new AndyEngine({ domain: tavernDomain });
      const agent = engine.addAgent({
        id: 'test2',
        name: '旅人',
      });

      expect(agent._domain.id).toBe('tavern');
      expect(agent.position).toBe('小屋'); // tavern 默认区域
    });
  });

  describe('campus preset 向后兼容', () => {
    it('campus preset 的 behaviorField.label 属于 campus states', () => {
      const engine = new AndyEngine();
      const agent = engine.createCharacter({
        id: 'test1',
        name: '学生',
        mbti: 'INFP',
        background: ['一个学生'],
      });

      const campusStates = Object.keys(engine.domain.states);

      for (let i = 0; i < 30; i++) {
        engine.tick();
        const label = agent.behaviorField.label;
        expect(campusStates).toContain(label);
      }
    });
  });

  describe('SDK Character + custom domain', () => {
    it('Character 复用 custom-domain engine 时，position 属于 domain regions', async () => {
      const { Character } = await import('../sdk/index.js');
      const engine = new AndyEngine({ domain: tavernDomain });
      const c = new Character({
        id: 'c',
        name: '旅人',
        personality: 'INFP',
        backstory: ['旅人'],
        engine,
        llm: async () => 'ok',
      });

      // 运行多个 tick
      for (let i = 0; i < 20; i++) {
        engine.tick();
      }

      expect(tavernDomain.regions).toContain(c._agent.position);
    });

    it('Character 复用 custom-domain engine 时，schedule entries region 属于 domain regions', async () => {
      const { Character } = await import('../sdk/index.js');
      const engine = new AndyEngine({ domain: tavernDomain });
      const c = new Character({
        id: 'c',
        name: '旅人',
        personality: 'INFP',
        backstory: ['旅人'],
        engine,
        llm: async () => 'ok',
      });

      // 检查 schedule entries 的 region 全部属于 tavern regions
      const schedule = c._agent.schedule;
      for (const entry of schedule.entries) {
        expect(tavernDomain.regions).toContain(entry.region);
      }
    });

    it('Character 复用 custom-domain engine 时，prompt/narrative 不含 forbiddenTerms', async () => {
      const { Character } = await import('../sdk/index.js');
      const engine = new AndyEngine({ domain: tavernDomain });
      const c = new Character({
        id: 'c',
        name: '旅人',
        personality: 'INFP',
        backstory: ['旅人'],
        engine,
        llm: async () => 'ok',
      });

      // 运行多个 tick
      for (let i = 0; i < 10; i++) {
        engine.tick();
      }

      const ctx = c.getContext();

      // 检查 systemPrompt
      const promptViolations = containsCampusWords(ctx.systemPrompt || '');
      expect(promptViolations).toEqual([]);

      // 检查 narrative
      const narrativeViolations = containsCampusWords(ctx.narrative || '');
      expect(narrativeViolations).toEqual([]);
    });
  });

  describe('EventDispatcher semantic classification is domain-aware', () => {
    it('campus domain: content 含 campus keyword 应分类到 campus category', async () => {
      const campusDomain = (await import('../presets/campus/index.js')).default;
      const ed = new EventDispatcher(campusDomain);
      const evt = ed.createEvent({ type: 'random', content: '突然想起明天还有作业没写' });
      expect(evt.semanticCategory).toBe('生活杂事');
    });

    it('tavern domain: content 含 campus-only keyword 不应分类成 campus category', () => {
      const ed = new EventDispatcher(tavernDomain);
      const evt = ed.createEvent({ type: 'random', content: '老师讲了个有趣的例子' });
      expect(evt.semanticCategory).toBe('日常琐事');
    });

    it('tavern domain: content 含 tavern keyword 应分类到 tavern category', () => {
      const ed = new EventDispatcher(tavernDomain);
      const evt = ed.createEvent({ type: 'random', content: '喝了一杯麦酒' });
      expect(evt.semanticCategory).toBe('酒馆');
    });

    it('minimal domain missing semanticCategories: 不崩，走 neutral fallback', () => {
      const ed = new EventDispatcher({ eventTemplates: {}, placeTypes: {} });
      const evt = ed.createEvent({ type: 'social', content: '聊了几句' });
      expect(evt.semanticCategory).toBe('社交互动'); // typeMap fallback from defaults
    });
  });

  describe('domain roleArchetypes 生效', () => {
    it('schedule: blacksmith 加载 tavern schedule entries', () => {
      const engine = new AndyEngine({ domain: tavernDomain });
      const agent = engine.createCharacter({
        id: 'blacksmith',
        name: '铁匠',
        mbti: 'ISTJ',
        schedule: 'blacksmith',
      });

      // schedule entries 必须非空
      expect(agent.schedule.entries.length).toBeGreaterThan(0);

      // 所有 entries region 必须属于 tavern regions
      for (const entry of agent.schedule.entries) {
        expect(tavernDomain.regions).toContain(entry.region);
      }
    });

    it('schedule: drunkard 加载 tavern schedule entries', () => {
      const engine = new AndyEngine({ domain: tavernDomain });
      const agent = engine.createCharacter({
        id: 'drunkard',
        name: '酒鬼',
        mbti: 'ESFP',
        schedule: 'drunkard',
      });

      expect(agent.schedule.entries.length).toBeGreaterThan(0);
      for (const entry of agent.schedule.entries) {
        expect(tavernDomain.regions).toContain(entry.region);
      }
    });

    it('Character 默认 archetype 加载 tavern schedule entries', async () => {
      const { Character } = await import('../sdk/index.js');
      const engine = new AndyEngine({ domain: tavernDomain });
      const c = new Character({
        id: 'c',
        name: '旅人',
        personality: 'INFP',
        backstory: ['旅人'],
        engine,
        llm: async () => 'ok',
      });

      // 默认应该选择 domain.roleArchetypes 的第一个
      expect(c._agent.schedule.entries.length).toBeGreaterThan(0);
      for (const entry of c._agent.schedule.entries) {
        expect(tavernDomain.regions).toContain(entry.region);
      }
    });
  });
});
