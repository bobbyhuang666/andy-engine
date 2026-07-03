/**
 * P1-1 / P1-2 Regression: per-engine config injection & restore fidelity.
 *
 * P1-1: AndyEngine must pass `this.config.needs` down to every Agent it
 *       creates (createCharacter / addAgent / restore loop). Previously the
 *       engine merged needs config into `this.config` but never forwarded it
 *       to the Agent, so every agent silently used ANDY_DEFAULTS.needs.
 *       The native NeedsSystem wrapper also read a module-level `cfg` and
 *       ignored the needsConfig arg, so multiple engines shared one config.
 *
 * P1-2: AndyEngine must let `_restoreConfig` (attached by
 *       Serialization.deserialize) supply enableFacts / needs when the caller
 *       passes an explicit config object without those keys. Previously
 *       `config.enableFacts ?? false` overrode a `_restoreConfig.enableFacts`
 *       = true, dropping the factStore on restore.
 */

import { describe, it, expect } from 'vitest';
import AndyEngine from '../../index.js';
import { Serialization } from '../../src/store/Serialization.js';

describe('P1-1: per-engine needs config injection', () => {
  it('forwards engine.config.needs to agents created via createCharacter', () => {
    const e1 = new AndyEngine({ needs: { decayRate: { hunger: 0.123 } } });
    const e2 = new AndyEngine({});
    const e3 = new AndyEngine({ needs: { decayRate: { hunger: 0.222 } } });

    const a1 = e1.createCharacter({ id: 'a1', name: 'A1', mbti: 'INFP' });
    const a2 = e2.createCharacter({ id: 'a2', name: 'A2', mbti: 'INFP' });
    const a3 = e3.createCharacter({ id: 'a3', name: 'A3', mbti: 'INFP' });

    expect(a1.needs._cfg.decayRate.hunger).toBe(0.123);
    expect(a2.needs._cfg.decayRate.hunger).toBe(0.08); // default
    expect(a3.needs._cfg.decayRate.hunger).toBe(0.222);
  });

  it('a later-created agent on e1 still uses e1 config (no pollution from e2/e3)', () => {
    const e1 = new AndyEngine({ needs: { decayRate: { hunger: 0.123 } } });
    const e2 = new AndyEngine({ needs: { decayRate: { hunger: 0.222 } } });
    // create on e2 first, then add a new agent to e1
    e2.createCharacter({ id: 'x', name: 'X', mbti: 'INFP' });
    const a1b = e1.createCharacter({ id: 'a1b', name: 'A1B', mbti: 'INFP' });

    expect(a1b.needs._cfg.decayRate.hunger).toBe(0.123);
  });

  it('addAgent also forwards engine.config.needs', () => {
    const e = new AndyEngine({ needs: { threshold: { hunger: 0.444 } } });
    const a = e.addAgent({
      id: 'b1', name: 'B1', personality: { mbti: 'ENFJ' },
      initialState: '闲逛', initialPosition: '图书馆',
    });
    expect(a.needs._cfg.threshold.hunger).toBe(0.444);
  });

  it('explicit addAgent needs overrides engine needs', () => {
    const e = new AndyEngine({ needs: { decayRate: { hunger: 0.123 } } });
    const a = e.addAgent({
      id: 'b2', name: 'B2', personality: { mbti: 'ENFJ' },
      initialState: '闲逛', initialPosition: '图书馆',
      needs: { decayRate: { hunger: 0.999 } },
    });
    expect(a.needs._cfg.decayRate.hunger).toBe(0.999);
  });

  it('forwarded needs config actually affects behavior (threshold drives getDrive)', () => {
    // Very high threshold => even a moderately satisfied need triggers a drive.
    const e = new AndyEngine({ needs: { threshold: { hunger: 0.95 } } });
    const a = e.createCharacter({ id: 'd1', name: 'D1', mbti: 'INFP' });
    // default hunger = 0.8 < 0.95 threshold => drive expected
    const drive = a.needs.getDrive();
    expect(drive).not.toBeNull();
    expect(drive.need).toBe('hunger');

    const e2 = new AndyEngine({ needs: { threshold: { hunger: 0.1 } } });
    const a2 = e2.createCharacter({ id: 'd2', name: 'D2', mbti: 'INFP' });
    // hunger 0.8 > 0.1 threshold => no hunger drive
    const drive2 = a2.needs.getDrive();
    expect(drive2 === null || drive2.need !== 'hunger').toBe(true);
  });
});

