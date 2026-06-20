/**
 * ScheduleHandler - 日程驱动位置变化
 *
 * 封装 Agent._checkSchedule() 及相关的需求/自发动机驱动位置决策。
 * 行为决策优先级：生病 → 旷工 → 社交回避 → 正常日程 → 习惯。
 */
const { STATE_CENTERS } = require('../../../agent/BehaviorLabeler');

class ScheduleHandler {
  constructor(agent) {
    this.agent = agent;
  }

  /**
   * 执行日程检查和位置决策
   * @param {Object} context - tick 上下文
   * @param {Object} context.env - 环境状态
   * @param {Object} context.needsDrive - 需求驱力
   * @param {Object} context.imResult - 自发动机结果
   * @param {Object} context.result - Agent tick 结果（会被修改）
   */
  tick(context) {
    const { env, needsDrive, imResult, result } = context;
    const agent = this.agent;

    const scheduleResult = agent._checkSchedule(env.hour, env.dayOfWeek, env.simDate);

    if (scheduleResult.moved) {
      result.regionChanged = true;
      agent.position = scheduleResult.region;

      if (scheduleResult.skipEvent) {
        if (scheduleResult.altState) {
          const targetCenter = STATE_CENTERS[scheduleResult.altState];
          if (targetCenter) {
            const prevLabel = agent.behaviorField.label;
            agent.behaviorField.B = [...targetCenter];
            agent.behaviorField.velocity = [0, 0, 0, 0];
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

        const skipMemory = agent._generateSkipMemory(scheduleResult.skipEvent, env);
        if (skipMemory) {
          agent.memory.addExperience(skipMemory, agent.emotion);
          result.newEvents.push(skipMemory);
        }
      }
    } else if (needsDrive && needsDrive.urgency > 0.05) {
      const needRegion = agent._findNeedRegion(needsDrive.need);
      if (needRegion && needRegion !== agent.position) {
        result.regionChanged = true;
        agent.position = needRegion;
      }
    } else if (imResult.drive && imResult.drive.urgency > 0.1) {
      const isNight = env.hour >= 22 || env.hour < 6;
      const stateDef = agent._domain ? agent._domain.states[agent.stateMachine.currentState] : null;
      const isSleeping = stateDef
        ? stateDef.category === 'sleep'
        : (agent.stateMachine.currentState === '睡了' ||
           agent.stateMachine.currentState === '睡觉' ||
           agent.stateMachine.currentState === '在睡觉');

      if (!isNight && !isSleeping) {
        const explorationRegions = imResult.drive.targetRegions;
        if (explorationRegions && explorationRegions.length > 0) {
          const target = explorationRegions[0];
          if (target !== agent.position) {
            result.regionChanged = true;
            agent.position = target;
          }
        }
      }
    }
  }
}

module.exports = ScheduleHandler;
