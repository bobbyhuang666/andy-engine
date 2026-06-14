/**
 * Shadow Action Selection 测试
 * Phase 26.5/26.7: 基础 shadow 行为
 * Phase 33: Shadow Trace Quality Gate — trace 可靠性、确定性、隔离性
 */

import { describe, it, expect } from 'vitest';
const AndyEngine = require('../../index.js');
const tavernDomain = require('../../presets/tavern/index.js');

const TEST_START = new Date('2026-09-01T08:00:00Z');

function createEngine(seed, actionSelectionOverride, domain) {
  const config = { seed, startTime: new Date(TEST_START) };
  if (actionSelectionOverride) {
    config.actionSelection = actionSelectionOverride;
  }
  if (domain) {
    config.domain = domain;
  }
  const engine = new AndyEngine(config);
  engine.createCharacter({ id: 'char_1', name: 'TestChar', mbti: 'INFP', schedule: 'student' });
  return engine;
}

function snapshotAgentState(agent) {
  return {
    position: agent.position,
    health: agent.health,
    socialEnergy: agent.socialEnergy,
    B: [...agent.behaviorField.B],
    needs: { ...agent.needs.needs },
    emotionSnapshot: { ...agent.emotion.current },
    state: agent.stateMachine.currentState,
  };
}

function compareStates(a, b) {
  expect(a.position).toBe(b.position);
  expect(a.health).toBe(b.health);
  expect(a.socialEnergy).toBe(b.socialEnergy);
  expect(a.state).toBe(b.state);
  for (let d = 0; d < 4; d++) {
    expect(a.B[d]).toBe(b.B[d]);
  }
  for (const key of Object.keys(a.needs)) {
    expect(a.needs[key]).toBe(b.needs[key]);
  }
  for (const key of Object.keys(a.emotionSnapshot)) {
    expect(a.emotionSnapshot[key]).toBe(b.emotionSnapshot[key]);
  }
}

const SHADOW_ENABLED = { enabled: true, mode: 'shadow', temperature: 0.35, recordTraces: true, maxTraceHistory: 100 };
const SHADOW_DISABLED = { enabled: false, mode: 'shadow', temperature: 0.35, recordTraces: true, maxTraceHistory: 100 };

// ═══════════════════════════════════════════
// Phase 26.5/26.7: 基础行为
// ═══════════════════════════════════════════

