import { describe, it, expect, vi } from 'vitest';
import {
  applyNeedsToEmotion,
  updateHealth,
  updateSocialEnergy,
} from '../../src/agent/runtime/PhysiologyRuntime.js';

function makeAgent(overrides = {}) {
  return {
    needs: {
      needs: {
        hunger: 0.8,
        energy: 0.8,
        social: 0.8,
        comfort: 0.8,
        stimulation: 0.8,
      },
    },
    emotion: {
      stress: 0,
      applyEffect: vi.fn(),
    },
    behaviorField: { B: [0.1, 0.1, 0, 0] },
    behaviorParams: {
      socialEnergyDrain: 0.5,
      socialEnergyRecharge: 0.3,
    },
    personality: {
      ocean: { neuroticism: 0.5 },
    },
    domain: { placeTypes: { outdoor: ['park'] } },
    position: 'home',
    health: 0.8,
    socialEnergy: 0.7,
    ...overrides,
  };
}

describe('PhysiologyRuntime NaN guards', () => {
  // @characterization — direct state injection; not Beta evidence
  it('applyNeedsToEmotion ignores NaN need values instead of emitting NaN emotion deltas', () => {
    const agent = makeAgent({
      needs: {
        needs: {
          hunger: NaN,
          energy: NaN,
          social: NaN,
          comfort: NaN,
          stimulation: NaN,
        },
      },
    });

    applyNeedsToEmotion(agent);

    expect(agent.emotion.applyEffect).not.toHaveBeenCalled();
  });

  it('applyNeedsToEmotion still emits finite deltas for valid deficits', () => {
    const agent = makeAgent({
      needs: {
        needs: {
          hunger: 0.1,
          energy: 0.8,
          social: 0.8,
          comfort: 0.8,
          stimulation: 0.8,
        },
      },
    });

    applyNeedsToEmotion(agent);

    expect(agent.emotion.applyEffect).toHaveBeenCalledTimes(1);
    const delta = agent.emotion.applyEffect.mock.calls[0][0];
    expect(Object.values(delta).every(Number.isFinite)).toBe(true);
  });

  it('applyNeedsToEmotion uses EffectCommitter when available', () => {
    const agent = makeAgent({
      id: 'agent-a',
      needs: {
        needs: {
          hunger: 0.1,
          energy: 0.8,
          social: 0.8,
          comfort: 0.8,
          stimulation: 0.8,
        },
      },
    });
    const commit = vi.fn();

    applyNeedsToEmotion(agent, { effectCommitter: { commit } });

    expect(agent.emotion.applyEffect).not.toHaveBeenCalled();
    expect(commit).toHaveBeenCalledTimes(1);
    const effectResult = commit.mock.calls[0][0];
    expect(effectResult.deltas).toHaveLength(1);
    expect(effectResult.deltas[0].type).toBe('emotion');
    expect(effectResult.deltas[0].agentId).toBe('agent-a');
    expect(Object.values(effectResult.deltas[0].changes).every(Number.isFinite)).toBe(true);
  });

  it('updateHealth keeps health finite with NaN inputs', () => {
    const agent = makeAgent({
      needs: { needs: { hunger: NaN, energy: NaN } },
      emotion: { stress: NaN, applyEffect: vi.fn() },
      behaviorField: { B: [NaN, NaN, 0, 0] },
      personality: { ocean: { neuroticism: NaN } },
      health: 0.5,
    });

    updateHealth(agent, NaN, { weather: 'cold' });

    expect(Number.isFinite(agent.health)).toBe(true);
    expect(agent.health).toBeGreaterThanOrEqual(0.1);
    expect(agent.health).toBeLessThanOrEqual(1);
  });

  it('updateHealth uses EffectCommitter for sickness emotion effects when available', () => {
    const agent = makeAgent({
      id: 'agent-a',
      needs: { needs: { hunger: 0.8, energy: 0.8 } },
      behaviorField: { B: [0.5, 0.1, 0, 0] },
      health: 0.2,
    });
    const commit = vi.fn();

    updateHealth(agent, 1, { weather: 'sunny', effectCommitter: { commit } });

    expect(agent.emotion.applyEffect).not.toHaveBeenCalled();
    expect(commit).toHaveBeenCalledTimes(1);
    expect(commit.mock.calls[0][0].deltas[0].type).toBe('emotion');
  });

  it('updateSocialEnergy keeps socialEnergy finite with NaN behavior params and elapsed time', () => {
    const agent = makeAgent({
      socialEnergy: 0.6,
      behaviorField: { B: [0, 0.9, 0, 0] },
      behaviorParams: {
        socialEnergyDrain: NaN,
        socialEnergyRecharge: NaN,
      },
    });

    updateSocialEnergy(agent, NaN);

    expect(Number.isFinite(agent.socialEnergy)).toBe(true);
    expect(agent.socialEnergy).toBeGreaterThanOrEqual(0);
    expect(agent.socialEnergy).toBeLessThanOrEqual(1);
  });

  it('updateSocialEnergy tolerates missing behaviorParams', () => {
    const agent = makeAgent({
      socialEnergy: 0.6,
      behaviorField: { B: [0, 0.9, 0, 0] },
      behaviorParams: undefined,
    });

    updateSocialEnergy(agent, 1);

    expect(Number.isFinite(agent.socialEnergy)).toBe(true);
    expect(agent.socialEnergy).toBeGreaterThanOrEqual(0);
    expect(agent.socialEnergy).toBeLessThanOrEqual(1);
  });
});
