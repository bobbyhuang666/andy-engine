/**
 * 持久化层测试
 *
 * 测试:
 *   1. SQLiteStore — 故事 CRUD、快照、元数据
 *   2. SimulationStore — 生命周期、缓冲、衰减
 *   3. 接口兼容性 — 确保迁移时只需换实现
 */

'use strict';

const { SQLiteStore, SimulationStore, createMemoryStore } = require('./store');
const path = require('path');
const fs = require('fs');

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    passed++;
    console.log(`  ✅ ${message}`);
  } else {
    failed++;
    console.error(`  ❌ ${message}`);
  }
}

// ═══════════════════════════════════════════
// Test 1: SQLiteStore 基础 CRUD
// ═══════════════════════════════════════════

function testSQLiteStore() {
  console.log('\n── Test 1: SQLiteStore 基础 CRUD ──');

  const store = createMemoryStore();

  // 1.1 写入故事
  const stories = [
    { tick: 1, timestamp: Date.now(), agentId: 'bobby', category: 'daily_life', content: '今天心情不错', emotionTag: 'happy', importance: 0.8, source: 'simulation' },
    { tick: 2, timestamp: Date.now() - 3600000, agentId: 'bobby', category: 'social', content: '遇到了Carol', emotionTag: 'neutral', importance: 0.6, source: 'simulation' },
    { tick: 3, timestamp: Date.now() - 7200000, agentId: 'bobby', category: 'emotion', content: '有点难过', emotionTag: 'sad', importance: 0.7, source: 'user_signal' },
    { tick: 4, timestamp: Date.now(), agentId: 'carol', category: 'daily_life', content: '今天在图书馆', emotionTag: 'neutral', importance: 0.5, source: 'simulation' },
  ];

  const count = store.saveStories(stories);
  assert(count === 4, `写入 4 条故事，实际: ${count}`);

  // 1.2 查询最近故事
  const recent = store.getRecent('bobby', 24, 5);
  assert(recent.length === 3, `Bobby 最近 24h 应有 3 条，实际: ${recent.length}`);
  assert(recent[0].importance >= recent[1].importance, '按重要性降序');

  // 1.3 按情绪查询
  const sadStories = store.getByEmotion('bobby', 'sad', 24, 10);
  assert(sadStories.length === 1, `sad 故事 1 条，实际: ${sadStories.length}`);
  assert(sadStories[0].content === '有点难过', '内容匹配');

  // 1.4 统计
  const stats = store.stats('bobby');
  assert(stats.total === 3, `Bobby 总计 3 条，实际: ${stats.total}`);

  // 1.5 Carol 的故事隔离
  const carolStories = store.getRecent('carol', 24, 5);
  assert(carolStories.length === 1, `Carol 1 条，实际: ${carolStories.length}`);

  store.close();
}

// ═══════════════════════════════════════════
// Test 2: 快照 CRUD
// ═══════════════════════════════════════════

function testSnapshots() {
  console.log('\n── Test 2: 快照 CRUD ──');

  const store = createMemoryStore();

  // 2.1 保存快照
  const data1 = Buffer.from([0x01, 0x02, 0x03]);
  const data2 = Buffer.from([0x04, 0x05, 0x06]);
  store.saveSnapshot(12, Date.now(), data1);
  store.saveSnapshot(24, Date.now(), data2, { weather: 'sunny' });

  // 2.2 加载最新
  const latest = store.loadLatest();
  assert(latest !== null, '加载最新快照');
  assert(latest.tick === 24, `最新 tick=24，实际: ${latest.tick}`);
  assert(Buffer.compare(latest.data, data2) === 0, '数据一致');
  assert(latest.meta?.weather === 'sunny', '元数据一致');

  // 2.3 加载指定 tick
  const snap12 = store.loadAt(12);
  assert(snap12 !== null, '加载 tick=12 快照');
  assert(Buffer.compare(snap12.data, data1) === 0, '数据一致');

  // 2.4 列出
  const list = store.list(10);
  assert(list.length === 2, `列出 2 个快照，实际: ${list.length}`);
  assert(list[0].dataSize === 3, `数据大小 3 bytes，实际: ${list[0].dataSize}`);

  // 2.5 修剪
  store.saveSnapshot(36, Date.now(), Buffer.from([0x07]));
  store.saveSnapshot(48, Date.now(), Buffer.from([0x08]));
  const pruned = store.prune(2);
  assert(pruned === 2, `修剪 2 个，实际: ${pruned}`);
  assert(store.list(10).length === 2, '剩余 2 个');

  store.close();
}

