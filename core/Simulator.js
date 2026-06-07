/**
 * Simulator - 混合 Tick+Event 调度器
 *
 * 基于 Mesa ABMSimulator 模式：
 *   - Tick-based: 同步推进所有 Agent
 *   - Event-based: 支持延迟事件调度（用于因果链等）
 *
 * 调度流程（每 tick）：
 *   1. TIME_ADVANCE     — 推进全局时钟
 *   2. ENVIRONMENT_SYNC — 同步环境状态
 *   3. AGENT_THINK      — 每个 Agent 独立思考
 *   4. INTERACTION      — 位置匹配，评估交互
 *   5. EVENT_DISPATCH   — 将事件推入 EventLog
 */

const { ANDY_DEFAULTS } = require('../config/defaults');
const cfg = ANDY_DEFAULTS.tick;

class Simulator {
  /**
   * @param {import('./World')} world
   */
  constructor(world) {
    this.world = world;
    this._running = false;
    this._scheduledEvents = []; // 延迟事件队列
    this._tickCallbacks = [];  // 每 tick 回调
    this._lastTickTime = null;
  }

  // ═══════════════════════════════════════════
  // 主循环
  // ═══════════════════════════════════════════

  /**
   * 执行一个 tick
   * @returns {Object} tick 结果摘要
   */
  tick() {
    const tickStart = Date.now();
    const result = {
      time: this.world.time.toISOString(),
      phase: {},
    };

    // ─── Phase 1: TIME_ADVANCE ───
    const minutesElapsed = cfg.intervalMinutes;
    this.world.time = new Date(this.world.time.getTime() + minutesElapsed * 60 * 1000);
    this.world.tickCount++;
    result.tickNumber = this.world.tickCount;
    result.phase.timeAdvance = { minutesElapsed, newTime: this.world.time.toISOString() };

    // ─── Phase 2: ENVIRONMENT_SYNC ───
    this.world._syncEnvironment();

    // 动态天气变化（每 60 个 tick ≈ 5 小时检查一次）
    if (this.world.tickCount % 60 === 0) {
      this.world._maybeChangeWeather();
    }

    result.phase.environmentSync = {
      weather: this.world.environment.weather,
      timeOfDay: this.world.environment.timeOfDay,
      season: this.world.environment.season,
    };

    // ─── Phase 3: AGENT_THINK ───
    const env = {
      hour: this.world.time.getHours() + this.world.time.getMinutes() / 60,
      dayOfWeek: this.world.time.getDay(),
      weather: this.world.environment.weather,
      minutesElapsed,
      simTime: this.world.time,
      simDate: this.world.time.toDateString(),
    };

    const agentResults = {};
    const allNewEvents = [];

    for (const [agentId, agent] of this.world.agents) {
      // 获取该 Agent 可感知的事件（上一 tick 的）
      const perceivedEvents = this.world.eventDispatcher.filterEventsForAgent(
        agentId,
        this.world.eventDispatcher.eventLog.slice(-10)
      );

      // 获取社交传染输入
      const contagionInputs = this._gatherContagionInputs(agentId, agent);

      // Agent 思考
      const agentResult = agent.tick(env, perceivedEvents, contagionInputs);
      agentResults[agentId] = agentResult;

      // 收集新事件
      if (agentResult.newEvents) {
        allNewEvents.push(...agentResult.newEvents);
      }

      // 更新空间位置
      if (agentResult.regionChanged) {
        this.world.regions.place(agentId, agent.position);
      }
    }
    result.phase.agentThink = { agentCount: this.world.agents.size, results: agentResults };

    // ─── Phase 4: INTERACTION ───
    // 传递模拟时间给 EventDispatcher（用于关系记录）
    this.world.eventDispatcher._simTime = this.world.time;
    let interactionEvents;
    if (this.world.spatial) {
      interactionEvents = this._evaluateSpatialInteractions(env);
    } else {
      interactionEvents = this._evaluateInteractions(env);
    }
    allNewEvents.push(...interactionEvents);
    result.phase.interaction = { eventCount: interactionEvents.length };

    // ─── Phase 4.5: SOCIAL_GRAPH_DECAY ───
    // 推进社交关系衰减（之前遗漏了这个调用！）
    this.world.socialGraph.tick(minutesElapsed / 60);

    // ─── Phase 5: EVENT_DISPATCH ───
    // 处理延迟事件
    const scheduledNow = this._processScheduledEvents();
    allNewEvents.push(...scheduledNow);

    // 将 Agent 产生的内部事件写入 EventDispatcher
    // （mind_wander、regulation、state_change 等）
    for (const evt of allNewEvents) {
      if (evt && evt.type) {
        this.world.eventDispatcher.createEvent({
          type: evt.type,
          scope: 'local',
          participants: evt.participants || [],
          content: evt.content || '',
          time: evt.time ? new Date(evt.time) : this.world.time,
          effects: evt.effects || [],
        });
      }
    }

    // 分发所有事件
    const dispatched = this.world.eventDispatcher.dispatch();
    result.phase.eventDispatch = { eventCount: dispatched.length };

    // 执行 tick 回调
    for (const cb of this._tickCallbacks) {
      try { cb(result); } catch (e) { /* 回调错误不影响主循环 */ }
    }

    // 性能统计
    result.durationMs = Date.now() - tickStart;
    this._lastTickTime = result.durationMs;

    return result;
  }

