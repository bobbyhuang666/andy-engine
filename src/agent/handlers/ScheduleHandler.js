/**
 * ScheduleHandler - 日程驱动位置变化
 *
 * Contains schedule-related logic extracted from Agent:
 *   - checkSchedule (with skip/sick/social avoidance logic)
 *   - getSkipAlternative / getSkipRegion / generateSkipMemory
 *   - findNeedRegion
 *
 * Also orchestrates needs-driven and IM-driven position changes in tick().
 */
const { STATE_CENTERS } = require('../psychology/BehaviorLabeler');

class ScheduleHandler {
  constructor(agent) {
    this.agent = agent;
  }

  /**
   * R7 fix: Validate that a region exists in the domain before moving agent.
   * Prevents phantom regions from being auto-created in RegionGrid and
   * keeps simulation spatial state consistent with domain configuration.
   * R8 fix: return false when domain is unavailable (consistent with
   * ActionSelectionRuntime which also returns false in this case).
   * @param {Object} agent
   * @param {string} targetRegion
   * @returns {boolean} true if region is valid
   * @private
   */
  static _isValidRegion(agent, targetRegion) {
    if (!agent.domain || typeof agent.domain.hasRegion !== 'function') return false;
    return agent.domain.hasRegion(targetRegion);
  }

  /**
   * Execute schedule check and position decisions.
   * @param {Object} context - tick context
   */
  tick(context) {
    const { env, needsDrive, imResult, result } = context;
    const agent = this.agent;

    const scheduleResult = ScheduleHandler.checkSchedule(agent, env.hour, env.dayOfWeek, env.simDate);

    if (scheduleResult.moved) {
      // R7 fix: validate region before moving agent
      if (ScheduleHandler._isValidRegion(agent, scheduleResult.region)) {
        result.regionChanged = true;
        agent.position = scheduleResult.region;
      }

      if (scheduleResult.skipEvent) {
        if (scheduleResult.altState) {
          const targetCenter = STATE_CENTERS[scheduleResult.altState];
          if (targetCenter) {
            const prevLabel = agent.behaviorField.label;
            // R13 C2 fix: use setAttractor instead of directly setting B/velocity.
            // Direct B/velocity mutation bypasses Langevin dynamics, causing
            // inertia loss and gradient discontinuity. setAttractor adds a
            // temporary potential well that steers B toward the target smoothly.
            agent.behaviorField.setAttractor(targetCenter, 10.0, 5);
            if (prevLabel !== scheduleResult.altState) {
              result.stateChanged = true;
              result.newEvents.push({
                type: 'state_change',
                from: prevLabel,
                to: scheduleResult.altState,
                time: env.simTime?.toISOString(),
              });
              agent.stateMachine.stateEnteredAt = env.simTime || new Date();
              agent.stateMachine.history.push({
                from: prevLabel,
                to: scheduleResult.altState,
                at: (env.simTime || new Date()).toISOString(),
              });
            }
          }
        }

        const skipMemory = ScheduleHandler.generateSkipMemory(agent, scheduleResult.skipEvent, env);
        if (skipMemory) {
          agent.memory.addExperience(skipMemory, agent.emotion);
          result.newEvents.push(skipMemory);
        }
      }
    } else if (needsDrive && needsDrive.urgency > 0.05) {
      const needRegion = ScheduleHandler.findNeedRegion(agent, needsDrive.need);
      // R7 fix: validate region before moving agent
      if (needRegion && needRegion !== agent.position && ScheduleHandler._isValidRegion(agent, needRegion)) {
        result.regionChanged = true;
        agent.position = needRegion;
      }
    } else if (imResult.drive && imResult.drive.urgency > 0.1) {
      const timeRules = agent.domain ? agent.domain.timeRules : null;
      const lateNight = timeRules?.periods?.lateNight;
      const nightStart = lateNight?.start ?? 22;
      const nightEnd = lateNight?.end ?? 6;
      const isNight = nightStart > nightEnd
        ? (env.hour >= nightStart || env.hour < nightEnd)
        : (env.hour >= nightStart && env.hour < nightEnd);
      const currentState = agent.stateMachine.currentState;
      const stateDef = agent.domain ? agent.domain.states[currentState] : null;
      const isSleeping = stateDef
        ? stateDef.category === 'sleep'
        : false;

      if (!isNight && !isSleeping) {
        const explorationRegions = imResult.drive.targetRegions;
        if (explorationRegions && explorationRegions.length > 0) {
          const target = explorationRegions[0];
          // R7 fix: validate region before moving agent
          if (target !== agent.position && ScheduleHandler._isValidRegion(agent, target)) {
            result.regionChanged = true;
            agent.position = target;
          }
        }
      }
    }
  }