// ═══════════════════════════════════════════
// Test 3: 元数据 KV
// ═══════════════════════════════════════════

function testMeta() {
  console.log('\n── Test 3: 元数据 KV ──');

  const store = createMemoryStore();

  store.set('tick_count', '42');
  store.set('virtual_time', '1685000000000');
  assert(store.get('tick_count') === '42', '读取 tick_count');
  assert(store.get('virtual_time') === '1685000000000', '读取 virtual_time');
  assert(store.get('nonexistent') === null, '不存在的键返回 null');

  store.setMany({ a: '1', b: '2', c: '3' });
  const all = store.getAll();
  assert(Object.keys(all).length === 5, `5 个键，实际: ${Object.keys(all).length}`);

  store.delete('a');
  assert(store.get('a') === null, '删除后返回 null');

  store.close();
}

// ═══════════════════════════════════════════
// Test 4: 故事衰减
// ═══════════════════════════════════════════

function testDecay() {
  console.log('\n── Test 4: 故事衰减 ──');

  const store = createMemoryStore();
  const now = Date.now();
  const DAY = 86400000;

  // 写入不同年龄的故事
  store.saveStories([
    { tick: 1, timestamp: now, agentId: 'bobby', content: '今天', importance: 0.8 },
    { tick: 2, timestamp: now - 3 * DAY, agentId: 'bobby', content: '3天前', importance: 0.5 },
    { tick: 3, timestamp: now - 10 * DAY, agentId: 'bobby', content: '10天前', importance: 0.3 },
    { tick: 4, timestamp: now - 31 * DAY, agentId: 'bobby', content: '31天前', importance: 0.1 },
  ]);

  // 衰减 (factor=0.95, min=0.05, maxAge=30天)
  const result = store.decay(0.95, 0.05, 30);
  assert(result.decayed >= 2, `至少衰减 2 条，实际: ${result.decayed}`);
  assert(result.deleted >= 1, `至少删除 1 条(31天前)，实际: ${result.deleted}`);

  // 验证 31 天前的已被删除
  const remaining = store.getRecent('bobby', 31 * 24, 10);
  assert(remaining.length === 3, `剩余 3 条，实际: ${remaining.length}`);

  store.close();
}

// ═══════════════════════════════════════════
// Test 5: SimulationStore 生命周期
// ═══════════════════════════════════════════

