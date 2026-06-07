/**
 * 空间哈希网格系统测试
 *
 * 测试：
 *   1. SpatialHash 基础操作
 *   2. WorldMap 区域几何
 *   3. SpatialEngine 完整集成
 *   4. 连续坐标 vs 区域标签对比
 */

const path = require('path');
const SpatialHash = require(path.join(__dirname, '..', 'spatial', 'SpatialHash'));
const { WorldMap } = require(path.join(__dirname, '..', 'spatial', 'WorldMap'));
const SpatialEngine = require(path.join(__dirname, '..', 'spatial', 'SpatialEngine'));
const AndyEngine = require(path.join(__dirname, '..', 'index'));

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    passed++;
    console.log(`  ✅ ${message}`);
  } else {
    failed++;
    console.log(`  ❌ ${message}`);
  }
}

// ═══════════════════════════════════════════
// Test 1: SpatialHash 基础
// ═══════════════════════════════════════════

console.log('\n=== Test 1: SpatialHash 基础操作 ===\n');

{
  const grid = new SpatialHash({ worldWidth: 100, worldHeight: 100, cellSize: 10 });

  // 格子计算
  assert(grid.cols === 10, '列数 = 10');
  assert(grid.rows === 10, '行数 = 10');
  assert(grid.totalCells === 100, '总格子数 = 100');

  // cellId
  assert(grid.cellId(0, 0) === 0, '坐标 (0,0) → 格子 0');
  assert(grid.cellId(15, 25) === 21, '坐标 (15,25) → 格子 21 (row=2, col=1)');
  assert(grid.cellId(99, 99) === 99, '坐标 (99,99) → 格子 99');

  // 重建网格
  const coords = new Float32Array([
    5, 5,     // agent 0 → cell (0,0) = 0
    15, 5,    // agent 1 → cell (1,0) = 1
    5, 15,    // agent 2 → cell (0,1) = 10
    12, 8,    // agent 3 → cell (1,0) = 1（与 agent 1 同格）
    85, 85,   // agent 4 → cell (8,8) = 88（远离其他人）
  ]);

  grid.rebuild(coords, 5);

  const stats = grid.stats();
  assert(stats.totalAgents === 5, '总 agent 数 = 5');
  assert(stats.occupiedCells === 4, '占用格子数 = 4（agent 1 和 3 同格）');

  // 邻居查询
  const neighbors0 = grid.queryNeighbors(grid.cellId(5, 5));
  // agent 0 在 cell 0，邻居是 cell 0 和相邻格子
  // agent 1 在 cell 1（相邻），agent 2 在 cell 10（相邻），agent 3 在 cell 1（相邻）
  assert(neighbors0.includes(0), 'agent 0 的邻居包含自身');
  assert(neighbors0.includes(1), 'agent 0 的邻居包含 agent 1（相邻格子）');
  assert(neighbors0.includes(2), 'agent 0 的邻居包含 agent 2（相邻格子）');
  assert(neighbors0.includes(3), 'agent 0 的邻居包含 agent 3（与 agent 1 同格）');
  assert(!neighbors0.includes(4), 'agent 0 的邻居不包含 agent 4（距离远）');

  // 半径查询
  const nearby0 = grid.queryRadius(coords, 0, 10);
  assert(nearby0.length === 3, 'agent 0 半径 10m 内有 3 个邻居');
  assert(nearby0.every(r => r.distSq <= 100), '所有邻居距离 ≤ 10m');

  const nearby4 = grid.queryRadius(coords, 4, 10);
  assert(nearby4.length === 0, 'agent 4 半径 10m 内无邻居');
}

// ═══════════════════════════════════════════
// Test 2: WorldMap 区域几何
// ═══════════════════════════════════════════

console.log('\n=== Test 2: WorldMap 区域几何 ===\n');

