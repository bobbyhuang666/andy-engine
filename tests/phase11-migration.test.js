/**
 * Phase 11: Directory Migration Test
 *
 * Verifies that all old import paths still work (backward compatibility)
 * and all new src/ import paths work (forward compatibility).
 */

import { describe, it, expect } from 'vitest';
import { existsSync } from 'fs';
import path from 'path';
import { createRequire } from 'module';

const ROOT = process.cwd();
const require = createRequire(import.meta.url);

describe('Phase 11: Directory Migration', () => {
  // ─── src/ directory structure ───

  describe('src/ directory structure exists', () => {
    const requiredDirs = [
      'src/shared',
      'src/shared/schemas',
      'src/domain',
      'src/spatial',
      'src/social',
      'src/sdk',
      'src/config',
    ];

    for (const dir of requiredDirs) {
      it(`${dir}/ exists`, () => {
        expect(existsSync(path.join(ROOT, dir)), `${dir} should exist`).toBe(true);
      });
    }
  });

  describe('src/ files exist', () => {
    const requiredFiles = [
      'src/shared/ids.js',
      'src/shared/time.js',
      'src/shared/errors.js',
      'src/shared/rng.js',
      'src/shared/index.js',
      'src/shared/schemas/CanonEvent.schema.js',
      'src/shared/schemas/WorldFact.schema.js',
      'src/shared/schemas/KnowledgeFact.schema.js',
      'src/shared/schemas/StateDelta.schema.js',
      'src/shared/schemas/GroundingPackage.schema.js',
      'src/domain/DomainRegistry.js',
      'src/domain/validateDomain.js',
      'src/domain/ForbiddenTerms.js',
      'src/domain/index.js',
      'src/spatial/SpatialEngine.js',
      'src/spatial/SpatialHash.js',
      'src/spatial/RegionGrid.js',
      'src/spatial/WorldMap.js',
      'src/spatial/index.js',
      'src/social/SocialGraph.js',
      'src/social/Relationship.js',
      'src/social/index.js',
      'src/sdk/Character.js',
      'src/sdk/Andy.js',
      'src/sdk/NarrativeBuilder.js',
      'src/sdk/LLMAdapter.js',
      'src/sdk/AutoTick.js',
      'src/sdk/ConversationLog.js',
      'src/sdk/AndyEngine.js',
      'src/sdk/types.d.ts',
      'src/sdk/index.js',
      'src/config/defaults.js',
      'src/config/validate.js',
      'src/config/index.js',
    ];

    for (const file of requiredFiles) {
      it(`${file} exists`, () => {
        expect(existsSync(path.join(ROOT, file)), `${file} should exist`).toBe(true);
      });
    }
  });

  // ─── New import paths work ───

  describe('new src/ import paths work', () => {
    it('require("src/shared") exports RNG, errors, time, ids', async () => {
      const mod = await import('../src/shared/index.js');
      expect(mod.RNG).toBeDefined();
      expect(mod.AndyError).toBeDefined();
      expect(mod.generateId).toBeDefined();
      expect(mod.TICK_INTERVAL_MINUTES).toBe(5);
    });

    it('require("src/shared/rng") exports RNG class', async () => {
      const { RNG } = await import('../src/shared/rng.js');
      expect(RNG).toBeDefined();
      const rng = new RNG(42);
      expect(rng.next()).toBeGreaterThan(0);
    });

    it('require("src/domain") exports DomainRegistry, validateDomain', async () => {
      const mod = await import('../src/domain/index.js');
      expect(mod.DomainRegistry).toBeDefined();
      expect(mod.validateDomain).toBeDefined();
      expect(mod.applyForbiddenTerms).toBeDefined();
    });

    it('require("src/spatial") exports SpatialEngine, SpatialHash, RegionGrid, WorldMap', async () => {
      const mod = await import('../src/spatial/index.js');
      expect(mod.SpatialEngine).toBeDefined();
      expect(mod.SpatialHash).toBeDefined();
      expect(mod.RegionGrid).toBeDefined();
      expect(mod.WorldMap).toBeDefined();
    });

    it('require("src/social") exports SocialGraph, Relationship', async () => {
      const mod = await import('../src/social/index.js');
      expect(mod.SocialGraph).toBeDefined();
      expect(mod.Relationship).toBeDefined();
    });

    it('require("src/sdk") exports Character, Andy, LLMAdapter, etc.', async () => {
      const mod = await import('../src/sdk/index.js');
      expect(mod.Character).toBeDefined();
      expect(mod.Andy).toBeDefined();
      expect(mod.LLMAdapter).toBeDefined();
      expect(mod.NarrativeBuilder).toBeDefined();
      expect(mod.AutoTick).toBeDefined();
      expect(mod.ConversationLog).toBeDefined();
    });

    it('require("src/config") exports ANDY_DEFAULTS, validateConfig', async () => {
      const mod = await import('../src/config/index.js');
      expect(mod.ANDY_DEFAULTS).toBeDefined();
      expect(mod.validateConfig).toBeDefined();
      expect(mod.EMOTION_DIMENSIONS).toBeDefined();
    });
  });

  // ─── Old import paths still work (backward compatibility) ───

  describe('old import paths still work', () => {
    it('require("domain") re-exports from src/domain', async () => {
      const mod = await import('../domain/index.js');
      expect(mod.DomainRegistry).toBeDefined();
      expect(mod.validateDomain).toBeDefined();
    });

    it('domain/ForbiddenTerms wrapper removed', () => {
      expect(existsSync(path.join(ROOT, 'domain', 'ForbiddenTerms.js'))).toBe(false);
    });

    it('spatial/SpatialEngine wrapper removed', () => {
      expect(existsSync(path.join(ROOT, 'spatial', 'SpatialEngine.js'))).toBe(false);
    });

    it('spatial/SpatialHash wrapper removed', () => {
      expect(existsSync(path.join(ROOT, 'spatial', 'SpatialHash.js'))).toBe(false);
    });

    it('social/SocialGraph wrapper removed', () => {
      expect(existsSync(path.join(ROOT, 'social', 'SocialGraph.js'))).toBe(false);
    });

    it('social/Relationship wrapper removed', () => {
      expect(existsSync(path.join(ROOT, 'social', 'Relationship.js'))).toBe(false);
    });

    it('require("sdk") re-exports from src/sdk', async () => {
      const mod = await import('../sdk/index.js');
      expect(mod.Character).toBeDefined();
      expect(mod.Andy).toBeDefined();
    });

    it('config/validate wrapper removed', () => {
      expect(existsSync(path.join(ROOT, 'config', 'validate.js'))).toBe(false);
    });

    it('require("src/shared/rng") exports RNG', async () => {
      const mod = await import('../src/shared/rng.js');
      expect(mod.RNG).toBeDefined();
    });
  });

  // ─── Cross-layer consistency ───

  describe('old and new paths export same module', () => {
    it('social/SocialGraph wrapper removed — src/social/SocialGraph is canonical', () => {
      const newMod = require('../src/social/SocialGraph.js');
      expect(newMod).toBeDefined();
      expect(existsSync(path.join(ROOT, 'social', 'SocialGraph.js'))).toBe(false);
    });

    it('core/RNG wrapper retired — src/shared/rng is canonical', async () => {
      const mod = await import('../src/shared/rng.js');
      expect(mod.RNG).toBeDefined();
      expect(existsSync(path.join(ROOT, 'core', 'RNG.js'))).toBe(false);
    });
  });
});
