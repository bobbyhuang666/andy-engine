/**
 * Agent 完整创建测试套件
 *
 * 迁移自 test.js 行 474-507
 * 原始 assert 数量：10 个
 */

import { describe, it, expect, beforeAll } from 'vitest';
import Agent from '../../agent/Agent.js';
import Schedule from '../../agent/Schedule.js';

describe('Agent 完整创建', () => {
  let agent;

  beforeAll(() => {
    agent = new Agent({
      id: 'bobby',
      name: 'Bobby',
      personality: { mbti: 'INFP' },
      schedule: Schedule.createStudentSchedule().toJSON(),
      seedMemories: [
        { content: '喜欢吃泡面', category: 'food' },
      ],
      initialPosition: '图书馆',
    });
  });

  describe('基础属性', () => {
    it('ID 应该正确', () => {
      expect(agent.id).toBe('bobby');
    });

    it('名字应该正确', () => {
      expect(agent.name).toBe('Bobby');
    });

    it('初始位置应该正确', () => {
      expect(agent.position).toBe('图书馆');
    });

    it('人格应该正确', () => {
      expect(agent.personality.mbti).toBe('INFP');
    });
  });

  describe('状态查询', () => {
    let status;

    beforeAll(() => {
      status = agent.getStatus();
    });

    it('应该有 ID', () => {
      expect(status.id).toBe('bobby');
    });

    it('应该有状态', () => {
      expect(status.state).toBeDefined();
    });

    it('应该有情绪字符串', () => {
      expect(typeof status.emotion).toBe('string');
    });

    it('应该有社交能量', () => {
      expect(typeof status.socialEnergy).toBe('number');
    });
  });

  describe('序列化/反序列化', () => {
    it('应该保持位置', () => {
      const json = agent.toJSON();
      const restored = new Agent(
        { id: 'bobby', name: 'Bobby', schedule: json.schedule },
        json
      );
      expect(restored.position).toBe('图书馆');
    });

    it('应该保持人格', () => {
      const json = agent.toJSON();
      const restored = new Agent(
        { id: 'bobby', name: 'Bobby', schedule: json.schedule },
        json
      );
      expect(restored.personality.mbti).toBe('INFP');
    });
  });
});
