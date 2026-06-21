import { describe, it, expect } from 'vitest';
import * as WorldObjectModule from '../../src/action/WorldObject.js';

const { createWorldObject } = WorldObjectModule;

describe('Phase 39: WorldObject Integration', () => {
  it('WorldObject module exists', () => {
    expect(WorldObjectModule).toBeDefined();
  });

  it('WorldObject can be created', () => {
    const obj = createWorldObject({
      id: 'obj1',
      type: 'furniture',
      name: '桌子',
      location: '图书馆',
    });

    expect(obj.id).toBe('obj1');
    expect(obj.type).toBe('furniture');
    expect(obj.name).toBe('桌子');
  });
});
