/**
 * ProceduralMemory Characterization Tests (v2.3-W2)
 *
 * 锁定 recordAction / pattern formation / _matchAndStrengthen / query 当前行为。
 * 用固定 simTime + 固定行为序列，断言确定输出。
 * 防未来改动无意改变 procedural 学习语义。
 */

import { describe, it, expect } from 'vitest';
const { createRequire } = await import('node:module');
const require = createRequire(import.meta.url);
const ProceduralMemory = require('../../src/agent/memory/ProceduralMemory.js');

const SIM_TIME = new Date('2026-09-01T08:00:00Z');

describe('v2.3-W2: ProceduralMemory pattern formation characterization', () => {
  it('少于 3 次相似行为 → 不形成 pattern（锁定 3 次门槛）', () => {
    const pm = new ProceduralMemory(null);
    pm.setSimTime(SIM_TIME);
    // 2 次相同行为
    pm.recordAction({ hour: 8, dayOfWeek: 1, position: '宿舍', state: '休息', valence: 0.3 });
    pm.recordAction({ hour: 8, dayOfWeek: 1, position: '宿舍', state: '休息', valence: 0.3 });
    expect(pm.patterns.size).toBe(0);
  });

  it('3+ 次相似行为 → 形成 pattern（锁定模式检测）', () => {
    const pm = new ProceduralMemory(null);
    pm.setSimTime(SIM_TIME);
    pm.recordAction({ hour: 8, dayOfWeek: 1, position: '宿舍', state: '休息', valence: 0.3 });
    pm.recordAction({ hour: 8, dayOfWeek: 1, position: '宿舍', state: '休息', valence: 0.3 });
    pm.recordAction({ hour: 8, dayOfWeek: 1, position: '宿舍', state: '休息', valence: 0.3 });
    expect(pm.patterns.size).toBe(1);
    const [key, pattern] = [...pm.patterns.entries()][0];
    expect(key).toBe('8_1_宿舍');
    expect(pattern.trigger).toEqual({ hour: 8, dayOfWeek: 1, position: '宿舍', valence: 0.3 });
    expect(pattern.action).toEqual({ region: '宿舍', state: '休息' });
    expect(pattern.strength).toBe(0.3); // 初始强度
    expect(pattern.occurrences).toBe(3);
  });

  it('不同行为 → 不合并到同 pattern（锁定区分）', () => {
    const pm = new ProceduralMemory(null);
    pm.setSimTime(SIM_TIME);
    // 行为 A: 宿舍休息
    pm.recordAction({ hour: 8, dayOfWeek: 1, position: '宿舍', state: '休息', valence: 0.3 });
    pm.recordAction({ hour: 8, dayOfWeek: 1, position: '宿舍', state: '休息', valence: 0.3 });
    pm.recordAction({ hour: 8, dayOfWeek: 1, position: '宿舍', state: '休息', valence: 0.3 });
    // 行为 B: 食堂吃饭
    pm.recordAction({ hour: 12, dayOfWeek: 1, position: '食堂', state: '吃饭', valence: 0.5 });
    pm.recordAction({ hour: 12, dayOfWeek: 1, position: '食堂', state: '吃饭', valence: 0.5 });
    pm.recordAction({ hour: 12, dayOfWeek: 1, position: '食堂', state: '吃饭', valence: 0.5 });
    expect(pm.patterns.size).toBe(2);
    expect(pm.patterns.has('8_1_宿舍')).toBe(true);
    expect(pm.patterns.has('12_1_食堂')).toBe(true);
  });
});

