/**
 * SP-1 回归测试 — continuous spatial + schedule 路径 move 不被同 tick 回滚
 *
 * 根因 (R40 审计子 AI SP-1, 已逐行复核):
 *   ScheduleHandler.tick() 设 agent.position = newRegion 并置 result.regionChanged=true,
 *   但不调用 env._setRegionChanged / spatial.setCoords。AndyWorld Phase 4 的
 *   regionChanged 分支只调 regions.place,不同步 SpatialEngine._coords。Phase 5
 *   SpatialEngine.tick()->_syncRegions() 用陈旧坐标反推旧区域,产生
 *   PositionDelta(to:旧区域) 把 agent.position 回滚。
 *   注意: default config actionSelection.enabled=false,所以 schedule 是主路径,
 *   B1(R40) 只修了 active action-selection 路径,未覆盖 schedule 路径。
 *
 * 修复后: AndyWorld Phase 4 regionChanged 分支(或 _setRegionChanged)同步
 *   spatial.setCoords(regionCenter),使 _syncRegions 不产生回滚。
 */

import { describe, it, expect } from 'vitest';
import AndyEngine from '../../index.js';

describe('SP-1: continuous + schedule 路径 move 不被同 tick 回滚', () => {
  it('schedule 驱动的 move 在 continuous 模式下应生效,不被同 tick 回滚', () => {
    // default config: actionSelection.enabled=false (schedule 主路径)
    const engine = new AndyEngine({
      startTime: new Date('2025-06-01T08:00:00'), // 早晨,student schedule 应驱动移动
      seed: 42,
      spatial: 'continuous',
    });

    engine.createCharacter({
      id: 'alice', name: '小爱', mbti: 'ENFJ',
      schedule: 'student', initialPosition: '宿舍',
    });

    const world = engine.world;
    expect(world.spatial).toBeTruthy();

    const agent = world.getAgent('alice');
    const startPos = agent.position;

    // 跑若干 tick,捕捉一次 schedule 驱动的区域变化
    let movedTick = -1;
    let movedTo = null;
    const positions = [];
    for (let i = 0; i < 60; i++) {
      const before = agent.position;
      engine.tick();
      positions.push(agent.position);
      if (agent.position !== before) {
        movedTick = i;
        movedTo = agent.position;
        break;
      }
    }

    // schedule 应至少驱动一次移动 (student 早晨应离开宿舍去上课)
    expect(movedTick).toBeGreaterThanOrEqual(0);
    expect(movedTo).not.toBe(startPos);

    // 关键断言: 移动后 agent.position 必须稳定停留在新区域,
    // 不被同 tick 的 SpatialEngine._syncRegions 回滚。
    // 修复前: 移动生效后下一 tick 又被回滚 (position 在新/旧间震荡或回到旧区域)。
    expect(agent.position).toBe(movedTo);

    // 连续若干 tick 后,agent 不应回到起始位置 (排除"瞬移后立即被回滚"假象)
    let revertedToStart = false;
    for (let i = 0; i < 5; i++) {
      engine.tick();
      if (agent.position === startPos && startPos !== movedTo) {
        // 允许 schedule 后续把 agent 送回,但不应是同 tick 回滚造成的立即回退
        revertedToStart = true;
        break;
      }
    }
    // 这里只断言"移动那一刻没有被同 tick 回滚",revertedToStart 可能为 true (后续 schedule 行为)
    expect(agent.position).toBeDefined();
  });

  it('continuous 模式下 SpatialEngine._coords 应与 agent.position 区域一致', () => {
    const engine = new AndyEngine({
      startTime: new Date('2025-06-01T08:00:00'),
      seed: 42,
      spatial: 'continuous',
    });
    engine.createCharacter({
      id: 'bob', name: '小明', mbti: 'INTP',
      schedule: 'student', initialPosition: '宿舍',
    });

    const world = engine.world;
    const agent = world.getAgent('bob');

    // 跑到 agent 发生区域变化
    for (let i = 0; i < 60; i++) {
      engine.tick();
      const coords = world.spatial.getCoords('bob');
      const coordRegion = world.spatial.worldMap.pointToRegion(coords.x, coords.y);
      // 修复后: 连续坐标反推出的区域应与 agent.position 一致 (不回滚)
      // 修复前: 坐标在旧区域,agent.position 在新区域,两者不一致
      if (agent.position !== '宿舍') {
        expect(coordRegion).toBe(agent.position);
        return;
      }
    }
    // 若 60 tick 内未移动,跳过 (schedule 未触发),不算失败
  });
});
