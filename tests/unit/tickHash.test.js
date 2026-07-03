/**
 * tickHash 单元测试 (REPLAY_TRUST_ROADMAP §6)
 *
 * 覆盖：canonical 化、数值量化精度、key 顺序无关性、字段过滤（不 hash _meta/narrative/墙上时间/rngState）。
 */

import { describe, it, expect } from 'vitest';
const {
  computeTickHash,
  computeTickHashSeries,
  canonicalize,
  extractHashedFields,
  HASHED_FIELDS,
  QUANT,
} = require('../../src/store/world/tickHash');

describe('tickHash: canonicalize', () => {
  it('对象 key 递归排序', () => {
    const a = { z: 1, a: 2, m: { y: 3, b: 4 } };
    const c = canonicalize(a);
    const keys = Object.keys(c);
    expect(keys).toEqual(['a', 'm', 'z']);
    expect(Object.keys(c.m)).toEqual(['b', 'y']);
  });

  it('数组保持顺序（不排序元素）', () => {
    const c = canonicalize([3, 1, 2]);
    expect(c).toEqual([3, 1, 2]);
  });

  it('null 透传', () => {
    expect(canonicalize(null)).toBeNull();
  });

  it('Date 规范化为 ISO 字符串', () => {
    const date = new Date('2026-09-01T08:00:00.000Z');
    expect(canonicalize(date)).toBe('2026-09-01T08:00:00.000Z');
  });

  it('Invalid Date 规范化为稳定字符串', () => {
    expect(canonicalize(new Date('not-a-date'))).toBe('Invalid Date');
  });

  it('非对象/非 number 透传（string/boolean）', () => {
    expect(canonicalize('x')).toBe('x');
    expect(canonicalize(true)).toBe(true);
  });
});

describe('tickHash: 数值量化（9 位小数）', () => {
  it('量化到 1e-9 精度', () => {
    expect(canonicalize(0.1 + 0.2)).toBe(Math.round((0.1 + 0.2) * QUANT) / QUANT);
    // 0.1+0.2 = 0.30000000000000004 → 量化为 0.3
    expect(canonicalize(0.1 + 0.2)).toBe(0.3);
  });

  it('relationship strength 0-1 量化保留有效精度', () => {
    expect(canonicalize(0.123456789)).toBe(0.123456789);
    // 末位漂移被消除
    expect(canonicalize(0.123456789000001)).toBe(0.123456789);
  });

  it('整数不变', () => {
    expect(canonicalize(42)).toBe(42);
    expect(canonicalize(0)).toBe(0);
  });

  it('Infinity/NaN 转字符串（避免 JSON 序列化 null 歧义）', () => {
    expect(canonicalize(Infinity)).toBe('Infinity');
    expect(canonicalize(NaN)).toBe('NaN');
  });
});

describe('tickHash: extractHashedFields 字段过滤', () => {
  it('仅提取规范字段（worldClock/characters/relationships/events）', () => {
    const ws = {
      worldClock: { time: 1 },
      characters: [],
      relationships: [],
      events: [],
    };
    const extracted = extractHashedFields(ws);
    expect(Object.keys(extracted).sort()).toEqual([...HASHED_FIELDS].sort());
  });

  it('排除 _meta / narrative / rngState', () => {
    const ws = {
      worldClock: { time: 1 },
      _meta: { seed: 42, generatedAt: '2026-01-01' },
      narrative: '某叙事文本',
      rngState: { state: 123 },
    };
    const extracted = extractHashedFields(ws);
    expect(extracted).not.toHaveProperty('_meta');
    expect(extracted).not.toHaveProperty('narrative');
    expect(extracted).not.toHaveProperty('rngState');
  });

  it('缺失字段不报错（仅含存在的规范字段）', () => {
    const ws = { worldClock: { time: 1 } };
    const extracted = extractHashedFields(ws);
    expect(extracted).toEqual({ worldClock: { time: 1 } });
  });

  it('非对象入参返回空对象', () => {
    expect(extractHashedFields(null)).toEqual({});
    expect(extractHashedFields(undefined)).toEqual({});
  });
});

