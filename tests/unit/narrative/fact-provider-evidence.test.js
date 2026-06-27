/**
 * FactProvider _evidence attachment — Task 2
 *
 * Tests that _attachEvidence decorates allowedFacts with _evidence,
 * evidenceSummary is computed in metadata, and fallback paths work correctly.
 */

import { describe, it, expect, beforeEach } from 'vitest';
const { createRequire } = await import('node:module');
const require = createRequire(import.meta.url);

const FactProvider = require('../../../src/narrative/FactProvider.js');
const WorldFactStore = require('../../../src/canon/WorldFactStore.js');
const KnowledgeStore = require('../../../src/knowledge/KnowledgeStore.js');
const { FactType, FactScope } = require('../../../src/canon/FactSchema.js');

describe('FactProvider _evidence attachment', () => {
  let store;
  let knowledgeStore;
  let provider;

  beforeEach(() => {
    store = new WorldFactStore();
    knowledgeStore = new KnowledgeStore(store);
    provider = new FactProvider(store, null, null, knowledgeStore);
  });

  describe('knowledgeStore fact carries _evidence from KnowledgeStore', () => {
    it('direct knowledge carries _evidence with source=direct', () => {
      const fact = store.addFact({
        id: 'fact_direct_1',
        type: 'event',
        eventId: 'evt_direct_1',
        description: 'Alice discovered a book',
        location: '图书馆',
        timestamp: new Date('2024-01-01T10:00:00Z'),
        source: 'engine',
        confidence: 1.0,
        scope: 'local',
        participants: ['alice'],
        observers: [],
      });

      knowledgeStore.addKnowledge('alice', fact.id, 'direct');

      const grounding = provider.getGroundingPackage('alice');
      const found = grounding.allowedFacts.find(f => f.id === 'fact_direct_1');
      expect(found).toBeDefined();
      expect(found._evidence).toEqual({
        source: 'direct',
        confidence: 1.0,
        propagatedFrom: null,
      });
    });
  });

  describe('told knowledge carries propagatedFrom', () => {
    it('told knowledge has source=told and propagatedFrom=告知者', () => {
      const fact = store.addFact({
        id: 'fact_told_1',
        type: 'event',
        eventId: 'evt_told_1',
        description: 'Secret meeting',
        location: '大厅',
        timestamp: new Date('2024-01-01T10:00:00Z'),
        source: 'engine',
        confidence: 1.0,
        scope: 'local',
        participants: ['bob'],
        observers: [],
      });

      knowledgeStore.addKnowledge('bob', fact.id, 'direct');
      knowledgeStore.addKnowledge('alice', fact.id, {
        source: 'told',
        confidence: 0.6,
        propagatedFrom: 'bob',
      });

      const grounding = provider.getGroundingPackage('alice');
      const found = grounding.allowedFacts.find(f => f.id === 'fact_told_1');
      expect(found).toBeDefined();
      expect(found._evidence).toEqual({
        source: 'told',
        confidence: 0.6,
        propagatedFrom: 'bob',
      });
    });
  });

  describe('inferred knowledge carries _evidence with source=inferred', () => {
    it('inferred knowledge has source=inferred and confidence=0.5', () => {
      const fact = store.addFact({
        id: 'fact_inferred_1',
        type: 'event',
        eventId: 'evt_inferred_1',
        description: 'Inferred event',
        location: '花园',
        timestamp: new Date('2024-01-01T10:00:00Z'),
        source: 'engine',
        confidence: 1.0,
        scope: 'local',
        participants: [],
        observers: [],
      });

      knowledgeStore.addKnowledge('alice', fact.id, {
        source: 'inferred',
        confidence: 0.5,
      });

      const grounding = provider.getGroundingPackage('alice');
      const found = grounding.allowedFacts.find(f => f.id === 'fact_inferred_1');
      expect(found).toBeDefined();
      expect(found._evidence).toEqual({
        source: 'inferred',
        confidence: 0.5,
        propagatedFrom: null,
      });
    });
  });

  describe('PUBLIC fact without knowledgeStore entry gets default _evidence', () => {
    it('public fact with no KS entry gets default evidence', () => {
      store.addFact({
        id: 'fact_public_default',
        type: 'event',
        eventId: 'evt_public_default',
        description: 'Public announcement',
        location: '广场',
        timestamp: new Date('2024-01-01T10:00:00Z'),
        source: 'engine',
        confidence: 1.0,
        scope: 'public',
        participants: [],
        observers: [],
      });

      // No knowledgeStore entry for alice on this fact
      const grounding = provider.getGroundingPackage('alice');
      const found = grounding.allowedFacts.find(f => f.id === 'fact_public_default');
      expect(found).toBeDefined();
      expect(found._evidence).toEqual({
        source: 'direct',
        confidence: 1.0,
        propagatedFrom: null,
      });
    });
  });

  describe('AGENT_STATE(self) gets default _evidence', () => {
    it('self AGENT_STATE fact gets default evidence', () => {
      store.addFact({
        id: 'fact_agent_state_self',
        type: FactType.AGENT_STATE,
        agentId: 'alice',
        state: 'reading',
        region: '图书馆',
        emotionSummary: 'calm',
        timestamp: new Date('2024-01-01T10:00:00Z'),
        source: 'engine',
        confidence: 1.0,
        scope: 'public',
        participants: ['alice'],
        observers: [],
      });

      const grounding = provider.getGroundingPackage('alice');
      const found = grounding.allowedFacts.find(f => f.id === 'fact_agent_state_self');
      expect(found).toBeDefined();
      expect(found._evidence).toEqual({
        source: 'direct',
        confidence: 1.0,
        propagatedFrom: null,
      });
    });
  });

  describe('forbiddenFacts do NOT carry _evidence', () => {
    it('facts in forbiddenFacts have no _evidence property', () => {
      // A LOCAL event that alice is not part of → forbidden
      store.addFact({
        id: 'fact_forbidden_1',
        type: 'event',
        eventId: 'evt_forbidden_1',
        description: 'Private event for bob',
        location: '小屋',
        timestamp: new Date('2024-01-01T10:00:00Z'),
        source: 'engine',
        confidence: 1.0,
        scope: 'local',
        participants: ['bob'],
        observers: [],
      });

      const grounding = provider.getGroundingPackage('alice');
      const forbidden = grounding.forbiddenFacts.find(f => f.id === 'fact_forbidden_1');
      expect(forbidden).toBeDefined();
      expect(forbidden._evidence).toBeUndefined();
    });
  });

  describe('evidenceSummary counts correctly', () => {
    it('counts direct, told, and inferred sources', () => {
      // Public fact (default evidence: direct)
      store.addFact({
        id: 'fact_pub_1',
        type: 'event',
        eventId: 'evt_pub_1',
        description: 'Public event 1',
        location: '广场',
        timestamp: new Date('2024-01-01T10:00:00Z'),
        source: 'engine',
        confidence: 1.0,
        scope: 'public',
        participants: [],
        observers: [],
      });

      // Direct knowledge
      const factDirect = store.addFact({
        id: 'fact_direct_ks',
        type: 'event',
        eventId: 'evt_direct_ks',
        description: 'Direct KS event',
        location: '图书馆',
        timestamp: new Date('2024-01-01T10:00:00Z'),
        source: 'engine',
        confidence: 1.0,
        scope: 'local',
        participants: ['alice'],
        observers: [],
      });
      knowledgeStore.addKnowledge('alice', factDirect.id, 'direct');

      // Told knowledge
      const factTold = store.addFact({
        id: 'fact_told_ks',
        type: 'event',
        eventId: 'evt_told_ks',
        description: 'Told KS event',
        location: '大厅',
        timestamp: new Date('2024-01-01T10:00:00Z'),
        source: 'engine',
        confidence: 1.0,
        scope: 'local',
        participants: ['bob'],
        observers: [],
      });
      knowledgeStore.addKnowledge('alice', factTold.id, {
        source: 'told',
        confidence: 0.6,
        propagatedFrom: 'bob',
      });

      // Inferred knowledge
      const factInferred = store.addFact({
        id: 'fact_inferred_ks',
        type: 'event',
        eventId: 'evt_inferred_ks',
        description: 'Inferred KS event',
        location: '花园',
        timestamp: new Date('2024-01-01T10:00:00Z'),
        source: 'engine',
        confidence: 1.0,
        scope: 'local',
        participants: [],
        observers: [],
      });
      knowledgeStore.addKnowledge('alice', factInferred.id, {
        source: 'inferred',
        confidence: 0.5,
      });

      const grounding = provider.getGroundingPackage('alice');
      expect(grounding.metadata.evidenceSummary).toBeDefined();
      // 2 direct: public fact + direct KS fact
      expect(grounding.metadata.evidenceSummary.direct).toBe(2);
      expect(grounding.metadata.evidenceSummary.told).toBe(1);
      expect(grounding.metadata.evidenceSummary.inferred).toBe(1);
    });
  });

  describe('evidenceSummary omits zero-count sources', () => {
    it('only sources with count > 0 appear in summary', () => {
      // Only a public fact → only 'direct' source
      store.addFact({
        id: 'fact_only_direct',
        type: 'event',
        eventId: 'evt_only_direct',
        description: 'Only direct event',
        location: '广场',
        timestamp: new Date('2024-01-01T10:00:00Z'),
        source: 'engine',
        confidence: 1.0,
        scope: 'public',
        participants: [],
        observers: [],
      });

      const grounding = provider.getGroundingPackage('alice');
      expect(grounding.metadata.evidenceSummary).toBeDefined();
      expect(grounding.metadata.evidenceSummary).toEqual({ direct: 1 });
      // 'told', 'inferred', 'observed', 'overheard' should NOT appear
      expect(grounding.metadata.evidenceSummary.told).toBeUndefined();
      expect(grounding.metadata.evidenceSummary.inferred).toBeUndefined();
      expect(grounding.metadata.evidenceSummary.observed).toBeUndefined();
      expect(grounding.metadata.evidenceSummary.overheard).toBeUndefined();
    });
  });

  describe('No knowledgeStore fallback: no _evidence, no evidenceSummary', () => {
    it('without knowledgeStore, facts have no _evidence', () => {
      const noKsProvider = new FactProvider(store, null, null, null);

      // Public fact
      store.addFact({
        id: 'fact_no_ks_pub',
        type: 'event',
        eventId: 'evt_no_ks_pub',
        description: 'Public event no KS',
        location: '广场',
        timestamp: new Date('2024-01-01T10:00:00Z'),
        source: 'engine',
        confidence: 1.0,
        scope: 'public',
        participants: [],
        observers: [],
      });

      // Agent is a participant → allowed via fallback path
      store.addFact({
        id: 'fact_no_ks_part',
        type: 'event',
        eventId: 'evt_no_ks_part',
        description: 'Participated event no KS',
        location: '广场',
        timestamp: new Date('2024-01-01T10:00:00Z'),
        source: 'engine',
        confidence: 1.0,
        scope: 'local',
        participants: ['alice'],
        observers: [],
      });

      const grounding = noKsProvider.getGroundingPackage('alice');

      // No _evidence on any allowedFact
      for (const f of grounding.allowedFacts) {
        expect(f._evidence).toBeUndefined();
      }

      // No evidenceSummary in metadata
      expect(grounding.metadata.evidenceSummary).toBeUndefined();
    });

    it('factCount.inferred is always 0 (v2.5 B1 downgrade)', () => {
      const grounding = provider.getGroundingPackage('alice');
      expect(grounding.metadata.factCount.inferred).toBe(0);
    });
  });
});
