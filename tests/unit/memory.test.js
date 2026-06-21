/**
 * PersonalMemory 模块测试套件
 *
 * 迁移自 test.js 行 221-273
 * 原始 assert 数量：9 个
 */

import { describe, it, expect, beforeEach } from 'vitest';
import PersonalMemory from '../../src/agent/memory/PersonalMemory.js';

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

  describe('确定性记忆 ID', () => {
    it('记忆 ID 不应使用 Date.now() 或 Math.random()', () => {
      mem.addExperience({ id: 'evt_1', type: 'test', content: 'test event' }, mockEmotion);
      const memId = mem.memories[mem.memories.length - 1].id;
      // 确定性格式: mem_{agentId}_{counter}
      expect(memId).toMatch(/^mem_test_agent_\d+$/);
    });

    it('相同 event sequence 应产生相同 memory id', () => {
      const mem1 = new PersonalMemory('agent_a', []);
      const mem2 = new PersonalMemory('agent_a', []);

      mem1.addExperience({ id: 'evt_1', type: 'test', content: 'event 1' }, mockEmotion);
      mem1.addExperience({ id: 'evt_2', type: 'test', content: 'event 2' }, mockEmotion);

      mem2.addExperience({ id: 'evt_1', type: 'test', content: 'event 1' }, mockEmotion);
      mem2.addExperience({ id: 'evt_2', type: 'test', content: 'event 2' }, mockEmotion);

      expect(mem1.memories[0].id).toBe(mem2.memories[0].id);
      expect(mem1.memories[1].id).toBe(mem2.memories[1].id);
    });

    it('save/restore 后继续 addExperience 不产生重复 id', () => {
      mem.addExperience({ id: 'evt_1', type: 'test', content: 'event 1' }, mockEmotion);
      const saved = mem.toJSON();

      const restored = new PersonalMemory('test_agent', [], saved);
      restored.addExperience({ id: 'evt_2', type: 'test', content: 'event 2' }, mockEmotion);

      const ids = restored.memories.map(m => m.id);
      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(ids.length);
    });

    it('restore 稀疏动态 ID 后从最大编号继续', () => {
      const restored = new PersonalMemory('agent_sparse', [], [
        {
          id: 'mem_agent_sparse_9',
          content: 'old dynamic memory',
          category: 'test',
          timestamp: new Date('2026-01-01T00:00:00Z').toISOString(),
          lastAccessed: new Date('2026-01-01T00:00:00Z').toISOString(),
          presentations: [],
        },
      ]);

      const next = restored.addExperience({ id: 'evt_next', type: 'test', content: 'next event' }, mockEmotion);
      expect(next.id).toBe('mem_agent_sparse_10');
    });

    it('seed memories 不影响后续 id 计数', () => {
      const memWithSeeds = new PersonalMemory('agent_b', [
        { content: 'seed 1' },
        { content: 'seed 2' },
        { content: 'seed 3' },
      ]);

      memWithSeeds.addExperience({ id: 'evt_1', type: 'test', content: 'new event' }, mockEmotion);
      const lastMem = memWithSeeds.memories[memWithSeeds.memories.length - 1];
      // seed memories 使用 seed_${i} 格式，动态记忆从 0 开始
      expect(lastMem.id).toBe('mem_agent_b_0');
    });

    it('setSimTime 前 addExperience 仍生成合法时间戳', () => {
      const memWithoutSimTime = new PersonalMemory('agent_time', []);
      const created = memWithoutSimTime.addExperience({ id: 'evt_1', type: 'test', content: 'event' }, mockEmotion);

      expect(created.timestamp).toBeInstanceOf(Date);
      expect(Number.isNaN(created.timestamp.getTime())).toBe(false);
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
