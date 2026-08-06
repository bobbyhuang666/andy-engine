# Testing Architecture

> Documents the test directory layout, test categories, import conventions, and how to run each category.
>
> File counts are intentionally not listed here: they drift every development wave. The
> authoritative live numbers are the `npm test` output and, at release time,
> `docs/quality/aliveness-report.md`.

---

## Test Directory Layout

```
tests/
├── unit/                   — unit tests (largest suite; see subdirs below)
│   ├── config/             — config defaults and validation
│   ├── domain/             — domain registry / validation unit tests
│   ├── effects/            — effect pipeline, committer, typed deltas
│   ├── handlers/           — agent handler unit tests
│   ├── narrative/          — narrative and grounding/ unit tests
│   ├── psychology/         — emotion, behavior field, needs, personality
│   ├── runtime/            — runtime-layer unit tests
│   ├── schedule/           — schedule system
│   ├── sdk/                — SDK unit tests
│   └── *.test.js           — persistence trust, golden-seed replay, serialization, aliveness, utility, social, etc.
├── integration/            — multi-subsystem integration tests
├── store/                  — store, serialization, and world schema tests (+ world/ subdir)
├── facts/                  — fact, knowledge, canon, and writeback tests
├── e2e/                    — end-to-end aliveness-dimension tests (D1–D7) and checker-wave suites
├── runtime/                — runtime layer tests
├── affect/                 — AffectCompiler / AffectFrame integration tests
├── architecture/           — boundary rule and facade contract enforcement (source scanning)
├── audit/                  — deep-audit wave suites over engine behavior
├── domain/                 — domain semantic-profile runtime tests
├── spatial/                — region grid and spatial engine tests
├── contracts/              — JSON schemas consumed by contract tests (no test files)
├── fixtures/               — golden seeds, narrative-violation corpus (data, no test files)
└── *.test.js               — root-level: public API, domain, and phase-regression waves
```

---

## Test Categories

### 1. Public API / Compatibility Tests

Tests that verify the public import surface works correctly. These tests import from top-level compatibility paths (`index.js`, `sdk/index.js`, `domain/index.js`, etc.) and verify that old import paths still resolve.

| Test file | Purpose |
|-----------|---------|
| `compatibility.test.js` | Legacy API backward compatibility |
| `package-boundary.test.js` | Package.json exports, files whitelist, public API smoke |
| `sdk.test.js` | SDK public API surface |
| `sdk-smoke.test.js` | SDK minimal smoke |
| `sdk-custom-domain.test.js` | SDK with custom domain |
| `type-smoke.test.js` | Type surface smoke (`.d.ts` consumers) |
| `native-loader.test.js` / `native-integration.test.js` | Optional native binding loading and package exclusion |

**Import rule:** These tests MAY import from top-level public facades (`../index.js`, `../sdk/index.js`, etc.).

### 2. Domain Tests

Tests that verify domain-agnostic behavior and domain presets.

| Test file | Purpose |
|-----------|---------|
| `domain.test.js` | Domain-agnostic architecture |
| `domain-deep.test.js` | Deep domain behavior |
| `domain-contract.test.js` | Domain contract validation |
| `source-scan.test.js` | Source scan allowlist (no campus terms in core) |
| `fallback-minimal.test.js` | Minimal fallback regression |
| `domain/semantic-profile-runtime.test.js` | Domain semantic profile at runtime |

**Run with:** `npm run test:domain`

### 3. Architecture Boundary Tests

Tests that enforce architecture boundary rules. These scan file contents for import violations.

| Test file | Purpose |
|-----------|---------|
| `architecture/boundary-check.test.js` | Layer import rules, extension concepts, deterministic paths |
| `architecture/agent-facade-contract.test.js` | Agent facade contract |
| `module-guard.test.js` | Module guard manifest enforcement |

**Run with:** `npm run check:boundaries`

### 4. Store / Serialization Tests

Tests that verify serialization, persistence, world schema, and store operations.

