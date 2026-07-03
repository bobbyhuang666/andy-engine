/**
 * PhysiologyRuntime — Health, needs-to-emotion coupling, social energy
 *
 * Extracted from Agent._updateHealth, _applyNeedsToEmotion, _updateSocialEnergy.
 * All functions take an `agent` instance as first argument.
 */

const { DIM_ACTIVITY, DIM_SOCIALITY } = require('../psychology/BehaviorLabeler');

function safeNeedValue(needs, key, fallback = 0.5) {
  return Number.isFinite(needs?.[key]) ? needs[key] : fallback;
}

function safeHours(hoursElapsed) {
  return Number.isFinite(hoursElapsed) && hoursElapsed > 0 ? hoursElapsed : 0;
}

/**
 * Needs-to-emotion coupling.
 * @param {Object} agent
 */
function applyNeedsToEmotion(agent) {
  const needs = agent.needs.needs;
  // R120-001: guard against NaN needs values (defense-in-depth;
  // NeedsSystem tick guards prevent this, but direct mutation could bypass).
  const safeNeeds = {
    hunger:     Number.isFinite(needs.hunger) ? needs.hunger : 0.5,
    energy:     Number.isFinite(needs.energy) ? needs.energy : 0.5,
    social:     Number.isFinite(needs.social) ? needs.social : 0.5,
    comfort:    Number.isFinite(needs.comfort) ? needs.comfort : 0.5,
    stimulation: Number.isFinite(needs.stimulation) ? needs.stimulation : 0.5,
  };

  // Hunger (< 0.3) → frustration + anger
  if (safeNeeds.hunger < 0.3) {
    const hungerDeficit = 0.3 - safeNeeds.hunger;
    agent.emotion.applyEffect({
      frustration: hungerDeficit * 0.10,
      anger: hungerDeficit * 0.04,
      calm: -hungerDeficit * 0.06,
      joy: -hungerDeficit * 0.04,
    });
  }

  // Fatigue (< 0.25) → sadness + frustration
  if (safeNeeds.energy < 0.25) {
    const energyDeficit = 0.25 - safeNeeds.energy;
    agent.emotion.applyEffect({
      sadness: energyDeficit * 0.10,
      frustration: energyDeficit * 0.05,
      calm: -energyDeficit * 0.06,
      joy: -energyDeficit * 0.05,
    });
  }

  // Social deficit (< 0.2) → loneliness + sadness
  if (safeNeeds.social < 0.2) {
    const socialDeficit = 0.2 - safeNeeds.social;
    agent.emotion.applyEffect({
      loneliness: socialDeficit * 0.12,
      sadness: socialDeficit * 0.05,
      joy: -socialDeficit * 0.04,
    });
  }

  // Comfort deficit (< 0.2) → nervousness + frustration
  if (safeNeeds.comfort < 0.2) {
    const comfortDeficit = 0.2 - safeNeeds.comfort;
    agent.emotion.applyEffect({
      nervousness: comfortDeficit * 0.08,
      frustration: comfortDeficit * 0.04,
      contentment: -comfortDeficit * 0.06,
    });
  }

  // Stimulation deficit (< 0.15) → boredom + frustration
  if (safeNeeds.stimulation < 0.15) {
    const stimDeficit = 0.15 - safeNeeds.stimulation;
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
  const elapsed = safeHours(hoursElapsed);
  const needs = agent.needs?.needs || {};
  const energy = safeNeedValue(needs, 'energy');
  const hunger = safeNeedValue(needs, 'hunger');
  const stress = Number.isFinite(agent.emotion?.stress) ? agent.emotion.stress : 0;
  const activity = Number.isFinite(agent.behaviorField?.B?.[DIM_ACTIVITY])
    ? agent.behaviorField.B[DIM_ACTIVITY] : 0;
  const sociality = Number.isFinite(agent.behaviorField?.B?.[DIM_SOCIALITY])
    ? agent.behaviorField.B[DIM_SOCIALITY] : 0;
  let healthDelta = 0;

  // Health decline factors
  if (energy < 0.2) {
    healthDelta -= (0.2 - energy) * 0.04 * elapsed;
  }

  if (stress > 6) {
    healthDelta -= (stress - 6) * 0.008 * elapsed;
  }

  const weather = env?.weather;
  if (weather === 'cold' || weather === 'rain') {
    const outdoorRegions = agent.domain ? (agent.domain.placeTypes.outdoor || []) : [];
    const isOutdoor = outdoorRegions.includes(agent.position);

    if (weather === 'cold') {
      if (isOutdoor) {
        healthDelta -= 0.02 * elapsed;
      } else {
        healthDelta -= 0.005 * elapsed;
      }
    }
    if (weather === 'rain' && isOutdoor) {
      healthDelta -= 0.03 * elapsed;
    }
  }

  if (hunger < 0.2) {
    healthDelta -= (0.2 - hunger) * 0.02 * elapsed;
  }

  // Health recovery factors
  if (activity < 0.15) {
    healthDelta += 0.015 * elapsed;
  }

  if (activity < 0.05 && sociality < 0.05) {
    healthDelta += 0.025 * elapsed;
  }

  if (hunger > 0.7) {
    healthDelta += 0.005 * elapsed;
  }

  if (stress < 6 && agent.health < 0.8) {
    const stressFactor = Math.max(0, (6 - stress) / 6);
    healthDelta += 0.012 * stressFactor * elapsed;
  }

  if (agent.health < 0.3) {
    const survivalFactor = (0.3 - agent.health) / 0.3;
    healthDelta += 0.015 * survivalFactor * hoursElapsed;
  }

  // Personality: neuroticism slows recovery
  const neuroticism = Number.isFinite(agent.personality?.ocean?.neuroticism)
    ? agent.personality.ocean.neuroticism : 0.5;
  const recoveryMod = 1.0 - (neuroticism * 0.3);
  if (healthDelta > 0) {
    healthDelta *= recoveryMod;
  }
  if (!Number.isFinite(healthDelta)) healthDelta = 0;

  // R37 P1 fix: Math.max(0.1, Math.min(1.0, NaN)) = NaN. If health is NaN from
  // prior corruption, this makes it permanent. Add NaN recovery, matching
  // EmotionRegulation.tick pattern (if !Number.isFinite, reset to default).
  if (!Number.isFinite(agent.health)) agent.health = 0.8;
  agent.health = Math.max(0.1, Math.min(1.0, agent.health + healthDelta));

  // Sick event generation — domain-agnostic: use activity level instead of
  // hardcoded state names to detect "already resting / on leave"
  if (agent.health < 0.35 && activity > 0.15) {
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
  const elapsed = safeHours(hoursElapsed);
  // R37 P1 fix: NaN recovery for socialEnergy, matching health fix above.
  if (!Number.isFinite(agent.socialEnergy)) agent.socialEnergy = 0.7;
  const sociality = Number.isFinite(agent.behaviorField?.B?.[DIM_SOCIALITY])
    ? agent.behaviorField.B[DIM_SOCIALITY] : 0;
  const isSocial = sociality > 0.4;

  if (isSocial) {
    const intensity = Math.min(1, sociality / 0.8);
    // R120-002: guard against NaN in behaviorParams (defense-in-depth;
    // Personality ocean guards prevent this, but direct mutation could bypass).
    const drain = Number.isFinite(agent.behaviorParams?.socialEnergyDrain)
      ? agent.behaviorParams.socialEnergyDrain : 0.5;
    agent.socialEnergy = Math.max(0,
      agent.socialEnergy - drain * elapsed * 0.1 * intensity
    );
  } else {
    const recharge = Number.isFinite(agent.behaviorParams?.socialEnergyRecharge)
      ? agent.behaviorParams.socialEnergyRecharge : 0.3;
    agent.socialEnergy = Math.min(1,
      agent.socialEnergy + recharge * elapsed * 0.05
    );
  }
  // Re-validate after arithmetic (Math.max/min don't repair NaN).
  if (!Number.isFinite(agent.socialEnergy)) agent.socialEnergy = 0.7;
}

module.exports = { applyNeedsToEmotion, updateHealth, updateSocialEnergy };
