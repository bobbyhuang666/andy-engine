/**
 * AndyWorld — 新主 runtime
 *
 * 编排世界循环：时钟、环境、Agent tick、事件分发、社交图谱。
 * 包含原 Simulator.tick() 的全部 6 阶段管线。
 *
 * 这是 Phase 9 的核心：将编排逻辑从 core/ 移到 runtime/。
 * core/World.js 和 core/Simulator.js 变为向后兼容的委托层。
 */

const WorldClock = require('./WorldClock');
const RuntimeConfig = require('./RuntimeConfig');
const RuntimeContext = require('./RuntimeContext');
const RegionGrid = require('../spatial/RegionGrid');
const SpatialEngine = require('../spatial/SpatialEngine');
const SocialGraph = require('../social/SocialGraph');
const EventDispatcher = require('./EventDispatcher');
const { ANDY_DEFAULTS, EMOTION_DIMENSIONS } = require('../config/defaults');
const { getDefaultDomain } = require('../domain/DomainRegistry');
const { WorldFactStore, CanonEventPipeline, FactEmitter } = require('../canon');
const { KnowledgeStore } = require('../knowledge');
const { applyEventConsequences } = require('../effects/EventEffectPipeline');
const { EffectCommitter } = require('../effects/EffectCommitter');
const { RelationshipDelta } = require('../effects/RelationshipDelta');
const { MemoryDelta } = require('../effects/MemoryDelta');
const { diagnostics } = require('../shared/Diagnostics');

class AndyWorld {
  /**
   * @param {Object} [config]
   * @param {Object} [savedState] - 恢复状态
   * @param {Object} [domain] - DomainRegistry 实例
   * @param {Object} [rng] - RNG 实例
   */
  constructor(config = {}, savedState = null, domain = null, rng = null) {
    // ─── Domain & RNG ───
    this.domain = domain || getDefaultDomain();
    this.rng = rng;
    if (savedState && savedState.rngState !== undefined && this.rng) {
      this.rng.setState(savedState.rngState);
    }

    // ─── 配置 ───
    this.runtimeConfig = new RuntimeConfig(config);

    // ─── 时钟 ───
    this.clock = savedState
      ? WorldClock.fromJSON({ time: savedState.time, tickCount: savedState.tickCount })
      : new WorldClock(config.startTime || new Date());

    // ─── 兼容性属性（直接代理到 clock）───
    // 旧代码用 this.world.time 和 this.world.tickCount
    Object.defineProperty(this, 'time', {
      get() { return this.clock.time; },
      set(v) { this.clock.time = v instanceof Date ? v : new Date(v); },
      enumerable: true,
      configurable: true,
    });
    Object.defineProperty(this, 'tickCount', {
      get() { return this.clock.tickCount; },
      set(v) { this.clock.tickCount = v; },
      enumerable: true,
      configurable: true,
    });

    // ─── 环境层 ───
    this.environment = savedState ? savedState.environment : {
      weather: config.weather || 'sunny',
      weatherChangedAt: this.clock.time,
      timeOfDay: this._calcTimeOfDay(this.clock.hour),
      season: this._calcSeason(this.clock.time.getMonth()),
    };

    // ─── 事实系统（可选）───
    this.factStore = this.runtimeConfig.enableFacts
      ? (savedState && savedState.factStore
        ? WorldFactStore.fromJSON(savedState.factStore)
        : new WorldFactStore())
      : null;
    this.knowledgeStore = this.runtimeConfig.enableFacts
      ? (savedState && savedState.knowledgeStore
        ? KnowledgeStore.fromJSON(savedState.knowledgeStore, this.factStore)
        : new KnowledgeStore(this.factStore))
      : null;
    this.factEmitter = this.runtimeConfig.enableFacts
      ? new FactEmitter(this.factStore, { knowledgeStore: this.knowledgeStore })
      : null;
    this.canonEventPipeline = this.runtimeConfig.enableFacts
      ? new CanonEventPipeline(this.factStore, this.knowledgeStore, this.factEmitter)
      : null;

    // ─── 区域空间 ───
    this.regions = new RegionGrid(this.domain.regions);
    for (const [regionA, regionB, distance] of this.domain.adjacency || []) {
      this.regions.setAdjacent(regionA, regionB, distance);
    }

    // ─── 连续坐标空间（可选）───
    this.spatial = null;
    if (config.spatial === 'continuous') {
      const spatialConfig = ANDY_DEFAULTS.spatial.continuous || {};
      const regionDefs = this._buildRegionDefs({
        regionCoords: this.domain.regionCoords,
        regions: this.domain.regions,
      });
      this.spatial = new SpatialEngine({
        worldWidth: spatialConfig.worldWidth || 500,
        worldHeight: spatialConfig.worldHeight || 500,
        cellSize: spatialConfig.cellSize || 25,
        interactionRadius: spatialConfig.interactionRadius || 25,
        interactionRadii: spatialConfig.interactionRadii || [3, 10, 25],
        interactionTierNames: spatialConfig.interactionTierNames || ['conversation', 'awareness', 'presence'],
        tierProbabilities: spatialConfig.tierProbabilities || [0.8, 0.3, 0.0],
        tierRelationDeltas: spatialConfig.tierRelationDeltas || [0.05, 0.01, 0.0],
        maxInteractionsPerTick: spatialConfig.maxInteractionsPerTick || 5,
        baseProb: spatialConfig.baseProb || 0.3,
        distanceDecay: spatialConfig.distanceDecay || 0.3,
        regions: regionDefs,
        adjacency: this._buildAdjacencyMap(this.domain.adjacency),
        rng: this.rng,
      });
    }

    // ─── Agent 集合 ───
    /** @type {Map<string, import('../../agent/Agent')>} */
    this.agents = new Map();

    // ─── 社交图谱 ───
    this.socialGraph = new SocialGraph(
      savedState ? savedState.socialGraph : null
    );

    // ─── 事件系统 ───
    this.eventDispatcher = new EventDispatcher(this.domain, this.rng);
    if (savedState && savedState.events) {
      for (const evt of savedState.events.eventLog || []) {
        this.eventDispatcher.eventLog.push(evt);
      }
    }

    // ─── EffectCommitter（复用，减少 GC 压力）───
    this.effectCommitter = new EffectCommitter({ world: this, agents: this.agents });

    // ─── 调度器内部状态 ───
    this._scheduledEvents = [];
    this._tickCallbacks = [];
    this._lastTickTime = null;
  }

