/**
 * Pressure Layer 测试
 */

import { describe, it, expect } from 'vitest';
import { WorldPressure } from '../../src/pressure/WorldPressure.js';
import { NeedPressure } from '../../src/pressure/NeedPressure.js';
import { MemoryPressure } from '../../src/pressure/MemoryPressure.js';
import { RelationshipPressure } from '../../src/pressure/RelationshipPressure.js';
import { LocationPressure } from '../../src/pressure/LocationPressure.js';
import { PressureContext } from '../../src/pressure/PressureContext.js';

// ═══════════════════════════════════════════
// WorldPressure
// ═══════════════════════════════════════════

describe('WorldPressure', () => {
  describe('compute', () => {
    it('返回完整 pressure 结构', () => {
      const pressure = WorldPressure.compute({
        world: { time: '2026-09-01T14:00:00Z' },
        agent: { position: 'library' },
        events: [],
      });
      expect(pressure).toHaveProperty('time');
      expect(pressure).toHaveProperty('location');
      expect(pressure).toHaveProperty('crowding');
      expect(pressure).toHaveProperty('event');
      expect(pressure).toHaveProperty('total');
    });

    it('不修改输入对象', () => {
      const world = { time: '2026-09-01T14:00:00Z' };
      const agent = { position: 'library' };
      const events = [];
      const originalWorld = { ...world };
      const originalAgent = { ...agent };
      WorldPressure.compute({ world, agent, events });
      expect(world).toEqual(originalWorld);
      expect(agent).toEqual(originalAgent);
    });
  });

  describe('computeTime', () => {
    it('深夜返回高压力', () => {
      expect(WorldPressure.computeTime({ time: '2026-09-01T02:00:00Z', hour: 2 })).toBeGreaterThan(0.5);
    });

    it('白天返回低压力', () => {
      expect(WorldPressure.computeTime({ time: '2026-09-01T14:00:00Z', hour: 14 })).toBeLessThan(0.3);
    });

    it('null 返回 0', () => {
      expect(WorldPressure.computeTime(null)).toBe(0);
    });
  });

  describe('computeLocation', () => {
    it('无 locationPressure/locationValence 时返回 0', () => {
      expect(WorldPressure.computeLocation({ position: 'home' })).toBe(0);
    });

    it('有 locationPressure 时直接使用', () => {
      expect(WorldPressure.computeLocation({ locationPressure: 0.5 })).toBe(0.5);
    });

    it('有 locationValence 时取反', () => {
      expect(WorldPressure.computeLocation({ locationValence: 0.3 })).toBe(-0.3);
    });

    it('null 返回 0', () => {
      expect(WorldPressure.computeLocation(null)).toBe(0);
    });
  });

  describe('computeCrowding', () => {
    it('无 nearbyAgents 返回 0', () => {
      expect(WorldPressure.computeCrowding({})).toBe(0);
    });

    it('超过 5 个邻居返回高压力', () => {
      expect(WorldPressure.computeCrowding({ nearbyAgents: [1, 2, 3, 4, 5, 6] })).toBe(0.4);
    });

    it('2-5 个邻居返回中等压力', () => {
      expect(WorldPressure.computeCrowding({ nearbyAgents: [1, 2, 3] })).toBe(0.2);
    });

    it('1-2 个邻居返回 0', () => {
      expect(WorldPressure.computeCrowding({ nearbyAgents: [1] })).toBe(0);
    });
  });

  describe('computeEvent', () => {
    it('event.pressure 直接累加', () => {
      expect(WorldPressure.computeEvent([{ pressure: 0.3 }, { pressure: 0.2 }])).toBeCloseTo(0.5);
    });

    it('event.valence 负值增加压力', () => {
      expect(WorldPressure.computeEvent([{ valence: -0.4 }])).toBeCloseTo(0.4);
    });

    it('event.valence 正值减少压力', () => {
      expect(WorldPressure.computeEvent([{ valence: 0.3 }])).toBeCloseTo(-0.3);
    });

    it('结果 clamp 到 [-1, 1]', () => {
      const events = Array.from({ length: 20 }, () => ({ pressure: 0.5 }));
      expect(WorldPressure.computeEvent(events)).toBeLessThanOrEqual(1);
    });

    it('null 返回 0', () => {
      expect(WorldPressure.computeEvent(null)).toBe(0);
    });
  });
});

