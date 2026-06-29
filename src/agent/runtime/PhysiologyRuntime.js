/**
 * PhysiologyRuntime — Health, needs-to-emotion coupling, social energy
 *
 * Extracted from Agent._updateHealth, _applyNeedsToEmotion, _updateSocialEnergy.
 * All functions take an `agent` instance as first argument.
 */

const { DIM_ACTIVITY, DIM_SOCIALITY } = require('../psychology/BehaviorLabeler');

/**
 * Needs-to-emotion coupling.
 * @param {Object} agent
 */
function applyNeedsToEmotion(agent) {
  const needs = agent.needs.needs;

  // Hunger (< 0.3) → frustration + anger
  if (needs.hunger < 0.3) {
    const hungerDeficit = 0.3 - needs.hunger;
    agent.emotion.applyEffect({
      frustration: hungerDeficit * 0.10,
      anger: hungerDeficit * 0.04,
      calm: -hungerDeficit * 0.06,
      joy: -hungerDeficit * 0.04,
    });
  }

  // Fatigue (< 0.25) → sadness + frustration
  if (needs.energy < 0.25) {
    const energyDeficit = 0.25 - needs.energy;
    agent.emotion.applyEffect({
      sadness: energyDeficit * 0.10,
      frustration: energyDeficit * 0.05,
      calm: -energyDeficit * 0.06,
      joy: -energyDeficit * 0.05,
    });
  }

  // Social deficit (< 0.2) → loneliness + sadness
  if (needs.social < 0.2) {
    const socialDeficit = 0.2 - needs.social;
    agent.emotion.applyEffect({
      loneliness: socialDeficit * 0.12,
      sadness: socialDeficit * 0.05,
      joy: -socialDeficit * 0.04,
    });
  }

  // Comfort deficit (< 0.2) → nervousness + frustration
  if (needs.comfort < 0.2) {
    const comfortDeficit = 0.2 - needs.comfort;
    agent.emotion.applyEffect({
      nervousness: comfortDeficit * 0.08,
      frustration: comfortDeficit * 0.04,
      contentment: -comfortDeficit * 0.06,
    });
  }

  // Stimulation deficit (< 0.15) → boredom + frustration
  if (needs.stimulation < 0.15) {
    const stimDeficit = 0.15 - needs.stimulation;
    agent.emotion.applyEffect({
      boredom: stimDeficit * 0.12,
      frustration: stimDeficit * 0.04,
      joy: -stimDeficit * 0.03,
    });
  }
}

/**
 * Health system update.
 * @param {Object} agent
 * @param {number} hoursElapsed
 * @param {Object} env
 */
function updateHealth(agent, hoursElapsed, env) {
  let healthDelta = 0;

  // Health decline factors
  if (agent.needs.needs.energy < 0.2) {
    healthDelta -= (0.2 - agent.needs.needs.energy) * 0.04 * hoursElapsed;
  }

  if (agent.emotion.stress > 6) {
    healthDelta -= (agent.emotion.stress - 6) * 0.008 * hoursElapsed;
  }

  if (env.weather === 'cold' || env.weather === 'rain') {
    const outdoorRegions = agent.domain ? (agent.domain.placeTypes.outdoor || []) : [];
    const isOutdoor = outdoorRegions.includes(agent.position);

    if (env.weather === 'cold') {
      if (isOutdoor) {
        healthDelta -= 0.02 * hoursElapsed;
      } else {
        healthDelta -= 0.005 * hoursElapsed;
      }
    }
    if (env.weather === 'rain' && isOutdoor) {
      healthDelta -= 0.03 * hoursElapsed;
    }
  }

  if (agent.needs.needs.hunger < 0.2) {
    healthDelta -= (0.2 - agent.needs.needs.hunger) * 0.02 * hoursElapsed;
  }

  // Health recovery factors
  const activity = agent.behaviorField.B[DIM_ACTIVITY];
  if (activity < 0.15) {
    healthDelta += 0.015 * hoursElapsed;
  }

  if (activity < 0.05 && agent.behaviorField.B[DIM_SOCIALITY] < 0.05) {
    healthDelta += 0.025 * hoursElapsed;
  }

  if (agent.needs.needs.hunger > 0.7) {
    healthDelta += 0.005 * hoursElapsed;
  }

  if (agent.emotion.stress < 6 && agent.health < 0.8) {
    const stressFactor = Math.max(0, (6 - agent.emotion.stress) / 6);
    healthDelta += 0.012 * stressFactor * hoursElapsed;
  }

  if (agent.health < 0.3) {
    const survivalFactor = (0.3 - agent.health) / 0.3;
    healthDelta += 0.015 * survivalFactor * hoursElapsed;
  }

  // Personality: neuroticism slows recovery
  const recoveryMod = 1.0 - (agent.personality.ocean.neuroticism * 0.3);
  if (healthDelta > 0) {
    healthDelta *= recoveryMod;
  }

  // R37 P1 fix: Math.max(0.1, Math.min(1.0, NaN)) = NaN. If health is NaN from
  // prior corruption, this makes it permanent. Add NaN recovery, matching
  // EmotionRegulation.tick pattern (if !Number.isFinite, reset to default).
  if (!Number.isFinite(agent.health)) agent.health = 0.8;
  agent.health = Math.max(0.1, Math.min(1.0, agent.health + healthDelta));

  // Sick event generation — domain-agnostic: use activity level instead of
  // hardcoded state names to detect "already resting / on leave"
  const sickActivity = agent.behaviorField.B[DIM_ACTIVITY];
  if (agent.health < 0.35 && sickActivity > 0.15) {
    agent.emotion.applyEffect({
      frustration: 0.02,
      calm: -0.03,
    });
  }
}

/**
 * Social energy update.
 * @param {Object} agent
 * @param {number} hoursElapsed
 */
function updateSocialEnergy(agent, hoursElapsed) {
  // R37 P1 fix: NaN recovery for socialEnergy, matching health fix above.
  if (!Number.isFinite(agent.socialEnergy)) agent.socialEnergy = 0.7;
  const sociality = agent.behaviorField.B[DIM_SOCIALITY];
  const isSocial = sociality > 0.4;

  if (isSocial) {
    const intensity = Math.min(1, sociality / 0.8);
    agent.socialEnergy = Math.max(0,
      agent.socialEnergy - agent.behaviorParams.socialEnergyDrain * hoursElapsed * 0.1 * intensity
    );
  } else {
    agent.socialEnergy = Math.min(1,
      agent.socialEnergy + agent.behaviorParams.socialEnergyRecharge * hoursElapsed * 0.05
    );
  }
}

module.exports = { applyNeedsToEmotion, updateHealth, updateSocialEnergy };