  // ═══════════════════════════════════════════
  // Agent 管理
  // ═══════════════════════════════════════════

  addAgent(agent) {
    this.agents.set(agent.id, agent);
    this.socialGraph.addAgent(agent.id);
    this.regions.place(agent.id, agent.position);
    if (this.spatial) {
      this.spatial.addAgent(agent.id, agent.position);
    }
    if (agent.setSocialGraph) {
      agent.setSocialGraph(this.socialGraph);
    }
  }

  getAgent(agentId) {
    return this.agents.get(agentId);
  }

  getAllAgents() {
    return [...this.agents.values()];
  }

  // ═══════════════════════════════════════════
  // 环境管理
  // ═══════════════════════════════════════════

  setWeather(weather) {
    this.environment.weather = weather;
    this.environment.weatherChangedAt = new Date(this.clock.time);
    const agentIds = [...this.agents.keys()];
    const draft = this.eventDispatcher.generateEnvironmentEvent(weather, agentIds);
    this.eventDispatcher.createEvent(draft);
  }

  /** @private */
  _syncEnvironment() {
    const hour = this.clock.hour;
    this.environment.timeOfDay = this._calcTimeOfDay(hour);
    this.environment.season = this._calcSeason(this.clock.time.getMonth());
  }

  /** @private */
  _maybeChangeWeather() {
    const season = this.environment.season;
    const current = this.environment.weather;
    const transitions = {
      spring: { sunny: 0.4, rain: 0.35, cold: 0.1, hot: 0.15 },
      summer: { sunny: 0.5, rain: 0.15, cold: 0.0, hot: 0.35 },
      autumn: { sunny: 0.3, rain: 0.3, cold: 0.25, hot: 0.15 },
      winter: { sunny: 0.2, rain: 0.15, cold: 0.55, hot: 0.1 },
    };
    const probs = transitions[season] || transitions.spring;
    const rand0 = this.rng ? this.rng.next() : Math.random();
    if (rand0 < 0.4) return;
    const rand = this.rng ? this.rng.next() : Math.random();
    let cumulative = 0;
    let newWeather = current;
    for (const [weather, prob] of Object.entries(probs)) {
      cumulative += prob;
      if (rand < cumulative) { newWeather = weather; break; }
    }
    if (newWeather !== current) {
      this.setWeather(newWeather);
    }
  }

