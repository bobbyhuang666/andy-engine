/**
 * AndyEngine 集成测试套件
 *
 * 迁移自 test.js 行 510-606
 * 原始 assert 数量：25 个
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import AndyEngine from '../../index.js';
import Schedule from '../../agent/Schedule.js';

describe('AndyEngine 集成测试', () => {
  let engine;
  let graph;

  beforeAll(() => {
    engine = new AndyEngine({
      startTime: new Date('2024-01-15T08:00:00'),
      weather: 'sunny',
      seed: 42,
    });

    const agentConfigs = [
      {
        id: 'bobby',
        name: 'Bobby',
        personality: { mbti: 'INFP' },
        schedule: Schedule.createStudentSchedule().toJSON(),
        initialPosition: '校园广场',
      },
      {
        id: 'xiaoming',
        name: '小明',
        personality: { mbti: 'ENFP' },
        schedule: Schedule.createStudentSchedule({
          morningClass: 9,
          workDays: [2, 4],
        }).toJSON(),
        initialPosition: '校园广场',
      },
      {
        id: 'xiaohong',
        name: '小红',
        personality: { mbti: 'ISFJ' },
        schedule: Schedule.createStudentSchedule({
          morningClass: 8,
          workDays: [1, 3, 5],
        }).toJSON(),
        initialPosition: '校园广场',
      },
    ];

    engine.addAgents(agentConfigs);
    graph = engine.getSocialGraph();
  });

  describe('Agent 添加', () => {
    it('应该有 3 个 Agent', () => {
      expect(engine.world.agents.size).toBe(3);
    });

    it('首次相遇前应该没有关系', () => {
      const relsBobby = graph.getRelationships('bobby');
      expect(relsBobby.length).toBe(0);
    });
  });

  describe('单个 Tick', () => {
    let tickResult;

    beforeAll(() => {
      tickResult = engine.tick();
    });

    it('第一个 tick 应该是 1', () => {
      expect(tickResult.tickNumber).toBe(1);
    });

    it('应该有阶段信息', () => {
      expect(tickResult.phase).toBeDefined();
    });

    it('应该有时间推进阶段', () => {
      expect(tickResult.phase.timeAdvance).toBeDefined();
    });

    it('应该有环境同步阶段', () => {
      expect(tickResult.phase.environmentSync).toBeDefined();
    });

    it('应该有 Agent 思考阶段', () => {
      expect(tickResult.phase.agentThink).toBeDefined();
    });

    it('应该有交互阶段', () => {
      expect(tickResult.phase.interaction).toBeDefined();
    });

    it('应该有事件分发阶段', () => {
      expect(tickResult.phase.eventDispatch).toBeDefined();
    });

    it('应该有持续时间', () => {
      expect(typeof tickResult.durationMs).toBe('number');
    });
  });

  describe('多次 Tick', () => {
    beforeAll(() => {
      engine.runTicks(50);
    });

    it('相遇后应该创建关系', () => {
      const relsAfterTicks = graph.getRelationships('bobby');
      expect(relsAfterTicks.length).toBeGreaterThan(0);
    });
  });

  describe('批量 Tick', () => {
    let results;

    beforeAll(() => {
      results = engine.runTicks(10);
    });

    it('应该完成 10 个 tick', () => {
      expect(results.length).toBe(10);
    });

    it('总 tick 数应该是 61', () => {
      expect(engine.world.tickCount).toBe(61);
    });
  });

  describe('世界快照', () => {
    it('应该有 agents', () => {
      const snap = engine.snapshot();
      expect(snap.agents).toBeDefined();
    });

    it('应该有 3 个 agent', () => {
      const snap = engine.snapshot();
      expect(Object.keys(snap.agents).length).toBe(3);
    });

    it('应该有 environment', () => {
      const snap = engine.snapshot();
      expect(snap.environment).toBeDefined();
    });
  });

  describe('Bobby 接口', () => {
    let ctx;

    beforeAll(() => {
      ctx = engine.getWorldContext('bobby');
    });

    it('应该存在', () => {
      expect(ctx).toBeDefined();
    });

    it('应该有时间', () => {
      expect(ctx.time).toBeDefined();
    });

    it('应该有小时', () => {
      expect(typeof ctx.hour).toBe('number');
    });

    it('应该有最近事件字符串', () => {
      expect(typeof ctx.recentEvents).toBe('string');
    });

    it('应该有情绪状态字符串', () => {
      expect(typeof ctx.emotionState).toBe('string');
    });

    it('应该有记忆上下文字符串', () => {
      expect(typeof ctx.memoryContext).toBe('string');
    });

    it('应该有附近的人字符串', () => {
      expect(typeof ctx.nearbyPeople).toBe('string');
    });
  });

  describe('统计信息', () => {
    it('tick 数应该正确', () => {
      const stats = engine.getStats();
      expect(stats.tickCount).toBe(61);
    });

    it('agent 数应该正确', () => {
      const stats = engine.getStats();
      expect(stats.agentCount).toBe(3);
    });
  });

  describe('序列化/反序列化', () => {
    it('应该保持 agent 数量', () => {
      const json = engine.toJSON();
      const restored = AndyEngine.fromJSON(json);
      expect(restored.world.agents.size).toBe(3);
    });

    it('应该保持 tick 数', () => {
      const json = engine.toJSON();
      const restored = AndyEngine.fromJSON(json);
      expect(restored.world.tickCount).toBe(61);
    });
  });
});
