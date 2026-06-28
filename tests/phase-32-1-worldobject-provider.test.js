/**
 * Phase 32.1: WorldObjectCandidateProvider Tests
 */

import { describe, it, expect } from 'vitest';
import { WorldObjectCandidateProvider } from '../agent/action/providers/WorldObjectCandidateProvider.js';

describe('Phase 32.1: WorldObjectCandidateProvider', () => {
  const provider = new WorldObjectCandidateProvider();

  it('generates candidates for visible objects with affordances', () => {
    const context = {
      visibleObjects: [
        {
          id: 'bread_1',
          type: 'food',
          name: '面包',
          location: '食堂',
          affordances: [{ need: 'hunger', satisfyRate: 0.3 }],
        },
      ],
      needs: { hunger: 0.3 },
    };
    const candidates = provider.generate(context);
    expect(candidates).toHaveLength(1);
    expect(candidates[0].type).toBe('consume');
    expect(candidates[0].targetObjectId).toBe('bread_1');
    expect(candidates[0].expectedEffects.needDelta.hunger).toBe(0.3);
  });

  it('does not generate candidates when no visible objects', () => {
    const context = { visibleObjects: [], needs: { hunger: 0.3 } };
    expect(provider.generate(context)).toHaveLength(0);
  });

  it('does not generate candidates when need is satisfied', () => {
    const context = {
      visibleObjects: [
        {
          id: 'bread_1',
          type: 'food',
          name: '面包',
          location: '食堂',
          affordances: [{ need: 'hunger', satisfyRate: 0.3 }],
        },
      ],
      needs: { hunger: 0.9 }, // need satisfied
    };
    expect(provider.generate(context)).toHaveLength(0);
  });

  it('generates multiple candidates for multiple affordances', () => {
    const context = {
      visibleObjects: [
        {
          id: 'guitar_1',
          type: 'tool',
          name: '吉他',
          location: '广场',
          affordances: [
            { need: 'stimulation', satisfyRate: 0.15 },
            { need: 'social', satisfyRate: 0.1 },
          ],
        },
      ],
      needs: { stimulation: 0.3, social: 0.4 },
    };
    const candidates = provider.generate(context);
    expect(candidates).toHaveLength(2);
  });

  it('generates candidates for multiple objects', () => {
    const context = {
      visibleObjects: [
        { id: 'bread_1', type: 'food', name: '面包', location: '食堂', affordances: [{ need: 'hunger', satisfyRate: 0.3 }] },
        { id: 'bed_1', type: 'furniture', name: '床', location: '小屋', affordances: [{ need: 'energy', satisfyRate: 0.2 }] },
      ],
      needs: { hunger: 0.3, energy: 0.3 },
    };
    const candidates = provider.generate(context);
    expect(candidates).toHaveLength(2);
  });

  it('skips objects without affordances', () => {
    const context = {
      visibleObjects: [
        { id: 'rock_1', type: 'decoration', name: '石头', location: '广场', affordances: [] },
      ],
      needs: {},
    };
    expect(provider.generate(context)).toHaveLength(0);
  });
});
