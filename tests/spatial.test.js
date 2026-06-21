/**
 * 空间哈希网格系统测试
 */

import { describe, it, expect, beforeEach } from 'vitest';
import SpatialHash from '../src/spatial/SpatialHash.js';
import { WorldMap } from '../src/spatial/WorldMap.js';
import SpatialEngine from '../src/spatial/SpatialEngine.js';
import AndyEngine from '../index.js';

describe('SpatialHash 基础操作', () => {
  const grid = new SpatialHash({ worldWidth: 100, worldHeight: 100, cellSize: 10 });

  it('格子计算', () => {
    expect(grid.cols).toBe(10);
    expect(grid.rows).toBe(10);
    expect(grid.totalCells).toBe(100);
  });

  it('cellId 映射', () => {
    expect(grid.cellId(0, 0)).toBe(0);
    expect(grid.cellId(15, 25)).toBe(21);
    expect(grid.cellId(99, 99)).toBe(99);
  });

  it('重建网格和邻居查询', () => {
    const coords = new Float32Array([5, 5, 15, 5, 5, 15, 12, 8, 85, 85]);
    grid.rebuild(coords, 5);

    const stats = grid.stats();
    expect(stats.totalAgents).toBe(5);
    expect(stats.occupiedCells).toBe(4);

    const neighbors0 = grid.queryNeighbors(grid.cellId(5, 5));
    expect(neighbors0).toContain(0);
    expect(neighbors0).toContain(1);
    expect(neighbors0).toContain(2);
    expect(neighbors0).toContain(3);
    expect(neighbors0).not.toContain(4);
  });

  it('半径查询', () => {
    const coords = new Float32Array([5, 5, 15, 5, 5, 15, 12, 8, 85, 85]);
    grid.rebuild(coords, 5);

    const nearby0 = grid.queryRadius(coords, 0, 10);
    expect(nearby0.length).toBe(3);
    expect(nearby0.every(r => r.distSq <= 100)).toBe(true);

    const nearby4 = grid.queryRadius(coords, 4, 10);
    expect(nearby4.length).toBe(0);
  });
});

describe('WorldMap 区域几何', () => {
  const map = new WorldMap({
    width: 500, height: 500,
    regions: [
      { name: '图书馆', shape: 'rect', x: 100, y: 100, w: 80, h: 60 },
      { name: '食堂', shape: 'circle', cx: 300, cy: 300, radius: 40 },
    ],
  });

  it('包含判定', () => {
    expect(map.pointToRegion(140, 130)).toBe('图书馆');
    expect(map.pointToRegion(300, 300)).toBe('食堂');
    expect(map.pointToRegion(50, 50)).toBeNull();
  });

  it('中心点', () => {
    const libCenter = map.regionCenter('图书馆');
    expect(libCenter.x).toBe(140);
    expect(libCenter.y).toBe(130);
  });

  it('随机点在范围内', () => {
    const rand = map.regionToCoords('图书馆');
    expect(rand.x).toBeGreaterThanOrEqual(102);
    expect(rand.x).toBeLessThanOrEqual(178);
    expect(rand.y).toBeGreaterThanOrEqual(102);
    expect(rand.y).toBeLessThanOrEqual(158);
  });

  it('未知区域返回世界中心附近', () => {
    const unknown = map.regionToCoords('不存在');
    expect(Math.abs(unknown.x - 250)).toBeLessThan(30);
    expect(Math.abs(unknown.y - 250)).toBeLessThan(30);
  });
});

