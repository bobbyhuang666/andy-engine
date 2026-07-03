# npm Publish Readiness Checklist

## Pre-Publish Checks

### 1. Package Metadata

- [ ] `package.json` version is correct
- [ ] `package.json` description is accurate
- [ ] `package.json` keywords are relevant
- [ ] `package.json` license is correct (AGPL-3.0-only)
- [ ] `package.json` repository URL is correct
- [ ] `package.json` homepage is correct
- [ ] `package.json` bugs URL is correct

### 2. Package Contents

- [ ] `npm pack --dry-run` shows correct files
- [ ] No macOS metadata files (._*, .DS_Store)
- [ ] No Windows metadata files (Thumbs.db)
- [ ] No temporary files (*.tmp, *.temp, *.swp)
- [ ] No test files in package
- [ ] No development files in package
- [ ] No documentation files in package (except README.md)

### 3. Dependencies

- [ ] `npm audit --omit=dev` shows no vulnerabilities
- [ ] No unnecessary dependencies
- [ ] `better-sqlite3` is in optionalDependencies
- [ ] `express` is in devDependencies
- [ ] `ws` is removed

### 4. Exports

- [ ] All public exports are documented in PUBLIC_API_CONTRACT.md
- [ ] All public exports have type definitions
- [ ] All public exports have JSDoc documentation
- [ ] All public exports are tested

### 5. Type Definitions

- [ ] `index.d.ts` exists and is accurate
- [ ] `sdk/index.d.ts` exists and is accurate
- [ ] All public APIs have type definitions
- [ ] No TypeScript errors in type definitions

### 6. Tests

- [ ] `npm test` passes
- [ ] `npm run typecheck` passes
- [ ] `npm run test:domain` passes
- [ ] `npm run check:boundaries` passes
- [ ] `npm run smoke:pack` passes
- [ ] `npm run fresh:consumer` passes
- [ ] `npm run release:gate` passes

### 7. Documentation

- [ ] README.md is accurate
- [ ] README.md installation instructions work
- [ ] README.md quick start works
- [ ] All public APIs are documented
- [ ] License is clear

### 8. Security

- [ ] No secrets in code
- [ ] No API keys in code
- [ ] No hardcoded credentials
- [ ] No sensitive data in code

### 9. Performance

- [ ] `npm run perf:check` passes
- [ ] No performance regressions
- [ ] Bundle size is reasonable

### 10. Compatibility

- [ ] Published package baseline is Node.js 20+
- [ ] SQLite optional persistence is Node.js 20+ because `better-sqlite3` 12.x does not support Node.js 18
- [ ] Works on Node.js 20+
- [ ] Works on Node.js 22+
- [ ] Works on Ubuntu
- [ ] Works on macOS
- [ ] Works on Windows

## Publish Commands

### Alpha Publish

```bash
npm publish --tag alpha
```

### Next Publish

```bash
npm publish --tag next
```

### Latest Publish

```bash
npm publish --tag latest
```

## Post-Publish Checks

### 1. Verify Package

- [ ] Package is available on npm
- [ ] Package version is correct
- [ ] Package contents are correct
- [ ] Package dependencies are correct

### 2. Verify Installation

- [ ] `npm install andy-engine` works
- [ ] `require('andy-engine')` works
- [ ] `require('andy-engine/sdk')` works
- [ ] `require('andy-engine/store')` works

### 3. Verify Documentation

- [ ] README.md is displayed correctly
- [ ] Installation instructions work
- [ ] Quick start works
- [ ] All links work

## Current Status

**Status**: 🔒 FROZEN — publish/tag/release is not an active goal and requires explicit user approval to reopen.

Current ledger status: R68 no-quota local and agnes verification completed on 2026-07-03.
Core gates exited 0 (`npm test`, `test:domain`, boundaries, smoke pack, replay diff,
typecheck, consumer typecheck, fresh consumer matrix, SQLite smoke, `git diff --check`).
`perf:check` exited 0 in default 3-run median mode with no WARN.
Secondary public subpath TypeScript declarations are now covered by fresh
tarball consumer checks. The published package baseline is now Node.js 20+.
Long-run fact retention has been rechecked; full `npm test` is currently
3197 passed / 28 skipped. The package whitelist now publishes `agent/Agent.js`
without the retired `agent/action/*` implementation files; dry-run tarball size
is 198 files. Legacy phase tests have been migrated to canonical `src/action`,
and the repo-local `agent/action` implementation files have been removed.
Deep-audit ScheduleHandler direct writes now route through typed deltas and
`EffectCommitter` with regression coverage. Deep-audit PerceptionRuntime
experience-memory writes now route through `MemoryDelta` / `EffectCommitter`
with appraisal importance preserved. Perception emotion, stress, and
appraisal-bias effects now route through typed deltas / `EffectCommitter`.
The runtime `env._world` backdoor has been removed from `src/agent` and
`src/runtime`; explicit `effectCommitter` / `effectWorld` services are now used
and guarded by `check:boundaries`.

**Version**: 2.0.1

**Recommendation**: Do not publish now. Continue polish-first hardening until the
active scope has no confirmed P0/P1 bugs, architecture boundary leaks are closed
or consciously deferred, and the user explicitly reopens publish/tag/release
planning.

**Notes**:
- No macOS metadata
- No vulnerabilities in production dependencies
- All tests pass
- All public APIs documented
- Type definitions complete