  // ═══════════════════════════════════════════
  // Schedule methods (extracted from Agent)
  // ═══════════════════════════════════════════

  /**
   * Check schedule and decide whether to move.
   * @param {Object} agent
   * @param {number} hour
   * @param {number} dayOfWeek
   * @param {Object} simDate
   * @returns {Object}
   */
  static checkSchedule(agent, hour, dayOfWeek, simDate) {
    const activity = agent.schedule.getCurrentActivity(hour, dayOfWeek, simDate);

    if (activity.inSchedule && activity.region && activity.region !== agent.position) {
      const valence = agent.emotion.getValence();

      // 1. Sick → take leave
      if (agent.health < 0.4) {
        const sickProb = (0.4 - agent.health) * 2 * (1 - agent.personality.ocean.conscientiousness * 0.3);
        if (agent.rand() < Math.min(0.8, sickProb)) {
          const altState = ScheduleHandler.getSkipAlternative(agent, 'sick', hour);
          return { moved: true, region: agent.position, skipEvent: 'sick', altState };
        }
      }

      // 2. High distress → skip work/class
      const sadness = agent.emotion.current.sadness || 0;
      const frustration = agent.emotion.current.frustration || 0;
      const nervousness = agent.emotion.current.nervousness || 0;
      const negativeIntensity = (sadness + frustration + nervousness) / 3;
      const stressFactor = Math.min(1, (agent.emotion.stress || 0) / 8);
      const emotionalDistress = negativeIntensity * 0.6 + stressFactor * 0.4;

      if (emotionalDistress > 0.15) {
        const skipProb = emotionalDistress * 0.4 * (1 - agent.personality.ocean.conscientiousness * 0.5);
        if (agent.rand() < Math.min(0.5, skipProb)) {
          const activityName = activity.activity || '';
          const workPlaces = agent.domain ? (agent.domain.placeTypes.work || []) : [];
          const isWorker = workPlaces.some(place => activityName.includes(place));
          const skipType = isWorker ? 'skipWork' : 'skipClass';
          const altState = ScheduleHandler.getSkipAlternative(agent, skipType, hour);
          const altRegion = ScheduleHandler.getSkipRegion(agent, skipType, hour);
          return { moved: true, region: altRegion || agent.position, skipEvent: skipType, altState };
        }
      }

      // 3. Social energy depleted → avoid social activities
      if (agent.socialEnergy < 0.2 && agent.behaviorParams.socialEnergyDrain > 0.5) {
        if (agent.rand() > 0.3) {
          return { moved: false };
        }
      }

      // 4. Social event special handling
      const socialRegions = agent.domain ? (agent.domain.placeTypes.social || []) : [];
      if (socialRegions.includes(activity.region)) {
        if (agent.socialEnergy < 0.3 && valence < 0) {
          if (agent.rand() > 0.4) {
            return { moved: false };
          }
        }
      }

      // 5. Late night state → don't execute morning schedule
      const lateNightStateDef = agent.domain ? agent.domain.states[agent.stateMachine.currentState] : null;
      const isLateNightState = lateNightStateDef
        ? (lateNightStateDef.category === 'lateNight' || lateNightStateDef.category === 'deviant')
        : false;
      if (hour < 8 && isLateNightState) {
        if (agent.rand() > 0.2) {
          return { moved: false };
        }
      }

      return { moved: true, region: activity.region };
    }

    // No schedule → check procedural memory (habit-driven)
    if (!activity.inSchedule) {
      const habit = agent.proceduralMemory.query({
        hour: Math.floor(hour),
        dayOfWeek,
        position: agent.position,
        valence: agent.emotion.getValence(),
      });

      if (habit && habit.confidence > 0.5) {
        const habitRegion = habit.action.region;
        if (habitRegion && habitRegion !== agent.position) {
          return { moved: true, region: habitRegion };
        }
      }
    }

    return { moved: false };
  }