  /**
   * 运行多个 tick
   * @param {number} count
   * @returns {Object[]} 每个 tick 的结果
   */
  runTicks(count) {
    const results = [];
    for (let i = 0; i < count; i++) {
      results.push(this.tick());
    }
    return results;
  }

  // ═══════════════════════════════════════════
  // 交互评估（N² 优化）
  // ═══════════════════════════════════════════

  /**
   * 评估所有可能的 Agent 交互
   * 使用区域空间索引避免全配对检查
   *
   * @private
   * @returns {Object[]} 交互事件列表
   */
  _evaluateInteractions(env) {
    const events = [];
    const occupiedRegions = this.world.regions.getOccupiedRegions();
    const processed = new Set(); // 避免重复处理

    for (const { region, agents: agentIds } of occupiedRegions) {
      if (agentIds.length < 2) continue;

      // 同一区域的每对 Agent 评估一次
      for (let i = 0; i < agentIds.length; i++) {
        for (let j = i + 1; j < agentIds.length; j++) {
          const pairKey = [agentIds[i], agentIds[j]].sort().join('_');
          if (processed.has(pairKey)) continue;
          processed.add(pairKey);

          const event = this.world.eventDispatcher.generateEncounterEvent(
            agentIds[i], agentIds[j], region, this.world.socialGraph, this.world.agents
          );
          if (event) events.push(event);
        }
      }
    }

    // 随机事件（带上下文：时间、天气）
    const eventContext = {
      hour: env.hour,
      weather: env.weather,
      timeOfDay: this.world.environment.timeOfDay,
    };
    for (const [agentId, agent] of this.world.agents) {
      const randomEvent = this.world.eventDispatcher.generateRandomEvent(
        agentId, agent.position, eventContext
      );
      if (randomEvent) events.push(randomEvent);
    }

    return events;
  }

