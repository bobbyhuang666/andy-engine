# v2.5-W1: Evidence-aware Grounding Package Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the evidence disconnection between KnowledgeStore and the narrative layer — grounding packages carry per-fact evidence metadata, inferredFacts is downgraded to empty, NarrativeBuilder renders facts by source, checker detects missing source attribution, and the regression corpus expands to W1 target.

**Architecture:** Extend the read path from KnowledgeStore through FactProvider to NarrativeBuilder and FactConsistencyChecker. No writes to KnowledgeStore/CanonEventPipeline/WorldFactStore. Evidence metadata flows one-way: `KnowledgeStore._evidence → FactProvider._getAllowedFacts (attach _evidence) → NarrativeBuilder._buildGroundingSection (group by source) → FactConsistencyChecker._checkMissingSourceAttribution (reverse check)`.

**Tech Stack:** Node.js, Vitest, existing FactSchema/FactType/FactScope enums.

---

## File Structure

| File | Responsibility | Action |
|---|---|---|
| `src/narrative/FactProvider.js` | Downgrade `_getInferredFacts` to `[]`; attach `_evidence` to allowedFacts; add `evidenceSummary` to metadata | Modify |
| `src/sdk/NarrativeBuilder.js` | Render grounding section grouped by evidence source with source annotation | Modify |
| `src/narrative/FactFormatter.js` | Add `toNaturalLanguageWithSource(fact)` method for source-annotated output | Modify |
| `src/narrative/FactConsistencyChecker.js` | Add `_checkMissingSourceAttribution`; upgrade severity to 4-layer (pass/warning/rewrite/reject) | Modify |
| `src/shared/schemas/GroundingPackage.schema.js` | Validate `_evidence` on allowedFacts and `evidenceSummary` in metadata | Modify |
| `tests/fixtures/narrative-violations/index.js` | Expand corpus from 11→20 entries with evidence-aware samples | Modify |
| `tests/unit/narrative-violation-corpus.test.js` | Update thresholds and add evidence-aware assertions | Modify |
| `tests/facts/grounded-narrative.test.js` | Update for inferredFacts=[] and _evidence on allowedFacts | Modify |
| `tests/unit/narrative/fact-consistency-checker.test.js` | Add missing_source_attribution and severity tests | Modify |
| `tests/unit/narrative/fact-provider-evidence.test.js` | New: evidence attachment unit tests | Create |
| `tests/unit/narrative/narrative-builder-grounding.test.js` | New: evidence-aware grounding rendering tests | Create |

---

### Task 1: `_getInferredFacts()` Downgrade to Empty Array

**Files:**
- Modify: `src/narrative/FactProvider.js:178-204`
- Modify: `tests/facts/grounded-narrative.test.js:416-456`

- [ ] **Step 1: Write the failing test — update grounded-narrative.test.js for inferredFacts=[]**

The existing test at line 416-456 (`invalidated fact not inferred`) asserts that `grounding.inferredFacts` contains a specific fact ID before invalidation. After downgrade, `inferredFacts` is always `[]`. The fact should instead appear in `allowedFacts` when KnowledgeStore has it with `source='inferred'`.

Replace the `invalidated fact not inferred` test block in `tests/facts/grounded-narrative.test.js`:

```js
    it('inferredFacts is always empty (v2.5 downgrade)', () => {
      store.addFact({
        id: 'fact_agent_state',
        type: 'agent_state',
        agentId: 'bobby',
        state: '在广场',
        region: '广场',
        emotionSummary: 'calm',
        timestamp: new Date('2024-01-01T10:00:00Z'),
        source: 'engine',
        confidence: 1.0,
        scope: 'public',
        participants: ['bobby'],
        observers: [],
      });

      // Even with PUBLIC events at same location, inferredFacts is empty
      const grounding = provider.getGroundingPackage('bobby', { currentRegion: '广场' });
      expect(grounding.inferredFacts).toEqual([]);
    });

    it('inferred knowledge appears in allowedFacts via KnowledgeStore', () => {
      store.addFact({
        id: 'fact_agent_state',
        type: 'agent_state',
        agentId: 'bobby',
        state: '在广场',
        region: '广场',
        emotionSummary: 'calm',
        timestamp: new Date('2024-01-01T10:00:00Z'),
        source: 'engine',
        confidence: 1.0,
        scope: 'public',
        participants: ['bobby'],
        observers: [],
      });

      const fact = store.addFact({
        id: 'fact_event_inf',
        type: 'event',
        eventId: 'evt_inf',
        description: '广场事件',
        location: '广场',
        timestamp: new Date('2024-01-01T10:00:00Z'),
        source: 'engine',
        confidence: 1.0,
        scope: 'public',
        participants: [],
        observers: [],
      });

      // Seed inferred knowledge via KnowledgeStore
      knowledgeStore.addKnowledge('bobby', fact.id, { source: 'inferred', confidence: 0.5 });

      const grounding = provider.getGroundingPackage('bobby', { currentRegion: '广场' });
      // Fact is in allowedFacts, not inferredFacts
      expect(grounding.allowedFacts.map(f => f.id)).toContain('fact_event_inf');
      expect(grounding.inferredFacts).toEqual([]);
    });
```

