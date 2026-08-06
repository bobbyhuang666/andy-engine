/**
 * P0 Position Timing Inconsistency Reproduction Test
 *
 * Verifies that engine.getWorldContext(agentId).currentRegion and
 * engine.getGroundingPackage(agentId)'s AGENT_STATE fact .region stay
 * in sync after a tick that changes agent position.
 *
 * Bug: emitAgentStateFacts runs in Phase 3 (tick-start, before agent
 * movement in Phase 4/5), so the AGENT_STATE fact captures the pre-tick
 * position while getWorldContext() reflects the post-tick position.
 *
 * Strategy: Run multiple ticks until the agent moves to a different region.
 * After a tick where position changed, compare:
 *   - engine.getWorldContext(agentId).currentRegion (post-tick position)
 *   - engine.getGroundingPackage(agentId) AGENT_STATE fact .region (tick-start snapshot)
 * On unpatched code these will differ. After fix they must match.
 *
 * Expected: FAIL on unpatched code (regions differ), PASS after fix.
 */

import { describe, it, expect } from 'vitest';
import AndyEngine from '../../index.js';

describe('P0 Position Timing Consistency', () => {
  const SEED = 'p0-position-timing';
  const FIXED_START_TIME = new Date('2024-06-15T08:00:00Z');

  function buildEngine(initialRegion) {
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
      initialPosition: initialRegion || '宿舍',
    });

    engine.world.regions.place('alice', initialRegion || '宿舍');
    return engine;
  }

  function findAgentStateFact(gp, agentId) {
    return (gp?.allowedFacts || []).find(
      f => f.type === 'agent_state' && f.agentId === agentId
    );
  }

  /**
   * Run ticks until the agent's position changes from the initial region,
   * then check for the timing inconsistency.
   *
   * On unpatched code: worldContext.currentRegion != fact.region -> TEST FAILS
   * On patched code: they always match -> TEST PASSES
   */
  it('should keep worldContext.currentRegion and AGENT_STATE fact region in sync after position change', () => {
    const engine = buildEngine('宿舍');

    // Run ticks until agent moves to a different region
    let movedTick = -1;
    let lastRegion = '宿舍';
    const maxTicks = 30;

    for (let i = 0; i < maxTicks; i++) {
      engine.tick();
      const ctx = engine.getWorldContext('alice');
      const currentRegion = ctx?.currentRegion;
      if (currentRegion && currentRegion !== lastRegion) {
        movedTick = i;
        break;
      }
      lastRegion = currentRegion || lastRegion;
    }

    // Verify the agent actually moved during one of the ticks
    expect(movedTick).toBeGreaterThanOrEqual(0);

    // After the tick where position changed, compare the two sources
    const ctx = engine.getWorldContext('alice');
    const gp = engine.getGroundingPackage('alice');
    const agentStateFact = findAgentStateFact(gp, 'alice');

    expect(ctx?.currentRegion).toBeDefined();
    expect(agentStateFact).toBeDefined();
    expect(agentStateFact.region).toBeDefined();

    // The core assertion: both sources must report the same region.
    // On unpatched code: fact.region (tick-start) != ctx.currentRegion (post-tick)
    // After fix: they must match
    expect(agentStateFact.region).toBe(ctx.currentRegion);
  });

  /**
   * When the agent does NOT move during a tick, both sources should also
   * agree. This is a control case that should pass both before and after fix.
   */
  it('should keep regions in sync when agent does not move', () => {
    const engine = buildEngine('宿舍');
    engine.tick();

    const ctx = engine.getWorldContext('alice');
    const gp = engine.getGroundingPackage('alice');
    const agentStateFact = findAgentStateFact(gp, 'alice');

    // Even without movement, the two sources should be consistent.
    // (They may both be '宿舍' or both be wherever the agent ended up,
    // but they must agree.)
    if (ctx?.currentRegion && agentStateFact?.region) {
      expect(agentStateFact.region).toBe(ctx.currentRegion);
    }
  });
});
