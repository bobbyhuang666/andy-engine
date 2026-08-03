import { describe, it, expect } from 'vitest';
const AndyEngine = require('../../index.js');

const TEST_START = new Date('2026-09-01T08:00:00Z');
const DEFAULT_RECOVERY = {
  energy: 0.15,
  comfort: 0.2,
  hunger: 0.5,
  stimulation: 0.25,
};

function candidate(type) {
  return {
    id: `duration-${type}`,
    type,
    source: 'test',
    target: type === 'consume' ? 'hunger' : '',
    label: type,
    constraints: {},
    metadata: {},
  };
}

function createForcedEngine({ mode, seed, tickMinutes = 5, type = 'rest', needs }) {
  const engine = new AndyEngine({
    seed,
    startTime: new Date(TEST_START),
    tickMinutes,
    ...(needs ? { needs } : {}),
    actionSelection: {
      enabled: true,
      mode,
      temperature: 0,
      recordTraces: true,
      maxTraceHistory: 20,
    },
  });
  engine.createCharacter({
    id: 'alice',
    name: 'Alice',
    mbti: 'INFP',
    schedule: { entries: [] },
  });
  const agent = engine.getAgent('alice');
  agent.runtime.handlers.schedule.tick = () => {};
  agent._candidateProviderManager = {
    generateAll() {
      return [candidate(type)];
    },
  };
  return { engine, agent };
}

function actionTrace(mode, options = {}) {
  const runtime = createForcedEngine({ mode, ...options });
  runtime.engine.tick();
  return { ...runtime, trace: runtime.agent._actionTraceHistory.at(-1) };
}

describe('action selection duration scaling', () => {
  it.each(['dryRunEffects', 'active'])('5-minute %s rest uses per-hour recovery and emotion rates', (mode) => {
    const { trace } = actionTrace(mode, { seed: `duration-5-${mode}` });
    const hours = 5 / 60;

    expect(trace.selectedAction).toBe('rest');
    expect(trace.stateDeltas.need.energy).toBeCloseTo(DEFAULT_RECOVERY.energy * hours, 10);
    expect(trace.stateDeltas.need.comfort).toBeCloseTo(DEFAULT_RECOVERY.comfort * hours, 10);
    expect(trace.stateDeltas.emotion.calm).toBeCloseTo(0.1 * hours, 10);
    expect(trace.stateDeltas.emotion.joy).toBeCloseTo(0.05 * hours, 10);
  });

  it.each(['dryRunEffects', 'active'])('60-minute %s rest uses a complete per-hour recovery rate', (mode) => {
    const { trace } = actionTrace(mode, {
      seed: `duration-60-${mode}`,
      tickMinutes: 60,
    });

    expect(trace.stateDeltas.need.energy).toBeCloseTo(DEFAULT_RECOVERY.energy, 10);
    expect(trace.stateDeltas.need.comfort).toBeCloseTo(DEFAULT_RECOVERY.comfort, 10);
    expect(trace.stateDeltas.emotion.calm).toBeCloseTo(0.1, 10);
    expect(trace.stateDeltas.emotion.joy).toBeCloseTo(0.05, 10);
  });

  it('custom needs recovery rates affect runtime action effects', () => {
    const { trace } = actionTrace('active', {
      seed: 'duration-custom-rate',
      needs: { recoveryRate: { energy: 0.6, comfort: 0.4 } },
    });
    const hours = 5 / 60;

    expect(trace.stateDeltas.need.energy).toBeCloseTo(0.6 * hours, 10);
    expect(trace.stateDeltas.need.comfort).toBeCloseTo(0.4 * hours, 10);
  });

  it.each([
    ['consume', 'hunger', 'satisfaction', DEFAULT_RECOVERY.hunger, 0.05],
    ['work', 'stimulation', 'satisfaction', DEFAULT_RECOVERY.stimulation, 0.02],
    ['reflect', null, 'calm', null, 0.03],
  ])('5-minute runtime %s scales action effects', (type, need, emotion, rate, emotionRate) => {
    const { trace } = actionTrace('dryRunEffects', {
      seed: `duration-${type}`,
      type,
    });
    const hours = 5 / 60;

    if (need) expect(trace.stateDeltas.need[need]).toBeCloseTo(rate * hours, 10);
    expect(trace.stateDeltas.emotion[emotion]).toBeCloseTo(emotionRate * hours, 10);
  });

  it('12 forced five-minute rests stay bounded near one hour of recovery', () => {
    const active = createForcedEngine({ mode: 'active', seed: 'duration-12-active' });
    const dryRun = createForcedEngine({ mode: 'dryRunEffects', seed: 'duration-12-dry' });

    for (let i = 0; i < 12; i++) {
      active.engine.tick();
      dryRun.engine.tick();
    }

    const actionRecovery = runtime => runtime.agent._actionTraceHistory
      .reduce((sum, trace) => sum + trace.stateDeltas.need.energy, 0);
    expect(actionRecovery(active)).toBeCloseTo(DEFAULT_RECOVERY.energy, 10);
    expect(actionRecovery(dryRun)).toBeCloseTo(DEFAULT_RECOVERY.energy, 10);
    expect(actionRecovery(active)).toBeLessThan(0.2);
  });

  it('same seed keeps active duration-scaled replay deterministic', () => {
    const first = createForcedEngine({ mode: 'active', seed: 'duration-replay' });
    const second = createForcedEngine({ mode: 'active', seed: 'duration-replay' });
    for (let i = 0; i < 5; i++) {
      first.engine.tick();
      second.engine.tick();
    }

    expect(JSON.stringify(first.agent._actionTraceHistory))
      .toBe(JSON.stringify(second.agent._actionTraceHistory));
    expect(first.agent.needs.needs).toEqual(second.agent.needs.needs);
  });
});
