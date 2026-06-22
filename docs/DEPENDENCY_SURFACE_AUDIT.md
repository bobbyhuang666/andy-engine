# Dependency Surface Audit

> Audit date: 2026-06-22
> Scope: `dependencies` in package.json

---

## Summary

| Dependency | Current | Used in `src/`? | Used in `demo/`? | Used elsewhere? | Applied |
|---|---|---|---|---|---|
| better-sqlite3 | optionalDependencies | Yes (src/store/SQLiteStore.js) | No | No | **Moved to optionalDependencies** |
| express | devDependencies | No | Yes (demo/character-lab/server.js) | No | **Moved to devDependencies** |
| ws | removed | No | No | No | **Removed entirely** |

---

## Detailed Analysis

### better-sqlite3

**Import locations:**
- `src/store/SQLiteStore.js:22` — `Database = require('better-sqlite3')`

**Usage pattern:**
- Wrapped in try/catch; falls back to `null` if not installed
- `SQLiteStore` constructor throws if `Database` is null (graceful degradation with clear error message)
- `SQLiteStore` constructor also normalizes broken native binding errors thrown by `new Database(dbPath)`
- `SimulationStore` internally creates `SQLiteStore` instances
- `createMemoryStore()` uses `SQLiteStore(':memory:')` — requires better-sqlite3

**Smoke test dependency:**
- `smoke:pack` verifies the `andy-engine/store` facade loads without requiring SQLite
- `smoke:pack` simulates missing `better-sqlite3` and verifies `SQLiteStore` throws a clear optional-dependency error
- `sqlite:smoke` separately verifies the SQLite runtime path when `better-sqlite3` is available

**Classification options:**

| Option | Pros | Cons |
|---|---|---|
| Keep as dependencies | Smoke tests pass; store works out of box | Adds native build requirement to all installs |
| Move to optionalDependencies | npm install succeeds even without native build; clear error on store use | SQLite runtime tests must be separated from default smoke |

**Applied decision:** **Moved to `optionalDependencies`**. The store layer is a core feature but requires native compilation. Moving to optionalDependencies means `npm install` succeeds even without native build tools. The `require('andy-engine/store')` facade loads without error; only constructing a `SQLiteStore` throws a clear error if better-sqlite3 is missing or its native binding is broken. A `sqlite:smoke` npm script verifies SQLite functionality when the dependency is installed.

---

### express

**Import locations:**
- `demo/character-lab/server.js:5` — `const express = require('express')`

**Package inclusion:**
- `demo/` is NOT in the `files` array in package.json
- The `demo` npm script runs `cd demo/character-lab && npm install && node server.js` — it installs its own deps

**Impact of moving to devDependencies:**
- No impact on published package (demo/ not included)
- No impact on any `src/` code
- No impact on smoke:pack test

**Recommendation:** **Move to `devDependencies`**. Express is only used by the demo app, which has its own `npm install`. It should never be a runtime dependency of the engine.

---

### ws (WebSocket)

**Import locations:**
- **None.** Zero imports found across the entire codebase.

**Search results:**
- `require('ws')` — 0 matches
- `WebSocket` — 0 matches (except behavioral dimension naming)
- `from 'ws'` — 0 matches

**Impact of removal:**
- No code references this package
- No tests depend on it
- No smoke tests depend on it

**Recommendation:** **Remove from `dependencies`**. This is dead weight. If WebSocket support is planned for a future feature, it should be added when actually needed.

---

## Proposed package.json changes

```jsonc
{
  "optionalDependencies": {
    "better-sqlite3": "^12.10.0"  // moved from dependencies
    // express: removed
    // ws: removed
  },
  "devDependencies": {
    "@vitest/coverage-v8": "^4.1.7",
    "express": "^5.2.1",          // moved from dependencies
    "typescript": "^5.8.3",       // new: for typecheck
    "vitest": "^4.1.7"
  }
}
```

## Risk Assessment

| Change | Risk | Mitigation |
|---|---|---|
| Move express to devDependencies | None | demo/ not in package files; demo script does own npm install |
| Remove ws | None | Zero imports; zero tests; zero runtime usage |
| Move better-sqlite3 to optionalDependencies | Low | Store facade loads without error; SQLiteStore constructor throws clear message; sqlite:smoke validates |

## Action Items

- [x] Move `express` from dependencies to devDependencies
- [x] Remove `ws` from dependencies
- [x] Move `better-sqlite3` to optionalDependencies
- [x] Run full validation: `npm test && npm run test:domain && npm run check:boundaries && npm run smoke:pack`

---

## npm Audit Findings (beta.4)

| Package | Severity | Advisory | Dev only? | In packed runtime? | Fix strategy | Behavior change? |
|---|---|---|---|---|---|---|
| vite 8.0.0–8.0.15 | high | [GHSA-v6wh-96g9-6wx3](https://github.com/advisories/GHSA-v6wh-96g9-6wx3) — launch-editor NTLMv2 hash disclosure via UNC path (Windows only) | Yes (transitive via vitest) | **No** — vite is not in `files` array and not in `dependencies` | Wait for vitest update or add `overrides` | No |
| vite 8.0.0–8.0.15 | high | [GHSA-fx2h-pf6j-xcff](https://github.com/advisories/GHSA-fx2h-pf6j-xcff) — `server.fs.deny` bypass on Windows alternate paths | Yes (transitive via vitest) | **No** | Wait for vitest update or add `overrides` | No |

**Analysis:** Both advisories are **Windows-only** and affect the **dev server only**. Vite is a transitive dependency of `vitest@4.1.7`, not a direct dependency. It is not included in the packed `files` array (`npm pack --dry-run` confirms zero vite artifacts). No production runtime exposure.

**Resolution:** Vite is a **transitive** dependency of `vitest@4.1.7` (not a direct devDependency). Fix options:
1. Wait for vitest to ship with a patched vite version.
2. Add `"overrides": { "vite": "^8.0.16" }` to package.json to force a patched version.

Neither option affects published or packed artifacts.
