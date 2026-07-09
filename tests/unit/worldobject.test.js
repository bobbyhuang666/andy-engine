import { describe, it, expect } from 'vitest';
import {
  LIFECYCLE_STATES,
  deepClone,
  createWorldObject,
  getVisibleObjects,
  getAffordancesForNeed,
  claim,
  release,
  useObject,
  toJSON,
  fromJSON,
  WorldObjectManager,
} from '../../experimental/action/WorldObject.js';

describe('WorldObject', () => {
  describe('createWorldObject', () => {
    it('creates object with default domain-agnostic fields', () => {
      const obj = createWorldObject({ id: 'obj_1', type: 'resource', name: 'herb' });
      expect(obj.id).toBe('obj_1');
      expect(obj.type).toBe('resource');
      expect(obj.lifecycle.status).toBe('active');
      expect(obj.affordances).toEqual([]);
      expect(obj.ownership.ownerId).toBeNull();
      expect(obj.visibility.scope).toBe('region');
    });

    it('invalid lifecycle status throws', () => {
      expect(() => createWorldObject({ id: 'x', lifecycle: { status: 'invalid' } })).toThrow();
    });

    it('missing id throws', () => {
      expect(() => createWorldObject({})).toThrow('requires an id');
    });

    it('location supports region and position', () => {
      const obj = createWorldObject({ id: 'o1', location: { region: 'market', position: { x: 10, y: 20 } } });
      expect(obj.location.region).toBe('market');
      expect(obj.location.position).toEqual({ x: 10, y: 20 });
    });
  });

  describe('deep clone boundary', () => {
    it('createWorldObject: modifying input nested objects does not affect created object', () => {
      const pos = { x: 10, y: 20 };
      const affMeta = { key: 'val' };
      const st = { hp: 100 };
      const vis = { scope: 'region' };
      const meta = { tag: 'rare' };

      const obj = createWorldObject({
        id: 'o1',
        location: { region: 'r', position: pos },
        affordances: [{ actionType: 'use', metadata: affMeta }],
        state: st,
        visibility: vis,
        metadata: meta,
      });

      pos.x = 999;
      affMeta.key = 'changed';
      st.hp = 0;
      vis.scope = 'hidden';
      meta.tag = 'common';

      expect(obj.location.position.x).toBe(10);
      expect(obj.affordances[0].metadata.key).toBe('val');
      expect(obj.state.hp).toBe(100);
      expect(obj.visibility.scope).toBe('region');
      expect(obj.metadata.tag).toBe('rare');
    });

    it('toJSON: modifying json nested objects does not affect original', () => {
      const obj = createWorldObject({
        id: 'o1',
        location: { region: 'r', position: { x: 1 } },
        metadata: { k: 'v' },
      });
      const json = toJSON(obj);
      json.location.position.x = 999;
      json.metadata.k = 'changed';

      expect(obj.location.position.x).toBe(1);
      expect(obj.metadata.k).toBe('v');
    });

    it('fromJSON: modifying source data does not affect restored', () => {
      const data = { id: 'o1', location: { region: 'r' }, metadata: { k: 'v' } };
      const restored = fromJSON(data);
      data.location.region = 'changed';
      data.k = 'new';

      expect(restored.location.region).toBe('r');
      expect(restored.metadata.k).toBe('v');
    });
  });

  describe('getVisibleObjects', () => {
    const objects = [
      createWorldObject({ id: 'o1', location: { region: 'market' }, visibility: { scope: 'region' } }),
      createWorldObject({ id: 'o2', location: { region: 'forest' }, visibility: { scope: 'region' } }),
      createWorldObject({ id: 'o3', visibility: { scope: 'world' } }),
      createWorldObject({ id: 'o4', location: { region: 'market' }, visibility: { scope: 'hidden' } }),
      createWorldObject({ id: 'o5', location: { region: 'market' }, lifecycle: { status: 'consumed' } }),
    ];

    it('shows same-region and world-scope objects', () => {
      const visible = getVisibleObjects(objects, { agent: { position: 'market' } });
      const ids = visible.map(o => o.id);
      expect(ids).toContain('o1');
      expect(ids).toContain('o3');
      expect(ids).not.toContain('o2');
    });

    it('hides hidden and non-active objects', () => {
      const visible = getVisibleObjects(objects, { agent: { position: 'market' } });
      expect(visible.some(o => o.id === 'o4')).toBe(false);
      expect(visible.some(o => o.id === 'o5')).toBe(false);
    });

    it('no agent position returns empty', () => {
      expect(getVisibleObjects(objects, {})).toEqual([]);
    });
  });

  describe('getAffordancesForNeed', () => {
    it('returns matching affordances for active object', () => {
      const obj = createWorldObject({
        id: 'o1',
        affordances: [
          { actionType: 'consume', need: 'hunger', satisfyRate: 0.3 },
          { actionType: 'use', need: 'energy', satisfyRate: 0.2 },
        ],
      });
      const result = getAffordancesForNeed(obj, 'hunger');
      expect(result.length).toBe(1);
      expect(result[0].need).toBe('hunger');
    });

    it('returns empty for non-active object', () => {
      const obj = createWorldObject({
        id: 'o1',
        affordances: [{ need: 'hunger', satisfyRate: 0.3 }],
        lifecycle: { status: 'consumed' },
      });
      expect(getAffordancesForNeed(obj, 'hunger')).toEqual([]);
    });
  });

  describe('claim / release', () => {
    it('claim sets ownerId for non-exclusive object', () => {
      const obj = createWorldObject({ id: 'o1', ownership: { exclusive: false } });
      const { success, object } = claim(obj, 'agent_1');
      expect(success).toBe(true);
      expect(object.ownership.ownerId).toBe('agent_1');
    });

    it('claim fails for exclusive object already owned', () => {
      const obj = createWorldObject({ id: 'o1', ownership: { exclusive: true, ownerId: 'agent_2' } });
      const { success } = claim(obj, 'agent_1');
      expect(success).toBe(false);
    });

    it('release clears ownerId', () => {
      const obj = createWorldObject({ id: 'o1', ownership: { ownerId: 'agent_1' } });
      const result = release(obj, 'agent_1');
      expect(result.ownership.ownerId).toBeNull();
    });

    it('release by non-owner is no-op', () => {
      const obj = createWorldObject({ id: 'o1', ownership: { ownerId: 'agent_1' } });
      const result = release(obj, 'agent_2');
      expect(result.ownership.ownerId).toBe('agent_1');
    });
  });

  describe('useObject', () => {
    it('consumeOnUse consumes the object', () => {
      const obj = createWorldObject({
        id: 'o1',
        affordances: [{ actionType: 'consume', need: 'hunger', satisfyRate: 0.3, consumeOnUse: true }],
      });
      const { object, effects, consumed } = useObject(obj, { agentId: 'a1', actionType: 'consume' });
      expect(consumed).toBe(true);
      expect(object.lifecycle.status).toBe('consumed');
      expect(effects.length).toBe(1);
    });

    it('durability decrements and breaks at 0', () => {
      const obj = createWorldObject({
        id: 'o1',
        affordances: [{ actionType: 'use', need: 'stimulation', satisfyRate: 0.1 }],
        lifecycle: { durability: 1, maxDurability: 5 },
      });
      const { object, consumed } = useObject(obj, { agentId: 'a1', actionType: 'use' });
      expect(consumed).toBe(true);
      expect(object.lifecycle.status).toBe('broken');
      expect(object.lifecycle.durability).toBe(0);
    });

    it('non-active object returns empty', () => {
      const obj = createWorldObject({
        id: 'o1',
        affordances: [{ actionType: 'consume', need: 'hunger', satisfyRate: 0.3 }],
        lifecycle: { status: 'consumed' },
      });
      const { effects, consumed } = useObject(obj, { agentId: 'a1', actionType: 'consume' });
      expect(effects).toEqual([]);
      expect(consumed).toBe(false);
    });

    it('no matching affordance returns empty', () => {
      const obj = createWorldObject({
        id: 'o1',
        affordances: [{ actionType: 'consume', need: 'hunger', satisfyRate: 0.3 }],
      });
      const { effects } = useObject(obj, { agentId: 'a1', actionType: 'work' });
      expect(effects).toEqual([]);
    });

    it('exclusive owner mismatch returns empty', () => {
      const obj = createWorldObject({
        id: 'o1',
        affordances: [{ actionType: 'use', need: 'stimulation', satisfyRate: 0.1 }],
        ownership: { exclusive: true, ownerId: 'other' },
      });
      const { effects } = useObject(obj, { agentId: 'a1', actionType: 'use' });
      expect(effects).toEqual([]);
    });

    it('tracks currentUsers', () => {
      const obj = createWorldObject({
        id: 'o1',
        affordances: [{ actionType: 'use', satisfyRate: 0.1 }],
      });
      const { object } = useObject(obj, { agentId: 'a1', actionType: 'use' });
      expect(object.ownership.currentUsers).toContain('a1');
    });
  });

  describe('toJSON / fromJSON roundtrip', () => {
    it('preserves all fields', () => {
      const obj = createWorldObject({
        id: 'o1', type: 'tool', name: 'axe',
        location: { region: 'forest' },
        affordances: [{ actionType: 'use', need: 'stimulation', satisfyRate: 0.2 }],
      });
      const json = toJSON(obj);
      const restored = fromJSON(json);
      expect(restored.id).toBe('o1');
      expect(restored.location.region).toBe('forest');
      expect(restored.affordances[0].actionType).toBe('use');
    });

    it('null input returns null', () => {
      expect(fromJSON(null)).toBeNull();
    });
  });

  describe('no mutation', () => {
    it('claim does not mutate input', () => {
      const obj = createWorldObject({ id: 'o1' });
      const copy = JSON.parse(JSON.stringify(obj));
      claim(obj, 'a1');
      expect(obj).toEqual(copy);
    });

    it('useObject does not mutate input', () => {
      const obj = createWorldObject({
        id: 'o1',
        affordances: [{ actionType: 'consume', need: 'hunger', satisfyRate: 0.3, consumeOnUse: true }],
      });
      const copy = JSON.parse(JSON.stringify(obj));
      useObject(obj, { agentId: 'a1', actionType: 'consume' });
      expect(obj).toEqual(copy);
    });

    it('release does not mutate input', () => {
      const obj = createWorldObject({ id: 'o1', ownership: { ownerId: 'a1' } });
      const copy = JSON.parse(JSON.stringify(obj));
      release(obj, 'a1');
      expect(obj).toEqual(copy);
    });
  });

  describe('constants', () => {
    it('LIFECYCLE_STATES covers all states', () => {
      expect(LIFECYCLE_STATES).toContain('active');
      expect(LIFECYCLE_STATES).toContain('consumed');
      expect(LIFECYCLE_STATES).toContain('broken');
      expect(LIFECYCLE_STATES).toContain('removed');
    });
  });
});

