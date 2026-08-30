/**
 * Character — 高层角色 API
 *
 * 隐藏引擎内部复杂度，提供简洁的角色交互接口。
 *
 * @example
 *   const { Character } = require('./sdk');
 *
 *   const maya = new Character({
 *     name: 'Maya',
 *     personality: 'INFP',
 *     backstory: ['一个安静的阅览处管理员', '喜欢看星星'],
 *     llm: { provider: 'openai', apiKey: 'sk-...' },
 *   });
 *
 *   // 一键对话
 *   const reply = await maya.chat('我今天好累');
 *
 *   // 获取角色内心状态（用于自定义 prompt）
 *   const context = maya.getContext();
 *
 *   // 保存/恢复
 *   const state = maya.save();
 *   const restored = Character.load(state);
 */

const AndyEngine = require('./AndyEngine');
const NarrativeBuilder = require('./NarrativeBuilder');
const LLMAdapter = require('./LLMAdapter');
const AutoTick = require('./AutoTick');
const ConversationLog = require('./ConversationLog');
const { classifyGroundedQuestion, classifyThirdPartyQuestion } = require('./ConversationQuestion');
const { diagnostics } = require('../shared/Diagnostics');
const { DEFAULT_DOMAIN_ID } = require('../config/defaults');

// Keep the Host-side assertion shape local to the SDK boundary. The checker
// treats it as opaque data and independently verifies it against allowed
// observation facts; SDK must not import narrative internals.
function observationAssertion(targetId, action, context = '') {
  return JSON.stringify([String(targetId || ''), String(action || ''), String(context || '')]);
}

function renderThirdPartyTemplate(template, values) {
  if (typeof template !== 'string' || template.length === 0) return null;
  const rendered = template.replace(/\{(target|action|location|event)\}/g, (_, key) => values[key] || '');
  return rendered.length > 0 && !/\{[^}]+\}/.test(rendered) ? rendered : null;
}

function thirdPartyFactTimestamp(fact) {
  const value = fact?.timestamp instanceof Date ? fact.timestamp.getTime() : new Date(fact?.timestamp || 0).getTime();
  return Number.isFinite(value) ? value : 0;
}

function hasExplicitKnowledge(fact, agentId, targetId) {
  const source = fact?._evidence?.source;
  const knownSource = source === 'direct' || source === 'observed' || source === 'told';
  const selfInvolved = fact?.participants?.includes(agentId) || fact?.observers?.includes(agentId);
  const targetInvolved = fact?.participants?.includes(targetId) || fact?.observers?.includes(targetId);
  return targetInvolved && (selfInvolved || knownSource);
}

/**
 * Answer only third-party questions whose proof is already in the speaker's
 * allowed grounding. No engine/world handles are consulted here.
 * @returns {string|null} null means this is not a third-party question
 */
function createThirdPartyKnowledgeReply(engine, agentId, userMessage, grounding) {
  const agentNames = grounding?.metadata?.agentNames || {};
  const question = classifyThirdPartyQuestion(userMessage, agentNames, agentId);
  if (!question) return null;

  const templates = engine?.domain?.narrativeTemplates?.thirdPartyKnowledge || {};
  const targetName = question.targetName || '';
  const values = { target: targetName };
  const unknown = targetName
    ? (renderThirdPartyTemplate(templates.unknown, values) || '我不知道。')
    : '我不知道。';

  // Forbidden third-party inner state, memory, and intention questions never
  // inspect facts. They immediately take the epistemic-unknown path.
  if (question.dimension === 'forbidden' || !question.targetId || !grounding) return unknown;

  const allowedFacts = grounding.allowedFacts || [];
  const observations = allowedFacts
    .filter((fact) =>
      fact && fact.type === 'observation' && fact.id &&
      fact.observerId === agentId && fact.targetId === question.targetId && fact.action
    )
    .sort((a, b) => thirdPartyFactTimestamp(b) - thirdPartyFactTimestamp(a));
  const observation = observations[0];

  if (observation && (question.dimension === 'recent' || question.dimension === 'location')) {
    const template = question.dimension === 'location' ? templates.location : templates.observation;
    const text = question.dimension === 'location' && observation.context
      ? renderThirdPartyTemplate(template, { target: targetName, location: observation.context })
      : question.dimension === 'recent'
        ? renderThirdPartyTemplate(template, { target: targetName, action: observation.action })
        : null;
    if (text) {
      const structuredClaims = [{
        type: 'event',
        subject: agentId,
        predicate: 'observed',
        object: observationAssertion(observation.targetId, observation.action, observation.context),
        span: text,
        confidence: 1,
      }];
      const checked = engine.checkConsistency(text, agentId, { structuredClaims });
      const bound = (checked.evidenceTrace || []).some((trace) => trace.factId);
      if (checked.valid && bound) return text;
    }
  }

  const event = allowedFacts
    .filter((fact) =>
      fact && fact.type === 'event' && fact.id && fact.description &&
      hasExplicitKnowledge(fact, agentId, question.targetId)
    )
    .sort((a, b) => thirdPartyFactTimestamp(b) - thirdPartyFactTimestamp(a))[0];
  if (event && question.dimension === 'recent') {
    const text = renderThirdPartyTemplate(templates.event, { target: targetName, event: event.description });
    if (text) {
      const structuredClaims = [{
        type: 'event',
        subject: agentId,
        predicate: 'refers_to',
        object: event.description,
        span: text,
        confidence: 1,
      }];
      const checked = engine.checkConsistency(text, agentId, { structuredClaims });
      const bound = (checked.evidenceTrace || []).some((trace) => trace.factId);
      if (checked.valid && bound) return text;
    }
  }

  return unknown;
}

