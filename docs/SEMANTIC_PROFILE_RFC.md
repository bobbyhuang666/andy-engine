# RFC: Semantic Profile Extraction

**Status:** Proposed
**Created:** 2026-06-22

---

## Problem

`src/config/defaults.js` contains Chinese keyword rules in three locations:

1. **`eventConsequenceRules.eventMeaningRules`** — maps Chinese keywords to meaning types (rest, work, social, etc.)
2. **`eventConsequenceRules.emotionKeywords`** — maps Chinese keywords to emotion dimensions
3. **`eventConsequenceRules.tendencyRules`** — maps Chinese keywords to BehaviorField deltas
4. **`SEMANTIC_EVENT_CATEGORIES.keywordMap`** — maps Chinese keywords to semantic event categories
5. **`SEMANTIC_EVENT_CATEGORIES.typeMap`** / `stateCategoryMap` — Chinese category labels

This means the engine has a **Chinese semantic profile baked into core defaults**, violating the language-agnostic principle. Any domain using a different language must override these rules manually.

---

## Current State

| Location | Content | Language |
|---|---|---|
| `defaults.js:239-244` | `eventMeaningRules` | Chinese |
| `defaults.js:246-252` | `emotionKeywords` | Chinese |
| `defaults.js:254-259` | `tendencyRules` | Chinese |
| `defaults.js:380-396` | `SEMANTIC_EVENT_CATEGORIES.keywordMap` | Chinese |
| `defaults.js:366-412` | `typeMap`, `stateCategoryMap` labels | Chinese |

This is the **current default semantic profile** — functional but not language-agnostic.

---

## Proposed Solution

### Target Architecture

```
domain.semanticProfile
  ├── eventMeaningRules
  ├── emotionKeywords
  ├── tendencyRules
  └── semanticEventCategories
```

Each domain preset owns its semantic profile. Core defaults provide a neutral/English fallback.

---

## Migration Phases

### Phase A: Extract Chinese Keywords

Move all Chinese keyword rules from `src/config/defaults.js` into `presets/campus/semanticProfile.js`.

```
presets/campus/semanticProfile.js
  eventMeaningRules       ← from defaults.js:239-244
  emotionKeywords         ← from defaults.js:246-252
  tendencyRules           ← from defaults.js:254-259
  semanticEventCategories ← from defaults.js:363-413
```

### Phase B: Add `domain.semanticProfile` Field

Extend domain config schema:

```js
{
  name: 'campus',
  semanticProfile: {
    eventMeaningRules: [...],
    emotionKeywords: {...},
    tendencyRules: [...],
    semanticEventCategories: {...},
  },
  // ... existing domain fields
}
```

Runtime merges `domain.semanticProfile` over core defaults.

### Phase C: Language-Neutral Core Defaults

Replace Chinese keywords in `src/config/defaults.js` with English or neutral identifiers:

```js
eventMeaningRules: [
  { keywords: ['rest', 'sleep', 'nap', 'relax'], meaningType: 'rest', weight: 0.3 },
  { keywords: ['work', 'study', 'research', 'focus', 'task'], meaningType: 'work', weight: 0.3 },
  // ...
]
```

Chinese campus behavior preserved via `presets/campus/semanticProfile.js`.

### Phase D: Test Custom Domain Profile

Add integration test: create a custom domain with a non-Chinese semantic profile, verify the engine uses it correctly.

---

## Constraints

1. **Do NOT** add more language-specific keywords to core defaults.
2. **Do NOT** change existing runtime behavior — this is a documentation/planning RFC only.
3. **Do NOT** implement the migration in this RFC.
4. Existing campus preset behavior must be preserved after migration.

---

## Files Affected (Future)

| File | Change |
|---|---|
| `src/config/defaults.js` | Replace Chinese keywords with English/neutral |
| `presets/campus/semanticProfile.js` | New — receives Chinese keywords |
| `presets/campus/index.js` | Import and attach semanticProfile |
| `src/config/domainSchema.js` | Add `semanticProfile` field validation |
| `src/runtime/AndyWorld.js` | Merge domain.semanticProfile over defaults |
| `tests/integration/semanticProfile.test.js` | New — custom domain profile test |

---

## References

- `src/config/defaults.js` — current Chinese keyword definitions
- `docs/DOMAIN.md` — domain system documentation
- `presets/campus/` — campus domain preset