  /** @private */
  _calcTimeOfDay(hour) {
    if (hour >= 5 && hour < 8) return 'dawn';
    if (hour >= 8 && hour < 12) return 'morning';
    if (hour >= 12 && hour < 14) return 'noon';
    if (hour >= 14 && hour < 17) return 'afternoon';
    if (hour >= 17 && hour < 19) return 'dusk';
    if (hour >= 19 && hour < 22) return 'evening';
    return 'night';
  }

  /** @private */
  _calcSeason(month) {
    if (month >= 2 && month <= 4) return 'spring';
    if (month >= 5 && month <= 7) return 'summer';
    if (month >= 8 && month <= 10) return 'autumn';
    return 'winter';
  }

  /** @private */
  _buildRegionDefs(spatialConfig) {
    const regionNames = spatialConfig.regions || [];
    const coords = spatialConfig.regionCoords || {};
    const defs = [];
    for (const name of regionNames) {
      const c = coords[name];
      if (c) {
        defs.push({ name, ...c });
      } else {
        const rand = this.rng ? this.rng.next.bind(this.rng) : Math.random;
        defs.push({
          name, shape: 'rect',
          x: rand() * 400 + 50, y: rand() * 400 + 50,
          w: 60 + rand() * 40, h: 60 + rand() * 40,
        });
      }
    }
    return defs;
  }

  /** @private */
  _buildAdjacencyMap(adjacencyArr) {
    if (!adjacencyArr) return {};
    const map = {};
    for (const [a, b] of adjacencyArr) {
      if (!map[a]) map[a] = [];
      if (!map[b]) map[b] = [];
      map[a].push(b);
      map[b].push(a);
    }
    return map;
  }

  // ═══════════════════════════════════════════
  // 主编排：step()
  // ═══════════════════════════════════════════

