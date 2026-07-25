/**
 * Abstract Store Interface contracts — Wave 5 hardening
 *
 * MetaStore / SnapshotStore / StoryStore 是 abstract interface 基类,
 * 每个方法 throw 'Not implemented'。具体实现是 MemoryStore / SQLiteStore。
 *
 * 这三个基类此前 0 测试覆盖率(函数覆盖 0 calls)。本文件锁定:
 *   1. 每个方法未实现时抛 'Not implemented'(强制子类 override)。
 *   2. 默认参数分支被求值(coverage 标记的未覆盖分支)。
 *   3. 接口形状(prototype 方法名集合)锁定,防止意外增删方法破坏实现契约。
 *
 * 纯 hermetic:无 DB / 无文件 / 无网络。
 */

import { describe, it, expect } from 'vitest';
// CJS require 经 store facade:与运行时 require 同一模块实例,
// 确保 v8 coverage 正确归因(ESM import 在 deps.inline 下可能产生不同实例导致 coverage 漏归因)
const { createRequire } = await import('node:module');
const require = createRequire(import.meta.url);
const { MetaStore } = require('../../src/store/MetaStore.js');
const { SnapshotStore } = require('../../src/store/SnapshotStore.js');
const { StoryStore } = require('../../src/store/StoryStore.js');

const NOT_IMPL = /Not implemented/;

// ═══════════════════════════════════════════
// MetaStore — 键值元数据接口
// ═══════════════════════════════════════════
describe('MetaStore abstract interface', () => {
  it('get(key) throws Not implemented', async () => {
    await expect(new MetaStore().get('k')).rejects.toThrow(NOT_IMPL);
  });
  it('set(key, value) throws Not implemented', async () => {
    await expect(new MetaStore().set('k', 'v')).rejects.toThrow(NOT_IMPL);
  });
  it('setMany(entries) throws Not implemented', async () => {
    await expect(new MetaStore().setMany({ a: '1' })).rejects.toThrow(NOT_IMPL);
  });
  it('getAll() throws Not implemented', async () => {
    await expect(new MetaStore().getAll()).rejects.toThrow(NOT_IMPL);
  });
  it('delete(key) throws Not implemented', async () => {
    await expect(new MetaStore().delete('k')).rejects.toThrow(NOT_IMPL);
  });
  it('close() throws Not implemented', async () => {
    await expect(new MetaStore().close()).rejects.toThrow(NOT_IMPL);
  });
  it('interface shape: prototype has exactly the 7 contract methods', () => {
    const methods = Object.getOwnPropertyNames(MetaStore.prototype).filter(n => n !== 'constructor');
    expect(methods.sort()).toEqual(['close', 'delete', 'get', 'getAll', 'set', 'setMany']);
  });
});

// ═══════════════════════════════════════════
// SnapshotStore — 快照持久化接口
// ═══════════════════════════════════════════
describe('SnapshotStore abstract interface', () => {
  it('saveSnapshot() throws Not implemented (meta default exercised)', async () => {
    await expect(new SnapshotStore().saveSnapshot(0, 0, Buffer.alloc(0))).rejects.toThrow(NOT_IMPL);
  });
  it('saveSnapshot() throws with explicit meta', async () => {
    await expect(new SnapshotStore().saveSnapshot(1, 1000, Buffer.from('x'), { tag: 't' })).rejects.toThrow(NOT_IMPL);
  });
  it('loadLatest() throws Not implemented', async () => {
    await expect(new SnapshotStore().loadLatest()).rejects.toThrow(NOT_IMPL);
  });
  it('loadRecent() throws Not implemented (limit default exercised)', async () => {
    await expect(new SnapshotStore().loadRecent()).rejects.toThrow(NOT_IMPL);
  });
  it('loadAt(tick) throws Not implemented', async () => {
    await expect(new SnapshotStore().loadAt(5)).rejects.toThrow(NOT_IMPL);
  });
  it('prune() throws Not implemented (keepCount default exercised)', async () => {
    await expect(new SnapshotStore().prune()).rejects.toThrow(NOT_IMPL);
  });
  it('prune(keepCount) throws with explicit arg', async () => {
    await expect(new SnapshotStore().prune(10)).rejects.toThrow(NOT_IMPL);
  });
  it('list() throws Not implemented (limit default exercised)', async () => {
    await expect(new SnapshotStore().list()).rejects.toThrow(NOT_IMPL);
  });
  it('close() throws Not implemented', async () => {
    await expect(new SnapshotStore().close()).rejects.toThrow(NOT_IMPL);
  });
  it('interface shape: prototype has exactly the 7 contract methods', () => {
    const methods = Object.getOwnPropertyNames(SnapshotStore.prototype).filter(n => n !== 'constructor');
    expect(methods.sort()).toEqual(['close', 'list', 'loadAt', 'loadLatest', 'loadRecent', 'prune', 'saveSnapshot']);
  });
});

// ═══════════════════════════════════════════
// StoryStore — 故事持久化接口
// ═══════════════════════════════════════════
describe('StoryStore abstract interface', () => {
  it('saveStories(stories) throws Not implemented', async () => {
    await expect(new StoryStore().saveStories([])).rejects.toThrow(NOT_IMPL);
  });
  it('getRecent() throws Not implemented (defaults exercised)', async () => {
    await expect(new StoryStore().getRecent('a')).rejects.toThrow(NOT_IMPL);
  });
  it('getRecent() throws with explicit args', async () => {
    await expect(new StoryStore().getRecent('a', 24, 3)).rejects.toThrow(NOT_IMPL);
  });
  it('getByEmotion() throws Not implemented (defaults exercised)', async () => {
    await expect(new StoryStore().getByEmotion('a', 'happy')).rejects.toThrow(NOT_IMPL);
  });
  it('decay() throws Not implemented (all 3 defaults exercised)', async () => {
    await expect(new StoryStore().decay()).rejects.toThrow(NOT_IMPL);
  });
  it('decay() throws with explicit args', async () => {
    await expect(new StoryStore().decay(0.9, 0.1, 7)).rejects.toThrow(NOT_IMPL);
  });
  it('stats(agentId) throws Not implemented', async () => {
    await expect(new StoryStore().stats('a')).rejects.toThrow(NOT_IMPL);
  });
  it('close() throws Not implemented', async () => {
    await expect(new StoryStore().close()).rejects.toThrow(NOT_IMPL);
  });
  it('interface shape: prototype has exactly the 6 contract methods', () => {
    const methods = Object.getOwnPropertyNames(StoryStore.prototype).filter(n => n !== 'constructor');
    expect(methods.sort()).toEqual(['close', 'decay', 'getByEmotion', 'getRecent', 'saveStories', 'stats']);
  });
});
