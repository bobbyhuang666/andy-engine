/**
 * FactSchema - 事实类型定义与验证
 *
 * 定义世界事实的类型枚举和基础结构验证。
 * 所有事实共享 BaseFact 结构，不同类型的事实在此基础上扩展。
 */

// ═══════════════════════════════════════════
// 事实类型枚举
// ═══════════════════════════════════════════

const FactType = Object.freeze({
  STATIC_ENV: 'static_env',
  AGENT_STATE: 'agent_state',
  RELATIONSHIP: 'relationship',
  EVENT: 'event',
  OBSERVATION: 'observation',
  MEMORY: 'memory',
  RULE: 'rule',
  LOCATION_MEANING: 'location_meaning',
  INVALIDATED: 'invalidated',
});

const FACT_TYPES = Object.values(FactType);

// ═══════════════════════════════════════════
// 来源枚举
// ═══════════════════════════════════════════

const FactSource = Object.freeze({
  ENGINE: 'engine',
  OBSERVATION: 'observation',
  INFERENCE: 'inference',
});

const FACT_SOURCES = Object.values(FactSource);

// ═══════════════════════════════════════════
// 可见范围枚举
// ═══════════════════════════════════════════

const FactScope = Object.freeze({
  PUBLIC: 'public',
  LOCAL: 'local',
});

const FACT_SCOPES = Object.values(FactScope);

// ═══════════════════════════════════════════
// 验证器
// ═══════════════════════════════════════════

/**
 * 验证 BaseFact 结构
 * @param {Object} fact
 * @returns {{ valid: boolean, errors: string[] }}
 */
function validateFact(fact) {
  const errors = [];

  if (!fact || typeof fact !== 'object') {
    return { valid: false, errors: ['fact must be an object'] };
  }

  if (typeof fact.id !== 'string' || fact.id.length === 0) {
    errors.push('id must be a non-empty string');
  }

  if (!FACT_TYPES.includes(fact.type)) {
    errors.push(`type must be one of: ${FACT_TYPES.join(', ')}`);
  }

  if (!(fact.timestamp instanceof Date) && typeof fact.timestamp !== 'number') {
    errors.push('timestamp must be a Date or number');
  }

  if (!FACT_SOURCES.includes(fact.source)) {
    errors.push(`source must be one of: ${FACT_SOURCES.join(', ')}`);
  }

  // R35 P1 fix: typeof NaN === 'number' is true, and NaN < 0 / NaN > 1 are both
  // false, so NaN passes this check. Use Number.isFinite to reject NaN/Infinity.
  if (typeof fact.confidence !== 'number' || !Number.isFinite(fact.confidence) || fact.confidence < 0 || fact.confidence > 1) {
    errors.push('confidence must be a finite number between 0 and 1');
  }

  if (!FACT_SCOPES.includes(fact.scope)) {
    errors.push(`scope must be one of: ${FACT_SCOPES.join(', ')}`);
  }

  if (!Array.isArray(fact.participants)) {
    errors.push('participants must be an array');
  }

  if (!Array.isArray(fact.observers)) {
    errors.push('observers must be an array');
  }

  return { valid: errors.length === 0, errors };
}

/**
 * 创建 BaseFact 默认值
 * @param {Partial<Object>} overrides
 * @returns {Object}
 */
function createBaseFact(overrides = {}) {
  const timestamp = overrides.timestamp === undefined || overrides.timestamp === null
    ? new Date('1970-01-01T00:00:00Z')
    : (overrides.timestamp instanceof Date ? overrides.timestamp : new Date(overrides.timestamp));

  return {
    id: overrides.id || '',
    type: overrides.type || FactType.EVENT,
    timestamp,
    source: overrides.source || FactSource.ENGINE,
    confidence: overrides.confidence ?? 1.0,
    scope: overrides.scope || FactScope.PUBLIC,
    participants: overrides.participants || [],
    observers: overrides.observers || [],
  };
}

// ═══════════════════════════════════════════
// 类型专用 Fact 工厂
// ═══════════════════════════════════════════

/**
 * 创建 StaticEnvFact（静态环境事实）
 * @param {Object} data
 * @param {string} data.area - 区域名称
 * @param {string} data.object - 物体/地点名称
 * @param {string} [data.description] - 描述
 * @param {Partial<Object>} [base] - BaseFact 覆盖
 */
function createStaticEnvFact(data, base = {}) {
  return {
    ...createBaseFact({
      ...base,
      type: FactType.STATIC_ENV,
      timestamp: data.timestamp,
      source: data.source,
      confidence: data.confidence,
      scope: data.scope,
      participants: data.participants,
      observers: data.observers,
    }),
    area: data.area,
    object: data.object,
    description: data.description || '',
  };
}

