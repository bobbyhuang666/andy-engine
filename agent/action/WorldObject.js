/**
 * WorldObject — Engine-level abstract entity data model
 *
 * Pure functions. No Math.random/Date.now. No campus terms.
 * All creation/update methods are pure — never mutate input objects.
 * Domain-agnostic: object types are abstract (resource/tool/furniture/container/generic).
 */

const LIFECYCLE_STATES = ['active', 'consumed', 'broken', 'removed'];

/**
 * Deep clone a JSON-safe value (no circular refs, no functions).
 * @param {*} v
 * @returns {*}
 */
function deepClone(v) {
  if (v === null || typeof v !== 'object') return v;
  return JSON.parse(JSON.stringify(v));
}

/**
 * Create a WorldObject (deep-cloned from input)
 *
 * @param {Object} params
 * @param {string} params.id - unique identifier
 * @param {string} params.type - abstract type (resource/tool/furniture/container/generic)
 * @param {string} params.name - display name
 * @param {Object} [params.location] - { region, position? }
 * @param {Object[]} [params.affordances] - [{ actionType, need, satisfyRate, consumeOnUse, weight, metadata }]
 * @param {Object} [params.state] - object-specific state map
 * @param {Object} [params.visibility] - { scope: 'region'|'hidden'|'world' }
 * @param {Object} [params.ownership] - { ownerId, exclusive, occupants, currentUsers }
 * @param {Object} [params.lifecycle] - { status, durability, maxDurability }
 * @param {Object} [params.metadata] - arbitrary metadata
 * @returns {Object} WorldObject (plain JSON, deep-cloned)
 */
function createWorldObject({
  id,
  type = 'generic',
  name = '',
  location = null,
  affordances = [],
  state = {},
  visibility = { scope: 'region' },
  ownership = { ownerId: null, exclusive: false, occupants: [], currentUsers: [] },
  lifecycle = { status: 'active', durability: null, maxDurability: null },
  metadata = {},
}) {
  if (!id) throw new Error('WorldObject requires an id');

  const lifecycleStatus = lifecycle.status || 'active';
  if (!LIFECYCLE_STATES.includes(lifecycleStatus)) {
    throw new Error(`Invalid lifecycle status: ${lifecycleStatus}`);
  }

  return {
    id,
    type,
    name,
    location: location ? deepClone({ region: location.region || null, position: location.position || null }) : null,
    affordances: deepClone(affordances),
    state: deepClone(state),
    visibility: deepClone(visibility),
    ownership: {
      ownerId: ownership.ownerId || null,
      exclusive: !!ownership.exclusive,
      occupants: deepClone(Array.isArray(ownership.occupants) ? ownership.occupants : []),
      currentUsers: deepClone(Array.isArray(ownership.currentUsers) ? ownership.currentUsers : []),
    },
    lifecycle: {
      status: lifecycleStatus,
      durability: lifecycle.durability ?? null,
      maxDurability: lifecycle.maxDurability ?? null,
    },
    metadata: deepClone(metadata),
  };
}

function normalizeWorldObject(obj) {
  return createWorldObject(obj);
}

/**
 * Serialize (deep clone)
 */
function toJSON(obj) {
  return deepClone(obj);
}

/**
 * Deserialize (deep clone)
 */
function fromJSON(data) {
  if (!data) return null;
  return deepClone(data);
}

// ═══════════════════════════════════════════
// Pure functional helpers (operate on plain objects)
// ═══════════════════════════════════════════

/**
 * Get visible objects from a list based on agent context
 */
function getVisibleObjects(objects, context) {
  const agentRegion = context?.agent?.position;
  if (!agentRegion) return [];

  return objects.filter(obj => {
    if (obj.lifecycle.status !== 'active') return false;
    if (obj.visibility.scope === 'hidden') return false;
    if (obj.visibility.scope === 'world') return true;
    return obj.location && obj.location.region === agentRegion;
  });
}

/**
 * Get affordances matching a specific need
 */
function getAffordancesForNeed(obj, need) {
  if (!obj || !obj.affordances) return [];
  if (obj.lifecycle.status !== 'active') return [];
  return obj.affordances.filter(a => a.need === need);
}

/**
 * Attempt to claim exclusive ownership (returns new object)
 */
function claim(obj, agentId) {
  if (obj.ownership.exclusive && obj.ownership.ownerId && obj.ownership.ownerId !== agentId) {
    return { success: false, object: obj };
  }
  return {
    success: true,
    object: { ...obj, ownership: { ...obj.ownership, ownerId: agentId } },
  };
}

/**
 * Release ownership (returns new object)
 */
function release(obj, agentId) {
  if (obj.ownership.ownerId !== agentId) return obj;
  return { ...obj, ownership: { ...obj.ownership, ownerId: null } };
}

