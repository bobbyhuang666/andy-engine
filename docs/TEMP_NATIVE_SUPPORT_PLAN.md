# Temporary Native Support Plan

> Status: Temporary execution plan.  
> Scope: Formalize Andy Engine native acceleration support.  
> Not a public API contract until implementation and review pass.

## 1. Goal

Andy Engine v2 should treat the native acceleration path as a real, testable, packageable capability.

The native path must not remain in a state where it looks available but silently falls back to JavaScript when the user explicitly asks for native.

This plan is about native runtime integration quality, not Rust algorithm optimization.

## 2. Current Problems

### N1. Native wrapper path is likely wrong

Current files:

- `src/agent/psychology/EmotionVector.native.js`
- `src/agent/psychology/NeedsSystem.native.js`

They currently use a path like:

```js
require('../../native')
```

From `src/agent/psychology/`, this resolves to `src/native`, not project-root `native`.

The intended target is:

```text
project-root/native
```

The likely correct relative path is:

```js
require('../../../native')
```

Do not blindly patch this without a test or direct path verification.

### N2. npm package does not include native/

`package.json.files` currently does not include `native/`, so even if the path is fixed, the npm package may not contain the native entrypoint.

### N3. ANDY_USE_NATIVE=1 should not silently fallback

If a user explicitly sets:

```bash
ANDY_USE_NATIVE=1
```

they are requesting native mode.

If native loading fails, Andy Engine must fail loudly with a useful error.

Silent fallback is acceptable only in an explicitly optional mode.

## 3. Native Mode Semantics

Define native behavior as follows:

| Environment | Meaning | Behavior |
|---|---|---|
| unset / `0` / empty | disabled | Use JavaScript implementation. No warning. No native load attempt required. |
| `1` / `true` | required | Load native implementation. If unavailable, throw a clear error. No silent fallback. |
| `optional` | preferred | Try native. If unavailable, warn once and fallback to JavaScript. |

If the implementer wants to keep the first pass smaller, `optional` may be deferred. If deferred, do not document it as available.

## 4. Native Loader Helper

Add a shared lazy loader:

```text
src/shared/nativeLoader.js
```

Suggested public-internal functions:

```js
getNativeMode(env = process.env)
loadNativeModule(options = {})
```

Expected behavior:

```js
function getNativeMode(env = process.env) {
  const value = String(env.ANDY_USE_NATIVE || '').toLowerCase();
  if (value === '1' || value === 'true') return 'required';
  if (value === 'optional') return 'optional';
  return 'disabled';
}
```

`loadNativeModule()` requirements:

- Must be lazy. Do not require `native/` at module top level.
- Must resolve project-root `native/` from inside `src/shared/nativeLoader.js`.
- Disabled mode returns `{ available: false, native: null, mode, error: null }`.
- Required mode throws if native cannot load.
- Optional mode warns and falls back if native cannot load.
- Error message for required mode must include:
  - `native module load failed`
  - attempted native path
  - that `ANDY_USE_NATIVE=1` requires a compiled native binding
  - advice to build `native/` or unset `ANDY_USE_NATIVE`
  - original error message

Example shape:

```js
function loadNativeModule(options = {}) {
  const mode = options.mode || getNativeMode();
  const nativePath = options.nativePath || resolveProjectNativePath();

  if (mode === 'disabled') {
    return { available: false, native: null, mode, error: null, nativePath };
  }

  try {
    const native = require(nativePath);
    return { available: true, native, mode, error: null, nativePath };
  } catch (error) {
    if (mode === 'optional') {
      if (!options.silent) {
        console.warn(
          `[andy-engine] native module load failed at ${nativePath}; falling back to JS. ${error.message}`
        );
      }
      return { available: false, native: null, mode, error, nativePath };
    }

    const wrapped = new Error(
      `[andy-engine] native module load failed at ${nativePath}. ` +
      `ANDY_USE_NATIVE=1 requires a compiled native binding. ` +
      `Build native/ or unset ANDY_USE_NATIVE to use the JS implementation. ` +
      `Original error: ${error.message}`
    );
    wrapped.cause = error;
    throw wrapped;
  }
}
```

The exact implementation may differ, but the behavior must match.

## 5. Wrapper Requirements

Update:

- `src/agent/psychology/EmotionVector.native.js`
- `src/agent/psychology/NeedsSystem.native.js`

Both wrappers must use `src/shared/nativeLoader.js`.

### Disabled mode

- Export the JavaScript implementation.
- Do not attempt to load native.
- Do not warn.

### Required mode

- Load native.
- `EmotionVector.native.js` must require `EmotionVectorJs`.
- `NeedsSystem.native.js` must require `NeedsSystemJs`.
- If native loads but the expected export is missing, throw a clear error:

```text
[andy-engine] native module loaded but EmotionVectorJs export is missing
```

or:

```text
[andy-engine] native module loaded but NeedsSystemJs export is missing
```

Do not fallback in required mode.

### Optional mode

If implemented:

- Try native.
- If it fails, warn once and fallback to JavaScript.
- Add tests.

If not implemented:

- Do not mention optional mode in README.

## 6. Package Boundary Requirements

Update `package.json.files` to include:

