/**
 * GoalSystem — 纯、可序列化、domain-agnostic 的目标系统
 *
 * 设计原则：
 *   - 纯 action-layer pressure source，不接入 Agent.tick
 *   - 所有时间由调用方传入 nowMs，不读取 Date.now
 *   - 不修改传入的外部对象
 *   - domain-agnostic：source 只用抽象来源
 */

const GOAL_SOURCES = ['self', 'external', 'background', 'world_event', 'system'];
const GOAL_STATUSES = ['active', 'completed', 'expired', 'cancelled'];

function deepClone(v) {
  if (v === null || typeof v !== 'object') return v;
  return JSON.parse(JSON.stringify(v));
}

function finiteOr(value, fallback) {
  return Number.isFinite(value) ? value : fallback;
}

function clamp01(value, fallback = 0) {
  return Math.max(0, Math.min(1, finiteOr(value, fallback)));
}

/**
 * 创建目标
 *
 * @param {Object} params
 * @param {string} [params.id] - 外部提供的稳定 id
 * @param {string} params.source - 来源（self/external/background/world_event/system）
 * @param {string} [params.actionType] - 关联的 action type
 * @param {string} [params.target] - 关联目标
 * @param {number} [params.priority=0.5] - 优先级 0-1
 * @param {number} [params.weight=1.0] - 权重倍率
 * @param {Object} [params.metadata] - 元数据
 * @param {Object} [params.completionConditions] - 完成条件
 * @param {number} [params.createdAt] - 创建时间 ms
 * @param {number} [params.dueAt] - 截止时间 ms
 * @param {number} [params.expiresAt] - 过期时间 ms
 * @returns {Object} goal
 */
function createGoal({
  id = null,
  source,
  actionType = null,
  target = null,
  priority = 0.5,
  weight = 1.0,
  metadata = {},
  completionConditions = null,
  createdAt = null,
  dueAt = null,
  expiresAt = null,
}) {
  if (!GOAL_SOURCES.includes(source)) {
    throw new Error(`Invalid goal source: ${source}. Must be one of: ${GOAL_SOURCES.join(', ')}`);
  }

  const goalId = id || createStableGoalId({
    source,
    actionType,
    target,
    priority,
    weight,
    metadata,
    completionConditions,
    createdAt,
    dueAt,
    expiresAt,
  });

  return {
    id: goalId,
    source,
    actionType,
    target,
    priority: clamp01(priority, 0.5),
    weight: Math.max(0, finiteOr(weight, 1.0)),
    status: 'active',
    progress: 0,
    createdAt: createdAt ?? null,
    dueAt: dueAt ?? null,
    expiresAt: expiresAt ?? null,
    completionConditions: deepClone(completionConditions),
    metadata: deepClone(metadata),
  };
}

function createStableGoalId(goalSeed) {
  return `goal_${goalSeed.source}_${hashString(stableStringify(goalSeed))}`;
}

function stableStringify(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const keys = Object.keys(value).sort();
  return `{${keys.map(key => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
}

function hashString(value) {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

/**
 * 更新目标状态（纯函数，返回新 goals 数组）
 *
 * @param {Object[]} goals - 当前目标列表
 * @param {Object} context - 上下文快照
 * @param {string} [context.agent.position] - agent 位置
 * @param {string} [context.agent.state] - agent 状态
 * @param {Object} [context.needs] - 需求快照
 * @param {number} nowMs - 当前时间 ms
 * @returns {Object[]} 更新后的目标列表
 */
function tickGoals(goals, context, nowMs) {
  if (!goals || goals.length === 0) return goals || [];
  const hasFiniteNow = Number.isFinite(nowMs);

  return goals.map(goal => {
    if (goal.status !== 'active') return goal;

    let newGoal = { ...goal };

    // 检查过期
    const expiresAt = Number.isFinite(newGoal.expiresAt) ? newGoal.expiresAt : null;
    if (hasFiniteNow && expiresAt != null && nowMs >= expiresAt) {
      return { ...newGoal, status: 'expired' };
    }

    // 检查完成条件
    if (newGoal.completionConditions) {
      const completed = checkCompletion(newGoal.completionConditions, context);
      if (completed) {
        return { ...newGoal, status: 'completed', progress: 1 };
      }
    }

    // 更新 progress（基于时间进度）
    if (hasFiniteNow && Number.isFinite(newGoal.dueAt) && Number.isFinite(newGoal.createdAt)) {
      const total = newGoal.dueAt - newGoal.createdAt;
      const elapsed = nowMs - newGoal.createdAt;
      const progress = total > 0 ? elapsed / total : null;
      if (Number.isFinite(progress)) {
        newGoal.progress = clamp01(progress, 0);
      }
    }

    return newGoal;
  });
}

/**
 * 检查完成条件（纯函数）
 * @private
 */
function checkCompletion(conditions, context) {
  if (!conditions || !context) return false;

  // region_reached
  if (conditions.region_reached && context.agent) {
    if (context.agent.position === conditions.region_reached) return true;
  }

  // state_entered
  if (conditions.state_entered && context.agent) {
    if (context.agent.state === conditions.state_entered) return true;
  }

  // need_above
  if (conditions.need_above && context.needs) {
    const { need, threshold } = conditions.need_above;
    if (context.needs[need] !== undefined && context.needs[need] >= threshold) return true;
  }

  return false;
}

/**
 * 取消目标
 *
 * @param {Object[]} goals
 * @param {string} goalId
 * @returns {Object[]}
 */
function cancelGoal(goals, goalId) {
  return goals.map(g => g.id === goalId ? { ...g, status: 'cancelled' } : g);
}

/**
 * 完成目标
 *
 * @param {Object[]} goals
 * @param {string} goalId
 * @returns {Object[]}
 */
function completeGoal(goals, goalId) {
  return goals.map(g => g.id === goalId ? { ...g, status: 'completed', progress: 1 } : g);
}

/**
 * 获取活跃目标
 *
 * @param {Object[]} goals
 * @returns {Object[]}
 */
function getActiveGoals(goals) {
  return (goals || []).filter(g => g.status === 'active');
}

/**
 * 序列化
 *
 * @param {Object[]} goals
 * @returns {Object[]}
 */
function toJSON(goals) {
  return deepClone(goals || []);
}

function fromJSON(data) {
  if (!Array.isArray(data)) return [];
  return deepClone(data);
}

module.exports = {
  GOAL_SOURCES,
  GOAL_STATUSES,
  createGoal,
  tickGoals,
  cancelGoal,
  completeGoal,
  getActiveGoals,
  toJSON,
  fromJSON,
};
