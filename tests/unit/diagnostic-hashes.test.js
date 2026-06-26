/**
 * Diagnostic Hashes Test (v2.3-W3)
 *
 * 验证 3 诊断 hash 函数（computeEventLogHash / computeMemoryHash / computeAgentStateHash）：
 * - 输出 sha256 hex
 * - 内容相同 → hash 一致
 * - 内容不同 → hash 不同
 * - 不依赖 _meta（诊断 hash 不含元数据）
 *
 * 诊断 hash 不进 release gate，仅供未来诊断脚本调用。
 */

import { describe, it, expect } from 'vitest';
const { createRequire } = await import('node:module');
const require = createRequire(import.meta.url);
const {
  computeEventLogHash,
  computeMemoryHash,
  computeAgentStateHash,
} = require('../../src/store/world/tickHash.js');

function makeWorldState(overrides = {}) {
  return {
    runtimeSnapshot: {
      events: { eventLog: [{ id: 'evt_0', type: 'social', content: '在图书馆' }] },
      agents: {
        maya: {
          memory: [
            { id: 'mem_0', importance: 0.5, accessCount: 3 },
            { id: 'mem_1', importance: 0.8, accessCount: 10 },
          ],
          emotion: { joy: 0.5, sadness: -0.2 },
          behaviorField: { B: [0.5, 0.8, 0.2, 0.7] },
          needs: { hunger: 0.3, social: 0.6 },
          position: '图书馆',
          socialEnergy: 0.7,
          health: 1,
        },
      },
    },
    ...overrides,
  };
}

describe('v2.3-W3: computeEventLogHash', () => {
  it('输出 sha256 hex（64 字符）', () => {
    const h = computeEventLogHash(makeWorldState());
    expect(h).toMatch(/^[0-9a-f]{64}$/);
  });

  it('相同 eventLog → hash 一致', () => {
    const a = computeEventLogHash(makeWorldState());
    const b = computeEventLogHash(makeWorldState());
    expect(a).toBe(b);
  });

  it('eventLog 内容不同 → hash 不同', () => {
    const a = computeEventLogHash(makeWorldState());
    const b = computeEventLogHash({
      runtimeSnapshot: {
        events: { eventLog: [{ id: 'evt_0', type: 'random', content: '路过食堂' }] },
        agents: makeWorldState().runtimeSnapshot.agents,
      },
    });
    expect(a).not.toBe(b);
  });

  it('不依赖 _meta', () => {
    const a = computeEventLogHash(makeWorldState());
    const b = computeEventLogHash({ ...makeWorldState(), _meta: { seed: 99, generatedAt: '2099' } });
    expect(a).toBe(b);
  });
});

describe('v2.3-W3: computeMemoryHash', () => {
  it('输出 sha256 hex', () => {
    expect(computeMemoryHash(makeWorldState())).toMatch(/^[0-9a-f]{64}$/);
  });

  it('相同 memory → hash 一致', () => {
    expect(computeMemoryHash(makeWorldState())).toBe(computeMemoryHash(makeWorldState()));
  });

  it('memory importance 变 → hash 变', () => {
    const a = computeMemoryHash(makeWorldState());
    const b = computeMemoryHash({
      runtimeSnapshot: {
        events: makeWorldState().runtimeSnapshot.events,
        agents: {
          maya: {
            ...makeWorldState().runtimeSnapshot.agents.maya,
            memory: [
              { id: 'mem_0', importance: 0.9, accessCount: 3 }, // importance 改
              { id: 'mem_1', importance: 0.8, accessCount: 10 },
            ],
          },
        },
      },
    });
    expect(a).not.toBe(b);
  });

  it('memory accessCount 变 → hash 变', () => {
    const a = computeMemoryHash(makeWorldState());
    const b = computeMemoryHash({
      runtimeSnapshot: {
        events: makeWorldState().runtimeSnapshot.events,
        agents: {
          maya: {
            ...makeWorldState().runtimeSnapshot.agents.maya,
            memory: [
              { id: 'mem_0', importance: 0.5, accessCount: 99 }, // accessCount 改
              { id: 'mem_1', importance: 0.8, accessCount: 10 },
            ],
          },
        },
      },
    });
    expect(a).not.toBe(b);
  });

  it('支持 memory 为 {memories:[]} 嵌套格式', () => {
    const nested = makeWorldState();
    nested.runtimeSnapshot.agents.maya.memory = { memories: nested.runtimeSnapshot.agents.maya.memory };
    // 嵌套格式应与 array 格式产出不同 hash（结构不同），但都能计算
    expect(computeMemoryHash(nested)).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('v2.3-W3: computeAgentStateHash', () => {
  it('输出 sha256 hex', () => {
    expect(computeAgentStateHash(makeWorldState())).toMatch(/^[0-9a-f]{64}$/);
  });

  it('相同 agent state → hash 一致', () => {
    expect(computeAgentStateHash(makeWorldState())).toBe(computeAgentStateHash(makeWorldState()));
  });

  it('emotion 变 → hash 变', () => {
    const a = computeAgentStateHash(makeWorldState());
    const b = computeAgentStateHash({
      runtimeSnapshot: {
        events: makeWorldState().runtimeSnapshot.events,
        agents: {
          maya: {
            ...makeWorldState().runtimeSnapshot.agents.maya,
            emotion: { joy: 0.9, sadness: -0.2 }, // joy 改
          },
        },
      },
    });
    expect(a).not.toBe(b);
  });

  it('position 变 → hash 变', () => {
    const a = computeAgentStateHash(makeWorldState());
    const b = computeAgentStateHash({
      runtimeSnapshot: {
        events: makeWorldState().runtimeSnapshot.events,
        agents: {
          maya: {
            ...makeWorldState().runtimeSnapshot.agents.maya,
            position: '食堂', // position 改
          },
        },
      },
    });
    expect(a).not.toBe(b);
  });
});

describe('v2.3-W3: 诊断 hash 不进 release gate', () => {
  it('3 诊断 hash 互相独立（不同字段层）', () => {
    const ws = makeWorldState();
    const eh = computeEventLogHash(ws);
    const mh = computeMemoryHash(ws);
    const ah = computeAgentStateHash(ws);
    // 三者应不同（覆盖不同字段）
    expect(eh).not.toBe(mh);
    expect(eh).not.toBe(ah);
    expect(mh).not.toBe(ah);
  });
});