/**
 * Build a minimal fact-backed delivery fallback using only the Engine's public
 * grounding and consistency APIs. If it cannot be verified, callers retain
 * the established silent fallback instead of exposing unverified text.
 *
 * @param {Object} engine
 * @param {string} agentId
 * @param {string} [userMessage]
 * @returns {string|null}
 */
function createVerifiedGroundingFallback(engine, agentId, userMessage = '') {
  if (!engine || typeof engine.getGroundingPackage !== 'function' || typeof engine.checkConsistency !== 'function') {
    return null;
  }

  try {
    const grounding = engine.getGroundingPackage(agentId);
    const stateFact = (grounding?.allowedFacts || []).find((fact) =>
      fact &&
      fact.type === 'agent_state' &&
      fact.agentId === agentId
    );

    const location = stateFact?.position || stateFact?.region || null;
    const state = stateFact?.state || null;
    const emotion = NarrativeBuilder.formatEmotionSummary(stateFact?.emotionSummary);
    const intent = classifyGroundedQuestion(userMessage);
    const agentNames = grounding?.metadata?.agentNames || {};
    const observationFact = (grounding?.allowedFacts || []).find((fact) =>
      fact && fact.type === 'observation' && fact.observerId === agentId &&
      fact.targetId && fact.action && agentNames[fact.targetId]
    );
    // R8.4: prefer a specific EVENT fact for the recent_event fallback rather
    // than the first (which is often a generic stranger-encounter template
    // like "在附近注意到有人"). A specific event carries real information
    // (e.g. "今天的麦酒特别好喝") and yields a non-generic, informative reply.
    // The generic templates are read from the domain config
    // (socialInteractions.strangerNotice / strangerBrief), keeping this
    // domain-driven rather than hardcoding world words in the SDK. Among the
    // remaining (non-generic) events, prefer the longest description; fall
    // back to the first event fact only when all are generic.
    const domain = engine?.domain;
    const socialInteractions = domain?.socialInteractions || {};
    const genericTemplates = new Set([
      socialInteractions.strangerNotice,
      socialInteractions.strangerBrief,
    ].filter(Boolean));
    const eventFacts = (grounding?.allowedFacts || []).filter((fact) =>
      fact && fact.type === 'event' && fact.description
    );
    let eventFact = null;
    if (eventFacts.length > 0) {
      const specific = eventFacts.filter((f) => !genericTemplates.has(f.description));
      const pool = specific.length > 0 ? specific : eventFacts;
      eventFact = pool.reduce((best, cur) =>
        (cur.description.length > (best ? best.description.length : 0)) ? cur : best, null);
    }

    // Build richer fact-bound candidates (priority order). Each uses ONLY fact
    // field values — no invention. Every candidate is verified by
    // checkConsistency before return; never return an unverified candidate.
    const locationLine = location ? { text: `我在${location}。`, structuredClaims: [{ type: 'location', subject: agentId, predicate: 'is_at', object: location, confidence: 1 }] } : null;
    const activityLine = state ? { text: `我目前处于${state}状态。`, structuredClaims: [{ type: 'state', subject: agentId, predicate: 'activity', object: state, confidence: 1 }] } : null;
    const emotionLine = emotion ? { text: `我感觉${emotion}。`, structuredClaims: [{ type: 'state', subject: agentId, predicate: 'feels', object: emotion, confidence: 1 }] } : null;
    const observationText = observationFact
      ? `我观察到${agentNames[observationFact.targetId]}${observationFact.action}${observationFact.context ? `，当时在${observationFact.context}` : ''}。`
      : null;
    const observationLine = observationFact ? {
      text: observationText,
      structuredClaims: [{
        type: 'event', subject: agentId, predicate: 'observed',
        object: observationAssertion(observationFact.targetId, observationFact.action, observationFact.context),
        // A full span lets the precise sidecar replace every overlapping
        // legacy regex extraction (including the optional context clause).
        span: observationText, confidence: 1,
      }],
    } : null;
    const eventText = eventFact ? `我知道${eventFact.description}。` : null;
    const eventLine = eventFact ? {
      text: eventText,
      structuredClaims: [{ type: 'event', subject: agentId, predicate: 'refers_to', object: eventFact.description, span: eventText, confidence: 1 }],
    } : null;
    // R8.5: relationship fallback references an EXISTING public RELATIONSHIP fact
    // via predicate 'is_relation' (a reference, not a creation claim). The fact
    // must involve this agent; the other party is named via agentNames.
    const relationshipFact = (grounding?.allowedFacts || []).find((fact) =>
      fact && fact.type === 'relationship' &&
      (fact.agentA === agentId || fact.agentB === agentId) &&
      fact.relationType
    );
    let relationshipLine = null;
    if (relationshipFact) {
      const otherId = relationshipFact.agentA === agentId
        ? relationshipFact.agentB
        : relationshipFact.agentA;
      const otherName = agentNames[otherId];
      if (otherName) {
        const relationshipText = `我和${otherName}的关系是${relationshipFact.relationType}。`;
        relationshipLine = {
          text: relationshipText,
          structuredClaims: [{
            type: 'relationship', subject: agentId, predicate: 'is_relation',
            object: { kind: 'agent', id: otherId, raw: otherName },
            relationType: relationshipFact.relationType,
            span: relationshipText, confidence: 1,
          }],
        };
      }
    }
    // R8.6: memory fallback references an EXISTING LOCAL MEMORY fact owned by
    // this agent via predicate 'remembers' (a reference, not a creation). The
    // fact's content is the agent's own memory. Prefer a specific (non-generic)
    // memory, excluding generic stranger-encounter templates read from domain.
    const genericMemoryTemplates = new Set([
      socialInteractions.strangerNotice,
      socialInteractions.strangerBrief,
    ].filter(Boolean));
    const memoryFacts = (grounding?.allowedFacts || []).filter((fact) =>
      fact && fact.type === 'memory' && fact.agentId === agentId && fact.content
    );
    let memoryFact = null;
    if (memoryFacts.length > 0) {
      const specific = memoryFacts.filter((f) => !genericMemoryTemplates.has(f.content));
      const pool = specific.length > 0 ? specific : memoryFacts;
      memoryFact = pool.reduce((best, cur) =>
        (cur.content.length > (best ? best.content.length : 0)) ? cur : best, null);
    }
    const memoryText = memoryFact ? `我记得${memoryFact.content}。` : null;
    const memoryLine = memoryFact ? {
      text: memoryText,
      structuredClaims: [{ type: 'memory', subject: agentId, predicate: 'remembers', object: memoryFact.content, span: memoryText, confidence: 1 }],
    } : null;
    // R8.7: future intention fallback references an EXISTING LOCAL INTENTION
    // fact owned by this agent via predicate 'plans_to' (a reference, not a
    // creation). The fact's intent is the agent's next scheduled activity
    // (domain-driven). Include the region if present for informativeness.
    const intentionFact = (grounding?.allowedFacts || []).find((fact) =>
      fact && fact.type === 'intention' && fact.agentId === agentId && fact.intent
    );
    let intentionLine = null;
    if (intentionFact) {
      const intentionText = intentionFact.region
        ? `我接下来打算去${intentionFact.region}${intentionFact.intent}。`
        : `我接下来打算${intentionFact.intent}。`;
      intentionLine = {
        text: intentionText,
        structuredClaims: [{
          type: 'intention', subject: agentId, predicate: 'plans_to',
          object: intentionFact.intent, span: intentionText, confidence: 1,
        }],
      };
    }
    const candidates = intent === 'emotion'
      ? [emotionLine, activityLine, locationLine]
      : intent === 'activity'
        ? [activityLine, locationLine, emotionLine]
        : intent === 'location'
          ? [locationLine, activityLine, emotionLine]
          : intent === 'observation'
            ? [observationLine, eventLine, locationLine, activityLine, emotionLine]
            : intent === 'recent_event'
              ? [eventLine, observationLine, locationLine, activityLine, emotionLine]
            : intent === 'relationship'
              ? [relationshipLine, observationLine, eventLine, locationLine, activityLine, emotionLine]
            : intent === 'memory'
              ? [memoryLine, relationshipLine, observationLine, eventLine, locationLine, activityLine, emotionLine]
            : intent === 'future_intention'
              ? [intentionLine, memoryLine, relationshipLine, observationLine, eventLine, locationLine, activityLine, emotionLine]
          : [locationLine, activityLine, emotionLine];

    for (const candidate of candidates.filter(Boolean)) {
      if (engine.checkConsistency(candidate.text, agentId, { structuredClaims: candidate.structuredClaims }).valid) {
        return candidate.text;
      }
    }
    return null;
  } catch (error) {
    diagnostics.warn(`Grounded delivery fallback error: ${error.message}`);
    diagnostics.collect({ type: 'grounded_delivery_fallback_error', error: error.message });
    return null;
  }
}

