# Andy Engine Internal Beta Implementation Plan

> Status: active implementation handoff.
> Audience: implementation AI / engineer.
> Scope: post-D5 Semantic Alpha hardening toward Internal Beta.
> Non-goal: public GitHub update, npm publish, or Stable marketing claim.

---

## 0. Current Baseline

Andy Engine is currently a Foundation Alpha engine with strong hardening gates.
The D5 narrative grounding work has reached Semantic Alpha Pass, not Semantic
Beta and not Stable Grounding.

Current verified baseline:

```text
npm test                         3847 passed / 28 skipped
npm run test:domain              82 passed
npm run check:boundaries         passed
npm run smoke:pack               19 passed
npm run perf:check               passed
npm run typecheck                passed
npm run typecheck:consumer       passed
npm run fresh:consumer           passed
npm audit --omit=dev             0 vulnerabilities
npm run release:gate             passed
git diff --check                 passed
git status --short               clean
```

D5 Semantic Alpha evidence:

```text
semantic corpus total samples    455
LLM-generated samples            110
gold_violation false pass rate   0%
gold_pass false block rate       0%
P1 hard-gated regressions        12 / 12
semanticAlphaGateMet             true
```

Important limitation:

- D5 is evidence-bound structured grounding, not full natural-language semantic
  proof.
- Current corpus provenance is represented by fixture metadata and local test
  reports. It is not yet a reproducible multi-model benchmark.
- Semantic Beta requires a larger, multi-model, reportable evaluation system.

---

## 1. Operating Rules

Implementation agents must follow these rules before changing code:

1. Read `AGENTS.md`, `README.md`, `docs/PUBLIC_API_CONTRACT.md`, and this file.
2. Keep changes small and reviewable. Do not mix unrelated cleanup with behavior
   changes.
3. Do not publish to npm.
4. Do not update GitHub unless explicitly instructed by the maintainer.
5. Do not introduce silent network calls in runtime, narrative, agent, or tests.
6. Do not let narrative or LLM output create world facts.
7. Do not make Stable Grounding claims.
8. Do not expand old top-level implementation directories.
9. Do not change Stable World Envelope without a migration plan.
10. Every implementation round must include evidence: commands run, results, and
    any known caveats.

Minimum pre-handoff commands for any code change:

```bash
npm test
npm run test:domain
npm run check:boundaries
npm run smoke:pack
git diff --check
```

If touching runtime, action, effects, narrative grounding, performance-sensitive
paths, packaging, or public API declarations, also run the relevant commands:

```bash
npm run perf:check
npm run typecheck
npm run typecheck:consumer
npm run fresh:consumer
npm run release:gate
```

---

## 2. Target: Internal Beta Gate

Internal Beta is an internal quality milestone. It is not a public Stable release.

Internal Beta is reached only when all of the following are true:

```text
No known supported-scope P0/P1 issues
release:gate passes
D5 public JS API, TypeScript declarations, docs, and tests agree
D5 Semantic Beta evaluation report exists
D5 corpus >= 1500 total samples
D5 LLM-generated corpus >= 750 samples
D5 benchmark covers at least 4 model/source families
D5 benchmark includes locked holdout split
D5 per-category false pass / false block rates meet thresholds
D5 adversarial and multi-turn-like samples meet thresholds
Action/effect active path has a clear canonical direction
WorldObject is either integrated or explicitly downgraded
Public API contract matches package exports and .d.ts files
Examples and fresh consumers remain runnable
README and quality docs avoid overclaiming Stable Grounding
```

Do not mark Internal Beta complete if any of the above is only described in a
paper report but not verified locally.

---

## 3. Phase A: D5 Semantic Alpha Surface Closure

### Goal

Make current D5 Alpha implementation clean and coherent before expanding Beta
scope.

This phase fixes the mismatch between runtime behavior, TypeScript declarations,
public contracts, and README language.

### Required Work

1. Update root TypeScript declarations.
   - File: `index.d.ts`
   - Add `checkConsistency(llmOutput, agentId, options?)`.
   - Add types for `structuredClaims`, `evidenceTrace`, `coreferenceNotes`, and
     `verifierDecisions`.

