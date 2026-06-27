/**
 * Epistemic Evidence Matrix E2E Test (W3)
 *
 * Comprehensive E2E verification of the 5 evidence types:
 *   direct(1.0), observed(0.9), overheard(0.7), told(0.6), inferred(0.5)
 *
 * Plus AGENT_STATE privacy guard and scope-aware told propagation.
 * Uses CanonEventPipeline, WorldFactStore, KnowledgeStore, FactProvider
 * to verify end-to-end knowledge propagation.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { WorldFactStore, KnowledgeStore, FactEmitter, CanonEventPipeline, FactProvider, FactScope, FactType, createAgentStateFact } from '../../facts/index.js';

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
    id: `evt_w3_${eventCounter++}`,
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

describe('Epistemic Evidence Matrix E2E', () => {
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
  // Test 1: 3-agent pipeline: direct/observed/overheard
  // ═══════════════════════════════════════════

  it('3-agent pipeline: Alice participant→direct, Bob observer→observed, Charlie same-location→overheard', () => {
    const agents = makeAgents({
      alice: '图书馆',
      bob: '图书馆',
      charlie: '图书馆',
    });

    const event = makeEvent({
      type: 'encounter',
      content: 'Alice presented research, Bob watched, Charlie was nearby',
      location: '图书馆',
      scope: FactScope.PUBLIC,
      participants: ['alice'],
      observers: ['bob'],
    });

    const result = pipeline.processEvent(event, agents);
    const factId = result.fact.id;

    // Alice: participant → direct(1.0)
    expect(knowledgeStore.hasKnowledge('alice', factId)).toBe(true);
    expect(knowledgeStore.getSource('alice', factId)).toBe('direct');
    expect(knowledgeStore.getEvidence('alice', factId).confidence).toBe(1.0);

    // Bob: observer → observed(0.9)
    expect(knowledgeStore.hasKnowledge('bob', factId)).toBe(true);
    expect(knowledgeStore.getSource('bob', factId)).toBe('observed');
    expect(knowledgeStore.getEvidence('bob', factId).confidence).toBe(0.9);

    // Charlie: same location → overheard(0.7)
    expect(knowledgeStore.hasKnowledge('charlie', factId)).toBe(true);
    expect(knowledgeStore.getSource('charlie', factId)).toBe('overheard');
    expect(knowledgeStore.getEvidence('charlie', factId).confidence).toBe(0.7);
  });

  // ═══════════════════════════════════════════
  // Test 2: Social event: told propagation
  // ═══════════════════════════════════════════

  it('social event: Bob learns one of Alice\'s facts via told', () => {
    // Alice at 图书馆, Bob at 食堂 (different location to avoid overheard)
    const agents = makeAgents({
      alice: '图书馆',
      bob: '食堂',
    });

    // Seed: Alice learns a fact via direct participation
    const seedEvent = makeEvent({
      type: 'discovery',
      content: 'Alice found a rare book',
      location: '图书馆',
      scope: FactScope.PUBLIC,
      participants: ['alice'],
      observers: [],
    });
    const seedResult = pipeline.processEvent(seedEvent, agents);
    const seedFactId = seedResult.fact.id;

    // Alice knows the fact via direct
    expect(knowledgeStore.hasKnowledge('alice', seedFactId)).toBe(true);
    expect(knowledgeStore.getSource('alice', seedFactId)).toBe('direct');

    // Bob does NOT know yet (different location)
    expect(knowledgeStore.hasKnowledge('bob', seedFactId)).toBe(false);

    // Social event between Alice and Bob
    const socialEvent = makeEvent({
      type: 'social',
      content: 'Alice and Bob had lunch together',
      location: '食堂',
      scope: FactScope.PUBLIC,
      participants: ['alice', 'bob'],
      observers: [],
    });

    // Move Alice to 食堂 for the social event
    agents.get('alice').position = '食堂';
    pipeline.processEvent(socialEvent, agents);

    // Bob now knows Alice's fact via told
    expect(knowledgeStore.hasKnowledge('bob', seedFactId)).toBe(true);
    expect(knowledgeStore.getSource('bob', seedFactId)).toBe('told');
    expect(knowledgeStore.getEvidence('bob', seedFactId).confidence).toBe(0.6);
    expect(knowledgeStore.getEvidence('bob', seedFactId).propagatedFrom).toBe('alice');
  });

  // ═══════════════════════════════════════════
  // Test 3: Same-location inference: inferred
  // ═══════════════════════════════════════════

  it('same-location agent gets overheard first; removing it then _propagateInferred yields inferred', () => {
    const agents = makeAgents({
      alice: '图书馆',
      dave: '图书馆',
    });

    const event = makeEvent({
      type: 'lecture',
      content: 'Alice gave a lecture',
      location: '图书馆',
      scope: FactScope.PUBLIC,
      participants: ['alice'],
      observers: [],
    });

    const result = pipeline.processEvent(event, agents);
    const factId = result.fact.id;

    // Dave at same location gets overheard(0.7) by default
    expect(knowledgeStore.hasKnowledge('dave', factId)).toBe(true);
    expect(knowledgeStore.getSource('dave', factId)).toBe('overheard');
    expect(knowledgeStore.getEvidence('dave', factId).confidence).toBe(0.7);

    // Remove Dave's knowledge and call _propagateInferred to test inferred
    knowledgeStore.removeKnowledge('dave', factId);
    expect(knowledgeStore.hasKnowledge('dave', factId)).toBe(false);

    const inferredUpdates = pipeline._propagateInferred(result.fact, agents);
    expect(inferredUpdates.length).toBe(1);
    expect(inferredUpdates[0].source).toBe('inferred');

    // Dave now knows via inferred(0.5)
    expect(knowledgeStore.hasKnowledge('dave', factId)).toBe(true);
    expect(knowledgeStore.getSource('dave', factId)).toBe('inferred');
    expect(knowledgeStore.getEvidence('dave', factId).confidence).toBe(0.5);
  });

  // ═══════════════════════════════════════════
  // Test 4: All 5 evidence types in one scenario
  // ═══════════════════════════════════════════

  it('4-agent scenario producing direct, observed, overheard, told, and inferred simultaneously', () => {
    const agents = makeAgents({
      alice: '图书馆',
      bob: '图书馆',
      charlie: '图书馆',
      dave: '图书馆',
    });

    // Step 1: Seed Alice with a fact via direct participation
    const seedEvent = makeEvent({
      type: 'discovery',
      content: 'Alice discovered a hidden passage',
      location: '图书馆',
      scope: FactScope.PUBLIC,
      participants: ['alice'],
      observers: [],
    });
    const seedResult = pipeline.processEvent(seedEvent, agents);
    const seedFactId = seedResult.fact.id;

    // Alice: direct on seed fact
    expect(knowledgeStore.getSource('alice', seedFactId)).toBe('direct');

    // Step 2: An event where Alice participates, Bob observes, Charlie overhears
    const mainEvent = makeEvent({
      type: 'announcement',
      content: 'Alice announced her discovery',
      location: '图书馆',
      scope: FactScope.PUBLIC,
      participants: ['alice'],
      observers: ['bob'],
    });
    const mainResult = pipeline.processEvent(mainEvent, agents);
    const mainFactId = mainResult.fact.id;

    // direct: Alice (participant)
    expect(knowledgeStore.getSource('alice', mainFactId)).toBe('direct');
    expect(knowledgeStore.getEvidence('alice', mainFactId).confidence).toBe(1.0);

    // observed: Bob (observer)
    expect(knowledgeStore.getSource('bob', mainFactId)).toBe('observed');
    expect(knowledgeStore.getEvidence('bob', mainFactId).confidence).toBe(0.9);

    // overheard: Charlie (same location, not participant/observer)
    expect(knowledgeStore.getSource('charlie', mainFactId)).toBe('overheard');
    expect(knowledgeStore.getEvidence('charlie', mainFactId).confidence).toBe(0.7);

    // Step 3: Remove Dave's knowledge and use inferred as safety net
    // Dave is at same location so he would have gotten overheard.
    // Remove it and re-infer to get inferred(0.5)
    expect(knowledgeStore.getSource('dave', mainFactId)).toBe('overheard');
    knowledgeStore.removeKnowledge('dave', mainFactId);
    const inferredUpdates = pipeline._propagateInferred(mainResult.fact, agents);
    expect(inferredUpdates.length).toBe(1);
    expect(knowledgeStore.getSource('dave', mainFactId)).toBe('inferred');
    expect(knowledgeStore.getEvidence('dave', mainFactId).confidence).toBe(0.5);

    // Step 4: told - Social event between Alice and someone new
    // Add Eve at a different location
    agents.set('eve', makeAgent('eve', '食堂'));

    const socialEvent = makeEvent({
      type: 'social',
      content: 'Alice and Eve met at the cafeteria',
      location: '食堂',
      scope: FactScope.PUBLIC,
      participants: ['alice', 'eve'],
      observers: [],
    });

    // Move Alice to cafeteria
    agents.get('alice').position = '食堂';
    pipeline.processEvent(socialEvent, agents);

    // Eve learns the seed fact via told from Alice
    expect(knowledgeStore.hasKnowledge('eve', seedFactId)).toBe(true);
    expect(knowledgeStore.getSource('eve', seedFactId)).toBe('told');
    expect(knowledgeStore.getEvidence('eve', seedFactId).confidence).toBe(0.6);
    expect(knowledgeStore.getEvidence('eve', seedFactId).propagatedFrom).toBe('alice');

    // Verify all 5 evidence types are present in the scenario
    const allEvidence = [];
    for (const agentId of ['alice', 'bob', 'charlie', 'dave', 'eve']) {
      const factIds = knowledgeStore.getKnownFactIds(agentId);
      for (const fid of factIds) {
        const ev = knowledgeStore.getEvidence(agentId, fid);
        if (ev) allEvidence.push(ev.source);
      }
    }
    expect(allEvidence).toContain('direct');
    expect(allEvidence).toContain('observed');
    expect(allEvidence).toContain('overheard');
    expect(allEvidence).toContain('inferred');
    expect(allEvidence).toContain('told');
  });

  // ═══════════════════════════════════════════
  // Test 5: False positive — agent should NOT know a LOCAL fact
  // ═══════════════════════════════════════════

  it('false positive: agent at different location does NOT know a LOCAL-scope fact', () => {
    const agents = makeAgents({
      alice: '图书馆',
      dave: '食堂',
    });

    // LOCAL scope event: only participants and observers should know
    const event = makeEvent({
      type: 'study',
      content: 'Alice studied for the exam privately',
      location: '图书馆',
      scope: FactScope.LOCAL,
      participants: ['alice'],
      observers: [],
    });

    const result = pipeline.processEvent(event, agents);
    const factId = result.fact.id;

    // Alice knows (participant → direct)
    expect(knowledgeStore.hasKnowledge('alice', factId)).toBe(true);
    expect(knowledgeStore.getSource('alice', factId)).toBe('direct');

    // Dave at 食堂 does NOT know (neither KnowledgeStore nor FactProvider gives access)
    expect(knowledgeStore.hasKnowledge('dave', factId)).toBe(false);

    // Also verify via FactProvider
    const provider = new FactProvider(factStore, null, new Map(), knowledgeStore);
    const daveGrounding = provider.getGroundingPackage('dave');
    const daveKnows = daveGrounding.allowedFacts.some(f => f.id === factId);
    expect(daveKnows).toBe(false);
  });

  // ═══════════════════════════════════════════
  // Test 6: False negative — agent SHOULD know via overheard
  // ═══════════════════════════════════════════

  it('false negative: agent at same location DOES know via overheard', () => {
    const agents = makeAgents({
      alice: '图书馆',
      charlie: '图书馆',
    });

    const event = makeEvent({
      type: 'debate',
      content: 'Alice debated a philosophical point',
      location: '图书馆',
      scope: FactScope.PUBLIC,
      participants: ['alice'],
      observers: [],
    });

    const result = pipeline.processEvent(event, agents);
    const factId = result.fact.id;

    // Charlie at same location MUST know via overheard
    expect(knowledgeStore.hasKnowledge('charlie', factId)).toBe(true);
    expect(knowledgeStore.getSource('charlie', factId)).toBe('overheard');
    expect(knowledgeStore.getEvidence('charlie', factId).confidence).toBe(0.7);

    // Also verify via FactProvider
    const provider = new FactProvider(factStore, null, new Map(), knowledgeStore);
    const charlieGrounding = provider.getGroundingPackage('charlie');
    const charlieKnows = charlieGrounding.allowedFacts.some(f => f.id === factId);
    expect(charlieKnows).toBe(true);
  });

  // ═══════════════════════════════════════════
  // Test 7: AGENT_STATE privacy — bob cannot see alice's state
  // ═══════════════════════════════════════════

  it('AGENT_STATE: bob cannot see alice\'s state via getFactsForAgent', () => {
    // Create an AGENT_STATE fact for alice
    const aliceStateFact = createAgentStateFact({
      agentId: 'alice',
      state: 'studying',
      region: '图书馆',
      timestamp: new Date('2024-06-15T12:00:00Z'),
      source: 'engine',
      confidence: 1.0,
      scope: FactScope.PUBLIC,
      participants: ['alice'],
    });
    factStore.addFact(aliceStateFact);

    // Bob should NOT see Alice's AGENT_STATE
    const factsForBob = factStore.getFactsForAgent('bob');
    const bobSeesAliceState = factsForBob.some(
      f => f.type === FactType.AGENT_STATE && f.agentId === 'alice'
    );
    expect(bobSeesAliceState).toBe(false);
  });

  // ═══════════════════════════════════════════
  // Test 8: AGENT_STATE privacy — alice can see her own state
  // ═══════════════════════════════════════════

  it('AGENT_STATE: alice can see her own state via getFactsForAgent', () => {
    const aliceStateFact = createAgentStateFact({
      agentId: 'alice',
      state: 'studying',
      region: '图书馆',
      timestamp: new Date('2024-06-15T12:00:00Z'),
      source: 'engine',
      confidence: 1.0,
      scope: FactScope.PUBLIC,
      participants: ['alice'],
    });
    factStore.addFact(aliceStateFact);

    // Alice SHOULD see her own AGENT_STATE
    const factsForAlice = factStore.getFactsForAgent('alice');
    const aliceSeesOwnState = factsForAlice.some(
      f => f.type === FactType.AGENT_STATE && f.agentId === 'alice'
    );
    expect(aliceSeesOwnState).toBe(true);
  });

  // ═══════════════════════════════════════════
  // Test 9: Priority — overheard not downgraded to inferred
  // ═══════════════════════════════════════════

  it('priority: same-location agent gets overheard(0.7), NOT inferred(0.5)', () => {
    const agents = makeAgents({
      alice: '图书馆',
      charlie: '图书馆',
    });

    const event = makeEvent({
      type: 'presentation',
      content: 'Alice gave a presentation',
      location: '图书馆',
      scope: FactScope.PUBLIC,
      participants: ['alice'],
      observers: [],
    });

    const result = pipeline.processEvent(event, agents);
    const factId = result.fact.id;

    // Charlie gets overheard(0.7), not inferred(0.5)
    const evidence = knowledgeStore.getEvidence('charlie', factId);
    expect(evidence).toBeDefined();
    expect(evidence.source).toBe('overheard');
    expect(evidence.confidence).toBe(0.7);

    // Inferred safety net should NOT override existing overheard
    const inferredUpdates = pipeline._propagateInferred(result.fact, agents);
    expect(inferredUpdates.length).toBe(0);

    // Source remains overheard after inferred check
    expect(knowledgeStore.getSource('charlie', factId)).toBe('overheard');
    expect(knowledgeStore.getEvidence('charlie', factId).confidence).toBe(0.7);
  });

  // ═══════════════════════════════════════════
  // Test 10: told does not leak LOCAL scope facts
  // ═══════════════════════════════════════════

  it('told does not leak LOCAL scope facts — only PUBLIC facts propagate', () => {
    const agents = makeAgents({
      alice: '图书馆',
      bob: '食堂',
    });

    // Alice participates in a LOCAL scope event
    const localEvent = makeEvent({
      type: 'private_moment',
      content: 'Alice had a private thought',
      location: '图书馆',
      scope: FactScope.LOCAL,
      participants: ['alice'],
      observers: [],
    });
    const localResult = pipeline.processEvent(localEvent, agents);
    const localFactId = localResult.fact.id;

    // Alice also participates in a PUBLIC scope event
    const publicEvent = makeEvent({
      type: 'announcement',
      content: 'Alice made a public announcement',
      location: '图书馆',
      scope: FactScope.PUBLIC,
      participants: ['alice'],
      observers: [],
    });
    const publicResult = pipeline.processEvent(publicEvent, agents);
    const publicFactId = publicResult.fact.id;

    // Alice knows both facts
    expect(knowledgeStore.hasKnowledge('alice', localFactId)).toBe(true);
    expect(knowledgeStore.hasKnowledge('alice', publicFactId)).toBe(true);

    // Bob knows neither yet
    expect(knowledgeStore.hasKnowledge('bob', localFactId)).toBe(false);
    expect(knowledgeStore.hasKnowledge('bob', publicFactId)).toBe(false);

    // Social event between Alice and Bob
    agents.get('alice').position = '食堂';
    const socialEvent = makeEvent({
      type: 'social',
      content: 'Alice and Bob chatted at the cafeteria',
      location: '食堂',
      scope: FactScope.PUBLIC,
      participants: ['alice', 'bob'],
      observers: [],
    });
    pipeline.processEvent(socialEvent, agents);

    // Bob learns the PUBLIC fact via told
    expect(knowledgeStore.hasKnowledge('bob', publicFactId)).toBe(true);
    expect(knowledgeStore.getSource('bob', publicFactId)).toBe('told');

    // Bob does NOT learn the LOCAL fact
    expect(knowledgeStore.hasKnowledge('bob', localFactId)).toBe(false);
  });
});
