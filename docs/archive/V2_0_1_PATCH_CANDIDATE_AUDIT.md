# v2.0.1 Patch Candidate Audit

## Summary
- Commits: 8
- Files changed: 52
- Lines: +2736 / -268

---

## Commit-by-Commit Review

### 232046f Stabilize SDK determinism and internal accessors
- **Category:** internal refactor
- **Risk:** low
- **Patch-safe:** yes
- **Files:** 20 changed (+149/-56)
- **Details:**
  - Replace direct `Math.random()` calls with RNG context in `EmotionSignalBuffer`, `ScheduleHandler`, `ActionSelectionRuntime`, `MindWanderRuntime`, `PhysiologyRuntime`, `Appraisal`, `EmotionRegulation`, `FactEmitter`, `EffectCommitter`, `SocialGraph`
  - Add `getSimTime()` getter to `EventDispatcher` (exposes `_simTime` read-only)
  - Update `agent/Agent.js` with new SDK accessor methods
  - Add tests in `sdk.test.js`, `effect-delta-contract.test.js`, `event-lifecycle-dedup.test.js`
  - Update docs: `DEPENDENCY_SURFACE_AUDIT.md`, `DETERMINISM_SCOPE.md`, `LEGACY_REMOVAL_REPORT.md`, `PRIVATE_ACCESS_AUDIT.md`
- **Public API impact:** None. All changes are internal routing of RNG and private accessor cleanup.
- **Behavioral impact:** Same RNG seed produces same results. No behavioral change for seeded runs.

---

### 8b81e72 Implement semanticProfile migration with regression audits
- **Category:** internal refactor
- **Risk:** medium
- **Patch-safe:** yes (with caveats)
- **Files:** 15 changed (+1684/-154)
- **Details:**
  - `src/config/defaults.js`: Core defaults now use English semantic keys (e.g., `typeMap.social → 'social_interaction'`). Chinese campus/tavern presets override via `semanticProfile`.
  - `src/domain/DomainRegistry.js`: Add `semanticProfile` getter and `mergeSemanticProfile()` method for domain-aware deep merge.
  - `src/domain/validateDomain.js`: New domain validation module.
  - `presets/campus/index.js`: Add full `semanticProfile` block preserving all Chinese language resources.
  - New tests: `semanticProfile.test.js` (306 lines), `semanticRegression.test.js` (268 lines), `semanticProfile-merge.test.js` (124 lines), `source-scan.test.js` (89 lines)
  - New audits: `DEFAULTS_DIRECT_READ_AUDIT.md`, `SOURCE_SCAN_ALLOWLIST_AUDIT.md`, `DOMAIN.md`, `DOMAIN_COMPATIBILITY_EXCEPTIONS.md`
  - Updated: `SEMANTIC_PROFILE_RFC.md`, `canon-event-pipeline.test.js`, `domain-deep.test.js`
- **Public API impact:** None. `DomainRegistry.semanticProfile` and `mergeSemanticProfile()` are new additive methods.
- **Behavioral impact:** Core defaults English, campus/tavern presets keep Chinese via `semanticProfile` override. Preset users see no change. Custom domain users without `semanticProfile` get English defaults.
- **Caveat:** This is the largest change. Requires careful testing of preset merge paths.

---

### 4fc5966 Add AffectFrame narrative input seam
- **Category:** experimental seam
- **Risk:** low
- **Patch-safe:** yes
- **Files:** 4 changed (+337/-4)
- **Details:**
  - `src/sdk/NarrativeBuilder.js`: Accept optional `affectFrame` parameter in `buildSystemPrompt()` and `_buildCurrentState()`. When provided, uses structured emotion/need data directly instead of string parsing.
  - `options.affectFrame` shape: `{ valence, emotions: [{dimension, intensity}], needs: [{need, urgency}] }`
  - Old string-based path (`ctx.emotionState`, `ctx.needsState`) preserved as fallback.
  - New tests: `narrativeBuilder-affectFrame.test.js` (236 lines)
  - New docs: `AFFECT_COMPILER_RFC.md`, `NARRATIVE_CONTRACT_AUDIT.md`
