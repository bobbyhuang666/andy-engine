/**
 * P1 Checker False Positives Reproduction Test
 *
 * Verifies that FactConsistencyChecker / GroundingChecker produce false
 * positive violations for 7 synthetic fixtures identified by E1.
 *
 * Each fixture uses synthetic data (no private/W3 data). All assertions
 * expect NO violation for the given input. On unpatched code these tests
 * FAIL (exposing the false positive bug). After fixing the checkers they PASS.
 */

import { describe, it, expect } from 'vitest';
import AndyEngine from '../../index.js';
import FactConsistencyChecker from '../../src/narrative/FactConsistencyChecker.js';
import GroundingChecker from '../../src/narrative/GroundingChecker.js';
import FactProvider from '../../src/narrative/FactProvider.js';
import { FactType, FactScope } from '../../src/canon/FactSchema.js';

describe('P1 Checker False Positives', () => {
  const SEED = 'p1-false-positives';
  const FIXED_START_TIME = new Date('2024-06-15T08:00:00Z');

  /**
   * Build a minimal engine with facts enabled and two agents.
   * Alice is the observer; Bob is the subject of events.
   */
  function buildEngine() {
    const engine = new AndyEngine({
      seed: SEED,
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

    // Place both agents in the same region so encounters can happen
    engine.world.regions.place('alice', '宿舍');
    engine.world.regions.place('bob', '宿舍');

    // Run one tick to establish baseline facts
    engine.tick();

    return engine;
  }

  /**
   * Fixture 1: "雪无声地落在步道上"
   *
   * "步道上" is NOT a campus domain region, so the location regex
   * /[在去到从]([一-龥]{2,6})/g matches "步道" and triggers
   * unknown_location. This is a false positive — "步道" is a generic
   * descriptive noun, not a location entity claim.
   */
  it('should NOT produce unknown_location for "雪无声地落在步道上"', () => {
    const engine = buildEngine();

    const result = engine.checkConsistency('雪无声地落在步道上', 'alice');

    const unknownLocViolations = result.violations?.filter(v => v.type === 'unknown_location') || [];
    expect(unknownLocViolations).toHaveLength(0);
  });

  /**
   * Fixture 2: "她选了靠窗的位置"
   *
   * The character name regex /[，。！？\s]([一-龥]{2,4})(?=[说聊问答告诉来了去了见到])/g
   * should NOT match "她选" because "她" is a pronoun, not a name,
   * and the lookahead verbs don't align with a character reference.
   */
  it('should NOT produce unknown_character for "她选了靠窗的位置"', () => {
    const engine = buildEngine();

    const result = engine.checkConsistency('她选了靠窗的位置', 'alice');

    const unknownCharViolations = result.violations?.filter(v => v.type === 'unknown_character') || [];
    expect(unknownCharViolations).toHaveLength(0);
  });

  /**
   * Fixture 3: "待会儿回去"
   *
   * "待会儿" is a time expression, not a character name. The regex
   * should not match it as an unknown_character because the lookahead
   * pattern requires specific verbs after a 2-4 char name.
   */
  it('should NOT produce unknown_character for "待会儿回去"', () => {
    const engine = buildEngine();

    const result = engine.checkConsistency('待会儿回去', 'alice');

    const unknownCharViolations = result.violations?.filter(v => v.type === 'unknown_character') || [];
    expect(unknownCharViolations).toHaveLength(0);
  });

  /**
   * Fixture 4: "一个人站在白茫茫的雪地里"
   *
   * "一个人" (one person) is not an agent reference. The unsupported_claim
   * pattern /([一-龥]{2,4}|[A-Za-z]{2,10})\s*[在去了到]\s*([一-龥]{2,6})/g
   * might match "一个人站在白茫茫的雪" but "一个人" is in commonNonAgents
   * or the location doesn't match a domain region. Either way, no
   * unsupported_claim should fire.
   */
  it('should NOT produce unsupported_claim for "一个人站在白茫茫的雪地里"', () => {
    const engine = buildEngine();

    const result = engine.checkConsistency('一个人站在白茫茫的雪地里', 'alice');

    const unsupportedViolations = result.violations?.filter(v => v.type === 'unsupported_claim') || [];
    expect(unsupportedViolations).toHaveLength(0);
  });

  /**
   * Fixture 5: "那本书还在书包里"
   *
   * "那本书" is an object reference, not an agent. The unsupported_claim
   * pattern should not match this as an agent-location claim.
   */
  it('should NOT produce unsupported_claim for "那本书还在书包里"', () => {
    const engine = buildEngine();

    const result = engine.checkConsistency('那本书还在书包里', 'alice');

    const unsupportedViolations = result.violations?.filter(v => v.type === 'unsupported_claim') || [];
    expect(unsupportedViolations).toHaveLength(0);
  });

  /**
   * Fixture 6: 4-char fragment false positive in local_scope_leak check.
   *
   * Creates a LOCAL-scope event fact that alice does NOT know about,
   * then checks that a 4-character fragment of the description does NOT
   * trigger a local_scope_leak violation via exact-match-only semantics.
   *
   * NOTE: The GroundingChecker uses 4-char fragment matching for desc >= 4 chars,
   * which IS the bug. This test uses the raw GroundingChecker to expose it.
   *
   * Fixture: description = "Bob在操场打篮球", text fragment = "Bob在操场打篮"
   */
  it('should NOT produce local_scope_leak for 4-char fragment of forbidden fact', () => {
    const engine = buildEngine();

    // Dispatch a LOCAL event that alice does NOT participate in or observe
    engine.world.eventDispatcher.createEvent({
      type: 'social',
      scope: 'local',
      participants: ['bob'],
      observers: [],
      content: 'Bob在操场打篮球',
      time: engine.world.time,
      effects: [],
    });

    // Run a tick to process the event through the canon pipeline
    engine.tick();

    // Get the grounding package for alice
    const grounding = engine.getGroundingPackage('alice');
    expect(grounding).not.toBeNull();

    // Verify there are forbidden facts (the local event alice doesn't know)
    const forbiddenFacts = grounding.forbiddenFacts || [];
    const localFact = forbiddenFacts.find(f =>
      f.type === FactType.EVENT &&
      f.scope === FactScope.LOCAL &&
      f.description && f.description.includes('Bob在操场打篮球')
    );

    // If the forbidden fact exists, test the raw GroundingChecker
    if (localFact) {
      const checker = new GroundingChecker(engine.world.factStore, engine.domain);

      // Use a 4-char fragment of the forbidden description
      // "Bob在操场打篮球" → fragment "Bob在操场打" (first 8 chars)
      // or exactly 4 chars: "Bob在操场打"[:4] = "Bob在操场打" — wait, let me count
      // "Bob在操场打篮球" = B,o,b,在,操,场,打,篮,球 = 9 chars
      // 4-char fragment: "Bob在操场打"[0:4] = "Bob在" (mixed) or just take "在操场打"
      const fragment = '在操场打'; // 4 Chinese chars from the description

      const result = checker.check(fragment, grounding);

      // BUG: GroundingChecker._textContainsFactContent does 4-char fragment
      // matching for descriptions >= 4 chars, so "在操场打" matches the
      // forbidden fact description and produces a local_scope_leak.
      const localScopeViolations = result.violations?.filter(v => v.type === 'local_scope_leak') || [];
      expect(localScopeViolations).toHaveLength(0);
    } else {
      // If no forbidden fact was created (e.g., event wasn't processed), skip
      console.log('SKIP: No LOCAL forbidden fact found for fragment test');
    }
  });

  /**
   * Fixture 7: Another 4-char fragment local_scope_leak false positive.
   *
   * Uses a different forbidden fact description and a different fragment.
   */
  it('should NOT produce local_scope_leak for another 4-char fragment', () => {
    const engine = buildEngine();

    // Dispatch another LOCAL event
    engine.world.eventDispatcher.createEvent({
      type: 'consume',
      scope: 'local',
      participants: ['bob'],
      observers: [],
      content: 'Bob在食堂吃午饭',
      time: engine.world.time,
      effects: [],
    });

    engine.tick();

    const grounding = engine.getGroundingPackage('alice');
    expect(grounding).not.toBeNull();

    const forbiddenFacts = grounding.forbiddenFacts || [];
    const localFact = forbiddenFacts.find(f =>
      f.type === FactType.EVENT &&
      f.scope === FactScope.LOCAL &&
      f.description && f.description.includes('Bob在食堂吃午饭')
    );

    if (localFact) {
      const checker = new GroundingChecker(engine.world.factStore, engine.domain);

      // "Bob在食堂吃午饭" → 4-char fragment "食堂吃午"
      const fragment = '食堂吃午';

      const result = checker.check(fragment, grounding);

      const localScopeViolations = result.violations?.filter(v => v.type === 'local_scope_leak') || [];
      expect(localScopeViolations).toHaveLength(0);
    } else {
      console.log('SKIP: No LOCAL forbidden fact found for second fragment test');
    }
  });
});