```json
"native/"
```

But the package must not include build artifacts:

- `native/target/`
- `native/**/*.rlib`
- `native/**/*.dSYM`
- `native/**/.DS_Store`

Decide whether to include `native/Cargo.lock` and document the decision.

Recommended:

- Include `Cargo.lock` if the native package is intended to be reproducibly built by consumers.
- Exclude it only if there is a clear library-crate reason.

If necessary, use `.npmignore` or refine package file handling.

## 7. native/index.js Diagnostics

Review:

```text
native/index.js
```

Its error message must be clear enough for users.

Required information:

- native binding load failed
- platform / arch or binding name
- searched path or native directory
- what the user should do next

If it is already clear, leave it unchanged.

## 8. Smoke Pack Requirements

Update:

```text
scripts/smoke-pack.sh
```

The smoke test must check real installed package behavior, not source-relative imports.

Required smoke checks:

### S1. native directory included

Inside the temp consumer after `npm install`:

```js
const fs = require('fs');
const path = require('path');
const pkgRoot = path.dirname(require.resolve('andy-engine'));

if (!fs.existsSync(path.join(pkgRoot, 'native/index.js'))) {
  throw new Error('native/index.js missing from package');
}
```

### S2. native wrappers default to JS

Because package exports may block deep package imports, resolve from installed package root:

```js
const path = require('path');
const pkgRoot = path.dirname(require.resolve('andy-engine'));
const EmotionVector = require(path.join(pkgRoot, 'src/agent/psychology/EmotionVector.native.js'));
const NeedsSystem = require(path.join(pkgRoot, 'src/agent/psychology/NeedsSystem.native.js'));
```

With `ANDY_USE_NATIVE` unset, both must load without requiring a native binding.

### S3. required mode fails loudly if binding is missing

When there is no compiled native binding:

```js
process.env.ANDY_USE_NATIVE = '1';
```

Requiring the native wrapper should throw an error containing:

- `native module load failed`, or
- `native module loaded but ... export is missing`

If the machine actually has a compiled native binding, then the wrapper may load successfully. In that case, the smoke should accept success.

### S4. optional mode

Only add this if `ANDY_USE_NATIVE=optional` is implemented.

## 9. Unit Tests

Add:

```text
tests/native-loader.test.js
```

Required coverage:

- `getNativeMode()`
  - unset → `disabled`
  - `0` → `disabled`
  - `1` → `required`
  - `true` → `required`
  - `optional` → `optional`
- `loadNativeModule({ mode: 'disabled' })`
  - does not throw
  - does not require native
  - returns `available: false`
- `loadNativeModule({ mode: 'required', nativePath: fakeMissingPath })`
  - throws
  - message contains `native module load failed`
  - message contains `unset ANDY_USE_NATIVE`
- `loadNativeModule({ mode: 'optional', nativePath: fakeMissingPath, silent: true })`
  - does not throw
  - returns `available: false`
  - returns an error object
- successful fake module load path
  - create a temporary fake native module
  - assert `available: true`
  - cleanup after test

Add package tests:

- `package.json.files` contains `native/`
- `npm pack --dry-run` includes `native/index.js`
- `npm pack --dry-run` does not include `native/target/`

## 10. Documentation

Update README or AI_README with a short native section.

Required wording:

```text
Native acceleration is optional.

Default mode uses the JavaScript implementation.

To require native:
  ANDY_USE_NATIVE=1 node app.js

If native binding is not built, required mode throws a clear error.
Unset ANDY_USE_NATIVE to use JavaScript.
```

If optional mode is implemented:

```text
To prefer native but fallback to JavaScript:
  ANDY_USE_NATIVE=optional node app.js
```

Do not claim native is enabled by default.
Do not claim npm install provides prebuilt native binaries unless that is actually implemented.
Do not claim a specific speedup unless benchmarked in the current package.

## 11. Required Validation

Run:

```bash
npm test
npm run test:domain
npm run check:boundaries
npm run smoke:pack
npm run release:check
npm run perf:check
node scripts/legacy-removal-dry-run.js
npm pack --dry-run
git diff --check
```

Manual checks:

```bash
ANDY_USE_NATIVE=1 node -e "require('./src/agent/psychology/EmotionVector.native.js')"
```

If no binding is built, this must throw a clear error.

If optional mode is implemented:

```bash
ANDY_USE_NATIVE=optional node -e "require('./src/agent/psychology/EmotionVector.native.js')"
```

If no binding is built, this must warn and fallback successfully.

## 12. Report Format

The implementer must report:

- Changed files
- Native mode semantics
- Whether `native/` is included in npm pack
- Whether `native/target/` is excluded
- `ANDY_USE_NATIVE=1` behavior
- `ANDY_USE_NATIVE=optional` behavior, if implemented
- Tests added
- Smoke-pack result
- npm pack native files summary
- Remaining native risks

## 13. Non-Goals

Do not:

- Rewrite Rust algorithms
- Add prebuilt binaries
- Add CI matrix for all platforms
- Switch the whole engine to native by default
- Remove JavaScript implementations
- Change public AndyEngine API
- Change Stable World Envelope
- Implement StoryArc or WorldObject runtime