  /**
   * 执行一个完整的模拟步（6 阶段管线）
   *
   * 流程：
   *   1. TIME_ADVANCE     — 推进全局时钟
   *   2. ENVIRONMENT_SYNC — 同步环境状态 + 概率天气变化
   *   3. FACT_SNAPSHOT    — 发射 tick 开始时的事实快照（可选）
   *   4. AGENT_THINK      — 每个 Agent 独立思考（含社交传染）
   *   5. INTERACTION      — 位置匹配，评估交互
   *   6. SOCIAL_DECAY     — 社交关系衰减
   *   7. EVENT_DISPATCH   — 处理延迟事件 + 分发所有事件
   *   8. CANON_PIPELINE   — 事实管线 + 事件后果（可选）
   *   9. FACT_EMISSION    — 观察事实 + 关系事实（可选）
   *
   * @returns {Object} tick 结果摘要
   */
  step() {
    const tickStart = Date.now();
    const minutesElapsed = this.runtimeConfig.tickMinutes;
    const result = {
      time: this.clock.toISOString(),
      phase: {},
    };

    // ─── Phase 1: TIME_ADVANCE ───
    this.clock.advance(minutesElapsed);
    result.tickNumber = this.clock.tickCount;
    result.phase.timeAdvance = { minutesElapsed, newTime: this.clock.toISOString() };

    // ─── Phase 2: ENVIRONMENT_SYNC ───
    this._syncEnvironment();
    if (this.clock.tickCount % 60 === 0) {
      this._maybeChangeWeather();
    }
    result.phase.environmentSync = {
      weather: this.environment.weather,
      timeOfDay: this.environment.timeOfDay,
      season: this.environment.season,
    };

    // ─── Phase 3: FACT_SNAPSHOT ───
    if (this.factEmitter) {
      this.factEmitter.setSimTime(this.clock.time);
      this.factEmitter.emitStaticFacts(this.domain);
      this.factEmitter.emitAgentStateFacts(this.agents);
    }

    // ─── Phase 4: AGENT_THINK ───
    const context = new RuntimeContext({
      world: this,
      clock: this.clock,
      config: this.runtimeConfig,
      domain: this.domain,
      rng: this.rng,
    });
    const env = context.buildAgentEnv(minutesElapsed);
    const agentResults = {};
    const allNewEvents = [];

    // 预计算 blended emotion cache（per-tick snapshot semantics）
    const emotionBlendCache = this._buildEmotionBlendCache();

    for (const [agentId, agent] of this.agents) {
      const perceivedEvents = this.eventDispatcher.filterEventsForAgent(
        agentId,
        this.eventDispatcher.eventLog.slice(-10)
      );
      const contagionInputs = this._gatherContagionInputs(agentId, agent, emotionBlendCache);
      const agentResult = agent.tick(env, perceivedEvents, contagionInputs);
      agentResults[agentId] = agentResult;

      if (agentResult.newEvents) {
        allNewEvents.push(...agentResult.newEvents);
      }
      if (agentResult.regionChanged) {
        this.regions.place(agentId, agent.position);
      }
    }
    result.phase.agentThink = { agentCount: this.agents.size, results: agentResults };

    // ─── Phase 5: INTERACTION ───
    this.eventDispatcher.setSimTime(this.clock.time);
    let interactionEvents;
    if (this.spatial) {
      interactionEvents = this._evaluateSpatialInteractions(env);
    } else {
      interactionEvents = this._evaluateInteractions(env);
    }
    allNewEvents.push(...interactionEvents);
    result.phase.interaction = { eventCount: interactionEvents.length };

    // ─── Phase 6: SOCIAL_DECAY ───
    this.socialGraph.tick(minutesElapsed / 60);

    // ─── Phase 7: EVENT_DISPATCH ───
    // Tick-generated events (encounter, random, environment, scheduled) are
    // created only here. External world APIs (setWeather) may enqueue
    // immediate events outside this phase.
    const scheduledNow = this._processScheduledEvents();
    allNewEvents.push(...scheduledNow);

    for (const evt of allNewEvents) {
      if (evt && evt.type) {
        this.eventDispatcher.createEvent({
          ...evt,
          type: evt.type,
          scope: evt.scope || 'local',
          participants: evt.participants || [],
          observers: evt.observers || [],
          content: evt.content || '',
          time: evt.time ? new Date(evt.time) : this.clock.time,
          effects: evt.effects || [],
        });
      }
    }
    const dispatched = this.eventDispatcher.dispatch();
    result.phase.eventDispatch = { eventCount: dispatched.length };

    // ─── Phase 8: CANON_PIPELINE ───
    if (this.canonEventPipeline && dispatched.length > 0) {
      const pipelineResults = this.canonEventPipeline.processEvents(
        dispatched, this.agents
      );
      let memoryUpdateCount = 0;
      let locationUpdateCount = 0;
      for (const pr of pipelineResults) {
        if (pr.fact) {
          const consequences = applyEventConsequences({
            fact: pr.fact,
            agents: this.agents,
            factStore: this.factStore,
            domain: this.domain,
          });
          this.effectCommitter.commit({ deltas: consequences });

          memoryUpdateCount += consequences.filter(d => d.type === 'memory').length;
          locationUpdateCount += consequences.filter(d => d.type === 'locationMeaning').length;
        }
      }
      result.phase.canonEventPipeline = {
        processed: pipelineResults.length,
        knowledgeUpdates: pipelineResults.reduce((sum, r) => sum + r.knowledgeUpdates.length, 0),
        memoryUpdates: memoryUpdateCount,
        locationMeaningUpdates: locationUpdateCount,
      };
    }

    // ─── Phase 8b: ENCOUNTER_EFFECTS ───
    // Apply encounter relationship and memory effects through EffectCommitter.
    // This replaces the direct recordInteraction/addExperience calls that were
    // previously in EventDispatcher.generateEncounterEvent.
    const encounterEffectCount = this._applyEncounterEffects(dispatched);
    if (encounterEffectCount > 0) {
      result.phase.encounterEffects = { applied: encounterEffectCount };
    }

    // ─── Phase 9: FACT_EMISSION ───
    if (this.factEmitter) {
      this.factEmitter.setSimTime(this.clock.time);
      this.factEmitter.emitObservationFacts(interactionEvents);
      this.factEmitter.emitRelationshipFacts(this.socialGraph);
      result.phase.factEmission = this.factStore.getStats();
    }

    // ─── 回调 + 统计 ───
    for (const cb of this._tickCallbacks) {
      try { cb(result); } catch (e) { diagnostics.warn(`onTick callback error: ${e.message}`); }
    }
    result.durationMs = Date.now() - tickStart;
    this._lastTickTime = result.durationMs;

    return result;
  }