2. Update facts TypeScript declarations.
   - File: `facts/index.d.ts`
   - `FactConsistencyChecker.check()` must accept `(llmOutput, grounding,
     options?)`, not `(llmOutput, agentId)`.
   - Return type must expose optional D5 trace fields.

3. Update SDK TypeScript declarations.
   - File: `src/sdk/types.d.ts`
   - `Character.chat()` and `Character.chatStream()` options must include
     `structuredClaims`.
   - Preserve existing `llm` option compatibility.

4. Add targeted consumer type coverage.
   - File: `scripts/consumer-typecheck.sh` or a focused new consumer test.
   - Include a TS call like:

```ts
const result = engine.checkConsistency('我在图书馆', 'alice', {
  structuredClaims: { claims: [] },
});
result.evidenceTrace?.forEach(trace => console.log(trace.claimId));
```

5. Update `docs/PUBLIC_API_CONTRACT.md`.
   - Change `checkConsistency(llmOutput, id)` to include optional `options`.
   - Remove or update stale claims that subpaths do not provide independent
     `.d.ts` files.
   - Document that D5 trace fields are additive and experimental.

6. Tighten README wording.
   - Keep: D5 Semantic Alpha Pass.
   - Avoid: Stable Grounding, hallucination prevention guarantee, semantic proof.
   - Clarify: location alias currently supports evidence trace diagnostics and
     does not necessarily change the legacy v2 decision path unless explicitly
     wired.

7. Add explicit version layering.
   - Keep `checkerVersion: 'v2-structured'` if tests and compatibility require
     it.
   - Add an additive field such as:

```js
groundingVersion: 'v3-semantic-alpha'
```

   - Apply consistently to `GroundingChecker` and `FactConsistencyChecker`.
   - Add tests for both fields.

### Acceptance Criteria

```bash
npm run typecheck
npm run typecheck:consumer
npm run fresh:consumer
npm test -- tests/unit/narrative/grounding
npm test -- tests/unit/narrative/semantic-corpus-report.test.js tests/unit/narrative/semantic-corpus.test.js
npm run release:gate
```

Manual verification:

- A fresh TypeScript consumer can call D5 sidecar options.
- `FactConsistencyChecker.check()` returns `evidenceTrace` when
  `GroundingChecker.check()` does for the same input.
- README, `PUBLIC_API_CONTRACT.md`, `.d.ts`, and runtime behavior agree.

### Stop Condition

Do not start Semantic Beta corpus expansion until Phase A is complete.

---

## 4. Phase B: D5 Semantic Beta Evaluation Harness

### Goal

Build a real evaluation system before expanding the corpus. The first Beta task
is measurement, not sample volume.

Beta must be strict enough that it cannot be passed by adding easy, repetitive,
or checker-shaped samples. Treat the Beta corpus as a benchmark, not a unit test
dump.

### Required Work

1. Create a benchmark report runner.
   - Suggested path:
     `tests/fixtures/narrative-semantic-corpus/beta-report-runner.js`
   - Output JSON and readable Markdown.
   - Preserve the existing Alpha `report-runner.js`.

2. Add per-category metrics.
   - Required categories:

```text
location
event
relationship
state/emotion/needs
source_attribution
time
negation
uncertainty
coreference
paraphrase
multi_sentence
domain_portability
adversarial
sidecar
long_context
mixed_language
entity_alias_collision
source_chain
```

3. Add per-source metrics.
   - Track at least:

```text
handwritten
simulated_llm_style
llm_generated
model_or_source_family
generation_date
prompt_template_id
dedupe_hash
split
```

4. Add failure taxonomy.
   - Each failed sample should classify the failure as one of:

```text
missed_claim
wrong_subject
wrong_object
wrong_polarity
wrong_modality
wrong_source_attribution
overblocked_supported_claim
underblocked_unsupported_claim
coreference_error
alias_error
sidecar_validation_error
policy_error
fixture_error
provenance_error
duplicate_sample_error
too_easy_sample_error
```

5. Add reproducibility metadata.
   - Store prompt template id, generation source family, date, and dedupe hash.
   - Do not store secrets or provider keys.

6. Add locked splits.
   - Required splits:

```text
train_like_regression
calibration
locked_holdout
adversarial_holdout
```

   - `locked_holdout` and `adversarial_holdout` must not be used to tune claim
     extraction rules inside the same implementation round.
   - Any fix inspired by holdout failures must be validated against a newly
     rotated holdout extension before claiming improvement.

7. Add quality gates for sample validity.
   - Reject samples with duplicate normalized text unless explicitly marked as a
     regression pair.
   - Reject LLM-generated samples shorter than 10 CJK characters or 20 Latin
     characters unless explicitly categorized as short-form boundary tests.
   - Reject samples missing source metadata.
   - Reject batches where more than 15% of samples share the same sentence frame.
   - Report lexical diversity for each LLM-generated batch.

8. Add benchmark tests.
   - Alpha tests can remain strict.
   - Beta runner should report metrics without requiring all future thresholds
     to pass until enough corpus exists.

### Acceptance Criteria

```bash
node tests/fixtures/narrative-semantic-corpus/report-runner.js
node tests/fixtures/narrative-semantic-corpus/beta-report-runner.js
npm test -- tests/unit/narrative/semantic-corpus-report.test.js tests/unit/narrative/semantic-corpus.test.js
npm run check:boundaries
```

The Beta report must clearly print:

```text
total samples
LLM-generated samples
samples by category
samples by source family
samples by split
false pass rate overall and by category
false block rate overall and by category
false pass / false block by split
false pass / false block by source family
top failure patterns
known unsupported semantics
duplicate and short-sample audit
holdout leakage audit
whether Semantic Beta gate is met
```

### Stop Condition

Do not claim Semantic Beta until the report itself says all Beta gates are met.

---

## 5. Phase C: D5 Corpus Expansion To Semantic Beta

### Goal

Expand D5 from Alpha evidence to Beta evidence using measured, multi-source
language samples.

### Beta Gate

```text
total corpus samples >= 1500
LLM-generated samples >= 750
source families >= 4
locked_holdout samples >= 300
adversarial_holdout samples >= 150
paraphrase + coreference samples >= 350
adversarial samples >= 250
multi-sentence samples >= 200
source-chain samples >= 120
mixed-language samples >= 80
false pass rate on gold_violation <= 3%
false block rate on gold_pass <= 6%
false pass rate on locked_holdout <= 4%
false block rate on locked_holdout <= 7%
false pass rate on adversarial_holdout <= 6%
per-category false pass rate <= 6%
per-category false block rate <= 10%
no P1 hard regression false passes
P1 regression samples hard-gated
all known P1 regressions have named test ids
benchmark report generated and checked in
duplicate normalized text rate <= 1% excluding explicit regression pairs
LLM-generated batch frame repetition <= 15%
all LLM-generated samples have provenance metadata
manual adjudication notes exist for at least 100 boundary samples
```

### Corpus Expansion Rules

1. Do not duplicate existing samples except for explicit regression variants.
2. Every sample must have a stable id.
3. Every sample must have expected result and category tags.
4. Every LLM-generated sample must include source metadata.
5. Each category must contain both pass and violation cases where meaningful.
6. Include short, long, colloquial, multi-sentence, and mixed-language phrasing.
7. Include domain-portability examples outside campus/tavern.
8. Include adversarial examples that try to bypass regex-like matching.
9. Maintain a locked holdout split that implementation agents must not tune
   against directly.
10. Include boundary samples that a human reviewer would find genuinely
    debatable; label them with adjudication notes.
11. Include negative controls where the correct behavior is "do not block".
12. Include positive controls where the correct behavior is "must block".

### Recommended Category Minimums

```text
location                         >= 180
event                            >= 180
relationship                     >= 120
state/emotion/needs              >= 180
source_attribution               >= 160
time                             >= 120
negation                         >= 160
uncertainty/hypothetical          >= 160
coreference                      >= 180
paraphrase/alias                 >= 180
multi_sentence                   >= 200
domain_portability               >= 160
adversarial                      >= 250
sidecar                          >= 140
long_context                     >= 120
mixed_language                   >= 80
entity_alias_collision           >= 80
source_chain                     >= 120
```

The sum can overlap because one sample may carry multiple tags. However, tag
overlap cannot be used to fake coverage: each major category must contain at
least 40 unique primary-category samples.

