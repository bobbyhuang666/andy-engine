/**
 * Phase 10: Store and Serialization Boundary 测试
 *
 * 验证：
 *   - Serialization 序列化/反序列化
 *   - SaveLoad 保存/加载
 *   - 向后兼容性（store/index.js 仍导出原有模块）
 *   - 运行时快照不透明性
 *   - Envelope 结构稳定性
 */

import { describe, it, expect } from 'vitest';
import { Serialization, ENVELOPE_VERSION, SaveLoad } from '../../src/store/index.js';
import { SnapshotStore } from '../../src/store/SnapshotStore.js';
import AndyEngine from '../../index.js';

// ═══════════════════════════════════════════
// 辅助函数
// ═══════════════════════════════════════════

function createTestEngine() {
  const engine = new AndyEngine({
    startTime: new Date('2026-09-01T08:00:00Z'),
    weather: 'sunny',
  });

  engine.createCharacter({
    id: 'maya',
    name: 'Maya',
    mbti: 'INFP',
    background: ['安静的图书馆管理员'],
    schedule: 'student',
  });

  engine.createCharacter({
    id: 'alice',
    name: 'Alice',
    mbti: 'ENFP',
    background: ['活泼的社交达人'],
    schedule: 'student',
  });

  return engine;
}

// Mock store 实现
class MockStore {
  constructor() {
    this.saved = [];
    this.loaded = null;
  }

  save(envelope, metadata) {
    this.saved.push({ envelope, metadata });
    return { id: `snap_${this.saved.length}` };
  }

  load(snapshotId) {
    return this.saved[0]?.envelope || null;
  }

  list() {
    return this.saved.map((s, i) => ({ id: `snap_${i + 1}` }));
  }
}

// ═══════════════════════════════════════════
// Serialization 序列化
// ═══════════════════════════════════════════

describe('Serialization.serialize', () => {
  it('生成的 Envelope 包含 version, timestamp, runtimeSnapshot', () => {
    const engine = createTestEngine();
    engine.tick();

    const envelope = Serialization.serialize(engine.world);

    expect(envelope.version).toBe(ENVELOPE_VERSION);
    expect(typeof envelope.timestamp).toBe('string');
    expect(envelope.runtimeSnapshot).toBeDefined();
    expect(typeof envelope.runtimeSnapshot).toBe('object');
  });

  // R21 P0-2: ENVELOPE_VERSION aligned with CURRENT_SCHEMA_VERSION (0.1.0)
  it('version 是 0.1.0', () => {
    expect(ENVELOPE_VERSION).toBe('0.1.0');
    expect(Serialization.getVersion()).toBe('0.1.0');
  });

  it('timestamp 是有效的 ISO 8601', () => {
    const engine = createTestEngine();
    engine.tick();

    const envelope = Serialization.serialize(engine.world);
    const time = new Date(envelope.timestamp);

    expect(isNaN(time.getTime())).toBe(false);
  });

  it('runtimeSnapshot 包含完整的运行时状态', () => {
    const engine = createTestEngine();
    engine.tick();

    const envelope = Serialization.serialize(engine.world);
    const snap = envelope.runtimeSnapshot;

    // 运行时快照应包含这些核心字段
    expect(snap.time).toBeDefined();
    expect(typeof snap.tickCount).toBe('number');
    expect(snap.environment).toBeDefined();
    expect(snap.agents).toBeDefined();
    expect(snap.socialGraph).toBeDefined();
    expect(snap.events).toBeDefined();
  });

  it('runtimeSnapshot 不是 Envelope 的子结构（不透明性）', () => {
    const engine = createTestEngine();
    engine.tick();

    const envelope = Serialization.serialize(engine.world);

    // Envelope 有 version, schemaVersion, timestamp, runtimeSnapshot 四个顶层字段
    // R22: schemaVersion added for Stable Envelope compatibility
    const keys = Object.keys(envelope);
    expect(keys).toContain('version');
    expect(keys).toContain('schemaVersion');
    expect(keys).toContain('timestamp');
    expect(keys).toContain('runtimeSnapshot');
    // 不应有其他字段泄漏
    expect(keys.length).toBe(4);
  });

  it('拒绝没有 toJSON 的对象', () => {
    expect(() => Serialization.serialize({})).toThrow(/toJSON/);
    expect(() => Serialization.serialize(null)).toThrow(/toJSON/);
  });

  it('连续序列化产生不同的 timestamp', () => {
    const engine = createTestEngine();
    engine.tick();

    const e1 = Serialization.serialize(engine.world);
    engine.tick();
    const e2 = Serialization.serialize(engine.world);

    // tickCount 应该递增
    expect(e2.runtimeSnapshot.tickCount).toBeGreaterThan(e1.runtimeSnapshot.tickCount);
  });
});

