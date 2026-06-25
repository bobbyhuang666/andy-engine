/**
 * Migration Pipeline — World State 版本迁移
 *
 * 将旧版本 World State 转换为当前版本。
 *
 * 设计原则：
 *   - Forward-only: 只向新版本迁移，不回退
 *   - Non-mutating: 不修改原对象，返回新对象
 *   - Opaque runtimeSnapshot: 只做深拷贝，不解析或修改内部结构
 */

const { CURRENT_SCHEMA_VERSION } = require('./validator');

const DEFAULT_DOMAIN_ID = 'campus';

/**
 * 将旧版本 World State 迁移到当前版本
 *
 * @param {Object} oldState - 旧版本 World State
 * @returns {{ state: Object, migrated: boolean }} 迁移后的新 State，migrated 表示是否发生了迁移
 */
function migrateWorldState(oldState) {
  if (!oldState || typeof oldState !== 'object') {
    return { state: oldState, migrated: false };
  }

  const oldVersion = oldState.schemaVersion;

  // 已经是当前版本，无需迁移
  if (oldVersion === CURRENT_SCHEMA_VERSION) {
    return { state: oldState, migrated: false };
  }

  // v0.0.0 → v0.1.0 迁移
  // v0.0.0 特征：无 schemaVersion，可能是旧版 AndyEngine.toJSON() 直接输出
  if (!oldVersion) {
    const newState = migrateV0ToV1(oldState);
    return { state: newState, migrated: true };
  }

  // 未知版本，不做迁移
  return { state: oldState, migrated: false };
}

/**
 * v0.0.0 → v0.1.0 迁移
 *
 * 旧版 AndyEngine.toJSON() 输出格式：
 * {
 *   time: string,
 *   tickCount: number,
 *   environment: object,
 *   agents: { [id]: agentJSON },
 *   socialGraph: edges[],
 *   events: { eventLog: [...] }
 * }
 *
 * @param {Object} oldState - v0.0.0 格式的 State
 * @returns {Object} v0.1.0 Stable World Envelope
 * @private
 */
function migrateV0ToV1(oldState) {
  // 生成 worldId（旧版无此字段）
  const worldId = `world_migrated_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  // 提取 characters 公共字段（全新数组，不引用原对象）
  const agents = oldState.agents || {};
  const characters = Object.entries(agents).map(([id, agentData]) => ({
    id: id,
    name: (agentData && agentData.name) || id,
    position: (agentData && agentData.position) || 'unknown',
  }));

  // 提取 relationships 公共字段（全新数组，不引用原对象）
  const rawEdges = oldState.socialGraph || [];
  const relationships = Array.isArray(rawEdges)
    ? rawEdges.map(edge => ({
        from: edge.agentA,
        to: edge.agentB,
        type: edge.type || 'stranger',
        strength: typeof edge.strength === 'number' ? edge.strength : 0,
      }))
    : [];

  // 提取 events 公共字段（全新数组，不引用原对象）
  const rawEventLog = (oldState.events && oldState.events.eventLog) || [];
  const events = rawEventLog.map(evt => ({
    id: evt.id || `evt_${Date.now()}`,
    time: typeof evt.time === 'string' ? evt.time : String(evt.time || ''),
    type: evt.type || 'general',
    content: evt.content || '',
  }));

  // 构建 runtimeSnapshot events（全新对象，不修改原 oldState.events）
  // 确保每条事件包含 AndyEngine 恢复所需字段，time 转为 Date 对象
  const originalEventLog = (oldState.events && oldState.events.eventLog) || [];
  const migratedEventLog = originalEventLog.map(evt => {
    let time = evt.time;
    if (typeof time === 'string') {
      time = new Date(time);
    }
    return {
      participants: [],
      observers: [],
      effects: [],
      cause: null,
      scope: 'local',
      ...evt,
      time: time,
    };
  });
  const runtimeSnapshotEvents = { eventLog: migratedEventLog };

  // 深拷贝 runtimeSnapshot（切断与 oldState 的所有共享引用）
  const runtimeSnapshot = JSON.parse(JSON.stringify({
    time: oldState.time || new Date().toISOString(),
    tickCount: oldState.tickCount || 0,
    environment: oldState.environment || { weather: 'sunny', timeOfDay: 'afternoon', season: 'autumn' },
    agents: oldState.agents || {},
    socialGraph: Array.isArray(oldState.socialGraph) ? oldState.socialGraph : [],
  }));
  // 附加已迁移的 events（包含 Date 类型的 time，不能用 JSON.parse 深拷贝）
  runtimeSnapshot.events = runtimeSnapshotEvents;

  // 组装 v0.1.0 Stable World Envelope
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    worldId: worldId,
    domainRef: DEFAULT_DOMAIN_ID,
    worldClock: {
      time: oldState.time || new Date().toISOString(),
      tickCount: oldState.tickCount || 0,
    },
    characters,
    relationships,
    events,
    runtimeSnapshot,
  };
}

module.exports = {
  migrateWorldState,
};