### Required Split Distribution

```text
train_like_regression            >= 500
calibration                      >= 350
locked_holdout                   >= 300
adversarial_holdout              >= 150
manual_boundary_review           >= 100
```

Rules:

- `train_like_regression` is allowed to include known historical regressions.
- `calibration` can be used to tune thresholds.
- `locked_holdout` is for final measurement only.
- `adversarial_holdout` is for final measurement only and should include prompt
  injection-like phrasing, evasive source wording, indirect contradiction,
  pronoun ambiguity, and domain alias collisions.
- `manual_boundary_review` must include a short adjudication note explaining why
  the expected result is acceptable.

### Required Model / Source Family Distribution

The corpus must include at least four source families:

```text
strong_general_model
cheap_or_free_model
small_fast_model
adversarial_or_weak_model
```

Minimum LLM-generated samples:

```text
strong_general_model             >= 150
cheap_or_free_model              >= 200
small_fast_model                 >= 200
adversarial_or_weak_model         >= 100
cross_model_prompt_replay         >= 100
```

Do not check in provider credentials. Store only non-secret provenance metadata.

### Required Reports

Generate and check in a benchmark report under:

```text
docs/quality/d5-semantic-beta-report.md
```

The report must include:

- date
- commit hash
- corpus version
- total sample count
- LLM-generated sample count
- model/source family breakdown
- split breakdown
- category coverage
- false pass / false block metrics
- confidence interval or Wilson interval for key rates
- top false pass examples
- top false block examples
- hardest passed examples
- hardest blocked examples
- holdout-only metrics
- adversarial-only metrics
- sample quality audit
- duplicate audit
- provenance audit
- unsupported semantics
- recommended next work

### Acceptance Criteria

```bash
node tests/fixtures/narrative-semantic-corpus/beta-report-runner.js --write
npm test -- tests/unit/narrative
npm test
npm run release:gate
```

Manual acceptance:

- A reviewer can inspect the report and understand which semantic phenomena are
  still weak.
- No Beta claim relies only on aggregate rates; category and holdout rates must
  pass too.
- At least 30 failed or near-failed examples are summarized in the report.
- Any threshold change must be documented with rationale.

---

## 6. Phase D: Canonical Action/Effect Pipeline Direction

### Goal

Reduce ambiguity in the active action/effect path. Current behavior is tested,
but some active selection code still bridges through legacy `stateDeltas`.

Target direction:

```text
CandidateProvider
  -> UtilityScorer
  -> UtilitySelector
  -> SelectedAction + ReasonTrace
  -> EventEffectPipeline
  -> EffectResult.deltas
  -> EffectCommitter
  -> world state
```

### Required Work

1. Audit current active action path.
   - Primary files:

```text
src/agent/runtime/ActionSelectionRuntime.js
src/effects/EventEffectPipeline.js
src/effects/EffectResult.js
src/effects/EffectCommitter.js
src/action/SelectedAction.js
src/action/ReasonTrace.js
```

2. Write a short implementation note before refactoring.
   - Suggested path:
     `docs/current/ACTION_EFFECT_CANONICALIZATION_NOTE.md`

3. Identify which legacy `stateDeltas` paths are compatibility-only.

4. Add tests that prove:
   - active selection produces typed deltas
   - typed deltas are committed exactly once
   - legacy bridge remains backward compatible
   - no action provider mutates world state

5. Migrate in small steps.
   - Do not rewrite all action/effect code in one round.
   - Keep behavior unchanged unless a bug is explicitly identified.

### Acceptance Criteria

```bash
npm test -- tests/action* tests/effects* tests/phase-* tests/e2e/*
npm run check:boundaries
npm run perf:check
npm run release:gate
```

### Stop Condition

Stop and write findings if active behavior changes golden replay or performance
without a clear explanation.

---

## 7. Phase E: WorldObject Decision

### Goal

Stop leaving `WorldObject` in an ambiguous state. It must either become a real
runtime capability or be clearly marked experimental/model-only.

### Option 1: Runtime Integration

Required capabilities:

```text
WorldObject registry or source of objects
Object affordance candidate provider
Action candidate can target object id
EventEffectPipeline handles object interaction effects
Facts can represent object state or object usage
Serialization preserves object state
Tests cover object lifecycle
```

