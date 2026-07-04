/**
 * SocialGraph - 全局社交图谱
 *
 * 管理所有 Agent 之间的关系
 * 支持：
 *   - 查询任意两个 Agent 之间的关系
 *   - 获取某个 Agent 的所有关系
 *   - 评估两个 Agent 是否会相遇
 *   - 计算间接影响传播
 *   - Dunbar 层级自动管理
 */

const Relationship = require('./Relationship');

function safeCounter(value) {
  return Number.isInteger(value) && value >= 0 ? value : 0;
}

class SocialGraph {
  /**
   * @param {Object[]} [savedEdges] - 恢复的关系数据
   * @param {Object} [config] - 用户配置（可选）
   */
  constructor(savedEdges = null, config = null) {
    this._cfg = Relationship.mergeConfig(config);
    /** @type {Map<string, Map<string, Relationship>>} agentId → { otherId → Relationship } */
    this._adjacency = new Map();

    // R9 fix: handle both new format {edges, _tickCount} and legacy format (plain array)
    let edges = savedEdges;
    if (savedEdges && !Array.isArray(savedEdges) && Array.isArray(savedEdges.edges)) {
      edges = savedEdges.edges;
      this._tickCount = safeCounter(savedEdges._tickCount);
    }

    if (edges) {
      for (const edge of edges) {
        if (!edge || typeof edge !== 'object' || edge.agentA == null || edge.agentB == null) continue;
        const rel = new Relationship(edge.agentA, edge.agentB, edge, this._cfg);
        this._ensureNode(edge.agentA);
        this._ensureNode(edge.agentB);
        this._adjacency.get(edge.agentA).set(edge.agentB, rel);
        this._adjacency.get(edge.agentB).set(edge.agentA, rel);
      }
    }
  }

  // ═══════════════════════════════════════════
  // 基础操作
  // ═══════════════════════════════════════════

  /**
   * 注册一个 Agent 到社交图谱
   * @param {string} agentId
   */
  addAgent(agentId) {
    this._ensureNode(agentId);
  }

  /**
   * 检查社交图谱是否包含某个 Agent
   * @param {string} agentId
   * @returns {boolean}
   */
  hasAgent(agentId) {
    return this._adjacency.has(agentId);
  }

  /**
   * 获取或创建两个 Agent 之间的关系
   * @param {string} agentA
   * @param {string} agentB
   * @returns {Relationship}
   */
  getOrCreateRelationship(agentA, agentB) {
    this._ensureNode(agentA);
    this._ensureNode(agentB);

    const rel = this._adjacency.get(agentA).get(agentB);
    if (rel) return rel;

    const newRel = new Relationship(agentA, agentB, null, this._cfg);
    this._adjacency.get(agentA).set(agentB, newRel);
    this._adjacency.get(agentB).set(agentA, newRel);
    return newRel;
  }

  /**
   * 获取两个 Agent 之间的关系（不存在则返回 null）
   * @param {string} agentA
   * @param {string} agentB
   * @returns {Relationship|null}
   */
  getRelationship(agentA, agentB) {
    const mapA = this._adjacency.get(agentA);
    return mapA ? mapA.get(agentB) || null : null;
  }

  /**
   * 获取某个 Agent 的所有关系
   * @param {string} agentId
   * @returns {Relationship[]}
   */
  getRelationships(agentId) {
    const map = this._adjacency.get(agentId);
    if (!map) return [];
    return [...map.values()];
  }

  /**
   * 获取所有 Agent ID 列表（只读快照）
   * @returns {string[]}
   */
  getAllAgentIds() {
    return [...this._adjacency.keys()];
  }

  /**
   * 获取某个 Agent 的强关系（朋友及以上）
   * @param {string} agentId
   * @returns {Relationship[]}
   */
  getStrongRelationships(agentId) {
    const layers = this.getLayers(agentId);
    return [...layers.closeFriends, ...layers.friends]
      .sort((a, b) => (Number.isFinite(b.strength) ? b.strength : 0) - (Number.isFinite(a.strength) ? a.strength : 0));
  }