| Test file | Purpose |
|-----------|---------|
| `store/serialization-roundtrip.test.js` | Seeded engine serialize → restore → same continuation |
| `store/store-serialization.test.js` | Serialization envelope, SaveLoad, backward compatibility |
| `store/save-load-compat.test.js` | Save/load backward compatibility |
| `store/schema-validator.test.js` | World Spec and World State schema validation |
| `store/world-state-adapter.test.js` | WorldStateAdapter serialize → adapter → deserialize loop |
| `store/world-tooling.test.js` | World Compiler and Migration Pipeline |
| `store/memory-store.test.js` / `store/simulation-store.test.js` | Concrete store implementations |
| `store/abstract-store-interfaces.test.js` | Store interface contract |
| `store/sqlite-optional.test.js` / `store/sqlite-store-branches.test.js` | SQLite optionality and branch coverage |

**Import rule:** These tests import from `src/store/` (canonical) and its `world/` tooling modules.

### 5. Fact System Tests

Tests that verify the fact, knowledge, and canon systems.

| Test file | Purpose |
|-----------|---------|
| `facts/canon-event-pipeline.test.js` | Canon event pipeline |
| `facts/fact-schema.test.js` | Fact schema validation |
| `facts/knowledge-store.test.js` | Knowledge store |
| `facts/grounded-narrative.test.js` | Grounded narrative |
| `facts/world-fact-store.test.js` / `facts/world-fact-store-simtime.test.js` | World fact store |
| `facts/world-canon.test.js` | World canon behavior |
| `facts/action-event-emission.test.js` / `facts/action-selected-canon-path.test.js` | Action → canon emission paths |
| `facts/*-writeback.test.js` | Relationship/social, location movement, minimal active writebacks |
| `facts/effect-pipeline-dryrun.test.js` | Effect pipeline dry-run mode |
| `facts/fact-emitter-event-fallback.test.js` | Deprecated emitter fallback characterization |
| `facts/performance-rebaseline.test.js` / `facts/replay-trace-audit.test.js` / `facts/shadow-trace-quality.test.js` | Trace and performance guards |
| `facts/public-api-review.test.js` | Public fact API review surface |
| `facts/observation-action-specificity.test.js` | Observation action specificity |
| `facts/worldobject-integration.test.js` | WorldObject integration |

### 6. Unit Tests

Tests that verify individual module correctness in isolation.

Located in `tests/unit/`, organized by area: `config/`, `domain/`, `effects/`, `handlers/`,
`narrative/` (incl. `grounding/`), `psychology/`, `runtime/`, `schedule/`, `sdk/`, plus
root-level suites for persistence trust, golden-seed replay, serialization, aliveness
metrics, utility scoring, memory, personality, and social behavior.

### 7. Integration Tests

Tests that verify multiple subsystems working together.

Located in `tests/integration/` — agent lifecycle, engine integration, fact system slices.

### 8. Runtime Tests

Tests that verify the runtime layer.

| Test file | Purpose |
|-----------|---------|
| `runtime/runtime.test.js` | Runtime integration |

### 9. End-to-End / Aliveness-Dimension Tests

Full-world scenarios that back the D1–D7 aliveness report dimensions.

| Test file | Purpose |
|-----------|---------|
| `e2e/alice-bob-epistemic-boundary.test.js` | D3 epistemic boundary |
| `e2e/epistemic-evidence-matrix.test.js` | D3 evidence matrix |
| `e2e/social-emergence.test.js` | D6 triadic closure / Dunbar differentiation |
| `e2e/gossip-propagation.test.js` | D6 gossip 2-hop propagation |
| `e2e/emotion-contagion-cluster.test.js` | D6 contagion convergence |
| `e2e/aliveness-metrics-smoke.test.js` | Aliveness metrics smoke |
| `e2e/cause-effect-memory-narrative.test.js` | Event → memory → narrative chain |
| `e2e/longitudinal-life-real-engine.test.js` | Long-horizon continuity |
| `e2e/third-party-knowledge-chat.test.js` / `e2e/third-party-runtime-observation.test.js` | Third-party evidence surfaces |
| `e2e/p0-position-timing.test.js` / `e2e/p1-checker-false-positives.test.js` / `e2e/checker-true-positive-guards.test.js` | Grounding-checker wave tests |

### 10. AffectCompiler Tests

| Test file | Purpose |
|-----------|---------|
| `affect/affect-frame-integration.test.js` | AffectFrame end-to-end |
| `affect/narrativeBuilder-affect-compiler.test.js` | NarrativeBuilder × AffectCompiler |
| `affect/no-raw-emotion-leak.test.js` | Raw emotion values must not leak into outputs |

