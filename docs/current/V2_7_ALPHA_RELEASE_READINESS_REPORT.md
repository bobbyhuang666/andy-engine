# v2.7 Alpha Release Readiness Report

> Generated: 2026-06-28 | Commit: `5a895b5`
> Phase: Release Readiness Evaluation — v2.7 Minimum Alpha Readiness

---

## 1. Executive Summary

Andy Engine v2.0.1 is assessed as **ready for Foundation Alpha publish approval**, with documented limitations. The package infrastructure, public API surface, examples, and documentation are consistent and honest about alpha status. D5 remains at Warning by design — a truthful Warning is acceptable for Foundation Alpha but not for a future Stable claim.

**Recommendation**: Ready for human alpha publish approval, with D5 alpha limitation documented.

---

## 2. Release Candidate Identity

| Item | Value |
|---|---|
| Package name | `andy-engine` |
| Package version | `2.0.1` |
| Commit | `5a895b5` |
| Working tree | Clean after v2.7 W1-W3 commit |
| License | AGPL-3.0-only |
| Node.js requirement | >=18.0.0 |

---

## 3. Public API Matrix

### Exports

| Subpath | Target | Status | .d.ts |
|---|---|---|---|
| `.` (root) | `index.js` | ✅ Stable facade | ✅ `index.d.ts` |
| `./sdk` | `sdk/index.js` | ✅ Stable facade | ✅ `sdk/index.d.ts` |
| `./domain` | `domain/index.js` | ✅ Stable facade | ❌ No .d.ts |
| `./domain/validate` | `src/domain/validateDomain.js` | ⚠️ Direct src/ export | ❌ No .d.ts |
| `./domain/registry` | `src/domain/DomainRegistry.js` | ⚠️ Direct src/ export | ❌ No .d.ts |
| `./facts` | `facts/index.js` | ✅ Stable facade | ❌ No .d.ts |
| `./store` | `store/index.js` | ✅ Stable facade | ❌ No .d.ts |
| `./config/defaults` | `src/config/defaults.js` | ⚠️ Direct src/ export | ❌ No .d.ts |
| `./presets/campus` | `presets/campus/index.js` | ✅ Domain preset | ❌ No .d.ts |
| `./presets/tavern` | `presets/tavern/index.js` | ✅ Domain preset | ❌ No .d.ts |

**Notes**:
- 3 subpaths point directly into `src/` (`domain/validate`, `domain/registry`, `config/defaults`). These are not broken but expose internal paths. Documented as release risk for v2.9 hardening.
- Root and SDK have complete `.d.ts` declarations. Other subpaths lack declarations but are usable from CJS consumers.

### Package Contents

| Item | Value |
|---|---|
| Total files in tarball | 188 |
| Package size | 337.0 kB |
| Unpacked size | 1.3 MB |
| Files whitelist | `index.js`, `index.d.ts`, `agent/`, `store/`, `sdk/`, `facts/`, `domain/`, `presets/`, `src/`, `native/`, `examples/`, `docs/DOMAIN.md`, `README.md`, `LICENSE` |

---

## 4. Aliveness Matrix

| Dimension | Status | Evidence |
|---|---|---|
| D1 World Persistence | Pass | persistence-trust pass, golden-seed-replay pass, replay-trust-l4 pass |
| D2 Character Continuity | Pass | serialization-roundtrip pass |
| D3 Epistemic Correctness | Pass | alice-bob-epistemic-boundary pass, epistemic-evidence-matrix pass |
| D4 Causal Consequence Writeback | Pass | effects/ 1/1 file pass |
| D5 Grounded Narrative Faithfulness | **Warning** | narrative-violation-corpus pass; checker is regex-based/experimental |
| D6 Multi-Agent Social Emergence | Pass | social-emergence pass, gossip-propagation pass, emotion-contagion-cluster pass |
| D7 Domain Portability | Pass | test:domain exit 0 |

---

## 5. Examples Matrix

| Example | Import Path | Fixed | Runs | Notes |
|---|---|---|---|---|
| `offline-demo.js` | `require('andy-engine/sdk')` | ✅ | ✅ | Mock LLM, no API key needed |
| `basic-chat.js` | `require('andy-engine/sdk')` | ✅ | ✅ (needs API key for chat) | OpenAI/Anthropic/Ollama |
| `multi-character.js` | `require('andy-engine/sdk')` | ✅ | ✅ (needs API key for chat) | Multi-agent demo |
| `quickstart.js` | `require('andy-engine')` | ✅ | ✅ | No API key needed |
| `demo.js` | `require('andy-engine')` | ✅ | ✅ | Longitudinal demo |

