/**
 * WorldObject — 域无关的世界物体
 *
 * 最小运行时实现：
 * - 物体有 id, type, name, location, affordances, visibility, ownership, lifecycle
 * - 物体通过 affordance 生成候选
 * - 物体交互创建事件
 * - 物体生命周期可追踪
 */

const OBJECT_STATUSES = ['active', 'consumed', 'broken', 'removed'];

class WorldObject {
  /**
   * @param {Object} config
   * @param {string} config.id - 唯一标识
   * @param {string} config.type - 物体类型（domain-agnostic: food, tool, furniture, etc.）
   * @param {string} config.name - 人类可读名称
   * @param {string} config.location - 所在区域
   * @param {Object[]} [config.affordances] - 可用性列表
   * @param {Object} [config.visibility] - 可见性配置
   * @param {string|null} [config.ownerId] - 所有者 agent ID
   * @param {Object} [savedState] - 恢复状态
   */
  constructor(config, savedState = null) {
    if (savedState) {
      this.id = savedState.id;
      this.type = savedState.type;
      this.name = savedState.name;
      this.location = savedState.location;
      this.affordances = savedState.affordances || [];
      this.visibility = savedState.visibility || { scope: 'region' };
      this.ownerId = savedState.ownerId || null;
      this.status = savedState.status || 'active';
      this.usesRemaining = savedState.usesRemaining ?? null;
      this.properties = savedState.properties || {};
    } else {
      this.id = config.id;
      this.type = config.type || 'generic';
      this.name = config.name || config.id;
      this.location = config.location || null;
      this.affordances = config.affordances || [];
      this.visibility = config.visibility || { scope: 'region' };
      this.ownerId = config.ownerId || null;
      this.status = 'active';
      this.usesRemaining = config.usesRemaining ?? null;
      this.properties = config.properties || {};
    }
  }

  /**
   * 检查物体是否可用
   * @param {string} agentId
   * @returns {boolean}
   */
  isAvailableFor(agentId) {
    if (this.status !== 'active') return false;
    if (this.ownerId && this.ownerId !== agentId) return false;
    if (this.usesRemaining !== null && this.usesRemaining <= 0) return false;
    return true;
  }

  /**
   * 检查物体是否对指定 agent 可见
   * @param {string} agentId
   * @param {string} agentRegion
   * @returns {boolean}
   */
  isVisibleTo(agentId, agentRegion) {
    if (this.status !== 'active') return false;
    if (this.visibility.scope === 'region') {
      return this.location === agentRegion;
    }
    return true;
  }

  /**
   * 使用物体
   * @param {string} agentId
   * @returns {Object|null} 事件数据
   */
  use(agentId) {
    if (!this.isAvailableFor(agentId)) return null;

    // 消耗品
    if (this.usesRemaining !== null) {
      this.usesRemaining--;
      if (this.usesRemaining <= 0) {
        this.status = 'consumed';
      }
    }

    // 返回 affordance 效果
    const effects = [];
    for (const aff of this.affordances) {
      effects.push({
        type: 'need',
        delta: { [aff.need]: aff.satisfyRate || 0.1 },
      });
    }

    return {
      type: 'object_use',
      content: `${agentId} 使用了 ${this.name}`,
      objectId: this.id,
      objectType: this.type,
      participants: [agentId],
      effects,
    };
  }

  /**
   * 设置所有者
   * @param {string|null} agentId
   */
  setOwner(agentId) {
    this.ownerId = agentId;
  }

  /**
   * 销毁物体
   * @param {string} reason
   */
  destroy(reason = 'unknown') {
    this.status = 'removed';
  }

  /**
   * 序列化
   */
  toJSON() {
    return {
      id: this.id,
      type: this.type,
      name: this.name,
      location: this.location,
      affordances: this.affordances.map(a => ({ ...a })),
      visibility: { ...this.visibility },
      ownerId: this.ownerId,
      status: this.status,
      usesRemaining: this.usesRemaining,
      properties: { ...this.properties },
    };
  }
}

/**
 * WorldObjectManager — 管理世界中的所有物体
 */
class WorldObjectManager {
  constructor(savedState = null) {
    /** @type {Map<string, WorldObject>} */
    this.objects = new Map();

    if (savedState && savedState.objects) {
      for (const [id, objData] of Object.entries(savedState.objects)) {
        this.objects.set(id, new WorldObject(null, objData));
      }
    }
  }

  /**
   * 添加物体
   * @param {Object} config
   * @returns {WorldObject}
   */
  addObject(config) {
    const obj = new WorldObject(config);
    this.objects.set(obj.id, obj);
    return obj;
  }

  /**
   * 获取物体
   * @param {string} id
   * @returns {WorldObject|undefined}
   */
  getObject(id) {
    return this.objects.get(id);
  }

  /**
   * 获取区域内可见物体
   * @param {string} region
   * @returns {WorldObject[]}
   */
  getObjectsInRegion(region) {
    const result = [];
    for (const obj of this.objects.values()) {
      if (obj.location === region && obj.status === 'active') {
        result.push(obj);
      }
    }
    return result;
  }

  /**
   * 获取 agent 可见的物体
   * @param {string} agentId
   * @param {string} agentRegion
   * @returns {WorldObject[]}
   */
  getVisibleObjects(agentId, agentRegion) {
    const result = [];
    for (const obj of this.objects.values()) {
      if (obj.isVisibleTo(agentId, agentRegion)) {
        result.push(obj);
      }
    }
    return result;
  }

  /**
   * 序列化
   */
  toJSON() {
    const objects = {};
    for (const [id, obj] of this.objects) {
      objects[id] = obj.toJSON();
    }
    return { objects };
  }
}

module.exports = { WorldObject, WorldObjectManager, OBJECT_STATUSES };