Also update the `beforeEach` at the top of the `invalidated facts excluded from grounding` describe block to ensure `knowledgeStore` is available — it already is (line 354-358 creates `knowledgeStore` and `provider` with it).

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/facts/grounded-narrative.test.js`
Expected: FAIL — `inferredFacts` currently returns facts, not empty array.

- [ ] **Step 3: Implement _getInferredFacts downgrade**

Replace `_getInferredFacts` in `src/narrative/FactProvider.js` (lines 178-204) with:

```js
  /**
   * 角色可以推断的事实：
   * v2.5 降级：返回空数组。所有推断知识走 KnowledgeStore → allowedFacts 路径。
   * 详见 V2_5_GROUNDED_NARRATIVE_FAITHFULNESS_RFC §2.1 B1 决策。
   * @private
   */
  _getInferredFacts(agentId, options) {
    return [];
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/facts/grounded-narrative.test.js`
Expected: PASS

- [ ] **Step 5: Run broader test suite to check for regressions**

Run: `npx vitest run tests/unit/narrative-violation-corpus.test.js`
Expected: PASS (corpus test doesn't use inferredFacts directly)

Run: `npx vitest run tests/unit/narrative/fact-consistency-checker.test.js`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/narrative/FactProvider.js tests/facts/grounded-narrative.test.js
git commit -m "feat(v2.5-w1): downgrade _getInferredFacts to empty array (B1 decision)"
```

---

### Task 2: FactProvider allowedFacts Attaches `__evidence`

**Files:**
- Modify: `src/narrative/FactProvider.js:107-170`
- Create: `tests/unit/narrative/fact-provider-evidence.test.js`

- [ ] **Step 1: Write the failing test — fact-provider-evidence.test.js**

Create `tests/unit/narrative/fact-provider-evidence.test.js`:

```js
/**
 * FactProvider Evidence Attachment Tests (v2.5-W1)
 *
 * Verify that FactProvider.getGroundingPackage() attaches _evidence
 * metadata to each allowedFact and produces evidenceSummary.
 */
import { describe, it, expect, beforeEach } from 'vitest';
const { createRequire } = await import('node:module');
const require = createRequire(import.meta.url);
const FactProvider = require('../../../src/narrative/FactProvider.js');
const WorldFactStore = require('../../../src/canon/WorldFactStore.js');
const KnowledgeStore = require('../../../src/knowledge/KnowledgeStore.js');
const { FactType, FactScope } = require('../../../src/canon/FactSchema.js');

describe('FactProvider — evidence attachment (v2.5-W1)', () => {
  let store;
  let knowledgeStore;
  let provider;

  beforeEach(() => {
    store = new WorldFactStore();
    knowledgeStore = new KnowledgeStore(store);
    provider = new FactProvider(store, null, null, knowledgeStore);
  });

  describe('allowedFacts carry _evidence', () => {
    it('knowledgeStore fact carries _evidence from KnowledgeStore', () => {
      const fact = store.addFact({
        id: 'fact_direct_1',
        type: 'event',
        eventId: 'evt_1',
        description: '直接经历事件',
        location: '图书馆',
        timestamp: new Date('2024-01-01T10:00:00Z'),
        source: 'engine',
        confidence: 1.0,
        scope: 'local',
        participants: ['alice'],
        observers: [],
      });

      knowledgeStore.addKnowledge('alice', fact.id, { source: 'direct', confidence: 1.0 });

      const grounding = provider.getGroundingPackage('alice');
      const allowedFact = grounding.allowedFacts.find(f => f.id === 'fact_direct_1');

      expect(allowedFact).toBeDefined();
      expect(allowedFact._evidence).toBeDefined();
      expect(allowedFact._evidence.source).toBe('direct');
      expect(allowedFact._evidence.confidence).toBe(1.0);
      expect(allowedFact._evidence.propagatedFrom).toBeNull();
    });

    it('told knowledge carries propagatedFrom', () => {
      const fact = store.addFact({
        id: 'fact_told_1',
        type: 'event',
        eventId: 'evt_told',
        description: '听说的事件',
        location: '食堂',
        timestamp: new Date('2024-01-01T10:00:00Z'),
        source: 'engine',
        confidence: 1.0,
        scope: 'public',
        participants: ['bob'],
        observers: [],
      });

      knowledgeStore.addKnowledge('alice', fact.id, { source: 'told', confidence: 0.6, propagatedFrom: 'bob' });

      const grounding = provider.getGroundingPackage('alice');
      const allowedFact = grounding.allowedFacts.find(f => f.id === 'fact_told_1');

      expect(allowedFact).toBeDefined();
      expect(allowedFact._evidence.source).toBe('told');
      expect(allowedFact._evidence.confidence).toBe(0.6);
      expect(allowedFact._evidence.propagatedFrom).toBe('bob');
    });

    it('inferred knowledge carries _evidence with source=inferred', () => {
      const fact = store.addFact({
        id: 'fact_inferred_1',
        type: 'event',
        eventId: 'evt_inf',
        description: '推断的事件',
        location: '图书馆',
        timestamp: new Date('2024-01-01T10:00:00Z'),
        source: 'engine',
        confidence: 1.0,
        scope: 'public',
        participants: [],
        observers: [],
      });

      knowledgeStore.addKnowledge('alice', fact.id, { source: 'inferred', confidence: 0.5 });

      const grounding = provider.getGroundingPackage('alice');
      const allowedFact = grounding.allowedFacts.find(f => f.id === 'fact_inferred_1');

      expect(allowedFact).toBeDefined();
      expect(allowedFact._evidence.source).toBe('inferred');
      expect(allowedFact._evidence.confidence).toBe(0.5);
    });

    it('PUBLIC fact without knowledgeStore entry gets default _evidence', () => {
      store.addFact({
        id: 'fact_public_1',
        type: 'event',
        eventId: 'evt_pub',
        description: '公开事件',
        location: '广场',
        timestamp: new Date('2024-01-01T10:00:00Z'),
        source: 'engine',
        confidence: 1.0,
        scope: 'public',
        participants: [],
        observers: [],
      });

      // No knowledgeStore entry for alice on this fact — it's PUBLIC so it appears anyway
      const grounding = provider.getGroundingPackage('alice');
      const allowedFact = grounding.allowedFacts.find(f => f.id === 'fact_public_1');

      expect(allowedFact).toBeDefined();
      expect(allowedFact._evidence).toBeDefined();
      expect(allowedFact._evidence.source).toBe('direct');
      expect(allowedFact._evidence.confidence).toBe(1.0);
    });

    it('AGENT_STATE(self) gets default _evidence', () => {
      store.addFact({
        id: 'fact_self_state',
        type: FactType.AGENT_STATE,
        agentId: 'alice',
        state: 'studying',
        region: '图书馆',
        timestamp: new Date('2024-01-01T10:00:00Z'),
        source: 'engine',
        confidence: 1.0,
        scope: 'public',
        participants: ['alice'],
      });

      const grounding = provider.getGroundingPackage('alice');
      const allowedFact = grounding.allowedFacts.find(f => f.id === 'fact_self_state');

      expect(allowedFact).toBeDefined();
      expect(allowedFact._evidence.source).toBe('direct');
    });

    it('forbiddenFacts do NOT carry _evidence', () => {
      store.addFact({
        id: 'fact_private_1',
        type: 'event',
        eventId: 'evt_priv',
        description: '私密事件',
        location: '小屋',
        timestamp: new Date('2024-01-01T10:00:00Z'),
        source: 'engine',
        confidence: 1.0,
        scope: 'local',
        participants: ['bob'],
        observers: [],
      });

      const grounding = provider.getGroundingPackage('alice');
      const forbiddenFact = grounding.forbiddenFacts.find(f => f.id === 'fact_private_1');

      if (forbiddenFact) {
        expect(forbiddenFact._evidence).toBeUndefined();
      }
    });
  });

  describe('evidenceSummary in metadata', () => {
    it('counts evidence sources correctly', () => {
      // Add 2 direct, 1 told, 1 inferred facts
      const fact1 = store.addFact({
        id: 'fact_d1', type: 'event', eventId: 'evt_d1', description: 'd1',
        location: '图书馆', timestamp: new Date('2024-01-01T10:00:00Z'),
        source: 'engine', confidence: 1.0, scope: 'local',
        participants: ['alice'], observers: [],
      });
      const fact2 = store.addFact({
        id: 'fact_d2', type: 'event', eventId: 'evt_d2', description: 'd2',
        location: '图书馆', timestamp: new Date('2024-01-01T10:00:00Z'),
        source: 'engine', confidence: 1.0, scope: 'local',
        participants: ['alice'], observers: [],
      });
      const fact3 = store.addFact({
        id: 'fact_t1', type: 'event', eventId: 'evt_t1', description: 't1',
        location: '食堂', timestamp: new Date('2024-01-01T10:00:00Z'),
        source: 'engine', confidence: 1.0, scope: 'public',
        participants: ['bob'], observers: [],
      });
      const fact4 = store.addFact({
        id: 'fact_i1', type: 'event', eventId: 'evt_i1', description: 'i1',
        location: '图书馆', timestamp: new Date('2024-01-01T10:00:00Z'),
        source: 'engine', confidence: 1.0, scope: 'public',
        participants: [], observers: [],
      });

      knowledgeStore.addKnowledge('alice', fact1.id, 'direct');
      knowledgeStore.addKnowledge('alice', fact2.id, 'direct');
      knowledgeStore.addKnowledge('alice', fact3.id, { source: 'told', confidence: 0.6, propagatedFrom: 'bob' });
      knowledgeStore.addKnowledge('alice', fact4.id, { source: 'inferred', confidence: 0.5 });

      const grounding = provider.getGroundingPackage('alice');

      expect(grounding.metadata.evidenceSummary).toBeDefined();
      expect(grounding.metadata.evidenceSummary.direct).toBe(2);
      expect(grounding.metadata.evidenceSummary.told).toBe(1);
      expect(grounding.metadata.evidenceSummary.inferred).toBe(1);
    });

    it('evidenceSummary omits zero-count sources', () => {
      store.addFact({
        id: 'fact_only_direct', type: 'event', eventId: 'evt_od', description: 'only direct',
        location: '图书馆', timestamp: new Date('2024-01-01T10:00:00Z'),
        source: 'engine', confidence: 1.0, scope: 'local',
        participants: ['alice'], observers: [],
      });

      knowledgeStore.addKnowledge('alice', 'fact_only_direct', 'direct');

      const grounding = provider.getGroundingPackage('alice');

      expect(grounding.metadata.evidenceSummary).toBeDefined();
      expect(grounding.metadata.evidenceSummary.direct).toBe(1);
      expect(grounding.metadata.evidenceSummary.told).toBeUndefined();
      expect(grounding.metadata.evidenceSummary.inferred).toBeUndefined();
    });
  });

  describe('no knowledgeStore fallback', () => {
    it('allowedFacts have no _evidence when knowledgeStore is absent', () => {
      const noKsProvider = new FactProvider(store, null, null, null);
      store.addFact({
        id: 'fact_pub_no_ks', type: 'event', eventId: 'evt_pub_nk', description: 'public',
        location: '广场', timestamp: new Date('2024-01-01T10:00:00Z'),
        source: 'engine', confidence: 1.0, scope: 'public',
        participants: [], observers: [],
      });

      const grounding = noKsProvider.getGroundingPackage('alice');
      const allowedFact = grounding.allowedFacts.find(f => f.id === 'fact_pub_no_ks');

      if (allowedFact) {
        // Without knowledgeStore, no evidence attached
        expect(allowedFact._evidence).toBeUndefined();
      }
    });

    it('no evidenceSummary when knowledgeStore is absent', () => {
      const noKsProvider = new FactProvider(store, null, null, null);

      const grounding = noKsProvider.getGroundingPackage('alice');
      expect(grounding.metadata.evidenceSummary).toBeUndefined();
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/narrative/fact-provider-evidence.test.js`
Expected: FAIL — `_evidence` is not currently attached to allowedFacts.

- [ ] **Step 3: Implement _evidence attachment in _getAllowedFacts and evidenceSummary in getGroundingPackage**

Modify `src/narrative/FactProvider.js`:

Replace `_getAllowedFacts` (lines 107-170) with:

```js
  /**
   * 角色确定知道的事实：
   * 1. 公共事实（scope: 'public'）— except AGENT_STATE for other agents
   * 2. 参与者包含该角色的事实
   * 3. 观察者包含该角色的事实
   * 4. 该角色的记忆事实
   * 5. 别人告诉该角色的事实（perspective: 'told'）
   *
   * v2.5: 附加 _evidence metadata 到每个 fact（当 knowledgeStore 存在时）
   * @private
   */
  _getAllowedFacts(agentId, options) {
    const result = [];
    const seenIds = new Set();

    // 1. Public facts are visible to all agents, EXCEPT:
    //    - AGENT_STATE for other agents (private knowledge: an agent's location is not public)
    //    - Only self's own AGENT_STATE enters allowedFacts via this path
    const allFacts = this.store.getAllFacts();
    for (const fact of allFacts) {
      if (!seenIds.has(fact.id) && this._isActiveFact(fact) && fact.scope === FactScope.PUBLIC) {
        // AGENT_STATE is private: only self's own state is visible
        if (fact.type === FactType.AGENT_STATE && fact.agentId !== agentId) {
          continue;
        }
        // v2.5: attach _evidence
        const allowedFact = this._attachEvidence(agentId, fact);
        result.push(allowedFact);
        seenIds.add(fact.id);
      }
    }

    // 2. Knowledge-store facts (explicit knowledge: direct/observed/told/inferred)
    if (this.knowledgeStore) {
      const knownFacts = this.knowledgeStore.getKnownFacts(agentId, options);
      for (const fact of knownFacts) {
        if (!seenIds.has(fact.id) && this._isActiveFact(fact)) {
          // v2.5: attach _evidence from KnowledgeStore
          const allowedFact = this._attachEvidence(agentId, fact);
          result.push(allowedFact);
          seenIds.add(fact.id);
        }
      }
    } else {
      // 3. Fallback: scope/role-based filtering when no knowledgeStore
      for (const fact of allFacts) {
        if (seenIds.has(fact.id) || !this._isActiveFact(fact)) continue;

        if (fact.participants && fact.participants.includes(agentId)) {
          result.push(fact);
          seenIds.add(fact.id);
          continue;
        }
        if (fact.observers && fact.observers.includes(agentId)) {
          result.push(fact);
          seenIds.add(fact.id);
          continue;
        }
        if (fact.type === FactType.MEMORY && fact.agentId === agentId) {
          result.push(fact);
          seenIds.add(fact.id);
          continue;
        }
        if (fact.type === FactType.OBSERVATION && fact.observerId === agentId) {
          result.push(fact);
          seenIds.add(fact.id);
          continue;
        }
        if (fact.type === FactType.RELATIONSHIP &&
            (fact.agentA === agentId || fact.agentB === agentId)) {
          result.push(fact);
          seenIds.add(fact.id);
          continue;
        }
      }
    }

    return result;
  }

  /**
   * 附加 _evidence 到 fact 对象
   * @param {string} agentId
   * @param {Object} fact
   * @returns {Object} fact with _evidence attached
   * @private
   */
  _attachEvidence(agentId, fact) {
    if (!this.knowledgeStore) return fact;

    const evidence = this.knowledgeStore.getEvidence(agentId, fact.id);
    if (evidence) {
      return {
        ...fact,
        _evidence: {
          source: evidence.source,
          confidence: evidence.confidence,
          propagatedFrom: evidence.propagatedFrom,
        },
      };
    }

    // No explicit evidence in KnowledgeStore — default to direct
    return {
      ...fact,
      _evidence: {
        source: 'direct',
        confidence: 1.0,
        propagatedFrom: null,
      },
    };
  }
```

Now add `evidenceSummary` to `getGroundingPackage` metadata. Replace the metadata construction in `getGroundingPackage` (lines 52-65) with:

```js
    const metadata = {
      agentId,
      currentTime: options.time || null,
      factCount: {
        allowed: allowedFacts.length,
        inferred: 0,  // v2.5: always 0 (B1 downgrade)
        forbidden: forbiddenFacts.length,
      },
    };

    // v2.5: evidence summary (only when knowledgeStore present)
    if (this.knowledgeStore) {
      const summary = {};
      for (const fact of allowedFacts) {
        if (fact._evidence) {
          const src = fact._evidence.source;
          summary[src] = (summary[src] || 0) + 1;
        }
      }
      // Remove zero-count entries (they're already absent from summary)
      metadata.evidenceSummary = summary;
    }
```

And update the grounding object construction to use this metadata variable:

```js
    const grounding = {
      allowedFacts,
      inferredFacts,
      forbiddenFacts,
      metadata,
    };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/narrative/fact-provider-evidence.test.js`
Expected: PASS

- [ ] **Step 5: Run broader regression check**

Run: `npx vitest run tests/facts/grounded-narrative.test.js`
Expected: PASS (existing tests should still work; _evidence is additive)

Run: `npx vitest run tests/e2e/epistemic-evidence-matrix.test.js`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/narrative/FactProvider.js tests/unit/narrative/fact-provider-evidence.test.js
git commit -m "feat(v2.5-w1): attach _evidence to allowedFacts and add evidenceSummary to metadata"
```

---

### Task 3: NarrativeBuilder Evidence-aware Grounding Rendering

**Files:**
- Modify: `src/narrative/FactFormatter.js`
- Modify: `src/sdk/NarrativeBuilder.js:261-296`
- Create: `tests/unit/narrative/narrative-builder-grounding.test.js`

- [ ] **Step 1: Write the failing test — narrative-builder-grounding.test.js**

Create `tests/unit/narrative/narrative-builder-grounding.test.js`:

```js
/**
 * NarrativeBuilder Evidence-aware Grounding Tests (v2.5-W1)
 *
 * Verify that _buildGroundingSection groups facts by evidence source
 * and annotates each group with appropriate source labels.
 */
import { describe, it, expect } from 'vitest';
const { createRequire } = await import('node:module');
const require = createRequire(import.meta.url);
const NarrativeBuilder = require('../../../src/sdk/NarrativeBuilder.js');
const { FactType } = require('../../../src/canon/FactSchema.js');

describe('NarrativeBuilder — evidence-aware grounding (v2.5-W1)', () => {
  describe('_buildGroundingSection source grouping', () => {
    it('renders direct facts without source annotation', () => {
      const grounding = {
        allowedFacts: [
          { id: 'f1', type: FactType.EVENT, description: '直接事件', location: '图书馆', _evidence: { source: 'direct', confidence: 1.0, propagatedFrom: null } },
        ],
        inferredFacts: [],
      };

      const section = NarrativeBuilder._buildGroundingSection(grounding);
      expect(section).toContain('直接事件');
      expect(section).not.toContain('听说');
      expect(section).not.toContain('推测');
    });

    it('renders told facts with source annotation', () => {
      const grounding = {
        allowedFacts: [
          { id: 'f2', type: FactType.EVENT, description: '听说的事件', location: '食堂', _evidence: { source: 'told', confidence: 0.6, propagatedFrom: 'bob' } },
        ],
        inferredFacts: [],
      };

      const section = NarrativeBuilder._buildGroundingSection(grounding);
      expect(section).toContain('听说的事件');
      expect(section).toContain('bob告诉你');
    });

    it('renders overheard facts with source annotation', () => {
      const grounding = {
        allowedFacts: [
          { id: 'f3', type: FactType.EVENT, description: '旁听的事件', location: '图书馆', _evidence: { source: 'overheard', confidence: 0.7, propagatedFrom: null } },
        ],
        inferredFacts: [],
      };

      const section = NarrativeBuilder._buildGroundingSection(grounding);
      expect(section).toContain('旁听的事件');
      expect(section).toContain('听闻');
    });

    it('renders inferred facts with "推测" annotation', () => {
      const grounding = {
        allowedFacts: [
          { id: 'f4', type: FactType.EVENT, description: '推断的事件', location: '图书馆', _evidence: { source: 'inferred', confidence: 0.5, propagatedFrom: null } },
        ],
        inferredFacts: [],
      };

      const section = NarrativeBuilder._buildGroundingSection(grounding);
      expect(section).toContain('推断的事件');
      expect(section).toContain('推测');
    });

    it('renders observed facts without source annotation', () => {
      const grounding = {
        allowedFacts: [
          { id: 'f5', type: FactType.EVENT, description: '亲眼看到的事件', location: '图书馆', _evidence: { source: 'observed', confidence: 0.9, propagatedFrom: null } },
        ],
        inferredFacts: [],
      };

      const section = NarrativeBuilder._buildGroundingSection(grounding);
      expect(section).toContain('亲眼看到的事件');
      expect(section).not.toContain('听说');
      expect(section).not.toContain('推测');
    });

    it('groups facts by source with section headers', () => {
      const grounding = {
        allowedFacts: [
          { id: 'f1', type: FactType.EVENT, description: '直接事件', location: '图书馆', _evidence: { source: 'direct', confidence: 1.0, propagatedFrom: null } },
          { id: 'f2', type: FactType.EVENT, description: '听说事件', location: '食堂', _evidence: { source: 'told', confidence: 0.6, propagatedFrom: 'bob' } },
          { id: 'f3', type: FactType.EVENT, description: '推断事件', location: '图书馆', _evidence: { source: 'inferred', confidence: 0.5, propagatedFrom: null } },
        ],
        inferredFacts: [],
      };

      const section = NarrativeBuilder._buildGroundingSection(grounding);
      // Should contain all facts
      expect(section).toContain('直接事件');
      expect(section).toContain('听说事件');
      expect(section).toContain('推断事件');
      // Should contain source annotations
      expect(section).toContain('bob告诉你');
      expect(section).toContain('推测');
    });

    it('renders facts without _evidence as direct (backward compat)', () => {
      const grounding = {
        allowedFacts: [
          { id: 'f_old', type: FactType.EVENT, description: '旧格式事件', location: '图书馆' },
        ],
        inferredFacts: [],
      };

      const section = NarrativeBuilder._buildGroundingSection(grounding);
      expect(section).toContain('旧格式事件');
    });

    it('updated constraint text mentions source attribution rules', () => {
      const grounding = {
        allowedFacts: [],
        inferredFacts: [],
      };

      const section = NarrativeBuilder._buildGroundingSection(grounding);
      expect(section).toContain('听闻');
      expect(section).toContain('推测');
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/narrative/narrative-builder-grounding.test.js`
Expected: FAIL — current `_buildGroundingSection` does not group by source or annotate.

- [ ] **Step 3: Add FactFormatter.toNaturalLanguageWithSource method**

Add to `src/narrative/FactFormatter.js` after `batchToNaturalLanguage`:

```js
  /**
   * 事实→自然语言 + 来源标注
   * @param {Object} fact
   * @returns {string}
   */
  static toNaturalLanguageWithSource(fact) {
    const base = FactFormatter.toNaturalLanguage(fact);
    if (!fact._evidence) return base;

    const { source, propagatedFrom } = fact._evidence;

    switch (source) {
      case 'direct':
      case 'observed':
        return base;
      case 'overheard':
        return `${base}（听闻）`;
      case 'told':
        return propagatedFrom ? `${base}（${propagatedFrom}告诉你）` : `${base}（听闻）`;
      case 'inferred':
        return `${base}（推测）`;
      default:
        return base;
    }
  }
```

- [ ] **Step 4: Implement evidence-aware _buildGroundingSection**

Replace `_buildGroundingSection` in `src/sdk/NarrativeBuilder.js` (lines 261-296) with:

```js
  // ═══════════════════════════════════════════
  // 事实约束（grounding package）— v2.5 evidence-aware
  // ═══════════════════════════════════════════
  static _buildGroundingSection(groundingPackage) {
    const sections = [];

    sections.push(`# 事实约束
你必须基于以下事实进行表达，不能编造新事实。
- 你只能引用"你知道的事实"中的内容
- 你不能提及"你不知道的事实"中的任何内容
- 对于来源不同的事实，表达方式有约束：
  - 直接经历的事实：可以自由表达
  - 亲眼看到的事实：可以自由表达
  - 听闻的事实（标注"听闻"）：须用"听说"等表述
  - 别人告诉你的事实（标注来源）：须用"XX告诉我"等表述
  - 推断的事实（标注"推测"）：须用"我推测"或"大概"等表述
- 你的表达方式（语气、措辞、情绪强度）可以自由发挥`);

    if (groundingPackage.allowedFacts && groundingPackage.allowedFacts.length > 0) {
      // v2.5: group by evidence source for clarity
      const grouped = NarrativeBuilder._groupFactsBySource(groundingPackage.allowedFacts);
      const factLines = [];

      // direct/observed: no annotation needed
      if (grouped.direct.length > 0) {
        for (const f of grouped.direct.slice(0, 15)) {
          factLines.push(`- ${FactFormatter.toNaturalLanguage(f)}`);
        }
      }
      if (grouped.observed.length > 0) {
        for (const f of grouped.observed.slice(0, 10)) {
          factLines.push(`- ${FactFormatter.toNaturalLanguage(f)}`);
        }
      }

      // overheard: annotated
      if (grouped.overheard.length > 0) {
        for (const f of grouped.overheard.slice(0, 5)) {
          factLines.push(`- ${FactFormatter.toNaturalLanguageWithSource(f)}`);
        }
      }

      // told: annotated with source
      if (grouped.told.length > 0) {
        for (const f of grouped.told.slice(0, 5)) {
          factLines.push(`- ${FactFormatter.toNaturalLanguageWithSource(f)}`);
        }
      }

      // inferred: annotated as "推测"
      if (grouped.inferred.length > 0) {
        for (const f of grouped.inferred.slice(0, 5)) {
          factLines.push(`- ${FactFormatter.toNaturalLanguageWithSource(f)}`);
        }
      }

      // Fallback for facts without _evidence (backward compat)
      if (grouped.unknown.length > 0) {
        for (const f of grouped.unknown.slice(0, 10)) {
          factLines.push(`- ${FactFormatter.toNaturalLanguage(f)}`);
        }
      }

      // If nothing was rendered (shouldn't happen but defensive), render all
      if (factLines.length === 0) {
        for (const f of groundingPackage.allowedFacts.slice(0, 20)) {
          factLines.push(`- ${FactFormatter.toNaturalLanguage(f)}`);
        }
      }

      sections.push(`# 你知道的事实
${factLines.join('\n')}`);
    }

    // v2.5: inferredFacts is always empty (B1 downgrade), no section rendered

    if (groundingPackage.locationMeaning) {
      sections.push(`# 当前地点\n${groundingPackage.locationMeaning}`);
    }

    if (groundingPackage.behaviorTendency) {
      sections.push(`# 你的倾向\n${groundingPackage.behaviorTendency}`);
    }

    return sections.join('\n\n');
  }

  /**
   * Group allowedFacts by evidence source
   * @param {Object[]} facts
   * @returns {Object} { direct, observed, overheard, told, inferred, unknown }
   * @private
   */
  static _groupFactsBySource(facts) {
    const groups = { direct: [], observed: [], overheard: [], told: [], inferred: [], unknown: [] };
    for (const f of facts) {
      const src = f._evidence?.source;
      if (!src) { groups.unknown.push(f); continue; }
      if (groups[src]) { groups[src].push(f); }
      else { groups.unknown.push(f); }
    }
    return groups;
  }
```

Also add the import for FactFormatter at the top if not already imported — it is already imported at line 14.

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run tests/unit/narrative/narrative-builder-grounding.test.js`
Expected: PASS

- [ ] **Step 6: Run regression on existing NarrativeBuilder tests**

Run: `npx vitest run tests/facts/grounded-narrative.test.js`
Expected: PASS (existing tests check for string presence like "事实约束", "不能编造新事实", etc.)

- [ ] **Step 7: Commit**

```bash
git add src/narrative/FactFormatter.js src/sdk/NarrativeBuilder.js tests/unit/narrative/narrative-builder-grounding.test.js
git commit -m "feat(v2.5-w1): evidence-aware grounding rendering in NarrativeBuilder and FactFormatter"
```

---

### Task 4: FactConsistencyChecker — missing_source_attribution + 4-layer severity

**Files:**
- Modify: `src/narrative/FactConsistencyChecker.js`
- Modify: `tests/unit/narrative/fact-consistency-checker.test.js`

- [ ] **Step 1: Write the failing tests**

Add to `tests/unit/narrative/fact-consistency-checker.test.js`:

```js
// ═══════════════════════════════════════════
// _checkMissingSourceAttribution (v2.5-W1)
// ═══════════════════════════════════════════
describe('_checkMissingSourceAttribution (v2.5-W1)', () => {
  it('flags told fact expressed without source marker', () => {
    const c = makeChecker();
    const grounding = makeGrounding({
      allowedFacts: [
        { type: FactType.EVENT, description: '鲍勃找到了一本书', location: '图书馆', _evidence: { source: 'told', confidence: 0.6, propagatedFrom: 'bob' } },
      ],
    });
    // "鲍勃找到了一本书" expressed as certain fact without "听说/告诉我"
    const r = c.check('鲍勃找到了一本书', grounding);
    expect(r.violations.some(v => v.type === 'missing_source_attribution')).toBe(true);
  });

  it('flags inferred fact expressed without "推测/大概"', () => {
    const c = makeChecker();
    const grounding = makeGrounding({
      allowedFacts: [
        { type: FactType.EVENT, description: '食堂发生了聚餐', location: '食堂', _evidence: { source: 'inferred', confidence: 0.5, propagatedFrom: null } },
      ],
    });
    const r = c.check('食堂发生了聚餐', grounding);
    expect(r.violations.some(v => v.type === 'missing_source_attribution')).toBe(true);
  });

  it('does NOT flag told fact with "听说" marker', () => {
    const c = makeChecker();
    const grounding = makeGrounding({
      allowedFacts: [
        { type: FactType.EVENT, description: '鲍勃找到了一本书', location: '图书馆', _evidence: { source: 'told', confidence: 0.6, propagatedFrom: 'bob' } },
      ],
    });
    const r = c.check('我听说鲍勃找到了一本书', grounding);
    expect(r.violations.some(v => v.type === 'missing_source_attribution')).toBe(false);
  });

  it('does NOT flag told fact with "告诉我" marker', () => {
    const c = makeChecker();
    const grounding = makeGrounding({
      allowedFacts: [
        { type: FactType.EVENT, description: '鲍勃在食堂吃饭', location: '食堂', _evidence: { source: 'told', confidence: 0.6, propagatedFrom: 'bob' } },
      ],
    });
    const r = c.check('bob告诉我鲍勃在食堂吃饭', grounding);
    expect(r.violations.some(v => v.type === 'missing_source_attribution')).toBe(false);
  });

  it('does NOT flag inferred fact with "推测" marker', () => {
    const c = makeChecker();
    const grounding = makeGrounding({
      allowedFacts: [
        { type: FactType.EVENT, description: '食堂发生了聚餐', location: '食堂', _evidence: { source: 'inferred', confidence: 0.5, propagatedFrom: null } },
      ],
    });
    const r = c.check('我推测食堂发生了聚餐', grounding);
    expect(r.violations.some(v => v.type === 'missing_source_attribution')).toBe(false);
  });

  it('does NOT flag inferred fact with "大概" marker', () => {
    const c = makeChecker();
    const grounding = makeGrounding({
      allowedFacts: [
        { type: FactType.EVENT, description: '食堂有人', location: '食堂', _evidence: { source: 'inferred', confidence: 0.5, propagatedFrom: null } },
      ],
    });
    const r = c.check('食堂大概有人', grounding);
    expect(r.violations.some(v => v.type === 'missing_source_attribution')).toBe(false);
  });

  it('does NOT flag direct/observed facts', () => {
    const c = makeChecker();
    const grounding = makeGrounding({
      allowedFacts: [
        { type: FactType.EVENT, description: '直接事件', location: '图书馆', _evidence: { source: 'direct', confidence: 1.0, propagatedFrom: null } },
        { type: FactType.EVENT, description: '观察事件', location: '图书馆', _evidence: { source: 'observed', confidence: 0.9, propagatedFrom: null } },
      ],
    });
    const r = c.check('直接事件发生了，观察事件也发生了', grounding);
    expect(r.violations.some(v => v.type === 'missing_source_attribution')).toBe(false);
  });

  it('does NOT flag facts without _evidence (backward compat)', () => {
    const c = makeChecker();
    const grounding = makeGrounding({
      allowedFacts: [
        { type: FactType.EVENT, description: '无证据事件', location: '图书馆' },
      ],
    });
    const r = c.check('无证据事件发生了', grounding);
    expect(r.violations.some(v => v.type === 'missing_source_attribution')).toBe(false);
  });
});

// ═══════════════════════════════════════════
// 4-layer severity (v2.5-W1)
// ═══════════════════════════════════════════
describe('4-layer severity (v2.5-W1)', () => {
  it('severity=warning for missing_source_attribution only', () => {
    const c = makeChecker();
    const grounding = makeGrounding({
      allowedFacts: [
        { type: FactType.EVENT, description: '听说的事', location: '食堂', _evidence: { source: 'told', confidence: 0.6, propagatedFrom: 'bob' } },
      ],
    });
    const r = c.check('听说的事', grounding);
    expect(r.violations.some(v => v.type === 'missing_source_attribution')).toBe(true);
    expect(r.severity).toBe('warning');
  });

  it('severity=warning for inferred without marker only', () => {
    const c = makeChecker();
    const grounding = makeGrounding({
      allowedFacts: [
        { type: FactType.EVENT, description: '推断的事', location: '图书馆', _evidence: { source: 'inferred', confidence: 0.5, propagatedFrom: null } },
      ],
    });
    const r = c.check('推断的事', grounding);
    expect(r.severity).toBe('warning');
  });

  it('severity=reject when both warning and reject violations exist', () => {
    const c = makeChecker();
    const grounding = makeGrounding({
      allowedFacts: [
        { type: FactType.EVENT, description: '听说的事', location: '食堂', _evidence: { source: 'told', confidence: 0.6, propagatedFrom: 'bob' } },
      ],
    });
    // Both missing_source_attribution + new_event
    const r = c.check('听说的事，刚刚吃了一顿大餐了', grounding);
    expect(r.severity).toBe('reject');
  });

  it('severity=pass when no violations', () => {
    const c = makeChecker();
    const r = c.check('今天天气不错', makeGrounding());
    expect(r.severity).toBe('pass');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/narrative/fact-consistency-checker.test.js`
Expected: FAIL — `_checkMissingSourceAttribution` doesn't exist yet, and severity doesn't return 'warning'.

- [ ] **Step 3: Implement _checkMissingSourceAttribution and upgrade severity**

Add `_checkMissingSourceAttribution` method to `src/narrative/FactConsistencyChecker.js` before `_computeSeverity`:

```js
  /**
   * 来源标注校验 (v2.5-W1)
   *
   * 反向检查：grounding 中有 told/inferred 级别事实，但 narrative
   * 无任何来源标记语（"我听说"/"XX告诉我"/"我推测"/"大概"等），
   * 则触发 warning。
   *
   * @private
   */
  _checkMissingSourceAttribution(text, grounding) {
    const violations = [];
    if (!grounding || !grounding.allowedFacts) return violations;

    // Source markers in text that indicate attribution
    const toldMarkers = ['听说', '告诉我', '告诉过', '说的', '跟我说的', '跟我讲'];
    const inferredMarkers = ['推测', '大概', '可能', '估计', '猜测', '也许', '应该'];

    // Collect told/inferred facts from grounding
    const toldFacts = [];
    const inferredFacts = [];

    for (const fact of grounding.allowedFacts) {
      if (!fact._evidence) continue;
      const src = fact._evidence.source;
      const desc = fact.description || '';

      if (src === 'told') {
        toldFacts.push(desc);
      } else if (src === 'inferred') {
        inferredFacts.push(desc);
      }
    }

    // Check: told facts must have attribution markers in text
    for (const desc of toldFacts) {
      if (desc.length < 2) continue;
      // If the description content appears in text but without attribution
      if (this._textContainsFactContent(text, desc)) {
        const hasAttribution = toldMarkers.some(m => text.includes(m));
        if (!hasAttribution) {
          violations.push({
            type: 'missing_source_attribution',
            source: 'told',
            fact: desc,
            message: `听闻级别事实"${desc}"未标注来源`,
          });
        }
      }
    }

    // Check: inferred facts must have hedging markers in text
    for (const desc of inferredFacts) {
      if (desc.length < 2) continue;
      if (this._textContainsFactContent(text, desc)) {
        const hasHedging = inferredMarkers.some(m => text.includes(m)) ||
                           toldMarkers.some(m => text.includes(m));
        if (!hasHedging) {
          violations.push({
            type: 'missing_source_attribution',
            source: 'inferred',
            fact: desc,
            message: `推断级别事实"${desc}"未标注"推测"或"大概"`,
          });
        }
      }
    }

    return violations;
  }

  /**
   * 检查文本是否包含事实描述的关键内容
   * @private
   */
  _textContainsFactContent(text, description) {
    // Simple substring check — if description appears in text
    if (text.includes(description)) return true;
    // Check partial match for longer descriptions (at least 4 chars overlap)
    if (description.length >= 4) {
      for (let i = 0; i <= description.length - 4; i++) {
        const fragment = description.substring(i, i + 4);
        if (text.includes(fragment)) return true;
      }
    }
    return false;
  }
```

Update `check()` to call the new checker (add after line 50, before `_checkAgentLocationClaims`):

```js
    // 7. 来源标注校验 (v2.5-W1)
    violations.push(...this._checkMissingSourceAttribution(llmOutput, grounding));
```

Update `_computeSeverity` to support 4 layers:

```js
  /**
   * 计算严重程度 (v2.5: 4-layer)
   * @private
   */
  _computeSeverity(violations) {
    if (violations.length === 0) return 'pass';

    // 新事件或新关系 → reject
    if (violations.some(v => v.type === 'new_event' || v.type === 'new_relationship')) {
      return 'reject';
    }

    // 未知角色或地点或不支持的声明 → rewrite
    if (violations.some(v => v.type === 'unknown_character' || v.type === 'unknown_location' || v.type === 'unsupported_claim')) {
      return 'rewrite';
    }

    // 来源标注缺失 → warning (v2.5)
    if (violations.some(v => v.type === 'missing_source_attribution')) {
      return 'warning';
    }

    // 其他 → degrade_to_template
    return 'degrade_to_template';
  }
```

Update `_suggestFix` to handle the new violation type:

Add to the switch statement in `_suggestFix`:

```js
        case 'missing_source_attribution':
          suggestions.push(`为"${v.fact}"添加来源标注（${v.source === 'told' ? '听说/XX告诉我' : '推测/大概'}）`);
          break;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/narrative/fact-consistency-checker.test.js`
Expected: PASS

- [ ] **Step 5: Run corpus test regression**

Run: `npx vitest run tests/unit/narrative-violation-corpus.test.js`
Expected: PASS (existing corpus samples don't use _evidence so won't trigger missing_source_attribution)

- [ ] **Step 6: Commit**

```bash
git add src/narrative/FactConsistencyChecker.js tests/unit/narrative/fact-consistency-checker.test.js
git commit -m "feat(v2.5-w1): add missing_source_attribution checker and 4-layer severity"
```

---

### Task 5: Corpus Expansion to W1 Target (20 entries)

**Files:**
- Modify: `tests/fixtures/narrative-violations/index.js`
- Modify: `tests/unit/narrative-violation-corpus.test.js`

- [ ] **Step 1: Expand corpus fixture to 20 entries**

Replace the entire `corpus` array in `tests/fixtures/narrative-violations/index.js` with:

```js
const corpus = [
  // ─── unknown_character (角色名): [标点](2-4字)(?=动词) ───
  {
    id: 'nv-001',
    category: 'unknown_character',
    description: 'LLM 提到 grounding 未知角色（动词前）',
    llmOutput: '，小明说道今天有点累。',
    grounding: baseGrounding(),
    expectedViolations: [{ type: 'unknown_character' }],
  },
  {
    id: 'nv-002',
    category: 'unknown_character',
    description: 'LLM 提到另一未知角色',
    llmOutput: '，小红告诉了你一个秘密。',
    grounding: baseGrounding(),
    expectedViolations: [{ type: 'unknown_character' }],
  },
  {
    id: 'nv-003',
    category: 'unknown_character',
    description: 'LLM 提到第三个未知角色',
    llmOutput: '，小华来了图书馆。',
    grounding: baseGrounding(),
    expectedViolations: [{ type: 'unknown_character' }],
  },

  // ─── unknown_location (地名): [在去到从]XX ───
  {
    id: 'nv-004',
    category: 'unknown_location',
    description: 'LLM 编造 grounding 外地点（去XX模式）',
    llmOutput: '我去了火星探险。',
    grounding: baseGrounding(),
    expectedViolations: [{ type: 'unknown_location' }],
  },
  {
    id: 'nv-005',
    category: 'unknown_location',
    description: 'LLM 在未配置地点（去XX模式）',
    llmOutput: '我去咖啡馆了。',
    grounding: baseGrounding(),
    expectedViolations: [{ type: 'unknown_location' }],
  },

  // ─── unknown_event (事件知识): 那次XX/上次XX ───
  {
    id: 'nv-006',
    category: 'unknown_event',
    description: 'LLM 引用未知事件（上次XX）',
    llmOutput: '上次考试你考了满分这件事真厉害。',
    grounding: baseGrounding(),
    expectedViolations: [{ type: 'unknown_event' }],
  },
  {
    id: 'nv-007',
    category: 'unknown_event',
    description: 'LLM 引用未知事件（那次XX）',
    llmOutput: '那次运动会你跑了第一名真的很强。',
    grounding: baseGrounding(),
    expectedViolations: [{ type: 'unknown_event' }],
  },

  // ─── time_conflict: 白天含深夜/凌晨 ───
  {
    id: 'nv-008',
    category: 'time_conflict',
    description: '白天（10点）提到深夜',
    llmOutput: '深夜的时候你还在学习。',
    grounding: baseGrounding(),
    expectedViolations: [{ type: 'time_conflict' }],
  },
  {
    id: 'nv-009',
    category: 'time_conflict',
    description: '白天（10点）提到凌晨',
    llmOutput: '凌晨三点你突然醒了。',
    grounding: baseGrounding(),
    expectedViolations: [{ type: 'time_conflict' }],
  },

  // ─── new_relationship: 成为XX朋友 ───
  {
    id: 'nv-010',
    category: 'new_relationship',
    description: 'LLM 编造新关系变化',
    llmOutput: '你和小明成为了好朋友。',
    grounding: baseGrounding(),
    expectedViolations: [{ type: 'new_relationship' }],
  },

  // ─── new_event: 刚刚XX了 ───
  {
    id: 'nv-011',
    category: 'new_event',
    description: 'LLM 编造新事件（刚刚XX了）',
    llmOutput: '刚刚吃了一顿大餐了。',
    grounding: baseGrounding(),
    expectedViolations: [{ type: 'new_event' }],
  },

  // ═══════════════════════════════════════════
  // v2.5-W1 新增：evidence-aware violation entries
  // ═══════════════════════════════════════════

  // ─── missing_source_attribution: told without marker ───
  {
    id: 'nv-012',
    category: 'missing_source_attribution',
    description: 'told 级别事实未标注来源',
    llmOutput: '鲍勃找到了一本好书。',
    grounding: baseGrounding({
      allowedFacts: [
        { type: FactType.AGENT_STATE, agentId: KNOWN_AGENT },
        { type: FactType.AGENT_STATE, agentId: KNOWN_OTHER },
        { type: FactType.EVENT, description: '鲍勃找到了一本好书', location: '图书馆', _evidence: { source: 'told', confidence: 0.6, propagatedFrom: KNOWN_OTHER } },
      ],
    }),
    expectedViolations: [{ type: 'missing_source_attribution' }],
  },
  {
    id: 'nv-013',
    category: 'missing_source_attribution',
    description: 'inferred 级别事实未标注推测',
    llmOutput: '食堂发生了有趣的事。',
    grounding: baseGrounding({
      allowedFacts: [
        { type: FactType.AGENT_STATE, agentId: KNOWN_AGENT },
        { type: FactType.AGENT_STATE, agentId: KNOWN_OTHER },
        { type: FactType.EVENT, description: '食堂发生了有趣的事', location: '食堂', _evidence: { source: 'inferred', confidence: 0.5, propagatedFrom: null } },
      ],
    }),
    expectedViolations: [{ type: 'missing_source_attribution' }],
  },
  {
    id: 'nv-014',
    category: 'missing_source_attribution',
    description: 'inferred 表达成确定事实',
    llmOutput: '食堂大概有人聚餐。',
    grounding: baseGrounding({
      allowedFacts: [
        { type: FactType.AGENT_STATE, agentId: KNOWN_AGENT },
        { type: FactType.AGENT_STATE, agentId: KNOWN_OTHER },
        { type: FactType.EVENT, description: '食堂大概有人聚餐', location: '食堂', _evidence: { source: 'inferred', confidence: 0.5, propagatedFrom: null } },
      ],
    }),
    expectedViolations: [],  // "大概" is a valid hedging marker → no violation
  },

  // ─── pass samples (no violations expected) ───
  {
    id: 'nv-015',
    category: 'pass',
    description: 'told 事实正确标注"听说"',
    llmOutput: '我听说鲍勃找到了一本好书。',
    grounding: baseGrounding({
      allowedFacts: [
        { type: FactType.AGENT_STATE, agentId: KNOWN_AGENT },
        { type: FactType.AGENT_STATE, agentId: KNOWN_OTHER },
        { type: FactType.EVENT, description: '鲍勃找到了一本好书', location: '图书馆', _evidence: { source: 'told', confidence: 0.6, propagatedFrom: KNOWN_OTHER } },
      ],
    }),
    expectedViolations: [],
  },
  {
    id: 'nv-016',
    category: 'pass',
    description: 'inferred 事实正确标注"推测"',
    llmOutput: '我推测食堂有人聚餐。',
    grounding: baseGrounding({
      allowedFacts: [
        { type: FactType.AGENT_STATE, agentId: KNOWN_AGENT },
        { type: FactType.AGENT_STATE, agentId: KNOWN_OTHER },
        { type: FactType.EVENT, description: '食堂有人聚餐', location: '食堂', _evidence: { source: 'inferred', confidence: 0.5, propagatedFrom: null } },
      ],
    }),
    expectedViolations: [],
  },
  {
    id: 'nv-017',
    category: 'pass',
    description: 'direct 事实自由表达',
    llmOutput: '今天在图书馆看了一天的书。',
    grounding: baseGrounding({
      allowedFacts: [
        { type: FactType.AGENT_STATE, agentId: KNOWN_AGENT },
        { type: FactType.EVENT, description: '在图书馆看书', location: '图书馆', _evidence: { source: 'direct', confidence: 1.0, propagatedFrom: null } },
      ],
    }),
    expectedViolations: [],
  },

  // ─── boundary cases (may_detect: false) ───
  {
    id: 'nv-018',
    category: 'missing_source_attribution',
    description: '模糊来源标注"好像听说"（boundary）',
    llmOutput: '我好像听说鲍勃找到了一本好书。',
    grounding: baseGrounding({
      allowedFacts: [
        { type: FactType.AGENT_STATE, agentId: KNOWN_AGENT },
        { type: FactType.AGENT_STATE, agentId: KNOWN_OTHER },
        { type: FactType.EVENT, description: '鲍勃找到了一本好书', location: '图书馆', _evidence: { source: 'told', confidence: 0.6, propagatedFrom: KNOWN_OTHER } },
      ],
    }),
    expectedViolations: [],
    may_detect: false,  // "好像听说" contains "听说" so checker may pass it — boundary
  },
  {
    id: 'nv-019',
    category: 'missing_source_attribution',
    description: '间接表达 inferred 事实（boundary）',
    llmOutput: '食堂那边估计挺热闹。',
    grounding: baseGrounding({
      allowedFacts: [
        { type: FactType.AGENT_STATE, agentId: KNOWN_AGENT },
        { type: FactType.EVENT, description: '食堂有聚餐', location: '食堂', _evidence: { source: 'inferred', confidence: 0.5, propagatedFrom: null } },
      ],
    }),
    expectedViolations: [],
    may_detect: false,  // "估计" is a hedging marker — checker may or may not detect it
  },
  {
    id: 'nv-020',
    category: 'unknown_character',
    description: '语义等价人名 "Ming" 替代 "小明"（boundary）',
    llmOutput: '，Ming说道今天有点累。',
    grounding: baseGrounding(),
    expectedViolations: [{ type: 'unknown_character' }],
    may_detect: false,  // regex only matches Chinese chars — English name won't trigger
  },
];
```

- [ ] **Step 2: Update corpus test expectations**

Replace `tests/unit/narrative-violation-corpus.test.js` with:

```js
/**
 * Narrative Violation Corpus 检出率测试 (v2.5-W1)
 *
 * 遍历 corpus，对每条跑 FactConsistencyChecker，断言检出 expectedViolations 类别。
 * 统计 gate rate 和 boundary rate，按 RFC §4.2 质量门槛判定。
 *
 * W1 目标：20 条，gate rate ≥85%，boundary ≥3 条单独报告。
 */

import { describe, it, expect } from 'vitest';
const { createRequire } = await import('node:module');
const require = createRequire(import.meta.url);
const FactConsistencyChecker = require('../../src/narrative/FactConsistencyChecker.js');
const { corpus, KNOWN_REGIONS } = require('../fixtures/narrative-violations/index.js');

const GATE_RATE_THRESHOLD = 0.85; // RFC §4.2

describe('Narrative Violation Corpus — 检出率 (v2.5-W1)', () => {
  const checker = new FactConsistencyChecker({}, { regions: KNOWN_REGIONS });

  it('corpus 至少 20 条', () => {
    expect(corpus.length).toBeGreaterThanOrEqual(20);
  });

  // 每条样本单独断言（便于失败时定位）
  for (const sample of corpus) {
    it(`${sample.id} [${sample.category}] 应检出 ${sample.expectedViolations.map(v => v.type).join(',') || '(pass)'}`, () => {
      const result = checker.check(sample.llmOutput, sample.grounding);
      const gotTypes = result.violations.map(v => v.type);

      if (sample.expectedViolations.length === 0) {
        // pass sample — should have no violations
        expect(gotTypes.length, `样本 ${sample.id} 应无 violation，实际检出: ${gotTypes.join(',') || '(none)'}`).toBe(0);
      } else {
        for (const expected of sample.expectedViolations) {
          expect(gotTypes, `样本 ${sample.id} 应检出 ${expected.type}，实际检出: ${gotTypes.join(',') || '(none)'}`).toContain(expected.type);
        }
      }
    });
  }

  it('gate rate ≥85% (RFC §4.2)', () => {
    // Gate cases = samples with expected violations and may_detect !== false
    const gateCases = corpus.filter(c => c.expectedViolations.length > 0 && c.may_detect !== false);
    let detected = 0;
    const details = [];

    for (const sample of gateCases) {
      const result = checker.check(sample.llmOutput, sample.grounding);
      const gotTypes = result.violations.map(v => v.type);
      const expectedTypes = sample.expectedViolations.map(v => v.type);
      const matched = expectedTypes.some(t => gotTypes.includes(t));
      if (matched) {
        detected++;
      } else {
        details.push(`${sample.id} MISS (expected ${expectedTypes.join(',')}, got ${gotTypes.join(',') || '(none)'})`);
      }
    }

    const rate = detected / gateCases.length;
    if (rate < GATE_RATE_THRESHOLD) {
      expect.fail(
        `Gate rate ${(rate * 100).toFixed(0)}% < ${(GATE_RATE_THRESHOLD * 100).toFixed(0)}% 阈值。\n` +
        `漏报样本:\n${details.map(d => '  ' + d).join('\n')}\n\n` +
        `不要调 checker 掩盖漏报。检查样本是否对齐 checker 实际触发条件。`
      );
    }
  });

  it('pass 样本误报 ≤1 条', () => {
    const passSamples = corpus.filter(c => c.expectedViolations.length === 0);
    let falsePositives = 0;
    const details = [];

    for (const sample of passSamples) {
      const result = checker.check(sample.llmOutput, sample.grounding);
      if (result.violations.length > 0) {
        falsePositives++;
        details.push(`${sample.id} FP (got ${result.violations.map(v => v.type).join(',')})`);
      }
    }

    if (falsePositives > 1) {
      expect.fail(
        `Pass 样本误报 ${falsePositives} > 1 条上限。\n` +
        `误报样本:\n${details.map(d => '  ' + d).join('\n')}`
      );
    }
  });

  it('corpus 覆盖至少 7 类 violation（含 missing_source_attribution）', () => {
    const categories = new Set(
      corpus
        .filter(c => c.expectedViolations.length > 0)
        .map(c => c.category)
    );
    expect(categories.size).toBeGreaterThanOrEqual(7);
    expect(categories.has('missing_source_attribution')).toBe(true);
  });

  it('boundary cases 单独报告检出率', () => {
    const boundaryCases = corpus.filter(c => c.may_detect === false);
    expect(boundaryCases.length, 'boundary cases 应 ≥3').toBeGreaterThanOrEqual(3);

    let detected = 0;
    const details = [];
    for (const sample of boundaryCases) {
      const result = checker.check(sample.llmOutput, sample.grounding);
      const gotTypes = result.violations.map(v => v.type);
      const expectedTypes = sample.expectedViolations.map(v => v.type);

      if (expectedTypes.length === 0) {
        // pass boundary — should have no violations
        if (gotTypes.length === 0) detected++;
        else details.push(`${sample.id} FP (got ${gotTypes.join(',')})`);
      } else {
        const matched = expectedTypes.some(t => gotTypes.includes(t));
        if (matched) detected++;
        else details.push(`${sample.id} MISS (expected ${expectedTypes.join(',')}, got ${gotTypes.join(',') || '(none)'})`);
      }
    }

    const rate = detected / boundaryCases.length;
    // Log boundary rate but don't gate on it
    console.log(`Boundary rate: ${(rate * 100).toFixed(0)}% (${detected}/${boundaryCases.length})`);
    if (details.length > 0) {
      console.log('Boundary details:\n' + details.map(d => '  ' + d).join('\n'));
    }
  });
});
```

- [ ] **Step 3: Run test to verify it passes**

Run: `npx vitest run tests/unit/narrative-violation-corpus.test.js`
Expected: PASS — all 20 samples should work with the current checker

**Key note:** nv-018 has `"好像听说"` which contains `"听说"`, so checker should NOT flag it (toldMarkers includes '听说'). nv-019 has `"估计"` which is in inferredMarkers. nv-020 uses English name "Ming" which the regex won't catch — it's a boundary case with `may_detect: false`.

- [ ] **Step 4: Run broader regression**

Run: `npx vitest run tests/unit/narrative/fact-consistency-checker.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add tests/fixtures/narrative-violations/index.js tests/unit/narrative-violation-corpus.test.js
git commit -m "feat(v2.5-w1): expand corpus to 20 entries with evidence-aware samples"
```

---

### Task 6: GroundingPackage Schema Upgrade

**Files:**
- Modify: `src/shared/schemas/GroundingPackage.schema.js`

- [ ] **Step 1: Implement schema validation**

Replace `src/shared/schemas/GroundingPackage.schema.js` with:

```js
/**
 * GroundingPackage Schema — Validation schema for grounding packages (v2.5-W1)
 *
 * Validates structure including _evidence on allowedFacts and evidenceSummary.
 */

const VALID_EVIDENCE_SOURCES = ['direct', 'observed', 'overheard', 'told', 'inferred'];

function validateGroundingPackage(pkg) {
  if (!pkg || typeof pkg !== 'object') return { valid: false, errors: ['must be object'] };

  const errors = [];

  // Validate allowedFacts
  if (pkg.allowedFacts && Array.isArray(pkg.allowedFacts)) {
    for (let i = 0; i < pkg.allowedFacts.length; i++) {
      const fact = pkg.allowedFacts[i];
      if (fact._evidence) {
        if (!VALID_EVIDENCE_SOURCES.includes(fact._evidence.source)) {
          errors.push(`allowedFacts[${i}]._evidence.source invalid: ${fact._evidence.source}`);
        }
        if (typeof fact._evidence.confidence !== 'number' || fact._evidence.confidence < 0 || fact._evidence.confidence > 1) {
          errors.push(`allowedFacts[${i}]._evidence.confidence must be 0-1, got ${fact._evidence.confidence}`);
        }
      }
    }
  }

  // Validate inferredFacts (v2.5: should always be empty)
  if (pkg.inferredFacts && !Array.isArray(pkg.inferredFacts)) {
    errors.push('inferredFacts must be array');
  }

  // Validate metadata.evidenceSummary
  if (pkg.metadata && pkg.metadata.evidenceSummary) {
    const summary = pkg.metadata.evidenceSummary;
    if (typeof summary !== 'object') {
      errors.push('metadata.evidenceSummary must be object');
    } else {
      for (const [key, value] of Object.entries(summary)) {
        if (!VALID_EVIDENCE_SOURCES.includes(key)) {
          errors.push(`metadata.evidenceSummary has invalid source key: ${key}`);
        }
        if (typeof value !== 'number' || value < 0) {
          errors.push(`metadata.evidenceSummary.${key} must be non-negative number`);
        }
      }
    }
  }

  // Validate metadata.factCount.inferred (v2.5: should be 0)
  if (pkg.metadata && pkg.metadata.factCount && typeof pkg.metadata.factCount.inferred === 'number' && pkg.metadata.factCount.inferred !== 0) {
    errors.push(`metadata.factCount.inferred must be 0 (v2.5 B1 downgrade), got ${pkg.metadata.factCount.inferred}`);
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

module.exports = { validateGroundingPackage };
```

- [ ] **Step 2: Run existing tests to check regression**

Run: `npx vitest run tests/facts/grounded-narrative.test.js`
Expected: PASS

Run: `npx vitest run tests/unit/narrative/fact-provider-evidence.test.js`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/shared/schemas/GroundingPackage.schema.js
git commit -m "feat(v2.5-w1): upgrade GroundingPackage schema to validate _evidence and evidenceSummary"
```

---

### Task 7: Full Validation Suite

- [ ] **Step 1: Run npm test**

Run: `npm test`
Expected: All tests pass

- [ ] **Step 2: Run domain tests**

Run: `npm run test:domain`
Expected: Pass

- [ ] **Step 3: Run boundary checks**

Run: `npm run check:boundaries`
Expected: Pass

- [ ] **Step 4: Run replay:diff**

Run: `npm run replay:diff`
Expected: 100/100

- [ ] **Step 5: Run smoke and perf**

Run: `npm run smoke:pack`
Expected: Pass

Run: `npm run perf:check`
Expected: Pass (occasional flake OK per AGENTS.md)

- [ ] **Step 6: Final commit (if any fixes needed)**

```bash
git add -A
git commit -m "fix(v2.5-w1): address validation suite findings"
```

---

## Self-Review

### 1. Spec coverage

| W1 Requirement | Task |
|---|---|
| FactProvider allowedFacts 挂载 `_evidence` | Task 2 |
| `_getInferredFacts()` 降级为空数组 | Task 1 |
| inferred 知识统一走 KnowledgeStore → allowedFacts | Task 1 (downgrade) + Task 2 (evidence on KS facts) |
| NarrativeBuilder 按 evidence.source 分组/标注来源 | Task 3 |
| checker 支持 missing_source_attribution 反向检查 | Task 4 |
| corpus 按 RFC 扩充到 W1 目标 | Task 5 |

All W1 requirements covered.

### 2. Placeholder scan

No TBD/TODO/fill-in-later found. All steps contain actual code.

### 3. Type consistency

- `_evidence` structure: `{ source, confidence, propagatedFrom }` — consistent across FactProvider (attach), FactFormatter (read), NarrativeBuilder (read), FactConsistencyChecker (read), Schema (validate)
- `evidenceSummary`: `{ [source: string]: number }` — consistent across FactProvider (compute), Schema (validate)
- `missing_source_attribution` violation type: `{ type, source, fact, message }` — consistent between checker (produce) and _suggestFix (consume)
