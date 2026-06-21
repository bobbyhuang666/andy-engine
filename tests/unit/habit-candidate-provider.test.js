/**
 * HabitCandidateProvider tests
 */

import { describe, it, expect } from 'vitest';
import { HabitCandidateProvider, MAX_HABIT_CANDIDATES, DEFAULT_STATE_ACTION_MAP } from '../../src/action/providers/HabitCandidateProvider.js';
import { CandidateProviderManager } from '../../src/action/providers/CandidateProviderManager.js';
import ProceduralMemory from '../../src/agent/memory/ProceduralMemory.js';
import { ActionCandidate } from '../../src/action/ActionCandidate.js';

function createProceduralMemoryWithHabit(overrides = {}) {
  const pm = new ProceduralMemory();
  pm.setSimTime(new Date('2026-01-01T12:00:00'));

  const patternKey = overrides.patternKey || '8_1_library';
  const pattern = {
    trigger: {
      hour: overrides.hour ?? 8,
      dayOfWeek: overrides.dayOfWeek ?? 1,
      position: overrides.position ?? 'library',
      valence: overrides.valence ?? 0.1,
    },
    action: {
      region: overrides.region ?? 'library',
      state: overrides.state ?? 'studying',
    },
    strength: overrides.strength ?? 0.8,
    occurrences: overrides.occurrences ?? 5,
    lastSeen: Date.now(),
    createdAt: Date.now(),
  };

  pm.patterns.set(patternKey, pattern);
  return pm;
}

function makeContext(overrides = {}) {
  return {
    proceduralMemory: overrides.proceduralMemory ?? createProceduralMemoryWithHabit(),
    currentHour: overrides.currentHour ?? 8,
    dayOfWeek: overrides.dayOfWeek ?? 1,
    currentPosition: overrides.currentPosition ?? 'library',
    currentValence: overrides.currentValence ?? 0.1,
    domain: overrides.domain ?? null,
  };
}

describe('HabitCandidateProvider', () => {
  it('should return empty when proceduralMemory is missing', () => {
    const provider = new HabitCandidateProvider();
    const result = provider.generate({ currentHour: 8 });
    expect(result).toEqual([]);
  });

  it('should return empty when currentHour is missing', () => {
    const provider = new HabitCandidateProvider();
    const ctx = makeContext({ currentHour: undefined });
    ctx.currentHour = undefined;
    const result = provider.generate(ctx);
    expect(result).toEqual([]);
  });

  it('should return empty when no habits exist', () => {
    const provider = new HabitCandidateProvider();
    const pm = new ProceduralMemory();
    pm.setSimTime(new Date('2026-01-01T12:00:00'));
    const ctx = makeContext({ proceduralMemory: pm });
    const result = provider.generate(ctx);
    expect(result).toEqual([]);
  });

  it('should return empty when habit confidence is below threshold', () => {
    const provider = new HabitCandidateProvider();
    const pm = createProceduralMemoryWithHabit({ strength: 0.3 });
    const ctx = makeContext({ proceduralMemory: pm });
    const result = provider.generate(ctx);
    expect(result).toEqual([]);
  });

  it('should return empty when habit state has no action mapping', () => {
    const provider = new HabitCandidateProvider();
    const pm = createProceduralMemoryWithHabit({ state: 'unknown_state' });
    const ctx = makeContext({ proceduralMemory: pm });
    const result = provider.generate(ctx);
    expect(result).toEqual([]);
  });

  it('should generate a candidate from established studying habit', () => {
    const provider = new HabitCandidateProvider();
    const pm = createProceduralMemoryWithHabit({ state: 'studying', strength: 0.8 });
    const ctx = makeContext({ proceduralMemory: pm });
    const result = provider.generate(ctx);
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe('work');
    expect(result[0].source).toBe('habit');
    expect(result[0].metadata.habitState).toBe('studying');
    expect(result[0].metadata.patternKey).toBe('8_1_library');
  });

  it('should map eating to consume', () => {
    const provider = new HabitCandidateProvider();
    const pm = createProceduralMemoryWithHabit({ state: 'eating', strength: 0.9 });
    const ctx = makeContext({ proceduralMemory: pm });
    const result = provider.generate(ctx);
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe('consume');
  });

  it('should map resting to rest', () => {
    const provider = new HabitCandidateProvider();
    const pm = createProceduralMemoryWithHabit({ state: 'resting', strength: 0.9 });
    const ctx = makeContext({ proceduralMemory: pm });
    const result = provider.generate(ctx);
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe('rest');
  });

  it('should map socializing to socialize', () => {
    const provider = new HabitCandidateProvider();
    const pm = createProceduralMemoryWithHabit({ state: 'socializing', strength: 0.9 });
    const ctx = makeContext({ proceduralMemory: pm });
    const result = provider.generate(ctx);
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe('socialize');
  });

  it('should map walking to move', () => {
    const provider = new HabitCandidateProvider();
    const pm = createProceduralMemoryWithHabit({ state: 'walking', strength: 0.9 });
    const ctx = makeContext({ proceduralMemory: pm });
    const result = provider.generate(ctx);
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe('move');
  });

  it('should cap priority at 1.0', () => {
    const provider = new HabitCandidateProvider();
    const pm = createProceduralMemoryWithHabit({ state: 'working', strength: 1.0 });
    const ctx = makeContext({ proceduralMemory: pm });
    const result = provider.generate(ctx);
    expect(result).toHaveLength(1);
    expect(result[0].priority).toBeLessThanOrEqual(1.0);
    expect(result[0].priority).toBeGreaterThan(0);
  });

  it('should produce at most 1 candidate per tick', () => {
    const provider = new HabitCandidateProvider();
    const pm = createProceduralMemoryWithHabit({ state: 'studying', strength: 0.8 });
    const ctx = makeContext({ proceduralMemory: pm });
    const result = provider.generate(ctx);
    expect(result.length).toBeLessThanOrEqual(MAX_HABIT_CANDIDATES);
  });
});