All examples now use package-consumer import paths. Previously used repo-relative paths (`../sdk`, `../../index`) have been replaced.

---

## 6. Gate Matrix

| Command | Result | Notes |
|---|---|---|
| `npm test` | ✅ Pass | 2788 tests, 169 files |
| `npm run test:domain` | ✅ Pass | 81 tests, 5 files |
| `npm run check:boundaries` | ✅ Pass | All 16 checks clean |
| `npm run replay:diff` | ✅ Pass | 100/100 ticks match |
| `npm run smoke:pack` | ✅ Pass | 19/19 consumer checks |
| `npm run perf:check` | ✅ Pass | All 5 metrics within threshold |
| `git diff --check` | ✅ Pass | No whitespace errors |
| `npm pack --dry-run` | ✅ Pass | 188 files, 337.0 kB |

---

## 7. Documentation Truth Assessment

| Area | Before v2.7 | After v2.7 | Status |
|---|---|---|---|
| Test count | "1918 tests" | "2788 tests" | ✅ Fixed |
| npm publish stance | "not planned" | "not yet performed; infrastructure ready" | ✅ Fixed |
| SDK import paths | `require("./sdk")` | `require("andy-engine/sdk")` | ✅ Fixed |
| Store import paths | `require('./store')` | `require('andy-engine/store')` | ✅ Fixed |
| D5 Warning documentation | Not in Known Limitations | Explicitly listed | ✅ Fixed |
| npm publish status | Not in Known Limitations | Explicitly listed | ✅ Fixed |
| CHANGELOG | Missing | Complete v2.0→v2.6 history | ✅ Created |

---

## 8. D5 Handling

**Status**: Warning (by design)

**Rationale**:
- `FactConsistencyChecker` is 100% regex-based with hardcoded Chinese character patterns
- Corpus is hand-crafted (35 entries designed to trigger specific regex patterns)
- 100% detection rate proves regex works on its own trigger patterns, not that it catches real LLM hallucinations
- No semantic analysis, no LLM, no embedding in the checker
- `judgeDimension` for D5 only returns 'Warning' or 'Gap' — there is no Pass code path
- A truthful Warning is better than a decorative Pass

**Acceptability for Foundation Alpha**: Yes. D5 Warning is honest and documented. It clearly signals that narrative faithfulness checking is experimental and not semantically verified.

**Requirement for Stable**: D5 must be hardened with claim extraction architecture that goes beyond regex pattern matching.

---

## 9. Known Limitations (Alpha)

| # | Limitation | Impact | Deferred to |
|---|---|---|---|
| 1 | D5 Warning — regex-only checker | Narrative outputs are constrained but not formally verified | v2.8 D5 hardening |
| 2 | ESM support not guaranteed | CJS-only package | Post-alpha |
| 3 | Missing .d.ts for 8/10 subpaths | TypeScript consumers get types for root+SDK only | v2.9 TS hardening |
| 4 | 3 subpaths point into src/ | Internal paths exposed as public exports | v2.9 cleanup |
| 5 | Fact/Knowledge schemas may change | Breaking changes possible before stable | v3 |
| 6 | Package not published to npm | Infrastructure ready, requires human approval | Human decision |
| 7 | StoryArc runtime paused | Not implemented in engine core | Indefinite |
| 8 | WorldObject not fully integrated | Modeled but not in Agent.tick | Post-alpha |

---

## 10. v2.7 Pass Criteria

| Criterion | Required | Status |
|---|---|---|
| CHANGELOG exists | yes | ✅ |
| Examples do not depend only on repo-relative imports | yes | ✅ |
| README release language is internally consistent | yes | ✅ |
| Alpha readiness report exists | yes | ✅ |
| No npm publish/tag/release | yes | ✅ |
| Relevant tests/smoke pass | yes | ✅ |

**v2.7 is complete.**

---

## 11. Next Steps

v2.7 closes minimum alpha readiness. Remaining phases:

| Phase | Focus | Status |
|---|---|---|
| v2.8 | D5 narrative faithfulness hardening assessment | Pending |
| v2.9 | Package/types/smoke/consumer readiness hardening | Pending |
| v3.0 | Alpha release candidate evaluation | Pending |