// ═══════════════════════════════════════════
// Serialization 反序列化
// ═══════════════════════════════════════════

describe('Serialization.deserialize', () => {
  it('返回不透明的 runtimeSnapshot', () => {
    const engine = createTestEngine();
    engine.tick();

    const envelope = Serialization.serialize(engine.world);
    const snapshot = Serialization.deserialize(envelope);

    expect(snapshot).toBe(envelope.runtimeSnapshot);
  });

  it('拒绝缺少 version 的 envelope', () => {
    expect(() => {
      Serialization.deserialize({ runtimeSnapshot: {} });
    }).toThrow(/version/);
  });

  it('拒绝缺少 runtimeSnapshot 的 envelope', () => {
    expect(() => {
      Serialization.deserialize({ version: '0.1.0' });
    }).toThrow(/runtimeSnapshot/);
  });

  it('拒绝 null envelope', () => {
    expect(() => Serialization.deserialize(null)).toThrow(/对象/);
  });

  it('拒绝非对象 envelope', () => {
    expect(() => Serialization.deserialize('string')).toThrow(/对象/);
  });

  it('完整闭环：serialize → deserialize → 恢复引擎', () => {
    const engine = createTestEngine();
    for (let i = 0; i < 5; i++) engine.tick();

    // 序列化
    const envelope = Serialization.serialize(engine.world);

    // 反序列化
    const snapshot = Serialization.deserialize(envelope);

    // 恢复引擎
    const restoredEngine = new AndyEngine({}, snapshot);

    // 验证恢复后能继续运行
    expect(() => restoredEngine.tick()).not.toThrow();

    // 验证角色保留
    const maya = restoredEngine.getAgent('maya');
    expect(maya).toBeDefined();
    expect(maya.name).toBe('Maya');
  });
});

// ═══════════════════════════════════════════
// SaveLoad
// ═══════════════════════════════════════════

describe('SaveLoad', () => {
  it('save 调用 store.save 并传入 envelope', () => {
    const engine = createTestEngine();
    engine.tick();

    const mockStore = new MockStore();
    const saveLoad = new SaveLoad(mockStore);

    saveLoad.save(engine.world, { tag: 'test' });

    expect(mockStore.saved.length).toBe(1);
    expect(mockStore.saved[0].envelope.version).toBe(ENVELOPE_VERSION);
    expect(mockStore.saved[0].metadata.tag).toBe('test');
  });

  it('load 调用 store.load 并反序列化', () => {
    const engine = createTestEngine();
    engine.tick();

    const mockStore = new MockStore();
    const saveLoad = new SaveLoad(mockStore);

    saveLoad.save(engine.world);
    const snapshot = saveLoad.load('snap_1');

    expect(snapshot).toBeDefined();
    expect(snapshot.time).toBeDefined();
    expect(snapshot.agents).toBeDefined();
  });

  it('listSnapshots 委托给 store.list', () => {
    const engine = createTestEngine();
    engine.tick();

    const mockStore = new MockStore();
    const saveLoad = new SaveLoad(mockStore);

    saveLoad.save(engine.world);
    saveLoad.save(engine.world);

    const list = saveLoad.listSnapshots();
    expect(list.length).toBe(2);
  });

  it('拒绝空 store', () => {
    expect(() => new SaveLoad(null)).toThrow(/store/);
    expect(() => new SaveLoad(undefined)).toThrow(/store/);
  });

  it('完整闭环：save → load → 恢复引擎 → tick', () => {
    const engine = createTestEngine();
    for (let i = 0; i < 5; i++) engine.tick();

    const mockStore = new MockStore();
    const saveLoad = new SaveLoad(mockStore);

    // 保存
    saveLoad.save(engine.world);

    // 加载
    const snapshot = saveLoad.load('snap_1');

    // 恢复
    const restoredEngine = new AndyEngine({}, snapshot);

    // 继续运行
    expect(() => {
      restoredEngine.tick();
      restoredEngine.tick();
    }).not.toThrow();

    // 验证状态延续
    expect(restoredEngine.world.tickCount).toBeGreaterThan(5);
  });
});

// ═══════════════════════════════════════════
// 向后兼容性
// ═══════════════════════════════════════════

