/**
 * Stable, lossless identifier for an OBSERVATION fact used by the grounding
 * checker and by Host-generated safe replies. It is deliberately not a public
 * fact ID: callers can only construct it from an observation they are already
 * allowed to express.
 */
function observationAssertion(targetId, action, context = '') {
  return JSON.stringify([String(targetId || ''), String(action || ''), String(context || '')]);
}

module.exports = { observationAssertion };