function safeReplyOrSilence(engine, agentId, name, userMessage) {
  return createVerifiedGroundingFallback(engine, agentId, userMessage) || `[${name}沉默了一会儿]`;
}

function createDeterministicReply(engine, agentId, userMessage, grounding) {
  const thirdPartyReply = createThirdPartyKnowledgeReply(
    engine,
    agentId,
    userMessage,
    grounding
  );
  if (thirdPartyReply) return thirdPartyReply;

  if (classifyGroundedQuestion(userMessage)) {
    return createVerifiedGroundingFallback(engine, agentId, userMessage);
  }
  return null;
}

/**
 * For a few factual questions, a checker-valid reply still is not useful if
 * it ignores the requested dimension. This is a delivery check, not another
 * truth checker: it only asks whether the reply contains the canonical state
 * value that answers the user's direct question.
 */
function hasRequestedFactAnchor(reply, userMessage, groundingPackage, agentId) {
  if (!groundingPackage || typeof reply !== 'string' || typeof userMessage !== 'string') return true;
  const intent = classifyGroundedQuestion(userMessage);
  if (intent === 'observation') {
    const observation = (groundingPackage.allowedFacts || []).find(fact =>
      fact && fact.type === 'observation' && fact.observerId === agentId && fact.targetId && fact.action
    );
    return !observation || reply.includes(observation.action);
  }
  if (intent === 'recent_event') {
    const event = (groundingPackage.allowedFacts || []).find(fact => fact && fact.type === 'event' && fact.description);
    if (event) return reply.includes(event.description);
    const observation = (groundingPackage.allowedFacts || []).find(fact =>
      fact && fact.type === 'observation' && fact.observerId === agentId && fact.action
    );
    return !observation || reply.includes(observation.action);
  }
  if (intent === 'relationship') {
    // R8.5: the canonical relationship answer names the other party and the
    // relationType from an existing RELATIONSHIP fact. If no relationship fact
    // involves this agent, no anchor is required.
    const rel = (groundingPackage.allowedFacts || []).find(fact =>
      fact && fact.type === 'relationship' &&
      (fact.agentA === agentId || fact.agentB === agentId) && fact.relationType
    );
    if (!rel) return true;
    return reply.includes(rel.relationType);
  }
  if (intent === 'memory') {
    // R8.6: the canonical memory answer references the agent's own MEMORY fact
    // content. If no memory fact exists for this agent, no anchor is required.
    const mem = (groundingPackage.allowedFacts || []).find(fact =>
      fact && fact.type === 'memory' && fact.agentId === agentId && fact.content
    );
    if (!mem) return true;
    return reply.includes(mem.content);
  }
  if (intent === 'future_intention') {
    // R8.7: the canonical intention answer references the agent's own INTENTION
    // fact intent. If no intention fact exists for this agent, no anchor is required.
    const int = (groundingPackage.allowedFacts || []).find(fact =>
      fact && fact.type === 'intention' && fact.agentId === agentId && fact.intent
    );
    if (!int) return true;
    return reply.includes(int.intent);
  }
  const stateFact = (groundingPackage.allowedFacts || []).find(fact =>
    fact && fact.type === 'agent_state' && fact.agentId === agentId
  );
  if (!stateFact) return true;

  if (intent === 'emotion') {
    const emotion = NarrativeBuilder.formatEmotionSummary(stateFact.emotionSummary);
    return !emotion || reply.includes(emotion);
  }
  if (intent === 'activity') {
    return !stateFact.state || reply.includes(stateFact.state);
  }
  if (intent === 'location') {
    const location = stateFact.position || stateFact.region;
    return !location || reply.includes(location);
  }
  return true;
}

