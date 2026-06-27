# v2.9 Standard Release Readiness Report

> Generated: 2026-06-28 | Commit: `a8142da`
> Phase: Standard Release Readiness Hardening

---

## 1. Summary

v2.9 closes the standard release readiness hardening phase. The package now has TypeScript declarations for 5 of 10 subpaths, CHANGELOG.md is included in the package distribution, and all consumer matrix tests pass.

---

## 2. Public Export Matrix

| Subpath | Target | Types (.d.ts) | Classification |
|---|---|---|---|
| `.` | `index.js` | ✅ `index.d.ts` | Public Facade |
| `./sdk` | `sdk/index.js` | ✅ `sdk/index.d.ts` | Public Facade |
| `./domain` | `domain/index.js` | ✅ `domain/index.d.ts` | Public Facade |
| `./domain/validate` | `src/domain/validateDomain.js` | ❌ No .d.ts | Direct Internal Exposure |
| `./domain/registry` | `src/domain/DomainRegistry.js` | ❌ No .d.ts | Direct Internal Exposure |
| `./facts` | `facts/index.js` | ✅ `facts/index.d.ts` | Public Facade |
| `./store` | `store/index.js` | ✅ `store/index.d.ts` | Public Facade |
| `./config/defaults` | `src/config/defaults.js` | ❌ No .d.ts | Direct Internal Exposure |
| `./presets/campus` | `presets/campus/index.js` | ❌ No .d.ts | Domain preset (JS-only) |
| `./presets/tavern` | `presets/tavern/index.js` | ❌ No .d.ts | Domain preset (JS-only) |

**Progress**: 5/10 subpaths now have `.d.ts` (up from 2/10 in v2.7).

### .d.ts Gap Classification

| Subpath | Gap Type | Risk | Action |
|---|---|---|---|
| `./domain/validate` | Direct src/ exposure | Low — single function | Accept for alpha; add .d.ts in future |
| `./domain/registry` | Direct src/ exposure | Low — single class | Accept for alpha; add .d.ts in future |
| `./config/defaults` | Direct src/ exposure | Low — single object | Accept for alpha; add .d.ts in future |
| `./presets/campus` | Domain preset (JS object) | Very low — config object | Defer; presets are plain objects |
| `./presets/tavern` | Domain preset (JS object) | Very low — config object | Defer; presets are plain objects |

---

## 3. TypeScript Consumer Verification

| Test | Result |
|---|---|
| `npm run typecheck` | ✅ Pass |
| `npm run typecheck:consumer` | ✅ Pass (fresh consumer tsc --noEmit) |
| `npm run fresh:consumer` (TS consumer) | ✅ Pass |

TypeScript consumers can now:
- Import `AndyEngine` from root with full type information
- Import `Character`, `Andy`, `NarrativeBuilder`, `create`, `ConversationLog` from SDK with full type information
- Import `DomainRegistry`, `validateDomain`, `getDefaultDomain` from domain with type information
- Import `WorldFactStore`, `FactProvider`, `KnowledgeStore`, etc. from facts with type information
- Import `SQLiteStore`, `createStore`, `toWorldState`, etc. from store with type information

---

## 4. Smoke:Pack Behavior Coverage

Current smoke:pack covers 19 checks across all public facades:

| Check | Category |
|---|---|
| `new AndyEngine()` | Root import |
| `createCharacter + tick` | Core simulation |
| `getNarrative()` | Narrative generation |
| `new AndyEngine({ domain: tavern })` | Custom domain |
| `tavern createCharacter + tick` | Domain-specific |
| `Character with custom engine` | SDK |
| `validateDomain(tavern)` | Domain validation |
| `require("andy-engine/domain/validate")` | Domain subpath |
| `DomainRegistry` | Domain registry |
| `campus preset` | Default preset |
| `require("andy-engine/facts")` | Facts facade |
| `require("andy-engine/store") facade` | Store facade |
| `require("andy-engine/store") without SQLite binding` | Optional deps |
| `require("andy-engine/config/defaults")` | Config subpath |
| `invalid domain throws` | Error handling |
| `native/index.js present in package` | Native module |
| `EmotionVector.native.js loads without native` | JS fallback |
| `NeedsSystem.native.js loads without native` | JS fallback |
| `ANDY_USE_NATIVE=1 throws if no binding` | Native required mode |

**No further expansion needed for alpha.** The smoke tests cover all 10 subpaths and exercise behavior beyond mere imports.

---

## 5. Fresh Consumer Matrix

| Consumer Type | Result |
|---|---|
| Basic CJS (`require('andy-engine')`) | ✅ OK |
| No-SQLite (optional dependency handling) | ✅ OK |
| TypeScript (`import AndyEngine = require('andy-engine')`) | ✅ OK |

---

## 6. Package Contents

| Item | Value |
|---|---|
| Total files | 192 |
| Package size | 342.0 kB |
| Unpacked size | 1.3 MB |
| CHANGELOG.md included | ✅ Yes (added to `files` whitelist) |
| .d.ts files in package | 5 (index, sdk, domain, facts, store) |

---

## 7. v2.9 Pass Criteria

| Criterion | Required | Status |
|---|---|---|
| Public export matrix documented | yes | ✅ This report |
| `.d.ts` gaps fixed or documented | yes | ✅ 5/10 have types; 5 gaps documented with risk classification |
| smoke:pack behavior coverage improved or explicitly deferred | yes | ✅ 19 behavioral checks, no further expansion needed |
| pack dry-run/fresh consumer evidence recorded | yes | ✅ All 3 consumer types pass |
| No API break | yes | ✅ All tests pass, conditional exports backward compatible |

**v2.9 is complete.**

---

## 8. Deferred Items (Post-Alpha)

| Item | Reason | Phase |
|---|---|---|
| .d.ts for domain/validate, domain/registry, config/defaults | Direct src/ exports; low risk | v3.0+ |
| .d.ts for presets/campus, presets/tavern | Plain JS config objects | v3.0+ |
| Full ESM support | Not required for alpha CJS-only | Post-alpha |
| Structured claim extraction for D5 Pass | Medium-size subsystem | v2.8 hardening roadmap |
