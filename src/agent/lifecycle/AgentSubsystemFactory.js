/**
 * AgentSubsystemFactory — Create or restore Agent subsystem instances.
 *
 * Responsible for instantiating all psychology/memory/schedule subsystems,
 * either fresh from config or restored from a serialized snapshot.
 *
 * This module does NOT wire subsystems together — that is AgentWiring's job.
 */

const Personality = require('../psychology/Personality');
// Always use .native wrappers — nativeLoader handles disabled/required/optional
const EmotionVector = require('../psychology/EmotionVector.native');
const { StateMachine } = require('../psychology/StateMachine');
const PersonalMemory = require('../memory/PersonalMemory');
const Schedule = require('../schedule/Schedule');
const ProceduralMemory = require('../memory/ProceduralMemory');
const NeedsSystem = require('../psychology/NeedsSystem.native');
const EmotionRegulation = require('../psychology/EmotionRegulation');
const IntrinsicMotivation = require('../psychology/IntrinsicMotivation');
const { BehaviorField } = require('../psychology/BehaviorField');
const { AGENT_DEFAULTS } = require('./AgentDefaults');

/**
 * Build all subsystems from config (fresh creation).
 *
 * @param {Object} config - Agent config
 * @param {Object} agentId - Agent id string
 * @param {Object|null} domain
 * @param {Object|null} rng
 * @returns {Object} { personality, emotion, stateMachine, memory, proceduralMemory, needs, emotionRegulation, intrinsicMotivation, schedule, behaviorField, position, socialEnergy, health, isOnline }
 */
function createSubsystems(config, agentId, domain, rng) {
  const personalityConfig = { ...(config.personality || {}) };
  if (config.mbti && !personalityConfig.mbti) {
    personalityConfig.mbti = config.mbti;
  }

  const personality = new Personality(personalityConfig);
  const emotion = new EmotionVector(personality, null, rng);
  const stateMachine = new StateMachine(config.initialState || null, null, domain);
  const memory = new PersonalMemory(agentId, config.seedMemories || [], null, domain, rng);
  const proceduralMemory = new ProceduralMemory();
  const needs = new NeedsSystem(personality, null, domain);
  const emotionRegulation = new EmotionRegulation(personality, null, rng);
  const intrinsicMotivation = new IntrinsicMotivation(personality, null, domain, rng);
  const schedule = new Schedule(config.schedule || {}, null, rng);
  const behaviorField = new BehaviorField(personality, null, {}, domain, rng);

  const position = config.initialPosition || (domain ? domain.fallback.defaultRegion : '住处');
  const { socialEnergy, health, isOnline } = AGENT_DEFAULTS;

  // Apply initialState center if provided
  const initState = config.initialState;
  if (initState) {
    const { getDefaultDomain } = require('../../domain/DomainRegistry');
    const resolvedDomain = domain || getDefaultDomain();
    const center = resolvedDomain.stateCenters[initState];
    if (center) {
      behaviorField.B = [...center];
      behaviorField._lastLabel = initState;
      behaviorField._prevB = [...center];
    }
  }

  return {
    personality, emotion, stateMachine, memory, proceduralMemory,
    needs, emotionRegulation, intrinsicMotivation, schedule, behaviorField,
    position, socialEnergy, health, isOnline,
  };
}

/**
 * Restore all subsystems from a serialized snapshot.
 *
 * @param {Object} savedState - Serialized agent state (from toJSON)
 * @param {Object} config - Agent config (for schedule and domain)
 * @param {string} agentId - Agent id string
 * @param {Object|null} domain
 * @param {Object|null} rng
 * @returns {Object} Same shape as createSubsystems
 */
function restoreSubsystems(savedState, config, agentId, domain, rng) {
  const personality = Personality.fromJSON(savedState.personality);
  const emotion = new EmotionVector(personality, savedState.emotion, rng);
  const stateMachine = new StateMachine(null, savedState.stateMachine, domain);
  const memory = new PersonalMemory(agentId, [], savedState.memory, domain, rng);
  if (savedState.appraisalBiases) {
    memory.appraisalBiases = savedState.appraisalBiases;
  }
  const proceduralMemory = new ProceduralMemory(savedState.proceduralMemory);
  const needs = new NeedsSystem(personality, savedState.needs, domain);
  const emotionRegulation = new EmotionRegulation(personality, savedState.emotionRegulation, rng);
  const intrinsicMotivation = new IntrinsicMotivation(personality, savedState.intrinsicMotivation, domain, rng);
  const scheduleConfig = config.schedule || savedState.schedule || {};
  const schedule = new Schedule(scheduleConfig, savedState.schedule, rng);
  const behaviorField = new BehaviorField(personality, savedState.behaviorField || null, {}, domain, rng);

  const position = savedState.position;
  const socialEnergy = savedState.socialEnergy ?? AGENT_DEFAULTS.socialEnergy;
  const health = savedState.health ?? AGENT_DEFAULTS.health;
  const isOnline = savedState.isOnline ?? AGENT_DEFAULTS.isOnline;

  return {
    personality, emotion, stateMachine, memory, proceduralMemory,
    needs, emotionRegulation, intrinsicMotivation, schedule, behaviorField,
    position, socialEnergy, health, isOnline,
  };
}

module.exports = { createSubsystems, restoreSubsystems };