// ═══════════════════════════════════════════
// NeedPressure
// ═══════════════════════════════════════════

describe('NeedPressure', () => {
  describe('compute', () => {
    it('需求全满时压力为 0', () => {
      const pressure = NeedPressure.compute({
        needs: { hunger: 1, energy: 1, social: 1, comfort: 1, stimulation: 1 },
      });
      expect(pressure.hunger).toBe(0);
      expect(pressure.energy).toBe(0);
      expect(pressure.total).toBe(0);
    });

    it('需求全空时压力为 1', () => {
      const pressure = NeedPressure.compute({
        needs: { hunger: 0, energy: 0, social: 0, comfort: 0, stimulation: 0 },
      });
      expect(pressure.hunger).toBe(1);
      expect(pressure.energy).toBe(1);
      expect(pressure.total).toBe(1);
    });

    it('部分需求匮乏时返回正确压力', () => {
      const pressure = NeedPressure.compute({
        needs: { hunger: 0.3, energy: 0.8, social: 0.5 },
      });
      expect(pressure.hunger).toBeCloseTo(0.7);
      expect(pressure.energy).toBeCloseTo(0.2);
      expect(pressure.social).toBeCloseTo(0.5);
    });

    it('needs 为空时返回全零', () => {
      const pressure = NeedPressure.compute({});
      expect(pressure.total).toBe(0);
    });

    it('agent 为 null 时返回全零', () => {
      const pressure = NeedPressure.compute(null);
      expect(pressure.total).toBe(0);
    });
  });

  describe('computeMostDeficient', () => {
    it('返回最匮乏的需求', () => {
      const result = NeedPressure.computeMostDeficient({
        needs: { hunger: 0.2, energy: 0.8, social: 0.5 },
      });
      expect(result).toEqual({ key: 'hunger', pressure: 0.8 });
    });

    it('无 needs 时返回 null', () => {
      expect(NeedPressure.computeMostDeficient(null)).toBeNull();
    });
  });
});

// ═══════════════════════════════════════════
// MemoryPressure
// ═══════════════════════════════════════════

describe('MemoryPressure', () => {
  describe('compute', () => {
    it('无记忆时返回全零', () => {
      const pressure = MemoryPressure.compute({ memories: [] });
      expect(pressure.total).toBe(0);
    });

    it('null agent 返回全零', () => {
      const pressure = MemoryPressure.compute(null);
      expect(pressure.total).toBe(0);
    });

    it('负面记忆产生负面压力', () => {
      const pressure = MemoryPressure.compute({
        memories: [
          { valence: -0.8, importance: 0.9, activation: 0.8, timestamp: new Date().toISOString() },
        ],
      });
      expect(pressure.negative).toBeGreaterThan(0);
    });

    it('正面记忆产生正面压力', () => {
      const pressure = MemoryPressure.compute({
        memories: [
          { valence: 0.8, importance: 0.9, activation: 0.8, timestamp: new Date().toISOString() },
        ],
      });
      expect(pressure.positive).toBeGreaterThan(0);
    });

    it('混合记忆的总压力合理', () => {
      const now = new Date().toISOString();
      const pressure = MemoryPressure.compute({
        memories: [
          { valence: -0.8, importance: 0.9, activation: 0.8, timestamp: now },
          { valence: 0.5, importance: 0.5, activation: 0.5, timestamp: now },
        ],
      });
      expect(pressure.total).toBeGreaterThan(0);
      expect(pressure.total).toBeLessThanOrEqual(1);
    });
  });

  describe('hasSignificantNegativeMemory', () => {
    it('高负面记忆返回 true', () => {
      const result = MemoryPressure.hasSignificantNegativeMemory({
        memories: [
          { valence: -0.9, importance: 0.9, activation: 0.9, timestamp: new Date().toISOString() },
        ],
      });
      expect(result).toBe(true);
    });

    it('无负面记忆返回 false', () => {
      const result = MemoryPressure.hasSignificantNegativeMemory({
        memories: [
          { valence: 0.8, importance: 0.9, activation: 0.9, timestamp: new Date().toISOString() },
        ],
      });
      expect(result).toBe(false);
    });
  });
});