  /**
   * 获取某个 Agent 的所有社交层级
   * @param {string} agentId
   * @returns {{ closeFriends: Relationship[], friends: Relationship[], acquaintances: Relationship[], strangers: Relationship[] }}
   */
  getLayers(agentId) {
    return this._projectDunbarLayers(agentId);
  }

  // ═══════════════════════════════════════════
  // 图谱查询
  // ═══════════════════════════════════════════

  /**
   * 获取共同朋友
   * @param {string} agentA
   * @param {string} agentB
   * @returns {string[]}
   */
  getCommonFriends(agentA, agentB) {
    // R41 L2 fix: use threshold from merged config instead of hardcoded 0.15.
    const acquaintanceThreshold = this._cfg.threshold.acquaintance;
    const friendsA = new Set(
      this.getRelationships(agentA)
        .filter(r => Number.isFinite(r.strength) && r.strength > acquaintanceThreshold)
        .map(r => r.getOther(agentA))
    );
    const friendsB = new Set(
      this.getRelationships(agentB)
        .filter(r => Number.isFinite(r.strength) && r.strength > acquaintanceThreshold)
        .map(r => r.getOther(agentB))
    );

    return [...friendsA].filter(id => friendsB.has(id));
  }

  /**
   * 两跳可达性（朋友的朋友）
   * @param {string} agentA
   * @param {string} agentB
   * @returns {boolean}
   */
  isTwoHopsAway(agentA, agentB) {
    // Use configurable acquaintance threshold (consistent with getCommonFriends).
    const hopThreshold = this._cfg.threshold.acquaintance;
    const friendsA = this.getRelationships(agentA)
      .filter(r => Number.isFinite(r.strength) && r.strength > hopThreshold)
      .map(r => r.getOther(agentA));

    for (const friend of friendsA) {
      const rel = this.getRelationship(friend, agentB);
      if (rel && Number.isFinite(rel.strength) && rel.strength > hopThreshold) return true;
    }
    return false;
  }

  /**
   * 计算两个 Agent 之间的社交距离（最短路径）
   * @param {string} agentA
   * @param {string} agentB
   * @returns {number} 跳数，-1 表示不可达
   */
  getSocialDistance(agentA, agentB) {
    if (agentA === agentB) return 0;

    const visited = new Set([agentA]);
    let frontier = [agentA];
    let distance = 0;

    while (frontier.length > 0) {
      distance++;
      const nextFrontier = [];

      for (const current of frontier) {
        const rels = this.getRelationships(current);
        for (const rel of rels) {
          // Use configurable acquaintance threshold (consistent with getCommonFriends).
          if (rel && !Number.isFinite(rel.strength)) continue;
          if (rel.strength < this._cfg.threshold.acquaintance) continue;
          const other = rel.getOther(current);
          if (other === agentB) return distance;
          if (!visited.has(other)) {
            visited.add(other);
            nextFrontier.push(other);
          }
        }
      }

      frontier = nextFrontier;
      if (distance > 6) return -1; // 超过6跳认为不可达
    }

    return -1;
  }

  // ═══════════════════════════════════════════
  // 全图谱维护
  // ═══════════════════════════════════════════

  /**
   * 推进所有关系的衰减
   * @param {number} hoursElapsed
   */
  tick(hoursElapsed) {
    const processed = new Set(); // Relationship 是双向共享的，避免重复处理

    for (const [agentId, relMap] of this._adjacency) {
      for (const [otherId, rel] of relMap) {
        const key = [agentId, otherId].sort().join('_');
        if (processed.has(key)) continue;
        processed.add(key);
        rel.tick(hoursElapsed);
      }
    }

    // 三元闭合：朋友的朋友更可能成为朋友
    // 性能优化：每 tick 只检查 1/3 的 agent（轮询），减少 O(N×d²) 计算量
    this._tickCount = (this._tickCount || 0) + 1;
    this._triadicClosure();

    // Dunbar 层级限制：每 12 tick 执行一次（~1小时模拟时间），减少排序开销
    if (this._tickCount % 12 === 0) {
      this._enforceDunbarLimits();
    }
  }

