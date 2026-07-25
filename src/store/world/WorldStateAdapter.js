/**
 * WorldStateAdapter — Stable World Envelope 薄适配层
 *
 * 职责：
 *   - toWorldState(): 将引擎现有 toJSON() 输出封装为 Stable Envelope
 *   - fromWorldState(): 将 Stable Envelope 解包恢复为引擎实例
 *
 * 设计原则：
 *   - 不修改任何 Core 类的序列化/还原逻辑
 *   - runtimeSnapshot 是 Opaque Payload，适配器不解析其内部结构
 *   - 适配器只做字段提取和封装，不做数据转换
 */

const { CURRENT_SCHEMA_VERSION, validateWorldState } = require('./validator');
const { DEFAULT_DOMAIN_ID } = require('../../config/defaults');

/**
 * 从 AndyEngine 实例导出 World State（Stable Envelope 格式）
 *
 * @param {Object} engine - AndyEngine 实例
 * @param {string} worldId - 世界唯一标识
 * @returns {Object} 符合 v0.1.0 Stable Envelope 的 World State
 */
function toWorldState(engine, worldId) {
  if (typeof worldId !== 'string' || worldId.length === 0) {
    throw new TypeError('toWorldState() requires a non-empty worldId string');
  }
  // 获取引擎原始快照（Opaque Payload）
  const originalSnapshot = engine.toJSON();

  // 提取 Stable Envelope: characters（仅公共字段）
  const agents = engine.getAllAgents();
  const characters = agents.map(agent => ({
    id: agent.id,
    name: agent.name,
    position: agent.position,
  }));

  // 提取 Stable Envelope: relationships（仅公共字段）
  const rawGraph = originalSnapshot.socialGraph || [];
  // R9 fix: SocialGraph.toJSON() now returns {edges, _tickCount} instead of plain array
  const rawEdges = Array.isArray(rawGraph) ? rawGraph : (rawGraph.edges || []);
  const relationships = rawEdges.map(edge => ({
    from: edge.agentA,
    to: edge.agentB,
    type: edge.type,
    strength: edge.strength,
  }));

  // 提取 Stable Envelope: events（仅公共字段）
  const rawEventLog = (originalSnapshot.events && originalSnapshot.events.eventLog) || [];
  const events = rawEventLog.map(evt => ({
    id: evt.id,
    time: typeof evt.time === 'string' ? evt.time : (evt.time && evt.time.toISOString ? evt.time.toISOString() : String(evt.time)),
    type: evt.type,
    content: evt.content || '',
  }));

  // 组装 Stable World Envelope
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    worldId: worldId,
    domainRef: engine.domain ? engine.domain.id : 'unknown',
    worldClock: {
      time: originalSnapshot.time,
      tickCount: originalSnapshot.tickCount,
    },
    characters,
    relationships,
    events,
    runtimeSnapshot: originalSnapshot,
  };
}

/**
 * 从 World State 恢复 AndyEngine 实例
 *
 * @param {Object} worldState - World State 对象（Stable Envelope 格式）
 * @param {Object} config - 引擎配置（含 domain 等）
 * @returns {Object} AndyEngine 实例
 * @throws {Error} domainRef 不匹配时抛出错误
 */
function fromWorldState(worldState, config = {}, engineConstructor = null) {
  // R7 fix: guard against null/undefined worldState
  if (!worldState || typeof worldState !== 'object') {
    throw new Error('fromWorldState() requires a valid worldState object, received: ' + String(worldState));
  }

  // A restore is fail-closed. Passing an absent or structurally invalid
  // payload to AndyEngine would otherwise construct a fresh empty world.
  const validation = validateWorldState(worldState);
  if (!validation.valid) {
    const details = validation.errors.map(({ path, message }) => `${path}: ${message}`).join('; ');
    throw new Error(`fromWorldState() rejected invalid worldState: ${details}`);
  }

  // 恢复安全性校验：domainRef 一致性
  if (config.domain) {
    if (config.domain.id !== worldState.domainRef) {
      throw new Error(`domainRef 不匹配：config.domain.id="${config.domain.id}"，worldState.domainRef="${worldState.domainRef}"`);
    }
  } else if (worldState.domainRef !== DEFAULT_DOMAIN_ID) {
    throw new Error(`非 ${DEFAULT_DOMAIN_ID} domain "${worldState.domainRef}" 必须在 config.domain 中传入对应的 Domain Config`);
  }

  // 从 runtimeSnapshot 解包原始快照
  const originalSnapshot = worldState.runtimeSnapshot;

  // 构造引擎 config
  const engineConfig = {
    ...config,
    startTime: worldState.worldClock ? new Date(worldState.worldClock.time) : undefined,
  };

  if (typeof engineConstructor !== 'function') {
    throw new Error('WorldStateAdapter.fromWorldState() requires an engineConstructor parameter. Pass the AndyEngine class from the public facade layer.');
  }

  // 使用原始快照恢复引擎
  return new engineConstructor(engineConfig, originalSnapshot);
}

module.exports = {
  toWorldState,
  fromWorldState,
};