class Character {
  /**
   * @param {Object} config
   * @param {string} config.name - 角色名
   * @param {string} [config.id] - 角色 ID（默认自动生成）
   * @param {string} [config.personality] - MBTI 类型，如 'INFP'
   * @param {Object} [config.ocean] - 直接指定大五人格
   * @param {string[]} [config.backstory] - 背景故事
   * @param {string|Object} [config.schedule] - 日程预设或配置
   * @param {string} [config.initialPosition] - 初始位置
   * @param {Object|string|Function} [config.llm] - LLM 配置
   * @param {string} [config.scenario] - 场景描述
   * @param {Object} [config.engine] - 共享的 AndyEngine 实例（多角色场景）
   */
  constructor(config = {}) {
    if (typeof config !== 'object' || config === null) {
      throw new Error('Character: config 必须是一个对象。用法: new Character({ name: "Maya", personality: "INFP", llm: ... })');
    }
    if (!config.name && !config.id) {
      throw new Error('Character: 至少需要 name 或 id。用法: new Character({ name: "Maya", llm: ... })');
    }

    // Deterministic ID generation using counter-based approach
    const { generateId } = require('../shared/ids');
    this.id = config.id || generateId('char');
    this.name = config.name || '角色';
    this.backstory = config.backstory || [];
    this.scenario = config.scenario || '';

    // 创建或复用引擎
    if (config.engine) {
      this._engine = config.engine;
      this._ownsEngine = false;
    } else {
      this._engine = new AndyEngine({
        startTime: config.startTime || new Date(0), // epoch sentinel: deterministic fallback
        weather: config.weather || 'sunny',
        domain: config.domain,
        seed: config.seed,
        rng: config.rng,
        enableFacts: config.enableFacts,
      });
      this._ownsEngine = true;
    }

    // 创建角色
    // schedule 策略：如果未传，根据 engine domain 决定默认值
    // - campus domain: 默认 'student'
    // - 其他 domain: 使用 domain 的 roleArchetypes 或空 schedule
    let scheduleConfig = config.schedule;
    if (scheduleConfig === undefined) {
      const domain = this._engine.domain;
      if (domain.id === DEFAULT_DOMAIN_ID) {
        scheduleConfig = 'student';
      } else {
        // 尝试从 domain 的 roleArchetypes 取第一个，否则空 schedule
        const archetypes = Object.keys(domain.roleArchetypes || {});
        scheduleConfig = archetypes.length > 0 ? archetypes[0] : {};
      }
    }

    // Check for duplicate agent ID in shared engine mode
    if (this._engine.world.getAgent(this.id)) {
      throw new Error(`Character ID "${this.id}" already exists in engine`);
    }

    this._agent = this._engine.createCharacter({
      id: this.id,
      name: this.name,
      mbti: config.personality,
      personality: config.ocean ? { ocean: config.ocean } : undefined,
      background: this.backstory,
      schedule: scheduleConfig,
      initialPosition: config.initialPosition || undefined,
    });

    // LLM 适配器
    this._llm = new LLMAdapter(config.llm || {});

    // 自动 tick
    this._autoTick = new AutoTick(config.autoTick || {});

    // 对话历史
    this._conversation = new ConversationLog({
      characterName: this.name,
      maxMessages: config.maxMessages || 50,
    });

    // 首次 tick（初始化状态）— only for owned (non-shared) engines.
    // R9 fix: shared engines are ticked by their owner; auto-ticking here
    // advances the shared world by one tick per character creation, causing
    // time jumps and inconsistent state in multi-character setups.
    if (this._ownsEngine) {
      this._engine.tick();
    }
  }

