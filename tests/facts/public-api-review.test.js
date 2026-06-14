import { describe, it, expect } from 'vitest';
import AndyEngine from '../../index.js';
import { WorldFactStore, FactProvider, FactConsistencyChecker } from '../../facts/index.js';

describe('Phase 42: Public API Review', () => {
  it('getGroundingPackage is public API', () => {
    expect(typeof AndyEngine.prototype.getGroundingPackage).toBe('function');
  });

  it('checkConsistency is public API', () => {
    expect(typeof AndyEngine.prototype.checkConsistency).toBe('function');
  });

  it('facts module is exported', () => {
    expect(WorldFactStore).toBeDefined();
    expect(FactProvider).toBeDefined();
    expect(FactConsistencyChecker).toBeDefined();
  });

  it('enableFacts is optional', () => {
    const engine = new AndyEngine();
    expect(engine.world.factStore).toBeNull();
  });

  it('enableFacts defaults to false', () => {
    const engine = new AndyEngine();
    expect(engine.config.enableFacts).toBe(false);
  });
});
