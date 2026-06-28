/**
 * D6 Social Emergence E2E — v2.6 W1
 *
 * Validates social graph structural emergence:
 *   1. Triadic closure: pre-seeded edges → deterministic strengthening
 *   2. Dunbar layer differentiation: at least 2 distinct tiers
 *   3. Social graph serialization fidelity: roundtrip preserves structure
 *
 * All tests are deterministic-by-construction:
 *   - Fixed seeds
 *   - Pre-seeded relationships (no reliance on natural encounters)
 *   - Deterministic assertions (specific values / narrow intervals)
 *   - CI flaky zero-tolerance
 *
 * Design Brief §6.1 / Task Card W1
 */

import { describe, it, expect, beforeEach } from 'vitest';
import AndyEngine from '../../index.js';
import { toWorldState, fromWorldState } from '../../src/store/world/WorldStateAdapter.js';

// ─── Helpers ───

function variance(arr) {
  const mean = arr.reduce((s, v) => s + v, 0) / arr.length;
  return arr.reduce((s, v) => s + (v - mean) ** 2, 0) / arr.length;
}

/**
 * Seed a relationship to approximately targetStrength via recordInteraction.
 * Uses positive valence interactions to grow strength deterministically.
 * Returns the actual strength after seeding.
 */
function seedRelationship(graph, agentA, agentB, targetStrength, valence = 0.8) {
  const rel = graph.getOrCreateRelationship(agentA, agentB);
  // Each recordInteraction with valence 0.8 in calculative mode:
  // delta = 0.012 * (1 + 0.8) * 0.6 = 0.01296
  // So ~N interactions needed to reach target from initial 0.08
  const maxInteractions = 200; // safety cap
  let count = 0;
  while (rel.strength < targetStrength && count < maxInteractions) {
    rel.recordInteraction('talk', valence, 'chat');
    count++;
  }
  return rel.strength;
}

// ═══════════════════════════════════════════════════════════════
// Test 1: Triadic Closure — Deterministic Strengthening
// ═══════════════════════════════════════════════════════════════

