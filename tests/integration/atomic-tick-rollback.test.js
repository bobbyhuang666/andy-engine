import { describe, expect, it } from 'vitest';
import AndyEngine from '../../index.js';

function buildEngine() {
  const engine = new AndyEngine({
    seed: 'atomic-tick-rollback',
    atomicTicks: true,
    enableFacts: true,
    startTime: new Date('2026-01-01T00:00:00.000Z'),
  });
  engine.createCharacter({ id: 'maya', name: 'Maya', mbti: 'INFP' });
  engine.createCharacter({ id: 'leo', name: 'Leo', mbti: 'ENFP' });
  engine.tick();
  return engine;
}

describe('AndyEngine failed-tick recovery', () => {
  it('restores the full pre-tick world and does not invoke callbacks', () => {
    const engine = buildEngine();
    const before = JSON.parse(JSON.stringify(engine.toJSON()));
    let callbackCount = 0;
    engine.onTick(() => { callbackCount++; });

    const agent = engine.getAgent('maya');
    agent.behaviorField.tick = () => {
      throw new Error('injected behavior failure');
    };

    const result = engine.tick();

    expect(result.status).toBe('aborted');
    expect(result.time).toBe(before.time);
    expect(result.tickNumber).toBe(before.tickCount);
    expect(result.committedAt).toBeUndefined();
    expect(result.phase.rollback).toEqual({
      restoredTo: before.time,
      tickCount: before.tickCount,
    });
    expect(result.phase.effectSummary).toBeUndefined();
    expect(callbackCount).toBe(0);
    expect(engine.toJSON()).toEqual(before);

    // The restored world retains registered callbacks and can continue with a
    // clean, ordinary tick after the faulty live handle is discarded.
    const next = engine.tick();
    expect(next.status).toBe('committed');
    expect(callbackCount).toBe(1);
  });

  it('faults the default engine so it cannot evolve from a degraded tick', () => {
    const engine = new AndyEngine({ seed: 'fail-stop-default' });
    engine.createCharacter({ id: 'maya', name: 'Maya', mbti: 'INFP' });
    let callbackCount = 0;
    engine.onTick(() => { callbackCount++; });
    engine.getAgent('maya').behaviorField.tick = () => {
      throw new Error('injected default failure');
    };

    const result = engine.tick();

    expect(result.status).toBe('degraded');
    expect(callbackCount).toBe(0);
    expect(() => engine.tick()).toThrow(/faulted after a degraded tick/);
  });
});
