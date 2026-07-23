/**
 * B1 回归测试 — continuous spatial + active actionSelection 下 move 不被同 tick 回滚
 *
 * 根因:
 *   active writeback 在 ActionSelectionRuntime.applyActionStateDeltas 里把
 *   agent.position 跳到目标区域，并通过 env._setRegionChanged 同步 RegionGrid，
 *   但不同步 SpatialEngine._coords（连续坐标）。随后 Phase 5 调 SpatialEngine.tick()
 *   → _syncRegions() 用陈旧 _coords 反推区域，因坐标仍在旧区域，反推出 to=旧区域，
 *   与 agent.position(目标区域) 不符，于是 _evaluateSpatialInteractions() 用
 *   PositionDelta(to:旧区域) 把 agent.position 回滚。
 *
 * 修复后: _setRegionChanged 在 continuous 模式下同时调 spatial.setCoords(regionCenter)，
 *   使 _syncRegions 反推出 to=目标区域==agent.position，不产生 regionChanges，move 生效。
 */

import { describe, it, expect } from 'vitest';
import AndyEngine from '../../index.js';
import RuntimeContext from '../../src/runtime/RuntimeContext.js';
import { applyActionStateDeltas } from '../../src/agent/runtime/ActionSelectionRuntime.js';

describe('B1: continuous spatial + active move 不被同 tick 回滚', () => {
  // @characterization — direct state injection; not Beta evidence
  it('active writeback 后 agent.position 应停留在目标区域', () => {
    const engine = new AndyEngine({
      startTime: new Date('2025-06-01T10:00:00'),
      seed: 42,
      spatial: 'continuous',
    });

    const agentId = 'alice';
    engine.createCharacter({
      id: agentId, name: '小爱', mbti: 'ENFJ',
      schedule: 'student', initialPosition: '宿舍',
    });

    const world = engine.world;
    const agent = world.getAgent(agentId);
    expect(agent).toBeTruthy();
    expect(world.spatial).toBeTruthy(); // continuous 模式应有 spatial 引擎

    const positionBefore = agent.position; // '宿舍'
    expect(positionBefore).toBe('宿舍');

    // 用 active writeback 路径把 agent 显式移到 '图书馆'（一个不同区域）
    const ctx = new RuntimeContext({
      world,
      clock: world.clock,
      config: world.runtimeConfig,
      domain: world.domain,
      rng: world.rng,
    });
    const env = ctx.buildAgentEnv(world.runtimeConfig.tickMinutes);

    applyActionStateDeltas(agent, {
      location: { to: '图书馆', reason: 'action_move' },
    }, env);

    // Phase 4 结果: agent.position 应已变为目标区域
    expect(agent.position).toBe('图书馆');

    // Phase 5: 跑 SpatialEngine.tick() —— 修复前这里会把 agent.position 回滚到 '宿舍'
    const spatialResult = world.spatial.tick(world.agents, world.socialGraph);

    // 修复后: 不应产生针对该 agent 的 regionChange 回滚
    const rollback = spatialResult.regionChanges.find(c => c.agentId === agentId);
    expect(rollback).toBeUndefined();

    // 最终 agent.position 必须停留在目标区域，不被同 tick 回滚
    expect(agent.position).toBe('图书馆');
  });

  it('真实 engine.tick() active path 应保持动作目标区域', () => {
    const engine = new AndyEngine({
      startTime: new Date('2025-06-01T10:00:00'),
      seed: 42,
      spatial: 'continuous',
      actionSelection: {
        enabled: true,
        mode: 'active',
        temperature: 0,
        recordTraces: true,
        maxTraceHistory: 10,
      },
    });

    engine.createCharacter({
      id: 'alice', name: 'Alice', mbti: 'ENFJ',
      schedule: { entries: [] }, initialPosition: '宿舍',
    });

    const world = engine.world;
    const agent = world.getAgent('alice');
    agent.runtime.handlers.schedule.tick = () => {};
    agent._candidateProviderManager = {
      generateAll() {
        return [{
          id: 'move', type: 'move', source: 'test', target: '图书馆', label: 'move',
          constraints: {}, metadata: {},
        }];
      },
    };

    const result = engine.tick();

    expect(agent._actionTraceHistory.at(-1).selectedAction).toBe('move');
    expect(result.phase.agentThink.results.alice.regionChanged).toBe(false);
    expect(agent.position).toBe('图书馆');
    expect(world.spatial.worldMap.pointToRegion(world.spatial.getCoords('alice').x, world.spatial.getCoords('alice').y)).toBe('图书馆');
  });
});
