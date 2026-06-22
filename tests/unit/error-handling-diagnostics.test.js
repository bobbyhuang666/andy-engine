/**
 * Error Handling Diagnostics tests
 *
 * Verifies that previously silent catch blocks now emit diagnostics
 * and that the Diagnostics utility works correctly.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
const { Diagnostics, diagnostics } = require('../../src/shared/Diagnostics');

describe('Diagnostics utility', () => {
  let diag;

  beforeEach(() => {
    diag = new Diagnostics();
  });

  it('warnOnce only warns once per key', () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    diag.warnOnce('key1', 'first warning');
    diag.warnOnce('key1', 'second warning');
    diag.warnOnce('key2', 'different key');

    expect(spy).toHaveBeenCalledTimes(2);
    expect(spy).toHaveBeenCalledWith('[andy-engine] first warning');
    expect(spy).toHaveBeenCalledWith('[andy-engine] different key');

    spy.mockRestore();
  });

  it('warn emits every time', () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    diag.warn('warning 1');
    diag.warn('warning 2');

    expect(spy).toHaveBeenCalledTimes(2);
    spy.mockRestore();
  });

  it('collect stores entries with timestamp', () => {
    diag.collect({ type: 'test_error', detail: 'oops' });
    diag.collect({ type: 'another_error', detail: 'uh oh' });

    const entries = diag.getCollected();
    expect(entries).toHaveLength(2);
    expect(entries[0].type).toBe('test_error');
    expect(entries[0].detail).toBe('oops');
    expect(entries[0].timestamp).toBeTypeOf('number');
    expect(entries[1].type).toBe('another_error');
  });

  it('getCollected returns a copy', () => {
    diag.collect({ type: 'x' });
    const a = diag.getCollected();
    const b = diag.getCollected();
    expect(a).not.toBe(b);
    expect(a).toEqual(b);
  });

  it('clear empties collected entries', () => {
    diag.collect({ type: 'x' });
    diag.collect({ type: 'y' });
    expect(diag.getCollected()).toHaveLength(2);

    diag.clear();
    expect(diag.getCollected()).toHaveLength(0);
  });

  it('global singleton is process-level', () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    diagnostics.warnOnce('singleton_test_key', 'singleton warning');
    diagnostics.warnOnce('singleton_test_key', 'should not appear');

    expect(spy).toHaveBeenCalledTimes(1);
    spy.mockRestore();
  });
});

describe('ActionSelectionRuntime error diagnostics', () => {
  it('action selection error is collected and main loop continues', () => {
    const AndyEngine = require('../../index.js');
    const engine = new AndyEngine({ seed: 42, startTime: new Date('2026-09-01T08:00:00Z') });
    engine.createCharacter({ id: 'err_char', name: 'ErrChar', mbti: 'INFP', schedule: 'student' });

    // Force action selection to throw by corrupting candidateProviderManager
    const agent = engine.getAgent('err_char');
    engine.world.runtimeConfig.actionSelection = { enabled: true, mode: 'event', temperature: 1.0 };
    agent._actionSelectionConfig = { enabled: true, mode: 'event', temperature: 1.0 };
    agent._candidateProviderManager = {
      generateAll() { throw new Error('provider boom'); },
    };

    diagnostics.clear();

    // tick should not throw
    expect(() => engine.tick()).not.toThrow();

    // diagnostics should have collected the error
    const entries = diagnostics.getCollected();
    const actionErrors = entries.filter(e => e.type === 'action_selection_error');
    expect(actionErrors.length).toBeGreaterThanOrEqual(1);
    expect(actionErrors[0].agentId).toBe('err_char');
    expect(actionErrors[0].error).toContain('provider boom');
  });
});

describe('AndyWorld onTick callback error diagnostics', () => {
  it('onTick callback error is warned and main loop continues', () => {
    const AndyEngine = require('../../index.js');
    const engine = new AndyEngine({ seed: 42, startTime: new Date('2026-09-01T08:00:00Z') });
    engine.createCharacter({ id: 'cb_char', name: 'CbChar', mbti: 'INFP', schedule: 'student' });

    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    engine.world.onTick(() => { throw new Error('callback boom'); });

    expect(() => engine.tick()).not.toThrow();

    expect(spy).toHaveBeenCalledWith(
      expect.stringContaining('onTick callback error: callback boom')
    );

    spy.mockRestore();
  });
});
