/**
 * Gossip Propagation E2E Test (W2)
 *
 * Verifies two critical social emergence capabilities:
 *   1. Told knowledge 2-hop propagation (A→B→C via CanonEventPipeline)
 *   2. Evidence guard — told evidence does NOT justify AGENT_STATE expression
 *
 * Deterministic-by-construction:
 *   - Uses CanonEventPipeline/KnowledgeStore directly (no 35% random EventDispatcher)
 *   - Manual event dispatch, zero tolerance for CI flaky
 *   - Seed identifiers for traceability only (no RNG consumed)
 *
 * Key design constraint:
 *   _tryToldPropagation propagates at most 1 fact per direction (first unknown).
 *   Test 1 uses overheard to ensure Carol already knows the social event fact,
 *   so the seed fact is the first unknown and gets propagated.
 *   Test 2 uses a 3-agent chain (Carol never meets Bob) so Carol is never
 *   physically present with Bob — required for evidence guard to trigger.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  WorldFactStore,
  KnowledgeStore,
  FactEmitter,
  CanonEventPipeline,
  FactProvider,
  FactConsistencyChecker,
  FactScope,
  FactType,
} from '../../facts/index.js';

// ═══════════════════════════════════════════
// 辅助工厂
// ═══════════════════════════════════════════

function makeAgent(id, position = '图书馆') {
  return {
    id,
    name: id,
    position,
    emotion: { current: { joy: 0.3, sadness: 0.1 } },
    memory: {
      memories: [],
      addExperience(memory, emotionState) {
        this.memories.push({ ...memory, emotionState, timestamp: new Date() });
      },
    },
  };
}

function makeAgents(positions = {}) {
  const agents = new Map();
  for (const [id, position] of Object.entries(positions)) {
    agents.set(id, makeAgent(id, position));
  }
  return agents;
}

let eventCounter = 0;
function makeEvent(overrides = {}) {
  return {
    id: `evt_w2_${eventCounter++}`,
    type: 'encounter',
    content: 'test event',
    location: '图书馆',
    scope: FactScope.PUBLIC,
    participants: [],
    observers: [],
    time: new Date('2024-06-15T12:00:00Z'),
    ...overrides,
  };
}

describe('Gossip Propagation E2E', () => {
  let factStore;
  let knowledgeStore;
  let factEmitter;
  let pipeline;

  beforeEach(() => {
    factStore = new WorldFactStore();
    knowledgeStore = new KnowledgeStore(factStore);
    factEmitter = new FactEmitter(factStore, { knowledgeStore });
    pipeline = new CanonEventPipeline(factStore, knowledgeStore, factEmitter);
    eventCounter = 0;
  });

  // ═══════════════════════════════════════════
  // Test 1: Told knowledge 2-hop propagation (A→B→C)
  //
  // Seed: 'd6-gossip-2hop' (traceability only, no RNG consumed)
  //
  // Setup: Carol at same location as social event 1 → overheard ensures
  // Carol already knows the social event fact before event 2, so the seed
  // fact is the first unknown and gets propagated in the 2nd hop.
  //
  // Step 1: Alice discovery at 体育馆 → Alice gets seed fact (direct)
  // Step 2: Social Alice-Bob at 食堂 → Bob gets seed fact (told from Alice)
  //         Carol at 食堂 gets social event fact (overheard)
  // Step 3: Social Bob-Carol at 图书馆 → Carol gets seed fact (told from Bob)
  //
  // Deterministic: no random gossip, all propagation via CanonEventPipeline told mechanism.
  // ═══════════════════════════════════════════

  it('told knowledge propagates 2 hops: Alice→Bob→Carol via independent social events', () => {
    // Carol at 食堂 to overhear social event 1 (ensures seed fact is 1st unknown in hop 2)
    const agents = makeAgents({
      alice: '体育馆',
      bob: '食堂',
      carol: '食堂',
    });

    // ── Step 1: Alice participates in a discovery event ──
    const seedEvent = makeEvent({
      type: 'discovery',
      content: 'Alice found a mysterious notebook',
      location: '体育馆',
      scope: FactScope.PUBLIC,
      participants: ['alice'],
      observers: [],
    });
    const seedResult = pipeline.processEvent(seedEvent, agents);
    const seedFactId = seedResult.fact.id;

    // Alice knows the seed fact via direct participation
    expect(knowledgeStore.hasKnowledge('alice', seedFactId)).toBe(true);
    expect(knowledgeStore.getSource('alice', seedFactId)).toBe('direct');
    expect(knowledgeStore.getEvidence('alice', seedFactId).confidence).toBe(1.0);

    // Bob and Carol do NOT know the seed fact yet
    expect(knowledgeStore.hasKnowledge('bob', seedFactId)).toBe(false);
    expect(knowledgeStore.hasKnowledge('carol', seedFactId)).toBe(false);

    // ── Step 2: Social event Alice-Bob at 食堂 ──
    agents.get('alice').position = '食堂';
    const socialEvent1 = makeEvent({
      type: 'social',
      content: 'Alice and Bob had lunch together',
      location: '食堂',
      scope: FactScope.PUBLIC,
      participants: ['alice', 'bob'],
      observers: [],
    });
    pipeline.processEvent(socialEvent1, agents);

    // Bob now knows the seed fact via told (1-hop)
    expect(knowledgeStore.hasKnowledge('bob', seedFactId)).toBe(true);
    expect(knowledgeStore.getSource('bob', seedFactId)).toBe('told');
    expect(knowledgeStore.getEvidence('bob', seedFactId).confidence).toBe(0.6);
    expect(knowledgeStore.getEvidence('bob', seedFactId).propagatedFrom).toBe('alice');

    // Carol overheard the social event (same location) — this is critical:
    // it ensures Carol already knows the social event fact, so in Step 3
    // the seed fact is the first unknown fact Bob can tell Carol.
    const socialFact1Id = pipeline.processEvent(makeEvent({
      type: 'social', content: 'dummy', location: '食堂',
      participants: ['alice', 'bob'],
    }), agents).fact?.id;  // may return existing fact
    // Carol has overheard knowledge of the social event at 食堂
    const carolKnownFacts = [...knowledgeStore.getKnownFactIds('carol')];
    expect(carolKnownFacts.length).toBeGreaterThanOrEqual(1);

    // Carol does NOT know the seed fact yet (2-hop not complete)
    expect(knowledgeStore.hasKnowledge('carol', seedFactId)).toBe(false);

    // ── Step 3: Social event Bob-Carol at 图书馆 ──
    agents.get('bob').position = '图书馆';
    agents.get('carol').position = '图书馆';
    const socialEvent2 = makeEvent({
      type: 'social',
      content: 'Bob and Carol chatted at the library',
      location: '图书馆',
      scope: FactScope.PUBLIC,
      participants: ['bob', 'carol'],
      observers: [],
    });
    pipeline.processEvent(socialEvent2, agents);

    // Carol now knows the seed fact via told (2-hop: Alice→Bob→Carol)
    expect(knowledgeStore.hasKnowledge('carol', seedFactId)).toBe(true);
    expect(knowledgeStore.getSource('carol', seedFactId)).toBe('told');
    expect(knowledgeStore.getEvidence('carol', seedFactId).confidence).toBe(0.6);
    // Carol's told evidence comes from Bob (the direct teller), not Alice
    expect(knowledgeStore.getEvidence('carol', seedFactId).propagatedFrom).toBe('bob');

    // Verify Bob's evidence is unchanged (still from Alice)
    expect(knowledgeStore.getEvidence('bob', seedFactId).propagatedFrom).toBe('alice');

    // Verify Alice's evidence is unchanged (still direct)
    expect(knowledgeStore.getEvidence('alice', seedFactId).source).toBe('direct');
  });

  // ═══════════════════════════════════════════
  // Test 2: Evidence guard — told does NOT justify AGENT_STATE expression
  //
  // Seed: 'd6-gossip-evidence-guard' (traceability only)
  //
  // 3-agent chain: Bob → Alice → Carol (Carol never meets Bob)
  // This ensures Carol is NEVER physically present with Bob, so
  // told EVENT evidence cannot justify Bob's emotion expression.
  //
  // Step 1: Bob meeting at 会议室 → Bob gets fact (direct)
  // Step 2: Social Bob-Alice at 食堂 → Alice gets Bob's fact (told from Bob)
  // Step 3: Social Alice-Carol at 图书馆 → Carol gets Bob-Alice social fact (told from Alice)
  // Step 4: Build Carol's grounding → check "bob很焦虑" → agent_state_leak
  //
  // v2.5-W3 two-tier evidence rule:
  //   told/informed EVENT does NOT justify any AGENT_STATE expression.
  //   Only narrator physically present (as participant/observer) justifies emotion/needs.
  // ═══════════════════════════════════════════

  it('told evidence does NOT justify expressing another agent\'s emotion — agent_state_leak violation', () => {
    // 3 agents at distinct locations; Carol never meets Bob
    const agents = makeAgents({
      bob: '会议室',
      alice: '食堂',
      carol: '图书馆',
    });

    // ── Step 1: Bob participates in a meeting ──
    const bobEvent = makeEvent({
      type: 'meeting',
      content: 'Bob attended an important meeting',
      location: '会议室',
      scope: FactScope.PUBLIC,
      participants: ['bob'],
      observers: [],
    });
    const bobResult = pipeline.processEvent(bobEvent, agents);
    const bobFactId = bobResult.fact.id;

    // Bob knows his event via direct
    expect(knowledgeStore.hasKnowledge('bob', bobFactId)).toBe(true);
    expect(knowledgeStore.getSource('bob', bobFactId)).toBe('direct');

    // Alice and Carol do NOT know yet
    expect(knowledgeStore.hasKnowledge('alice', bobFactId)).toBe(false);
    expect(knowledgeStore.hasKnowledge('carol', bobFactId)).toBe(false);

    // ── Step 2: Social Bob-Alice at 食堂 ──
    agents.get('bob').position = '食堂';
    const socialEvent1 = makeEvent({
      type: 'social',
      content: 'Bob and Alice had lunch together',
      location: '食堂',
      scope: FactScope.PUBLIC,
      participants: ['bob', 'alice'],
      observers: [],
    });
    pipeline.processEvent(socialEvent1, agents);

    // Alice now knows Bob's meeting fact via told (1-hop)
    expect(knowledgeStore.hasKnowledge('alice', bobFactId)).toBe(true);
    expect(knowledgeStore.getSource('alice', bobFactId)).toBe('told');
    expect(knowledgeStore.getEvidence('alice', bobFactId).propagatedFrom).toBe('bob');

    // Carol still does NOT know (different location, no social contact)
    expect(knowledgeStore.hasKnowledge('carol', bobFactId)).toBe(false);

    // ── Step 3: Social Alice-Carol at 图书馆 ──
    agents.get('alice').position = '图书馆';
    const socialEvent2 = makeEvent({
      type: 'social',
      content: 'Alice and Carol chatted at the library',
      location: '图书馆',
      scope: FactScope.PUBLIC,
      participants: ['alice', 'carol'],
      observers: [],
    });
    pipeline.processEvent(socialEvent2, agents);

    // Carol now has told knowledge about an event involving Bob.
    // Note: _tryToldPropagation propagates at most 1 fact per direction,
    // and it picks the first unknown fact. Carol gets the social event
    // between Bob and Alice (which has Bob as participant), NOT Bob's
    // original meeting. But this is sufficient for the evidence guard test:
    // Carol has a told EVENT fact with Bob as participant, and she was
    // never physically present with Bob.
    const carolKnownFacts = [...knowledgeStore.getKnownFactIds('carol')];
    expect(carolKnownFacts.length).toBeGreaterThanOrEqual(1);

    // Find a told fact that has Bob as participant
    let toldBobFactId = null;
    for (const fid of carolKnownFacts) {
      const evidence = knowledgeStore.getEvidence('carol', fid);
      const fact = factStore.getFactById(fid);
      if (evidence && evidence.source === 'told' &&
          fact && fact.participants && fact.participants.includes('bob')) {
        toldBobFactId = fid;
        break;
      }
    }
    expect(toldBobFactId).not.toBeNull();

    // Verify the told evidence structure
    const carolEvidence = knowledgeStore.getEvidence('carol', toldBobFactId);
    expect(carolEvidence.source).toBe('told');
    expect(carolEvidence.propagatedFrom).toBe('alice');
    expect(carolEvidence.confidence).toBe(0.6);

    // ── Step 4: Build Carol's grounding package with FactProvider ──
    const factProvider = new FactProvider(factStore, null, new Map(), knowledgeStore);
    const carolGrounding = factProvider.getGroundingPackage('carol');

    // Verify Carol's grounding contains the told Bob fact with evidence annotation
    const toldBobFactInGrounding = carolGrounding.allowedFacts.find(f => f.id === toldBobFactId);
    expect(toldBobFactInGrounding).toBeDefined();
    expect(toldBobFactInGrounding._evidence).toBeDefined();
    expect(toldBobFactInGrounding._evidence.source).toBe('told');
    expect(toldBobFactInGrounding._evidence.propagatedFrom).toBe('alice');
    expect(toldBobFactInGrounding.participants).toContain('bob');

    // ── Step 5: FactConsistencyChecker should flag agent_state_leak ──
    const checker = new FactConsistencyChecker(factStore, {
      regions: ['会议室', '食堂', '图书馆'],
    });

    // Carol expresses Bob's emotion — she only has told knowledge, was never
    // physically present with Bob. Told EVENT does NOT justify emotion/needs
    // expression (v2.5-W3 two-tier rule).
    const llmOutput = 'bob很焦虑。';
    const result = checker.check(llmOutput, carolGrounding);

    // Must find agent_state_leak violation
    expect(result.valid).toBe(false);
    expect(result.violations.some(v => v.type === 'agent_state_leak')).toBe(true);

    const leakViolation = result.violations.find(v => v.type === 'agent_state_leak');
    expect(leakViolation.agent).toBe('bob');
    expect(leakViolation.stateType).toBe('emotion');

    // ── Negative control: Carol CAN express her own emotion ──
    const selfOutput = '我很开心。';
    const selfResult = checker.check(selfOutput, carolGrounding);
    expect(selfResult.violations.some(v => v.type === 'agent_state_leak')).toBe(false);

    // ── Negative control: Carol CAN express Bob's visible activity with told ──
    // told EVENT justifies activity (visible behavior) but NOT emotion/needs
    const activityOutput = 'bob正在开会。';
    const activityResult = checker.check(activityOutput, carolGrounding);
    // Activity should NOT trigger agent_state_leak (told justifies visible activity)
    expect(activityResult.violations.some(v => v.type === 'agent_state_leak')).toBe(false);
  });
});
