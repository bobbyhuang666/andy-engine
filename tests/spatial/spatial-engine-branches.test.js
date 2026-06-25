/**
 * SpatialEngine branch coverage — Wave 5 batch 3
 *
 * 此前 spatial.test.js 仅覆盖 addAgent/queryNearby/setCoords happy path。
 * 本文件补 initialize / _computeEncounters tier / _syncRegions / 未知查询 / 首个 agent。
 *
 * 纯函数:无 DB / 无 LLM。用 rect regions 控制坐标;socialGraph 用 stub。
 */

import { describe, it, expect } from 'vitest';
import SpatialEngine from '../../src/spatial/SpatialEngine.js';

// 两个相邻 rect 区域:A 在 (0,0)-(50,50) 中心(25,25);B 在 (100,0)-(150,50) 中心(125,25)
function makeRegions() {
  return [
    { name: 'A', shape: 'rect', x: 0, y: 0, w: 50, h: 50 },
    { name: 'B', shape: 'rect', x: 100, y: 0, w: 50, h: 50 },
  ];
}

function makeEngine(opts = {}) {
  return new SpatialEngine({
    worldWidth: 200, worldHeight: 100,
    regions: makeRegions(),
    ...opts,
  });
}

describe('SpatialEngine — unknown agent queries', () => {
  it('getCoords returns null for unknown agent', () => {
    const engine = makeEngine();
    expect(engine.getCoords('ghost')).toBeNull();
  });
  it('queryNearby returns [] for unknown agent', () => {
    const engine = makeEngine();
    expect(engine.queryNearby('ghost')).toEqual([]);
  });
  it('setCoords is a no-op for unknown agent', () => {
    const engine = makeEngine();
    expect(() => engine.setCoords('ghost', 1, 1)).not.toThrow();
  });
});

describe('SpatialEngine — tick before initialize', () => {
  it('returns empty encounters/regionChanges when not initialized', () => {
    const engine = makeEngine();
    const result = engine.tick(new Map(), null);
    expect(result).toEqual({ encounters: [], regionChanges: [] });
  });
});

describe('SpatialEngine — initialize(agents Map)', () => {
  it('sets coords from position regions and rebuilds grid for pre-tick queryNearby', () => {
    const engine = makeEngine();
    const agents = new Map([
      ['a', { position: 'A' }],
      ['b', { position: 'A' }],
    ]);
    engine.initialize(agents);
    expect(engine.getCoords('a')).not.toBeNull();
    // both in A region → queryNearby should find each other pre-tick
    const nearby = engine.queryNearby('a');
    expect(nearby.some(n => n.agentId === 'b')).toBe(true);
  });
});

describe('SpatialEngine — addAgent first-agent branch', () => {
  it('first addAgent creates arrays from scratch; subsequent extends', () => {
    const engine = makeEngine();
    engine.addAgent('solo', 'A');
    expect(engine.getCoords('solo')).not.toBeNull();
    expect(engine.getStats().agents).toBe(1);
    engine.addAgent('second', 'A');
    expect(engine.getStats().agents).toBe(2);
    expect(engine.getCoords('second')).not.toBeNull();
  });
});

describe('SpatialEngine — _computeEncounters tier & probability', () => {
  it('conversation tier (<=3m) produces encounter with baseProb 0.8; presence tier (>maxRadius) none', () => {
    const engine = makeEngine();
    engine.addAgent('alice', 'A');
    engine.addAgent('bob', 'A');
    // 强制两者距离 <= 3m (conversation tier)
    const aliceC = engine.getCoords('alice');
    engine.setCoords('bob', aliceC.x + 2, aliceC.y);
    const agents = new Map([['alice', { position: 'A' }], ['bob', { position: 'A' }]]);
    engine.tick(agents, null);
    const encounters = engine.getEncounters();
    expect(encounters.length).toBeGreaterThanOrEqual(1);
    const enc = encounters[0];
    expect(enc.tierName).toBe('conversation');
    expect(enc.probability).toBe(0.8); // baseProb, no socialGraph
  });

  it('socialGraph strength adds to probability (capped at 1.0)', () => {
    const engine = makeEngine();
    engine.addAgent('alice', 'A');
    engine.addAgent('bob', 'A');
    const aliceC = engine.getCoords('alice');
    engine.setCoords('bob', aliceC.x + 2, aliceC.y);
    const agents = new Map([['alice', { position: 'A' }], ['bob', { position: 'A' }]]);
    const socialGraph = { getRelationship: () => ({ strength: 0.5 }) };
    engine.tick(agents, socialGraph);
    const enc = engine.getEncounters()[0];
    // 0.8 + 0.5*0.15 = 0.875
    expect(enc.probability).toBe(0.875);
  });

  it('awareness tier (<=10m) produces encounter with baseProb 0.3', () => {
    const engine = makeEngine();
    engine.addAgent('alice', 'A');
    engine.addAgent('bob', 'A');
    const aliceC = engine.getCoords('alice');
    engine.setCoords('bob', aliceC.x + 8, aliceC.y); // 8m → awareness
    const agents = new Map([['alice', { position: 'A' }], ['bob', { position: 'A' }]]);
    engine.tick(agents, null);
    const enc = engine.getEncounters()[0];
    expect(enc.tierName).toBe('awareness');
    expect(enc.probability).toBe(0.3);
  });

  it('agents beyond max interaction radius produce no encounter', () => {
    const engine = makeEngine();
    engine.addAgent('alice', 'A');
    engine.addAgent('bob', 'A');
    const aliceC = engine.getCoords('alice');
    engine.setCoords('bob', aliceC.x + 100, aliceC.y); // 100m > maxRadius 25
    const agents = new Map([['alice', { position: 'A' }], ['bob', { position: 'A' }]]);
    engine.tick(agents, null);
    expect(engine.getEncounters()).toEqual([]);
  });
});

describe('SpatialEngine — _syncRegions region change', () => {
  it('emits regionChanges when coordinate region differs from agent.position', () => {
    const engine = makeEngine();
    engine.addAgent('alice', 'A');
    // move alice into B's bounds via setCoords, but agent.position still 'A'
    engine.setCoords('alice', 125, 25); // B center
    const agents = new Map([['alice', { position: 'A' }]]);
    const result = engine.tick(agents, null);
    const change = result.regionChanges.find(c => c.agentId === 'alice');
    expect(change).toBeDefined();
    expect(change.from).toBe('A');
    expect(change.to).toBe('B');
  });
});

describe('SpatialEngine — getEncounters returns last tick encounters', () => {
  it('getEncounters returns the array from the last tick', () => {
    const engine = makeEngine();
    engine.addAgent('alice', 'A');
    engine.addAgent('bob', 'A');
    const aliceC = engine.getCoords('alice');
    engine.setCoords('bob', aliceC.x + 2, aliceC.y);
    engine.tick(new Map([['alice', { position: 'A' }], ['bob', { position: 'A' }]]), null);
    expect(engine.getEncounters()).toBe(engine.getEncounters()); // same ref
    expect(engine.getEncounters().length).toBeGreaterThanOrEqual(1);
  });
});