function testSimulationStore() {
  console.log('\n── Test 5: SimulationStore 生命周期 ──');

  const dbPath = path.join(__dirname, 'test_data', 'test.db');

  // 清理
  if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);

  let agentState = { current: [0.1, 0.2, 0.3] };

  // ── 第一次启动 ──
  {
    const store = new SimulationStore({
      dbPath,
      snapshotInterval: 3,  // 每 3 tick 快照
      storyFlushInterval: 1, // 每 tick 刷出
      storyDecayInterval: 100,
    });

    store.init({
      onSnapshot: () => Buffer.from(JSON.stringify(agentState)),
      onRestore: (data) => { agentState = JSON.parse(data.toString()); },
    });

    assert(store.tickCount === 0, '初始 tick=0');

    // 模拟 5 个 tick
    for (let t = 1; t <= 5; t++) {
      store.onTick(
        { tickNumber: t, time: new Date(Date.now() + t * 300000).toISOString() },
        [
          { tick: t, timestamp: Date.now(), agentId: 'bobby', content: `故事${t}`, importance: 0.5 + t * 0.1 },
        ]
      );
    }

    assert(store.tickCount === 5, `tick=5，实际: ${store.tickCount}`);

    // 查询故事
    const stories = store.getStoriesForBobby('bobby', 24, 10);
    assert(stories.length === 5, `5 条故事，实际: ${stories.length}`);

    // 关闭
    store.shutdown();
    assert(true, '正常关闭');
  }

  // ── 第二次启动（恢复） ──
  {
    const store2 = new SimulationStore({
      dbPath,
      snapshotInterval: 3,
      storyFlushInterval: 1,
    });

    let restored = false;
    store2.init({
      onSnapshot: () => Buffer.from(JSON.stringify(agentState)),
      onRestore: (data) => {
        agentState = JSON.parse(data.toString());
        restored = true;
      },
    });

    assert(restored === true, '从快照恢复成功');
    assert(store2.tickCount >= 3, `恢复 tick >= 3，实际: ${store2.tickCount}`);

    // 故事还在
    const stories = store2.getStoriesForBobby('bobby', 24, 10);
    assert(stories.length >= 1, `故事持久化成功，实际: ${stories.length}`);

    store2.shutdown();
  }

  // 清理
  if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
  if (fs.existsSync(dbPath + '-wal')) fs.unlinkSync(dbPath + '-wal');
  if (fs.existsSync(dbPath + '-shm')) fs.unlinkSync(dbPath + '-shm');
}

// ═══════════════════════════════════════════
// Test 6: 文件持久化（非内存）
// ═══════════════════════════════════════════

function testFilePersistence() {
  console.log('\n── Test 6: 文件持久化 ──');

  const dbPath = path.join(__dirname, 'test_data', 'persist_test.db');
  if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);

  // 写入
  {
    const store = new SQLiteStore(dbPath);
    store.saveStories([
      { tick: 1, timestamp: Date.now(), agentId: 'bobby', content: '持久化测试', importance: 0.9 },
    ]);
    store.set('test_key', 'test_value');
    store.close();
  }

  assert(fs.existsSync(dbPath), '数据库文件已创建');

  // 读取
  {
    const store = new SQLiteStore(dbPath);
    const stories = store.getRecent('bobby', 24, 5);
    assert(stories.length === 1, `重新打开后读到 1 条，实际: ${stories.length}`);
    assert(stories[0].content === '持久化测试', '内容一致');
    assert(store.get('test_key') === 'test_value', '元数据持久化');
    store.close();
  }

  // 清理
  if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
  if (fs.existsSync(dbPath + '-wal')) fs.unlinkSync(dbPath + '-wal');
  if (fs.existsSync(dbPath + '-shm')) fs.unlinkSync(dbPath + '-shm');
}

// ═══════════════════════════════════════════
// Test 7: 事务
// ═══════════════════════════════════════════

function testTransaction() {
  console.log('\n── Test 7: 事务 ──');

  const store = createMemoryStore();

  // 事务内批量操作
  store.transaction(() => {
    store.saveStories([
      { tick: 1, timestamp: Date.now(), agentId: 'alice', content: 'A', importance: 0.5 },
      { tick: 2, timestamp: Date.now(), agentId: 'bob', content: 'B', importance: 0.5 },
    ]);
    store.set('tx_test', 'ok');
  });

  const alice = store.getRecent('alice', 24, 5);
  const bob = store.getRecent('bob', 24, 5);
  assert(alice.length === 1, 'Alice 1 条');
  assert(bob.length === 1, 'Bob 1 条');
  assert(store.get('tx_test') === 'ok', '事务内 meta 写入');

  store.close();
}

// ═══════════════════════════════════════════
// 运行所有测试
// ═══════════════════════════════════════════

console.log('═══════════════════════════════════════════');
console.log('  持久化层测试');
console.log('═══════════════════════════════════════════');

testSQLiteStore();
testSnapshots();
testMeta();
testDecay();
testSimulationStore();
testFilePersistence();
testTransaction();

console.log('\n═══════════════════════════════════════════');
console.log(`  结果: ${passed} passed, ${failed} failed`);
console.log('═══════════════════════════════════════════');

if (failed > 0) process.exit(1);
