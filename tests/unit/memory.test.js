/**
 * PersonalMemory 模块测试套件
 *
 * 迁移自 test.js 行 221-273
 * 原始 assert 数量：9 个
 */

import { describe, it, expect, beforeEach } from 'vitest';
import PersonalMemory from '../../agent/PersonalMemory.js';

describe('PersonalMemory 模块', () => {
  let mem;
  let mockEmotion;

  beforeEach(() => {
    mem = new PersonalMemory('test_agent', [
      { content: '喜欢吃泡面', category: 'food', emotionTag: 'happy' },
      { content: '经常失眠', category: 'sleep', emotionTag: 'sad' },
    ]);

    mockEmotion = {
      getArousal: () => 0.5,
      getValence: () => 0.3,
      getDominant: () => [{ dimension: 'joy', value: 0.3 }],
      current: { joy: 0.3 },
    };
  });

  describe('种子记忆加载', () => {
    it('应该加载种子记忆', () => {
      expect(mem.memories.length).toBe(2);
    });
  });

  describe('添加经历', () => {
    it('应该添加新记忆', () => {
      const event = {
        id: 'evt_test',
        type: 'social',
        content: '跟朋友一起吃了饭',
        participants: ['friend_1'],
        scope: 'local',
      };
      mem.addExperience(event, mockEmotion);
      expect(mem.memories.length).toBe(3);
    });
  });

  describe('检索', () => {
    beforeEach(() => {
      const event = {
        id: 'evt_test',
        type: 'social',
        content: '跟朋友一起吃了饭',
        participants: ['friend_1'],
        scope: 'local',
      };
      mem.addExperience(event, mockEmotion);
    });

    it('关键词检索应该找到相关记忆', () => {
      const { memories: results } = mem.retrieve({ keywords: ['泡面', '吃饭'] });
      expect(results.length).toBeGreaterThan(0);
    });

    it('情绪检索应该工作', () => {
      const { memories: emotionResults } = mem.retrieve({
        emotion: { joy: 0.5, sadness: -0.1 },
      });
      expect(emotionResults.length).toBeGreaterThan(0);
    });
  });

  describe('记忆衰减', () => {
    it('重要性应该保持正值', () => {
      mem.tick(24); // 24 小时
      for (const m of mem.memories) {
        expect(m.importance).toBeGreaterThan(0);
      }
    });
  });

  describe('toPromptString', () => {
    it('应该有内容', () => {
      const promptStr = mem.toPromptString();
      expect(promptStr.length).toBeGreaterThan(10);
    });
  });

  describe('序列化', () => {
    it('应该是数组', () => {
      const json = mem.toJSON();
      expect(Array.isArray(json)).toBe(true);
    });

    it('应该有正确数量', () => {
      const json = mem.toJSON();
      expect(json.length).toBe(2);
    });
  });
});
