/**
 * RegionGrid branch coverage — Wave 5 batch 3
 *
 * 此前 RegionGrid 无直接测试(仅经 AndyEngine 间接覆盖 place/getRegion happy path)。
 * 本文件覆盖:迁移/未知查询/计数/邻接 BFS/占用列表/快照。
 *
 * 纯函数:无 DB / 无 engine。
 */

import { describe, it, expect } from 'vitest';
import RegionGrid from '../../src/spatial/RegionGrid.js';

describe('RegionGrid — unknown agent/region queries', () => {
  it('getRegion returns null for unknown agent', () => {
    const grid = new RegionGrid(['a']);
    expect(grid.getRegion('ghost')).toBeNull();
  });
  it('getAgentsInRegion returns [] for unknown region', () => {
    const grid = new RegionGrid(['a']);
    expect(grid.getAgentsInRegion('nope')).toEqual([]);
  });
  it('getNeighbors returns [] for agent with no region', () => {
    const grid = new RegionGrid(['a']);
    expect(grid.getNeighbors('ghost')).toEqual([]);
    expect(grid.getNeighbors('ghost', 2)).toEqual([]);
  });
  it('count returns 0 for empty/unknown region', () => {
    const grid = new RegionGrid(['a']);
    expect(grid.count('a')).toBe(0);
    expect(grid.count('unknown')).toBe(0);
  });
});

describe('RegionGrid — place migration between regions', () => {
  it('place moves agent and removes from old region', () => {
    const grid = new RegionGrid(['a', 'b']);
    grid.place('x', 'a');
    expect(grid.getRegion('x')).toBe('a');
    expect(grid.getAgentsInRegion('a')).toEqual(['x']);
    grid.place('x', 'b');
    expect(grid.getRegion('x')).toBe('b');
    expect(grid.getAgentsInRegion('a')).toEqual([]);
    expect(grid.getAgentsInRegion('b')).toEqual(['x']);
  });
  it('place into an unregistered region auto-registers it', () => {
    const grid = new RegionGrid(['a']);
    grid.place('x', 'new-region');
    expect(grid.getRegion('x')).toBe('new-region');
    expect(grid.count('new-region')).toBe(1);
  });
});

describe('RegionGrid — count and occupied regions', () => {
  it('count returns occupancy of a region', () => {
    const grid = new RegionGrid(['a', 'b']);
    grid.place('x', 'a');
    grid.place('y', 'a');
    expect(grid.count('a')).toBe(2);
    expect(grid.count('b')).toBe(0);
  });
  it('getOccupiedRegions lists only non-empty regions with counts and agents', () => {
    const grid = new RegionGrid(['a', 'b', 'c']);
    grid.place('x', 'a');
    grid.place('y', 'a');
    grid.place('z', 'b');
    const occ = grid.getOccupiedRegions();
    expect(occ).toHaveLength(2);
    const a = occ.find(o => o.region === 'a');
    expect(a.count).toBe(2);
    expect(a.agents.sort()).toEqual(['x', 'y']);
    const b = occ.find(o => o.region === 'b');
    expect(b.count).toBe(1);
    expect(occ.find(o => o.region === 'c')).toBeUndefined();
  });
  it('snapshot returns occupancy map of non-empty regions', () => {
    const grid = new RegionGrid(['a', 'b']);
    grid.place('x', 'a');
    const snap = grid.snapshot();
    expect(snap.a).toEqual(['x']);
    expect(snap.b).toBeUndefined();
  });
});

describe('RegionGrid — getNeighbors radius=0 (same region only)', () => {
  it('returns same-region agents excluding self', () => {
    const grid = new RegionGrid(['a']);
    grid.place('alice', 'a');
    grid.place('bob', 'a');
    grid.place('carol', 'a');
    const neighbors = grid.getNeighbors('alice', 0).sort();
    expect(neighbors).toEqual(['bob', 'carol']);
  });
  it('returns [] when alone in region', () => {
    const grid = new RegionGrid(['a']);
    grid.place('solo', 'a');
    expect(grid.getNeighbors('solo', 0)).toEqual([]);
  });
});

describe('RegionGrid — getNeighbors radius>0 via BFS adjacency', () => {
  it('traverses adjacent regions up to radius hops', () => {
    const grid = new RegionGrid(['a', 'b', 'c']);
    grid.setAdjacent('a', 'b');
    grid.setAdjacent('b', 'c');
    grid.place('alice', 'a');
    grid.place('bob', 'b');
    grid.place('carol', 'c');
    // radius=1: only b (1 hop)
    expect(grid.getNeighbors('alice', 1).sort()).toEqual(['bob']);
    // radius=2: b and c (2 hops)
    expect(grid.getNeighbors('alice', 2).sort()).toEqual(['bob', 'carol']);
  });
  it('dedupes agents reachable via multiple adjacency paths (diamond)', () => {
    const grid = new RegionGrid(['a', 'b', 'c', 'd']);
    grid.setAdjacent('a', 'b');
    grid.setAdjacent('a', 'c');
    grid.setAdjacent('b', 'd');
    grid.setAdjacent('c', 'd');
    grid.place('alice', 'a');
    grid.place('dave', 'd');
    // d reachable via a→b→d and a→c→d, but should appear once
    const neighbors = grid.getNeighbors('alice', 3);
    expect(neighbors.filter(n => n === 'dave')).toHaveLength(1);
  });
  it('returns [] when no adjacent regions configured', () => {
    const grid = new RegionGrid(['a', 'b']);
    grid.place('alice', 'a');
    grid.place('bob', 'b');
    // no setAdjacent → radius>0 finds nothing beyond same region
    expect(grid.getNeighbors('alice', 5)).toEqual([]);
  });
});
