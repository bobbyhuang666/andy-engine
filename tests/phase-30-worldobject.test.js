/**
 * Phase 30: WorldObject canonical runtime tests
 *
 * Verifies the canonical src/action WorldObject model:
 * - Objects are plain JSON records
 * - Helpers are pure and immutable
 * - Affordances and lifecycle transitions are traceable
 * - Manager operations return new manager instances
 */

import { describe, it, expect } from 'vitest';
import {
  createWorldObject,
  getVisibleObjects,
  getAffordancesForNeed,
  claim,
  release,
  useObject,
  WorldObjectManager,
} from '../src/action/WorldObject.js';

function bread(overrides = {}) {
  return createWorldObject({
    id: 'bread_1',
    type: 'resource',
    name: 'bread',
    location: { region: 'canteen' },
    affordances: [{ actionType: 'consume', need: 'hunger', satisfyRate: 0.3, consumeOnUse: true }],
    ...overrides,
  });
}

describe('Phase 30: WorldObject canonical runtime', () => {
  describe('WorldObject data model', () => {
    it('creates object with defaults', () => {
      const obj = bread();
      expect(obj.id).toBe('bread_1');
      expect(obj.type).toBe('resource');
      expect(obj.lifecycle.status).toBe('active');
      expect(obj.location.region).toBe('canteen');
    });

    it('rejects invalid lifecycle status', () => {
      expect(() => bread({ lifecycle: { status: 'lost' } })).toThrow('Invalid lifecycle status');
    });

    it('deep-clones input affordances', () => {
      const affordances = [{ actionType: 'consume', need: 'hunger', satisfyRate: 0.3 }];
      const obj = bread({ affordances });
      affordances[0].need = 'energy';
      expect(obj.affordances[0].need).toBe('hunger');
    });
  });

  describe('Visibility and affordances', () => {
    it('region-scoped object is visible only in same region', () => {
      const obj = bread();
      const visible = getVisibleObjects([obj], { agent: { position: 'canteen' } });
      const hidden = getVisibleObjects([obj], { agent: { position: 'library' } });

      expect(visible).toHaveLength(1);
      expect(hidden).toHaveLength(0);
    });

    it('hidden or inactive objects are not visible', () => {
      const hiddenObj = bread({ visibility: { scope: 'hidden' } });
      const consumedObj = bread({ id: 'old_bread', lifecycle: { status: 'consumed' } });

      expect(getVisibleObjects([hiddenObj, consumedObj], { agent: { position: 'canteen' } })).toHaveLength(0);
    });

    it('gets affordances matching a need', () => {
      const obj = bread();
      expect(getAffordancesForNeed(obj, 'hunger')).toHaveLength(1);
      expect(getAffordancesForNeed(obj, 'social')).toHaveLength(0);
    });
  });

  describe('Ownership and use', () => {
    it('claim and release return updated copies', () => {
      const obj = bread({ ownership: { ownerId: null, exclusive: true, occupants: [], currentUsers: [] } });
      const claimed = claim(obj, 'agent_a');
      expect(claimed.success).toBe(true);
      expect(claimed.object.ownership.ownerId).toBe('agent_a');
      expect(obj.ownership.ownerId).toBeNull();

      const released = release(claimed.object, 'agent_a');
      expect(released.ownership.ownerId).toBeNull();
    });

    it('exclusive owner blocks other agents from use', () => {
      const obj = bread({ ownership: { ownerId: 'agent_a', exclusive: true, occupants: [], currentUsers: [] } });
      const result = useObject(obj, { agentId: 'agent_b', actionType: 'consume', need: 'hunger' });
      expect(result.effects).toHaveLength(0);
      expect(result.object).toBe(obj);
    });

    it('useObject returns effects and consumed lifecycle without mutating input', () => {
      const obj = bread();
      const result = useObject(obj, { agentId: 'agent_a', actionType: 'consume', need: 'hunger' });

      expect(result.effects).toEqual([{ type: 'need', need: 'hunger', delta: 0.3 }]);
      expect(result.consumed).toBe(true);
      expect(result.object.lifecycle.status).toBe('consumed');
      expect(obj.lifecycle.status).toBe('active');
    });

    it('durability decreases and can break object', () => {
      const obj = bread({
        affordances: [{ actionType: 'use', need: 'stimulation', satisfyRate: 0.1 }],
        lifecycle: { status: 'active', durability: 1, maxDurability: 1 },
      });
      const result = useObject(obj, { agentId: 'agent_a', actionType: 'use', need: 'stimulation' });
      expect(result.object.lifecycle.status).toBe('broken');
      expect(result.consumed).toBe(true);
    });
  });

  describe('WorldObjectManager', () => {
    it('adds and retrieves objects immutably', () => {
      const manager = new WorldObjectManager();
      const next = manager.addObject(bread());

      expect(manager.list()).toHaveLength(0);
      expect(next.list()).toHaveLength(1);
      expect(next.getObject('bread_1').name).toBe('bread');
    });

    it('updates object by id immutably', () => {
      const manager = new WorldObjectManager([bread()]);
      const next = manager.updateObject('bread_1', obj => ({
        ...obj,
        lifecycle: { ...obj.lifecycle, status: 'removed' },
      }));

      expect(manager.getObject('bread_1').lifecycle.status).toBe('active');
      expect(next.getObject('bread_1').lifecycle.status).toBe('removed');
    });

    it('serializes and restores', () => {
      const manager = new WorldObjectManager([bread()]);
      const restored = WorldObjectManager.fromJSON(manager.toJSON());

      expect(restored.list()).toHaveLength(1);
      expect(restored.getObject('bread_1').location.region).toBe('canteen');
    });
  });
});