  /**
   * 三元闭合（Triadic Closure）
   *
   * 社交网络的基本结构特性（Granovetter 1973, Watts & Strogatz 1998）：
   *   如果 A-B 和 B-C 是朋友，那么 A-C 更可能成为朋友
   *
   * 机制：
   *   1. 遍历所有三元组 (A-B-C)
   *   2. 计算中介强度 = min(strength(A-B), strength(B-C))
   *   3. 对 A-C 关系施加微小的正向增量
   *
   * 这模拟了"朋友介绍"效应：共同朋友越多，关系增长越快
   * @private
   */
  _triadicClosure() {
    const closureRate = 0.002; // 每 tick 微小增量（5 分钟模拟时间，降低以减缓传播）
    const minBridgeStrength = 0.5; // 中介关系最低强度（只有 friend+ 才能牵线）

    // 性能优化：每 tick 只检查 1/3 的 agent（轮询抽样）
    // 三元闭合是渐进过程，不需要每 tick 对全图计算
    const agents = [...this._adjacency.keys()];
    const sampleFraction = 3;
    const offset = (this._tickCount || 0) % sampleFraction;
    const sampledAgents = agents.filter((_, i) => i % sampleFraction === offset);

    for (const agentB of sampledAgents) {
      const relMapB = this._adjacency.get(agentB);
      // 获取 agentB 的所有够强的关系
      const friendsB = [];
      for (const [otherId, rel] of relMapB) {
        if (rel && !Number.isFinite(rel.strength)) continue;
        if (rel.strength >= minBridgeStrength) {
          friendsB.push(otherId);
        }
      }

      // 如果 agentB 的朋友少于 2 个，无法形成三元闭合
      if (friendsB.length < 2) continue;

      // 检查所有 (A, C) 对，其中 A-B 和 B-C 都是朋友
      for (let i = 0; i < friendsB.length; i++) {
        for (let j = i + 1; j < friendsB.length; j++) {
          const agentA = friendsB[i];
          const agentC = friendsB[j];

          // 三元闭合只强化已有关系，不再自动创建新边
          // （防止指数级传播导致快速全连接）
          const relAC = this.getRelationship(agentA, agentC);
          if (!relAC) continue;

          // 中介强度：A-B 和 B-C 中较弱的那个
          const relAB = this.getRelationship(agentA, agentB);
          const relBC = this.getRelationship(agentB, agentC);
          if (!Number.isFinite(relAB.strength) || !Number.isFinite(relBC.strength)) continue;
          if (!Number.isFinite(relAC.strength)) continue;
          const bridgeStrength = Math.min(relAB.strength, relBC.strength);

          // 三元闭合增量：中介越强，增量越大
          // 但对已经很强的关系增量更小（饱和效应）
          const saturation = 1 - relAC.strength;
          const delta = closureRate * bridgeStrength * saturation;

          if (delta > 0.0001) {
            relAC.strength = Math.min(1, relAC.strength + delta);
            relAC._updateType();
          }
        }
      }
    }
  }

  /**
   * 执行 Dunbar 层级限制
   *
   * 基于 Robin Dunbar 的社交脑假说：
   *   - 亲密朋友（strong ties）: 最多 5-7 人
   *   - 朋友（medium ties）: 最多 15 人
   *   - 认识的人: 最多 150 人
   *
   * 当超出限制时，最弱的关系会自动降级。
   * @private
   */
  _enforceDunbarLimits() {
    for (const agentId of this._adjacency.keys()) {
      this._projectDunbarLayers(agentId);
    }
  }