// ═══════════════════════════════════════════
// RelationshipPressure
// ═══════════════════════════════════════════

describe('RelationshipPressure', () => {
  describe('compute', () => {
    // R21 P1-14: new agents have no relationships yet — this is normal,
    // not pathological. Return 0 isolation instead of hardcoded 0.8.
    it('无关系时返回零孤立压力', () => {
      const pressure = RelationshipPressure.compute({ relationships: [] });
      expect(pressure.isolation).toBe(0);
      expect(pressure.total).toBe(0);
    });

    it('null agent 返回零孤立压力', () => {
      const pressure = RelationshipPressure.compute(null);
      expect(pressure.isolation).toBe(0);
    });

    it('有活跃关系时孤立压力为 0', () => {
      const pressure = RelationshipPressure.compute({
        relationships: [
          { strength: 0.5, impression: { positive: 3, negative: 0 } },
          { strength: 0.6, impression: { positive: 5, negative: 1 } },
        ],
      });
      expect(pressure.isolation).toBe(0);
    });

    it('负面关系产生冲突压力', () => {
      const pressure = RelationshipPressure.compute({
        relationships: [
          { strength: 0.5, impression: { positive: 1, negative: 5 } },
        ],
      });
      expect(pressure.conflict).toBeGreaterThan(0);
    });

    it('长时间无互动产生衰减压力', () => {
      const pressure = RelationshipPressure.compute({
        relationships: [
          { strength: 0.5, _hoursSinceLastInteraction: 200, impression: { positive: 3, negative: 0 } },
        ],
      });
      expect(pressure.decay).toBeGreaterThan(0);
    });

    it('非法阈值回退默认值而不是静默关闭压力', () => {
      const pressure = RelationshipPressure.compute({
        relationships: [
          { strength: 0.5, _hoursSinceLastInteraction: 200, impression: { positive: 1, negative: 5 } },
        ],
      }, {
        isolationCount: NaN,
        conflictRatio: NaN,
        decayHours: 0,
      });

      expect(Number.isFinite(pressure.isolation)).toBe(true);
      expect(Number.isFinite(pressure.conflict)).toBe(true);
      expect(Number.isFinite(pressure.decay)).toBe(true);
      expect(Number.isFinite(pressure.total)).toBe(true);
      expect(pressure.conflict).toBeGreaterThan(0);
      expect(pressure.decay).toBeGreaterThan(0);
    });
  });
});

// ═══════════════════════════════════════════
// LocationPressure
// ═══════════════════════════════════════════

describe('LocationPressure', () => {
  describe('compute', () => {
    it('null agent 返回全零', () => {
      const pressure = LocationPressure.compute(null);
      expect(pressure.total).toBe(0);
    });

    it('无特殊字段时返回全零', () => {
      const pressure = LocationPressure.compute({ position: 'home' });
      expect(pressure.total).toBe(0);
    });

    it('有 locationPressure 时使用固有压力', () => {
      const pressure = LocationPressure.compute({ locationPressure: 0.6 });
      expect(pressure.inherent).toBe(0.6);
      expect(pressure.total).toBe(0.6);
    });

    it('有 locationValence 时取反', () => {
      const pressure = LocationPressure.compute({ locationValence: 0.4 });
      expect(pressure.inherent).toBe(-0.4);
    });

    it('拥挤度正确计算', () => {
      const pressure = LocationPressure.compute({ nearbyAgents: [1, 2, 3, 4] });
      expect(pressure.crowding).toBe(0.2);
    });

    it('总压力 clamp 到 [0, 1]', () => {
      const pressure = LocationPressure.compute({
        locationPressure: 0.8,
        nearbyAgents: [1, 2, 3, 4, 5, 6],
      });
      expect(pressure.total).toBeLessThanOrEqual(1);
      expect(pressure.total).toBeGreaterThanOrEqual(0);
    });
  });
});

// ═══════════════════════════════════════════
// PressureContext
// ═══════════════════════════════════════════