describe('v2.3-W2: ProceduralMemory _matchAndStrengthen characterization', () => {
  it('匹配已有 pattern → strength 增强 + occurrences++（锁定强化）', () => {
    const pm = new ProceduralMemory(null);
    pm.setSimTime(SIM_TIME);
    // 形成 pattern
    for (let i = 0; i < 3; i++) {
      pm.recordAction({ hour: 8, dayOfWeek: 1, position: '宿舍', state: '休息', valence: 0.3 });
    }
    const patternBefore = pm.patterns.get('8_1_宿舍');
    expect(patternBefore.strength).toBe(0.3);
    expect(patternBefore.occurrences).toBe(3);
    // 再记录一次匹配行为 → 强化
    pm.recordAction({ hour: 8, dayOfWeek: 1, position: '宿舍', state: '休息', valence: 0.3 });
    const patternAfter = pm.patterns.get('8_1_宿舍');
    expect(patternAfter.strength).toBeGreaterThan(0.3); // 增强
    expect(patternAfter.occurrences).toBe(4);
  });

  it('不匹配的行为 → 不影响已有 pattern strength', () => {
    const pm = new ProceduralMemory(null);
    pm.setSimTime(SIM_TIME);
    for (let i = 0; i < 3; i++) {
      pm.recordAction({ hour: 8, dayOfWeek: 1, position: '宿舍', state: '休息', valence: 0.3 });
    }
    const strengthBefore = pm.patterns.get('8_1_宿舍').strength;
    // 完全不同的行为
    pm.recordAction({ hour: 22, dayOfWeek: 2, position: '操场', state: '运动', valence: 0.8 });
    const strengthAfter = pm.patterns.get('8_1_宿舍').strength;
    expect(strengthAfter).toBe(strengthBefore); // 不变
  });
});

describe('v2.3-W2: ProceduralMemory query characterization', () => {
  it('匹配 context + strength 达标 → 返回 pattern + confidence（锁定查询）', () => {
    const pm = new ProceduralMemory(null);
    pm.setSimTime(SIM_TIME);
    // 形成初始 pattern（3 次）+ 强化到 strength >= 0.5（query 门槛）
    // 初始 strength=0.3，每次匹配强化 +0.02*match（match≤1），需 ~10 次强化
    for (let i = 0; i < 15; i++) {
      pm.recordAction({ hour: 8, dayOfWeek: 1, position: '宿舍', state: '休息', valence: 0.3 });
    }
    const pattern = pm.patterns.get('8_1_宿舍');
    expect(pattern.strength, `strength 应 >= 0.5, 实际 ${pattern.strength}`).toBeGreaterThanOrEqual(0.5);
    const result = pm.query({ hour: 8, dayOfWeek: 1, position: '宿舍', valence: 0.3 });
    expect(result).not.toBeNull();
    expect(result.action).toEqual({ region: '宿舍', state: '休息' });
    expect(result.confidence).toBeGreaterThan(0);
  });

  it('不匹配 context → 返回 null（锁定无匹配）', () => {
    const pm = new ProceduralMemory(null);
    pm.setSimTime(SIM_TIME);
    for (let i = 0; i < 3; i++) {
      pm.recordAction({ hour: 8, dayOfWeek: 1, position: '宿舍', state: '休息', valence: 0.3 });
    }
    const result = pm.query({ hour: 22, dayOfWeek: 3, position: '操场', valence: 0.8 });
    expect(result).toBeNull();
  });
});

describe('v2.3-W2: ProceduralMemory toJSON/fromJSON round-trip', () => {
  it('pattern 持久化恢复（锁定序列化）', () => {
    const pm = new ProceduralMemory(null);
    pm.setSimTime(SIM_TIME);
    for (let i = 0; i < 3; i++) {
      pm.recordAction({ hour: 8, dayOfWeek: 1, position: '宿舍', state: '休息', valence: 0.3 });
    }
    const json = pm.toJSON();
    expect(json.patterns['8_1_宿舍']).toBeDefined();
    const restored = ProceduralMemory.fromJSON(json);
    expect(restored.patterns.size).toBe(1);
    expect(restored.patterns.get('8_1_宿舍').trigger.position).toBe('宿舍');
  });
});
