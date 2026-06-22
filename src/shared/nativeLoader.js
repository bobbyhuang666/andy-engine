/**
 * nativeLoader.js — Shared lazy loader for native acceleration modules.
 *
 * Modeled after the plan in docs/TEMP_NATIVE_SUPPORT_PLAN.md.
 */

const path = require('path');

const NATIVE_MODE = { DISABLED: 'disabled', REQUIRED: 'required', OPTIONAL: 'optional' };

const _warnedOptionalPaths = new Set();

function warnOnceOptional(nativePath, errorMsg) {
  if (_warnedOptionalPaths.has(nativePath)) return;
  _warnedOptionalPaths.add(nativePath);
  console.warn(
    `[andy-engine] native module load failed at ${nativePath}; falling back to JS. ${errorMsg}`
  );
}

function getNativeMode(env = process.env) {
  const value = String(env.ANDY_USE_NATIVE || '').toLowerCase();
  if (value === '1' || value === 'true') return NATIVE_MODE.REQUIRED;
  if (value === 'optional') return NATIVE_MODE.OPTIONAL;
  return NATIVE_MODE.DISABLED;
}

function resolveProjectNativePath() {
  // From src/shared/nativeLoader.js, go up 2 levels to project root/native
  return path.resolve(__dirname, '..', '..', 'native');
}

function loadNativeModule(options = {}) {
  const mode = options.mode || getNativeMode();
  const nativePath = options.nativePath || resolveProjectNativePath();

  if (mode === NATIVE_MODE.DISABLED) {
    return { available: false, native: null, mode, error: null, nativePath };
  }

  try {
    const native = require(nativePath);
    return { available: true, native, mode, error: null, nativePath };
  } catch (error) {
    if (mode === NATIVE_MODE.OPTIONAL) {
      if (!options.silent) {
        warnOnceOptional(nativePath, error.message);
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

module.exports = { getNativeMode, loadNativeModule, resolveProjectNativePath, NATIVE_MODE, _warnedOptionalPaths };
