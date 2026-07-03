/**
 * AndyBridge internal methods — Wave 5 hardening
 *
 * 此前 AndyBridge ~38% 覆盖:仅 constructor(init memory 路径部分)+ init/shutdown/
 * onUserMessage/getStoriesForAgent/getStats 被测。
 *
 * 本文件补未覆盖的内部逻辑(纯 hermetic,通过 persistence:{type:'memory'} 构造 +
 * stub bridge.store + 注入 fake andy):
 *   - constructor memory 分支
 *   - onTick (无信号 / 有信号 / 故事生成 / 转发 store)
 *   - getAgentEmotion (null / agents.get / getAgent fallback)
 *   - _serializeAgents (null / entries / toJSON 过滤)
 *   - _restoreAgents (空 / 恢复 / 跳过损坏 chunk)
 *   - _applySignalToAgent (clamp / 忽略未知 dim)
 *   - deprecated aliases (getStoriesForBobby / getBobbyEmotion)
 */

import { describe, it, expect, vi } from 'vitest';
import { AndyBridge } from '../../src/sdk/AndyBridge.js';

function makeBridge(overrides = {}) {
  const bridge = new AndyBridge({ persistence: { type: 'memory' }, ...overrides });
  return bridge;
}

// R7 fix: bridge methods now require init(). For tests that test internal
// behavior with mocked stores (bypassing real init), set _initialized manually.
function makeInitializedBridge(overrides = {}) {
  const bridge = makeBridge(overrides);
  bridge._initialized = true;
  return bridge;
}

// 构造 fake andy 对象,提供指定 agent
function fakeAndy(agentMap) {
  const agents = {
    get: (id) => agentMap[id] || undefined,
    entries: () => Object.entries(agentMap),
  };
  return { agents, getAgent: (id) => agentMap[id] || undefined };
}

describe('AndyBridge constructor — memory persistence branch', () => {
  it('persistence.type=memory sets store.db to a MemoryStore and avoids SQLite', () => {
    const bridge = makeBridge();
    expect(bridge.store).toBeDefined();
    expect(bridge.store.db).toBeDefined();
    expect(bridge.store.db.constructor.name).toBe('MemoryStore');
    expect(bridge.signalBuffer).toBeDefined();
    expect(bridge.storyGenerator).toBeDefined();
  });
});

describe('AndyBridge.onTick', () => {
  it('returns tick-only stories and forwards to store when no pending signal', () => {
    const bridge = makeInitializedBridge();
    const onTickSpy = vi.fn();
    bridge.store = { virtualTime: Date.now(), tickCount: 5, onTick: onTickSpy };
    const result = bridge.onTick({ tickNumber: 6, events: [] });
    expect(result.signalConsumed).toBeNull();
    expect(Array.isArray(result.stories)).toBe(true);
    expect(onTickSpy).toHaveBeenCalledWith({ tickNumber: 6, events: [] }, result.stories);
  });

  it('consumes a buffered signal, applies to agent, appends a signal story', () => {
    const bridge = makeInitializedBridge();
    // 先推入用户消息生成信号
    bridge.onUserMessage('你今天好累');
    const agent = { emotion: { current: { valence: 0 }, stress: 0 } };
    bridge.andy = fakeAndy({ default: agent });
    bridge.store = { virtualTime: Date.now(), tickCount: 1, onTick: vi.fn() };
    const result = bridge.onTick({ tickNumber: 2, events: [] });
    expect(result.signalConsumed).toBeTruthy();
    // 信号含情绪维度时 agent.emotion.current 被修改且 clamp
    for (const v of Object.values(agent.emotion.current)) {
      expect(v).toBeGreaterThanOrEqual(-1);
      expect(v).toBeLessThanOrEqual(1);
    }
    expect(result.stories.length).toBeGreaterThan(0);
  });

  it('forwards generated signal stories to the store in the same tick', () => {
    const bridge = makeInitializedBridge({ agentId: 'agent_a' });
    bridge.onUserMessage('我今天很开心');
    const agent = { emotion: { current: { joy: 0 }, stress: 0 } };
    bridge.andy = fakeAndy({ agent_a: agent });
    const onTickSpy = vi.fn((tickResult, stories) => {
      expect(stories.length).toBeGreaterThan(0);
      expect(stories[0].agentId).toBe('agent_a');
    });
    bridge.store = { virtualTime: null, tickCount: 0, onTick: onTickSpy };

    const result = bridge.onTick({ tickNumber: 1, time: 12345, events: [] });

    expect(result.stories.length).toBeGreaterThan(0);
    expect(result.stories[0].agentId).toBe('agent_a');
    expect(onTickSpy).toHaveBeenCalledWith({ tickNumber: 1, time: 12345, events: [] }, result.stories);
  });

  it('persists signal stories for non-default agents through real memory store', async () => {
    const bridge = new AndyBridge({
      agentId: 'agent_a',
      persistence: { type: 'memory' },
      snapshotInterval: 999,
    });
    await bridge.init();
    bridge.onUserMessage('我今天很开心');

    const result = bridge.onTick({ tickNumber: 1, time: Date.now(), events: [] });

    expect(result.stories.length).toBeGreaterThan(0);
    expect(bridge.store.db.stories.length).toBeGreaterThan(0);
    expect(bridge.store.db.stories[0].agentId).toBe('agent_a');
    expect(bridge.getStoriesForAgent(72, 5).length).toBeGreaterThan(0);
    await bridge.shutdown();
  });
});