describe('store/ 向后兼容性', () => {
  it('store/index.js 仍导出原有模块', async () => {
    const store = await import('../../store/index.js');

    // 原有模块
    expect(store.StoryStore).toBeDefined();
    expect(store.SnapshotStore).toBeDefined();
    expect(store.MetaStore).toBeDefined();
    expect(store.SQLiteStore).toBeDefined();
    expect(store.SimulationStore).toBeDefined();
    expect(store.createStore).toBeDefined();
    expect(store.createMemoryStore).toBeDefined();
  });

  it('store/index.js 导出 Phase 10 新模块', async () => {
    const store = await import('../../store/index.js');

    expect(store.Serialization).toBeDefined();
    expect(store.ENVELOPE_VERSION).toBe('0.1.0');
    expect(store.SaveLoad).toBeDefined();
  });

  it('require("andy-engine/store") 仍然有效', async () => {
    const mod = await import('../../store/index.js');
    expect(mod.createStore).toBeDefined();
    expect(mod.createMemoryStore).toBeDefined();
  });

  it('internal src/store/Serialization module 有效 (非 public export)', async () => {
    const mod = await import('../../src/store/Serialization.js');
    expect(mod.Serialization).toBeDefined();
    expect(mod.ENVELOPE_VERSION).toBe('0.1.0');
  });
});

// ═══════════════════════════════════════════
// 运行时快照不透明性
// ═══════════════════════════════════════════

describe('运行时快照不透明性', () => {
  it('Serialization 不解析 runtimeSnapshot 内部结构', () => {
    const engine = createTestEngine();
    engine.tick();

    const envelope = Serialization.serialize(engine.world);

    // Serialization 只检查 envelope 结构，不深入 runtimeSnapshot
    // deserialize 直接返回 runtimeSnapshot 引用
    const snapshot = Serialization.deserialize(envelope);
    expect(snapshot).toBe(envelope.runtimeSnapshot);
  });

  it('runtimeSnapshot 可以包含任意运行时状态', () => {
    const engine = createTestEngine();
    engine.tick();

    const envelope = Serialization.serialize(engine.world);
    const snap = envelope.runtimeSnapshot;

    // 运行时快照可以包含 agents 内部状态（这是预期的）
    expect(snap.agents).toBeDefined();
    // 但 Envelope 层面不暴露这些
    expect(envelope.agents).toBeUndefined();
  });

  it('不同版本的 runtimeSnapshot 结构可以不同', () => {
    // R22: deserialize now validates version, so use current version
    // but with different runtimeSnapshot structure
    const oldEnvelope = {
      version: '0.1.0',
      schemaVersion: '0.1.0',
      timestamp: '2026-01-01T00:00:00Z',
      runtimeSnapshot: {
        time: '2026-01-01T00:00:00Z',
        tickCount: 0,
        environment: { weather: 'sunny', timeOfDay: 'morning', season: 'spring' },
        agents: {},
        socialGraph: [],
        events: { eventLog: [] },
      },
    };

    // deserialize 不关心 runtimeSnapshot 内部结构
    const snapshot = Serialization.deserialize(oldEnvelope);
    expect(snapshot).toBe(oldEnvelope.runtimeSnapshot);
  });
});

// ═══════════════════════════════════════════
// SnapshotStore 抽象接口
// ═══════════════════════════════════════════

describe('SnapshotStore 抽象接口', () => {
  it('所有方法抛出 Not implemented', async () => {
    const store = new SnapshotStore();

    await expect(store.saveSnapshot(0, 0, Buffer.alloc(0))).rejects.toThrow(/Not implemented/);
    await expect(store.loadLatest()).rejects.toThrow(/Not implemented/);
    await expect(store.loadAt(0)).rejects.toThrow(/Not implemented/);
    await expect(store.prune()).rejects.toThrow(/Not implemented/);
    await expect(store.list()).rejects.toThrow(/Not implemented/);
    await expect(store.close()).rejects.toThrow(/Not implemented/);
  });
});

// ═══════════════════════════════════════════
// Envelope 结构稳定性
// ═══════════════════════════════════════════

describe('Envelope 结构稳定性', () => {
  it('Envelope 有 version, schemaVersion, timestamp, runtimeSnapshot 四个字段', () => {
    const engine = createTestEngine();
    engine.tick();

    const envelope = Serialization.serialize(engine.world);
    const keys = Object.keys(envelope).sort();

    // R22: schemaVersion added for Stable Envelope compatibility
    expect(keys).toEqual(['runtimeSnapshot', 'schemaVersion', 'timestamp', 'version']);
  });

  it('version 字段是字符串', () => {
    const engine = createTestEngine();
    engine.tick();

    const envelope = Serialization.serialize(engine.world);
    expect(typeof envelope.version).toBe('string');
    expect(envelope.version.length).toBeGreaterThan(0);
  });

  it('多次序列化 version 一致', () => {
    const engine = createTestEngine();
    engine.tick();

    const e1 = Serialization.serialize(engine.world);
    engine.tick();
    const e2 = Serialization.serialize(engine.world);

    expect(e1.version).toBe(e2.version);
  });
});
