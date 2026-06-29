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

- [ ] Works on Node.js 18+
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

**Status**: 🔒 FROZEN — Not ready for publish. R18/R19 found critical bugs; convergence not yet achieved.

**Version**: 2.0.1

**Recommendation**: Do not publish until independent audit confirms zero P1 bugs.

**Notes**:
- No macOS metadata
- No vulnerabilities in production dependencies
- All tests pass
- All public APIs documented
- Type definitions complete