describe('AndyBridge.getAgentEmotion', () => {
  it('returns null when andy missing', () => {
    const bridge = makeBridge();
    bridge.andy = null;
    expect(bridge.getAgentEmotion()).toBeNull();
  });

  it('returns null when agent missing or has no emotion', () => {
    const bridge = makeBridge();
    bridge.andy = fakeAndy({ default: {} });
    expect(bridge.getAgentEmotion()).toBeNull();
  });

  it('returns {current, stress} from andy.agents.get', () => {
    const bridge = makeBridge();
    bridge.andy = fakeAndy({ default: { emotion: { current: { valence: 0.3 }, stress: 0.2 } } });
    const result = bridge.getAgentEmotion();
    expect(result).toEqual({ current: { valence: 0.3 }, stress: 0.2 });
  });

  it('falls back to andy.getAgent when agents.get missing', () => {
    const bridge = makeBridge();
    // andy.agents 存在但无 .get 方法 → 走 || this.andy.getAgent fallback
    bridge.andy = {
      agents: {},
      getAgent: (id) => ({ emotion: { current: { joy: 0.5 }, stress: 0.1 } }),
    };
    const result = bridge.getAgentEmotion();
    expect(result.current).toEqual({ joy: 0.5 });
    expect(result.stress).toBe(0.1);
  });
});

describe('AndyBridge._serializeAgents', () => {
  it('returns Buffer.alloc(0) when no andy', () => {
    const bridge = makeBridge();
    bridge.andy = null;
    const buf = bridge._serializeAgents();
    expect(Buffer.isBuffer(buf)).toBe(true);
    expect(buf.length).toBe(0);
  });

  it('serializes agents as a JSON array; skips agents without toJSON', () => {
    const bridge = makeBridge();
    bridge.andy = fakeAndy({
      a: { toJSON: () => ({ emotion: { v: 1 }, position: { x: 1 }, health: 90 }) },
      b: { /* no toJSON, should be skipped */ },
    });
    const buf = bridge._serializeAgents();
    const parsed = JSON.parse(buf.toString());
    expect(parsed).toHaveLength(1);
    expect(parsed[0].id).toBe('a');
  });

  it('keeps snapshot payload valid when agent JSON contains the legacy delimiter', () => {
    const bridge = makeBridge();
    bridge.andy = fakeAndy({
      a: { toJSON: () => ({ memory: { content: 'line\n---\ninside' } }) },
      b: { toJSON: () => ({ y: 2 }) },
    });
    const buf = bridge._serializeAgents();
    const parsed = JSON.parse(buf.toString());
    expect(parsed).toHaveLength(2);
    expect(parsed[0].memory.content).toBe('line\n---\ninside');
  });
});

describe('AndyBridge._restoreAgents', () => {
  it('no-ops on null / empty data', () => {
    const bridge = makeBridge();
    bridge.andy = fakeAndy({ a: {} });
    expect(() => bridge._restoreAgents(null)).not.toThrow();
    expect(() => bridge._restoreAgents(Buffer.alloc(0))).not.toThrow();
  });

  it('restores position/health/socialEnergy in fallback (no emotion); skips corrupt chunks', () => {
    const bridge = makeBridge();
    const agent = {};
    bridge.andy = fakeAndy({ a: agent });
    // R35: position must be a non-empty string (region name), not an object
    const good = JSON.stringify({ id: 'a', emotion: { valence: -0.5 }, position: 'library', health: 50, socialEnergy: 0.8 });
    const corrupt = '{bad json';
    const data = Buffer.from(good + '\n---\n' + corrupt);
    bridge._restoreAgents(data);
    // emotion is NOT restored in fallback (preserves class instances like EmotionVector)
    expect(agent.position).toBe('library');
    expect(agent.health).toBe(50);
    expect(agent.socialEnergy).toBe(0.8);
  });

  it('restores the new JSON-array snapshot format', () => {
    const bridge = makeBridge();
    const agent = {};
    bridge.andy = fakeAndy({ a: agent });
    const data = Buffer.from(JSON.stringify([
      { id: 'a', position: 'library', health: 75, socialEnergy: 0.6 },
    ]));
    bridge._restoreAgents(data);
    expect(agent.position).toBe('library');
    expect(agent.health).toBe(75);
    expect(agent.socialEnergy).toBe(0.6);
  });

  it('no-ops when agent id not found in andy', () => {
    const bridge = makeBridge();
    bridge.andy = fakeAndy({ a: {} });
    const data = Buffer.from(JSON.stringify({ id: 'nonexistent', emotion: { v: 1 } }));
    expect(() => bridge._restoreAgents(data)).not.toThrow();
  });
});