describe('Shadow Action Selection: basic behavior', () => {
  it('默认（无 actionSelection config）不产生 trace', () => {
    const engine = createEngine('no-config');
    for (let i = 0; i < 5; i++) engine.tick();
    expect(engine.getAgent('char_1')._actionTraceHistory.length).toBe(0);
  });

  it('actionSelection.enabled=false 不产生 trace，不改变行为', () => {
    const e1 = createEngine('no-shadow', SHADOW_DISABLED);
    const e2 = createEngine('no-shadow', SHADOW_DISABLED);

    for (let i = 0; i < 10; i++) {
      e1.tick();
      e2.tick();
    }

    const a1 = e1.getAgent('char_1');
    const a2 = e2.getAgent('char_1');
    expect(a1._actionTraceHistory.length).toBe(0);
    expect(a2._actionTraceHistory.length).toBe(0);
    compareStates(snapshotAgentState(a1), snapshotAgentState(a2));
  });

  it('shadow mode 产生 trace', () => {
    const engine = createEngine('shadow_trace', SHADOW_ENABLED);
    engine.tick();

    const agent = engine.getAgent('char_1');
    expect(agent._actionTraceHistory.length).toBe(1);

    const trace = agent._actionTraceHistory[0];
    expect(trace.selectedAction).toBeDefined();
    expect(trace.candidateAlternatives).toBeDefined();
    expect(trace.scoreBreakdown).toBeDefined();
    expect(trace.rngStateBefore).toBeDefined();
    expect(trace.rngStateAfter).toBeDefined();
    expect(trace.temperature).toBeDefined();
  });

  it('shadow mode 不改变 position/needs/emotion/behaviorField/socialEnergy/health/state', () => {
    const e1 = createEngine('shadow-invariant', SHADOW_DISABLED);
    for (let i = 0; i < 20; i++) e1.tick();
    const baselineState = snapshotAgentState(e1.getAgent('char_1'));

    const e2 = createEngine('shadow-invariant', SHADOW_ENABLED);
    for (let i = 0; i < 20; i++) e2.tick();

    const shadowAgent = e2.getAgent('char_1');
    expect(shadowAgent._actionTraceHistory.length).toBe(20);
    compareStates(baselineState, snapshotAgentState(shadowAgent));
  });

  it('same seed 产生相同 reasonTrace', () => {
    const e1 = createEngine('deterministic', SHADOW_ENABLED);
    const e2 = createEngine('deterministic', SHADOW_ENABLED);

    for (let i = 0; i < 5; i++) {
      e1.tick();
      e2.tick();
    }

    const t1 = e1.getAgent('char_1')._actionTraceHistory;
    const t2 = e2.getAgent('char_1')._actionTraceHistory;

    expect(t1.length).toBe(t2.length);
    expect(JSON.stringify(t1)).toBe(JSON.stringify(t2));
  });

  it('trace history 严格 <= maxTraceHistory', () => {
    const engine = createEngine('history_limit', { ...SHADOW_ENABLED, maxTraceHistory: 5 });
    for (let i = 0; i < 10; i++) engine.tick();
    expect(engine.getAgent('char_1')._actionTraceHistory.length).toBe(5);
  });

  it('shadow mode 不进入 EventDispatcher.eventLog', () => {
    const engine = createEngine('no_event_leak', SHADOW_ENABLED);
    for (let i = 0; i < 5; i++) engine.tick();

    const eventLog = engine.world.eventDispatcher.eventLog;
    const actionEvents = eventLog.filter(e => e.type === 'action_selected');
    expect(actionEvents.length).toBe(0);
  });

  it('两个引擎不同 config 互不污染', () => {
    const eDisabled = createEngine('isolation-a', SHADOW_DISABLED);
    const eEnabled = createEngine('isolation-b', SHADOW_ENABLED);

    for (let i = 0; i < 5; i++) {
      eDisabled.tick();
      eEnabled.tick();
    }

    expect(eDisabled.getAgent('char_1')._actionTraceHistory.length).toBe(0);
    expect(eEnabled.getAgent('char_1')._actionTraceHistory.length).toBe(5);
  });
});

// ═══════════════════════════════════════════
// Phase 33: Shadow Trace Quality Gate
// ═══════════════════════════════════════════