describe('tickHash: computeTickHash', () => {
  it('返回 sha256 hex（64 字符）', () => {
    const result = computeTickHash({ worldClock: { time: 1 } }, 0);
    expect(result.tick).toBe(0);
    expect(result.hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('key 顺序无关：内容相同 key 顺序不同 hash 一致', () => {
    const a = { worldClock: { time: 1 }, characters: [{ id: 'x', v: 0.5 }] };
    const b = { characters: [{ v: 0.5, id: 'x' }], worldClock: { time: 1 } };
    expect(computeTickHash(a, 0).hash).toBe(computeTickHash(b, 0).hash);
  });

  it('_meta 变化不影响 hash（字段过滤生效）', () => {
    const base = { worldClock: { time: 1 } };
    const withMeta = { ...base, _meta: { seed: 42, generatedAt: '2026-01-01' } };
    const withMeta2 = { ...base, _meta: { seed: 99, generatedAt: '2027-01-01' } };
    expect(computeTickHash(withMeta, 0).hash).toBe(computeTickHash(withMeta2, 0).hash);
  });

  it('rngState 变化不影响 hash', () => {
    const base = { worldClock: { time: 1 } };
    const a = { ...base, rngState: { state: 123 } };
    const b = { ...base, rngState: { state: 999 } };
    expect(computeTickHash(a, 0).hash).toBe(computeTickHash(b, 0).hash);
  });

  it('数值末位漂移不改变 hash（量化生效）', () => {
    const a = { worldClock: { time: 1 }, relationships: [{ strength: 0.5 }] };
    const b = { worldClock: { time: 1 }, relationships: [{ strength: 0.5000000001 }] };
    expect(computeTickHash(a, 0).hash).toBe(computeTickHash(b, 0).hash);
  });

  it('真实数值差异改变 hash', () => {
    const a = { worldClock: { time: 1 }, relationships: [{ strength: 0.5 }] };
    const b = { worldClock: { time: 1 }, relationships: [{ strength: 0.6 }] };
    expect(computeTickHash(a, 0).hash).not.toBe(computeTickHash(b, 0).hash);
  });

  it('Date 和对应 ISO 字符串 hash 一致', () => {
    const iso = '2026-09-01T08:00:00.000Z';
    const a = { worldClock: { time: new Date(iso) } };
    const b = { worldClock: { time: iso } };
    expect(computeTickHash(a, 0).hash).toBe(computeTickHash(b, 0).hash);
  });

  it('不同 Date 时间改变 hash', () => {
    const a = { worldClock: { time: new Date('2026-09-01T08:00:00.000Z') } };
    const b = { worldClock: { time: new Date('2026-09-01T08:01:00.000Z') } };
    expect(computeTickHash(a, 0).hash).not.toBe(computeTickHash(b, 0).hash);
  });

  it('tick 不参与 hash 内容（仅写入返回值）', () => {
    const ws = { worldClock: { time: 1 } };
    expect(computeTickHash(ws, 5).hash).toBe(computeTickHash(ws, 100).hash);
  });
});

describe('tickHash: computeTickHashSeries', () => {
  it('按 tick 排序输出序列', () => {
    const ticks = [
      { tick: 2, worldState: { worldClock: { time: 2 } } },
      { tick: 0, worldState: { worldClock: { time: 0 } } },
      { tick: 1, worldState: { worldClock: { time: 1 } } },
    ];
    const series = computeTickHashSeries(ticks);
    expect(series.map(s => s.tick)).toEqual([0, 1, 2]);
  });

  it('空数组返回空', () => {
    expect(computeTickHashSeries([])).toEqual([]);
  });

  it('非数组返回空', () => {
    expect(computeTickHashSeries(null)).toEqual([]);
  });
});
