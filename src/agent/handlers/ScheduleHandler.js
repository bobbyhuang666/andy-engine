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
            // R18 AUDIT-002 fix: removed duplicate state_change event + stateMachine
            // history push. ScheduleHandler's job is to influence behavior via
            // attractor; AgentRuntime.tick() steps 6-7 handle state_change events
            // and stateMachine history when the label actually changes after
            // behaviorField.tick(). This avoids duplicate state_change events
            // and inconsistent history entries on the same tick.
            if (prevLabel !== scheduleResult.altState) {
              result.stateChanged = true;
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
    } else if (imResult.drive && imResult.drive.urgency > 0) {
      // R39 P0 fix: 探索驱力门槛从 0.1 降到 0。
      // IM 已通过 curiosityThreshold (默认 0.25) 做过门控,这里再加 0.1 门槛会
      // 让 curiosity 略微衰减(0.5→0.35)后的 agent 永久丧失探索能力,卡在初始
      // 区域不动。导致无 schedule agent 在 200 tick 内只访问 1 个位置,且不同
      // seed 因永远不消耗 RNG 而产生相同轨迹(审计 P0 失败)。
      //
      // 同时移除夜间对探索的硬性拦截。原逻辑在 lateNight 时段(默认 22-6)完全
      // 跳过探索,但 agent 在深夜仍可能因好奇心起身(如去便利店/操场),只用
      // isSleeping 状态拦截即可——睡眠中的 agent 不该被探索唤醒。
      const currentState = agent.stateMachine.currentState;
      const stateDef = agent.domain ? agent.domain.states[currentState] : null;
      const isSleeping = stateDef
        ? stateDef.category === 'sleep'
        : false;

      if (!isSleeping) {
        const explorationRegions = imResult.drive.targetRegions;
        if (explorationRegions && explorationRegions.length > 0) {
          // R20 P0: use seeded RNG to pick target instead of always [0].
          // Always picking [0] made no-schedule agent trajectories seed-independent
          // because _getExplorationRegions returns the same novelty-ranked order
          // regardless of seed (novelty is identical before any exploration).
          const idx = Math.floor(agent.rand() * explorationRegions.length);
          const target = explorationRegions[idx];
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