  /**
   * 连续坐标模式下的交互评估
   * 使用 SpatialEngine 的距离查询替代区域遍历
   * @private
   */
  _evaluateSpatialInteractions(env) {
    const events = [];
    const spatialResult = this.world.spatial.tick(this.world.agents, this.world.socialGraph);

    for (const change of spatialResult.regionChanges) {
      const agent = this.world.agents.get(change.agentId);
      if (agent) {
        agent.position = change.to;
        this.world.regions.place(change.agentId, change.to);
      }
    }

    for (const encounter of spatialResult.encounters) {
      if (Math.random() > encounter.probability) continue;
      const event = this.world.eventDispatcher.generateEncounterEvent(
        encounter.agentA, encounter.agentB,
        encounter.regionA || 'unknown',
        this.world.socialGraph, this.world.agents
      );
      if (event) {
        event.encounterTier = encounter.tier;
        event.encounterTierName = encounter.tierName;
        event.encounterDistance = encounter.distance;
        events.push(event);
      }
    }

    const eventContext = { hour: env.hour, weather: env.weather, timeOfDay: this.world.environment.timeOfDay };
    for (const [agentId, agent] of this.world.agents) {
      const randomEvent = this.world.eventDispatcher.generateRandomEvent(agentId, agent.position, eventContext);
      if (randomEvent) events.push(randomEvent);
    }

    return events;
  }

  // ═══════════════════════════════════════════
  // 社交传染
  // ═══════════════════════════════════════════

  /**
   * 收集社交传染输入
   * 同区域的 Agent 会互相传递情绪影响
   *
   * @private
   */
  _gatherContagionInputs(agentId, agent) {
    const neighbors = this.world.regions.getNeighbors(agentId, 0); // 同区域
    if (neighbors.length === 0) return null;

    const inputs = {};
    const myExpressiveness = agent._behavior.expressiveness;

    for (const neighborId of neighbors) {
      const neighbor = this.world.agents.get(neighborId);
      if (!neighbor) continue;

      // 获取关系权重
      const rel = this.world.socialGraph.getRelationship(agentId, neighborId);
      const weight = rel ? rel.strength : 0.1;

      // 传染贡献（关系越近 + 对方越外向 = 影响越大）
      // 使用 mood（中期心境）与 current 的加权混合：
      // 你感受到的是对方的整体情绪状态（mood），不仅是瞬时爆发（current）
      // 参考 Hatfield (1993): 情绪传染主要基于整体感知而非瞬时表达
      const blendedEmotion = {};
      for (const dim of require('../config/defaults').EMOTION_DIMENSIONS) {
        const moodVal = neighbor.emotion.mood[dim] || 0;
        const curVal = neighbor.emotion.current[dim] || 0;
        blendedEmotion[dim] = moodVal * 0.6 + curVal * 0.4;
      }
      inputs[neighborId] = {
        emotion: blendedEmotion,
        weight,
        expressiveness: neighbor._behavior.expressiveness,
      };
    }

    return Object.keys(inputs).length > 0 ? inputs : null;
  }

  // ═══════════════════════════════════════════
  // 事件调度
  // ═══════════════════════════════════════════

  /**
   * 调度一个延迟事件
   * @param {Object} eventParams - 事件参数（同 EventDispatcher.createEvent）
   * @param {number} delayMs - 延迟毫秒数
   */
  scheduleEvent(eventParams, delayMs) {
    this._scheduledEvents.push({
      ...eventParams,
      scheduledFor: new Date(this.world.time.getTime() + delayMs),
    });
  }

  /**
   * 处理到期的延迟事件
   * @private
   */
  _processScheduledEvents() {
    const now = this.world.time;
    const ready = [];
    const pending = [];

    for (const event of this._scheduledEvents) {
      if (new Date(event.scheduledFor) <= now) {
        const created = this.world.eventDispatcher.createEvent(event);
        ready.push(created);
      } else {
        pending.push(event);
      }
    }

    this._scheduledEvents = pending;
    return ready;
  }

  /**
   * 注册 tick 回调
   * @param {Function} callback
   */
  onTick(callback) {
    this._tickCallbacks.push(callback);
  }

  /**
   * 获取性能统计
   */
  getStats() {
    return {
      tickCount: this.world.tickCount,
      agentCount: this.world.agents.size,
      eventCount: this.world.eventDispatcher.eventLog.length,
      lastTickMs: this._lastTickTime,
      scheduledEvents: this._scheduledEvents.length,
    };
  }
}

module.exports = Simulator;