describe('AndyBridge._applySignalToAgent', () => {
  it('routes engine-backed emotion signals through the world EffectCommitter', () => {
    const bridge = makeBridge();
    const commit = vi.fn();
    const agent = {
      id: 'default',
      emotion: {
        current: { valence: 0.9, arousal: 0.1 },
        applyEffect: vi.fn(),
      },
    };
    bridge.andy = {
      ...fakeAndy({ default: agent }),
      world: { effectCommitter: { commit } },
    };

    bridge._applySignalToAgent({ mergedEffect: { valence: 0.5 } });

    expect(commit).toHaveBeenCalledWith({
      deltas: [expect.objectContaining({
        type: 'emotion',
        target: 'agent',
        agentId: 'default',
        changes: { valence: 0.5 },
      })],
    });
    expect(agent.emotion.applyEffect).not.toHaveBeenCalled();
  });

  it('clamps per-dimension deltas to [-1,1] and ignores unknown dims', () => {
    const bridge = makeBridge();
    const agent = { emotion: { current: { valence: 0.9, arousal: 0.1 } } };
    bridge.andy = fakeAndy({ default: agent });
    bridge._applySignalToAgent({ mergedEffect: { valence: 0.5, unknown: 1 } });
    expect(agent.emotion.current.valence).toBe(1); // 0.9+0.5=1.4 clamped to 1
    expect(agent.emotion.current.arousal).toBe(0.1); // unchanged
    expect(agent.emotion.current.unknown).toBeUndefined(); // ignored
  });

  it('no-ops when no andy or no mergedEffect', () => {
    const bridge = makeBridge();
    bridge.andy = null;
    expect(() => bridge._applySignalToAgent({ mergedEffect: { v: 1 } })).not.toThrow();
    bridge.andy = fakeAndy({ default: { emotion: { current: {} } } });
    expect(() => bridge._applySignalToAgent({})).not.toThrow();
  });
});

describe('AndyBridge deprecated aliases', () => {
  it('getStoriesForBobby delegates to getStoriesForAgent', () => {
    const bridge = makeBridge();
    const spy = vi.spyOn(bridge, 'getStoriesForAgent').mockReturnValue([]);
    bridge.getStoriesForBobby(48, 3);
    expect(spy).toHaveBeenCalledWith(48, 3);
    spy.mockRestore();
  });

  it('getBobbyEmotion delegates to getAgentEmotion', () => {
    const bridge = makeBridge();
    const spy = vi.spyOn(bridge, 'getAgentEmotion').mockReturnValue(null);
    bridge.getBobbyEmotion();
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});

describe('AndyBridge.init wiring', () => {
  it('emits console.warn when restoring from snapshot with tickCount > 0', async () => {
    const bridge = makeBridge();
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    bridge.store = {
      tickCount: 42,
      virtualTime: 100000,
      init: async ({ onRestore }) => { onRestore(Buffer.from('[]')); },
    };
    bridge._serializeAgents = vi.fn(() => Buffer.alloc(0));
    bridge._restoreAgents = vi.fn();
    await bridge.init();
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('[AndyBridge] Restored from snapshot'),
      expect.any(Number),
      expect.any(String),
    );
    expect(warnSpy.mock.calls[0][0]).toContain('memory');
    expect(warnSpy.mock.calls[0][0]).toContain('personality');
    expect(warnSpy.mock.calls[0][0]).toContain('futureTendency');
    expect(warnSpy.mock.calls[0][0]).toContain('appraisalBiases');
    warnSpy.mockRestore();
  });

  it('init wires onSnapshot/onRestore and returns restoredTick/Time; second init is no-op', async () => {
    const bridge = makeBridge();
    let snapshotCalled = false;
    let restoreCalled = false;
    bridge.store = {
      tickCount: 7,
      virtualTime: 12345,
      init: async ({ onSnapshot, onRestore }) => {
        const buf = onSnapshot();
        snapshotCalled = Buffer.isBuffer(buf);
        onRestore(buf);
        restoreCalled = true;
      },
    };
    bridge._serializeAgents = vi.fn(() => Buffer.alloc(0));
    bridge._restoreAgents = vi.fn();
    const result = await bridge.init();
    expect(snapshotCalled).toBe(true);
    expect(restoreCalled).toBe(true);
    expect(bridge._serializeAgents).toHaveBeenCalled();
    expect(bridge._restoreAgents).toHaveBeenCalled();
    expect(result).toEqual({ restoredTick: 7, restoredTime: 12345 });
    // second init is no-op (guard)
    const result2 = await bridge.init();
    expect(result2).toBeUndefined();
  });
});