### 11. Deep Audit Waves

Independent multi-pass behavior audits. Located in `tests/audit/` (`deep-audit-*.test.js`).
These read engine sources as files and assert architecture/behavior invariants across the
whole runtime.

### 12. Native Loader Tests

`native-loader.test.js` and `native-integration.test.js` verify that experimental native
acceleration is excluded from the npm package and that JS fallbacks load correctly.

### 13. Regression Tests

Tests that prevent specific regressions from reoccurring.

| Test file | Purpose |
|-----------|---------|
| `phase11-migration.test.js` | Phase 11 migration correctness |
| `phase-26-*.test.js` | Action-layer wave: RNG trace, utility selector, shadow mode, determinism |
| `phase-27-candidate-providers.test.js` | Candidate provider wave |
| `phase-28-memory-influence.test.js` | Memory influence wave |
| `phase-29-goalsystem.test.js` / `phase-30-worldobject.test.js` | GoalSystem / WorldObject waves |
| `phase-32-*.test.js` | WorldObject provider, active mode, pipeline, ReasonTrace waves |
| `phase-effect-observability.test.js` | Effect summary observability |
| `fallback-minimal.test.js` | Minimal fallback works |
| `worldview-constraints.test.js` | Worldview constraint enforcement |
| `rng-injection.test.js` | RNG injection correctness |
| `seedable-simulation.test.js` | Seeded simulation determinism |
| `contagion-cache.test.js` | Contagion cache correctness |
| `agent-runtime-containment.test.js` | Agent runtime containment boundary |

---

## Import Conventions

### Rules

1. **Public API tests** MAY import from top-level public facades:
   - `../index.js` (AndyEngine)
   - `../sdk/index.js` (Character, Andy, etc.)
   - `../domain/index.js` (DomainRegistry, validateDomain)
   - `../facts/index.js` (WorldFactStore, FactProvider, etc.)
   - `../store/index.js` (createStore, createMemoryStore, etc.)
   - `../src/config/defaults.js` (ANDY_DEFAULTS)
   - `../presets/campus/index.js`, `../presets/tavern/index.js`

2. **Internal tests** SHOULD import from `src/` canonical paths:
   - `../src/store/Serialization.js`
   - `../src/effects/EventEffectPipeline.js`
   - etc.

3. **Store tests** MAY import the public world-schema tooling modules:
   - `../../src/store/world/validator.js`
   - `../../src/store/world/WorldStateAdapter.js`
   - `../../src/store/world/compiler.js`
   - `../../src/store/world/migration.js`

4. **Behavioral tests** must not `require()` internal runtime details
   (`src/agent/runtime/`, `src/agent/lifecycle/`) — drive these through the public facade
   or SDK seam. **Source-scan and audit tests** (`tests/architecture/`, `tests/audit/`,
   `tests/agent-runtime-containment.test.js`, `tests/native-integration.test.js`) MAY read
   those files as text or resolve their paths to assert architecture invariants; that is
   their purpose.

---

## Running Tests

```bash
# All tests
npm test

# Domain tests only
npm run test:domain

# Compatibility tests only
npm run test:compat

# Architecture boundary checks
npm run check:boundaries

# Package smoke tests
npm run smoke:pack

# Release validation (test + domain + boundaries + pack)
npm run release:check

# Performance checks
npm run perf:check

# Watch mode
npm run test:watch

# Coverage
npm run test:coverage
```

---

## Adding New Tests

1. **Determine the category** — which layer does the test verify?
2. **Place in the right directory:**
   - Public API / compatibility → `tests/` root (for now, until `tests/public-api/` is created)
   - Store / serialization → `tests/store/`
   - Fact system → `tests/facts/`
   - Unit test → `tests/unit/` (use the area subdir when one exists)
   - Integration → `tests/integration/`
   - End-to-end aliveness scenario → `tests/e2e/`
   - Architecture boundary → `tests/architecture/`
   - Audit wave → `tests/audit/`
3. **Follow import conventions** — public API tests use top-level paths, internal tests use `src/`
4. **Do not import internal runtime details** — use the public facade or SDK seam
   (source-scan/audit tests are the exception; see Import Conventions rule 4)
