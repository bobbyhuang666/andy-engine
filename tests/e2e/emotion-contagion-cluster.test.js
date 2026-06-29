/**
 * Emotion Contagion Cluster E2E Test (W3)
 *
 * Verifies that emotion contagion produces convergence: agents co-located
 * in the same region with pre-seeded relationships and extreme initial
 * emotions converge toward each other over 100 ticks.
 *
 * Deterministic-by-construction:
 *   - Fixed seed: 'd6-contagion-convergence'
 *   - Manual extreme initial emotion values (both current and mood)
 *   - Pre-seeded relationships via recordInteraction (non-default weight)
 *   - Empty schedules (agents stay co-located)
 *   - Variance decrease threshold (≤50% of initial, verified deterministic)
 *   - No probabilistic assertions; same seed → same result every run
 */

import { describe, it, expect } from 'vitest';
import AndyEngine from '../../index.js';

// ═══════════════════════════════════════════
// 辅助函数
// ═══════════════════════════════════════════

function variance(arr) {
  const mean = arr.reduce((s, v) => s + v, 0) / arr.length;
  return arr.reduce((s, v) => s + (v - mean) ** 2, 0) / arr.length;
}

describe('Emotion Contagion Cluster E2E', () => {
  // ═══════════════════════════════════════════
  // Test 1: Emotion Convergence via Social Contagion
  //
  // Seed: 'd6-contagion-convergence'
  //
  // 3 agents (a, b, c) all co-located in same region.
  // Extreme initial emotions set manually (current + mood).
  // Pre-seeded relationships via recordInteraction for non-trivial weight.
  // Run 100 ticks → verify joy and sadness variance decreased to ≤50%.
  //
  // Verified deterministic: same seed produces identical variance ratios.
  // ═══════════════════════════════════════════

  it('3 co-located agents with extreme emotions converge via contagion within 100 ticks', () => {
    const engine = new AndyEngine({
      seed: 'd6-contagion-convergence',
      startTime: new Date('2024-01-15T08:00:00'),
    });

    // Create 3 agents in same region with empty schedules
    // Note: agents may move together during simulation ticks via action
    // selection, but stay co-located (same region at each tick), ensuring
    // contagion radius coverage throughout the test.
    engine.createCharacter({
      id: 'a',
      name: 'A',
      mbti: 'INFP',
      schedule: { entries: [] },
      initialPosition: '校园广场',
    });
    engine.createCharacter({
      id: 'b',
      name: 'B',
      mbti: 'INFP',
      schedule: { entries: [] },
      initialPosition: '校园广场',
    });
    engine.createCharacter({
      id: 'c',
      name: 'C',
      mbti: 'INFP',
      schedule: { entries: [] },
      initialPosition: '校园广场',
    });

    const agentA = engine.getAgent('a');
    const agentB = engine.getAgent('b');
    const agentC = engine.getAgent('c');

    // ── Set extreme initial emotions (both current and mood) ──
    // A: very happy
    agentA.emotion.current.joy = 0.9;
    agentA.emotion.current.sadness = 0.05;
    agentA.emotion.mood.joy = 0.9;
    agentA.emotion.mood.sadness = 0.05;

    // B: very sad
    agentB.emotion.current.joy = 0.1;
    agentB.emotion.current.sadness = 0.8;
    agentB.emotion.mood.joy = 0.1;
    agentB.emotion.mood.sadness = 0.8;

    // C: also sad (slightly less extreme)
    agentC.emotion.current.joy = 0.15;
    agentC.emotion.current.sadness = 0.75;
    agentC.emotion.mood.joy = 0.15;
    agentC.emotion.mood.sadness = 0.75;

    // ── Pre-seed relationships for non-trivial contagion weight ──
    // Default weight is 0.1 (near-zero influence). recordInteraction ×5
    // raises strength to ~0.134, ensuring contagion has measurable effect.
    const graph = engine.world.socialGraph;
    const ab = graph.getOrCreateRelationship('a', 'b');
    for (let i = 0; i < 5; i++) ab.recordInteraction('talk', 0.5, 'chat');
    const ac = graph.getOrCreateRelationship('a', 'c');
    for (let i = 0; i < 5; i++) ac.recordInteraction('talk', 0.5, 'chat');
    const bc = graph.getOrCreateRelationship('b', 'c');
    for (let i = 0; i < 5; i++) bc.recordInteraction('talk', 0.5, 'chat');

    // Verify relationships are non-trivial
    expect(ab.strength).toBeGreaterThan(0.1);
    expect(ac.strength).toBeGreaterThan(0.1);
    expect(bc.strength).toBeGreaterThan(0.1);

    // ── Compute initial variance ──
    const initialJoyVariance = variance([0.9, 0.1, 0.15]);
    const initialSadnessVariance = variance([0.05, 0.8, 0.75]);

    // Sanity: initial variance is substantial (extreme emotions spread apart)
    expect(initialJoyVariance).toBeGreaterThan(0.1);
    expect(initialSadnessVariance).toBeGreaterThan(0.1);

    // ── Run 100 ticks ──
    for (let i = 0; i < 100; i++) engine.tick();

    // ── Compute final variance ──
    const joyValues = [
      agentA.emotion.current.joy,
      agentB.emotion.current.joy,
      agentC.emotion.current.joy,
    ];
    const sadnessValues = [
      agentA.emotion.current.sadness,
      agentB.emotion.current.sadness,
      agentC.emotion.current.sadness,
    ];

    const joyVariance = variance(joyValues);
    const sadnessVariance = variance(sadnessValues);

    // ── Emotion value range sanity check ──
    // All emotion values must remain in [-1, 1] after contagion
    for (const v of [...joyValues, ...sadnessValues]) {
      expect(v).toBeGreaterThanOrEqual(-1);
      expect(v).toBeLessThanOrEqual(1);
    }

    // ── Deterministic assertions ──

    // Primary: variance decreased to ≤50% of initial (contagion convergence)
    expect(joyVariance).toBeLessThanOrEqual(initialJoyVariance * 0.5);
    expect(sadnessVariance).toBeLessThanOrEqual(initialSadnessVariance * 0.5);

    // Auxiliary: variance actually decreased (contagion produced convergence)
    expect(joyVariance).toBeLessThan(initialJoyVariance);
    expect(sadnessVariance).toBeLessThan(initialSadnessVariance);

    // Tighter verification (empirically stable with this seed):
    // Joy converges to ≤25% of initial variance
    // Sadness converges to ≤40% of initial variance
    // (Adjusted from 10%/10% after R20 P0 fix: seeded RNG in IM exploration
    //  causes agents to sometimes move to different regions, reducing
    //  contagion exposure. Further adjusted from 35% after R22 P0-3 fix:
    //  double emotion effect eliminated, so contagion is now single-pass
    //  instead of double, reducing convergence rate slightly.)
    // These tighter bounds are verified deterministic; if seed changes,
    // the 50% threshold remains the primary contract.
    expect(joyVariance).toBeLessThanOrEqual(initialJoyVariance * 0.25);
    expect(sadnessVariance).toBeLessThanOrEqual(initialSadnessVariance * 0.40);
  });
});
