/**
 * Checker True Positive Guards
 *
 * Ensures that fixes for false positives do NOT relax genuine checks.
 * All tests PASS on both unpatched and patched code — they are guards
 * against regression (over-correction).
 *
 * Uses the default campus domain with controlled fixtures.
 */

import { describe, it, expect } from 'vitest';
import AndyEngine from '../../index.js';
import FactConsistencyChecker from '../../src/narrative/FactConsistencyChecker.js';
import { FactType, FactScope } from '../../src/canon/FactSchema.js';

describe('P2 Checker True Positive Guards', () => {
  const FIXED_START_TIME = new Date('2024-06-15T08:00:00Z');

  function buildGuardEngine() {
    const engine = new AndyEngine({
      seed: 'guard-tests',
      startTime: FIXED_START_TIME,
      enableFacts: true,
    });

    engine.createCharacter({
      id: 'alice',
      name: 'Alice',
      mbti: 'INFP',
      schedule: 'student',
    });

    engine.createCharacter({
      id: 'bob',
      name: 'Bob',
      mbti: 'ESTJ',
      schedule: 'worker',
    });

    engine.world.regions.place('alice', '宿舍');
    engine.world.regions.place('bob', '宿舍');
    return engine;
  }

  /**
   * Guard 1: Unknown location SHOULD still trigger violation.
   */
  it('should STILL flag unknown location not in domain regions', () => {
    const engine = buildGuardEngine();

    // "火星" is definitely NOT in the campus domain's regions
    const result = engine.checkConsistency('我在火星散步', 'alice');

    expect(result.valid).toBe(false);
    expect(result.severity).not.toBe('pass');

    const unknownLocViolations = result.violations?.filter(v => v.type === 'unknown_location') || [];
    expect(unknownLocViolations.length).toBeGreaterThan(0);
  });

  /**
   * Guard 2: Private AGENT_STATE leak SHOULD still trigger violation.
   *
   * Uses synthetic grounding with both agents in metadata but NO evidence
   * that alice knows about bob's emotional state.
   */
  it('should STILL flag private agent_state leak', () => {
    const engine = buildGuardEngine();
    engine.tick();

    const factStore = engine.world.factStore;
    const domain = engine.domain;

    if (!factStore || !domain) {
      throw new Error('Guard test requires factStore and domain');
    }

    const syntheticGrounding = {
      allowedFacts: [
        {
          id: 'static-1',
          type: FactType.STATIC_ENV,
          area: '世界',
          object: '宿舍',
          description: '存在此区域',
          timestamp: new Date('2024-01-01T00:00:00Z'),
          source: 'engine',
          confidence: 1.0,
          scope: FactScope.PUBLIC,
          participants: [],
          observers: [],
        },
      ],
      inferredFacts: [],
      forbiddenFacts: [],
      metadata: {
        agentId: 'alice',
        agentNames: {
          alice: 'Alice',
          bob: 'Bob',
        },
        currentTime: new Date('2024-06-15T09:00:00Z'),
        factCount: { allowed: 1, inferred: 0, forbidden: 0 },
      },
    };

    const checker = new FactConsistencyChecker(factStore, domain);
    const result = checker.check('Bob很伤心', syntheticGrounding);

    expect(result.valid).toBe(false);
    expect(result.severity).not.toBe('pass');

    const stateLeakViolations = result.violations?.filter(v => v.type === 'agent_state_leak') || [];
    expect(stateLeakViolations.length).toBeGreaterThan(0);
  });

  /**
   * Guard 3: Exact forbidden fact content leak SHOULD still trigger violation.
   */
  it('should STILL flag exact forbidden fact content leak', () => {
    const engine = buildGuardEngine();
    engine.tick();

    const factStore = engine.world.factStore;
    const domain = engine.domain;

    if (!factStore || !domain) {
      throw new Error('Guard test requires factStore and domain');
    }

    const forbiddenEvent = {
      id: 'guard-forbidden-evt-001',
      type: FactType.EVENT,
      timestamp: new Date('2024-06-15T09:00:00Z'),
      source: 'engine',
      confidence: 1.0,
      scope: FactScope.LOCAL,
      participants: ['bob'],
      observers: [],
      eventId: 'guard-event-001',
      description: 'Bob在秘密会议室策划惊喜派对',
    };
    factStore.addFact(forbiddenEvent);

    const syntheticGrounding = {
      allowedFacts: [],
      inferredFacts: [],
      forbiddenFacts: [forbiddenEvent],
      metadata: {
        agentId: 'alice',
        agentNames: {
          alice: 'Alice',
          bob: 'Bob',
        },
        currentTime: new Date('2024-06-15T09:00:00Z'),
        factCount: { allowed: 0, inferred: 0, forbidden: 1 },
      },
    };

    const checker = new FactConsistencyChecker(factStore, domain);
    const result = checker.check('Bob在秘密会议室策划惊喜派对', syntheticGrounding);

    expect(result.valid).toBe(false);
    expect(result.severity).not.toBe('pass');

    const localScopeViolations = result.violations?.filter(v => v.type === 'local_scope_leak') || [];
    expect(localScopeViolations.length).toBeGreaterThan(0);
  });
});