  /**
   * Get alternative state after skipping schedule.
   * @param {Object} agent
   * @param {string} skipType
   * @param {number} hour
   * @returns {string|null}
   */
  static getSkipAlternative(agent, skipType, hour) {
    const skipBehavior = agent.domain ? agent.domain.skipBehavior : null;

    if (skipBehavior && skipBehavior[skipType]) {
      const states = skipBehavior[skipType].states || [];
      if (states.length > 0) {
        return states[Math.floor(agent.rand() * states.length)];
      }
    }

    // Domain-driven fallback: find states by category instead of hardcoded strings
    if (agent.domain && agent.domain.states) {
      const states = agent.domain.states;
      if (skipType === 'sick') {
        // Look for illness/sick category
        for (const [name, def] of Object.entries(states)) {
          if (def.category === 'illness' || def.category === 'sick') return name;
        }
      }
      // For skipClass/skipWork, find a rest-category state
      for (const [name, def] of Object.entries(states)) {
        if (def.category === 'rest') return name;
      }
    }

    return null;
  }

  /**
   * Get alternative region after skipping schedule.
   * @param {Object} agent
   * @param {string} skipType
   * @param {number} hour
   * @returns {string}
   */
  static getSkipRegion(agent, skipType, hour) {
    const skipBehavior = agent.domain ? agent.domain.skipBehavior : null;

    if (skipBehavior && skipBehavior[skipType]) {
      const regions = skipBehavior[skipType].regions || [];
      if (regions.length > 0) {
        return regions[Math.floor(agent.rand() * regions.length)];
      }
    }

    return agent.position;
  }

  /**
   * Generate memory event for skipping schedule.
   * @param {Object} agent
   * @param {string} skipType
   * @param {Object} env
   * @returns {Object|null}
   */
  static generateSkipMemory(agent, skipType, env) {
    const skipBehavior = agent.domain ? agent.domain.skipBehavior : null;
    let contents;

    if (skipType === 'sick') {
      // Use domain-provided sick memories, or empty (no hardcoded fallback)
      if (skipBehavior && skipBehavior.sick && skipBehavior.sick.memories) {
        contents = skipBehavior.sick.memories;
      }
    } else if (skipBehavior && skipBehavior[skipType]) {
      contents = skipBehavior[skipType].memories || [];
    }

    if (!contents || contents.length === 0) return null;

    const content = contents[Math.floor(agent.rand() * contents.length)];

    return {
      content,
      type: skipType === 'sick' ? 'illness' : 'deviant',
      scope: 'local',
      participants: [agent.id],
      effects: [
        {
          target: agent.id,
          type: 'emotion',
          delta: {
            guilt: skipType === 'skipClass' ? 0.02 : (skipType === 'skipWork' ? 0.03 : 0),
            relief: 0.03,
            calm: 0.02,
          },
        },
      ],
      _region: agent.position,
      _currentState: agent.stateMachine.currentState,
    };
  }

  /**
   * Find region for a deficient need.
   * @param {Object} agent
   * @param {string} need
   * @returns {string|null}
   */
  static findNeedRegion(agent, need) {
    const needRegionConfig = agent.domain ? agent.domain.needRegionConfig : null;

    if (needRegionConfig && needRegionConfig[need]) {
      const config = needRegionConfig[need];

      const isWorker = agent.domain && agent.domain.placeTypes.work &&
        agent.domain.placeTypes.work.some(r => agent.schedule.entries.some(e => e.region === r));

      if (config.any) return config.any;
      if (isWorker && config.worker) return config.worker;
      if (!isWorker && config.student) return config.student;
    }

    return null;
  }
}

module.exports = ScheduleHandler;