### Option 2: Explicit Downgrade

Required cleanup:

```text
README says WorldObject is modeled but not runtime-integrated
docs/current note records deferred integration
tests only claim model-level behavior
no public wording implies object actions already drive runtime
```

### Recommendation

Choose Option 2 first unless there is a concrete product scenario requiring
runtime object interaction. D5 and action/effect canonicalization are higher
leverage.

### Acceptance Criteria

For downgrade:

```bash
npm test -- tests/facts/worldobject-integration.test.js
npm run release:gate
```

For integration:

```bash
npm test -- tests/action* tests/effects* tests/facts/*worldobject*
npm run check:boundaries
npm run perf:check
npm run release:gate
```

---

## 8. Phase F: Maintenance Cost And Historical Patch Trace Cleanup

### Goal

Reduce long-term maintenance cost from accumulated hardening comments without
changing behavior.

### Rules

1. This phase is behavior-preserving only.
2. Do not remove comments that explain non-obvious invariants.
3. Do remove comments that only say `Rxx fix` without current engineering value.
4. Move historical rationale to docs or changelog only if still important.
5. Work file-by-file, never by broad mechanical deletion.

### Priority Files

```text
src/narrative/GroundingChecker.js
src/narrative/FactConsistencyChecker.js
src/agent/psychology/BehaviorField.js
src/agent/psychology/EmotionVector.js
src/agent/psychology/NeedsSystem.js
src/agent/runtime/ActionSelectionRuntime.js
src/social/SocialGraph.js
src/spatial/SpatialEngine.js
src/store/Serialization.js
```

### Acceptance Criteria

For each touched file:

```bash
npm test -- <targeted tests>
npm run check:boundaries
git diff --check
```

For a cleanup batch:

```bash
npm test
npm run release:gate
```

---

## 9. Suggested Execution Order

Recommended order:

```text
A1 D5 TypeScript/API surface closure
A2 D5 public contract and README wording closure
A3 groundingVersion additive field
B1 Beta report runner skeleton
B2 per-category/per-source metrics
B3 failure taxonomy
C1 corpus schema metadata cleanup
C2 corpus expansion to 800 total / 300 LLM-generated
C3 corpus expansion to 1200 total / 550 LLM-generated
C4 corpus expansion to 1500 total / 750 LLM-generated with locked holdout
C5 Beta report write-out and strict gate
D1 action/effect audit note
D2 typed delta active-path tests
D3 migrate one legacy bridge at a time
E1 WorldObject downgrade or integration decision
F1 targeted comment cleanup in narrative files
F2 targeted comment cleanup in runtime/psychology files
Internal Beta final audit
```

Do not parallelize phases D and C in the same files. D5 corpus work and
action/effect migration can proceed in separate branches, but merge only after
both pass `release:gate`.

---

## 10. Implementation Round Template

Every implementation round should end with this report format:

```markdown
## Round Summary

Goal:

Files changed:

Behavior changes:

Tests added/updated:

Verification:
- command: result
- command: result

Known caveats:

Next recommended step:
```

If a P0/P1 is found, the report must start with:

```markdown
## Blocking Finding

Severity:
File/line:
Impact:
Reproduction:
Recommended fix:
```

---

## 11. What Not To Do Next

Do not spend the next implementation rounds on:

- npm publish.
- GitHub polish.
- website/demo UI.
- broad code style cleanup.
- StoryArc runtime.
- WorldObject full integration unless explicitly chosen.
- claiming D5 is solved.
- adding a mandatory external verifier.
- adding network calls to tests that must pass offline.

The immediate next work is Phase A.

---

## 12. Definition Of Done For The Next Checkpoint

The next checkpoint is complete when:

```text
D5 runtime API, TypeScript declarations, tests, and docs agree
FactConsistencyChecker exposes D5 trace fields consistently
fresh TypeScript consumer can use structuredClaims
README only claims Semantic Alpha Pass
PUBLIC_API_CONTRACT matches package exports and .d.ts files
release:gate passes
git status is clean
```

At that point, create a checkpoint summary titled:

```text
D5 Semantic Alpha Surface Closed
```

Then proceed to Phase B.
