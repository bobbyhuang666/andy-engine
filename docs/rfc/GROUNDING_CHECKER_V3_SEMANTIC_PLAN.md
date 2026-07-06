# Grounding Checker v3 Semantic Plan

> Temporary planning document. This is not a public stable promise.
> Current shipped baseline remains D5 Structured Warning / Foundation Alpha Pass
> through `ClaimExtractor` + `GroundingChecker` v2.

---

## 1. Why This Exists

D5 v2 moved Andy Engine from a regex-first narrative guard to a structured
deterministic checker:

```text
LLM text
  -> ClaimExtractor
  -> GroundingChecker
  -> FactConsistencyChecker compatibility facade
```

That is a real improvement, but it is still not semantic grounding. It can catch
many high-frequency hallucination and false-positive cases, but it still guesses
claims from natural language with shallow heuristics.

The v3 goal is to move closer to true semantic grounding without turning core
runtime into an LLM-dependent service.

The target is:

```text
LLM output plus optional structured claim sidecar
  -> claim graph
  -> explicit evidence binding
  -> deterministic validation
  -> optional semantic verifier
  -> calibrated policy decision
```

The important distinction:

- v2 asks: "Can we extract common claims from text and check them?"
- v3 asks: "Can every meaningful narrative claim prove which facts support it?"

---

## 2. Product Goal

Andy Engine should be able to say:

> The LLM is allowed to phrase things creatively, but each factual claim must be
> supported by the character's grounding package or explicitly marked as
> uncertain, inferred, or sourced.

This still does not mean perfect natural-language truth. It means the engine has
a reviewable evidence trail for narrative claims, including source strength and
failure policy.

---

## 3. Non-Goals

Do not implement these in v3 core:

- Mandatory external LLM/NLI calls inside `src/runtime`, `src/agent`, or
  `src/narrative`.
- Silent network calls during `FactConsistencyChecker.check()`.
- Any checker path that writes to `WorldFactStore` or `KnowledgeStore`.
- A claim that `propagatedFrom` means event participation or physical presence.
- Stable marketing claims such as "prevents hallucination" or "semantic proof".
- Broad multi-turn memory rewriting.
- A new public API that breaks `FactConsistencyChecker.check(llmOutput, grounding)`.

Optional semantic verifiers are allowed only as explicit adapters, disabled by
default.

---

## 4. Architecture Target

### 4.1 Layered Pipeline

```text
Narrative text
Optional structured sidecar
        |
        v
ClaimGraphBuilder
        |
        v
EvidenceBinder
        |
        v
DeterministicEntailment
        |
        +--> OptionalSemanticVerifier
        |
        v
GroundingPolicy
        |
        v
{ valid, violations, severity, suggestion, claims, evidenceTrace }
```

### 4.2 Compatibility

The public facade stays:

```js
checker.check(llmOutput, grounding)
```

v3 may accept an optional third argument later:

```js
checker.check(llmOutput, grounding, {
  structuredClaims,
  verifier,
  strictness,
})
```

Do not require the third argument for existing callers.

---

## 5. Core Concepts

### 5.1 ClaimGraph

v2 claims are flat. v3 should represent relationships between claims:

```js
{
  id: 'claim_001',
  type: 'location',
  subject: { kind: 'agent', id: 'bob', raw: '鲍勃' },
  predicate: 'went_to',
  object: { kind: 'location', id: 'library', raw: '图书馆' },
  polarity: 'affirmative',
  modality: 'certain',
  source: { kind: 'told', by: 'bob' },
  time: { kind: 'relative', raw: '刚才', normalized: null },
  span: { start: 0, end: 12, raw: '鲍勃告诉我他去了图书馆' },
  evidence: [],
  dependencies: []
}
```

Examples of dependencies:

- A pronoun claim depends on a coreference claim.
- A source-attributed claim depends on a source marker claim.
- A causal claim depends on two event claims.
- An emotion claim may depend on an observed-behavior claim.

### 5.2 EvidenceBinding

Every blocking claim should bind to one or more allowed facts:

