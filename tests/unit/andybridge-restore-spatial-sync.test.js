/**
 * RC-1 回归测试 — AndyBridge restore 后 spatial _coords 同步
 *
 * 根因（已逐行复核）:
 *   AndyBridge._restoreAgents 设置 agent.position（区域名）后，不同步
 *   SpatialEngine._coords（也不调 regions.place）。下一 tick Phase 5
 *   SpatialEngine._syncRegions() 用陈旧 _coords（addAgent 时的区域中心默认值）
 *   反推出旧区域，emit regionChange，AndyWorld._evaluateSpatialInteractions()
 *   用 PositionDelta(to:旧区域) 把刚恢复的 agent.position 回滚。
 *
 * 修复后: _restoreAgents 在设置 agent.position 后，同步 spatial.setCoords 到
 *   恢复区域的中心（R41 SP-1 模式），并调 regions.place，使 _coords 与
 *   agent.position 一致，下一 tick _syncRegions 不产生回滚 regionChange。
 */

import { describe, it, expect } from 'vitest';
import AndyEngine from '../../index.js';
import { AndyBridge } from '../../src/sdk/AndyBridge.js';

describe('RC-1: AndyBridge restore syncs SpatialEngine._coords (no rollback after tick)', () => {
  it('_restoreAgents syncs _coords to restored region center (not stale)', () => {
    const engine = new AndyEngine({
      startTime: new Date('2025-06-01T08:00:00'),
      seed: 42,
      spatial: 'continuous',
    });

    const agentId = 'alice';
    engine.createCharacter({
      id: agentId, name: '小爱', mbti: 'ENFJ',
      schedule: 'student', initialPosition: '宿舍',
    });

    const world = engine.world;
    expect(world.spatial).toBeTruthy();
    const constructRegion = '宿舍';

    // 把 _coords 显式置为构造区域中心（模拟 addAgent 后的陈旧默认值）。
    const constructCenter = world.spatial.worldMap.regionCenter(constructRegion);
    world.spatial.setCoords(agentId, constructCenter.x, constructCenter.y);

    const bridge = new AndyBridge({
      andy: engine,
      persistence: { type: 'memory' },
      agentId,
    });
    bridge._initialized = true;

    // 恢复到一个与构造区域不同的区域。
    const restoredRegion = '图书馆';
    const state = JSON.stringify({ id: agentId, position: restoredRegion });
    bridge._restoreAgents(Buffer.from(state));

    const agent = world.getAgent(agentId);
    expect(agent.position).toBe(restoredRegion);

    // 修复后: _coords 应已同步到恢复区域的中心（不再是构造区域中心）。
    const coords = world.spatial.getCoords(agentId);
    expect(coords).not.toBeNull();
    const coordsRegion = world.spatial.worldMap.pointToRegion(coords.x, coords.y);
    expect(coordsRegion).toBe(restoredRegion);
    expect(coordsRegion).not.toBe(constructRegion);

    // RegionGrid 也应同步到恢复区域（agent 在该区域 occupancy 中）。
    expect(world.regions.snapshot()[restoredRegion]).toContain(agentId);
  });

  it('after restore, _syncRegions produces no rollback regionChange', () => {
    const engine = new AndyEngine({
      startTime: new Date('2025-06-01T08:00:00'),
      seed: 42,
      spatial: 'continuous',
    });

    const agentId = 'alice';
    engine.createCharacter({
      id: agentId, name: '小爱', mbti: 'ENFJ',
      schedule: 'student', initialPosition: '宿舍',
    });

    const world = engine.world;
    const constructRegion = '宿舍';
    const constructCenter = world.spatial.worldMap.regionCenter(constructRegion);
    world.spatial.setCoords(agentId, constructCenter.x, constructCenter.y);

    const bridge = new AndyBridge({
      andy: engine,
      persistence: { type: 'memory' },
      agentId,
    });
    bridge._initialized = true;

    const restoredRegion = '图书馆';
    const state = JSON.stringify({ id: agentId, position: restoredRegion });
    bridge._restoreAgents(Buffer.from(state));

    const agent = world.getAgent(agentId);
    expect(agent.position).toBe(restoredRegion);

    // 直接调用 _syncRegions：修复后 coords 已对齐到 restoredRegion，
    // pointToRegion(coords) === agent.position → 不产生 regionChange。
    // （修复前 coords 仍在 constructRegion 中心 → 产生 {to: constructRegion} 回滚。）
    const regionChanges = world.spatial._syncRegions(world.agents);
    const rollback = regionChanges.find(c => c.agentId === agentId);
    expect(rollback).toBeUndefined();
  });

  it('does not crash when spatial is null (discrete mode)', () => {
    const engine = new AndyEngine({
      startTime: new Date('2025-06-01T08:00:00'),
      seed: 3,
    });
    // 离散模式：无 spatial
    expect(engine.world.spatial).toBeNull();

    const agentId = 'dan';
    engine.createCharacter({
      id: agentId, name: '小丹', mbti: 'ENTJ',
      schedule: 'student', initialPosition: '宿舍',
    });

    const bridge = new AndyBridge({
      andy: engine,
      persistence: { type: 'memory' },
      agentId,
    });
    bridge._initialized = true;

    const state = JSON.stringify({ id: agentId, position: '图书馆' });
    expect(() => bridge._restoreAgents(Buffer.from(state))).not.toThrow();
    expect(engine.world.getAgent(agentId).position).toBe('图书馆');
  });
});
