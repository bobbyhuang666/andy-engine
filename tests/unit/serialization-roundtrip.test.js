/**
 * Wave 4 — Serialization round-trip contract tests.
 *
 * For every persistable type that gained a `static fromJSON`, verify the
 * strict round-trip property:
 *
 *     const j = obj.toJSON();
 *     const obj2 = Type.fromJSON(j);
 *     expect(obj2.toJSON()).to.deep.equal(j);
 *
 * The psychology subsystems accept optional deps (personality / domain / rng);
 * when omitted, fromJSON constructs a minimal stub so the call shape
 * `Type.fromJSON(j)` still round-trips.  A second assertion passes the real
 * Personality to confirm the production restore path also round-trips.
 */

import { describe, it, expect } from 'vitest';
import Personality from '../../src/agent/psychology/Personality.js';
import SocialGraph from '../../src/social/SocialGraph.js';
import Relationship from '../../src/social/Relationship.js';
import EmotionVector from '../../src/agent/psychology/EmotionVector.native.js';
import NeedsSystem from '../../src/agent/psychology/NeedsSystem.native.js';
import EmotionRegulation from '../../src/agent/psychology/EmotionRegulation.js';
import IntrinsicMotivation from '../../src/agent/psychology/IntrinsicMotivation.js';
import { StateMachine } from '../../src/agent/psychology/StateMachine.js';
import PersonalMemory from '../../src/agent/memory/PersonalMemory.js';
import ProceduralMemory from '../../src/agent/memory/ProceduralMemory.js';
import Schedule from '../../src/agent/schedule/Schedule.js';
import EventDispatcher from '../../src/runtime/EventDispatcher.js';
import { BehaviorField } from '../../src/agent/psychology/BehaviorField.js';
import WorldFactStore from '../../src/canon/WorldFactStore.js';
import KnowledgeStore from '../../src/knowledge/KnowledgeStore.js';
import { getDefaultDomain } from '../../src/domain/DomainRegistry.js';

const campusDomain = getDefaultDomain();

const T0 = new Date('2026-06-01T08:00:00Z');
const T1 = new Date('2026-06-01T10:00:00Z');
const T2 = new Date('2026-06-02T12:00:00Z');

function roundTrip(Type, obj, ...fromJSONArgs) {
  const j = obj.toJSON();
  const restored = Type.fromJSON(j, ...fromJSONArgs);
  expect(restored.toJSON()).to.deep.equal(j);
  return restored;
}

