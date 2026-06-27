# v3.0 Alpha Release Candidate Evaluation

> Generated: 2026-06-28 | Commit: `d8af464`
> Phase: Alpha Release Candidate Evaluation — go/no-go assessment

---

## 1. Release Candidate Identity

| Item | Value |
|---|---|
| Package name | `andy-engine` |
| Package version | `2.0.1` |
| Commit | `d8af464` |
| Working tree | Clean |
| License | AGPL-3.0-only |
| Node.js requirement | >=18.0.0 |
| Package size | 342.0 kB (192 files) |

---

## 2. Public API Matrix

| Subpath | Target | Types (.d.ts) | Status |
|---|---|---|---|
| `.` | `index.js` | ✅ `index.d.ts` | Stable |
| `./sdk` | `sdk/index.js` | ✅ `sdk/index.d.ts` | Stable |
| `./domain` | `domain/index.js` | ✅ `domain/index.d.ts` | Stable |
| `./domain/validate` | `src/domain/validateDomain.js` | ❌ | Stable (direct src/) |
| `./domain/registry` | `src/domain/DomainRegistry.js` | ❌ | Stable (direct src/) |
| `./facts` | `facts/index.js` | ✅ `facts/index.d.ts` | Stable |
| `./store` | `store/index.js` | ✅ `store/index.d.ts` | Stable |
| `./config/defaults` | `src/config/defaults.js` | ❌ | Stable (direct src/) |
| `./presets/campus` | `presets/campus/index.js` | ❌ | Stable (preset) |
| `./presets/tavern` | `presets/tavern/index.js` | ❌ | Stable (preset) |

**TypeScript coverage**: 5/10 subpaths have `.d.ts`. Remaining 5 are low-risk gaps (3 direct src/ exports, 2 plain JS config presets).

---

## 3. Aliveness Matrix

| Dimension | Status | Evidence |
|---|---|---|
| D1 World Persistence | ✅ Pass | persistence-trust, golden-seed-replay, replay-trust-l4 all pass |
| D2 Character Continuity | ✅ Pass | serialization-roundtrip pass |
| D3 Epistemic Correctness | ✅ Pass | alice-bob-epistemic-boundary, epistemic-evidence-matrix pass |
| D4 Causal Consequence Writeback | ✅ Pass | effects/ tests pass |
| D5 Grounded Narrative Faithfulness | ⚠️ Warning | narrative-violation-corpus pass; checker is regex-based/experimental |
| D6 Multi-Agent Social Emergence | ✅ Pass | social-emergence, gossip-propagation, emotion-contagion-cluster pass |
| D7 Domain Portability | ✅ Pass | test:domain exit 0 |

---

## 4. Package Matrix

| Item | Value |
|---|---|
| Files included | 192 |
| Package size | 342.0 kB |
| Unpacked size | 1.3 MB |
| CHANGELOG.md included | ✅ Yes |
| .d.ts files | 5 (index, sdk, domain, facts, store) |
| Examples included | ✅ Yes (5 examples) |
| Docs included | DOMAIN.md, README.md, LICENSE, CHANGELOG.md |

---

## 5. Consumer Matrix

| Consumer Type | Result | Notes |
|---|---|---|
| CJS consumer (`require('andy-engine')`) | ✅ Pass | Engine constructs, tick, narrative, domain all work |
| SDK consumer (`require('andy-engine/sdk')`) | ✅ Pass | Character, Andy, create all work |
| No-SQLite consumer | ✅ Pass | Optional dependency handling correct |
| TypeScript consumer | ✅ Pass | `tsc --noEmit` passes with type declarations |
| Domain consumer (`require('andy-engine/domain')`) | ✅ Pass | validateDomain, DomainRegistry work |
| Facts consumer (`require('andy-engine/facts')`) | ✅ Pass | WorldFactStore, FactProvider work |
| Store consumer (`require('andy-engine/store')`) | ✅ Pass | createStore, MemoryStore work |
| Presets consumer | ✅ Pass | Campus and tavern presets load correctly |

---

## 6. Gate Matrix

| Command | Result | Details |
|---|---|---|
| `npm test` | ✅ Pass | 2788 tests, 169 files |
| `npm run test:domain` | ✅ Pass | 81 tests, 5 files |
| `npm run check:boundaries` | ✅ Pass | 16/16 checks clean |
| `npm run replay:diff` | ✅ Pass | 100/100 ticks match |
| `npm run smoke:pack` | ✅ Pass | 19/19 consumer checks |
| `npm run perf:check` | ✅ Pass | All 5 metrics within threshold |
| `git diff --check` | ✅ Pass | No whitespace errors |
| `npm run release:gate` | ✅ Pass | All checks including SQLite, legacy, release-clean |
| `npm run fresh:consumer` | ✅ Pass | CJS + No-SQLite + TypeScript |
| `npm run typecheck` | ✅ Pass | tsc --noEmit clean |
| `npm run typecheck:consumer` | ✅ Pass | Fresh consumer typecheck |
| `npm pack --dry-run` | ✅ Pass | 192 files, 342.0 kB |

