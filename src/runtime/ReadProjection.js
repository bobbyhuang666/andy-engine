function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const nested of Object.values(value)) deepFreeze(nested);
  return value;
}

function immutableProjection(value) {
  if (typeof globalThis.structuredClone !== 'function') {
    throw new Error('immutable read projections require structuredClone');
  }
  return deepFreeze(globalThis.structuredClone(value));
}

module.exports = { immutableProjection };