describe('SpatialEngine 完整流程', () => {
  let engine;

  beforeEach(() => {
    engine = new SpatialEngine({
      worldWidth: 500, worldHeight: 500,
      regions: [
        { name: 'A区', shape: 'rect', x: 0, y: 0, w: 50, h: 50 },
        { name: 'B区', shape: 'rect', x: 200, y: 200, w: 50, h: 50 },
      ],
    });
    engine.addAgent('alice', 'A区');
    engine.addAgent('bob', 'A区');
    engine.addAgent('carol', 'B区');
  });

  it('agent 注册和坐标', () => {
    const aliceCoords = engine.getCoords('alice');
    expect(aliceCoords).not.toBeNull();
    const aliceRegion = engine.worldMap.pointToRegion(aliceCoords.x, aliceCoords.y);
    expect(aliceRegion).toBe('A区');

    const carolCoords = engine.getCoords('carol');
    const carolRegion = engine.worldMap.pointToRegion(carolCoords.x, carolCoords.y);
    expect(carolRegion).toBe('B区');
  });

  it('tick 返回 encounters 和 regionChanges', () => {
    const result = engine.tick(new Map(), null);
    expect(Array.isArray(result.encounters)).toBe(true);
    expect(Array.isArray(result.regionChanges)).toBe(true);
  });

  it('附近查询', () => {
    const aliceNearby = engine.queryNearby('alice', 100);
    const hasBob = aliceNearby.some(n => n.agentId === 'bob');
    expect(hasBob).toBe(true);
  });

  it('setCoords 移动后查询更新', () => {
    engine.setCoords('carol', 20, 20);
    const carolNew = engine.getCoords('carol');
    expect(carolNew.x).toBe(20);
    expect(carolNew.y).toBe(20);

    const aliceNearby2 = engine.queryNearby('alice', 100);
    const hasCarol = aliceNearby2.some(n => n.agentId === 'carol');
    expect(hasCarol).toBe(true);
  });
});

describe('AndyEngine 连续坐标集成', () => {
  const andy = new AndyEngine({
    startTime: new Date('2025-06-01T10:00:00'),
    weather: 'sunny',
    spatial: 'continuous',
  });

  andy.createCharacter({
    id: 'alice', name: '小爱', mbti: 'ENFJ',
    schedule: 'student', initialPosition: '图书馆',
  });
  andy.createCharacter({
    id: 'bob', name: '小明', mbti: 'INTP',
    schedule: 'student', initialPosition: '图书馆',
  });
  andy.createCharacter({
    id: 'carol', name: '小红', mbti: 'ESFP',
    schedule: 'student', initialPosition: '食堂',
  });

  it('空间引擎已初始化', () => {
    expect(andy.world.spatial).not.toBeNull();
  });

  it('agent 有连续坐标', () => {
    expect(andy.world.spatial.getCoords('alice')).not.toBeNull();
    expect(andy.world.spatial.getCoords('bob')).not.toBeNull();
  });

  it('tick 正常执行', () => {
    const result = andy.tick();
    expect(result.durationMs).toBeGreaterThan(0);
    expect(result.phase.interaction).toBeDefined();
  });

  it('空间引擎统计正确', () => {
    for (let i = 0; i < 10; i++) andy.tick();
    const spatialStats = andy.world.spatial.getStats();
    expect(spatialStats.agents).toBe(3);
    expect(spatialStats.grid.totalAgents).toBe(3);
  });
});

describe('性能基准', () => {
  it('SpatialHash.rebuild 1000 agent < 5ms', () => {
    const N = 1000;
    const grid = new SpatialHash({ worldWidth: 500, worldHeight: 500, cellSize: 10 });
    const coords = new Float32Array(N * 2);
    for (let i = 0; i < N * 2; i++) coords[i] = Math.random() * 500;

    const iterations = 100;
    const t0 = Date.now();
    for (let i = 0; i < iterations; i++) grid.rebuild(coords, N);
    const rebuildMs = (Date.now() - t0) / iterations;
    expect(rebuildMs).toBeLessThan(5);
  });

  it('SpatialHash.queryNeighbors 100 查询 < 5ms', () => {
    const N = 1000;
    const grid = new SpatialHash({ worldWidth: 500, worldHeight: 500, cellSize: 10 });
    const coords = new Float32Array(N * 2);
    for (let i = 0; i < N * 2; i++) coords[i] = Math.random() * 500;
    grid.rebuild(coords, N);

    const iterations = 100;
    const t0 = Date.now();
    for (let i = 0; i < iterations; i++) {
      for (let a = 0; a < 100; a++) {
        const cid = grid.cellId(coords[a * 2], coords[a * 2 + 1]);
        grid.queryNeighbors(cid);
      }
    }
    const queryMs = (Date.now() - t0) / iterations;
    expect(queryMs).toBeLessThan(5);
  });
});
