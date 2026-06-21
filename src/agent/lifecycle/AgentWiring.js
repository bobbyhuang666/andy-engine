/**
 * AgentWiring — Wire subsystems together after creation/restore.
 *
 * Handles cross-subsystem connections that must happen after
 * all subsystem instances exist:
 *   - BehaviorField → StateMachine currentState getter
 *   - LocationMeaningInfluence → BehaviorField
 *   - FutureTendencyTracker → BehaviorField
 */

const LocationMeaningInfluence = require('../psychology/LocationMeaningInfluence');
const FutureTendencyTracker = require('../psychology/FutureTendencyTracker');

/**
 * Wire BehaviorField label as StateMachine.currentState getter.
 *
 * All downstream code reading `stateMachine.currentState` automatically
 * gets the continuous BehaviorField label.
 *
 * @param {Object} stateMachine
 * @param {Object} behaviorField
 */
function wireBehaviorFieldToStateMachine(stateMachine, behaviorField) {
  const bf = behaviorField;
  Object.defineProperty(stateMachine, 'currentState', {
    get() { return bf.label; },
    set() { /* ignore writes: currentState driven by BehaviorField */ },
    configurable: true,
    enumerable: true,
  });
}

/**
 * Set up location meaning influence on BehaviorField.
 *
 * @param {Object} behaviorField
 * @param {Object|null} factStore
 * @param {Object|null} domain
 * @param {string} position
 */
function setupLocationMeaningInfluence(behaviorField, factStore, domain, position) {
  if (factStore) {
    const influence = new LocationMeaningInfluence(factStore, domain);
    behaviorField.setLocationMeaningInfluence(influence);
    behaviorField.setCurrentRegion(position);
  }
}

/**
 * Set up future tendency tracker on BehaviorField.
 *
 * @param {Object} behaviorField
 * @returns {Object} The FutureTendencyTracker instance
 */
function setupFutureTendency(behaviorField) {
  const futureTendency = new FutureTendencyTracker();
  behaviorField.setFutureTendency(futureTendency);
  return futureTendency;
}

/**
 * Run all wiring steps.
 *
 * @param {Object} subs - Subsystems object from factory
 * @param {Object} config - Agent config (for factStore)
 * @param {Object|null} domain
 */
function wireAll(subs, config, domain) {
  wireBehaviorFieldToStateMachine(subs.stateMachine, subs.behaviorField);
  setupLocationMeaningInfluence(subs.behaviorField, config.factStore, domain, subs.position);
  const futureTendency = setupFutureTendency(subs.behaviorField);
  return { futureTendency };
}

module.exports = {
  wireBehaviorFieldToStateMachine,
  setupLocationMeaningInfluence,
  setupFutureTendency,
  wireAll,
};