{
  const map = new WorldMap({
    width: 500,
    height: 500,
    regions: [
      { name: '图书馆', shape: 'rect', x: 100, y: 100, w: 80, h: 60 },
      { name: '食堂', shape: 'circle', cx: 300, cy: 300, radius: 40 },
    ],
  });

  // 包含判定
  assert(map.pointToRegion(140, 130) === '图书馆', '点 (140,130) 在图书馆内');
  assert(map.pointToRegion(300, 300) === '食堂', '点 (300,300) 在食堂内');
  assert(map.pointToRegion(50, 50) === null, '点 (50,50) 不在任何区域');

  // 中心点
  const libCenter = map.regionCenter('图书馆');
  assert(libCenter.x === 140 && libCenter.y === 130, '图书馆中心 = (140, 130)');

  // 随机点
  const rand = map.regionToCoords('图书馆');
  assert(rand.x >= 102 && rand.x <= 178, '图书馆随机 x 在范围内');
  assert(rand.y >= 102 && rand.y <= 158, '图书馆随机 y 在范围内');

  // 未知区域（返回世界中心附近随机偏移）
  const unknown = map.regionToCoords('不存在');
  assert(Math.abs(unknown.x - 250) < 30 && Math.abs(unknown.y - 250) < 30, '未知区域返回世界中心附近');
}

// ═══════════════════════════════════════════
// Test 3: SpatialEngine 完整流程
// ═══════════════════════════════════════════

console.log('\n=== Test 3: SpatialEngine 完整流程 ===\n');

{
  const engine = new SpatialEngine({
    worldWidth: 100,
    worldHeight: 100,
    cellSize: 15,            // 必须 ≥ interactionRadius
    interactionRadius: 15,
    maxInteractionsPerTick: 3,
    regions: [
      { name: 'A区', shape: 'rect', x: 10, y: 10, w: 40, h: 40 },
      { name: 'B区', shape: 'rect', x: 60, y: 60, w: 30, h: 30 },
    ],
  });

  // 模拟 agent Map
  const agents = new Map();
  agents.set('alice', { id: 'alice', position: 'A区' });
  agents.set('bob', { id: 'bob', position: 'A区' });
  agents.set('carol', { id: 'carol', position: 'B区' });

  engine.initialize(agents);

  const stats = engine.getStats();
  assert(stats.agents === 3, '注册了 3 个 agent');

  // 检查坐标
  const aliceCoords = engine.getCoords('alice');
  assert(aliceCoords !== null, 'alice 有坐标');
  assert(aliceCoords.x >= 12 && aliceCoords.x <= 48, 'alice 在 A 区内');
  assert(aliceCoords.y >= 12 && aliceCoords.y <= 48, 'alice 在 A 区内');

  const carolCoords = engine.getCoords('carol');
  assert(carolCoords.x >= 62 && carolCoords.x <= 88, 'carol 在 B 区内');

  // 运行 tick
  const result = engine.tick(agents, null);
  assert(Array.isArray(result.encounters), 'tick 返回 encounters 数组');
  assert(Array.isArray(result.regionChanges), 'tick 返回 regionChanges 数组');

  // 邻居查询
  const aliceNearby = engine.queryNearby('alice', 50);
  assert(aliceNearby.length >= 1, 'alice 附近有 agent（bob 在同一区域）');

  // 手动设置坐标测试
  engine.setCoords('carol', 20, 20); // 移到 A 区
  const carolNew = engine.getCoords('carol');
  assert(carolNew.x === 20 && carolNew.y === 20, 'setCoords 生效');

  const aliceNearby2 = engine.queryNearby('alice', 100); // A 区最大对角 ~57m
  const hasCarol = aliceNearby2.some(n => n.agentId === 'carol');
  assert(hasCarol, 'carol 移动到 A 区后出现在 alice 附近');
}

// ═══════════════════════════════════════════
// Test 4: AndyEngine 连续坐标集成
// ═══════════════════════════════════════════

console.log('\n=== Test 4: AndyEngine 连续坐标集成 ===\n');