  // ═══════════════════════════════════════════
  // 核心 API
  // ═══════════════════════════════════════════

  /**
   * 与角色对话
   *
   * 自动处理：
   *   1. 时间推进（根据距离上次消息的时间）
   *   2. 构建 system prompt（从角色状态）
   *   3. 调用 LLM
   *   4. 更新对话历史
   *   5. 角色记忆更新（对话内容被记住）
   *
   * @param {string} message - 用户消息
   * @param {Object} [options]
   * @param {Object} [options.llm] - 临时覆盖 LLM 配置
   * @param {number} [options.relationship] - 与角色的关系强度 0-100
   * @param {Object} [options.structuredClaims] - 结构化 claim sidecar（M2-R3 透传管道）
   * @returns {Promise<string>} 角色回复
   */
  async chat(message, options = {}) {
    options = options ?? {};
    if (typeof message !== 'string' || message.trim().length === 0) {
      return `[${this.name}沉默了一会儿]`;
    }

    // 1. 自动推进时间
    try {
      this._autoTick.advance(this._engine, this._engine.world.time.getTime());
    } catch (e) {
      diagnostics.warn(`AutoTick advance error: ${e.message}`);
      diagnostics.collect({ type: 'auto_tick_error', error: e.message });
    }

    // 2. 记录用户消息
    this._conversation.addUserMessage(message);

    // 3. 构建 system prompt
    const worldContext = this._engine.getWorldContext(this.id);
    const groundingPackage = this._engine.getGroundingPackage
      ? this._engine.getGroundingPackage(this.id, {
          time: this._engine.world.time,
          topic: message,
        })
      : null;

    const deterministicReply = createDeterministicReply(
      this._engine,
      this.id,
      message,
      groundingPackage
    );
    if (deterministicReply) {
      this._conversation.addAssistantMessage(deterministicReply);
      this._recordConversation(message, deterministicReply);
      return deterministicReply;
    }

    const systemPrompt = NarrativeBuilder.buildSystemPrompt(worldContext, {
      characterName: this.name,
      backstory: this.backstory,
      scenario: this.scenario,
      conversationHistory: this._conversation.getSummary(),
      domain: this._engine.domain,
      groundingPackage,
      userMessage: message,
    });

    // 4. 构建 messages
    const messages = [
      { role: 'system', content: systemPrompt },
      ...this._conversation.toMessages(),
    ];

    // 5. 调用 LLM
    let reply;
    try {
      const llm = options.llm ? new LLMAdapter(options.llm) : this._llm;
      reply = await llm.chat(messages);
    } catch (e) {
      throw new Error(`Character.chat() LLM 调用失败: ${e.message}`);
    }
    if (!reply || reply.trim().length === 0) {
      const fallback = `[${this.name}沉默了一会儿]`;
      this._conversation.addAssistantMessage(fallback);
      this._recordConversation(message, fallback);
      return fallback;
    }

    // 5.5 一致性校验（如果启用事实系统）
    if (this._engine.checkConsistency) {
      const consistencyOpts = options?.structuredClaims != null ? { structuredClaims: options.structuredClaims } : {};
      const consistency = this._engine.checkConsistency(reply, this.id, consistencyOpts);
      if (!consistency.valid || !hasRequestedFactAnchor(reply, message, groundingPackage, this.id)) {
        // Invalid text must never leave this API. Prefer a separately verified,
        // fact-backed delivery fallback; retain silence when none is available.
        reply = safeReplyOrSilence(this._engine, this.id, this.name, message);
      }
    }

    // 6. 记录角色回复
    this._conversation.addAssistantMessage(reply);

    // 7. 更新角色记忆（把这次对话记为经历）
    this._recordConversation(message, reply);

    return reply;
  }