describe('HabitCandidateProvider — determinism', () => {
  it('should produce identical candidates for identical context', () => {
    const provider = new HabitCandidateProvider();
    const pm = createProceduralMemoryWithHabit({ state: 'studying', strength: 0.8 });
    const ctx1 = makeContext({ proceduralMemory: pm });
    const ctx2 = makeContext({ proceduralMemory: pm });
    const result1 = provider.generate(ctx1);
    const result2 = provider.generate(ctx2);
    expect(result1).toEqual(result2);
  });

  it('should produce identical candidates across multiple calls (no randomness)', () => {
    const provider = new HabitCandidateProvider();
    const pm = createProceduralMemoryWithHabit({ state: 'working', strength: 0.85 });
    const ctx = makeContext({ proceduralMemory: pm });
    const results = [];
    for (let i = 0; i < 10; i++) {
      results.push(provider.generate(ctx));
    }
    for (let i = 1; i < results.length; i++) {
      expect(results[i]).toEqual(results[0]);
    }
  });
});

describe('HabitCandidateProvider — read-only boundary', () => {
  it('should not mutate proceduralMemory patterns', () => {
    const provider = new HabitCandidateProvider();
    const pm = createProceduralMemoryWithHabit({ state: 'studying', strength: 0.8 });
    const patternsBefore = JSON.stringify([...pm.patterns.entries()]);
    const ctx = makeContext({ proceduralMemory: pm });
    provider.generate(ctx);
    const patternsAfter = JSON.stringify([...pm.patterns.entries()]);
    expect(patternsAfter).toBe(patternsBefore);
  });

  it('should not mutate proceduralMemory recentActions', () => {
    const provider = new HabitCandidateProvider();
    const pm = createProceduralMemoryWithHabit({ state: 'studying', strength: 0.8 });
    const historyBefore = [...pm._recentActions];
    const ctx = makeContext({ proceduralMemory: pm });
    provider.generate(ctx);
    expect(pm._recentActions).toEqual(historyBefore);
  });

  it('should not call recordAction or disrupt', () => {
    const provider = new HabitCandidateProvider();
    const pm = createProceduralMemoryWithHabit({ state: 'studying', strength: 0.8 });
    let recordCalled = false;
    let disruptCalled = false;
    const origRecord = pm.recordAction.bind(pm);
    const origDisrupt = pm.disrupt.bind(pm);
    pm.recordAction = (...args) => { recordCalled = true; return origRecord(...args); };
    pm.disrupt = (...args) => { disruptCalled = true; return origDisrupt(...args); };
    const ctx = makeContext({ proceduralMemory: pm });
    provider.generate(ctx);
    expect(recordCalled).toBe(false);
    expect(disruptCalled).toBe(false);
  });

  it('should not mutate context object', () => {
    const provider = new HabitCandidateProvider();
    const pm = createProceduralMemoryWithHabit({ state: 'studying', strength: 0.8 });
    const ctx = makeContext({ proceduralMemory: pm });
    const ctxBefore = JSON.stringify(ctx);
    provider.generate(ctx);
    const ctxAfter = JSON.stringify(ctx);
    expect(ctxAfter).toBe(ctxBefore);
  });
});

describe('HabitCandidateProvider — domain isolation', () => {
  it('should not leak campus-specific strings in default mapping', () => {
    const campusStrings = ['食堂', '宿舍', '图书馆', '教室', 'campus'];
    for (const [state, action] of Object.entries(DEFAULT_STATE_ACTION_MAP)) {
      for (const campus of campusStrings) {
        expect(state).not.toContain(campus);
      }
    }
  });

  it('should allow domain to override state mapping', () => {
    const provider = new HabitCandidateProvider();
    const pm = createProceduralMemoryWithHabit({ state: 'meditating', strength: 0.9 });
    const domain = { habitStateActionMap: { meditating: 'reflect' } };
    const ctx = makeContext({ proceduralMemory: pm, domain });
    const result = provider.generate(ctx);
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe('reflect');
  });

  it('should fall back to default mapping for unmapped states in domain override', () => {
    const provider = new HabitCandidateProvider();
    const pm = createProceduralMemoryWithHabit({ state: 'studying', strength: 0.9 });
    const domain = { habitStateActionMap: { meditating: 'reflect' } };
    const ctx = makeContext({ proceduralMemory: pm, domain });
    const result = provider.generate(ctx);
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe('work');
  });
});

describe('HabitCandidateProvider — integration with CandidateProviderManager', () => {
  it('should be registered in the manager', () => {
    const manager = new CandidateProviderManager();
    const providerNames = manager.providers.map(p => p.name);
    expect(providerNames).toContain('HabitCandidateProvider');
  });

  it('should have 9 providers total after registration', () => {
    const manager = new CandidateProviderManager();
    expect(manager.providers).toHaveLength(9);
  });

  it('should contribute candidates through generateAll', () => {
    const manager = new CandidateProviderManager();
    const pm = createProceduralMemoryWithHabit({ state: 'studying', strength: 0.8 });
    const ctx = makeContext({ proceduralMemory: pm });
    ctx.behaviorField = { label: 'working', B: [0.5, 0.5, 0.5, 0.5] };
    ctx.emotion = { getValence: () => 0.1 };
    const all = manager.generateAll(ctx);
    const habitCandidates = all.filter(c => c.source === 'habit');
    expect(habitCandidates.length).toBeGreaterThanOrEqual(1);
  });
});