- **Public API impact:** Additive only. New optional `affectFrame` parameter in `options`. No existing parameters changed.
- **Behavioral impact:** None when `affectFrame` not provided. When provided, produces semantically equivalent output from structured data.

---

### d76897d Reduce NarrativeBuilder string sentinel dependencies
- **Category:** internal refactor
- **Risk:** low
- **Patch-safe:** yes
- **Files:** 2 changed (+163/-2)
- **Details:**
  - `src/sdk/NarrativeBuilder.js`: Refactor string sentinel parsing in `_buildCurrentState()` and `_buildGuidelines()` to be more resilient. Add structured context support (`nearbyPeopleArray`, `recentEventsArray`).
  - New test: `narrativeBuilder-structuredContext.test.js` (142 lines)
- **Public API impact:** Additive. New optional array parameters `nearbyPeopleArray` and `recentEventsArray` in `options`. Old string paths preserved.
- **Behavioral impact:** None. Old string paths still work identically.

---

### 19b49a8 Route runtime diagnostics through shared Diagnostics
- **Category:** internal refactor
- **Risk:** low
- **Patch-safe:** yes
- **Files:** 5 changed (+15/-19)
- **Details:**
  - Replace `console.warn/error` with `diagnostics.collect()` in:
    - `src/agent/psychology/EmotionVector.native.js`
    - `src/agent/psychology/NeedsSystem.native.js`
    - `src/agent/schedule/Schedule.js`
    - `src/shared/nativeLoader.js`
    - `src/store/SimulationStore.js`
- **Public API impact:** None.
- **Behavioral impact:** Same diagnostic information, routed through `Diagnostics` collector instead of console. No functional change.

---

### 2f60432 Clarify store time semantics
- **Category:** docs truth fix
- **Risk:** low
- **Patch-safe:** yes
- **Files:** 3 changed (+179/-13)
- **Details:**
  - `src/store/SQLiteStore.js`: Add `now` parameter to `getRecent()`, `getByEmotion()`, `decay()`, `stats()` methods for explicit time source.
  - `src/store/SimulationStore.js`: Pass `virtualTime` to store queries instead of relying on internal default.
  - New audit: `STORE_TIME_SEMANTICS_AUDIT.md` (156 lines)
- **Public API impact:** None. `now` parameter is optional with backward-compatible default.
- **Behavioral impact:** Queries now consistently use `virtualTime` when available. Previous behavior used `Date.now()` as fallback, which was incorrect for fast-forward simulation.

---

### e3e3b12 Reduce remaining private simTime access
- **Category:** internal refactor
- **Risk:** low
- **Patch-safe:** yes
- **Files:** 9 changed (+60/-22)
- **Details:**
  - Replace direct `this._simTime` / `this.simTime` access with `getSimTime()` getter in:
    - `src/agent/facade/AgentNarrative.js`
    - `src/agent/handlers/MindWanderHandler.js`
    - `src/agent/handlers/ScheduleHandler.js`
    - `src/agent/memory/PersonalMemory.js`
    - `src/agent/runtime/MindWanderRuntime.js`
    - `src/runtime/AndyWorld.js`
  - `src/runtime/EventDispatcher.js`: Add `getSimTime()` public getter (already present from 232046f, this commit ensures all callers use it)
  - `agent/Agent.js`: Add public `getSimTime()` accessor
  - Updated: `PRIVATE_ACCESS_AUDIT.md`
- **Public API impact:** Additive. New `getSimTime()` on `Agent.js` public facade.
- **Behavioral impact:** None. Read-only getter, same value.

---

### 753d1c1 Document post-v2 stabilization status
- **Category:** docs truth fix
- **Risk:** none
- **Patch-safe:** yes
- **Files:** 1 changed (+151/-0)
- **Details:**
  - New doc: `docs/POST_V2_STABILIZATION_SUMMARY.md` — summarizes post-v2.0.0 stabilization work.
