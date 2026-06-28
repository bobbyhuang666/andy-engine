/**
 * PersonalMemory Characterization Tests (v2.3-W2)
 *
 * 锁定 retrieve / consolidate / _baseLevelActivation / _memorySimilarity 当前行为。
 * 用固定 simTime + 固定 RNG seed + 固定 memory 集合，断言确定输出。
 * 防未来改动（含 compaction）无意改变语义。
 *
 * 若测试 fail：说明函数行为变更，需人审确认是否 intentional。
 * 不调整生产逻辑让测试通过。
 */

import { describe, it, expect } from 'vitest';
const { createRequire } = await import('node:module');
const require = createRequire(import.meta.url);
const PersonalMemory = require('../../src/agent/memory/PersonalMemory.js');
const { RNG } = require('../../src/shared/rng.js');

const DOMAIN = { memoryTemplates: {}, regions: ['图书馆', '食堂', '宿舍'] };
const SIM_TIME = new Date('2026-09-01T08:00:00Z');

function buildMemoryWithSeeds() {
  const rng = new RNG(42);
  const mem = new PersonalMemory('test', [], null, DOMAIN, rng);
  mem.setSimTime(SIM_TIME);
  mem.addExperience(
    { id: 'evt_1', type: 'social', content: '在图书馆看书', effects: [], participants: ['leo'] },
    { current: { joy: 0.5 }, getValence: () => 0.3, getArousal: () => 0.4 }
  );
  mem.addExperience(
    { id: 'evt_2', type: 'social', content: '在图书馆遇到同学', effects: [], participants: ['leo'] },
    { current: { joy: 0.6 }, getValence: () => 0.4, getArousal: () => 0.5 }
  );
  mem.addExperience(
    { id: 'evt_3', type: 'random', content: '路过食堂', effects: [], participants: [] },
    { current: { joy: 0.4 }, getValence: () => 0.2, getArousal: () => 0.3 }
  );
  return mem;
}

describe('v2.3-W2: PersonalMemory _baseLevelActivation characterization', () => {
  it('固定 memory + simTime → 确定 baseLevel 值', () => {
    const mem = buildMemoryWithSeeds();
    const now = mem._simTime;
    // 3 条 memory 各有 1 presentation（addExperience 时 push）
    expect(mem._baseLevelActivation(mem.memories[0], now)).toBeCloseTo(2.067583278371178, 10);
    expect(mem._baseLevelActivation(mem.memories[1], now)).toBeCloseTo(2.067583278371178, 10);
  });

  it('不同 simTime → baseLevel 随时间衰减（锁定衰减行为）', () => {
    const mem = buildMemoryWithSeeds();
    // 1 小时后
    const later = new Date('2026-09-01T09:00:00Z').getTime();
    const bl0 = mem._baseLevelActivation(mem.memories[0], mem._simTime);
    const bl1 = mem._baseLevelActivation(mem.memories[0], later);
    // 时间推移 baseLevel 应降低（ACT-R 衰减）
    expect(bl1).toBeLessThan(bl0);
  });

  it('presentations 更多 → baseLevel 更高（锁定累积效应）', () => {
    const mem = buildMemoryWithSeeds();
    const now = mem._simTime;
    const m = mem.memories[0];
    const blBefore = mem._baseLevelActivation(m, now);
    // 模拟额外访问（push presentation）
    m.presentations.push(new Date(now));
    const blAfter = mem._baseLevelActivation(m, now);
    expect(blAfter).toBeGreaterThan(blBefore);
  });
});

describe('v2.3-W2: PersonalMemory _memorySimilarity characterization', () => {
  it('同类别 + 内容重叠 → 正相似度（锁定计算）', () => {
    const mem = buildMemoryWithSeeds();
    // m1 '在图书馆看书' vs m2 '在图书馆遇到同学'（同 social 类，内容重叠）
    const sim = mem._memorySimilarity(mem.memories[0], mem.memories[1]);
    expect(sim).toBeCloseTo(0.556923076923077, 10);
  });

  it('不同类别 → similarity = 0（锁定类别门槛）', () => {
    const mem = buildMemoryWithSeeds();
    // m1 social vs m3 random → 不同类别
    const sim = mem._memorySimilarity(mem.memories[0], mem.memories[2]);
    expect(sim).toBe(0);
  });
});

