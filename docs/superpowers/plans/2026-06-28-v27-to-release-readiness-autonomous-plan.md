# v2.7 -> Release Readiness Evaluation Autonomous Plan

> Date: 2026-06-28  
> Owner role: Architect AI operating in goal mode  
> Human availability: none during execution window  
> Planner availability: none during execution window  
> Independent auditor availability: none until user wakes up  
> Target work window: about 8 hours  
> Scope: complete the Release Readiness Evaluation phase, not npm publish

---

## 0. Executive Order

This is an autonomous execution plan for the architect AI.

The goal is not to reach a specific version number for its own sake. The goal is to complete the **Release Readiness Evaluation phase**: make Andy Engine honestly assessable as a Foundation Alpha package, with consumer-facing gaps either fixed, gated, or explicitly deferred.

Version labels below are phase labels:

```text
v2.7  = minimum Alpha release readiness
v2.8  = D5 narrative faithfulness hardening assessment
v2.9  = standard release readiness hardening
v3.0  = Alpha release candidate evaluation
v3.1+ = only if required to close release readiness evaluation
```

If the release readiness evaluation is closed before v3.0, stop early and write the completion report.  
If it is not closed by v3.0, continue with v3.1/v3.2 remediation until the evaluation is complete or the 8-hour timebox ends.

Important: **do not npm publish, do not create git tags, do not create GitHub releases.** This phase prepares and evaluates readiness; it does not perform the public release.

---

## 1. Current Strategic Baseline

The project has completed the world-kernel hardening sequence:

| Area | Current state |
|---|---|
| Persistence / L4 resume | Pass after v2.2 five-layer fix |
| Memory consistency / observability | Pass after v2.3 |
| Epistemic correctness D3 | Pass after v2.4 |
| Narrative grounding work | v2.5 improved checker/corpus/grounding, but D5 remains an honest Warning in latest v2.7 direction brief |
| Social emergence D6 | Pass after v2.6 |
| Release readiness | Not yet closed |

Latest aliveness posture to assume unless local evidence proves otherwise:

| Dimension | Status |
|---|---|
| D1 World Persistence | Pass |
| D2 Character Continuity | Pass |
| D3 Epistemic Correctness | Pass |
| D4 Causal Consequence Writeback | Pass |
| D5 Grounded Narrative Faithfulness | Warning |
| D6 Multi-Agent Social Emergence | Pass |
| D7 Domain Portability | Pass |

D5 Warning is acceptable for **Foundation Alpha** if clearly documented. It is not acceptable for a future Stable claim unless the checker becomes meaningfully more semantic than regex-only.

---

## 2. Mandatory Operating Model

The architect context window is limited. Do **not** try to do all work inline.

You must use subagents aggressively. The architect's job is to coordinate, review, decide, and integrate.

Recommended subagents:

| Subagent | Mission | Output |
|---|---|---|
| Docs Truth Agent | Audit README, AI_README if present, PUBLIC_API_CONTRACT, package docs, release docs | concise discrepancy list + patch recommendations |
| Examples Consumer Agent | Audit and run examples as installed-package consumers | example fixes + command evidence |
| Package/Types Agent | Audit package exports, files, d.ts coverage, pack contents | subpath readiness matrix |
| Smoke/Consumer Agent | Expand or run smoke:pack / fresh consumer matrix | consumer gate evidence |
| D5 Narrative Agent | Assess D5 checker honestly; do not force Pass | D5 hardening assessment |
| Release Gate Agent | Own command execution and final gate logs | command summary + failures |
| Final Audit Prep Agent | Build auditor handoff package | final report checklist |

Rule: each subagent gets a bounded task, must cite files/commands, and must distinguish fact from recommendation. The architect must not blindly trust subagent conclusions; spot-check important claims before committing.

---

## 3. Hard Boundaries

These are not negotiable during the unattended run.

Do not:

| Boundary | Rule |
|---|---|
| npm publish | Never run `npm publish`, `npm version`, or create public release artifacts requiring human approval |
| Git tags / GitHub release | Do not create tags or releases |
| Stable World Envelope | Do not change unless a migration RFC already exists and explicitly authorizes it |
| schemaVersion / ENVELOPE_VERSION | Do not bump during this phase |
| Public API semantics | Do not remove or rename existing public API exports |
| StoryArc / UI / Andy Town | Do not implement these in engine core |
| Narrative facts | Do not let narrative/LLM create world facts |
| Action providers | Do not allow providers to write state |
| Domain purity | Do not hardcode campus/tavern/Oak Town semantics into `src/` core |
| D5 status | Do not mark D5 Pass unless the actual pass criteria are substantially upgraded and independently testable |