describe('P1-2: _restoreConfig flows through AndyEngine restore', () => {
  it('Serialization.deserialize attaches _restoreConfig without mutating envelope', () => {
    const e = new AndyEngine({ enableFacts: true, needs: { decayRate: { hunger: 0.123 } } });
    e.createCharacter({ id: 'a1', name: 'A1', mbti: 'INFP' });
    const env = Serialization.serialize(e.world);
    const envCopy = JSON.parse(JSON.stringify(env));

    const cfg = { enableFacts: true, needs: { decayRate: { hunger: 0.123 } } };
    const snapshot = Serialization.deserialize(env, cfg);

    // envelope not mutated
    expect(env).toEqual(envCopy);
    // _restoreConfig attached
    expect(snapshot._restoreConfig).toEqual(cfg);
  });

  it('Serialization.deserialize preserves snapshot _restoreConfig when caller passes partial config', () => {
    const e = new AndyEngine({
      seed: 'restore-config-partial',
      enableFacts: true,
      needs: { decayRate: { hunger: 0.123 } },
      actionSelection: { enabled: true, mode: 'active', temperature: 0.777 },
    });
    e.createCharacter({ id: 'partial', name: 'Partial', mbti: 'INFP' });
    const env = Serialization.serialize(e.world);

    const snapshot = Serialization.deserialize(env, { seed: 'caller-seed-only' });
    const restored = new AndyEngine({}, snapshot);

    expect(snapshot._restoreConfig.enableFacts).toBe(true);
    expect(snapshot._restoreConfig.needs.decayRate.hunger).toBe(0.123);
    expect(snapshot._restoreConfig.actionSelection.mode).toBe('active');
    expect(snapshot._restoreConfig.seed).toBe('caller-seed-only');
    expect(restored.config.enableFacts).toBe(true);
    expect(restored.world.factStore).not.toBeFalsy();
    expect(restored.config.needs.decayRate.hunger).toBe(0.123);
    expect(restored.config.actionSelection.mode).toBe('active');
  });

  it('new AndyEngine({}, snapshot) restores enableFacts + factStore from _restoreConfig', () => {
    const e = new AndyEngine({ enableFacts: true, needs: { decayRate: { hunger: 0.123 } } });
    e.createCharacter({ id: 'a1', name: 'A1', mbti: 'INFP' });
    const env = Serialization.serialize(e.world);
    const snapshot = Serialization.deserialize(env, { enableFacts: true, needs: { decayRate: { hunger: 0.123 } } });

    // Caller passes an explicit config object WITHOUT enableFacts/needs.
    // _restoreConfig must supply them.
    const restored = new AndyEngine({}, snapshot);
    expect(restored.config.enableFacts).toBe(true);
    expect(restored.world.factStore).not.toBeFalsy();
    expect(restored.config.needs.decayRate.hunger).toBe(0.123);
  });

  it('pure serialize/deserialize round-trip restores runtime config without caller config', () => {
    const e = new AndyEngine({
      seed: 'restore-config-roundtrip',
      startTime: new Date('2026-01-01T08:00:00Z'),
      tickMinutes: 7,
      enableFacts: true,
      needs: { decayRate: { hunger: 0.123 }, threshold: { hunger: 0.95 } },
      weatherConfig: {
        transitionProb: 0.99,
        seasonProbabilities: {
          winter: { sunny: 0.99, rain: 0, cold: 0, hot: 0.01 },
        },
      },
      actionSelection: { enabled: true, mode: 'active', temperature: 0.777 },
    });
    e.createCharacter({ id: 'cfg', name: 'Cfg', mbti: 'INFP' });
    e.tick();

    const env = Serialization.serialize(e.world);
    const snapshot = Serialization.deserialize(env);
    const restored = new AndyEngine({}, snapshot);

    expect(restored.config.enableFacts).toBe(true);
    expect(restored.config.tickMinutes).toBe(7);
    expect(restored.config.needs.decayRate.hunger).toBe(0.123);
    expect(restored.config.needs.threshold.hunger).toBe(0.95);
    expect(restored.config.weatherConfig.transitionProb).toBe(0.99);
    expect(restored.config.weatherConfig.seasonProbabilities.winter.sunny).toBe(0.99);
    expect(restored.config.actionSelection.enabled).toBe(true);
    expect(restored.config.actionSelection.mode).toBe('active');
    expect(restored.config.actionSelection.temperature).toBe(0.777);

    expect(restored.world.runtimeConfig.enableFacts).toBe(true);
    expect(restored.world.runtimeConfig.tickMinutes).toBe(7);
    expect(restored.world.runtimeConfig.weatherConfig.transitionProb).toBe(0.99);
    expect(restored.world.runtimeConfig.actionSelection.temperature).toBe(0.777);
    expect(restored.getAgent('cfg').needs._cfg.decayRate.hunger).toBe(0.123);
  });

  it('caller restore config flows into world.runtimeConfig, not only engine.config', () => {
    const e = new AndyEngine({
      seed: 'restore-config-forward',
      startTime: new Date('2026-01-01T08:00:00Z'),
      weatherConfig: { transitionProb: 0.2 },
    });
    e.createCharacter({ id: 'w', name: 'W', mbti: 'INFP' });
    const env = Serialization.serialize(e.world);
    const snapshot = Serialization.deserialize(env, {
      weatherConfig: {
        transitionProb: 0.99,
        seasonProbabilities: {
          winter: { sunny: 0.99, rain: 0, cold: 0, hot: 0.01 },
        },
      },
      actionSelection: { enabled: true, mode: 'event', temperature: 0.66 },
    });

    const restored = new AndyEngine({}, snapshot);

    expect(restored.config.weatherConfig.transitionProb).toBe(0.99);
    expect(restored.config.actionSelection.temperature).toBe(0.66);
    expect(restored.world.runtimeConfig.weatherConfig.transitionProb).toBe(0.99);
    expect(restored.world.runtimeConfig.actionSelection.temperature).toBe(0.66);
  });

  it('new agent added after restore uses restored needs config', () => {
    const e = new AndyEngine({ enableFacts: true, needs: { decayRate: { hunger: 0.123 } } });
    e.createCharacter({ id: 'a1', name: 'A1', mbti: 'INFP' });
    const env = Serialization.serialize(e.world);
    const snapshot = Serialization.deserialize(env, { enableFacts: true, needs: { decayRate: { hunger: 0.123 } } });

    const restored = new AndyEngine({}, snapshot);
    const a2 = restored.createCharacter({ id: 'a2', name: 'A2', mbti: 'INFP' });
    expect(a2.needs._cfg.decayRate.hunger).toBe(0.123);
  });

  it('explicit config overrides _restoreConfig (priority: explicit > restore > default)', () => {
    const e = new AndyEngine({ enableFacts: true, needs: { decayRate: { hunger: 0.123 } } });
    e.createCharacter({ id: 'a1', name: 'A1', mbti: 'INFP' });
    const env = Serialization.serialize(e.world);
    const snapshot = Serialization.deserialize(env, { enableFacts: true, needs: { decayRate: { hunger: 0.123 } } });

    const restored = new AndyEngine({ enableFacts: false, needs: { decayRate: { hunger: 0.555 } } }, snapshot);
    expect(restored.config.enableFacts).toBe(false);
    expect(restored.config.needs.decayRate.hunger).toBe(0.555);
  });

  it('does not mutate the input savedState', () => {
    const e = new AndyEngine({ enableFacts: true, needs: { decayRate: { hunger: 0.123 } } });
    e.createCharacter({ id: 'a1', name: 'A1', mbti: 'INFP' });
    const env = Serialization.serialize(e.world);
    const snapshot = Serialization.deserialize(env, { enableFacts: true, needs: { decayRate: { hunger: 0.123 } } });
    const snapshotCopy = JSON.parse(JSON.stringify(snapshot));

    // eslint-disable-next-line no-new
    new AndyEngine({}, snapshot);
    expect(snapshot).toEqual(snapshotCopy);
  });
});
