import { describe, it, expect, beforeEach } from 'vitest';
// CJS require:与运行时同一模块实例,确保 v8 coverage 正确归因(ESM import 在 deps.inline 下漏归因)
const { createRequire } = await import('node:module');
const require = createRequire(import.meta.url);
const { MemoryStore } = require('../../src/store/MemoryStore.js');

describe('MemoryStore', () => {
  let store;

  beforeEach(() => {
    store = new MemoryStore();
  });

  describe('StoryStore interface', () => {
    it('should save and retrieve stories', () => {
      const stories = [
        { tick: 1, timestamp: Date.now(), agentId: 'test', content: 'test story', importance: 0.8 },
        { tick: 2, timestamp: Date.now(), agentId: 'test', content: 'another story', importance: 0.6 },
      ];

      const count = store.saveStories(stories);
      expect(count).toBe(2);

      const retrieved = store.getRecent('test', 24, 10);
      expect(retrieved.length).toBe(2);
      // 按重要性降序
      expect(retrieved[0].importance).toBe(0.8);
      expect(retrieved[1].importance).toBe(0.6);
    });

    it('should filter stories by agent', () => {
      store.saveStories([
        { tick: 1, timestamp: Date.now(), agentId: 'agent1', content: 'story1' },
        { tick: 2, timestamp: Date.now(), agentId: 'agent2', content: 'story2' },
      ]);

      const agent1Stories = store.getRecent('agent1', 24, 10);
      expect(agent1Stories.length).toBe(1);
      expect(agent1Stories[0].content).toBe('story1');
    });

    it('should filter stories by time', () => {
      const now = Date.now();
      store.saveStories([
        { tick: 1, timestamp: now - 2 * 3600 * 1000, agentId: 'test', content: 'old' },
        { tick: 2, timestamp: now, agentId: 'test', content: 'new' },
      ]);

      const recentStories = store.getRecent('test', 1, 10, now);
      expect(recentStories.length).toBe(1);
      expect(recentStories[0].content).toBe('new');
    });

    it('should query by emotion tag', () => {
      store.saveStories([
        { tick: 1, timestamp: Date.now(), agentId: 'test', content: 'happy', emotionTag: 'happy' },
        { tick: 2, timestamp: Date.now(), agentId: 'test', content: 'sad', emotionTag: 'sad' },
        { tick: 3, timestamp: Date.now(), agentId: 'test', content: 'happy2', emotionTag: 'happy' },
      ]);

      const happyStories = store.getByEmotion('test', 'happy', 168, 10);
      expect(happyStories.length).toBe(2);
      expect(happyStories.every(s => s.emotionTag === 'happy')).toBe(true);
    });

    it('should decay stories', () => {
      const now = Date.now();
      const weekAgo = now - 8 * 24 * 3600 * 1000;

      store.saveStories([
        { tick: 1, timestamp: weekAgo, agentId: 'test', content: 'old', importance: 0.8 },
        { tick: 2, timestamp: now, agentId: 'test', content: 'new', importance: 0.8 },
      ]);

      const result = store.decay(0.95, 0.05, 30, now);
      expect(result.decayed).toBe(1);
      expect(result.deleted).toBe(0);

      // 检查老故事的重要性被衰减
      const oldStory = store.stories.find(s => s.content === 'old');
      expect(oldStory.importance).toBeLessThan(0.8);
    });

    it('should return stats', () => {
      const now = Date.now();
      store.saveStories([
        { tick: 1, timestamp: now - 2 * 3600 * 1000, agentId: 'test', content: 'old' },
        { tick: 2, timestamp: now, agentId: 'test', content: 'new' },
        { tick: 3, timestamp: now, agentId: 'other', content: 'other' },
      ]);

      const stats = store.stats('test', now);
      expect(stats.total).toBe(2);
      expect(stats.recentDay).toBe(2);
      expect(stats.recentWeek).toBe(2);
    });
  });

  describe('SnapshotStore interface', () => {
    it('should save and load snapshots', () => {
      const data = Buffer.from('test data');
      store.saveSnapshot(1, Date.now(), data);

      const latest = store.loadLatest();
      expect(latest).toBeDefined();
      expect(latest.tick).toBe(1);
      expect(latest.data).toEqual(data);
    });

    it('should load snapshot by tick', () => {
      store.saveSnapshot(1, Date.now(), Buffer.from('data1'));
      store.saveSnapshot(2, Date.now(), Buffer.from('data2'));

      const snapshot = store.loadAt(1);
      expect(snapshot).toBeDefined();
      expect(snapshot.tick).toBe(1);
    });

    it('should return null for non-existent tick', () => {
      const snapshot = store.loadAt(999);
      expect(snapshot).toBeNull();
    });

    it('should prune old snapshots', () => {
      for (let i = 1; i <= 10; i++) {
        store.saveSnapshot(i, Date.now(), Buffer.from(`data${i}`));
      }

      const deleted = store.prune(5);
      expect(deleted).toBe(5);
      expect(store.snapshots.length).toBe(5);
    });

    it('should list snapshots without data', () => {
      store.saveSnapshot(1, Date.now(), Buffer.from('data1'));
      store.saveSnapshot(2, Date.now(), Buffer.from('data2'));

      const list = store.list(10);
      expect(list.length).toBe(2);
      expect(list[0].dataSize).toBeDefined();
      expect(list[0].data).toBeUndefined(); // 不包含 data
    });
  });

  describe('MetaStore interface', () => {
    it('should get and set meta', () => {
      store.set('key1', 'value1');
      expect(store.get('key1')).toBe('value1');
    });

    it('should return null for non-existent key', () => {
      expect(store.get('nonexistent')).toBeNull();
    });

    it('should set many entries', () => {
      store.setMany({ a: '1', b: '2', c: '3' });
      expect(store.get('a')).toBe('1');
      expect(store.get('b')).toBe('2');
      expect(store.get('c')).toBe('3');
    });

    it('should get all entries', () => {
      store.set('x', '10');
      store.set('y', '20');

      const all = store.getAll();
      expect(all).toEqual({ x: '10', y: '20' });
    });

    it('should delete key', () => {
      store.set('key', 'value');
      store.delete('key');
      expect(store.get('key')).toBeNull();
    });

    it('should convert values to string', () => {
      store.set('num', 123);
      expect(store.get('num')).toBe('123');
    });
  });

  describe('Transaction support', () => {
    it('should execute function in transaction', () => {
      const result = store.transaction(() => {
        store.set('key', 'value');
        return 42;
      });

      expect(result).toBe(42);
      expect(store.get('key')).toBe('value');
    });
  });

  describe('Lifecycle', () => {
    it('should close without error', () => {
      expect(() => store.close()).not.toThrow();
    });
  });
});
