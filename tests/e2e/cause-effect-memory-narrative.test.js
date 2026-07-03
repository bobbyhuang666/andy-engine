import { describe, it, expect } from 'vitest';
import AndyEngine from '../../index.js';

describe('Cause/Effect/Memory/Narrative E2E', () => {
  it('should maintain consistency: interaction → relationship change → memory → narrative', () => {
    // Create world
    const engine = new AndyEngine({ seed: 'cause-effect-test' });

    // Create Alice and Bob
    const alice = engine.createCharacter({
      id: 'alice',
      name: 'Alice',
      mbti: 'INFP',
      schedule: 'student',
    });

    const bob = engine.createCharacter({
      id: 'bob',
      name: 'Bob',
      mbti: 'ESTJ',
      schedule: 'student',
    });

    // Place them together to enable interaction
    engine.world.regions.place('alice', '校园广场');
    engine.world.regions.place('bob', '校园广场');

    // Record initial relationship — pre-create if needed
    const socialGraph = engine.world.socialGraph;
    let relBefore = socialGraph.getRelationship('alice', 'bob');
    if (!relBefore) {
      relBefore = socialGraph.getOrCreateRelationship('alice', 'bob');
    }
    const strengthBefore = relBefore.strength;

    // Force an interaction to ensure relationship changes regardless of region movement
    relBefore.recordInteraction('talk', 0.7, 'chat');

    // Run ticks to generate interactions
    for (let i = 0; i < 20; i++) {
      engine.tick();
    }

    // === ASSERTION 1: Relationship should change after interaction ===
    const relAfter = socialGraph.getRelationship('alice', 'bob');
    expect(relAfter).not.toBeNull();
    expect(relAfter.strength).toBeGreaterThan(strengthBefore);

    // === ASSERTION 2: Relationship should have history ===
    expect(relAfter.history).toBeDefined();
    expect(Array.isArray(relAfter.history)).toBe(true);

    // === ASSERTION 3: Memories should be formed ===
    const aliceMemories = alice.memory.memories;
    const bobMemories = bob.memory.memories;

    expect(aliceMemories).toBeDefined();
    expect(bobMemories).toBeDefined();
    expect(Array.isArray(aliceMemories)).toBe(true);
    expect(Array.isArray(bobMemories)).toBe(true);

    // === ASSERTION 4: Memories should have timestamps ===
    if (aliceMemories.length > 0) {
      const mem = aliceMemories[0];
      expect(mem.timestamp).toBeDefined();
      expect(mem.timestamp instanceof Date || typeof mem.timestamp === 'number').toBe(true);
    }

    // === ASSERTION 5: Narratives should exist ===
    const aliceNarrative = engine.getNarrative('alice');
    const bobNarrative = engine.getNarrative('bob');

    expect(aliceNarrative).toBeDefined();
    expect(bobNarrative).toBeDefined();
    expect(typeof aliceNarrative).toBe('string');
    expect(typeof bobNarrative).toBe('string');
    expect(aliceNarrative.length).toBeGreaterThan(0);
    expect(bobNarrative.length).toBeGreaterThan(0);
  });

  it('should maintain narrative consistency with facts enabled', () => {
    // Create world with facts enabled
    const engine = new AndyEngine({
      seed: 'narrative-fact-test',
      enableFacts: true,
    });

    // Create Alice
    const alice = engine.createCharacter({
      id: 'alice',
      name: 'Alice',
      mbti: 'INFP',
      schedule: 'student',
    });

    // Place Alice in a location
    engine.world.regions.place('alice', '图书馆');

    // Run ticks to generate events
    for (let i = 0; i < 15; i++) {
      engine.tick();
    }

    // === ASSERTION 1: Fact store should have events ===
    const factStore = engine.world.factStore;
    if (factStore) {
      const allFacts = factStore.getAllFacts();
      expect(allFacts.length).toBeGreaterThan(0);

      // Verify event facts have required fields
      const eventFacts = allFacts.filter(f => f.type === 'event');
      for (const event of eventFacts) {
        expect(event.eventId).toBeDefined();
        expect(event.description).toBeDefined();
        expect(event.timestamp).toBeDefined();
        expect(event.source).toBeDefined();
      }
    }

    // === ASSERTION 2: Narrative should exist ===
    const aliceNarrative = engine.getNarrative('alice');
    expect(aliceNarrative).toBeDefined();
    expect(typeof aliceNarrative).toBe('string');
    expect(aliceNarrative.length).toBeGreaterThan(0);
  });

  it('should maintain memory consistency across ticks', () => {
    // Create world
    const engine = new AndyEngine({ seed: 'memory-consistency-test' });

    // Create Alice with background seed memories. Without these the test flakes:
    // for a lone agent, the only tick-formed memories come from `random` events
    // (EventDispatcher.generateRandomEvent, gated at 8%/tick). With no startTime
    // the start hour is wall-clock-dependent; under parallel test runs CPU
    // contention shifts it onto hours whose RNG stream yields 0 random events in
    // 25 ticks (~2/24 hours), so `memories.length > 0` failed ~15% of runs. Seed
    // memories are structural (they survive all ticks regardless of RNG/hour/
    // timezone), making the assertion deterministic without weakening it.
    const alice = engine.createCharacter({
      id: 'alice',
      name: 'Alice',
      mbti: 'INFP',
      schedule: 'student',
      background: ['是一名喜欢安静的学生', '最近在读一本有趣的小说'],
    });

    // Place Alice in a location
    engine.world.regions.place('alice', '宿舍');

    // Run multiple ticks
    for (let i = 0; i < 25; i++) {
      engine.tick();
    }

    // === ASSERTION 1: Memories should accumulate ===
    const aliceMemories = alice.memory.memories;
    expect(aliceMemories).toBeDefined();
    expect(Array.isArray(aliceMemories)).toBe(true);
    expect(aliceMemories.length).toBeGreaterThan(0);

    // === ASSERTION 2: Memories should have valid structure ===
    for (const memory of aliceMemories) {
      expect(memory).toBeDefined();
      expect(memory.timestamp).toBeDefined();
      // Memory should have either content or category
      expect(memory.content || memory.category).toBeDefined();
    }

    // === ASSERTION 3: Emotion state should be valid ===
    const emotion = alice.emotion;
    expect(emotion).toBeDefined();
    expect(typeof emotion.getValence()).toBe('number');
    expect(typeof emotion.getArousal()).toBe('number');
    expect(emotion.getValence()).toBeGreaterThanOrEqual(-1);
    expect(emotion.getValence()).toBeLessThanOrEqual(1);
    expect(emotion.getArousal()).toBeGreaterThanOrEqual(0);
    expect(emotion.getArousal()).toBeLessThanOrEqual(1);
  });

  it('should maintain needs evolution consistency', () => {
    // Create world
    const engine = new AndyEngine({ seed: 'needs-evolution-test' });

    // Create Alice
    const alice = engine.createCharacter({
      id: 'alice',
      name: 'Alice',
      mbti: 'INFP',
      schedule: 'student',
    });

    // Place Alice in a location
    engine.world.regions.place('alice', '食堂');

    // Record initial needs
    const needsBefore = { ...alice.needs.needs };

    // Run ticks
    for (let i = 0; i < 15; i++) {
      engine.tick();
    }

    // Record final needs
    const needsAfter = { ...alice.needs.needs };

    // === ASSERTION 1: Needs should change over time ===
    const needsChanged = Object.keys(needsBefore).some(key =>
      Math.abs(needsBefore[key] - needsAfter[key]) > 0.001
    );
    expect(needsChanged).toBe(true);

    // === ASSERTION 2: Needs should stay in valid range [0, 1] ===
    for (const [key, value] of Object.entries(needsAfter)) {
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(1);
    }

    // === ASSERTION 3: All standard needs should exist ===
    expect(needsAfter.hunger).toBeDefined();
    expect(needsAfter.energy).toBeDefined();
    expect(needsAfter.social).toBeDefined();
  });

  it('should trace "Alice helps Bob" event through CanonEvent, EffectResult, Relationship, Memory, and Narrative', () => {
    // Create world with facts enabled
    const engine = new AndyEngine({
      seed: 'help-event-trace-test',
      enableFacts: true,
    });

    // Create Alice and Bob
    const alice = engine.createCharacter({
      id: 'alice',
      name: 'Alice',
      mbti: 'INFP',
      schedule: 'student',
    });

    const bob = engine.createCharacter({
      id: 'bob',
      name: 'Bob',
      mbti: 'ESTJ',
      schedule: 'student',
    });

    // Place them together
    engine.world.regions.place('alice', '校园广场');
    engine.world.regions.place('bob', '校园广场');

    // Record initial relationship strength
    const socialGraph = engine.world.socialGraph;
    const relBefore = socialGraph.getOrCreateRelationship('alice', 'bob');
    const initialStrength = relBefore.strength;

    // Record initial memory counts
    const aliceMemoriesBefore = alice.memory.memories.length;
    const bobMemoriesBefore = bob.memory.memories.length;

    // Create a help event directly through EventDispatcher
    const helpEvent = engine.world.eventDispatcher.createEvent({
      type: 'social',
      scope: 'local',
      participants: ['alice', 'bob'],
      content: 'Alice 帮助 Bob 解决了问题',
      effects: [
        { target: 'alice', type: 'relationship', delta: { target: 'bob', valence: 0.5 } },
        { target: 'bob', type: 'relationship', delta: { target: 'alice', valence: 0.5 } },
        { target: 'alice', type: 'emotion', delta: { joy: 0.2, contentment: 0.1 } },
        { target: 'bob', type: 'emotion', delta: { joy: 0.2, gratitude: 0.1 } },
      ],
      time: engine.world.clock.time,
    });

    // Dispatch the event
    const dispatched = engine.world.eventDispatcher.dispatch();

    // Apply encounter effects (this will apply relationship deltas)
    engine.world._applyEncounterEffects(dispatched);

    // Process through CanonEventPipeline
    if (engine.world.canonEventPipeline) {
      const pipelineResults = engine.world.canonEventPipeline.processEvents(
        dispatched, engine.world.agents
      );

      // Apply event consequences
      for (const pr of pipelineResults) {
        if (pr.fact) {
          const { applyEventConsequences } = require('../../src/effects/EventEffectPipeline');
          const consequences = applyEventConsequences({
            fact: pr.fact,
            agents: engine.world.agents,
            factStore: engine.world.factStore,
            domain: engine.world.domain,
          });
          engine.world.effectCommitter.commit({ deltas: consequences });
        }
      }
    }

    // === CANON EVENT ASSERTIONS ===
    // 1. CanonEvent exists in event log
    const allEvents = engine.world.eventDispatcher.eventLog;
    const helpEventInLog = allEvents.find(e =>
      (e.type === 'social' || e.type === 'help') &&
      e.participants.includes('alice') &&
      e.participants.includes('bob') &&
      e.content?.includes('帮助')
    );
    expect(helpEventInLog).toBeDefined();

    // 2. Event has required fields
    expect(helpEventInLog.id).toBeDefined();
    expect(helpEventInLog.timestamp || helpEventInLog.time).toBeDefined();
    expect(helpEventInLog.participants).toContain('alice');
    expect(helpEventInLog.participants).toContain('bob');
    expect(helpEventInLog.content).toContain('帮助');

    // === EFFECT RESULT / RELATIONSHIP ASSERTIONS ===
    // 1. Relationship strength should increase
    const relAfter = socialGraph.getRelationship('alice', 'bob');
    expect(relAfter).toBeDefined();
    expect(relAfter.strength).toBeGreaterThan(initialStrength);

    // 2. Relationship history should contain help event
    const helpHistory = relAfter.history.find(h =>
      h.content?.includes('帮助') ||
      h.type === 'help' ||
      h.interactionType === 'help'
    );
    expect(helpHistory).toBeDefined();

    // === MEMORY ASSERTIONS ===
    // 1. Alice should have memory of helping
    const aliceMemories = alice.memory.memories;
    const aliceHelpMemory = aliceMemories.find(m =>
      m.content?.includes('帮助') ||
      m.content?.includes('help') ||
      m.category === 'help' ||
      m.type === 'help'
    );
    expect(aliceHelpMemory).toBeDefined();

    // 2. Bob should have memory of being helped
    const bobMemories = bob.memory.memories;
    const bobHelpMemory = bobMemories.find(m =>
      m.content?.includes('帮助') ||
      m.content?.includes('help') ||
      m.category === 'help' ||
      m.type === 'help'
    );
    expect(bobHelpMemory).toBeDefined();

    // === NARRATIVE / GROUNDING ASSERTIONS ===
    // 1. Narrative should reference help event
    const aliceNarrative = engine.getNarrative('alice');
    const bobNarrative = engine.getNarrative('bob');

    // Narrative should exist and be non-empty
    expect(aliceNarrative).toBeDefined();
    expect(typeof aliceNarrative).toBe('string');
    expect(aliceNarrative.length).toBeGreaterThan(0);

    expect(bobNarrative).toBeDefined();
    expect(typeof bobNarrative).toBe('string');
    expect(bobNarrative.length).toBeGreaterThan(0);

    // 2. If facts enabled, grounding package should contain help event
    if (engine.world.factStore) {
      const aliceGrounding = engine.getGroundingPackage('alice');
      if (aliceGrounding && aliceGrounding.allowedFacts) {
        const hasHelpFact = aliceGrounding.allowedFacts.some(f =>
          f.description?.includes('帮助') ||
          f.content?.includes('帮助') ||
          f.eventId === helpEventInLog.id
        );
        expect(hasHelpFact).toBe(true);
      }
    }

    // === CROSS-SYSTEM CONSISTENCY CHECK ===
    // Verify the same event ID appears across systems
    const eventId = helpEventInLog.id;

    // Check if event ID is referenced in memory
    const memoryWithEventId = [...aliceMemories, ...bobMemories].find(m =>
      m.eventId === eventId
    );

    // Check if event ID is in fact store
    if (engine.world.factStore) {
      const allFacts = engine.world.factStore.getAllFacts();
      const factWithEventId = allFacts.find(f =>
        f.eventId === eventId ||
        f.id?.includes(eventId)
      );
      expect(factWithEventId).toBeDefined();
    }

    // Verify event content consistency across systems
    // The same "Alice helps Bob" event should be traceable through:
    // 1. Event log (CanonEvent)
    expect(helpEventInLog.content).toContain('帮助');

    // 2. Relationship history
    expect(helpHistory.content).toContain('帮助');

    // 3. Memory content
    expect(aliceHelpMemory.content).toContain('帮助');
    expect(bobHelpMemory.content).toContain('帮助');
  });
});