  /**
   * 获取全局社交图谱快照
   * @returns {Object}
   */
  snapshot() {
    const edges = [];
    const processed = new Set();

    for (const [agentId, relMap] of this._adjacency) {
      for (const [otherId, rel] of relMap) {
        const key = [agentId, otherId].sort().join('_');
        if (processed.has(key)) continue;
        processed.add(key);
        edges.push(rel.toJSON());
      }
    }

    return {
      agentCount: this._adjacency.size,
      edgeCount: edges.length,
      edges,
    };
  }

  /**
   * 获取影响传播列表（情绪传染用）
   * 给定一个 Agent，返回所有可能受其情绪影响的 Agent
   * @param {string} agentId
   * @param {number} minStrength - 最小关系强度阈值
   * @returns {Array<{ agentId: string, weight: number }>}
   */
  getInfluenceTargets(agentId, minStrength = 0.1) {
    const rels = this.getRelationships(agentId);
    return rels
      .filter(r => Number.isFinite(r.strength) && r.strength >= minStrength)
      .map(r => ({
        agentId: r.getOther(agentId),
        weight: Number.isFinite(r.strength) ? r.strength : 0,
      }))
      .sort((a, b) => b.weight - a.weight);
  }

  // ═══════════════════════════════════════════
  // 内部辅助
  // ═══════════════════════════════════════════

  /** @private */
  _ensureNode(agentId) {
    if (!this._adjacency.has(agentId)) {
      this._adjacency.set(agentId, new Map());
    }
  }

  /**
   * Project per-agent Dunbar layers without mutating shared relationship edges.
   *
   * Relationship instances are bidirectional and shared by both endpoints. A's
   * social capacity should not destroy B's bond strength or global relation
   * state, so capacity is applied as an agent-local view.
   *
   * @private
   * @param {string} agentId
   * @returns {{ closeFriends: Relationship[], friends: Relationship[], acquaintances: Relationship[], strangers: Relationship[] }}
   */
  _projectDunbarLayers(agentId) {
    const rels = this.getRelationships(agentId)
      .sort((a, b) => (Number.isFinite(b.strength) ? b.strength : 0) - (Number.isFinite(a.strength) ? a.strength : 0));
    const { maxStrongTies, maxMediumTies } = this._cfg;

    const layers = {
      closeFriends: [],
      friends: [],
      acquaintances: [],
      strangers: [],
    };

    let strongCount = 0;
    let mediumCount = 0;

    for (const rel of rels) {
      if (rel.type === 'closeFriend' || rel.type === 'friend') {
        strongCount++;
        if (strongCount <= maxStrongTies) {
          if (rel.type === 'closeFriend') layers.closeFriends.push(rel);
          else layers.friends.push(rel);
          continue;
        }
      }

      if (rel.type === 'closeFriend' || rel.type === 'friend' || rel.type === 'acquaintance') {
        mediumCount++;
        if (mediumCount <= maxMediumTies) {
          layers.acquaintances.push(rel);
          continue;
        }
      }

      layers.strangers.push(rel);
    }

    return layers;
  }

  /**
   * 序列化
   */
  toJSON() {
    // R9 fix: include _tickCount to preserve triadic closure and Dunbar timing
    return { edges: this.snapshot().edges, _tickCount: safeCounter(this._tickCount) };
  }

  /**
   * 从 toJSON 输出反序列化为 SocialGraph 实例。
   * @param {Object|Object[]} json - toJSON() 产出（object with edges + _tickCount, or legacy edges array）
   * @returns {SocialGraph}
   */
  static fromJSON(json, config = null) {
    // R9 fix: handle both new format {edges, _tickCount} and legacy format (plain array)
    const edges = Array.isArray(json) ? json : json.edges;
    const graph = new SocialGraph(edges, config);
    if (!Array.isArray(json)) {
      graph._tickCount = safeCounter(json._tickCount);
    }
    return graph;
  }
}

module.exports = SocialGraph;