```js
{
  claimId: 'claim_001',
  factId: 'fact_event_123',
  support: 'supports',
  evidenceSource: 'told',
  confidence: 0.6,
  reason: 'fact participants include bob and location is 图书馆'
}
```

`propagatedFrom` must stay source metadata only. It can support source
attribution, not physical participation.

### 5.3 Modality

v3 should separate polarity from modality:

```text
polarity: affirmative | negative
modality: certain | uncertain | hypothetical | inferred | reported
```

This avoids treating "鲍勃可能在图书馆" as a failed location claim. It is a
weaker claim that needs different policy.

---

## 6. Work Packages

### W1. Claim Schema v3

Create a private schema module, likely:

```text
src/narrative/grounding/ClaimSchema.js
```

It should define:

- claim id
- claim type
- normalized subject / object
- raw text span
- polarity
- modality
- source attribution
- evidence requirement
- evidence bindings
- confidence
- extraction method

Initial claim types:

```text
location
event
relationship
state
memory
source_attribution
time
causal
comparison
quote_or_report
```

Do not expose this as public API until stable.

Acceptance:

- v2 claim output can be translated into v3 schema.
- Unknown fields are ignored safely.
- No runtime mutation of facts or knowledge.

### W2. Structured Claim Sidecar

Add an optional protocol for LLM integrations:

```json
{
  "text": "听说鲍勃去了图书馆。",
  "claims": [
    {
      "type": "location",
      "subject": "bob",
      "predicate": "went_to",
      "object": "图书馆",
      "source": { "kind": "told", "by": "bob" },
      "modality": "reported",
      "span": "鲍勃去了图书馆"
    }
  ]
}
```

This should be optional. If absent, v3 falls back to deterministic extraction.

Acceptance:

- SDK can pass sidecar claims into checker without breaking current text-only
  behavior.
- Sidecar claims are validated, not trusted blindly.
- Malformed sidecar returns a structured violation or falls back safely.

### W3. Coreference And Pronoun Resolution

Add a deterministic, conservative coreference layer for the common cases:

```text
鲍勃告诉我他去了图书馆
我看到鲍勃，他看起来很累
爱丽丝和鲍勃去了食堂，他点了晚饭
```

Rules:

- Prefer explicit subject in same sentence.
- If ambiguous, mark claim as `coreference_ambiguous`; do not hard pass.
- Never bind pronouns across long context unless a sidecar claim provides the
  binding.

Acceptance:

- Ambiguous pronouns do not become false passes.
- Clear source-attributed pronouns bind only when evidence supports the resolved
  participant.
- Regression tests cover source agent vs event participant confusion.

### W4. EvidenceBinder

Create:

```text
src/narrative/grounding/EvidenceBinder.js
```

Responsibilities:

- Build indexes from `allowedFacts`.
- Match claims to candidate facts.
- Produce evidence bindings with reasons.
- Keep fact source tiers intact.

Indexes should include:

```text
agentId -> location evidence from participants / observers only
event description -> fact ids
relationship pair -> relationship facts
agent state -> self-only direct state facts
source attribution -> _evidence.source / propagatedFrom
location aliases -> domain regions
```

Important rule:

```text
_evidence.propagatedFrom supports "who told me",
not "who was there".
```

Acceptance:

- Claim validation reads evidence bindings, not raw fact arrays directly.
- Test fixtures can print why a claim passed or failed.
- All old v2 supported cases still pass.

### W5. Deterministic Entailment

Before optional model verification, implement deterministic entailment:

```text
exact support
normalized alias support
same participant/location support
same event description support
source-marked reported support
uncertain/inferred support
contradiction
unsupported
ambiguous
```

Example:

```text
Fact: Bob participated in event at library.
Claim: Bob went to library.
Result: supports, unless event type says "mentioned library" not movement.
```

This needs domain/event semantics. Do not assume every event with a location
means every mentioned agent went there unless the agent is in participants or
observers.

Acceptance:

- Entailment result is inspectable.
- Contradictions are different from unsupported claims.
- Uncertain claims do not become affirmative claims.

### W6. Optional Semantic Verifier Adapter

Define an adapter interface only:

