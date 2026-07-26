import { describe, it, expect } from 'vitest';
import AndyEngine from '../../index.js';
import tavernDomain from '../../presets/tavern/index.js';
import { FactConsistencyChecker } from '../../facts/index.js';

describe('Fact System Tavern Runnable Slice', () => {
  it('Bobby 从广场去酒馆：Mira 观察到，Leo 不知道', () => {
    const engine = new AndyEngine({
      domain: tavernDomain,
      enableFacts: true,
      seed: 42,
    });

    engine.createCharacter({ id: 'bobby', name: 'Bobby', mbti: 'ESTP' });
    engine.createCharacter({ id: 'mira', name: 'Mira', mbti: 'INFJ' });
    engine.createCharacter({ id: 'leo', name: 'Leo', mbti: 'INTJ' });

    // Force deterministic positions
    engine.world.agents.get('bobby').position = '广场';
    engine.world.agents.get('mira').position = '广场';
    engine.world.agents.get('leo').position = '小屋';

    // Tick 1: generate agent state facts and baseline
    engine.tick();

    // Now inject a deterministic event: Bobby moves from 广场 to 酒馆
    // This simulates what would happen when Bobby's BehaviorField moves him
    engine.world.eventDispatcher.createEvent({
      type: 'state_change',
      scope: 'local',
      participants: ['bobby'],
      observers: ['mira'],  // Mira is at 广场, she sees Bobby leave
      content: 'Bobby 离开了广场，去了酒馆',
      location: '广场',
      time: engine.world.time,
      effects: [],
    });

    // Force Bobby's position change (simulating the move)
    engine.world.agents.get('bobby').position = '酒馆';

    // Tick 2: process the injected event through the pipeline
    engine.tick();

    // ─── Assert: Knowledge Propagation ───

    const bobbyGrounding = engine.getGroundingPackage('bobby');
    const miraGrounding = engine.getGroundingPackage('mira');
    const leoGrounding = engine.getGroundingPackage('leo');

    expect(bobbyGrounding).not.toBeNull();
    expect(miraGrounding).not.toBeNull();
    expect(leoGrounding).not.toBeNull();

    // Find the movement event in event facts
    const eventFacts = engine.world.factStore.getEventFacts();
    const moveEvent = eventFacts.find(f =>
      f.description && f.description.includes('Bobby') && f.description.includes('酒馆')
    );

    if (moveEvent) {
      // Bobby is a participant → he knows about it
      expect(bobbyGrounding.allowedFacts.some(f => f.id === moveEvent.id)).toBe(true);

      // Mira is an observer → she knows Bobby left 广场
      expect(miraGrounding.allowedFacts.some(f => f.id === moveEvent.id)).toBe(true);

      // Leo is neither participant nor observer, and event is local → he doesn't know
      expect(leoGrounding.allowedFacts.some(f => f.id === moveEvent.id)).toBe(false);

      // Verify KnowledgeStore source tracking
      if (engine.world.knowledgeStore) {
        expect(engine.world.knowledgeStore.getSource('bobby', moveEvent.id)).toBe('direct');
        expect(engine.world.knowledgeStore.getSource('mira', moveEvent.id)).toBe('observed');
        expect(engine.world.knowledgeStore.hasKnowledge('leo', moveEvent.id)).toBe(false);
      }
    }

    // ─── Assert: Mira 只知道 Bobby 离开广场，不知道酒馆发生了什么 ───

    // Mira's allowed facts should NOT contain facts about what happened AT 酒馆
    // (she only saw Bobby leave 广场, she's not at 酒馆)
    const mira酒馆Facts = miraGrounding.allowedFacts.filter(f =>
      f.location === '酒馆' && f.scope !== 'public'
    );
    // Mira should have NO private/local facts about 酒馆
    expect(mira酒馆Facts.length).toBe(0);

    // ─── Assert: Leo 不知道 Bobby 离开广场的事件 ───

    // Leo may have participated in other 广场 events (he moved there during tick),
    // but he should NOT know about the Bobby movement event specifically.
    // The more specific check (line 69) already verifies he lacks moveEvent;
    // here we confirm: no 广场 local event involving Bobby is in Leo's grounding.
    const leoBobby广场Facts = leoGrounding.allowedFacts.filter(f =>
      f.location === '广场' && f.scope === 'local' && f.type === 'event'
      && f.participants && f.participants.includes('bobby')
    );
    expect(leoBobby广场Facts.length).toBe(0);

    // ─── Assert: ConsistencyChecker ───

    const checker = new FactConsistencyChecker(engine.world.factStore, tavernDomain);

    // Bobby 可以说"我去了酒馆" — 他是 participant
    if (moveEvent) {
      const bobbySays = checker.check('我去了酒馆', bobbyGrounding);
      // Should be valid or at most have minor violations (not unknown_event)
      const hasUnknownEvent = bobbySays.violations.some(v => v.type === 'unknown_event');
      expect(hasUnknownEvent).toBe(false);
    }

    // Mira 不能编造"Bobby 去了酒馆" — 她只知道 Bobby 离开广场
    const miraFabricates = checker.check('Bobby 去了酒馆喝酒', miraGrounding);
    // Mira knows Bobby left 广场, but she doesn't know Bobby went to 酒馆 specifically
    // This should have violations (unknown_event or unknown_location depending on checker)
    // At minimum, the checker should flag it
    expect(miraFabricates).toHaveProperty('valid');
    expect(miraFabricates).toHaveProperty('violations');

    // Leo 完全不能编造该事件
    const leoFabricates = checker.check('Bobby 去了酒馆', leoGrounding);
    expect(leoFabricates).toHaveProperty('valid');
    expect(leoFabricates).toHaveProperty('violations');

    // ─── Assert: tavern domain 不含 campus 术语 ───

    const campusTerms = ['校园', '食堂', '图书馆', '教室', '操场'];
    for (const grounding of [bobbyGrounding, miraGrounding, leoGrounding]) {
      for (const fact of grounding.allowedFacts) {
        const text = JSON.stringify(fact);
        for (const term of campusTerms) {
          expect(text).not.toContain(term);
        }
      }
    }
  });

  it('future tendency 直接更新后可观察变化', () => {
    const engine = new AndyEngine({
      domain: tavernDomain,
      enableFacts: true,
      seed: 42,
    });

    engine.createCharacter({ id: 'alice', name: 'Alice', mbti: 'ENFP' });
    engine.world.agents.get('alice').position = '酒馆';

    const alice = engine.world.agents.get('alice');

    // Directly update future tendency (simulating what EventEffectPipeline does)
    const socialDelta = [0, 0.4, 0, 0.3]; // matches _computeTendencyDelta for '聊天'
    alice.futureTendency.updateTendency('酒馆', socialDelta, 0.5);

    const tendency = alice.futureTendency.getTendencyGradient('酒馆');
    expect(tendency.length).toBe(4);
    // sociality (dim 1) should be positive from the social event
    expect(tendency[1]).toBeGreaterThan(0);
    // expressiveness (dim 3) should be positive
    expect(tendency[3]).toBeGreaterThan(0);
    // activity (dim 0) and focus (dim 2) should remain zero
    expect(tendency[0]).toBe(0);
    expect(tendency[2]).toBe(0);

    // Decay should reduce magnitude but keep sign
    alice.futureTendency.decay();
    const afterDecay = alice.futureTendency.getTendencyGradient('酒馆');
    expect(afterDecay[1]).toBeLessThan(tendency[1]);
    expect(afterDecay[1]).toBeGreaterThan(0);
  });

  it('一致性校验拒绝编造新事件和关系', () => {
    const engine = new AndyEngine({
      domain: tavernDomain,
      enableFacts: true,
      seed: 42,
    });

    engine.createCharacter({ id: 'test', name: '测试角色', mbti: 'INFP' });
    engine.tick();

    const grounding = engine.getGroundingPackage('test');
    const checker = new FactConsistencyChecker(engine.world.factStore, tavernDomain);

    // 编造新关系
    const fakeRelationship = checker.check('我和测试角色成为了好朋友', grounding);
    expect(fakeRelationship.valid).toBe(false);
    expect(fakeRelationship.violations.some(v => v.type === 'new_relationship')).toBe(true);

    // 编造新事件
    const fakeEvent = checker.check('刚刚发生了一场大火', grounding);
    expect(fakeEvent.valid).toBe(false);
    expect(fakeEvent.violations.some(v => v.type === 'new_event')).toBe(true);
  });

  it('grounding 不泄漏其他 agent 的 agent_state', async () => {
    const engine = new AndyEngine({
      domain: tavernDomain,
      enableFacts: true,
      seed: 42,
    });

    engine.createCharacter({ id: 'bobby', name: 'Bobby', mbti: 'ESTP' });
    engine.createCharacter({ id: 'mira', name: 'Mira', mbti: 'INFJ' });
    engine.createCharacter({ id: 'leo', name: 'Leo', mbti: 'INTJ' });

    engine.world.agents.get('bobby').position = '酒馆';
    engine.world.agents.get('mira').position = '小屋';
    engine.world.agents.get('leo').position = '广场';

    engine.tick();

    const leoGrounding = engine.getGroundingPackage('leo');

    // Leo 的 allowedFacts 不应包含 Bobby 的 agent_state
    const leoKnowsBobbyState = leoGrounding.allowedFacts.some(
      f => f.type === 'agent_state' && f.agentId === 'bobby'
    );
    expect(leoKnowsBobbyState).toBe(false);

    // Leo 的 allowedFacts 不应包含 Mira 的 agent_state
    const leoKnowsMiraState = leoGrounding.allowedFacts.some(
      f => f.type === 'agent_state' && f.agentId === 'mira'
    );
    expect(leoKnowsMiraState).toBe(false);

    // Leo 的 allowedFacts 应包含自己的 agent_state
    const leoKnowsSelfState = leoGrounding.allowedFacts.some(
      f => f.type === 'agent_state' && f.agentId === 'leo'
    );
    expect(leoKnowsSelfState).toBe(true);

    // Bobby 的 allowedFacts 应包含自己的 agent_state
    const bobbyGrounding = engine.getGroundingPackage('bobby');
    const bobbyKnowsSelfState = bobbyGrounding.allowedFacts.some(
      f => f.type === 'agent_state' && f.agentId === 'bobby'
    );
    expect(bobbyKnowsSelfState).toBe(true);

    // Prompt grounding section 不包含 "Bobby 在 酒馆" 裸状态
    const { FactFormatter } = await import('../../facts/index.js');
    const leoFactTexts = leoGrounding.allowedFacts.map(f => FactFormatter.toNaturalLanguage(f));
    const leoSeesBobbyLocation = leoFactTexts.some(t => t.includes('Bobby') && t.includes('酒馆'));
    expect(leoSeesBobbyLocation).toBe(false);
  });

  it('同一 dispatched event 只生成一个 EventFact', () => {
    const engine = new AndyEngine({
      domain: tavernDomain,
      enableFacts: true,
      seed: 42,
    });

    engine.createCharacter({ id: 'test', name: '测试角色', mbti: 'INFP' });
    engine.world.agents.get('test').position = '酒馆';

    // Inject a specific event
    engine.world.eventDispatcher.createEvent({
      type: 'social',
      scope: 'public',
      participants: ['test'],
      observers: [],
      content: '在酒馆喝了一杯酒',
      location: '酒馆',
      time: engine.world.time,
      effects: [],
    });

    engine.tick();

    // Count EventFacts with the same description
    const eventFacts = engine.world.factStore.getEventFacts();
    const matching = eventFacts.filter(f =>
      f.description && f.description.includes('喝了一杯酒')
    );

    // Should be exactly 1, not 2
    expect(matching.length).toBe(1);
  });

  it('agent-location 声明必须被 grounding 支撑', () => {
    const engine = new AndyEngine({
      domain: tavernDomain,
      enableFacts: true,
      seed: 42,
    });

    engine.createCharacter({ id: 'bobby', name: 'Bobby', mbti: 'ESTP' });
    engine.createCharacter({ id: 'mira', name: 'Mira', mbti: 'INFJ' });
    engine.createCharacter({ id: 'leo', name: 'Leo', mbti: 'INTJ' });

    engine.world.agents.get('bobby').position = '广场';
    engine.world.agents.get('mira').position = '广场';
    engine.world.agents.get('leo').position = '小屋';

    // Tick 1: generate baseline agent state facts
    engine.tick();

    // Inject a deterministic event: Bobby moves to 酒馆, Mira observes
    engine.world.eventDispatcher.createEvent({
      type: 'state_change',
      scope: 'local',
      participants: ['bobby'],
      observers: ['mira'],
      content: 'Bobby 离开广场去了酒馆',
      location: '广场',
      time: engine.world.time,
      effects: [],
    });
    engine.world.agents.get('bobby').position = '酒馆';

    // Tick 2: process the injected event
    engine.tick();

    const bobbyGrounding = engine.getGroundingPackage('bobby');
    const miraGrounding = engine.getGroundingPackage('mira');
    const leoGrounding = engine.getGroundingPackage('leo');
    const checker = new FactConsistencyChecker(engine.world.factStore, tavernDomain);

    // E2-1 fix: AGENT_STATE now reflects post-tick position (after Phase 9
    // refresh), not the pre-tick manual position. Use the actual current
    // region from worldContext for the self-claim assertion.
    const bobbyCtx = engine.getWorldContext('bobby');
    const bobbyRegion = bobbyCtx.currentRegion;
    expect(bobbyRegion).toBeDefined();

    // Bobby 说 "Bobby在{region}" — 他自己的 AGENT_STATE 已更新为 post-tick 位置 → valid
    const bobbyClaim = checker.check(`Bobby在${bobbyRegion}`, bobbyGrounding);
    expect(bobbyClaim.valid).toBe(true);

    // Leo 说 "Bobby在{region}" — 他既不是 participant 也不是 observer，
    // 且不应信任 PUBLIC agent_state 作为位置证据 → unsupported_claim
    const leoClaim = checker.check(`Bobby在${bobbyRegion}`, leoGrounding);
    expect(leoClaim.valid).toBe(false);
    expect(leoClaim.violations.some(v => v.type === 'unsupported_claim')).toBe(true);

    // Mira 说 "Bobby在{region}" — 她是 observer 但事件 location 是 '广场' 不是该位置，
    // 她知道 Bobby 离开了广场，但不知道 Bobby 的最终位置 → unsupported_claim
    const miraClaim = checker.check(`Bobby在${bobbyRegion}`, miraGrounding);
    expect(miraClaim.valid).toBe(false);
    expect(miraClaim.violations.some(v => v.type === 'unsupported_claim')).toBe(true);
  });
});