/**
 * Use an object (consume affordance). Returns new object + effects.
 */
function useObject(obj, { agentId, actionType, need }) {
  if (obj.lifecycle.status !== 'active') {
    return { object: obj, effects: [], consumed: false };
  }

  const affordance = obj.affordances.find(a => {
    if (actionType && a.actionType !== actionType) return false;
    if (need && a.need !== need) return false;
    return true;
  });

  if (!affordance) {
    return { object: obj, effects: [], consumed: false };
  }

  if (obj.ownership.exclusive && obj.ownership.ownerId && obj.ownership.ownerId !== agentId) {
    return { object: obj, effects: [], consumed: false };
  }

  const effects = [];
  const satisfyRate = affordance.satisfyRate || 0;
  if (affordance.need && satisfyRate > 0) {
    effects.push({ type: 'need', need: affordance.need, delta: satisfyRate });
  }

  let updatedObj = { ...obj };
  let consumed = false;

  if (agentId && !updatedObj.ownership.currentUsers.includes(agentId)) {
    updatedObj.ownership = {
      ...updatedObj.ownership,
      currentUsers: [...updatedObj.ownership.currentUsers, agentId],
    };
  }

  if (affordance.consumeOnUse) {
    updatedObj.lifecycle = { ...updatedObj.lifecycle, status: 'consumed' };
    consumed = true;
  }

  if (updatedObj.lifecycle.durability !== null && updatedObj.lifecycle.durability > 0) {
    const newDurability = updatedObj.lifecycle.durability - 1;
    updatedObj.lifecycle = {
      ...updatedObj.lifecycle,
      durability: newDurability,
      status: newDurability <= 0 ? 'broken' : updatedObj.lifecycle.status,
    };
    if (newDurability <= 0) consumed = true;
  }

  return { object: updatedObj, effects, consumed };
}

// ═══════════════════════════════════════════
// WorldObjectManager — immutable collection manager
// ═══════════════════════════════════════════
//
// All methods return a new manager instance (immutable).
// Internal `objects` is a plain array of WorldObjects.

class WorldObjectManager {
  constructor(objects = []) {
    this.objects = objects.map(normalizeWorldObject);
  }

  /** Add an object. Returns new manager. */
  addObject(obj) {
    return new WorldObjectManager([...this.objects, normalizeWorldObject(obj)]);
  }

  /** Remove by id. Returns new manager. */
  removeObject(id) {
    return new WorldObjectManager(this.objects.filter(o => o.id !== id));
  }

  /** Update by id using an updater function. Returns new manager. */
  updateObject(id, updater) {
    return new WorldObjectManager(this.objects.map(o => {
      if (o.id !== id) return o;
      return normalizeWorldObject(updater(deepClone(o)));
    }));
  }

  /** Get object by id (returns copy). */
  getObject(id) {
    const found = this.objects.find(o => o.id === id);
    return found ? deepClone(found) : null;
  }

  /** List all objects (returns copy). */
  list() {
    return deepClone(this.objects);
  }

  /** Get visible objects for agent context. */
  getVisibleObjects(context) {
    return getVisibleObjects(this.objects, context);
  }

  /** Get affordances for need across all visible objects. */
  getAffordancesForNeed(context, need) {
    const visible = this.getVisibleObjects(context);
    const results = [];
    for (const obj of visible) {
      const affs = getAffordancesForNeed(obj, need);
      if (affs.length > 0) {
        results.push({ object: obj, affordances: affs });
      }
    }
    return results;
  }

  /** Claim object. Returns { manager, success }. */
  claim(id, agentId) {
    const obj = this.getObject(id);
    if (!obj) return { manager: this, success: false };
    const result = claim(obj, agentId);
    return {
      manager: result.success ? this.updateObject(id, () => result.object) : this,
      success: result.success,
    };
  }

  /** Release object. Returns new manager. */
  release(id, agentId) {
    return this.updateObject(id, o => release(o, agentId));
  }

  /** Use object. Returns { manager, result }. */
  useObject(id, params) {
    const obj = this.getObject(id);
    if (!obj) return { manager: this, result: { object: null, effects: [], consumed: false } };
    const result = useObject(obj, params);
    return {
      manager: this.updateObject(id, () => result.object),
      result,
    };
  }

  /** Serialize. */
  toJSON() {
    return { objects: deepClone(this.objects) };
  }

  /** Deserialize. */
  static fromJSON(data) {
    if (!data || !Array.isArray(data.objects)) return new WorldObjectManager([]);
    return new WorldObjectManager(data.objects);
  }
}

module.exports = {
  LIFECYCLE_STATES,
  deepClone,
  normalizeWorldObject,
  createWorldObject,
  toJSON,
  fromJSON,
  getVisibleObjects,
  getAffordancesForNeed,
  claim,
  release,
  useObject,
  WorldObjectManager,
};
