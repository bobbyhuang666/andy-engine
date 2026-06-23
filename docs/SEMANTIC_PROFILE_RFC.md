# Semantic Profile — Implementation Reference

**Status:** Implemented
**Created:** 2026-06-22
**Updated:** 2026-06-23

---

## Overview

`semanticProfile` is a domain-level configuration that provides language-specific resources for the engine's semantic processing. It allows each domain to define its own language, keywords, and labels without hardcoding language-specific content in core.

---

## Actual Fields

```
domain.semanticProfile
  ├── language                          # string, e.g. 'zh-CN', 'en'
  ├── mindWander                        # object
  │   ├── negativeKeywords              # string[]
  │   ├── positiveKeywords              # string[]
  │   ├── thoughtTypes                  # object { recall, rumination, nostalgia, worry, daydream }
  │   ├── daydreamContents              # string[]
  │   └── timeLabels                    # object { justNow, hoursAgo, daysAgo, weeksAgo }
  ├── narrativeModifiers                # object
  │   ├── emotionLabels                 # object { sadness, loneliness, frustration, ... }
  │   ├── needPhrases                   # object { veryTired, tired, veryHungry, hungry, restless }
  │   └── cognitivePhrases              # object { highStress, distracted, wantsSocial, thinking, unwell }
  ├── behaviorModifiers                 # object
  │   ├── distracted                    # string
  │   ├── lonely                        # string
  │   ├── lazy                          # string
  │   └── verbMap                       # object
  ├── emotionKeywords                   # object { happy, sad, angry, fear, surprise, disgust }
  ├── emotionRegulationKeywords         # object
  │   └── positiveMemory                # string[]
  ├── eventDefaults                     # object
  │   ├── defaultSemanticCategory       # string
  │   ├── gossipSuffix                  # string
  │   └── gossipVerb                    # string
  ├── socialNormKeywords                # object
  │   ├── positive                      # string[]
  │   └── negative                      # string[]
  └── defaultSemanticCategories         # object
      ├── typeMap                       # object { social, weather, state_change, ... }
      ├── keywordMap                    # object { 'category': ['keyword1', 'keyword2', ...] }
      ├── eventMeaningRules             # array [{ keywords, meaningType, weight }]
      └── stateCategoryMap              # object { active, social, quiet, rest, ... }
```

---

## Merge Rules

`DomainRegistry` provides `mergeSemanticProfile(defaults)` for merging domain profile with core defaults.

**Algorithm (`_deepMergeSemantic`):**

1. For each key in `base` (defaults):
   - If `override` (domain) does not have the key → use `base` value
   - If both are plain objects → recursive merge
   - Otherwise → use `override` value
2. For each key in `override` not in `base` → add to result

**Example:**

```js
const domain = {
  semanticProfile: {
    language: 'en',
    emotionKeywords: { happy: ['happy', 'glad'] },
  },
};

const defaults = {
  language: 'zh-CN',
  emotionKeywords: { happy: ['开心', '高兴'], sad: ['难过'] },
};

const merged = registry.mergeSemanticProfile(defaults);
// Result:
// {
//   language: 'en',                    // domain wins
//   emotionKeywords: {
//     happy: ['happy', 'glad'],        // domain wins (array = leaf, no merge)
//     sad: ['难过'],                    // from defaults
//   },
// }
```

**Key behaviors:**
- Domain values always take priority over defaults
- Nested objects are merged recursively
- Arrays are treated as leaf values (no element merging)
- Missing keys fall back to defaults

---

## Fallback Rules

1. **`domain.semanticProfile` exists** → use it directly
2. **`domain.semanticProfile` is undefined** → `getSemanticProfile()` returns `{}`
3. **`mergeSemanticProfile(defaults)` called** → domain values override defaults; missing keys from defaults fill gaps
4. **No campus fallback** — custom domains do NOT inherit campus Chinese keywords automatically

---

## Current Presets

| Preset | Language | Notes |
|--------|----------|-------|
| `presets/campus` | `zh-CN` | Full Chinese semantic profile |
| `presets/tavern` | `zh-CN` | Full Chinese semantic profile (tavern-themed keywords) |

---

## Validation

`validateDomain` checks semanticProfile structure:

- `semanticProfile` must be object (if provided)
- `semanticProfile.language` must be string
- `semanticProfile.mindWander` must be object
- `semanticProfile.narrativeModifiers` must be object
- `semanticProfile.emotionKeywords` must be object
- `semanticProfile.emotionRegulationKeywords` must be object
- `semanticProfile.defaultSemanticCategories` must be object

---

## Files

| File | Role |
|------|------|
| `src/domain/DomainRegistry.js:264-323` | `semanticProfile` getter, `getSemanticProfile()`, `mergeSemanticProfile()` |
| `src/domain/validateDomain.js:295-326` | Validation rules |
| `presets/campus/index.js:706-840` | Campus semantic profile |
| `presets/tavern/index.js:452-562` | Tavern semantic profile |
| `tests/unit/semanticProfile-merge.test.js` | Merge logic tests |
| `tests/integration/semanticProfile.test.js` | Integration tests |

---

## References

- `docs/DOMAIN.md` — domain system documentation
- `presets/campus/` — campus domain preset
- `presets/tavern/` — tavern domain preset
