/**
 * Domain-Agnostic 架构测试
 *
 * 验证：
 *   1. 默认 campus preset 正常工作
 *   2. 自定义 tavernDomain 正常工作
 *   3. tavernDomain 不会出现校园词
 */

import { describe, it, expect } from 'vitest';
import AndyEngine from '../index.js';
import tavernDomain from '../presets/tavern/index.js';
import { DomainRegistry } from '../src/domain/DomainRegistry.js';
import { validateDomain } from '../src/domain/validateDomain.js';

// 校园词列表
const CAMPUS_WORDS = [
  '教室', '图书馆', '宿舍', '食堂', '操场', '校园广场',
  '学生', '老师', '上课', '自习', '翘课', '考试', '作业',
  '教学楼', '校园', '大学', '学院',
];

function containsCampusWords(text) {
  return CAMPUS_WORDS.filter(word => text.includes(word));
}

describe('Domain-Agnostic 架构', () => {
  // @characterization — direct state injection; not Beta evidence
  describe('DomainRegistry', () => {
    it('默认使用 campus preset', () => {
      const campusDomain = require('../presets/campus');
      const domain = new DomainRegistry(campusDomain, { validate: false });
      expect(domain.id).toBe('campus');
      expect(domain.regions).toContain('宿舍');
      expect(domain.regions).toContain('食堂');
    });

    it('可以使用自定义 domain', () => {
      const domain = new DomainRegistry(tavernDomain);
      expect(domain.id).toBe('tavern');
      expect(domain.regions).toContain('小屋');
      expect(domain.regions).toContain('酒馆');
      expect(domain.regions).not.toContain('宿舍');
    });

    it('getStateNames 返回正确的状态名', () => {
      const domain = new DomainRegistry(tavernDomain);
      const names = domain.getStateNames();
      expect(names).toContain('睡觉');
      expect(names).toContain('喝酒');
      expect(names).not.toContain('在上课');
    });
  });

  describe('validateDomain', () => {
    it('验证有效的 domain', () => {
      const result = validateDomain(tavernDomain);
      expect(result.valid).toBe(true);
      expect(result.errors.length).toBe(0);
    });

    it('检测无效的 domain', () => {
      const result = validateDomain({ id: 'test' });
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });
  });

  describe('campus preset（默认行为）', () => {
    it('new AndyEngine() 使用 campus preset', () => {
      const engine = new AndyEngine();
      expect(engine.domain.id).toBe('campus');
    });

    it('创建角色和 tick 正常工作', () => {
      const engine = new AndyEngine();
      const agent = engine.createCharacter({
        id: 'test1',
        name: '测试角色',
        mbti: 'INFP',
        background: ['一个测试角色'],
      });

      engine.tick();
      const narrative = agent.toNarrative();
      expect(narrative).toBeTruthy();
    });
  });

  describe('tavernDomain', () => {
    it('new AndyEngine({ domain: tavernDomain }) 使用 tavern domain', () => {
      const engine = new AndyEngine({ domain: tavernDomain });
      expect(engine.domain.id).toBe('tavern');
    });

    it('创建角色使用 tavern 的默认区域', () => {
      const engine = new AndyEngine({ domain: tavernDomain });
      const agent = engine.createCharacter({
        id: 'test1',
        name: '铁匠',
        mbti: 'ISTJ',
        background: ['一个铁匠'],
      });

      expect(agent.position).toBe('小屋');
    });

    it('tick 正常工作', () => {
      const engine = new AndyEngine({ domain: tavernDomain });
      engine.createCharacter({
        id: 'test1',
        name: '铁匠',
        mbti: 'ISTJ',
        background: ['一个铁匠'],
      });

      expect(() => engine.tick()).not.toThrow();
    });

    it('叙事不含校园词', () => {
      const engine = new AndyEngine({ domain: tavernDomain });
      const agent = engine.createCharacter({
        id: 'test1',
        name: '铁匠',
        mbti: 'ISTJ',
        background: ['一个铁匠'],
      });

      for (let i = 0; i < 20; i++) {
        engine.tick();
      }

      const narrative = agent.toNarrative();
      const violations = containsCampusWords(narrative);
      expect(violations).toEqual([]);
    });

    it('100 次 tick 无校园词', () => {
      const engine = new AndyEngine({ domain: tavernDomain });
      engine.createCharacter({
        id: 'test1',
        name: '铁匠',
        mbti: 'ISTJ',
        background: ['一个铁匠'],
      });

      let violations = [];
      for (let i = 0; i < 100; i++) {
        engine.tick();
        const agent = engine.getAgent('test1');
        const narrative = agent.toNarrative();
        const found = containsCampusWords(narrative);
        if (found.length > 0) {
          violations.push({ tick: i, words: found, narrative });
        }
      }

      expect(violations).toEqual([]);
    });

    it('需求驱力指向 tavern 区域', () => {
      const engine = new AndyEngine({ domain: tavernDomain });
      const agent = engine.createCharacter({
        id: 'test1',
        name: '铁匠',
        mbti: 'ISTJ',
        background: ['一个铁匠'],
      });

      // 降低饥饿需求
      agent.needs.needs.hunger = 0.1;
      const drive = agent.needs.getDrive();
      expect(drive).toBeTruthy();
      expect(drive.need).toBe('hunger');
      expect(drive.targetStates).toContain('喝酒');
      expect(drive.targetStates).not.toContain('在食堂');
    });
  });
});
