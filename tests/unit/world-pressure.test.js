/**
 * WorldPressure 测试
 */

import { describe, it, expect } from 'vitest';
import { computeWorldPressure, computeTimePressure, computeEventPressure, computeLocationPressure } from '../../core/WorldPressure.js';

describe('WorldPressure', () => {
  describe('computeWorldPressure', () => {
    it('返回完整 pressure 结构', () => {
      const pressure = computeWorldPressure({
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

      computeWorldPressure({ world, agent, events });

      expect(world).toEqual(originalWorld);
      expect(agent).toEqual(originalAgent);
    });
  });

  describe('computeTimePressure', () => {
    it('深夜返回高压力', () => {
      const pressure = computeTimePressure({ time: '2026-09-01T02:00:00Z' });
      expect(pressure).toBeGreaterThan(0.5);
    });

    it('白天返回低压力', () => {
      const pressure = computeTimePressure({ time: '2026-09-01T14:00:00Z' });
      expect(pressure).toBeLessThan(0.3);
    });

    it('world 为 null 时返回 0', () => {
      expect(computeTimePressure(null)).toBe(0);
    });
  });

  describe('computeLocationPressure — domain-agnostic', () => {
    it('无 locationPressure/locationValence 时返回 0', () => {
      // position='home' 不应影响结果——不解析 position 字符串
      const pressure = computeLocationPressure({ position: 'home' });
      expect(pressure).toBe(0);
    });

    it('position=safe 也不影响结果', () => {
      const pressure = computeLocationPressure({ position: 'safe_zone' });
      expect(pressure).toBe(0);
    });

    it('有 locationPressure 时直接使用', () => {
      const pressure = computeLocationPressure({ position: 'any', locationPressure: 0.5 });
      expect(pressure).toBe(0.5);
    });

    it('有 locationValence 时取反', () => {
      // valence 正 = 愉快 → 压力负
      const pressure = computeLocationPressure({ locationValence: 0.3 });
      expect(pressure).toBe(-0.3);
    });

    it('agent 为 null 时返回 0', () => {
      expect(computeLocationPressure(null)).toBe(0);
    });
  });

  describe('computeEventPressure — structured inputs', () => {
    it('event.pressure 直接累加', () => {
      const events = [
        { pressure: 0.3 },
        { pressure: 0.2 },
      ];
      const pressure = computeEventPressure(events);
      expect(pressure).toBeCloseTo(0.5, 5);
    });

    it('event.valence 负值增加压力', () => {
      const events = [{ valence: -0.4 }];
      const pressure = computeEventPressure(events);
      expect(pressure).toBeCloseTo(0.4, 5);
    });

    it('event.valence 正值减少压力', () => {
      const events = [{ valence: 0.3 }];
      const pressure = computeEventPressure(events);
      expect(pressure).toBeCloseTo(-0.3, 5);
    });

    it('无 pressure/valence 的事件不影响结果', () => {
      const events = [{ type: 'conflict' }, { type: 'disaster' }];
      const pressure = computeEventPressure(events);
      expect(pressure).toBe(0);
    });

    it('结果 clamp 到 [-1, 1]', () => {
      const events = Array.from({ length: 20 }, () => ({ pressure: 0.5 }));
      const pressure = computeEventPressure(events);
      expect(pressure).toBeLessThanOrEqual(1);
    });

    it('events 为 null 时返回 0', () => {
      expect(computeEventPressure(null)).toBe(0);
    });
  });
});