describe('D6 Social Emergence E2E', () => {
  describe('Triadic closure: deterministic strengthening', () => {
    it('pre-seeded A-B/B-C ≥0.5 → A-C strengthened; A-D unchanged', () => {
      const engine = new AndyEngine({
        seed: 'd6-triadic-closure',
        enableFacts: true,
        startTime: new Date('2024-01-15T08:00:00'),
      });

      // Create 4 agents in the same area
      engine.createCharacter({ id: 'a', name: 'Alice', mbti: 'ENFP', schedule: 'student' });
      engine.createCharacter({ id: 'b', name: 'Bob', mbti: 'INFP', schedule: 'student' });
      engine.createCharacter({ id: 'c', name: 'Carol', mbti: 'ISTJ', schedule: 'student' });
      engine.createCharacter({ id: 'd', name: 'Dave', mbti: 'ESTJ', schedule: 'student' });

      // Place all in same area
      const graph = engine.world.socialGraph;

      // Pre-seed relationships:
      // A-B: strength ≥ 0.5 (friend, ≥ minBridgeStrength)
      const abStrength = seedRelationship(graph, 'a', 'b', 0.6);
      expect(abStrength).toBeGreaterThanOrEqual(0.5);

      // B-C: strength ≥ 0.5 (friend, ≥ minBridgeStrength)
      const bcStrength = seedRelationship(graph, 'b', 'c', 0.6);
      expect(bcStrength).toBeGreaterThanOrEqual(0.5);

      // A-C: weak edge (~0.3, acquaintance)
      const acStrength = seedRelationship(graph, 'a', 'c', 0.3);

      // Verify pre-conditions
      const relAB = graph.getRelationship('a', 'b');
      const relBC = graph.getRelationship('b', 'c');
      const relAC = graph.getRelationship('a', 'c');
      const relAD = graph.getRelationship('a', 'd');

      expect(relAB.strength).toBeGreaterThanOrEqual(0.5);
      expect(relBC.strength).toBeGreaterThanOrEqual(0.5);
      expect(relAC.strength).toBeGreaterThan(0.15);
      expect(relAD).toBeNull(); // no edge yet

      // Create A-D edge to track non-closure case
      const adInitialStrength = graph.getOrCreateRelationship('a', 'd').strength;

      // Record A-C and A-D initial strengths before ticks
      const acBefore = relAC.strength;
      const adBefore = adInitialStrength;

      // Run enough ticks for _triadicClosure to sample agent A at least once.
      // _triadicClosure uses 1/3 rotating sample, offset = _tickCount % 3.
      // Starting from _tickCount=0, after 5 ticks each agent is sampled 1-2 times.
      for (let i = 0; i < 5; i++) {
        engine.tick();
      }

      const acAfter = graph.getRelationship('a', 'c').strength;
      const adAfter = graph.getRelationship('a', 'd').strength;

      // A-C should be strengthened by triadic closure
      // Closure delta per sampling: 0.002 * min(ab, bc) * (1 - ac) ≈ 0.002 * 0.6 * 0.7 = 0.00084
      expect(acAfter).toBeGreaterThan(acBefore);

      // A-D has no common friend → not strengthened by triadic closure
      // (may have slight change from natural encounter, but triadic closure contributes 0)
      expect(adAfter).toBeCloseTo(adBefore, 3);
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // Test 2: Dunbar Layer Differentiation
  // ═══════════════════════════════════════════════════════════════

  describe('Dunbar layer differentiation', () => {
    it('pre-seeded relationship produces at least 2 distinct Dunbar tiers', () => {
      const engine = new AndyEngine({
        seed: 'd6-dunbar-layers',
        enableFacts: true,
        startTime: new Date('2024-01-15T08:00:00'),
      });

      engine.createCharacter({ id: 'a', name: 'Alice', mbti: 'ENFP', schedule: 'student' });
      engine.createCharacter({ id: 'b', name: 'Bob', mbti: 'INFP', schedule: 'student' });
      engine.createCharacter({ id: 'c', name: 'Carol', mbti: 'ISTJ', schedule: 'student' });

      const graph = engine.world.socialGraph;

      // A-B: many positive interactions → at least acquaintance
      seedRelationship(graph, 'a', 'b', 0.45);

      // A-C: no seeding → stays stranger (initialStrength 0.08)
      // Just ensure the edge exists
      graph.getOrCreateRelationship('a', 'c');

      const relAB = graph.getRelationship('a', 'b');
      const relAC = graph.getRelationship('a', 'c');

      // A-B should be at least acquaintance
      expect(['acquaintance', 'friend', 'closeFriend']).toContain(relAB.type);

      // A-C should be stranger
      expect(relAC.type).toBe('stranger');

      // At least 2 distinct Dunbar tiers
      const tiers = new Set([relAB.type, relAC.type]);
      expect(tiers.size).toBeGreaterThanOrEqual(2);
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // Test 3: Social Graph Serialization Fidelity
  // ═══════════════════════════════════════════════════════════════

  describe('Social graph serialization fidelity', () => {
    it('roundtrip preserves relationship structure after continued ticks', () => {
      const engine = new AndyEngine({
        seed: 'd6-serialization-fidelity',
        enableFacts: true,
        startTime: new Date('2024-01-15T08:00:00'),
      });

      engine.createCharacter({ id: 'a', name: 'Alice', mbti: 'ENFP', schedule: 'student' });
      engine.createCharacter({ id: 'b', name: 'Bob', mbti: 'INFP', schedule: 'student' });
      engine.createCharacter({ id: 'c', name: 'Carol', mbti: 'ISTJ', schedule: 'student' });
      engine.createCharacter({ id: 'd', name: 'Dave', mbti: 'ESTJ', schedule: 'student' });

      const graph = engine.world.socialGraph;

      // Pre-seed same structure as triadic closure test
      seedRelationship(graph, 'a', 'b', 0.6);
      seedRelationship(graph, 'b', 'c', 0.6);
      seedRelationship(graph, 'a', 'c', 0.3);

      // Run 200 ticks to develop the social graph
      for (let i = 0; i < 200; i++) {
        engine.tick();
      }

      // Capture post-development edge snapshot (edges may have grown from encounters)
      const graphJSON = graph.toJSON();
      // R9: SocialGraph.toJSON() now returns {edges, _tickCount}
      const edgesBeforeSave = graphJSON.edges || graphJSON;
      const edgeCountBeforeSave = edgesBeforeSave.length;

      // Build a lookup for pre-serialization edge strengths
      const strengthsBeforeSave = new Map();
      for (const edge of edgesBeforeSave) {
        const key = [edge.agentA, edge.agentB].sort().join(':');
        strengthsBeforeSave.set(key, edge.strength);
      }

      // Serialize to world state
      const worldState = toWorldState(engine, 'world_d6_fidelity');

      // Restore into a new engine
      const restoredEngine = fromWorldState(worldState, {}, AndyEngine);

      // Verify restored graph immediately matches pre-serialization structure
      const restoredGraph = restoredEngine.world.socialGraph;
      const restoredEdgesJSON = restoredGraph.toJSON();
      // R9: SocialGraph.toJSON() now returns {edges, _tickCount}
      const restoredEdges = restoredEdgesJSON.edges || restoredEdgesJSON;
      expect(restoredEdges.length).toBe(edgeCountBeforeSave);

      // Verify each pre-serialization edge exists in restored graph
      for (const [key, strengthBefore] of strengthsBeforeSave) {
        const [id1, id2] = key.split(':');
        const restoredRel = restoredGraph.getRelationship(id1, id2);
        expect(restoredRel).toBeDefined();
        // Restored strength should match closely (serialization fidelity)
        expect(Math.abs(restoredRel.strength - strengthBefore)).toBeLessThan(0.01);
      }

      // Verify agent IDs preserved
      const restoredAgentIds = new Set(restoredGraph.getAllAgentIds());
      expect(restoredAgentIds.has('a')).toBe(true);
      expect(restoredAgentIds.has('b')).toBe(true);
      expect(restoredAgentIds.has('c')).toBe(true);
      expect(restoredAgentIds.has('d')).toBe(true);

      // Continue for 50 more ticks in restored engine
      for (let i = 0; i < 50; i++) {
        restoredEngine.tick();
      }

      // Post-continuation: edges still valid, strengths in [0,1]
      const postEdgesJSON = restoredGraph.toJSON();
      const postEdges = postEdgesJSON.edges || postEdgesJSON;
      for (const edge of postEdges) {
        expect(edge.strength).toBeGreaterThanOrEqual(0);
        expect(edge.strength).toBeLessThanOrEqual(1);
      }
    });
  });
});