{
  const andy = new AndyEngine({
    startTime: new Date('2025-06-01T10:00:00'),
    weather: 'sunny',
    spatial: 'continuous',
  });

  const alice = andy.createCharacter({
    id: 'alice',
    name: '小爱',
    mbti: 'ENFJ',
    schedule: 'student',
    initialPosition: '图书馆',
  });

  const bob = andy.createCharacter({
    id: 'bob',
    name: '小明',
    mbti: 'INTP',
    schedule: 'student',
    initialPosition: '图书馆',
  });

  const carol = andy.createCharacter({
    id: 'carol',
    name: '小红',
    mbti: 'ESFP',
    schedule: 'student',
    initialPosition: '食堂',
  });

  // 验证空间引擎已初始化
  assert(andy.world.spatial !== null, '空间引擎已初始化');

  // 验证坐标
  const aliceCoords = andy.world.spatial.getCoords('alice');
  assert(aliceCoords !== null, 'alice 有连续坐标');

  const bobCoords = andy.world.spatial.getCoords('bob');
  assert(bobCoords !== null, 'bob 有连续坐标');

  // 运行 tick
  const result = andy.tick();
  assert(result.durationMs > 0, `tick 耗时 ${result.durationMs}ms`);
  assert(result.phase.interaction !== undefined, '交互阶段已执行');

  // 运行 10 个 tick
  for (let i = 0; i < 10; i++) {
    andy.tick();
  }

  // 检查空间引擎统计
  const spatialStats = andy.world.spatial.getStats();
  assert(spatialStats.agents === 3, '空间引擎跟踪 3 个 agent');
  assert(spatialStats.grid.totalAgents === 3, '网格中有 3 个 agent');

  // 验证区域同步（agent.position 应该和坐标所在区域一致）
  const alicePos = alice.position;
  const aliceRegion = andy.world.spatial.worldMap.pointToRegion(
    andy.world.spatial.getCoords('alice').x,
    andy.world.spatial.getCoords('alice').y
  );
  // 注意：移动过程中可能还在路上，所以不一定完全一致
  console.log(`  ℹ️  alice.position="${alicePos}", 坐标所在区域="${aliceRegion || '路上'}"`);
}

// ═══════════════════════════════════════════
// Test 5: 性能基准
// ═══════════════════════════════════════════

console.log('\n=== Test 5: 性能基准 ===\n');

{
  const N = 1000;
  const grid = new SpatialHash({ worldWidth: 500, worldHeight: 500, cellSize: 10 });

  // 生成随机坐标
  const coords = new Float32Array(N * 2);
  for (let i = 0; i < N * 2; i++) {
    coords[i] = Math.random() * 500;
  }

  // 基准：rebuild
  const t0 = Date.now();
  const iterations = 100;
  for (let i = 0; i < iterations; i++) {
    grid.rebuild(coords, N);
  }
  const rebuildMs = (Date.now() - t0) / iterations;
  console.log(`  SpatialHash.rebuild (${N} agent): ${rebuildMs.toFixed(2)}ms`);
  assert(rebuildMs < 5, `rebuild < 5ms (实际 ${rebuildMs.toFixed(2)}ms)`);

  // 基准：查询
  const t1 = Date.now();
  let totalNeighbors = 0;
  for (let i = 0; i < iterations; i++) {
    for (let a = 0; a < 100; a++) { // 抽样 100 个
      const cid = grid.cellId(coords[a * 2], coords[a * 2 + 1]);
      const neighbors = grid.queryNeighbors(cid);
      totalNeighbors += neighbors.length;
    }
  }
  const queryMs = (Date.now() - t1) / iterations;
  console.log(`  SpatialHash.queryNeighbors (100 查询): ${queryMs.toFixed(2)}ms`);
  console.log(`  平均每查询 ${Math.round(totalNeighbors / (iterations * 100))} 个邻居`);
  assert(queryMs < 5, `查询 < 5ms (实际 ${queryMs.toFixed(2)}ms)`);

  // 基准：radius query
  const t2 = Date.now();
  for (let i = 0; i < iterations; i++) {
    for (let a = 0; a < 50; a++) {
      grid.queryRadius(coords, a, 5);
    }
  }
  const radiusMs = (Date.now() - t2) / iterations;
  console.log(`  SpatialHash.queryRadius 5m (50 查询): ${radiusMs.toFixed(2)}ms`);
}

// ═══════════════════════════════════════════
// 总结
// ═══════════════════════════════════════════

console.log(`\n${'═'.repeat(50)}`);
console.log(`结果: ${passed} 通过, ${failed} 失败`);
console.log(`${'═'.repeat(50)}\n`);

if (failed > 0) process.exit(1);
