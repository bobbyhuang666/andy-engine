/**
 * GoalSystem — 最小运行时目标系统
 *
 * 目标是长期压力源，不是命令。
 * 目标通过影响候选评分来间接影响行为。
 * 目标不直接修改 BehaviorField、不强制行为。
 */

const GOAL_SOURCES = ['background', 'external', 'world_event', 'self'];
const GOAL_STATUSES = ['active', 'completed', 'expired', 'abandoned'];

class GoalSystem {
  constructor(savedState = null) {
    if (savedState) {
      this.activeGoals = (savedState.activeGoals || []).map(g => ({ ...g }));
      this.completedGoals = (savedState.completedGoals || []).slice(-20);
    } else {
      this.activeGoals = [];
      this.completedGoals = [];
    }
    this._nextId = savedState?._nextId || 1;
  }

  /**
   * 添加目标
   * @param {Object} goalParams
   * @returns {Object} 创建的目标
   */
  addGoal(goalParams, simTime = null) {
    const now = simTime ? simTime.getTime() : 0;
    const goal = {
      id: goalParams.id || `goal_${this._nextId++}`,
      source: goalParams.source || 'self',
      description: goalParams.description || '',
      priority: Math.max(0, Math.min(1, goalParams.priority || 0.5)),
      status: 'active',
      createdAt: goalParams.createdAt || now,
      updatedAt: goalParams.createdAt || now,
      deadline: goalParams.deadline || null,
      completionCondition: goalParams.completionCondition || null,
      metadata: goalParams.metadata || {},
    };

    this.activeGoals.push(goal);
    return goal;
  }

  /**
   * 更新目标状态
   * @param {Object} context - { position, state, simTime, tickCount }
   */
  tick(context) {
    const now = context.simTime ? context.simTime.getTime() : 0;

    for (let i = this.activeGoals.length - 1; i >= 0; i--) {
      const goal = this.activeGoals[i];

      // 检查超时
      if (goal.deadline && now > goal.deadline) {
        goal.status = 'expired';
        goal.updatedAt = now;
        this.activeGoals.splice(i, 1);
        this.completedGoals.push(goal);
        continue;
      }

      // 检查完成条件
      if (goal.completionCondition && this._checkCompletion(goal, context)) {
        goal.status = 'completed';
        goal.updatedAt = now;
        this.activeGoals.splice(i, 1);
        this.completedGoals.push(goal);
        continue;
      }

      // 优先级衰减（非常缓慢）
      goal.priority *= 0.999;
      goal.updatedAt = now;
    }
  }

  /**
   * 检查目标完成条件
   * @private
   */
  _checkCompletion(goal, context) {
    const cond = goal.completionCondition;
    if (!cond) return false;

    switch (cond.type) {
      case 'region_reached':
        return context.position === cond.region;
      case 'state_entered':
        return context.state === cond.state;
      case 'need_above':
        return context.needs && context.needs[cond.need] > cond.threshold;
      default:
        return false;
    }
  }

  /**
   * 获取活跃目标对候选评分的影响
   * @param {Object} candidate
   * @returns {number} 0-1 的影响值
   */
  getGoalInfluence(candidate) {
    if (this.activeGoals.length === 0) return 0;

    let totalInfluence = 0;
    for (const goal of this.activeGoals) {
      const relevance = this._goalCandidateRelevance(goal, candidate);
      totalInfluence += goal.priority * relevance;
    }

    // 饱和
    return Math.min(0.8, totalInfluence);
  }

  /**
   * 目标与候选的相关性
   * @private
   */
  _goalCandidateRelevance(goal, candidate) {
    const type = candidate.type;
    const source = candidate.source;

    // 好奇心目标 → 探索候选加分
    if (goal.source === 'self' && type === 'explore') return 0.8;

    // 外部目标 → 所有候选微弱加分（外部目标优先级较高）
    if (goal.source === 'external') return 0.3;

    // 背景目标 → 与 source 匹配的候选加分
    if (goal.source === 'background') {
      if (type === 'work' || type === 'socialize') return 0.5;
    }

    // 世界事件目标 → 移动/反应候选加分
    if (goal.source === 'world_event') {
      if (type === 'move' || type === 'consume') return 0.6;
    }

    return 0.1; // 基础微弱影响
  }

  /**
   * 序列化
   */
  toJSON() {
    return {
      activeGoals: this.activeGoals.map(g => ({ ...g })),
      completedGoals: this.completedGoals.slice(-20),
      _nextId: this._nextId,
    };
  }
}

module.exports = { GoalSystem, GOAL_SOURCES, GOAL_STATUSES };