describe('Phase 33: Shadow Trace Quality Gate', () => {

  // ─── 1. Golden ReasonTrace window ───
  // 固定 seed + startTime + 单 agent，跑 5 ticks，比较完整 trace 结构和值
  it('golden ReasonTrace window: 5 ticks, full structure comparison', () => {
    const engine = createEngine('golden-window', SHADOW_ENABLED);
    for (let i = 0; i < 5; i++) engine.tick();

    const traces = engine.getAgent('char_1')._actionTraceHistory;
    expect(traces.length).toBe(5);

    for (let i = 0; i < 5; i++) {
      const trace = traces[i];

      // Trace 结构完整性
      expect(trace).toHaveProperty('selectedAction');
      expect(trace).toHaveProperty('selectedCandidate');
      expect(trace).toHaveProperty('candidateAlternatives');
      expect(trace).toHaveProperty('scoreBreakdown');
      expect(trace).toHaveProperty('keyReasons');
      expect(trace).toHaveProperty('rngStateBefore');
      expect(trace).toHaveProperty('randomDraw');
      expect(trace).toHaveProperty('rngStateAfter');
      expect(trace).toHaveProperty('temperature');
      expect(trace).toHaveProperty('stateDeltas');

      // stateDeltas 必须为 null（shadow 模式不应用）
      expect(trace.stateDeltas).toBeNull();

      // temperature 一致
      expect(trace.temperature).toBe(0.35);

      // selectedAction 是合法字符串或 null
      if (trace.selectedAction !== null) {
        expect(typeof trace.selectedAction).toBe('string');
        expect(trace.selectedAction.length).toBeGreaterThan(0);
      }

      // candidateAlternatives 是数组
      expect(Array.isArray(trace.candidateAlternatives)).toBe(true);

      // scoreBreakdown 结构
      if (trace.scoreBreakdown) {
        expect(trace.scoreBreakdown).toHaveProperty('total');
        expect(typeof trace.scoreBreakdown.total).toBe('number');
      }

      // keyReasons 是数组
      expect(Array.isArray(trace.keyReasons)).toBe(true);
    }

    // 同 seed 再跑一次，验证字节级一致
    const engine2 = createEngine('golden-window', SHADOW_ENABLED);
    for (let i = 0; i < 5; i++) engine2.tick();
    const traces2 = engine2.getAgent('char_1')._actionTraceHistory;
    expect(JSON.stringify(traces)).toBe(JSON.stringify(traces2));
  });

  // ─── 2. Same seed full trace equality ───
  // 两个 engine 同 seed、同 world state，N ticks 后 JSON 完全一致
  it('same seed full trace equality: 10 ticks, byte-equivalent JSON', () => {
    const e1 = createEngine('full-equality', SHADOW_ENABLED);
    const e2 = createEngine('full-equality', SHADOW_ENABLED);

    for (let i = 0; i < 10; i++) {
      e1.tick();
      e2.tick();
    }

    const t1 = e1.getAgent('char_1')._actionTraceHistory;
    const t2 = e2.getAgent('char_1')._actionTraceHistory;

    expect(t1.length).toBe(10);
    expect(t2.length).toBe(10);
    expect(JSON.stringify(t1)).toBe(JSON.stringify(t2));

    // 也验证 agent state 一致
    compareStates(
      snapshotAgentState(e1.getAgent('char_1')),
      snapshotAgentState(e2.getAgent('char_1'))
    );
  });

  // ─── 3. Shadow invariance (enhanced) ───
  // shadow enabled vs disabled 在同 seed 下，所有状态字段完全一致
  it('shadow invariance: enabled vs disabled, all state fields identical', () => {
    const eOff = createEngine('invariance', SHADOW_DISABLED);
    const eOn = createEngine('invariance', SHADOW_ENABLED);

    for (let i = 0; i < 15; i++) {
      eOff.tick();
      eOn.tick();
    }

    const aOff = eOff.getAgent('char_1');
    const aOn = eOn.getAgent('char_1');

    expect(aOff._actionTraceHistory.length).toBe(0);
    expect(aOn._actionTraceHistory.length).toBe(15);

    compareStates(snapshotAgentState(aOff), snapshotAgentState(aOn));

    // 额外检查：emotion baseline 一致
    for (const dim of Object.keys(aOff.emotion.baseline)) {
      expect(aOff.emotion.baseline[dim]).toBe(aOn.emotion.baseline[dim]);
    }

    // proceduralMemory 一致
    expect(JSON.stringify(aOff.proceduralMemory)).toBe(JSON.stringify(aOn.proceduralMemory));
  });

  // ─── 4. Custom tavern domain trace ───
  // tavern domain 生成 trace，JSON 不含 campus-only forbidden terms
  it('tavern domain trace contains no campus-only terms', () => {
    const engine = createEngine('tavern-trace', SHADOW_ENABLED, tavernDomain);
    for (let i = 0; i < 5; i++) engine.tick();

    const traces = engine.getAgent('char_1')._actionTraceHistory;
    expect(traces.length).toBe(5);

    const traceJson = JSON.stringify(traces);

    // Tavern forbidden terms (campus-only vocabulary)
    const campusTerms = ['宿舍', '教学楼', '图书馆', '食堂', '便利店', '操场',
      '校园广场', '打工地点', '回家路上', '教室', '自习室', '网吧',
      '上课', '下课', '翘课', '学生', '老师', '同学', '宿舍楼'];

    for (const term of campusTerms) {
      expect(traceJson).not.toContain(term);
    }

    // 验证 trace 有合理内容
    const hasSomeAction = traces.some(t => t.selectedAction !== null);
    expect(hasSomeAction).toBe(true);
  });

  // ─── 5. Real no-candidates path ───
  // stub CandidateProviderManager.generateAll 返回空，验证不崩溃并记录 empty trace
  it('real no-candidates: stub provider returns empty, no crash, records empty trace', () => {
    const engine = createEngine('real-no-candidates', SHADOW_ENABLED);
    const agent = engine.getAgent('char_1');

    // 替换 provider manager 为 stub
    agent._candidateProviderManager = {
      generateAll() { return []; },
    };

    expect(() => engine.tick()).not.toThrow();

    const traces = agent._actionTraceHistory;
    expect(traces.length).toBe(1);

    const trace = traces[0];
    expect(trace.selectedAction).toBeNull();
    expect(trace.selectedCandidate).toBeNull();
    expect(trace.candidateAlternatives).toEqual([]);
    expect(trace.scoreBreakdown).toBeNull();
    expect(trace.keyReasons).toContain('no-valid-candidates');
    expect(trace.stateDeltas).toBeNull();
  });

  // ─── 6. Restore continuation ───
  // save -> restore -> continue tick -> trace history 继续增长且 deterministic
  it('restore continuation: save/restore/continue, traces grow and remain deterministic', () => {
    const e1 = createEngine('restore-cont', SHADOW_ENABLED);
    for (let i = 0; i < 5; i++) e1.tick();

    const json = e1.toJSON();
    const savedTraces = json.agents.char_1._actionTraceHistory;
    expect(savedTraces.length).toBe(5);

    // Restore the same snapshot twice and continue both paths.
    // This verifies snapshot continuation determinism without assuming
    // snapshot/restore must be byte-identical to a fresh 10-tick run.
    const e2 = AndyEngine.fromJSON(JSON.parse(JSON.stringify(json)), { actionSelection: SHADOW_ENABLED });
    const e3 = AndyEngine.fromJSON(JSON.parse(JSON.stringify(json)), { actionSelection: SHADOW_ENABLED });

    for (let i = 0; i < 5; i++) {
      e2.tick();
      e3.tick();
    }

    const restoredTracesA = e2.getAgent('char_1')._actionTraceHistory;
    const restoredTracesB = e3.getAgent('char_1')._actionTraceHistory;
    expect(restoredTracesA.length).toBe(10);
    expect(restoredTracesB.length).toBe(10);

    // 前 5 条 trace 与保存时一致
    expect(JSON.stringify(restoredTracesA.slice(0, 5))).toBe(JSON.stringify(savedTraces));
    expect(JSON.stringify(restoredTracesB.slice(0, 5))).toBe(JSON.stringify(savedTraces));

    // 同一 snapshot 的两条恢复路径继续演化一致
    expect(JSON.stringify(restoredTracesA)).toBe(JSON.stringify(restoredTracesB));
  });

  // ─── 7. Shadow RNG isolation ───
  // shadow 使用 cloned RNG，不推进主 simulation RNG
  // 测试：enabled 和 disabled legacy state 一致（RNG 序列不被 shadow 消耗）
  it('shadow RNG isolation: shadow uses cloned RNG, main RNG unaffected', () => {
    const eOff = createEngine('rng-iso', SHADOW_DISABLED);
    const eOn = createEngine('rng-iso', SHADOW_ENABLED);

    for (let i = 0; i < 20; i++) {
      eOff.tick();
      eOn.tick();
    }

    // 关键：同 seed 下 legacy state 必须完全一致
    // 这证明 shadow 的 RNG draw 没有推进主 RNG
    compareStates(
      snapshotAgentState(eOff.getAgent('char_1')),
      snapshotAgentState(eOn.getAgent('char_1'))
    );

    // 额外验证：RNG state 本身一致
    const rngOff = eOff.rng;
    const rngOn = eOn.rng;
    if (rngOff && typeof rngOff.getState === 'function') {
      expect(rngOff.getState()).toBe(rngOn.getState());
    }
  });

  // ─── 8. Shadow mode does not emit action_selected event ───
  it('shadow mode does not emit action_selected event in EventDispatcher', () => {
    const engine = createEngine('no-event', SHADOW_ENABLED);
    for (let i = 0; i < 10; i++) engine.tick();

    const eventLog = engine.world.eventDispatcher.eventLog;
    const actionEvents = eventLog.filter(e => e.type === 'action_selected');
    expect(actionEvents.length).toBe(0);

    // 验证 eventLog 中没有 action-related 事件
    const allTypes = eventLog.map(e => e.type);
    expect(allTypes).not.toContain('action_selected');
    expect(allTypes).not.toContain('action_effect');
  });
});
