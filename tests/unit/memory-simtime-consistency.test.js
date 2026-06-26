/**
 * Memory simTime Consistency Characterization Test (v2.3-W1)
 *
 * 锁定 PersonalMemory._simTime 行为：
 *   - 构造后 setSimTime 前 _simTime === 0（deterministic，非墙上时钟）
 *   - setSimTime 后 _simTime === simTime.getTime()
 *   - 与 ProceduralMemory 初值一致（两者都 0）
 *
 * 防止构造到 setSimTime 间的墙上时钟渗漏（v2.3-W1 修复）。
 */

import { describe, it, expect } from 'vitest';
const { createRequire } = await import('node:module');
const require = createRequire(import.meta.url);
const PersonalMemory = require('../../src/agent/memory/PersonalMemory.js');
const ProceduralMemory = require('../../src/agent/memory/ProceduralMemory.js');

const DOMAIN = {
  memoryTemplates: {},  // 让 _semanticCategories fallback 到 SEMANTIC_EVENT_CATEGORIES
  regions: ['图书馆', '食堂', '宿舍'],
};

describe('v2.3-W1: PersonalMemory _simTime deterministic init', () => {
  it('构造后 setSimTime 前 _simTime === 0（非墙上时钟）', () => {
    const mem = new PersonalMemory('test-agent', [], null, DOMAIN, null);
    expect(mem._simTime).toBe(0);
  });

  it('setSimTime 后 _simTime === simTime.getTime()', () => {
    const mem = new PersonalMemory('test-agent', [], null, DOMAIN, null);
    const simTime = new Date('2026-09-01T08:00:00Z');
    mem.setSimTime(simTime);
    expect(mem._simTime).toBe(simTime.getTime());
  });

  it('构造期未 setSimTime 时 addExperience 用 _simTime=0（deterministic）', () => {
    const mem = new PersonalMemory('test-agent', [], null, DOMAIN, null);
    // addExperience 前 _simTime 应是 0
    expect(mem._simTime).toBe(0);
    // addExperience 产生的 memory timestamp 应基于 _simTime=0
    mem.addExperience({
      id: 'evt_test',
      type: 'social',
      content: '测试事件',
      effects: [],
    }, { current: { joy: 0.5 }, getValence: () => 0.3, getArousal: () => 0.4 });
    const created = mem.memories.find(m => m.eventId === 'evt_test');
    expect(created).toBeDefined();
    // timestamp 基于 _simTime=0 → new Date(0) = epoch
    expect(created.timestamp.getTime()).toBe(0);
  });
});

describe('v2.3-W1: ProceduralMemory _simTime 一致性（对照）', () => {
  it('ProceduralMemory 构造后 _simTime === 0（与 PersonalMemory 一致）', () => {
    const procMem = new ProceduralMemory(null);
    expect(procMem._simTime).toBe(0);
  });
});

describe('v2.3-W1: 恢复后 _simTime 重置为 0（deterministic）', () => {
  it('fromJSON 恢复后 _simTime === 0（setSimTime 前）', () => {
    // 模拟恢复：savedState 含 memory 数组
    const savedState = {
      memories: [
        {
          id: 'mem_test_1',
          content: '恢复的记忆',
          category: 'general',
          emotionTag: 'neutral',
          importance: 0.5,
          timestamp: '2026-09-01T08:00:00.000Z',
          lastAccessed: '2026-09-01T08:00:00.000Z',
          presentations: ['2026-09-01T08:00:00.000Z'],
          accessCount: 1,
          associations: [],
          eventId: 'evt_1',
          emotionSnapshot: {},
          semanticCategory: null,
          appraisal: null,
        },
      ],
    };
    const mem = new PersonalMemory('test-agent', [], savedState, DOMAIN, null);
    // 恢复后 setSimTime 前 _simTime 应是 0（deterministic，非墙上时钟）
    expect(mem._simTime).toBe(0);
    // setSimTime 后覆盖
    const simTime = new Date('2026-09-01T09:00:00Z');
    mem.setSimTime(simTime);
    expect(mem._simTime).toBe(simTime.getTime());
  });
});