---

## 7. Known Limitations

| # | Limitation | Impact | Acceptable for Alpha |
|---|---|---|---|
| 1 | D5 Warning — regex-only FactConsistencyChecker | Narrative outputs constrained but not semantically verified | ✅ Yes, documented |
| 2 | ESM support not guaranteed | CJS-only package | ✅ Yes, documented |
| 3 | 5/10 subpaths lack .d.ts | TypeScript consumers get limited type info for some subpaths | ✅ Yes, 5 critical ones have types |
| 4 | 3 subpaths point into src/ | Internal paths exposed as public exports | ✅ Yes, documented in PUBLIC_API_CONTRACT |
| 5 | Fact/Knowledge schemas may change | Breaking changes possible before stable | ✅ Yes, alpha status |
| 6 | Package not published to npm | Infrastructure ready, requires human approval | ✅ Yes, by design |
| 7 | StoryArc runtime paused | Not implemented in engine core | ✅ Yes, documented |
| 8 | Deterministic replay — core paths only | Not full deterministic replay | ✅ Yes, documented |

---

## 8. D5 Handling

**Status**: Warning (by design, not a blocker for Foundation Alpha)

- `FactConsistencyChecker` is 100% regex-based with hardcoded Chinese patterns
- Corpus is hand-crafted for its own trigger patterns, not real LLM output
- `judgeDimension` for D5 only returns Warning or Gap — no Pass path exists
- A truthful Warning is better than a decorative Pass
- D5 hardening is required before any Stable release claim
- Full assessment: `docs/current/V2_8_D5_HARDENING_ASSESSMENT.md`

---

## 9. Documentation Truth

| Document | Status | Notes |
|---|---|---|
| README.md | ✅ Truthful | Test count correct, npm stance honest, D5 Warning listed, import paths correct |
| CHANGELOG.md | ✅ Complete | v2.0→v2.6 history, Foundation Alpha status, known limitations |
| PUBLIC_API_CONTRACT.md | ✅ Consistent | All 10 exports match package.json, TS limitations documented |
| V2_7_ALPHA_RELEASE_READINESS_REPORT.md | ✅ Exists | Full readiness assessment |
| V2_8_D5_HARDENING_ASSESSMENT.md | ✅ Exists | D5 honest assessment, no false Pass |
| V2_9_STANDARD_RELEASE_READINESS_REPORT.md | ✅ Exists | Package/types/smoke hardening |

---

## 10. Go/No-Go Decision

### Evaluation against criteria

| Go criterion | Met? | Evidence |
|---|---|---|
| Working tree clean after commits | ✅ | `git status --short` returns empty |
| Full gate passes | ✅ | 12/12 gate commands pass |
| `npm pack --dry-run` succeeds | ✅ | 192 files, 342.0 kB |
| Examples and smoke tests prove consumer usage | ✅ | 19 smoke checks, 5 examples, fresh consumer matrix pass |
| README/CHANGELOG honestly describe alpha status | ✅ | Alpha disclaimers, D5 Warning, npm not published |
| No boundary violations | ✅ | No publish/tag/release, no schema/API changes, check:boundaries clean |
| D5 Warning documented as known alpha limitation | ✅ | README, CHANGELOG, D5 assessment report all document it |

### Verdict

## ✅ Ready for human alpha publish approval, with D5 alpha limitation documented

All 7 go criteria are met. The package is honestly assessable as a Foundation Alpha package. Consumer-facing gaps are either fixed (examples, CHANGELOG, README truth, .d.ts for key subpaths) or explicitly documented as alpha limitations (D5 Warning, ESM, remaining .d.ts gaps).

---

## 11. What Would Still Block a Stable Release

| Blocker | Current Status | Required Fix |
|---|---|---|
| D5 must be Pass | Warning | Structured claim extraction architecture |
| ESM support | CJS-only | ESM dual-package support |
| All subpaths need .d.ts | 5/10 have types | Add declarations for remaining 5 |
| Direct src/ exports should be facaded | 3 subpaths point to src/ | Create proper facades |
| External production validation | None | At least 1 external user validates |
| Schema stability | May change | Freeze fact/knowledge schemas |

These are **not** blockers for Foundation Alpha. They are requirements for a future Stable release claim.

---

## 12. Publish Status

**npm publish has NOT been performed.** This evaluation prepares and assesses readiness; it does not perform the public release.

If the user approves, the publish steps would be:
1. `npm publish --tag alpha` (or equivalent)
2. Verify on npm registry
3. Update README to reflect published status

These steps require explicit human approval and are outside the scope of this evaluation.
