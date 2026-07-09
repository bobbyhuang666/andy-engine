/**
 * Phase 32.1: WorldObject affordance query tests
 *
 * The retired WorldObjectCandidateProvider is no longer part of the canonical
 * src/action provider matrix. Canonical object interaction now exposes object
 * affordances as pure data for higher layers to turn into candidates/events.
 */

import { describe, it, expect } from 'vitest';
import { createWorldObject, WorldObjectManager } from '../experimental/action/WorldObject.js';

function makeObject(id, region, affordances) {
  return createWorldObject({
    id,
    type: 'resource',
    name: id,
    location: { region },
    affordances,
  });
}

describe('Phase 32.1: WorldObject affordance queries', () => {
  it('finds visible objects with affordances for a deficient need', () => {
    const manager = new WorldObjectManager([
      makeObject('bread_1', 'canteen', [{ actionType: 'consume', need: 'hunger', satisfyRate: 0.3 }]),
    ]);

    const results = manager.getAffordancesForNeed({ agent: { position: 'canteen' } }, 'hunger');
    expect(results).toHaveLength(1);
    expect(results[0].object.id).toBe('bread_1');
    expect(results[0].affordances[0].satisfyRate).toBe(0.3);
  });

  it('returns no affordances when no visible objects match', () => {
    const manager = new WorldObjectManager([
      makeObject('bread_1', 'canteen', [{ actionType: 'consume', need: 'hunger', satisfyRate: 0.3 }]),
    ]);

    expect(manager.getAffordancesForNeed({ agent: { position: 'library' } }, 'hunger')).toHaveLength(0);
  });

  it('returns multiple matching object affordance groups', () => {
    const manager = new WorldObjectManager([
      makeObject('bread_1', 'canteen', [{ actionType: 'consume', need: 'hunger', satisfyRate: 0.3 }]),
      makeObject('soup_1', 'canteen', [{ actionType: 'consume', need: 'hunger', satisfyRate: 0.2 }]),
    ]);

    const results = manager.getAffordancesForNeed({ agent: { position: 'canteen' } }, 'hunger');
    expect(results).toHaveLength(2);
  });

  it('skips objects without matching affordances', () => {
    const manager = new WorldObjectManager([
      makeObject('rock_1', 'square', []),
      makeObject('guitar_1', 'square', [{ actionType: 'play', need: 'stimulation', satisfyRate: 0.15 }]),
    ]);

    expect(manager.getAffordancesForNeed({ agent: { position: 'square' } }, 'hunger')).toHaveLength(0);
  });
});
