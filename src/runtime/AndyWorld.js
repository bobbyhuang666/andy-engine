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
const { WorldFactStore, CanonEventPipeline, FactEmitter } = require('../canon');
const { KnowledgeStore } = require('../knowledge');
const { applyEventConsequences } = require('../effects/EventEffectPipeline');
const { EffectCommitter } = require('../effects/EffectCommitter');
const { RelationshipDelta } = require('../effects/RelationshipDelta');
const { MemoryDelta } = require('../effects/MemoryDelta');
const { PositionDelta } = require('../effects/PositionDelta');
const { EmotionDelta } = require('../effects/EmotionDelta');
const { diagnostics } = require('../shared/Diagnostics');
const { RNG } = require('../shared/rng');

class AndyWorld {
  /**
   * @param {Object} [config]
   * @param {Object} [savedState] - 恢复状态
   * @param {Object} [domain] - DomainRegistry 实例
   * @param {Object} [rng] - RNG 实例
   */
  constructor(config = {}, savedState = null, domain = null, rng = null) {
    // ─── Domain & RNG ───
    if (!domain) throw new Error('AndyWorld requires a domain config');
    this.domain = domain;
    // R95: eliminate bare Math.random() from core simulation path.
    // Engine must be seeded deterministically; pass explicit `rng` for
    // reproducible runs. Default seed 0 matches subsystem fallback pattern.
    this.rng = rng || new RNG(0);
    if (savedState && savedState.rngState !== undefined && Number.isFinite(savedState.rngState)) {
      this.rng.setState(savedState.rngState);
    }

    // ─── 配置 ───
    // R41 fix: _restoreConfig merge is now done by AndyEngine before
    // calling AndyWorld.  config already contains the merged values.
    this.runtimeConfig = new RuntimeConfig(config);
    const hasOwnConfig = (key) => Object.prototype.hasOwnProperty.call(config, key);
    this._restoreConfig = { enableFacts: this.runtimeConfig.enableFacts };
    if (hasOwnConfig('tickMinutes')) this._restoreConfig.tickMinutes = this.runtimeConfig.tickMinutes;
    if (hasOwnConfig('weatherConfig')) this._restoreConfig.weatherConfig = this.runtimeConfig.weatherConfig;
    if (hasOwnConfig('actionSelection')) this._restoreConfig.actionSelection = this.runtimeConfig.actionSelection;
    if (hasOwnConfig('spatial')) this._restoreConfig.spatial = this.runtimeConfig.spatial;
    if (hasOwnConfig('needs')) this._restoreConfig.needs = this.runtimeConfig.needs;
    if (hasOwnConfig('emotion')) this._restoreConfig.emotion = config.emotion;
    if (hasOwnConfig('contagion')) this._restoreConfig.contagion = config.contagion;
    if (hasOwnConfig('memory')) this._restoreConfig.memory = config.memory;
    if (hasOwnConfig('behavior')) this._restoreConfig.behavior = config.behavior;
    if (hasOwnConfig('intrinsicMotivation')) this._restoreConfig.intrinsicMotivation = config.intrinsicMotivation;
    if (hasOwnConfig('mindWander')) this._restoreConfig.mindWander = config.mindWander;

    // ─── 时钟 ───
    this.clock = savedState
      ? WorldClock.fromJSON({ time: savedState.time, tickCount: savedState.tickCount })
      : new WorldClock(config.startTime || new Date(0)); // epoch sentinel: deterministic fallback when no startTime

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

    this.environment = savedState?.environment ? { ...savedState.environment } : {
      weather: config.weather || 'sunny',
      weatherChangedAt: this.clock.time,
      timeOfDay: this._calcTimeOfDay(this.clock.hour),
      season: this._calcSeason(this.clock.time.getMonth()),
    };
    // R8 fix: restore Date objects from serialized strings
    if (this.environment.weatherChangedAt && !(this.environment.weatherChangedAt instanceof Date)) {
      this.environment.weatherChangedAt = new Date(this.environment.weatherChangedAt);
    }

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
    // R7 fix: wire knowledgeStore → factStore so eviction purges stale knowledge
    if (this.knowledgeStore && this.factStore) {
      this.factStore.setKnowledgeStore(this.knowledgeStore);
    }
    this.factEmitter = this.runtimeConfig.enableFacts
      ? (savedState && savedState.factEmitter
        ? this._restoreFactEmitter(savedState.factEmitter)
        : new FactEmitter(this.factStore, { knowledgeStore: this.knowledgeStore }))
      : null;
    this.canonEventPipeline = this.runtimeConfig.enableFacts
      ? (savedState && savedState.canonEventPipeline
        ? this._restorePipeline(savedState.canonEventPipeline)
        : new CanonEventPipeline(this.factStore, this.knowledgeStore, this.factEmitter))
      : null;

    // ─── 区域空间 ───
    this.regions = new RegionGrid(this.domain.regions);
    for (const [regionA, regionB, distance] of this.domain.adjacency || []) {
      this.regions.setAdjacent(regionA, regionB, distance);
    }
    // R20 M16: restore RegionGrid occupancy from saved state.
    // Without this, direct AndyWorld restore produces region-less agents
    // that are invisible to encounters, contagion, and social interaction.
    if (savedState && savedState.regions && typeof savedState.regions === 'object') {
      for (const [region, agentIds] of Object.entries(savedState.regions)) {
        if (Array.isArray(agentIds)) {
          for (const agentId of agentIds) {
            this.regions.place(agentId, region);
          }
        }
      }
    }

    // ─── 连续坐标空间（可选）───
    this.spatial = null;
    // SER-1 fix: 当 config 显式开启 continuous，或快照本身携带 spatial 状态
    // （即原引擎处于 continuous 模式）时，创建 SpatialEngine。后者使
    // AndyEngine.fromJSON(json) 无需调用方再传 { spatial: 'continuous' } 即可
    // 重建连续坐标层；旧离散快照无 spatial 键 → 不创建（向后兼容）。
    // R145-5: support both string shape ('continuous') and object shape
    // ({ mode: 'continuous', worldWidth: 800, ... }) for consistency with
    // RuntimeConfig which already accepts object-shaped spatial config.
    const spatialEnabled = config.spatial === 'continuous'
      || (config.spatial && typeof config.spatial === 'object' && config.spatial.mode === 'continuous')
      || (savedState && savedState.spatial);
    if (spatialEnabled) {
      const spatialConfig = {
        ...ANDY_DEFAULTS.spatial.continuous,
        ...(config.spatial && typeof config.spatial === 'object' ? config.spatial : {}),
      };
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
	        regions: regionDefs,
	        adjacency: this._buildAdjacencyMap(this.domain.adjacency),
	        rng: this.rng,
	      });
      // SER-1 fix: restore continuous typed-array state BEFORE the addAgent loop
      // (which runs later in AndyEngine constructor). addAgent 对已存在的 agentId
      // 幂等（见 SpatialEngine.addAgent），不会覆盖已恢复的连续坐标/速度。
      // 旧快照无 spatial 键 → no-op，回退到 addAgent-at-region-center 行为（向后兼容）。
      if (savedState && savedState.spatial) {
        this.spatial.restore(savedState.spatial);
      }
    }

    // ─── Agent 集合 ───
    /** @type {Map<string, import('../../agent/Agent')>} */
    this.agents = new Map();

    // ─── 社交图谱 ───
    this.socialGraph = new SocialGraph(
      savedState ? savedState.socialGraph : null,
      config.relationship || null
    );

    // ─── 事件系统 ───
    // W1: 用 EventDispatcher.fromJSON 恢复（含 _nextId/pendingEvents/eventIndex 重建），
    // 此前直接 push eventLog 绕过了 _nextId 恢复，导致 L4 截断续跑漂移。
    if (savedState && savedState.events) {
      try {
        const eventsCfg = this.runtimeConfig.events || undefined;
        this.eventDispatcher = EventDispatcher.fromJSON(savedState.events, this.domain, this.rng, eventsCfg);
      } catch (e) {
        this.eventDispatcher = new EventDispatcher(this.domain, this.rng, this.runtimeConfig.events);
      }
    } else {
      this.eventDispatcher = new EventDispatcher(this.domain, this.rng, this.runtimeConfig.events);
    }

    // ─── EffectCommitter（复用，减少 GC 压力）───
    this.effectCommitter = new EffectCommitter({ world: this, agents: this.agents });

    // ─── 调度器内部状态 ───
    // R9 fix: restore _scheduledEvents from serialized data
    // R22 P1 fix: guard against null/undefined scheduledFor.
    // new Date(null) → epoch (fires immediately); new Date(undefined) → Invalid Date (never fires).
    this._scheduledEvents = (savedState?.scheduledEvents || [])
      .filter(e => e.scheduledFor != null) // skip null/undefined
      .map(e => ({
        ...e,
        scheduledFor: e.scheduledFor instanceof Date ? e.scheduledFor : new Date(e.scheduledFor),
      }));
    this._tickCallbacks = [];
    this._tickInProgress = false; // RFC W4 / Patch D2: sync reentrance guard
    this._lastTickTime = null;
  }

  // ═══════════════════════════════════════════
  // Agent 管理
  // ═══════════════════════════════════════════

  addAgent(agent) {
    // R7 fix: Guard against duplicate agent IDs. Silently overwriting would
    // leave the old agent's social graph node, region placement, and spatial
    // entry orphaned — producing a "ghost agent" that consumes CPU but is
    // invisible to the API.
    if (this.agents.has(agent.id)) {
      throw new Error(`AndyWorld.addAgent(): agent "${agent.id}" already exists. Remove the existing agent first or use a unique ID.`);
    }

    // RNG 所有权链注入（RFC）：上游（index.js/Agent facade）未传 rng 时，
    // agent 及其心理学子系统的 _rng 为 null（子系统构造期会用 RNG(0) 兜底
    // 以支持独立测试）。此处用 world 恒持的 RNG 覆盖，确保模拟路径所有
    // 随机源共享同一 seeded 流。seeded 模式下 agent._rng 已为引擎种子，跳过。
    if (!agent._rng && this.rng) {
      agent._rng = this.rng;
      for (const sub of [
        agent.emotion, agent.memory, agent.emotionRegulation,
        agent.intrinsicMotivation, agent.schedule, agent.behaviorField,
      ]) {
        if (sub) sub._rng = this.rng;
      }
    }
    this.agents.set(agent.id, agent);
    this.socialGraph.addAgent(agent.id);
    // R8 fix: handle RegionGrid.place() returning false when agent.position
    // is not in the domain. Fallback to domain's defaultRegion so the agent
    // is not left in limbo (no region = no encounters, no contagion, invisible).
    // R41 H1 fix: add warning when all fallbacks fail (ghost agent).
    const placed = this.regions.place(agent.id, agent.position);
    if (!placed) {
      const fallback = this.domain ? this.domain.fallback.defaultRegion : null;
      if (fallback) {
        const delta = new PositionDelta(agent.id, {
          to: fallback,
          from: agent.position,
          reason: 'fallback_region_placement',
        });
        this.effectCommitter.commit({ deltas: [delta] });
      }
      // If still unplaced after fallback, agent is a ghost — invisible, no encounters.
      if (!this.regions.getRegion(agent.id)) {
        diagnostics.warn(
          `Agent ${agent.id}: cannot be placed in any region (domain has ${(this.domain?.regions || []).length} regions). ` +
          `Agent will be invisible — no encounters, contagion, or social interaction.`
        );
      }
    }
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
    // R41: read weather transition probabilities from runtime config
    // (merges user config with ANDY_DEFAULTS), making them injectable.
    const wxCfg = this.runtimeConfig.weatherConfig || ANDY_DEFAULTS.weather;
    const probs = wxCfg.seasonProbabilities[season] || wxCfg.seasonProbabilities.spring;
    const rand0 = this.rng.next();
    if (rand0 >= wxCfg.transitionProb) return;
    const rand = this.rng.next();
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
        const rand = this.rng.next.bind(this.rng);
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
   * Execute a full simulation step (6-stage pipeline).
   *
   * Flow:
   *   1. TIME_ADVANCE     — advance global clock
   *   2. ENVIRONMENT_SYNC — sync environment state + probabilistic weather
   *   3. FACT_SNAPSHOT    — emit tick-start fact snapshot (optional)
   *   4. AGENT_THINK      — each Agent thinks independently (with social contagion)
   *   5. INTERACTION      — position-matched interactions
   *   6. SOCIAL_DECAY     — social relationship decay
   *   7. EVENT_DISPATCH   — process scheduled events + dispatch all events
   *   8. CANON_PIPELINE   — fact pipeline + event consequences (optional)
   *   9. FACT_EMISSION    — observation facts + relationship facts (optional)
   *
   * @returns {Object} tick result summary
   */
  step() {
    // RFC W4 / Patch D2: reject synchronous reentrance. A callback that
    // calls step() while the outer step() is still settling would double-count
    // effects into the outer summary (the inner _originalCommit captures the
    // outer _instrumentedCommit). Return a stable error instead.
    if (this._tickInProgress) {
      const err = new Error('AndyWorld.step(): synchronous reentrance is not allowed; schedule the next tick via queue/microtask');
      err.code = 'TICK_REENTRANCE_REJECTED';
      return { status: 'rejected', phase: {}, errors: [{ phase: 'tick', message: err.message }], time: this.clock.toISOString() };
    }
    this._tickInProgress = true;
    const tickStart = Date.now();
    const minutesElapsed = this.runtimeConfig.tickMinutes;
    const result = {
      // `time` remains the compatibility field for the time of the resulting
      // world state. `startedAt` preserves the pre-advance value explicitly.
      time: this.clock.toISOString(),
      startedAt: this.clock.toISOString(),
      status: 'committed',
      phase: {},
    };

    // ─── A1: Effect observability accumulator ───
    // Wrap effectCommitter.commit for this tick to capture
    // applied/skipped/errored counts across all call sites.
    // try/finally ensures the committer is always restored, even if a
    // phase throws (robustness, not correctness — all phases have own catch).
    const _effectAcc = { applied: 0, skipped: 0, errored: 0, byType: {} };
    const _originalCommit = this.effectCommitter.commit.bind(this.effectCommitter);
    this.effectCommitter.commit = function _instrumentedCommit(effectResult) {
      const cr = _originalCommit(effectResult);
      _effectAcc.applied += cr.applied.length;
      _effectAcc.skipped += cr.skipped.length;
      _effectAcc.errored += cr.errors.length;
      for (const d of cr.applied) {
        if (d.type) {
          _effectAcc.byType[d.type] = _effectAcc.byType[d.type] || { applied: 0, skipped: 0 };
          _effectAcc.byType[d.type].applied++;
        }
      }
      for (const d of cr.skipped) {
        if (d.type) {
          _effectAcc.byType[d.type] = _effectAcc.byType[d.type] || { applied: 0, skipped: 0 };
          _effectAcc.byType[d.type].skipped++;
        }
      }
      return cr;
    };

    try {
    // ─── Phase 1: TIME_ADVANCE ───
    this._advanceClock(minutesElapsed, result);

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
    this._emitSnapshotFacts(result);

    // ─── Phase 4: AGENT_THINK ───
    const context = new RuntimeContext({
      world: this,
      clock: this.clock,
      config: this.runtimeConfig,
      domain: this.domain,
      rng: this.rng,
    });
    const env = context.buildAgentEnv(minutesElapsed);
    const allNewEvents = [];
    this._tickAgents(minutesElapsed, env, allNewEvents, result);

    // ─── Phase 5: INTERACTION ───
    let interactionEvents;
    if (this.spatial) {
      interactionEvents = this._evaluateSpatialInteractions(env);
    } else {
      interactionEvents = this._evaluateInteractions(env);
    }
    allNewEvents.push(...interactionEvents);
    result.phase.interaction = { eventCount: interactionEvents.length };

    // ─── Phase 6: SOCIAL_DECAY ───
    this._runSocialDecay(minutesElapsed);

    // ─── Phase 7: EVENT_DISPATCH ───
    let dispatched = this._dispatchEvents(allNewEvents, result);

    // ─── Phase 8: CANON_PIPELINE ───
    this._runCanonPipeline(dispatched, result);

    // ─── Phase 8b: ENCOUNTER_EFFECTS ───
    const encounterEffectCount = this._applyEncounterEffects(dispatched);
    if (encounterEffectCount > 0) {
      result.phase.encounterEffects = { applied: encounterEffectCount };
    }

    // ─── Phase 9: FACT_EMISSION ───
    this._emitObservationFacts(interactionEvents, result);

    const errors = [];
    for (const [agentId, agentResult] of Object.entries(result.phase.agentThink?.results || {})) {
      if (agentResult?._errored) {
        errors.push({ phase: 'agentThink', agentId, message: agentResult.error || 'Agent tick failed' });
      }
    }
    if (_effectAcc.errored > 0) {
      errors.push({ phase: 'effectCommit', message: `${_effectAcc.errored} effect delta(s) failed to apply` });
    }
    // DEEP_AUDIT_2026-08-13 P0: critical phase failures must degrade the tick.
    // eventDispatch and canonEventPipeline are world-authority phases — if they
    // fail, events/facts may not have been recorded, so the tick cannot be
    // trusted as committed. Without this, atomicTicks rollback never triggers
    // (it keys on status === 'degraded' | 'aborted') and onTick callbacks
    // publish a partially-applied tick as committed.
    if (result.phase.eventDispatch?.dispatchError) {
      errors.push({ phase: 'eventDispatch', message: result.phase.eventDispatch.dispatchError });
    }
    if (result.phase.canonEventPipeline?.pipelineError) {
      errors.push({ phase: 'canonEventPipeline', message: result.phase.canonEventPipeline.pipelineError });
    }
    if (errors.length > 0) {
      result.status = 'degraded';
      result.errors = errors;
    }

    // The clock has advanced and all simulation phases have completed. Do not
    // expose the stale tick-start time as the time of this resulting state.
    result.committedAt = this.clock.toISOString();
    result.time = result.committedAt;

    // ─── RFC W4 / Patch D2: 5-stage tick settlement ───
    // Stage 2-3: restore committer + freeze effectSummary BEFORE callbacks,
    // so callbacks see the frozen summary and cannot double-count inner
    // effects into this tick's statistics.
    this.effectCommitter.commit = _originalCommit;
    const totalEffects = _effectAcc.applied + _effectAcc.skipped + _effectAcc.errored;
    if (totalEffects > 0) {
      result.phase.effectSummary = {
        counts: {
          applied: _effectAcc.applied,
          skipped: _effectAcc.skipped,
          errored: _effectAcc.errored,
        },
        byType: _effectAcc.byType,
      };
    }
    // Stage 4: clear tick in-progress AFTER callbacks, so that synchronous
    // reentrance from within a callback is still rejected. The guard at the
    // top of step() checks this flag.
    // Stage 5: callbacks last, after all settlement is frozen.
    if (result.status === 'committed') {
      // Post-tick refresh of AGENT_STATE facts so that position reflects the
      // final state after all movement phases (thinking, spatial, encounter).
      this._refreshAgentStateFacts();

      // Snapshot the callback list to avoid iteration mutation issues (RFC O7).
      const callbacks = [...this._tickCallbacks];
      for (const cb of callbacks) {
        try { cb(result); } catch (e) { diagnostics.warn(`onTick callback error: ${e.message}`); }
      }
    }

    this._tickInProgress = false;

    } catch (outerErr) {
      // Ensure committer is restored and in-progress cleared even on unexpected
      // phase errors (the phases have their own catch, but this is a safety net).
      this.effectCommitter.commit = _originalCommit;
      this._tickInProgress = false;
      throw outerErr;
    }

    result.durationMs = Date.now() - tickStart;
    this._lastTickTime = result.durationMs;

    return result;
  }

  /**
   * Phase 1: TIME_ADVANCE — advance the global clock and update simTime.
   * @private
   */
  _advanceClock(minutesElapsed, result) {
    this.clock.advance(minutesElapsed);
    // Must set simTime early so Phase 2 weather changes (setWeather → createEvent)
    // use the current tick's simulation time, not the previous tick's stale value.
    this.eventDispatcher.setSimTime(this.clock.time);
    result.tickNumber = this.clock.tickCount;
    result.phase.timeAdvance = { minutesElapsed, newTime: this.clock.toISOString() };
  }

  /**
   * Phase 3: FACT_SNAPSHOT — emit static and agent-state facts at tick start.
   * @private
   */
  _emitSnapshotFacts(result) {
    if (this.factEmitter) {
      this.factEmitter.setSimTime(this.clock.time);
      this.factEmitter.emitStaticFacts(this.domain);
      this.factEmitter.emitAgentStateFacts(this.agents);
    }
    
    // Sync simTime to factStore
    if (this.factStore) {
      this.factStore.setSimTime(this.clock.time);
    }
  }

  /**
   * Post-tick refresh of agent-state facts.
   *
   * Called AFTER all position-changing phases (agent thinking, spatial moves,
   * encounter effects) so that AGENT_STATE facts reflect the final position.
   *
   * MUST only be invoked when result.status === 'committed'; degraded ticks
   * must not persist stale position data into the fact store.
   *
   * @private
   */
  _refreshAgentStateFacts() {
    if (this.factEmitter) {
      this.factEmitter.setSimTime(this.clock.time);
      this.factEmitter.emitAgentStateFacts(this.agents);
    }
  }

  /**
   * Phase 4: AGENT_THINK — each agent ticks independently.
   * Mutates allNewEvents (pushes agent-generated events).
   * @private
   */
  _tickAgents(minutesElapsed, env, allNewEvents, result) {
    const agentResults = {};

    // 预计算 blended emotion cache（per-tick snapshot semantics）
    const emotionBlendCache = this._buildEmotionBlendCache();

    for (const [agentId, agent] of this.agents) {
      let agentResult;
      try {
        const perceivedEvents = this.eventDispatcher.filterEventsForAgent(
          agentId,
          this.eventDispatcher.eventLog.slice(-10)
        );
        const contagionInputs = this._gatherContagionInputs(agentId, agent, emotionBlendCache);
        agentResult = agent.tick(env, perceivedEvents, contagionInputs);
      } catch (err) {
        // R12: isolate agent errors — one failing agent must not kill the entire tick.
        // The failing agent is skipped; other agents continue normally.
        const partialEvents = agentResult?.newEvents || [];
        agentResult = {
          error: err.message,
          newEvents: partialEvents,
          _errored: true,
        };
        this._diagnostics?.warn?.('agent_tick_error', { agentId, error: err.message, partialEvents: partialEvents.length });
        diagnostics.warn(`Agent ${agentId} tick failed: ${err.message}`);
      }
      agentResults[agentId] = agentResult;

      if (agentResult.newEvents) {
        allNewEvents.push(...agentResult.newEvents);
      }
      if (agentResult.regionChanged) {
        // R8 fix: validate placement succeeded; if not, revert to domain default
        const placed = this.regions.place(agentId, agent.position);
        if (!placed) {
          const fallback = this.domain ? this.domain.fallback.defaultRegion : null;
          if (fallback && fallback !== agent.position) {
            const delta = new PositionDelta(agentId, {
              to: fallback,
              from: agent.position,
              reason: 'fallback_region_placement',
            });
            this.effectCommitter.commit({ deltas: [delta] });
          }
        }
        // R40/SP-1 fix: continuous spatial 模式下,schedule/need/IM 路径设 agent.position
        // 并置 regionChanged=true,但不同步 SpatialEngine._coords。Phase 5
        // SpatialEngine.tick()->_syncRegions() 用陈旧坐标反推旧区域,用
        // PositionDelta(to:旧区域) 把 agent.position 回滚。这里把连续坐标对齐到
        // 目标区域中心 (regionCenter 不消费 RNG,不漂移 golden fixture),使
        // pointToRegion(coords)===agent.position,回滚消失。
        // active action-selection 路径已由 RuntimeContext._setRegionChanged 同步,
        // 这里覆盖 schedule/need/IM 等其余 regionChanged 路径。
        // R41 fix: use _setCoordRaw to avoid per-agent O(N) grid rebuild.
        // spatial.tick() in Phase 5 does the single rebuild.
        if (this.spatial && typeof this.spatial._setCoordRaw === 'function') {
          const center = this.spatial.worldMap.regionCenter(agent.position);
          // R41 P1 fix: handle null from regionCenter (unknown region).
          if (center) {
            this.spatial._setCoordRaw(agentId, center.x, center.y);
          }
        }
      }
    }
    result.phase.agentThink = { agentCount: this.agents.size, results: agentResults };
  }

  /**
   * Phase 6: SOCIAL_DECAY — apply social relationship decay.
   * @private
   */
  _runSocialDecay(minutesElapsed) {
    this.socialGraph.tick(minutesElapsed / 60);
  }

  /**
   * Phase 7: EVENT_DISPATCH — process scheduled events and dispatch all pending events.
   * Tick-generated events (encounter, random, environment, scheduled) are
   * created only here. External world APIs (setWeather) may enqueue
   * immediate events outside this phase.
   * @param {Object[]} allNewEvents - mutable array, mutated in-place with scheduled events
   * @returns {Object[]} dispatched events
   * @private
   */
  _dispatchEvents(allNewEvents, result) {
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
    let dispatched = [];
    let dispatchError = null;
    try {
      dispatched = this.eventDispatcher.dispatch();
    } catch (err) {
      // DEEP_AUDIT_2026-08-13 P0: event dispatch is a critical phase. A failed
      // dispatch means tick-generated events did not enter the event log, so
      // downstream canon/knowledge/effects would operate on a partial world.
      // Record the error so step() degrades this tick (and atomicTicks rolls
      // it back) instead of marking it committed. Previously this only warned
      // and the tick stayed `committed`, contradicting the fail-closed contract.
      dispatchError = err.message;
      diagnostics.warn(`EventDispatcher.dispatch failed: ${err.message}`);
    }
    result.phase.eventDispatch = { eventCount: dispatched.length };
    if (dispatchError) result.phase.eventDispatch.dispatchError = dispatchError;
    return dispatched;
  }

  /**
   * Phase 8: CANON_PIPELINE — process dispatched events through the canon pipeline.
   * @private
   */
  _runCanonPipeline(dispatched, result) {
    if (this.canonEventPipeline && dispatched.length > 0) {
      let pipelineResults = [];
      let pipelineError = null;
      try {
        pipelineResults = this.canonEventPipeline.processEvents(
          dispatched, this.agents
        );
      } catch (err) {
        pipelineError = err.message;
        diagnostics.warn(`CanonEventPipeline.processEvents failed: ${err.message}`);
      }

      let memoryUpdateCount = 0;
      let locationUpdateCount = 0;
      if (pipelineResults.length > 0) {
        for (const pr of pipelineResults) {
          if (pr.fact) {
            try {
              const consequences = applyEventConsequences({
                fact: pr.fact,
                agents: this.agents,
                factStore: this.factStore,
                domain: this.domain,
              });
              const commitResult = this.effectCommitter.commit({ deltas: consequences });
              // R12: log effect committer errors instead of silently swallowing
              if (commitResult.errors && commitResult.errors.length > 0) {
                for (const { delta, error } of commitResult.errors) {
                  diagnostics.warn(`EffectCommitter error for ${delta.type}: ${error.message}`);
                }
              }

              memoryUpdateCount += consequences.filter(d => d.type === 'memory').length;
              locationUpdateCount += consequences.filter(d => d.type === 'locationMeaning').length;
            } catch (err) {
              diagnostics.warn(`Canon pipeline consequence processing failed: ${err.message}`);
            }
          }
        }
      }
      result.phase.canonEventPipeline = {
        processed: pipelineResults.length,
        knowledgeUpdates: pipelineResults.reduce((sum, r) => sum + r.knowledgeUpdates.length, 0),
        memoryUpdates: memoryUpdateCount,
        locationMeaningUpdates: locationUpdateCount,
        pipelineError: pipelineError || undefined,
      };
    }
  }

  /**
   * Phase 9: FACT_EMISSION — emit observation and relationship facts.
   *
   * Passes agents + domain to FactEmitter.emitObservationFacts so the OBSERVATION
   * fact's action reflects the observed target's current specific activity
   * (domain-driven, e.g. "Maren 在休息") instead of a generic stranger-encounter
   * template ("在附近注意到有人"). This keeps observation facts informative.
   * @private
   */
  _emitObservationFacts(interactionEvents, result) {
    if (this.factEmitter) {
      this.factEmitter.setSimTime(this.clock.time);
      this.factEmitter.emitObservationFacts(interactionEvents, this.agents, this.domain);
      this.factEmitter.emitRelationshipFacts(this.socialGraph);
      // R8.6: emit per-agent memory facts so the memory conversational surface
      // has facts to ground on. emitMemoryFacts is read-only (reads
      // agent.memory.memories), consistent with the FactEmitter read-only
      // boundary. Memory facts are LOCAL scope with the owning agent as the
      // only participant, so only that agent sees them via getGroundingPackage.
      this.factEmitter.emitMemoryFacts(this.agents);
      // R8.7: emit per-agent future intention facts (next scheduled activity,
      // domain-driven) so the future_intention conversational surface has facts
      // to ground on. emitIntentionFacts is read-only (delegates to the schedule
      // API), consistent with the FactEmitter boundary. INTENTION facts are
      // LOCAL scope owned by the agent. Pass the UTC hour from the clock (which
      // is already UTC and allowlisted) so FactEmitter does not call getUTCHours.
      this.factEmitter.emitIntentionFacts(
        this.agents,
        this.clock.time.getUTCHours(),
        this.clock.dayOfWeek,
        this.clock.toISOString().slice(0, 10),
      );
      result.phase.factEmission = this.factStore.getStats();
    }
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
      if (typeof change.to === 'string' && !this.domain.regions.includes(change.to)) continue;
      const agent = this.agents.get(change.agentId);
      if (agent && change.to !== agent.position) {
        // Route spatial position changes through EffectCommitter (R4 fix).
        // Direct agent.position = bypasses the canonical delta pipeline.
        const delta = new PositionDelta(change.agentId, {
          to: change.to,
          from: agent.position,
          reason: 'spatial_move',
        });
        const posResult = this.effectCommitter.commit({ deltas: [delta] });
        if (posResult.errors && posResult.errors.length > 0) {
          for (const { error } of posResult.errors) {
            diagnostics.warn(`PositionDelta error: ${error.message}`);
          }
        }
      }
    }

    for (const encounter of spatialResult.encounters) {
      // R116-015: guard against NaN probability (corrupted encounter data).
      if (!Number.isFinite(encounter.probability)) continue;
      if (this.rng.next() > encounter.probability) continue;
      const event = this.eventDispatcher.generateEncounterEvent(
        encounter.agentA, encounter.agentB,
        encounter.regionA || null, // R91: null-safe — 'unknown' would create phantom region references
        this.socialGraph, this.agents
      );
      if (event) {
        event.encounterTier = encounter.tier;
        event.encounterTierName = encounter.tierName;
        event.encounterDistance = encounter.distance;
        events.push(event);
      }
    }

    const safeHour = Number.isFinite(env.hour) ? env.hour : 12;
    const eventContext = { hour: safeHour, weather: env.weather, timeOfDay: this.environment.timeOfDay };
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

    // R20 M3: process 'social', 'random', and 'weather' event types.
    // Random events (from EventDispatcher.generateRandomEvent) carry emotion
    // deltas but were silently dropped because only type==='social' was checked.
    // R41 fix: add 'weather' — weather events created by setWeather() also carry
    // emotion deltas that should be applied to affected agents.
    const PROCESSABLE_TYPES = new Set(['social', 'random', 'weather']);

    for (const event of dispatched) {
      if (!PROCESSABLE_TYPES.has(event.type) || !event.effects) continue;

      for (const effect of event.effects) {
        if (effect.type === 'relationship' && effect.delta) {
          const d = effect.delta;
          // R37 P2 fix: use Number.isFinite instead of typeof for valence,
          // matching the pattern used in EffectCommitter and RelationshipDelta.
          // typeof NaN === 'number' is true; downstream guards catch it but
          // this provides defense-in-depth.
          if (typeof d.target === 'string' && typeof d.valence === 'number' && Number.isFinite(d.valence)) {
            const pairKey = [effect.target, d.target].sort().join('_');
            if (seenRelPairs.has(pairKey)) continue;
            seenRelPairs.add(pairKey);
            // R41 M3 fix: prefer effect.target as source, but fall back to
            // d.target if effect.target's agent is removed between phases.
            // Without the fallback, encounter effects silently fail when one
            // participant disappears mid-tick.
            const source = this.agents.has(effect.target) ? effect.target : d.target;
            if (!this.agents.has(source)) continue;
            const relationshipPayload = {
              targetAgentId: source === effect.target ? d.target : effect.target,
              interactionType: 'encounter',
              valence: d.valence,
              content: event.content || '',
            };
            deltas.push(new RelationshipDelta(source, relationshipPayload));
          }
        } else if (effect.type === 'emotion' && effect.delta) {
          // Apply encounter emotions in the same commit pass as relationship and
          // memory effects. Relying on next-tick perception makes the effect
          // dependent on the recent-event window and can permanently drop it
          // when many events are dispatched after the encounter.
          const safeTarget = typeof effect.target === 'string' ? effect.target : null;
          if (safeTarget && this.agents.has(safeTarget)) {
            const emotionChanges = {};
            for (const [dimension, value] of Object.entries(effect.delta)) {
              if (Number.isFinite(value)) emotionChanges[dimension] = value;
            }
            if (Object.keys(emotionChanges).length > 0) {
              deltas.push(new EmotionDelta(safeTarget, emotionChanges));
            }
            effect._committedByEncounterEffects = true;
          }
        } else if (effect.type === 'memory' && effect.delta) {
          const d = effect.delta;
          if (d.kind === 'candidate') {
            const safeTarget = typeof effect.target === 'string' ? effect.target : 'unknown';
            const safeImportance = Number.isFinite(d.importance) ? d.importance : 0.5;
            deltas.push(new MemoryDelta(safeTarget, {
              kind: d.kind,
              type: d.memoryType || 'gossip',
              content: d.content || '',
              category: d.category,
              importance: safeImportance,
            }));
          }
        }
      }
    }

    if (deltas.length > 0) {
      const encResult = this.effectCommitter.commit({ deltas });
      if (encResult.errors && encResult.errors.length > 0) {
        for (const { error } of encResult.errors) {
          diagnostics.warn(`Encounter effect error: ${error.message}`);
        }
      }
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
        // R41 L4 fix: use Number.isFinite instead of || 0.
        // || 0 correctly turns NaN/undefined into 0, but a non-numeric
        // string (e.g. "abc") passes through → "abc" * 0.6 → NaN.
        const moodVal = Number.isFinite(agent.emotion.mood[dim]) ? agent.emotion.mood[dim] : 0;
        const curVal = Number.isFinite(agent.emotion.current[dim]) ? agent.emotion.current[dim] : 0;
        blended[dim] = moodVal * 0.6 + curVal * 0.4;
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
      const weight = rel && Number.isFinite(rel.strength) ? rel.strength : 0.1;
      const blendedEmotion = emotionBlendCache.get(neighborId);
      if (!blendedEmotion) continue;
      inputs[neighborId] = {
        emotion: blendedEmotion,
        weight,
        // R20 M4: null guard for _behavior — a corrupted agent with undefined
        // _behavior would throw TypeError here, cascading to skip all neighbors
        // in the same region (not just the corrupted one).
        expressiveness: neighbor._behavior?.expressiveness ?? 0.2,
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

  /**
   * 移除 tick 回调
   * @param {Function} callback - 之前通过 onTick 注册的回调
   */
  offTick(callback) {
    const idx = this._tickCallbacks.indexOf(callback);
    if (idx !== -1) {
      this._tickCallbacks.splice(idx, 1);
    }
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
      // R11: deep-copy environment to prevent shared Date reference mutation
      environment: {
        ...this.environment,
        weatherChangedAt: this.environment.weatherChangedAt instanceof Date
          ? new Date(this.environment.weatherChangedAt.getTime())
          : this.environment.weatherChangedAt,
      },
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
      // R10: explicitly convert Date to ISO string to prevent shallow-copy
      // reference sharing of the live Date object with the serialization output.
      environment: {
        ...this.environment,
        weatherChangedAt: this.environment.weatherChangedAt instanceof Date
          ? this.environment.weatherChangedAt.toISOString()
          : this.environment.weatherChangedAt,
      },
      domain: this.domain ? this.domain.domain : null,
      agents: Object.fromEntries(
        [...this.agents.entries()].map(([id, agent]) => [id, agent.toJSON()])
      ),
      socialGraph: this.socialGraph.toJSON(),
      events: this.eventDispatcher.toJSON(),
      // R20 M16: persist RegionGrid occupancy. Without this, restoring AndyWorld
      // (bypassing AndyEngine) produces region-less agents invisible to the
      // interaction pipeline. AndyEngine.fromJSON restores agents then calls
      // addAgent() which re-places them, but direct AndyWorld restore skips that.
      regions: this.regions.snapshot(),
    };
    // SER-1 fix: persist SpatialEngine continuous state (typed arrays).
    // 仅在 continuous 模式（this.spatial 非 null）下发射；默认离散模式不发射，
    // 保证默认 campus toJSON 输出不变、golden fixture 不受影响。
    if (this.spatial) {
      const spatialSnapshot = this.spatial.snapshot();
      if (spatialSnapshot) data.spatial = spatialSnapshot;
    }
    if (this.rng) {
      data.rngState = this.rng.getState();
    }
    let safeRestoreConfig;
    try {
      safeRestoreConfig = JSON.parse(JSON.stringify({ ...this._restoreConfig, enableFacts: this.runtimeConfig.enableFacts }));
    } catch {
      safeRestoreConfig = { enableFacts: this.runtimeConfig.enableFacts };
    }
    data._restoreConfig = safeRestoreConfig;
    if (this.factStore) {
      data.factStore = this.factStore.toJSON();
    }
    if (this.knowledgeStore) {
      data.knowledgeStore = this.knowledgeStore.toJSON();
    }
    // R41 B1 fix: persist canonEventPipeline state so _eventCounter survives
    // save/restore, preventing event ID collisions after deserialization.
    if (this.canonEventPipeline) {
      data.canonEventPipeline = this.canonEventPipeline.toJSON();
    }
    // R41 B2 fix: persist factEmitter state so _emittedStatic survives
    // save/restore, preventing duplicate static fact emission.
    if (this.factEmitter) {
      data.factEmitter = this.factEmitter.toJSON();
    }
    // R9 fix: serialize _scheduledEvents to prevent data loss on save/restore.
    // Without this, any pending scheduled events are permanently dropped.
    if (this._scheduledEvents.length > 0) {
      data.scheduledEvents = this._scheduledEvents.map(e => ({
        ...e,
        scheduledFor: e.scheduledFor instanceof Date ? e.scheduledFor.toISOString() : e.scheduledFor,
      }));
    }
    return data;
  }

  /** @private R41 B1: restore CanonEventPipeline state from serialized data */
  _restorePipeline(saved) {
    const pipeline = new CanonEventPipeline(this.factStore, this.knowledgeStore, this.factEmitter);
    pipeline.fromJSON(saved);
    return pipeline;
  }

  /** @private R41 B2: restore FactEmitter state from serialized data */
  _restoreFactEmitter(saved) {
    const emitter = new FactEmitter(this.factStore, { knowledgeStore: this.knowledgeStore });
    emitter.fromJSON(saved);
    return emitter;
  }
}

module.exports = AndyWorld;
