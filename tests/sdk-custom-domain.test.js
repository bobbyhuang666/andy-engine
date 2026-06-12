import { describe, it, expect } from 'vitest';
const Andy = require('../sdk/Andy');
const Character = require('../sdk/Character');
const tavern = require('../presets/tavern');

describe('SDK Custom Domain Safety', () => {
  describe('Constructor propagation', () => {
    it('Andy should propagate custom domain to internal engine', () => {
      const world = new Andy({ domain: tavern });
      expect(world._engine.domain.id).toBe('tavern');
    });

    it('Character should propagate custom domain to internal engine when creating one', () => {
      const char = new Character({ name: 'Blacksmith', domain: tavern });
      expect(char._engine.domain.id).toBe('tavern');
    });
  });

  describe('Save/Load domainRef preservation & validation', () => {
    it('Andy save/load should preserve domainRef and throw on mismatched domain Config', () => {
      const world = new Andy({ domain: tavern });
      world.addCharacter({ id: 'npc_1', name: 'Alchemist' });
      
      const state = world.save();
      expect(state.domainRef).toBe('tavern');

      // Load without domain Config -> should throw
      expect(() => {
        Andy.load(state);
      }).toThrow('非 campus domain "tavern" 必须在 load 时传入对应的 domain 配置');

      // Load with mismatched domain Config -> should throw
      expect(() => {
        Andy.load(state, { domain: { id: 'other_domain' } });
      }).toThrow('domain 不匹配');

      // Load with correct domain Config -> should succeed
      const restored = Andy.load(state, { domain: tavern });
      expect(restored._engine.domain.id).toBe('tavern');
      expect(restored.getCharacter('npc_1')).toBeDefined();
    });

    it('Character save/load should preserve domainRef and throw on mismatched domain Config', () => {
      const char = new Character({ name: 'Barman', domain: tavern });
      const state = char.save();
      expect(state.domainRef).toBe('tavern');

      // Load without domain Config -> should throw
      expect(() => {
        Character.load(state);
      }).toThrow('非 campus domain "tavern" 必须在 load 时传入对应的 domain 配置');

      // Load with mismatched domain Config -> should throw
      expect(() => {
        Character.load(state, { domain: { id: 'other_domain' } });
      }).toThrow('domain 不匹配');

      // Load with correct domain Config -> should succeed
      const restored = Character.load(state, { domain: tavern });
      expect(restored._engine.domain.id).toBe('tavern');
      expect(restored.name).toBe('Barman');
    });
  });
});
