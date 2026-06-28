/**
 * Phase 30: WorldObject Minimal Runtime Tests
 *
 * Verifies:
 * - Objects can be created and managed
 * - Object affordances generate candidates
 * - Object interactions create events
 * - Object lifecycle changes are traceable
 * - Destroyed objects don't create dangling references
 * - Tests cover visibility, ownership, and consumable/durable behavior
 */

import { describe, it, expect } from 'vitest';
import { WorldObject, WorldObjectManager } from '../agent/action/WorldObject.js';

describe('Phase 30: WorldObject Minimal Runtime', () => {
  describe('WorldObject lifecycle', () => {
    it('creates object with defaults', () => {
      const obj = new WorldObject({ id: 'bread_1', type: 'food', name: '面包', location: '食堂' });
      expect(obj.id).toBe('bread_1');
      expect(obj.type).toBe('food');
      expect(obj.status).toBe('active');
    });

    it('consumable object decrements uses', () => {
      const obj = new WorldObject({
        id: 'bread_1', type: 'food', name: '面包', location: '食堂',
        usesRemaining: 3,
        affordances: [{ need: 'hunger', satisfyRate: 0.3 }],
      });

      obj.use('agent_a');
      expect(obj.usesRemaining).toBe(2);
      expect(obj.status).toBe('active');

      obj.use('agent_a');
      obj.use('agent_a');
      expect(obj.usesRemaining).toBe(0);
      expect(obj.status).toBe('consumed');
    });

    it('consumed object is not available', () => {
      const obj = new WorldObject({
        id: 'bread_1', type: 'food', name: '面包', location: '食堂',
        usesRemaining: 1,
      });
      obj.use('agent_a');
      expect(obj.isAvailableFor('agent_a')).toBe(false);
    });

    it('durable object does not consume', () => {
      const obj = new WorldObject({
        id: 'guitar_1', type: 'tool', name: '吉他', location: '广场',
        affordances: [{ need: 'stimulation', satisfyRate: 0.15 }],
      });

      obj.use('agent_a');
      expect(obj.status).toBe('active');
      expect(obj.usesRemaining).toBeNull();
    });

    it('destroyed object is not visible', () => {
      const obj = new WorldObject({ id: 'x', type: 'generic', name: 'X', location: '广场' });
      obj.destroy();
      expect(obj.isVisibleTo('agent_a', '广场')).toBe(false);
    });
  });

  describe('WorldObject ownership', () => {
    it('owned object blocks other agents', () => {
      const obj = new WorldObject({ id: 'bed_1', type: 'furniture', name: '床', location: '小屋' });
      obj.setOwner('agent_a');

      expect(obj.isAvailableFor('agent_a')).toBe(true);
      expect(obj.isAvailableFor('agent_b')).toBe(false);
    });

    it('null owner allows all agents', () => {
      const obj = new WorldObject({ id: 'table_1', type: 'furniture', name: '桌子', location: '广场' });
      expect(obj.isAvailableFor('agent_a')).toBe(true);
      expect(obj.isAvailableFor('agent_b')).toBe(true);
    });
  });

  describe('WorldObject visibility', () => {
    it('region-scoped object visible only in same region', () => {
      const obj = new WorldObject({
        id: 'bread_1', type: 'food', name: '面包', location: '食堂',
        visibility: { scope: 'region' },
      });

      expect(obj.isVisibleTo('agent_a', '食堂')).toBe(true);
      expect(obj.isVisibleTo('agent_a', '图书馆')).toBe(false);
    });
  });

  describe('WorldObjectManager', () => {
    it('manages objects lifecycle', () => {
      const manager = new WorldObjectManager();
      manager.addObject({ id: 'bread_1', type: 'food', name: '面包', location: '食堂' });
      manager.addObject({ id: 'guitar_1', type: 'tool', name: '吉他', location: '广场' });

      expect(manager.objects.size).toBe(2);
      expect(manager.getObject('bread_1').name).toBe('面包');
    });

    it('gets objects in region', () => {
      const manager = new WorldObjectManager();
      manager.addObject({ id: 'bread_1', type: 'food', name: '面包', location: '食堂' });
      manager.addObject({ id: 'guitar_1', type: 'tool', name: '吉他', location: '广场' });

      const canteenObjects = manager.getObjectsInRegion('食堂');
      expect(canteenObjects).toHaveLength(1);
      expect(canteenObjects[0].id).toBe('bread_1');
    });

    it('serializes and restores', () => {
      const manager = new WorldObjectManager();
      manager.addObject({ id: 'bread_1', type: 'food', name: '面包', location: '食堂' });

      const json = manager.toJSON();
      const restored = new WorldObjectManager(json);

      expect(restored.objects.size).toBe(1);
      expect(restored.getObject('bread_1').name).toBe('面包');
    });

    it('destroyed objects not included in region query', () => {
      const manager = new WorldObjectManager();
      const obj = manager.addObject({ id: 'bread_1', type: 'food', name: '面包', location: '食堂' });
      obj.destroy();

      expect(manager.getObjectsInRegion('食堂')).toHaveLength(0);
    });
  });

  describe('Object interaction events', () => {
    it('use creates structured event', () => {
      const obj = new WorldObject({
        id: 'bread_1', type: 'food', name: '面包', location: '食堂',
        affordances: [{ need: 'hunger', satisfyRate: 0.3 }],
      });

      const event = obj.use('agent_a');
      expect(event).toBeDefined();
      expect(event.type).toBe('object_use');
      expect(event.objectId).toBe('bread_1');
      expect(event.participants).toContain('agent_a');
      expect(event.effects).toHaveLength(1);
      expect(event.effects[0].delta.hunger).toBe(0.3);
    });
  });
});