/**
 * 创建 AgentStateFact（角色动态状态事实）
 * @param {Object} data
 * @param {string} data.agentId - 角色 ID
 * @param {string} data.state - 状态标签
 * @param {string} [data.region] - 所在区域
 * @param {Partial<Object>} [base] - BaseFact 覆盖
 */
function createAgentStateFact(data, base = {}) {
  return {
    ...createBaseFact({
      ...base,
      type: FactType.AGENT_STATE,
      timestamp: data.timestamp,
      source: data.source,
      confidence: data.confidence,
      scope: data.scope,
      participants: data.participants,
      observers: data.observers,
    }),
    agentId: data.agentId,
    state: data.state,
    region: data.region || '',
  };
}

/**
 * 创建 RelationshipFact（关系事实）
 * @param {Object} data
 * @param {string} data.agentA - Agent A
 * @param {string} data.agentB - Agent B
 * @param {string} data.relationType - 关系类型
 * @param {number} data.strength - 关系强度 (0-1)
 * @param {string} [data.previousType] - 更新前的关系类型
 * @param {Partial<Object>} [base] - BaseFact 覆盖
 */
function createRelationshipFact(data, base = {}) {
  return {
    ...createBaseFact({
      ...base,
      type: FactType.RELATIONSHIP,
      timestamp: data.timestamp,
      source: data.source,
      confidence: data.confidence,
      scope: data.scope,
      participants: data.participants,
      observers: data.observers,
    }),
    agentA: data.agentA,
    agentB: data.agentB,
    relationType: data.relationType,
    strength: data.strength,
    previousType: data.previousType || null,
  };
}

/**
 * 创建 EventFact（事件事实，不可变）
 * @param {Object} data
 * @param {string} data.eventId - 事件 ID
 * @param {string} data.description - 事件描述
 * @param {string} [data.location] - 事件发生地
 * @param {Partial<Object>} [base] - BaseFact 覆盖
 */
function createEventFact(data, base = {}) {
  return {
    ...createBaseFact({
      ...base,
      type: FactType.EVENT,
      timestamp: data.timestamp,
      source: data.source,
      confidence: data.confidence,
      scope: data.scope,
      participants: data.participants,
      observers: data.observers,
    }),
    eventId: data.eventId,
    description: data.description,
    location: data.location || '',
  };
}

/**
 * 创建 ObservationFact（观察事实）
 * @param {Object} data
 * @param {string} data.observerId - 观察者 ID
 * @param {string} data.targetId - 被观察目标 ID
 * @param {string} data.action - 观察到的动作
 * @param {string} [data.context] - 上下文
 * @param {Partial<Object>} [base] - BaseFact 覆盖
 */
function createObservationFact(data, base = {}) {
  return {
    ...createBaseFact({
      ...base,
      type: FactType.OBSERVATION,
      timestamp: data.timestamp,
      source: data.source,
      confidence: data.confidence,
      scope: data.scope || FactScope.LOCAL,
      participants: data.participants,
      observers: data.observers,
    }),
    observerId: data.observerId,
    targetId: data.targetId,
    action: data.action,
    context: data.context || '',
  };
}

/**
 * 创建 MemoryFact（记忆事实，可更新）
 * @param {Object} data
 * @param {string} data.agentId - 角色 ID
 * @param {string} data.content - 记忆内容
 * @param {number} data.importance - 重要性 (0-1)
 * @param {string} [data.emotionTag] - 情绪标签
 * @param {string} [data.category] - 记忆分类
 * @param {Partial<Object>} [base] - BaseFact 覆盖
 */
function createMemoryFact(data, base = {}) {
  return {
    ...createBaseFact({
      ...base,
      type: FactType.MEMORY,
      timestamp: data.timestamp,
      source: data.source,
      confidence: data.confidence,
      scope: data.scope || FactScope.LOCAL,
      participants: data.participants,
      observers: data.observers,
    }),
    agentId: data.agentId,
    content: data.content,
    importance: data.importance ?? 0.5,
    emotionTag: data.emotionTag || 'neutral',
    category: data.category || 'general',
  };
}

/**
 * 创建 RuleFact（规则/约束事实）
 * @param {Object} data
 * @param {string} data.ruleId - 规则 ID
 * @param {string} data.description - 规则描述
 * @param {string} data.category - 规则类别 (social/physical/temporal)
 * @param {number} [data.priority] - 优先级 (0-1)
 * @param {boolean} [data.active] - 是否激活
 * @param {Partial<Object>} [base] - BaseFact 覆盖
 */
function createRuleFact(data, base = {}) {
  return {
    ...createBaseFact({
      ...base,
      type: FactType.RULE,
      timestamp: data.timestamp,
      source: data.source,
      confidence: data.confidence,
      scope: data.scope,
      participants: data.participants,
      observers: data.observers,
    }),
    ruleId: data.ruleId,
    description: data.description,
    category: data.category || 'general',
    priority: data.priority ?? 0.5,
    active: data.active ?? true,
  };
}