  // ═══════════════════════════════════════════
  // 交互评估
  // ═══════════════════════════════════════════

  /** @private */
  _evaluateInteractions(env) {
    const events = [];
    const occupiedRegions = this.regions.getOccupiedRegions();
    const processed = new Set();

    for (const { region, agents: agentIds } of occupiedRegions) {
      if (agentIds.length < 2) continue;
      for (let i = 0; i < agentIds.length; i++) {
        for (let j = i + 1; j < agentIds.length; j++) {
          const pairKey = [agentIds[i], agentIds[j]].sort().join('_');
          if (processed.has(pairKey)) continue;
          processed.add(pairKey);
          const event = this.eventDispatcher.generateEncounterEvent(
            agentIds[i], agentIds[j], region, this.socialGraph, this.agents
          );
          if (event) events.push(event);
        }
      }
    }

    const eventContext = {
      hour: env.hour,
      weather: env.weather,
      timeOfDay: this.environment.timeOfDay,
    };
    for (const [agentId, agent] of this.agents) {
      const randomEvent = this.eventDispatcher.generateRandomEvent(
        agentId, agent.position, eventContext
      );
      if (randomEvent) events.push(randomEvent);
    }

    return events;
  }

  /** @private */
  _evaluateSpatialInteractions(env) {
    const events = [];
    const spatialResult = this.spatial.tick(this.agents, this.socialGraph);

    for (const change of spatialResult.regionChanges) {
      const agent = this.agents.get(change.agentId);
      if (agent) {
        agent.position = change.to;
        this.regions.place(change.agentId, change.to);
      }
    }

    for (const encounter of spatialResult.encounters) {
      if ((this.rng ? this.rng.next() : Math.random()) > encounter.probability) continue;
      const event = this.eventDispatcher.generateEncounterEvent(
        encounter.agentA, encounter.agentB,
        encounter.regionA || 'unknown',
        this.socialGraph, this.agents
      );
      if (event) {
        event.encounterTier = encounter.tier;
        event.encounterTierName = encounter.tierName;
        event.encounterDistance = encounter.distance;
        events.push(event);
      }
    }

    const eventContext = { hour: env.hour, weather: env.weather, timeOfDay: this.environment.timeOfDay };
    for (const [agentId, agent] of this.agents) {
      const randomEvent = this.eventDispatcher.generateRandomEvent(agentId, agent.position, eventContext);
      if (randomEvent) events.push(randomEvent);
    }

    return events;
  }

  // ═══════════════════════════════════════════
  // Encounter Effect Application
  // ═══════════════════════════════════════════

  /**
   * Apply encounter relationship and memory effects through EffectCommitter.
   *
   * Processes the `effects` array on social/encounter events and commits
   * relationship and memory deltas via the canonical delta pipeline.
   *
   * @param {Object[]} dispatched - dispatched events
   * @returns {number} count of effects applied
   * @private
   */
  _applyEncounterEffects(dispatched) {
    const deltas = [];
    // Deduplicate relationship deltas: A→B and B→A refer to the same
    // bidirectional Relationship object, so only one recordInteraction per pair.
    const seenRelPairs = new Set();

    for (const event of dispatched) {
      if (event.type !== 'social' || !event.effects) continue;

      for (const effect of event.effects) {
        if (effect.type === 'relationship' && effect.delta) {
          const d = effect.delta;
          if (typeof d.target === 'string' && typeof d.valence === 'number') {
            const pairKey = [effect.target, d.target].sort().join('_');
            if (seenRelPairs.has(pairKey)) continue;
            seenRelPairs.add(pairKey);
            deltas.push(new RelationshipDelta(effect.target, {
              targetAgentId: d.target,
              interactionType: 'encounter',
              valence: d.valence,
              content: event.content || '',
            }));
          }
        } else if (effect.type === 'memory' && effect.delta) {
          const d = effect.delta;
          if (d.kind === 'candidate') {
            deltas.push(new MemoryDelta(effect.target, {
              kind: d.kind,
              type: d.memoryType || 'gossip',
              content: d.content || '',
              category: d.category,
              importance: d.importance,
            }));
          }
        }
      }
    }

    if (deltas.length > 0) {
      this.effectCommitter.commit({ deltas });
    }

    return deltas.length;
  }