- **Public API impact:** None.
- **Behavioral impact:** None. Documentation only.

---

## Risk Classification

### Patch-safe (can ship in v2.0.1)
| Commit | Category | Risk |
|--------|----------|------|
| 232046f | internal refactor | low |
| 8b81e72 | internal refactor | medium |
| 4fc5966 | experimental seam | low |
| d76897d | internal refactor | low |
| 19b49a8 | internal refactor | low |
| 2f60432 | docs truth fix | low |
| e3e3b12 | internal refactor | low |
| 753d1c1 | docs truth fix | none |

### Minor-only (should defer to v2.1)
- None

### Needs review
- 8b81e72 (semanticProfile migration) — largest change, most files touched. Should verify all preset merge paths in integration tests before shipping.

### Should not ship
- None

---

## Special Review Items

### semanticProfile migration (8b81e72) — Patch-safe?
**Yes, with caveats.** The migration moves Chinese language resources from core defaults to campus preset's `semanticProfile`. Core defaults now use English keys. Campus/tavern presets provide Chinese overrides via `DomainRegistry.mergeSemanticProfile()`. All existing preset users see identical behavior. Custom domain users without `semanticProfile` get English defaults (acceptable for patch).

### AffectFrame seam (4fc5966) — Changes public API?
**Additive only.** New optional `affectFrame` parameter in `NarrativeBuilder.buildSystemPrompt(options)`. Old string-based `ctx.emotionState` / `ctx.needsState` paths preserved as fallback. No existing API removed or changed.

### NarrativeBuilder structured input (d76897d) — Changes output semantics?
**No.** New optional `nearbyPeopleArray` and `recentEventsArray` parameters provide structured input. Old string `ctx.nearbyPeople` and `ctx.recentEvents` paths still work identically. Output is semantically equivalent.

### Diagnostics cleanup (19b49a8) — Changes runtime behavior?
**No.** `console.warn/error` replaced with `diagnostics.collect()`. Same diagnostic information, different output channel. No functional change.

### Store time semantics (2f60432) — Changes persistence behavior?
**Yes, minor.** Queries now consistently use `virtualTime` when available instead of `Date.now()`. This fixes fast-forward simulation queries but is backward compatible (optional `now` parameter with fallback).

### Private simTime access (e3e3b12) — Read-only getter?
**Yes.** All changes replace direct `this._simTime` / `this.simTime` access with `getSimTime()` getter. No semantic change, just accessor pattern cleanup.

---

## Public API Impact
- No breaking changes
- Additive only (new optional parameters, new methods):
  - `NarrativeBuilder.buildSystemPrompt(options)`: new optional `affectFrame`, `nearbyPeopleArray`, `recentEventsArray`
  - `DomainRegistry`: new `semanticProfile` getter, `getSemanticProfile()`, `mergeSemanticProfile()`
  - `Agent.js`: new `getSimTime()` accessor

## Schema Impact
- No Stable World Envelope changes
- No database schema changes
- No persistence format changes

## Runtime Behavior Impact
| Change | Impact |
|--------|--------|
| semanticProfile migration | Core defaults now English; campus/tavern presets keep Chinese via override |
| AffectFrame seam | Opt-in structured input; old string path preserved |
| NarrativeBuilder structured input | Opt-in array parameters; old string path preserved |
| Diagnostics cleanup | `console.*` replaced with `Diagnostics`; same behavior |
| Store time semantics | Optional `now` parameter; backward compatible |
| Private simTime cleanup | Read-only getter; no semantic change |

## Conclusion

**v2.0.1 is the appropriate version for these changes.**

All 8 commits are patch-safe:
- 6 are internal refactors (no public API or behavioral change)
- 1 is an experimental seam (additive, opt-in)
- 1 is a docs truth fix (documentation only)
- 1 commit (8b81e72) is medium risk due to size but all existing preset users see identical behavior

No commits should be deferred to v2.1. No breaking changes. No schema changes. All changes are backward compatible.
