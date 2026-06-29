/**
 * SER-1 回归测试 — SpatialEngine 连续坐标状态序列化/恢复
 *
 * 根因（已逐行复核）:
 *   SpatialEngine 持有 typed-array 连续状态 (_coords/_targets/_speeds/_moving/_regionNames)
 *   但无 snapshot/restore。AndyWorld.toJSON() 不发射 `spatial` 键；恢复路径只从 config
 *   重建 SpatialEngine，随后 addAgent() 用 regionCenter 重置 _coords、用 1.4 重置 _speeds。
 *   保存的连续 (x,y)/speeds/moving 状态全部丢失，agent 在 restore 后 snap 到区域中心。
 *
 * 修复后: toJSON() 发射 spatial.snapshot()；恢复时 spatial.restore() 还原 typed arrays；
 *   addAgent 对已存在的 agentId 幂等（不再覆盖已恢复坐标）。
 */

import { describe, it, expect } from 'vitest';
import AndyEngine from '../../index.js';

const EPS = 1e-6;

describe('SER-1: SpatialEngine continuous state serialized/restored', () => {
  it('restores continuous coords / speeds / moving after toJSON → fromJSON', () => {
    const engine = new AndyEngine({
      startTime: new Date('2025-06-01T08:00:00'),
      seed: 42,
      spatial: 'continuous',
    });

    const a1 = 'alice';
    const a2 = 'bob';
    engine.createCharacter({
      id: a1, name: '小爱', mbti: 'ENFJ',
      schedule: 'student', initialPosition: '宿舍',
    });
    engine.createCharacter({
      id: a2, name: '小博', mbti: 'ISTP',
      schedule: 'student', initialPosition: '教学楼',
    });

    const world = engine.world;
    expect(world.spatial).toBeTruthy();

    // 跑足够多的 tick，使 agent 获得非区域中心的连续坐标，且 _moving/_speeds 可能偏离默认。
    // 强制把 alice 的目标区域设为不同区域，驱动 _moveAgents 产生位移。
    const alice = world.getAgent(a1);
    alice.position = '图书馆';

    for (let i = 0; i < 20; i++) {
      engine.tick();
    }

    // 采集参考状态
    const spatial = world.spatial;
    const refCoords = spatial.getCoords(a1);
    const refIdx = spatial._agentIdToIdx.get(a1);
    expect(refIdx).toBeDefined();
    const refSpeed = spatial._speeds[refIdx];
    const refMoving = spatial._moving[refIdx];
    const refRegion = world.getAgent(a1).position;

    expect(refCoords).not.toBeNull();
    // 参考坐标应已偏离宿舍区域中心（连续坐标已演化）
    const dormCenter = spatial.worldMap.regionCenter('宿舍');
    const movedAwayFromDormCenter =
      Math.abs(refCoords.x - dormCenter.x) > EPS ||
      Math.abs(refCoords.y - dormCenter.y) > EPS;
    expect(movedAwayFromDormCenter).toBe(true);

    // ── 序列化 ──
    const json = engine.toJSON();
    expect(json.spatial).toBeDefined();
    expect(json.spatial).toBeTruthy();
    expect(Array.isArray(json.spatial.coords)).toBe(true);
    expect(json.spatial.agentIds).toContain(a1);

    // ── 恢复 ──
    const engine2 = AndyEngine.fromJSON(json);
    const world2 = engine2.world;
    const spatial2 = world2.spatial;
    expect(spatial2).toBeTruthy();

    const restoredCoords = spatial2.getCoords(a1);
    expect(restoredCoords).not.toBeNull();
    // 连续坐标应在 epsilon 内匹配参考值（修复前会 snap 到区域中心）
    expect(restoredCoords.x).toBeCloseTo(refCoords.x, 6);
    expect(restoredCoords.y).toBeCloseTo(refCoords.y, 6);

    const restoredIdx = spatial2._agentIdToIdx.get(a1);
    expect(restoredIdx).toBeDefined();
    expect(spatial2._speeds[restoredIdx]).toBeCloseTo(refSpeed, 6);
    expect(spatial2._moving[restoredIdx]).toBe(refMoving);

    // agent.position（区域）也应匹配
    expect(world2.getAgent(a1).position).toBe(refRegion);

    // ── 恢复后再跑 tick，不回滚、不崩溃 ──
    expect(() => {
      for (let i = 0; i < 5; i++) engine2.tick();
    }).not.toThrow();
  });

  it('backward compat: snapshots without a `spatial` key still load (discrete mode)', () => {
    // 离散模式（默认）不应发射 spatial 键
    const engine = new AndyEngine({
      startTime: new Date('2025-06-01T08:00:00'),
      seed: 7,
    });
    engine.createCharacter({
      id: 'carol', name: '小卡', mbti: 'ISFJ',
      schedule: 'student', initialPosition: '宿舍',
    });
    engine.tick();

    const json = engine.toJSON();
    // 默认离散模式：无 spatial 键
    expect(json.spatial).toBeUndefined();

    // 删除 spatial 键（模拟旧快照）也能正常恢复
    delete json.spatial;
    expect(() => AndyEngine.fromJSON(json)).not.toThrow();
  });
});
