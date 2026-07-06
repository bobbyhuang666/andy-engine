# Grounding Checker v2 RFC

> Stage 42 — v2 implemented baseline. FactConsistencyChecker now delegates to GroundingChecker v2 as primary path.

---

## 1. Current Checker Role

`FactConsistencyChecker` serves as the **compatibility facade** — v2 `GroundingChecker` is the primary implementation path, with regex-based checks preserved as fallback.

**v2 responsibilities:**
- Structured claim extraction via `ClaimExtractor` (location, event, relationship, state, source_attribution, time)
- Claim normalization (negation, uncertainty, source markers)
- Deterministic validation against `allowedFacts` / `KnowledgeStore` evidence tiers
- Blocking violations derived from structured claim objects, not bare regex matches

**v1 preserved (regex fallback):**
- Character name validation (regex-based)
- Location name validation (regex-based)
- Event knowledge validation (regex-based)
- Time conflict detection (simple hour comparison)
- New content detection (relationship/event creation patterns)
- Agent-location claim validation (regex + allowedFacts)
- Missing source attribution (v2.5-W1)
- Agent state leak (v2.5-W2, evidence fix W3)
- Local scope leak (v2.5-W2)

---

## 2. v2 Direction: Structured Claim Extraction

### 2.1 Claim Object Schema

```js
{
  subject: string,        // agentId or entity name
  predicate: string,      // 'is_at', 'knows', 'did', 'said', 'has_relationship', ...
  object: string,         // location, event, relationship target, ...
  location: string|null,  // where the claim occurs (if spatial)
  time: Date|null,        // when the claim refers to (if temporal)
  confidence: number,     // 0.0-1.0 extraction confidence
  sourceSpan: {
    start: number,        // character offset in LLM output
    end: number,
    raw: string           // original text span
  }
}
```

### 2.2 Validation Pipeline

```
LLM Output
  → Claim Extraction (regex + heuristics, conservative)
  → Claim Object[]
  → Validate against FactProvider.allowedFacts
  → Validate against KnowledgeStore (if available)
  → Result: { valid, violations, severity, suggestion }
```

### 2.3 Validation Sources

| Claim Type | Validation Source |
|------------|-------------------|
| Self-location | `allowedFacts` where `fact.type === AGENT_STATE && fact.agentId === selfId` |
| Other-agent location | `allowedFacts` where `fact.type === EVENT` with `participants`/`observers` at `fact.location` |
| Observed event | `allowedFacts` where `fact.type === OBSERVATION && fact.observerId === selfId` |
| Told fact | `allowedFacts` where `fact.perspective === 'told'` |
| Relationship | `allowedFacts` where `fact.type === RELATIONSHIP && (fact.agentA === selfId \|\| fact.agentB === selfId)` |

---

## 3. Chinese Text Processing

### 3.1 Regex Role: Candidate Extraction Only

Regex patterns serve as **candidate extractors**, not truth determiners. They identify spans that *might* contain claims, which are then validated against structured data.

**Current (v1) — problematic:**
```js
// Directly flags "提到了未知地点" based on regex match
const locationPattern = /[在去到从]([一-龥]{2,6})/g;
```

**Proposed (v2) — conservative:**
```js
// Extract candidate, then validate against allowedFacts
const candidate = extractLocationCandidate(text, offset);
if (candidate.confidence < THRESHOLD) {
  // Uncertain: do not flag, allow LLM to proceed
  // Or: require LLM rewrite with more explicit grounding
}
```

### 3.2 Conservative Mode

When extraction confidence is below threshold:
- **Do not block** the output
- **Do not flag** as violation
- **Optionally**: request LLM rewrite with more explicit grounding references

This prevents false positives from blocking valid Chinese expressions.

### 3.3 Known False Positive Patterns

| Pattern | v1 Behavior | v2 Behavior |
|---------|-------------|-------------|
| `在学习` | Flags `学习` as unknown location | Skipped: verb suffix filter |
| `去吃饭` | Flags `吃饭` as unknown location | Skipped: verb suffix filter |
| `大家在图书馆` | May flag `大家` as unknown character | Skipped: common word filter |
| `他去了那里` | May flag `那里` as unknown location | Skipped: pronoun filter |

---

## 4. Constraints

### 4.1 LLM Must Not Create Canon Facts

The grounding checker validates against existing facts. It does **not** allow the LLM to create new world facts through narrative output.

**Enforced by:**
- Checker only reads `allowedFacts` / `KnowledgeStore`
- Checker never writes to `WorldFactStore`
- Checker never writes to `KnowledgeStore`

### 4.2 Checker Must Not Write WorldFactStore

The checker is a **read-only validator**. It consumes grounding packages and LLM output; it produces violation reports. It never mutates world state.

### 4.3 Checker Must Not Write KnowledgeStore

Knowledge propagation (who knows what) is handled by `CanonEventPipeline` and `KnowledgeStore` during event processing. The checker does not modify knowledge state.

---

## 5. Test Plan

### 5.1 Allowed Self-Location Claim

```js
// Agent says "我在图书馆" when grounding contains:
// { type: AGENT_STATE, agentId: 'alice', position: '图书馆' }
// Expected: PASS
```

### 5.2 Unsupported Third-Party Location Claim

```js
// Agent says "小明在图书馆" when grounding has no evidence of 小明's location
// Expected: violation { type: 'unsupported_claim', agent: '小明', location: '图书馆' }
```

### 5.3 Observed vs Told Knowledge

```js
// Agent says "我听说小明去了图书馆" (told)
// grounding has: { type: EVENT, participants: ['小明'], location: '图书馆', perspective: 'told' }
// Expected: PASS

// Agent says "我看到小明在图书馆" (observed)
// grounding has: no observation fact for 小明 at 图书馆
// Expected: violation
```

### 5.4 Ambiguous Chinese Sentence Should Not False Block

```js
// "我在图书馆学习" — "学习" is verb, not location
// Expected: PASS (no false positive)

// "大家在食堂吃饭" — "大家" is common word, "吃饭" is verb
// Expected: PASS
```

### 5.5 Domain-Specific Vocabulary

```js
// Domain: campus
// Agent says "我在自习室" when 自习室 is in domain.regions
// Expected: PASS (domain-registered location)

// Domain: tavern
// Agent says "我在酒窖" when 酒窖 is in domain.regions
// Expected: PASS
```

---

## 6. Migration Path

1. **v1 preserved**: Existing `FactConsistencyChecker` remains as-is
2. **v2 new file**: `src/narrative/GroundingChecker.js` (when implemented)
3. **Adapter pattern**: SDK/runtime can switch between v1 and v2 via config
4. **No breaking changes**: v1 API (`check(llmOutput, grounding)`) is preserved in v2

---

## 7. Open Questions

1. Should `confidence` threshold be configurable per-domain?
2. Should the checker support multi-turn conversation context (e.g., "他" referring to a previously mentioned agent)?
3. Should the checker integrate with `KnowledgeStore.getKnownFacts()` directly, or only through `FactProvider.allowedFacts`?
4. How should the checker handle LLM output that explicitly marks uncertainty ("可能在图书馆")?

---

## 8. Out of Scope

- Full semantic NLI (Natural Language Inference) — deferred to future Stable milestone
- LLM-side structured output cooperation for per-fact attribution tracking
- Multi-turn conversation context resolution (e.g., pronoun "他" references)
- Configurable confidence threshold per domain
- Implementing `GroundingChecker.js` as a standalone replacement (v1 facade preserved)