describe('v2.3-W2: PersonalMemory retrieve characterization', () => {
  it('固定 context → 确定返回 top-K ids 顺序', () => {
    const mem = buildMemoryWithSeeds();
    const r = mem.retrieve(
      { keywords: ['图书馆'], emotion: { current: { joy: 0.5 }, getValence: () => 0.3, getArousal: () => 0.4 } },
      2
    );
    expect(r.memories.map(m => m.id)).toEqual(['mem_test_0', 'mem_test_1']);
  });

  it('不同 keywords → 不同检索结果', () => {
    const mem = buildMemoryWithSeeds();
    const r = mem.retrieve(
      { keywords: ['食堂'], emotion: { current: { joy: 0.5 }, getValence: () => 0.3, getArousal: () => 0.4 } },
      2
    );
    // '路过食堂' 匹配 → mem_test_2 应在结果中
    expect(r.memories.some(m => m.id === 'mem_test_2')).toBe(true);
  });
});

describe('v2.3-W2: PersonalMemory consolidate characterization', () => {
  it('低相似度 memory → 无合并（similarity < threshold 0.7）', () => {
    const mem = buildMemoryWithSeeds();
    const merges = mem.consolidate();
    // m1-m2 sim=0.557 < 0.7 threshold → 无合并
    expect(merges).toEqual([]);
    expect(mem.memories.length).toBe(3);
  });

  it('高相似度 memory → 触发合并 keep/remove pair', () => {
    const rng = new RNG(42);
    const mem = new PersonalMemory('test', [], null, DOMAIN, rng);
    mem.setSimTime(SIM_TIME);
    // 构造高相似度 memory（同类别 + 几乎相同内容）
    mem.addExperience(
      { id: 'evt_a', type: 'social', content: '在图书馆看书学习', effects: [], participants: ['leo'] },
      { current: { joy: 0.5 }, getValence: () => 0.3, getArousal: () => 0.4 }
    );
    mem.addExperience(
      { id: 'evt_b', type: 'social', content: '在图书馆看书学习', effects: [], participants: ['leo'] },
      { current: { joy: 0.6 }, getValence: () => 0.4, getArousal: () => 0.5 }
    );
    const sim = mem._memorySimilarity(mem.memories[0], mem.memories[1]);
    expect(sim, `高相似度 memory sim 应 > 0.7, 实际 ${sim}`).toBeGreaterThan(0.7);
    const merges = mem.consolidate();
    expect(merges.length).toBe(1);
    // m1 importance (0.8625, joy 0.6 经情绪增强) > m0 (0.8395, joy 0.5) → m1 keep
    expect(merges[0].kept).toBe('mem_test_1');
    expect(merges[0].removed).toBe('mem_test_0');
    expect(mem.memories.length).toBe(1);
  });

  it('合并后 keep memory 继承 accessCount + presentations', () => {
    const rng = new RNG(42);
    const mem = new PersonalMemory('test', [], null, DOMAIN, rng);
    mem.setSimTime(SIM_TIME);
    mem.addExperience(
      { id: 'evt_a', type: 'social', content: '在图书馆看书学习', effects: [], participants: ['leo'] },
      { current: { joy: 0.5 }, getValence: () => 0.3, getArousal: () => 0.4 }
    );
    mem.addExperience(
      { id: 'evt_b', type: 'social', content: '在图书馆看书学习', effects: [], participants: ['leo'] },
      { current: { joy: 0.6 }, getValence: () => 0.4, getArousal: () => 0.5 }
    );
    const beforeKeepAcc = mem.memories[0].accessCount;
    const beforeKeepPres = mem.memories[0].presentations.length;
    const beforeRemoveAcc = mem.memories[1].accessCount;
    const beforeRemovePres = mem.memories[1].presentations.length;
    mem.consolidate();
    const kept = mem.memories[0];
    expect(kept.accessCount).toBe(beforeKeepAcc + beforeRemoveAcc);
    // R9 fix: presentations are deduplicated during merge (shared timestamps removed).
    // The count may be less than the raw sum if both memories share presentation timestamps.
    expect(kept.presentations.length).toBeLessThanOrEqual(beforeKeepPres + beforeRemovePres);
    expect(kept.presentations.length).toBeGreaterThanOrEqual(Math.max(beforeKeepPres, beforeRemovePres));
  });
});