  // ═══════════════════════════════════════════
  // 社交传染
  // ═══════════════════════════════════════════

  /** @private */
  _buildEmotionBlendCache() {
    const cache = new Map();
    for (const [agentId, agent] of this.agents) {
      const blended = {};
      for (const dim of EMOTION_DIMENSIONS) {
        blended[dim] =
          (agent.emotion.mood[dim] || 0) * 0.6 +
          (agent.emotion.current[dim] || 0) * 0.4;
      }
      cache.set(agentId, blended);
    }
    return cache;
  }

  /** @private */
  _gatherContagionInputs(agentId, agent, emotionBlendCache = null) {
    if (!emotionBlendCache) {
      emotionBlendCache = this._buildEmotionBlendCache();
    }
    const neighbors = this.regions.getNeighbors(agentId, 0);
    if (neighbors.length === 0) return null;

    const inputs = {};
    let count = 0;
    for (const neighborId of neighbors) {
      const neighbor = this.agents.get(neighborId);
      if (!neighbor) continue;
      const rel = this.socialGraph.getRelationship(agentId, neighborId);
      const weight = rel ? rel.strength : 0.1;
      const blendedEmotion = emotionBlendCache.get(neighborId);
      if (!blendedEmotion) continue;
      inputs[neighborId] = {
        emotion: blendedEmotion,
        weight,
        expressiveness: neighbor._behavior.expressiveness,
      };
      count++;
    }
    return count > 0 ? inputs : null;
  }

  // ═══════════════════════════════════════════
  // 事件调度
  // ═══════════════════════════════════════════

  scheduleEvent(eventParams, delayMs) {
    this._scheduledEvents.push({
      ...eventParams,
      scheduledFor: new Date(this.clock.time.getTime() + delayMs),
    });
  }

  /** @private */
  _processScheduledEvents() {
    const now = this.clock.time;
    const ready = [];
    const pending = [];
    for (const event of this._scheduledEvents) {
      if (new Date(event.scheduledFor) <= now) {
        ready.push(event);
      } else {
        pending.push(event);
      }
    }
    this._scheduledEvents = pending;
    return ready;
  }

  onTick(callback) {
    this._tickCallbacks.push(callback);
  }

  getStats() {
    return {
      tickCount: this.clock.tickCount,
      agentCount: this.agents.size,
      eventCount: this.eventDispatcher.eventLog.length,
      lastTickMs: this._lastTickTime,
      scheduledEvents: this._scheduledEvents.length,
    };
  }

  // ═══════════════════════════════════════════
  // 快照 & 序列化
  // ═══════════════════════════════════════════

  snapshot() {
    return {
      time: this.clock.toISOString(),
      tickCount: this.clock.tickCount,
      environment: { ...this.environment },
      agents: Object.fromEntries(
        [...this.agents.entries()].map(([id, agent]) => [id, agent.getStatus()])
      ),
      regions: this.regions.snapshot(),
      socialGraph: this.socialGraph.snapshot(),
      recentEvents: this.eventDispatcher.eventLog.slice(-20),
    };
  }

  toJSON() {
    const data = {
      time: this.clock.toISOString(),
      tickCount: this.clock.tickCount,
      environment: { ...this.environment },
      agents: Object.fromEntries(
        [...this.agents.entries()].map(([id, agent]) => [id, agent.toJSON()])
      ),
      socialGraph: this.socialGraph.toJSON(),
      events: this.eventDispatcher.toJSON(),
    };
    if (this.rng) {
      data.rngState = this.rng.getState();
    }
    if (this.factStore) {
      data.factStore = this.factStore.toJSON();
    }
    if (this.knowledgeStore) {
      data.knowledgeStore = this.knowledgeStore.toJSON();
    }
    return data;
  }
}

module.exports = AndyWorld;