describe('Wave 4 — serialization round-trip', () => {
  const personality = new Personality({ mbti: 'ENTP' });

  // ── Relationship ──────────────────────────────────────────────
  describe('Relationship', () => {
    it('round-trips after recorded interactions', () => {
      const rel = new Relationship('alice', 'bob');
      rel.recordInteraction('talk', 0.6, '聊天', T1);
      rel.recordInteraction('help', 0.8, '帮忙搬书', T2);
      rel.recordInteraction('conflict', -0.4, '争执', T2);
      roundTrip(Relationship, rel);
    });

    it('persists the latest simulated interaction time and recency counter', () => {
      const rel = new Relationship('alice', 'bob');
      rel.recordInteraction('talk', 0.6, '聊天', T1);
      rel.tick(7);

      const restored = Relationship.fromJSON(rel.toJSON());

      expect(restored.lastInteraction).not.toBe(rel.lastInteraction);
      expect(restored.lastInteraction.getTime()).toBe(T1.getTime());
      expect(restored._hoursSinceLastInteraction).toBe(7);
      expect(restored.toJSON()).toEqual(rel.toJSON());
    });

    it('round-trips a fresh relationship', () => {
      roundTrip(Relationship, new Relationship('x', 'y'));
    });

    it('sanitizes invalid restored dates before re-serialization', () => {
      const rel = Relationship.fromJSON({
        agentA: 'alice',
        agentB: 'bob',
        strength: 0.5,
        lastInteraction: 'not-a-date',
        history: [{ type: 'talk', valence: 0.2, time: 'also-not-a-date' }],
      });

      const json = rel.toJSON();
      expect(json.lastInteraction).toBe(new Date(0).toISOString());
      expect(json.history[0].time).toBe(new Date(0).toISOString());
    });
  });

  // ── SocialGraph ───────────────────────────────────────────────
  describe('SocialGraph', () => {
    it('round-trips a graph with multiple edges', () => {
      const g = new SocialGraph();
      const ab = g.getOrCreateRelationship('alice', 'bob');
      ab.recordInteraction('talk', 0.5, 'hi', T1);
      const ac = g.getOrCreateRelationship('alice', 'carol');
      ac.recordInteraction('help', 0.7, '帮忙', T2);
      roundTrip(SocialGraph, g);
    });

    it('round-trips an empty graph', () => {
      roundTrip(SocialGraph, new SocialGraph());
    });

    it('skips invalid restored edges', () => {
      const g = SocialGraph.fromJSON({
        edges: [null, { agentA: 'alice' }, { agentA: 'alice', agentB: 'bob', lastInteraction: 'bad-date' }],
      });

      const json = g.toJSON();
      expect(json.edges).toHaveLength(1);
      expect(json.edges[0].lastInteraction).toBe(new Date(0).toISOString());
    });

    it('repairs invalid restored tick count', () => {
      for (const _tickCount of [Infinity, -1, 1.5]) {
        const g = SocialGraph.fromJSON({ edges: [], _tickCount });
        expect(g.toJSON()._tickCount).toBe(0);
      }
    });
  });

  // ── EmotionVector ─────────────────────────────────────────────
  describe('EmotionVector', () => {
    it('round-trips after tick (stub personality)', () => {
      const ev = new EmotionVector(personality);
      ev.tick(2, 14);
      roundTrip(EmotionVector, ev);
    });

    it('round-trips with explicit personality (restore path)', () => {
      const ev = new EmotionVector(personality);
      ev.tick(1.5, 9);
      const j = ev.toJSON();
      const restored = EmotionVector.fromJSON(j, personality);
      expect(restored.toJSON()).to.deep.equal(j);
    });

    it('fromJSON accepts partial emotion config without dropping circadian defaults', () => {
      const ev = new EmotionVector(personality);
      const restored = EmotionVector.fromJSON(
        ev.toJSON(),
        personality,
        null,
        { circadian: { positiveAffectAmp: 0.2 } }
      );

      expect(restored._cfg.circadian.positiveAffectPeak).toBeDefined();
      expect(restored._cfg.circadian.negativeAffectPeak).toBeDefined();
      restored._circadianModulation(12);
      expect(Number.isFinite(restored.current.joy)).toBe(true);
      expect(Number.isFinite(restored.current.sadness)).toBe(true);
    });
  });

 // ── NeedsSystem ───────────────────────────────────────────────
 describe('NeedsSystem', () => {
   it('round-trips after tick (stub personality)', () => {
      const ns = new NeedsSystem(personality, null, campusDomain);
      ns.tick(3, 'working', '工作区');
      roundTrip(NeedsSystem, ns, null, campusDomain);
    });

    it('round-trips with explicit personality (restore path)', () => {
      const ns = new NeedsSystem(personality, null, campusDomain);
      ns.tick(5, 'resting', '住处');
      const j = ns.toJSON();
      const restored = NeedsSystem.fromJSON(j, personality, campusDomain);
      expect(restored.toJSON()).to.deep.equal(j);
    });
 });

  // ── EmotionRegulation ─────────────────────────────────────────
  describe('EmotionRegulation', () => {
    it('round-trips with depleted resource + reappraisal history', () => {
      const er = new EmotionRegulation(personality);
      er._regulationResource = 0.35;
      er._regulationCount = 4;
      er._regulationTickCounter = 12;
      er._reappraisalHistory = [
        { strategy: 'reappraisal', valenceBefore: -0.5, valenceAfter: -0.2, time: T1.toISOString() },
        { strategy: 'attentionDeployment', valenceBefore: -0.3, valenceAfter: 0.1, time: T2.toISOString() },
      ];
      roundTrip(EmotionRegulation, er);
    });
  });

  // ── IntrinsicMotivation ───────────────────────────────────────
  describe('IntrinsicMotivation', () => {
    it('round-trips with goals, familiarity and exploration history', () => {
      const im = new IntrinsicMotivation(personality, null, campusDomain);
      im.curiosity = 0.82;
      im.familiarity = { 工作区: 0.6, 图书馆: 0.2 };
      im.activeGoals = [
        { id: 1, type: 'explore', target: '图书馆', createdAt: T1.toISOString() },
        { id: 2, type: 'mastery', target: '工作区', createdAt: T2.toISOString() },
      ];
      im.completedGoals = [{ id: 0, type: 'explore', target: '食堂', completedAt: T0.toISOString() }];
      im.competence = { 工作区: 0.45, 食堂: 0.1 };
      im.explorationHistory = [
        { position: '图书馆', time: T1.toISOString() },
        { position: '工作区', time: T2.toISOString() },
      ];
      im._ticksSinceGoal = 7;
      im._lastGoalId = 2;
      roundTrip(IntrinsicMotivation, im, null, campusDomain);
    });

    it('fromJSON accepts partial intrinsic domainRegionMap without dropping domain defaults', () => {
      const im = new IntrinsicMotivation(personality, null, campusDomain);
      const restored = IntrinsicMotivation.fromJSON(
        im.toJSON(),
        personality,
        campusDomain,
        null,
        { domainRegionMap: { customStudy: '图书馆' } }
      );

      expect(restored._imConfig.domainRegionMap['图书馆自习']).toBe('图书馆');
      expect(restored._imConfig.domainRegionMap.customStudy).toBe('图书馆');
    });
  });

  // ── StateMachine ───────────────────────────────────────────────
  describe('StateMachine', () => {
    it('round-trips with current state and history', () => {
      const sm = new StateMachine('working', null, campusDomain);
      sm.history = [
        { from: 'resting', to: 'working', time: T1.toISOString() },
        { from: 'working', to: 'eating', time: T2.toISOString() },
      ];
      roundTrip(StateMachine, sm, campusDomain);
    });

    it('sanitizes invalid restored stateEnteredAt before re-serialization', () => {
      const sm = StateMachine.fromJSON({
        currentState: campusDomain.fallback.defaultState,
        stateEnteredAt: 'not-a-date',
        history: [],
      }, campusDomain);

      expect(sm.toJSON().stateEnteredAt).toBe(new Date(0).toISOString());
      expect(sm.getInfo(new Date('not-a-date')).elapsed).toBe(0);
    });
  });

  // ── PersonalMemory ─────────────────────────────────────────────
  describe('PersonalMemory', () => {
    it('round-trips seed + dynamic memories (full field set)', () => {
      const pm = new PersonalMemory('agent1', [
        { content: '童年回忆', category: 'background', importance: 0.9, emotionTag: 'nostalgia' },
      ], null, campusDomain);
      pm.setSimTime(T1);
      pm.addExperience(
        { id: 'evt_5', content: '与 Bob 聊天', type: 'social', participants: ['Bob'], location: '咖啡馆' },
        { current: { joy: 0.6, arousal: 0.4 }, getArousal: () => 0.4, getValence: () => 0.3 },
      );
      // ensure deterministic access metadata on a memory
      pm.memories[0].accessCount = 3;
      pm.memories[0].presentations = [T0, T1];
      roundTrip(PersonalMemory, pm, 'agent1', campusDomain);
    });

    it('round-trips with only the default agentId (stub)', () => {
      const pm = new PersonalMemory('agent1', [{ content: 'x' }], null, campusDomain);
      const j = pm.toJSON();
      expect(PersonalMemory.fromJSON(j, 'agent1', campusDomain).toJSON()).to.deep.equal(j);
    });

    it('fromJSON accepts partial memory config without dropping nested defaults', () => {
      const pm = new PersonalMemory('agent1', [], null, campusDomain);
      const restored = PersonalMemory.fromJSON(
        pm.toJSON(),
        'agent1',
        campusDomain,
        null,
        {
          spreadingActivation: { W: 2 },
          recallEmotionDelta: { sad: { sadness: 0.02 } },
        }
      );

      expect(restored._cfg.spreadingActivation.S).toBeDefined();
      expect(restored._cfg.recallEmotionDelta.importanceScale).toBeDefined();
      expect(restored._cfg.recallEmotionDelta.ruminationMultiplier).toBeDefined();
    });

    it('skips invalid restored memory entries and repairs invalid dates on save', () => {
      const restored = PersonalMemory.fromJSON({
        memories: [
          null,
          {
            id: 'mem_agent1_3',
            content: 'corrupt date memory',
            timestamp: 'not-a-date',
            lastAccessed: 'also-not-a-date',
            presentations: ['bad-date'],
            associations: null,
            importance: Infinity,
          },
        ],
        _nextMemId: Infinity,
      }, 'agent1', campusDomain);

      restored.memories[0].timestamp = new Date('still-bad');
      const json = restored.toJSON();

      expect(json.memories).toHaveLength(1);
      expect(json.memories[0].timestamp).toBe(new Date(0).toISOString());
      expect(json.memories[0].presentations[0]).toBe(new Date(0).toISOString());
      expect(json.memories[0].importance).toBe(0.5);
      expect(json._nextMemId).toBe(4);
    });
  });

  // ── Fact/Knowledge stores ───────────────────────────────────────
  describe('WorldFactStore / KnowledgeStore', () => {
    it('WorldFactStore.fromJSON tolerates missing or corrupt payload fields', () => {
      expect(WorldFactStore.fromJSON(null).toJSON()).toEqual({ version: 1, nextId: 0, facts: [] });
      expect(WorldFactStore.fromJSON({ nextId: Infinity, facts: [null] }).toJSON()).toEqual({ version: 1, nextId: 0, facts: [] });
      expect(WorldFactStore.fromJSON({ nextId: 5 }).toJSON()).toEqual({ version: 1, nextId: 5, facts: [] });
    });

    it('KnowledgeStore.fromJSON tolerates null payload and evidence entries', () => {
      const factStore = new WorldFactStore();

      expect(KnowledgeStore.fromJSON(null, factStore).toJSON()).toEqual({
        knowledge: {},
        evidence: {},
        sources: {},
      });
      expect(KnowledgeStore.fromJSON({ knowledge: {}, evidence: { bad: null } }, factStore).toJSON()).toEqual({
        knowledge: {},
        evidence: {},
        sources: {},
      });
    });
  });

  // ── ProceduralMemory ──────────────────────────────────────────
  describe('ProceduralMemory', () => {
    it('round-trips with detected patterns', () => {
      const pm = new ProceduralMemory();
      pm.setSimTime(T1);
      const action = { hour: 8, dayOfWeek: 1, position: '工作区', state: 'working', valence: 0.3, region: '工作区' };
      pm.recordAction(action);
      pm.recordAction(action);
      pm.recordAction(action);
      // at least one pattern should have formed
      expect(pm.patterns.size).toBeGreaterThan(0);
      roundTrip(ProceduralMemory, pm);
    });

    it('round-trips an empty procedural memory', () => {
      roundTrip(ProceduralMemory, new ProceduralMemory());
    });
  });

  // ── Schedule ───────────────────────────────────────────────────
  describe('Schedule', () => {
    it('round-trips entries + runtime variations', () => {
      const sched = new Schedule({
        entries: [
          { startHour: 8, endHour: 12, region: '工作区', activity: '工作', days: [1, 2, 3, 4, 5], probability: 0.9, noise: 20 },
          { startHour: 19, endHour: 21, region: '食堂', activity: '吃饭', days: [0, 1, 2, 3, 4, 5, 6] },
        ],
      });
      sched._todayVariations = { 0: { region: '工作区', duration: 240 }, 1: null };
      sched._lastVariationDate = '2026-06-01';
      roundTrip(Schedule, sched);
    });
  });

  // ── EventDispatcher ───────────────────────────────────────────
  describe('EventDispatcher', () => {
    it('round-trips a dispatched event log', () => {
      const ed = new EventDispatcher(campusDomain);
      ed.setSimTime(new Date('2026-06-02T13:00:00Z'));
      ed.createEvent({ type: 'encounter', scope: 'local', participants: ['alice', 'bob'], content: '偶遇', time: T1 });
      ed.createEvent({ type: 'random', scope: 'public', participants: ['carol'], content: '天气变化', time: T2, effects: [{ target: 'carol', type: 'emotion', delta: 0.1 }] });
      ed.dispatch();
      expect(ed.eventLog.length).toBe(2);
      roundTrip(EventDispatcher, ed, campusDomain);
    });

    it('round-trips an empty event log', () => {
      roundTrip(EventDispatcher, new EventDispatcher(campusDomain), campusDomain);
    });

    it('skips non-object restored events and repairs invalid next id', () => {
      const ed = EventDispatcher.fromJSON({
        eventLog: [null, { id: 'evt_5', participants: null, effects: null }],
        _nextId: NaN,
      }, campusDomain);

      expect(ed.toJSON().eventLog).toHaveLength(1);
      expect(ed.createEvent('random', 'next').id).toBe('evt_6');
    });
  });

  // ── Personality (persisted in every agent; contract table previously omitted) ──
  describe('Personality', () => {
    it('round-trips an MBTI personality with OCEAN + baseline', () => {
      const p = new Personality({ mbti: 'INTP', ocean: { openness: 0.8, neuroticism: 0.6 } });
      roundTrip(Personality, p);
    });

    it('round-trips a default personality', () => {
      roundTrip(Personality, new Personality({ mbti: 'ENFP' }));
    });
  });

  // ── BehaviorField (persisted in every agent; contract table previously omitted) ──
  describe('BehaviorField', () => {
    it('round-trips after dynamics updates (explicit deps path)', () => {
      const personality = new Personality({ mbti: 'ISTJ' });
      const bf = new BehaviorField(personality, null, {}, campusDomain);
      // advance a few ticks so B/velocity/_prevB are non-trivial
      for (let i = 0; i < 5; i++) bf.tick({ environment: { hour: 8 } });
      roundTrip(BehaviorField, bf, personality, campusDomain);
    });

    it('round-trips a fresh behavior field', () => {
      const personality = new Personality({ mbti: 'ENFP' });
      const bf = new BehaviorField(personality, null, {}, campusDomain);
      roundTrip(BehaviorField, bf, personality, campusDomain);
    });

    it('fromJSON accepts partial behavior weights without dropping defaults', () => {
      const personality = new Personality({ mbti: 'ENFP' });
      const bf = new BehaviorField(personality, null, {}, campusDomain);
      const restored = BehaviorField.fromJSON(
        bf.toJSON(),
        personality,
        campusDomain,
        { weights: { needs: 4 } }
      );

      expect(restored.cfg.weights.needs).toBe(4);
      expect(restored.cfg.weights.emotion).toBeDefined();
      expect(restored.cfg.weights.schedule).toBeDefined();
    });

    it('repairs invalid restored counters', () => {
      const personality = new Personality({ mbti: 'ENFP' });
      const bf = BehaviorField.fromJSON({
        B: [0.1, 0.2, 0.3, 0.4],
        velocity: [0, 0, 0, 0],
        _prevB: [0.1, 0.2, 0.3, 0.4],
        _lastLabel: campusDomain.fallback.defaultState,
        _tickCount: Infinity,
        _attractor: { target: [0.5, 0.5, 0.5, 0.5], strength: 1 },
        _attractorTicksLeft: -1,
      }, personality, campusDomain);

      expect(bf.toJSON()._tickCount).toBe(0);
      expect(bf.toJSON()._attractorTicksLeft).toBe(0);
    });
  });
});
