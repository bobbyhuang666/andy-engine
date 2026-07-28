# W3-H Evaluation Status Overview

This document provides an aggregate-status overview of W3-H evaluation epochs, their support scopes, and architectural guidance on evidence binding. All information is based solely on publicly disclosed aggregate metrics; no raw model outputs, private paths, endpoint URLs, API credentials, scenario IDs, or per-sample content are included.

## Evaluation Epoch Status

| Epoch | Status | What it supports | What it does NOT support |
|-------|--------|-----------------|--------------------------|
| v3 | Invalidated | — | Cap exceeded; reviewer schema violations rendered D5 invalid |
| v4-R2 | Invalidated | — | Prompts lacked real grounding content; no valid substantive evaluation |
| v5 | Invalidated (FROZEN_CONSTRUCT_INVALID_FOR_D5) | — | Reviewer construct error used surface-string heuristics producing false positives and false negatives; D5 is not computable |
| v6 | Valid, closed-world structured benchmark | Closed-set grounding-contract pass rate under v7 structured assertion reviewer | Open-world faithfulness; cross-epoch merge; model ranking; "solved hallucination" conclusions |
| v6.1 | Valid, high-difficulty challenge benchmark | Adversarial-category diagnostics under v8 reviewer | Absolute-score comparison with v6 (compound effect); open-world claims; merging scores across epochs |
| v6.2 | Valid, dual-metric decoupling | Independent measurement of semantic faithfulness (D5) and model-side citation-protocol compliance (C1) under v9 reviewer | Merging D5 and C1 into a composite; equating C1 failure with Engine grounding defect or semantic hallucination |

## Host Evidence Binding (Recommended Product Path)

Andy Engine does **not** require language models to emit internal fact IDs in their narratives. The recommended approach for obtaining citations is as follows:

- **Host responsibility:** After generating a narrative, the Host calls the public `checkConsistency()` API.
- **Evidence trace consumption:** The API returns an `evidenceTrace`, which is a deterministic, read-only diagnostic projection that binds each checked claim to its support status and, when supported, to a `factId`. This trace does not create facts, modify knowledge, or repair unsupported claims.
- **Model-provided citations:** A model-provided citation field, if the Host chooses to request one, is an **optional** Host-level compliance signal. It must be reported separately from the semantic grounding evaluation derived from `evidenceTrace`.
- **Key distinction:** An unknown or misattributed model-provided groundingId is a **citation-protocol mismatch**, never a semantic hallucination. Semantic faithfulness is evaluated independently via D5 using the Engine's evidence-binding machinery.

## Cross-EPOCH Rules

The three valid benchmarks—v6, v6.1, and v6.2—share fundamental constraints that apply to all public reporting:

1. **No cross-epoch aggregation:** These benchmarks differ in scope, scenario set, reviewer version, and difficulty. They **cannot** be merged into a single global D5 metric.
2. **No model ranking:** No report may present rankings of models based on these evaluations.
3. **No "solved hallucination" conclusion:** No report may imply that the models have solved the general hallucination problem; results are bounded by each benchmark's specific scenario set, reviewer capabilities, and difficulty level.
4. **Scope-bounded interpretation:** Each epoch's findings are limited to its defined scenario matrix and reviewer contract. Results do not generalize to open-world settings beyond those bounds.

*Report generated automatically from evaluation artifacts. For full raw data and audit trails, consult the private evaluation directory tree restricted to authorized reviewer contracts.*