  /**
   * 获取角色当前状态（用于自定义 LLM 集成）
   *
   * @param {Object} [options]
   * @param {string} [options.userText] - 用户消息（用于共情反应）
   * @returns {Object} { systemPrompt, narrative, worldContext, emotion, needs }
   */

  /**
   * 流式对话。
   *
   * **契约说明（DEEP_AUDIT_2026-08-13）**：尽管方法名与签名是 async generator，
   * 当前实现采用 *verified buffered reply* 语义——它会先完整消费底层 LLM 流、
   * 缓存全部回复，经一致性校验/grounding 锚点核验后，再 **一次性 yield** 校验
   * 通过的内容。这与"逐 token 实时显示"不同：安全性高（拒答/幻觉内容不会先暴露
   * 再撤回），但首 token 延迟等于整段生成时间。若需要真正的 token 级流式，请
   * 直接使用 `LLMAdapter.chatStream()`（不带 grounding 校验）。
   *
   * @param {string} message - 用户消息
   * @param {Object} [options]
   * @param {Object} [options.llm] - 临时覆盖 LLM 配置
   * @param {Object} [options.structuredClaims] - 结构化 claim sidecar（M2-R3 透传管道）
   * @returns {AsyncGenerator<string>} 校验后产出（当前为单次 yield 整段回复）
   *
   * @example
   *   for await (const token of maya.chatStream("你好")) {
   *     process.stdout.write(token);
   *   }
   */
  async *chatStream(message, options = {}) {
    options = options ?? {};
    if (typeof message !== 'string' || message.trim().length === 0) {
      yield `[${this.name}沉默了一会儿]`;
      return;
    }
    try {
      this._autoTick.advance(this._engine, this._engine.world.time.getTime());
    } catch (e) {
      diagnostics.warn(`AutoTick advance error: ${e.message}`);
      diagnostics.collect({ type: 'auto_tick_error', error: e.message });
    }
    this._conversation.addUserMessage(message);

    const worldContext = this._engine.getWorldContext(this.id);
    const groundingPackage = this._engine.getGroundingPackage
      ? this._engine.getGroundingPackage(this.id, {
          time: this._engine.world.time,
          topic: message,
        })
      : null;
    const deterministicReply = createDeterministicReply(
      this._engine,
      this.id,
      message,
      groundingPackage
    );
    if (deterministicReply) {
      this._conversation.addAssistantMessage(deterministicReply);
      this._recordConversation(message, deterministicReply);
      yield deterministicReply;
      return;
    }
    const systemPrompt = NarrativeBuilder.buildSystemPrompt(worldContext, {
      characterName: this.name,
      backstory: this.backstory,
      scenario: this.scenario,
      conversationHistory: this._conversation.getSummary(),
      domain: this._engine.domain,
      groundingPackage,
      userMessage: message,
    });

    const messages = [
      { role: "system", content: systemPrompt },
      ...this._conversation.toMessages(),
    ];

    const llm = options.llm ? new LLMAdapter(options.llm) : this._llm;

    // R19: Buffer the full reply first, then check consistency before yielding.
    // This prevents rejected/hallucinated content from reaching the user.
    let fullReply = "";
    for await (const token of llm.chatStream(messages)) {
      fullReply += token;
    }

    // R22 P1 fix: maintain conversation symmetry when LLM returns empty reply.
    // Previously, empty reply was returned directly without recording assistant
    // message, creating asymmetric conversation history (user message recorded
    // but no assistant response). Now matches chat() behavior which returns "..."
    // for empty replies and records both sides.
    if (fullReply.trim().length === 0) {
      const fallback = `[${this.name}沉默了一会儿]`;
      this._conversation.addAssistantMessage(fallback);
      this._recordConversation(message, fallback);
      yield fallback;
      return;
    }

    // Apply consistency check before yielding any content
    let outputReply = fullReply;
    if (this._engine.checkConsistency) {
      const consistencyOpts = options?.structuredClaims != null ? { structuredClaims: options.structuredClaims } : {};
      const consistency = this._engine.checkConsistency(fullReply, this.id, consistencyOpts);
      if (!consistency.valid || !hasRequestedFactAnchor(fullReply, message, groundingPackage, this.id)) {
        // Buffering plus this fallback ensures invalid streamed text is never
        // exposed before a separately verified grounded alternative.
        outputReply = safeReplyOrSilence(this._engine, this.id, this.name, message);
      }
    }

    this._conversation.addAssistantMessage(outputReply);
    this._recordConversation(message, outputReply);
    // Only now yield the verified (or corrected) content
    yield outputReply;
  }
  getContext(options = {}) {
    options = options ?? {};
    const worldContext = this._engine.getWorldContext(this.id);
    const narrative = this._engine.getNarrative(this.id, options);
    const groundingPackage = this._engine.getGroundingPackage
      ? this._engine.getGroundingPackage(this.id, {
          time: this._engine.world.time,
          topic: options.userText,
        })
      : null;

    return {
      systemPrompt: NarrativeBuilder.buildSystemPrompt(worldContext, {
        characterName: this.name,
        backstory: this.backstory,
        scenario: this.scenario,
        conversationHistory: this._conversation.getSummary(),
        domain: this._engine.domain,
        groundingPackage,
        userMessage: options.userText,
      }),
      narrative,
      worldContext,
      groundingPackage,
      conversationHistory: this._conversation.toMessages(),
    };
  }