// ═══════════════════════════════════════════
// WorldObjectManager — immutable collection
// ═══════════════════════════════════════════

describe('WorldObjectManager', () => {
  describe('add / remove / list', () => {
    it('constructor normalizes raw objects to full WorldObjects', () => {
      const mgr = new WorldObjectManager([{ id: 'o1' }]);
      const obj = mgr.getObject('o1');

      expect(obj.lifecycle.status).toBe('active');
      expect(obj.visibility.scope).toBe('region');
      expect(obj.ownership.ownerId).toBeNull();
    });

    it('addObject adds and list returns copy', () => {
      const mgr = new WorldObjectManager();
      const mgr2 = mgr.addObject({ id: 'o1', type: 'resource' });
      expect(mgr2.list().length).toBe(1);
      expect(mgr.list().length).toBe(0); // original unchanged
    });

    it('removeObject removes by id', () => {
      const mgr = new WorldObjectManager([{ id: 'o1' }, { id: 'o2' }]);
      const mgr2 = mgr.removeObject('o1');
      expect(mgr2.list().length).toBe(1);
      expect(mgr2.list()[0].id).toBe('o2');
    });

    it('updateObject updates by id via updater function', () => {
      const mgr = new WorldObjectManager([{ id: 'o1', name: 'old' }]);
      const mgr2 = mgr.updateObject('o1', o => ({ ...o, name: 'new' }));
      expect(mgr2.getObject('o1').name).toBe('new');
      expect(mgr.getObject('o1').name).toBe('old'); // original unchanged
    });

    it('getObject returns copy', () => {
      const mgr = new WorldObjectManager([{ id: 'o1', metadata: { k: 'v' } }]);
      const obj = mgr.getObject('o1');
      obj.k = 'changed';
      expect(mgr.getObject('o1').metadata.k).toBe('v');
    });

    it('getObject returns null for missing id', () => {
      const mgr = new WorldObjectManager([]);
      expect(mgr.getObject('missing')).toBeNull();
    });
  });

  describe('getVisibleObjects', () => {
    it('filters by region and lifecycle', () => {
      const mgr = new WorldObjectManager([
        { id: 'o1', location: { region: 'market' }, visibility: { scope: 'region' }, lifecycle: { status: 'active' } },
        { id: 'o2', location: { region: 'forest' }, visibility: { scope: 'region' }, lifecycle: { status: 'active' } },
      ]);
      const visible = mgr.getVisibleObjects({ agent: { position: 'market' } });
      expect(visible.length).toBe(1);
      expect(visible[0].id).toBe('o1');
    });
  });

  describe('getAffordancesForNeed', () => {
    it('returns matching affordances across visible objects', () => {
      const mgr = new WorldObjectManager([
        createWorldObject({
          id: 'o1',
          location: { region: 'market' },
          affordances: [{ need: 'hunger', satisfyRate: 0.3 }],
        }),
        createWorldObject({
          id: 'o2',
          location: { region: 'forest' },
          affordances: [{ need: 'hunger', satisfyRate: 0.5 }],
        }),
      ]);
      const results = mgr.getAffordancesForNeed({ agent: { position: 'market' } }, 'hunger');
      expect(results.length).toBe(1);
      expect(results[0].object.id).toBe('o1');
    });
  });

  describe('claim / release / useObject', () => {
    it('claim replaces internal object', () => {
      const mgr = new WorldObjectManager([createWorldObject({ id: 'o1' })]);
      const { manager: mgr2, success } = mgr.claim('o1', 'agent_1');
      expect(success).toBe(true);
      expect(mgr2.getObject('o1').ownership.ownerId).toBe('agent_1');
      expect(mgr.getObject('o1').ownership.ownerId).toBeNull(); // original unchanged
    });

    it('release replaces internal object', () => {
      const mgr = new WorldObjectManager([{ id: 'o1', ownership: { ownerId: 'a1' } }]);
      const mgr2 = mgr.release('o1', 'a1');
      expect(mgr2.getObject('o1').ownership.ownerId).toBeNull();
    });

    it('useObject replaces internal object and preserves id', () => {
      const mgr = new WorldObjectManager([
        createWorldObject({
          id: 'o1',
          affordances: [{ actionType: 'consume', need: 'hunger', satisfyRate: 0.3, consumeOnUse: true }],
        }),
      ]);
      const { manager: mgr2, result } = mgr.useObject('o1', { agentId: 'a1', actionType: 'consume' });
      expect(result.consumed).toBe(true);
      expect(mgr2.getObject('o1').lifecycle.status).toBe('consumed');
      expect(mgr2.getObject('o1').id).toBe('o1'); // id preserved
    });
  });

  describe('toJSON / fromJSON roundtrip', () => {
    it('preserves objects', () => {
      const mgr = new WorldObjectManager([
        { id: 'o1', type: 'tool', name: 'axe' },
        { id: 'o2', type: 'resource', name: 'herb' },
      ]);
      const json = mgr.toJSON();
      const restored = WorldObjectManager.fromJSON(json);

      expect(restored.list().length).toBe(2);
      expect(restored.getObject('o1').name).toBe('axe');
      expect(restored.getObject('o2').type).toBe('resource');
    });

    it('null/empty input returns empty manager', () => {
      expect(WorldObjectManager.fromJSON(null).list()).toEqual([]);
      expect(WorldObjectManager.fromJSON({}).list()).toEqual([]);
    });
  });

  describe('immutability', () => {
    it('addObject does not mutate original', () => {
      const mgr = new WorldObjectManager([]);
      mgr.addObject({ id: 'o1' });
      expect(mgr.list().length).toBe(0);
    });

    it('removeObject does not mutate original', () => {
      const mgr = new WorldObjectManager([{ id: 'o1' }]);
      mgr.removeObject('o1');
      expect(mgr.list().length).toBe(1);
    });

    it('updateObject does not mutate original', () => {
      const mgr = new WorldObjectManager([{ id: 'o1', name: 'old' }]);
      mgr.updateObject('o1', o => ({ ...o, name: 'new' }));
      expect(mgr.getObject('o1').name).toBe('old');
    });
  });
});