Allowed:

| Area | Allowed work |
|---|---|
| Documentation truth | Fix README, CHANGELOG, release docs, examples docs |
| Examples | Fix examples to work as package consumers |
| Package metadata | Conservative package/files/exports/doc corrections |
| Type declarations | Add or align `.d.ts` for existing public facade surfaces when low risk |
| Smoke tests | Add consumer-facing smoke tests that exercise existing public APIs |
| Reports | Create release readiness assessment and completion reports |
| D5 assessment | Design or quantify D5 hardening without forcing a false Pass |

If a necessary fix crosses a hard boundary, do not implement it. Record it as a release blocker or deferred item with exact file/line evidence.

---

## 4. Autonomous Decision Rules

No planner or auditor will be available. Use these rules when blocked.

### 4.1 Fix Now

Fix the issue in the current run if all are true:

1. The issue is consumer-facing or release-readiness-facing.
2. The fix is local, low risk, and has direct tests or smoke coverage.
3. The fix does not change simulation semantics.
4. The fix does not touch Stable Envelope, schemaVersion, or public API removal.
5. The fix can be completed and validated inside the 8-hour timebox.

Examples:

| Fix-now example | Why |
|---|---|
| Example uses `require('../../index')` but should support package import | Consumer-facing, local |
| README contradicts package distribution status | Documentation truth |
| Missing `.d.ts` for a facade that already exports stable JS API | Release readiness, low risk if generated carefully |
| smoke:pack only imports but does not exercise a documented API | Gate hardening |

### 4.2 Defer With Evidence

Defer the issue if any are true:

1. It requires new architecture.
2. It changes runtime simulation semantics.
3. It risks breaking public API.
4. It needs a migration plan.
5. It would take more than 90 minutes to fix safely.
6. It is not necessary for Foundation Alpha.

Examples:

| Defer example | Reason |
|---|---|
| Full ESM support | Useful but not required for alpha |
| D5 semantic claim extraction implementation | Medium-size subsystem; should be v2.8 design/hardening unless already scoped |
| schemaVersion 0.2.0 | Needs migration policy |
| npm publish | Human approval required |

### 4.3 Stop And Report

Stop the affected workstream, but continue unrelated workstreams, if:

1. Tests reveal a real production regression outside the planned scope.
2. The working tree contains unexpected user changes in files you need to edit.
3. A gate failure cannot be traced after two focused attempts.
4. A subagent proposes a boundary-violating solution.

When stopping a workstream, write:

```text
Blocked workstream:
Evidence:
Commands run:
Files implicated:
Why not safe to continue unattended:
Recommended next human decision:
```

---

## 5. Commit Discipline

Use small phase commits only after local validation for that phase.

Expected commit pattern:

```text
docs(v2.7): prepare alpha release readiness baseline
fix(v2.7): align examples and release docs
test(v2.9): expand package smoke coverage
docs(v3.0): add alpha release candidate evaluation
docs: close release readiness evaluation phase
```

Rules:

1. Start with `git status --short`.
2. If dirty, inspect before editing. Do not overwrite unknown changes.
3. Do not commit failing production code.
4. Documentation-only commits may proceed after doc-specific validation plus `git diff --check`.
5. Code/test/package changes require relevant tests plus final gate.
6. Do not squash unrelated phases into one opaque commit unless timebox forces it; if forced, explain.

---

## 6. Eight-Hour Execution Schedule

This is a timebox, not a guarantee. Prioritize closure over perfection.

| Time | Phase | Primary outcome |
|---|---|---|
| 0:00-0:20 | Baseline | status, scripts, current docs, package exports, known readiness docs |
| 0:20-1:40 | v2.7 W1-W2 | CHANGELOG + examples/package-consumer fixes |
| 1:40-2:30 | v2.7 W3-W4 | README/release docs truth + alpha readiness report |
| 2:30-3:30 | v2.8 | D5 hardening assessment, not false Pass |
| 3:30-5:15 | v2.9 | TS/subpath/smoke/consumer readiness hardening |
| 5:15-6:30 | v3.0 | Alpha release candidate evaluation |
| 6:30-7:20 | v3.1+ if needed | Remediate blockers or record deferred blockers |
| 7:20-8:00 | Finalization | final gates, completion report, auditor handoff |

If time runs short, priority order is:

1. Release readiness truth and reports.
2. Examples and smoke gates.
3. Type declarations for public facades.
4. D5 assessment.
5. Nice-to-have docs polish.

---

## 7. v2.7 — Minimum Alpha Release Readiness

### Goal

Make the repository honestly ready for a possible Foundation Alpha publish decision, without actually publishing.

### Scope

| Work package | Task | Expected files |
|---|---|---|
| W1 | Create/repair CHANGELOG covering major v2.0-v2.6 hardening | `CHANGELOG.md` |
| W2 | Fix examples so they can run as package consumers | `examples/**`, possibly smoke scripts |
| W3 | README/docs truth pass for alpha distribution language | `README.md`, `docs/**` |
| W4 | Alpha release readiness report | `docs/current/V2_7_ALPHA_RELEASE_READINESS_REPORT.md` |

### Required checks

Subagent scan:

```text
Find every example import path.
Classify each as package-consumer-safe, local-dev-only, or broken.
Run examples where scripts exist.
Do not assume examples are correct because smoke:pack imports pass.
```

CHANGELOG minimum contents:

| Section | Required content |
|---|---|
| Foundation Alpha status | What this package is and is not |
| v2.2 | Persistence fidelity / L4 resume closure |
| v2.3 | Memory consistency and diagnostic hashes |
| v2.4 | Epistemic integrity / D3 Pass |
| v2.5 | Narrative grounding improvements, D5 still Warning if latest aliveness says Warning |
| v2.6 | Social emergence / D6 Pass |
| Known limitations | D5 regex-only, no npm publish performed, ESM not guaranteed if not implemented |

README truth rules:

1. If README says npm publish is not planned but package readiness infrastructure exists, rewrite to an honest alpha phrasing.
2. Do not claim published package availability unless `npm publish` has actually happened.
3. Do not claim Stable or production-ready.
4. D5 Warning must be stated as a known limitation for Foundation Alpha.

### v2.7 Pass criteria

| Criterion | Required |
|---|---|
| CHANGELOG exists | yes |
| Examples do not depend only on repo-relative imports unless clearly labeled local-dev | yes |
| README release language is internally consistent | yes |
| Alpha readiness report exists | yes |
| No npm publish/tag/release | yes |
| Relevant tests/smoke pass | yes |

If these pass, v2.7 can close.

---

## 8. v2.8 — D5 Narrative Faithfulness Hardening Assessment

### Goal

Decide how far D5 can be honestly advanced before release. This phase should improve evidence if cheap, but it must not force D5 to Pass by label manipulation.

### Scope

| Work package | Task | Expected output |
|---|---|---|
| W1 | Audit current D5 checker pass path and limitations | exact code evidence |
| W2 | Quantify corpus realism and false-positive/false-negative limitations | report table |
| W3 | Design claim extraction hardening path | RFC/report |
| W4 | Optional low-risk corpus/report improvements | tests/docs only if safe |

Expected report:

```text
docs/current/V2_8_D5_HARDENING_ASSESSMENT.md
```

### D5 Pass rule

D5 may be marked Pass only if all are true:

1. Aliveness-report has a real Pass path with explicit criteria.
2. Criteria include more than regex matching hand-built corpus.
3. There is a meaningful sample of realistic narrative outputs or a clearly justified deterministic substitute.
4. False positives and false negatives are both measured.
5. The auditor can reproduce the result from commands.

If not all are true, keep D5 Warning and document why. A truthful Warning is better than a decorative Pass.

### Claim extraction design options

Assess, do not blindly implement:

| Option | Pros | Cons | Default decision |
|---|---|---|---|
| Enhanced regex rule engine | deterministic, local | still brittle | acceptable only as incremental |
| Structured claim extraction without external LLM | deterministic, testable | limited coverage | good medium path |
| LLM-in-the-loop checker | semantic | nondeterministic, external dependency | not for unattended alpha gate |
| Embedding similarity | useful for paraphrase | dependency and determinism concerns | defer unless already available |

### v2.8 Pass criteria

| Criterion | Required |
|---|---|
| D5 hardening assessment exists | yes |
| Current D5 status is honestly justified | yes |
| No false D5 Pass | yes |
| If any D5 code changes occur, corpus/checker tests pass | yes |
| Stable boundaries unchanged | yes |

---

## 9. v2.9 — Standard Release Readiness Hardening

### Goal

Move from "minimum alpha readiness" toward "standard release readiness" by closing low-risk consumer gaps.

### Scope