  /**
   * 获取角色的对话历史
   */
  getConversation() {
    return this._conversation;
  }

  // ═══════════════════════════════════════════
  // 状态管理
  // ═══════════════════════════════════════════

  /**
   * 保存角色完整状态
   * @returns {Object} 可序列化的状态对象
   */
  save() {
    if (!this._engine) {
      throw new Error('Character.save(): 引擎未初始化，无法保存');
    }
    return {
      version: 1,
      id: this.id,
      name: this.name,
      domainRef: this._engine.domain ? this._engine.domain.id : DEFAULT_DOMAIN_ID,
      backstory: this.backstory,
      scenario: this.scenario,
      engineState: this._engine.toJSON(),
      conversation: this._conversation.toJSON(),
      autoTick: this._autoTick.toJSON(),
    };
  }

  /**
   * 从保存的状态恢复角色
   * @param {Object} state - save() 返回的状态对象
   * @param {Object} [options] - 配置选项（可以为 llmConfig 或包含 domain/llm 的 options）
   * @returns {Character}
   */
  static load(state, options = {}) {
    options = options ?? {};
    if (!state || typeof state !== 'object') {
      throw new Error('Character.load(): state 必须是 save() 返回的对象');
    }
    if (!state.engineState) {
      throw new Error('Character.load(): state 缺少 engineState，是否用 save() 生成的？');
    }

    let domainConfig;
    let llmConfig;

    if (typeof options === 'function') {
      llmConfig = options;
    } else if (options && typeof options === 'object') {
      if ('domain' in options || 'llm' in options) {
        domainConfig = options.domain;
        llmConfig = options.llm;
      } else {
        llmConfig = options;
      }
    }

    const domainRef = state.domainRef || DEFAULT_DOMAIN_ID;
    if (domainRef !== DEFAULT_DOMAIN_ID) {
      if (!domainConfig) {
        throw new Error(`非 ${DEFAULT_DOMAIN_ID} domain "${domainRef}" 必须在 load 时传入对应的 domain 配置`);
      }
      if (domainConfig.id !== domainRef) {
        throw new Error(`domain 不匹配：期望 "${domainRef}"，但传入了 "${domainConfig.id}"`);
      }
    }

    // 不走构造函数——构造函数会 createCharacter()（覆盖已恢复的 Agent）+ tick()（推进时间）
    // 手动组装实例，保留引擎中已恢复的 Agent 完整状态（情绪/记忆/关系/需求）
    const engine = AndyEngine.fromJSON(state.engineState, { domain: domainConfig });

    const character = Object.create(Character.prototype);
    character.id = state.id;
    character.name = state.name;
    character.backstory = state.backstory || [];
    character.scenario = state.scenario || '';
    character._engine = engine;
    character._ownsEngine = true;
    character._agent = engine.getAgent(state.id);
    // R9 fix: guard against missing agent (corrupt save / domain mismatch)
    if (!character._agent) {
      throw new Error(`Character.load(): agent "${state.id}" not found in restored engine. The save data may be corrupted or the domain configuration may have changed.`);
    }
    character._llm = new LLMAdapter(llmConfig || {});
    character._autoTick = AutoTick.fromJSON(state.autoTick || {});
    character._conversation = ConversationLog.fromJSON(state.conversation);
    return character;
  }

  // ═══════════════════════════════════════════
  // 内部方法
  // ═══════════════════════════════════════════

  /**
   * 将对话内容记录为角色记忆
   * @private
   */
  _recordConversation(userMsg, agentReply) {
    try {
      const agent = this._engine.world.getAgent(this.id);
      if (!agent || typeof agent.recordExternalExperience !== 'function') return;

      // 用户说的话
      agent.recordExternalExperience({
        content: `对方说："${userMsg.substring(0, 150)}"`,
        category: 'social',
        emotionTag: 'neutral',
        importance: 0.6,
        groundingExcluded: true,
      });

      // 自己的回复
      agent.recordExternalExperience({
        content: `我说了："${agentReply.substring(0, 150)}"`,
        category: 'social',
        emotionTag: 'neutral',
        importance: 0.5,
        groundingExcluded: true,
      });
    } catch (e) {
      diagnostics.warn(`Conversation memory error: ${e.message}`);
      diagnostics.collect({ type: 'conversation_memory_error', agentId: this.id, error: e.message });
    }
  }
}

module.exports = Character;