```js
class GroundingVerifier {
  async verify({ text, claims, grounding, evidenceBindings }) {
    return {
      decisions: [
        {
          claimId: 'claim_001',
          result: 'supports',
          confidence: 0.82,
          explanation: '...'
        }
      ]
    };
  }
}
```

Possible implementations later:

- local NLI model
- external LLM verifier
- rule-only no-op verifier
- offline audit verifier

Core default must be rule-only.

Acceptance:

- No dependency on network or paid model in default tests.
- Verifier failure degrades gracefully to deterministic result.
- Verifier cannot promote a claim to pass if deterministic evidence is absent
  unless strictness allows `semantic_review` mode.

### W7. Corpus And Evaluation

v3 requires a real corpus, not only hand-written unit cases.

Create:

```text
tests/fixtures/narrative-semantic-corpus/
```

Corpus groups:

```text
gold_pass
gold_violation
ambiguous_boundary
paraphrase
coreference
source_attribution
emotion_needs
time
domain_portability
multi_sentence
```

Each sample should include:

```js
{
  id,
  domain,
  llmOutput,
  optionalSidecar,
  grounding,
  expected: {
    severity,
    violations,
    claimDecisions
  },
  notes
}
```

Suggested gates for Semantic Alpha:

```text
>= 300 total samples
>= 100 real LLM-generated samples
>= 80 paraphrase/coreference samples
false pass rate on gold_violation <= 5%
false block rate on gold_pass <= 8%
all P1 regression samples hard-gated
```

Suggested gates for Semantic Beta:

```text
>= 1000 total samples
>= 500 real LLM-generated samples
>= 4 domains
false pass rate on gold_violation <= 2%
false block rate on gold_pass <= 5%
optional verifier benchmark reported separately
```

### W8. Policy And Severity Calibration

The policy layer should decide what happens after validation:

```text
pass
warning
rewrite
reject
degrade_to_template
semantic_review
```

Policy inputs:

- claim type
- evidence result
- source tier
- modality
- confidence
- strictness config

Example policy:

```text
new world event stated as certain -> reject
unsupported other-agent state -> rewrite
told fact without source marker -> warning
ambiguous pronoun with no sidecar -> rewrite or semantic_review
uncertain unsupported claim -> warning, not reject
```

Acceptance:

- Existing severity strings remain compatible.
- New internal decisions can be richer without breaking callers.
- SDK rewrite/reject behavior remains deterministic.

### W9. Streaming And SDK Integration

Current checker runs after an LLM response. v3 should support both:

- post-hoc validation
- structured generation with claim sidecar

Do not block streaming token-by-token with expensive verification. Instead:

```text
stream raw text
buffer response
validate after completion
if violation: correction message / template fallback / retry
```

Future optional mode:

```text
LLM generates JSON claims first
checker approves evidence envelope
LLM renders final prose
```

Acceptance:

- Existing `Character.chat` behavior does not break.
- Streaming path has a deterministic post-check fallback.
- No infinite retry loops.

### W10. Documentation And Public Claims

Public docs should use precise language:

```text
Structured grounding checker
Evidence-bound narrative validation
Optional semantic verifier adapter
Not a guarantee of perfect natural-language truth
```

Avoid:

```text
prevents hallucination
fully semantic
LLM cannot lie
production-grade grounding
```

Acceptance:

- README limitation is updated only when implementation and corpus support it.
- RFC states which parts are implemented, experimental, and deferred.

---

## 7. Suggested Milestones

### M1. v3 Schema And Evidence Trace

Scope:

- Claim schema v3
- v2 -> v3 adapter
- EvidenceBinder
- evidence trace in checker result behind optional field

Exit criteria:

- No behavior regression from v2.
- Evidence trace explains every pass/fail in D5 corpus.

Estimated work:

```text
4-7 focused rounds
```

### M2. Structured Sidecar Protocol

Scope:

- Optional sidecar input
- Sidecar validation
- SDK/NarrativeBuilder support
- malformed sidecar hardening

Exit criteria:

- Text-only path unchanged.
- Sidecar path catches subject/object/source mismatches.

Estimated work:

```text
5-9 focused rounds
```

### M3. Coreference And Paraphrase Alpha

Scope:

- Conservative pronoun resolver
- deterministic paraphrase/alias support
- domain alias config
- ambiguity policy

Exit criteria:

- No known P1 false pass on source agent vs participant.
- Boundary cases become explicit `ambiguous`, not accidental pass.

Estimated work:

```text
6-12 focused rounds
```

### M4. Real LLM Corpus

Scope:

- generated samples from several models
- hand-reviewed labels for high-risk cases
- corpus runner
- precision/recall report

Exit criteria:

- Semantic Alpha gates met.
- README can mention corpus-backed D5 validation.

Estimated work:

```text
8-15 focused rounds
```

### M5. Optional Semantic Verifier

Scope:

- verifier adapter interface
- no-op deterministic default
- one offline/reference verifier implementation
- benchmark and failure policy

Exit criteria:

- Optional verifier improves paraphrase/coreference recall without raising false
  pass rate beyond gate.
- No network dependency in default tests.

Estimated work:

```text
8-18 focused rounds
```

---

## 8. Implementation Order

Recommended order:

1. Do not touch SDK behavior first.
2. Implement v3 schema and evidence trace privately.
3. Route current v2 claims through v3 schema internally.
4. Add EvidenceBinder and replace ad hoc indexes gradually.
5. Add semantic corpus runner.
6. Add optional sidecar input.
7. Add conservative coreference.
8. Add optional verifier adapter.
9. Only then update README claims.

This keeps each step reversible and testable.

---

## 9. Hard Regression List

These must remain hard-gated forever:

```text
我没有在图书馆
我不在图书馆
鲍勃不在图书馆
鲍勃可能在图书馆
听说鲍勃在图书馆
鲍勃告诉我他去了图书馆
Bob is propagatedFrom but not participant
other agent public AGENT_STATE does not justify inner-state expression
told fact without attribution is warning
forbidden LOCAL fact mention is rewrite
LLM-created new event is reject
LLM-created relationship change is reject
```

For each regression, keep both:

- extractor-level test
- checker-level policy test

---

## 10. Risk Register

| Risk | Severity | Mitigation |
|---|---:|---|
| Optional verifier becomes hidden dependency | P0 | Disabled by default; no network in tests |
| Sidecar claims are trusted too much | P1 | Validate sidecar against evidence, never trust blindly |
| Coreference resolver creates false passes | P1 | Ambiguous pronouns become `ambiguous`, not pass |
| Paraphrase matching over-matches facts | P1 | Keep deterministic exact support as authority; verifier can only suggest |
| Corpus overfits hand-written examples | P1 | Add real model-generated outputs and adversarial paraphrases |
| Public docs overpromise | P2 | Keep "Structured Warning" until corpus gates pass |
| Performance regression in chat | P2 | Cache evidence indexes; keep verifier async/optional |

---

## 11. Definition Of Done

### Semantic Alpha Pass

Andy can claim:

> D5 has evidence-bound structured grounding with corpus-backed regression
> coverage. It is still not a formal guarantee of semantic truth.

Required:

- v3 claim schema in place
- evidence trace available
- D5 semantic corpus >= 300 samples
- false pass rate <= 5% on gold violations
- false block rate <= 8% on gold pass
- all hard regressions pass
- optional verifier interface designed, not necessarily enabled

### Semantic Beta Pass

Andy can claim:

> D5 supports optional semantic verification and real LLM-output evaluation
> across multiple domains.

Required:

- corpus >= 1000 samples
- >= 500 real LLM-generated samples
- >= 4 domains
- optional verifier benchmark report
- public docs updated with measured limitations

### Stable Grounding

Do not claim Stable Grounding until there is:

- third-party or external project validation
- stable sidecar protocol
- measured verifier behavior
- long-running SDK integration evidence
- documented failure handling in production-like flows

---

## 12. Notes For Future Agents

- Treat D5 as a trust feature, not a parser feature.
- Prefer evidence trace quality over regex cleverness.
- If a fix makes a test pass by weakening policy, add a false-pass regression.
- If a fix makes a violation stricter, add false-positive pass samples.
- Never use `propagatedFrom` as participation evidence.
- Never let LLM output create world facts.
- Keep public claims lower than internal ambition.