| Work package | Task | Decision |
|---|---|---|
| W1 | Audit package exports vs public contract | fix docs or report mismatch |
| W2 | Audit `.d.ts` coverage for all public subpaths | add low-risk declarations or document gaps |
| W3 | Expand smoke:pack from import-only to behavior smoke | implement if safe |
| W4 | Fresh consumer matrix / npm pack dry-run assessment | run or document missing scripts |
| W5 | Standard readiness report | produce report |

Expected report:

```text
docs/current/V2_9_STANDARD_RELEASE_READINESS_REPORT.md
```

### Type declaration rules

Add `.d.ts` only for stable public facades:

```text
index
sdk
agent
domain
facts
store
config
presets/campus
presets/tavern
```

Do not expose internal `src/` implementation details through declarations just to make TypeScript happy.

If a subpath currently points into `src/` directly, classify:

| Case | Action |
|---|---|
| Public contract already accepts it | Document and add conservative declaration |
| Accidental internal exposure | Do not silently bless it; report as release risk |
| Fix requires package export redesign | Defer to post-alpha |

### Smoke behavior candidates

Prefer smoke tests that use public API and finish fast:

| Smoke | Purpose |
|---|---|
| Root import constructs engine/world | package entry works |
| SDK facade basic construction | sdk export works |
| Facts facade creates/stores a fact | facts export works |
| Store facade serializes/deserializes simple world state | persistence export works |
| Domain facade validates a simple custom domain or preset | domain export works |

Do not make smoke tests depend on long stochastic simulations.

### v2.9 Pass criteria

| Criterion | Required |
|---|---|
| Public export matrix documented | yes |
| `.d.ts` gaps fixed or documented | yes |
| smoke:pack behavior coverage improved or explicitly deferred | yes |
| pack dry-run/fresh consumer evidence recorded | yes |
| No API break | yes |

---

## 10. v3.0 — Alpha Release Candidate Evaluation

### Goal

Produce a go/no-go release candidate evaluation for Foundation Alpha.

This is the phase that answers:

```text
If the user asked tomorrow "can I approve npm publish?", what exactly would still block it?
```

Expected report:

```text
docs/current/V3_0_ALPHA_RELEASE_CANDIDATE_EVALUATION.md
```

### Required sections

| Section | Required content |
|---|---|
| Release candidate identity | commit hash, package version, working tree status |
| Public API matrix | exports, declarations, examples, smoke coverage |
| Aliveness matrix | D1-D7 current statuses with command evidence |
| Package matrix | files included, npm pack dry-run result, package size if available |
| Consumer matrix | CJS consumer, TypeScript consumer if possible, examples |
| Gate matrix | all validation commands and results |
| Known limitations | D5 Warning, ESM status, TS gaps, non-published status |
| Go/no-go | one of: Ready for human alpha publish approval / Not ready / Ready with explicit waivers |

### Go/no-go rules

Ready for human alpha publish approval if all are true:

1. Working tree clean after commits.
2. Full gate passes.
3. `npm pack --dry-run` or equivalent pack inspection succeeds.
4. Examples and smoke tests prove basic consumer usage.
5. README/CHANGELOG honestly describe alpha status.
6. No boundary violations.
7. D5 Warning is documented as known alpha limitation.

Ready with explicit waivers if:

1. All core gates pass.
2. Remaining gaps are non-blocking for alpha, such as ESM support.
3. Waivers are listed clearly for auditor and user.

Not ready if:

1. Any core gate fails.
2. Examples are broken for consumers.
3. Package exports are inconsistent with public contract.
4. Docs claim capabilities not backed by tests.
5. Any hard boundary was crossed.

---

## 11. v3.1+ — Post-v3.0 Remediation If Needed

Only execute v3.1+ if v3.0 cannot close release readiness evaluation.

### v3.1 Possible Remediation: Consumer Blockers

Use if examples/package/types/smoke prevent Alpha readiness.

Allowed tasks:

| Task | Allowed |
|---|---|
| Fix example imports | yes |
| Add missing low-risk declarations | yes |
| Fix package files whitelist | yes |
| Expand smoke:pack behavior test | yes |
| Rework public export architecture | no, defer unless tiny and obvious |

### v3.2 Possible Remediation: Documentation Truth

Use if code is ready but docs are inconsistent.

Allowed tasks:

| Task | Allowed |
|---|---|
| README truth pass | yes |
| CHANGELOG correction | yes |
| Release checklist | yes |
| Known limitations page | yes |
| Marketing claims | no |