describe('PressureContext', () => {
  describe('constructor', () => {
    it('正确存储各压力层', () => {
      const ctx = new PressureContext({
        worldPressure: { total: 0.3 },
        needPressure: { total: 0.5 },
        memoryPressure: { total: 0.1 },
        relationshipPressure: { total: 0.2 },
        locationPressure: { total: 0.4 },
      });
      expect(ctx.world.total).toBe(0.3);
      expect(ctx.needs.total).toBe(0.5);
      expect(ctx.memory.total).toBe(0.1);
      expect(ctx.relationship.total).toBe(0.2);
      expect(ctx.location.total).toBe(0.4);
    });
  });

  describe('fromSnapshot', () => {
    it('从快照构建完整上下文', () => {
      const ctx = PressureContext.fromSnapshot({
        world: { time: '2026-09-01T14:00:00Z' },
        agent: {
          needs: { hunger: 0.5, energy: 0.8 },
          memories: [],
          relationships: [],
          position: 'library',
        },
        events: [],
      });
      expect(ctx.world).toBeDefined();
      expect(ctx.needs).toBeDefined();
      expect(ctx.memory).toBeDefined();
      expect(ctx.relationship).toBeDefined();
      expect(ctx.location).toBeDefined();
    });

    it('null 输入不崩溃', () => {
      const ctx = PressureContext.fromSnapshot({
        world: null,
        agent: null,
        events: null,
      });
      expect(ctx.world).toBeDefined();
      expect(ctx.needs).toBeDefined();
    });
  });

  describe('toScorerContext', () => {
    it('返回只读上下文对象', () => {
      const ctx = new PressureContext({
        worldPressure: { total: 0.3 },
        needPressure: { total: 0.5 },
        memoryPressure: { total: 0.1 },
        relationshipPressure: { total: 0.2 },
        locationPressure: { total: 0.4 },
      });
      const scorerCtx = ctx.toScorerContext();
      expect(scorerCtx.world.total).toBe(0.3);
      expect(scorerCtx.needs.total).toBe(0.5);
      expect(scorerCtx.memory.total).toBe(0.1);
      expect(scorerCtx.relationship.total).toBe(0.2);
      expect(scorerCtx.location.total).toBe(0.4);
    });
  });

  describe('getTotalPressure', () => {
    it('返回所有压力层的平均值', () => {
      const ctx = new PressureContext({
        worldPressure: { total: 0.4 },
        needPressure: { total: 0.6 },
        memoryPressure: { total: 0.2 },
        relationshipPressure: { total: 0.8 },
        locationPressure: { total: 0.0 },
      });
      expect(ctx.getTotalPressure()).toBeCloseTo(0.4);
    });

    it('压力为 0 时返回 0', () => {
      const ctx = new PressureContext({
        worldPressure: { total: 0 },
        needPressure: { total: 0 },
        memoryPressure: { total: 0 },
        relationshipPressure: { total: 0 },
        locationPressure: { total: 0 },
      });
      expect(ctx.getTotalPressure()).toBe(0);
    });
  });
});

// ═══════════════════════════════════════════
// 向后兼容性测试
// ═══════════════════════════════════════════

describe('向后兼容性 — WorldPressure', () => {
  it('旧接口 compute 仍然可用', async () => {
    const { WorldPressure } = await import('../../src/pressure/WorldPressure.js');
    const pressure = WorldPressure.compute({
      world: { time: '2026-09-01T14:00:00Z' },
      agent: { position: 'library' },
      events: [],
    });
    expect(pressure).toHaveProperty('time');
    expect(pressure).toHaveProperty('total');
  });

  it('旧接口 computeTime 仍然可用', async () => {
    const { WorldPressure } = await import('../../src/pressure/WorldPressure.js');
    expect(WorldPressure.computeTime({ time: '2026-09-01T02:00:00Z', hour: 2 })).toBeGreaterThan(0.5);
  });

  it('旧接口 computeEvent 仍然可用', async () => {
    const { WorldPressure } = await import('../../src/pressure/WorldPressure.js');
    expect(WorldPressure.computeEvent([{ pressure: 0.3 }])).toBeCloseTo(0.3);
  });
});