/**
 * 创建 LocationMeaningFact（地点意义事实）
 * @param {Object} data
 * @param {string} data.location - 地点名称
 * @param {string} data.meaningType - 意义类型 (rest/work/social/explore)
 * @param {number} data.weight - 权重 (0-1)
 * @param {string} [data.reason] - 变化原因
 * @param {Partial<Object>} [base] - BaseFact 覆盖
 */
function createLocationMeaningFact(data, base = {}) {
  return {
    ...createBaseFact({
      ...base,
      type: FactType.LOCATION_MEANING,
      timestamp: data.timestamp,
      source: data.source,
      confidence: data.confidence,
      scope: data.scope,
      participants: data.participants,
      observers: data.observers,
    }),
    location: data.location,
    meaningType: data.meaningType,
    weight: data.weight,
    reason: data.reason || '',
  };
}

/**
 * 创建 InvalidatedFact（失效记录事实）
 * @param {Object} data
 * @param {string} data.originalFactId - 被失效的事实 ID
 * @param {string} data.reason - 失效原因
 * @param {string} [data.supersededBy] - 替代事实 ID
 * @param {Partial<Object>} [base] - BaseFact 覆盖
 */
function createInvalidatedFact(data, base = {}) {
  return {
    ...createBaseFact({
      ...base,
      type: FactType.INVALIDATED,
      timestamp: data.timestamp,
      source: data.source,
      confidence: data.confidence ?? 1.0,
      scope: data.scope,
      participants: data.participants,
      observers: data.observers,
    }),
    originalFactId: data.originalFactId,
    reason: data.reason,
    supersededBy: data.supersededBy || null,
  };
}

// ═══════════════════════════════════════════
// 验证类型专用字段
// ═══════════════════════════════════════════

/**
 * 验证类型专用字段
 * @param {Object} fact
 * @returns {{ valid: boolean, errors: string[] }}
 */
function validateTypeFields(fact) {
  const errors = [];

  switch (fact.type) {
    case FactType.STATIC_ENV:
      if (!fact.area) errors.push('static_env: area is required');
      if (!fact.object) errors.push('static_env: object is required');
      break;
    case FactType.AGENT_STATE:
      if (!fact.agentId) errors.push('agent_state: agentId is required');
      if (!fact.state) errors.push('agent_state: state is required');
      break;
    case FactType.RELATIONSHIP:
      if (!fact.agentA) errors.push('relationship: agentA is required');
      if (!fact.agentB) errors.push('relationship: agentB is required');
      if (!fact.relationType) errors.push('relationship: relationType is required');
      if (typeof fact.strength !== 'number' || !Number.isFinite(fact.strength) || fact.strength < 0 || fact.strength > 1) errors.push('relationship: strength must be a finite number between 0 and 1');
      break;
    case FactType.EVENT:
      if (!fact.eventId) errors.push('event: eventId is required');
      if (!fact.description) errors.push('event: description is required');
      break;
    case FactType.OBSERVATION:
      if (!fact.observerId) errors.push('observation: observerId is required');
      if (!fact.targetId) errors.push('observation: targetId is required');
      if (!fact.action) errors.push('observation: action is required');
      break;
    case FactType.MEMORY:
      if (!fact.agentId) errors.push('memory: agentId is required');
      if (!fact.content) errors.push('memory: content is required');
      break;
    case FactType.RULE:
      if (!fact.ruleId) errors.push('rule: ruleId is required');
      if (!fact.description) errors.push('rule: description is required');
      break;
    case FactType.LOCATION_MEANING:
      if (!fact.location) errors.push('location_meaning: location is required');
      if (!fact.meaningType) errors.push('location_meaning: meaningType is required');
      if (typeof fact.weight !== 'number' || !Number.isFinite(fact.weight) || fact.weight < 0 || fact.weight > 1) errors.push('location_meaning: weight must be a finite number between 0 and 1');
      break;
    case FactType.INVALIDATED:
      if (!fact.originalFactId) errors.push('invalidated: originalFactId is required');
      if (!fact.reason) errors.push('invalidated: reason is required');
      break;
  }

  return { valid: errors.length === 0, errors };
}

module.exports = {
  FactType,
  FACT_TYPES,
  FactSource,
  FACT_SOURCES,
  FactScope,
  FACT_SCOPES,
  validateFact,
  validateTypeFields,
  createBaseFact,
  createStaticEnvFact,
  createAgentStateFact,
  createRelationshipFact,
  createEventFact,
  createObservationFact,
  createMemoryFact,
  createRuleFact,
  createLocationMeaningFact,
  createInvalidatedFact,
};