### v3.3 Possible Remediation: D5 Release Waiver

Use if D5 Warning creates ambiguity.

Expected output:

```text
docs/current/D5_ALPHA_RELEASE_WAIVER.md
```

Waiver must state:

1. D5 is Warning, not Pass.
2. Checker is regex-only / best-effort.
3. Narrative output should be treated as constrained but not formally verified.
4. Stable release requires D5 hardening.
5. This waiver is acceptable only for Foundation Alpha.

---

## 12. Final Phase — Release Readiness Evaluation Completion

This is the real endpoint.

Expected final report:

```text
docs/current/RELEASE_READINESS_EVALUATION_COMPLETION_REPORT.md
```

### Completion report required table

| Item | Required |
|---|---|
| Phase range | v2.7 -> final remediation phase |
| Commits | list commit hash + purpose |
| Files changed | grouped by docs/examples/tests/package/src |
| Gates | command result matrix |
| Aliveness | D1-D7 result matrix |
| Package readiness | exports/types/examples/smoke/pack |
| D5 handling | Warning/Pass status and rationale |
| Publish status | explicitly "not published" |
| Final recommendation | one clear go/no-go sentence |
| Auditor instructions | where to start auditing and what to verify first |

### Completion criteria

The Release Readiness Evaluation phase is complete when:

1. The final report exists.
2. All implemented changes are committed.
3. Working tree is clean, or any uncommitted files are explicitly listed with reason.
4. Full validation has been run or failures are documented with evidence.
5. Final recommendation is unambiguous.
6. No npm publish/tag/release was performed.

---

## 13. Validation Commands

Run commands available in this repo. If a script is missing, document it; do not invent success.

Minimum final gate:

```bash
npm test
npm run test:domain
npm run check:boundaries
npm run replay:diff
npm run smoke:pack
npm run perf:check
git diff --check
```

Release-readiness gate:

```bash
npm pack --dry-run
```

Run if scripts exist:

```bash
npm run release-gate
npm run fresh-consumer-matrix
npm run typecheck
npm run typecheck:consumer
```

Important:

1. `perf:check` may be rerun once if it flakes.
2. If `perf:check` fails twice, treat as real.
3. Do not lower thresholds to pass.
4. Do not skip tests without writing a blocking report.

---

## 14. Auditor Handoff Package

At the end, prepare the response for the user/auditor with:

```text
1. Final verdict
2. Commit list
3. Gate matrix
4. D1-D7 aliveness matrix
5. Package readiness matrix
6. D5 treatment
7. Known limitations
8. Files changed
9. Suggested audit order
10. Explicit confirmation: no npm publish/tag/release
```

Suggested independent auditor order:

| Priority | Audit target |
|---|---|
| 1 | Verify no npm publish/tag/release |
| 2 | Verify package exports/files/types matrix |
| 3 | Verify examples work as consumers |
| 4 | Verify CHANGELOG/README truth |
| 5 | Verify full gate logs |
| 6 | Verify D5 Warning was not laundered into false Pass |
| 7 | Verify final go/no-go conclusion |

---

## 15. Expected Final Outcomes

Best case after 8 hours:

```text
Release Readiness Evaluation: Complete
Recommendation: Ready for human alpha publish approval, with D5 alpha limitation documented
Publish performed: No
```

Acceptable case:

```text
Release Readiness Evaluation: Complete with explicit blockers
Recommendation: Not ready until listed blockers are fixed
Publish performed: No
```

Unacceptable case:

```text
Tests were skipped, D5 was falsely marked Pass, npm publish was run, public API was broken, or boundary violations were hidden.
```

The final report should be useful even if the answer is "not ready". A truthful no-go is a successful release readiness evaluation.

---

## 16. One-Screen Instruction For Architect AI

If context gets tight, keep this:

```text
You are closing the Release Readiness Evaluation phase, not shipping to npm.
Use subagents. Do not do everything inline.
Do v2.7 alpha readiness docs/examples first.
Do v2.8 D5 hardening assessment honestly; do not force D5 Pass.
Do v2.9 package/types/smoke hardening.
Do v3.0 alpha release candidate evaluation.
Continue v3.1+ only if blockers remain.
Never npm publish, tag, or GitHub release.
Fix low-risk consumer/docs/types/smoke issues.
Defer Stable Envelope/schemaVersion/API/StoryArc/UI/semantic checker architecture.
End with RELEASE_READINESS_EVALUATION_COMPLETION_REPORT.md, clean worktree, gate matrix, go/no-go.
```
