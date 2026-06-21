# Testing Architecture

> Documents the test directory layout, test categories, import conventions, and how to run each category.

---

## Test Directory Layout

```
tests/
├── architecture/           — boundary rule enforcement
│   └── boundary-check.test.js
├── facts/                  — fact system tests (17 files)
├── integration/            — integration tests
│   ├── agent.test.js
│   ├── engine.test.js
│   └── fact-system-slice.test.js
├── runtime/                — runtime tests
│   └── runtime.test.js
├── store/                  — store, serialization, and world schema tests
│   ├── serialization-roundtrip.test.js
│   ├── schema-validator.test.js
│   ├── store-serialization.test.js
│   ├── world-state-adapter.test.js
│   └── world-tooling.test.js
├── unit/                   — unit tests (27 files)
│   └── handlers/           — handler unit tests
├── action-layer.test.js    — action layer integration
├── agent-runtime-containment.test.js — runtime containment
├── behavior-field.test.js  — behavior field dynamics
├── compatibility.test.js   — public API backward compatibility
├── contagion-cache.test.js — contagion cache
├── domain.test.js          — domain-agnostic architecture
├── domain-deep.test.js     — deep domain tests
├── domain-contract.test.js — domain contract validation
├── fallback-minimal.test.js — minimal fallback regression
├── package-boundary.test.js — package.json boundary audit
├── phase11-migration.test.js — phase 11 migration regression
├── rng-injection.test.js   — RNG injection tests
├── sdk.test.js             — SDK public API tests
├── sdk-custom-domain.test.js — SDK custom domain tests
├── seedable-simulation.test.js — seeded simulation determinism
├── source-scan.test.js     — source scan allowlist
├── spatial.test.js         — spatial system tests
└── worldview-constraints.test.js — worldview constraints
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
| `sdk-custom-domain.test.js` | SDK with custom domain |

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

**Run with:** `npm run test:domain`

### 3. Architecture Boundary Tests

Tests that enforce architecture boundary rules. These scan file contents for import violations.

| Test file | Purpose |
|-----------|---------|
| `architecture/boundary-check.test.js` | Layer import rules, extension concepts, deterministic paths |

**Run with:** `npm run check:boundaries`

### 4. Store / Serialization Tests

Tests that verify serialization, persistence, world schema, and store operations.

| Test file | Purpose |
|-----------|---------|
| `store/serialization-roundtrip.test.js` | Seeded engine serialize → restore → same continuation |
| `store/store-serialization.test.js` | Serialization envelope, SaveLoad, backward compatibility |
| `store/schema-validator.test.js` | World Spec and World State schema validation |
| `store/world-state-adapter.test.js` | WorldStateAdapter serialize → adapter → deserialize loop |
| `store/world-tooling.test.js` | World Compiler and Migration Pipeline |

**Import rule:** These tests import from `src/store/` (canonical) and `world/` (compatibility adapter).

### 5. Fact System Tests

Tests that verify the fact, knowledge, and canon systems.

| Test file | Purpose |
|-----------|---------|
| `facts/canon-event-pipeline.test.js` | Canon event pipeline |
| `facts/fact-schema.test.js` | Fact schema validation |
| `facts/knowledge-store.test.js` | Knowledge store |
| `facts/grounded-narrative.test.js` | Grounded narrative |
| `facts/world-fact-store.test.js` | World fact store |
| ... and 12 more | Various fact system aspects |

### 6. Unit Tests

Tests that verify individual module correctness in isolation.

Located in `tests/unit/` — 27 test files covering action candidates, emotion, memory, personality, social, utility scoring, etc.

### 7. Integration Tests

Tests that verify multiple subsystems working together.

Located in `tests/integration/` — agent lifecycle, engine integration, fact system slices.

### 8. Runtime Tests

Tests that verify the runtime layer.

Located in `tests/runtime/` — runtime integration tests.

### 9. Regression Tests

Tests that prevent specific regressions from reoccurring.

| Test file | Purpose |
|-----------|---------|
| `phase11-migration.test.js` | Phase 11 migration correctness |
| `fallback-minimal.test.js` | Minimal fallback works |
| `worldview-constraints.test.js` | Worldview constraint enforcement |
| `rng-injection.test.js` | RNG injection correctness |
| `seedable-simulation.test.js` | Seeded simulation determinism |
| `contagion-cache.test.js` | Contagion cache correctness |

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
   - `../src/store/SQLiteStore.js`
   - `../src/effects/EventEffectPipeline.js`
   - etc.

3. **Store tests** MAY import from `world/` compatibility adapters (these are public schema tools):
   - `../../src/store/world/validator.js`
   - `../../src/store/world/WorldStateAdapter.js`
   - `../../src/store/world/compiler.js`
   - `../../src/store/world/migration.js`

4. **No test** should import from `src/agent/runtime/` or `src/agent/lifecycle/` — these are internal implementation details.

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
   - Unit test → `tests/unit/`
   - Integration → `tests/integration/`
   - Architecture boundary → `tests/architecture/`
3. **Follow import conventions** — public API tests use top-level paths, internal tests use `src/`
4. **Do not import internal runtime details** — use the public facade or SDK seam
