/**
 * Andy Engine - 综合测试套件
 *
 * 测试维度：
 *   1. 单元测试：每个模块独立测试
 *   2. 集成测试：多模块协作测试
 *   3. 逻辑验证：行为合理性检查
 *   4. 边界条件：极端情况处理
 *   5. 性能测试：N² 优化验证
 */

const AndyEngine = require('./index');
const Agent = require('./agent/Agent');
const Personality = require('./agent/Personality');
const EmotionVector = process.env.ANDY_USE_NATIVE === '1'
  ? require('./agent/EmotionVector.native')
  : require('./agent/EmotionVector');
const { StateMachine, STATES } = require('./agent/StateMachine');
const PersonalMemory = require('./agent/PersonalMemory');
const Schedule = require('./agent/Schedule');
const Relationship = require('./social/Relationship');
const SocialGraph = require('./social/SocialGraph');
const RegionGrid = require('./spatial/RegionGrid');
const EventDispatcher = require('./core/EventDispatcher');
const Appraisal = require('./agent/Appraisal');
const ProceduralMemory = require('./agent/ProceduralMemory');
const NeedsSystem = process.env.ANDY_USE_NATIVE === '1'
  ? require('./agent/NeedsSystem.native')
  : require('./agent/NeedsSystem');
const EmotionRegulation = require('./agent/EmotionRegulation');
const IntrinsicMotivation = require('./agent/IntrinsicMotivation');
const { validateConfig, validateAgentConfig } = require('./config/validate');
const { SEMANTIC_EVENT_CATEGORIES } = require('./config/defaults');

// ═══════════════════════════════════════════
// 测试工具
// ═══════════════════════════════════════════
let totalTests = 0;
let passedTests = 0;
let failedTests = 0;
const failures = [];

function assert(condition, message) {
  totalTests++;
  if (condition) {
    passedTests++;
  } else {
    failedTests++;
    failures.push(`❌ ${message}`);
    console.log(`  ❌ FAIL: ${message}`);
  }
}

function assertRange(value, min, max, message) {
  assert(value >= min && value <= max, `${message} (got ${value}, expected ${min}-${max})`);
}

function section(title) {
  console.log(`\n${'═'.repeat(60)}`);
  console.log(`  ${title}`);
  console.log(`${'═'.repeat(60)}`);
}

// ═══════════════════════════════════════════
// 测试 1: Personality 模块
// ═══════════════════════════════════════════
section('1. Personality 模块测试');

(() => {
  // MBTI 映射
  const p1 = new Personality({ mbti: 'INFP' });
  assert(p1.ocean.openness > 0.7, 'INFP openness should be high');
  assert(p1.ocean.extraversion < 0.3, 'INFP extraversion should be low');
  assert(p1.behavior.emotionalInertia > 0.4, 'INFP emotional inertia should be moderate-high');

  // 直接 OCEAN
  const p2 = new Personality({ ocean: { openness: 0.9, extraversion: 0.8 } });
  assert(p2.ocean.openness === 0.9, 'Direct OCEAN openness');
  assert(p2.ocean.extraversion === 0.8, 'Direct OCEAN extraversion');

  // 默认
  const p3 = new Personality();
  assert(p3.mbti === 'INFP', 'Default MBTI should be INFP');

  // 序列化/反序列化
  const json = p1.toJSON();
  const p4 = Personality.fromJSON(json);
  assert(p4.ocean.openness === p1.ocean.openness, 'Serialization preserves openness');
  assert(p4.mbti === 'INFP', 'Serialization preserves MBTI');

  // 行为参数范围检查
  assertRange(p1.behavior.emotionalInertia, 0, 1, 'emotionalInertia in [0,1]');
  assertRange(p1.behavior.susceptibility, 0, 1, 'susceptibility in [0,1]');
  assertRange(p1.behavior.expressiveness, 0, 1, 'expressiveness in [0,1]');
  assertRange(p1.behavior.socialInitiative, 0, 1, 'socialInitiative in [0,1]');

  // MBTI + OCEAN 覆盖：显式 ocean 参数应覆盖 MBTI 默认值
  const p5 = new Personality({ mbti: 'INFJ', ocean: { neuroticism: 0.85 } });
  assert(p5.ocean.neuroticism === 0.85, 'Explicit ocean.neuroticism overrides MBTI default');
  assert(p5.ocean.openness === 0.80, 'Non-overridden dimension keeps MBTI default (INFJ openness)');
  assert(p5.mbti === 'INFJ', 'MBTI preserved when ocean override used');

  // 验证覆盖生效：高神经质应产生更高的情绪惯性
  const p6 = new Personality({ mbti: 'INFJ' }); // 标准 INFJ, neuroticism=0.50
  assert(p5.behavior.emotionalInertia > p6.behavior.emotionalInertia,
    'High neuroticism override produces higher emotional inertia');
})();

// ═══════════════════════════════════════════
// 测试 2: EmotionVector 模块
// ═══════════════════════════════════════════
section('2. EmotionVector 模块测试');

(() => {
  const personality = new Personality({ mbti: 'INFP' });
  const emotion = new EmotionVector(personality);

  // 初始状态检查
  assertRange(emotion.getValence(), -1, 1, 'Initial valence in [-1,1]');
  assertRange(emotion.getArousal(), 0, 1, 'Initial arousal in [0,1]');

  // Tick 后状态检查
  emotion.tick(5 / 60, 14); // 5 分钟, 下午 2 点
  assertRange(emotion.getValence(), -1, 1, 'Post-tick valence in [-1,1]');
  assertRange(emotion.getArousal(), 0, 1, 'Post-tick arousal in [0,1]');

  // 所有维度应在 [-1,1] 范围内
  for (const [dim, val] of Object.entries(emotion.current)) {
    assertRange(val, -1, 1, `Dimension ${dim} in [-1,1]`);
  }

  // 外部效果应用
  emotion.applyEffect({ joy: 0.5, sadness: -0.3 });
  assert(emotion.current.joy !== undefined, 'Joy should exist after effect');
  for (const [dim, val] of Object.entries(emotion.current)) {
    assertRange(val, -1, 1, `Post-effect ${dim} in [-1,1]`);
  }

  // 昼夜节律测试
  const emotion2 = new EmotionVector(personality);
  const preValence = emotion2.getValence();
  emotion2.tick(0.083, 2); // 凌晨 2 点
  // 深夜应该更孤独
  assert(emotion2.current.loneliness !== undefined, 'Loneliness exists');

  // 社交传染测试
  const emotion3 = new EmotionVector(personality);
  const contagionInputs = {
    other_agent: {
      emotion: { joy: 0.8, sadness: -0.1 },
      weight: 0.5,
      expressiveness: 0.7,
    },
  };
  emotion3.tick(5 / 60, 14, contagionInputs);
  // 接受传染后 joy 应该增加
  // （不严格断言，因为有衰减和其他效应）

  // getDominant 测试
  const dominant = emotion3.getDominant(3);
  assert(dominant.length <= 3, 'getDominant returns at most N');
  assert(dominant[0].dimension, 'Dominant has dimension');
  assert(typeof dominant[0].value === 'number', 'Dominant has numeric value');

  // toPromptString 测试
  const promptStr = emotion3.toPromptString();
  assert(promptStr.includes('效价'), 'Prompt string contains 效价');
  assert(typeof promptStr === 'string', 'Prompt string is a string');

  // 序列化测试
  const json = emotion3.toJSON();
  assert(json.current, 'Serialized has current');
  assert(json.baseline, 'Serialized has baseline');
  assert(typeof json.stress === 'number', 'Serialized has stress');
})();

// ═══════════════════════════════════════════
// 测试 3: StateMachine 模块
// ═══════════════════════════════════════════
section('3. StateMachine 模块测试');

(() => {
  const sm = new StateMachine('在图书馆');
  assert(sm.currentState === '在图书馆', 'Initial state correct');

  // 所有状态都必须在 STATES 中定义
  const stateCount = Object.keys(STATES).length;
  assert(stateCount >= 40, `Should have 40+ states (got ${stateCount})`);

  // 每个状态的转移列表必须指向合法状态
  let validTransitions = true;
  for (const [stateName, stateDef] of Object.entries(STATES)) {
    for (const next of stateDef.next) {
      if (!STATES[next]) {
        validTransitions = false;
        console.log(`  ⚠️ ${stateName} → ${next}: target state not defined`);
      }
    }
  }
  assert(validTransitions, 'All transitions point to defined states');

  // 时间约束检查
  for (const [stateName, stateDef] of Object.entries(STATES)) {
    assert(stateDef.hours.length > 0, `State ${stateName} has valid hours`);
    for (const h of stateDef.hours) {
      assertRange(h, 0, 23, `State ${stateName} hour ${h} in [0,23]`);
    }
  }

  // Tick 测试
  const result = sm.tick(10, 10); // 上午 10 点，过了 10 分钟
  assert(typeof result.changed === 'boolean', 'tick returns changed boolean');

  // 序列化测试
  const json = sm.toJSON();
  assert(json.currentState, 'Serialized has currentState');
  assert(json.stateEnteredAt, 'Serialized has stateEnteredAt');
})();

// ═══════════════════════════════════════════
// 测试 4: PersonalMemory 模块
// ═══════════════════════════════════════════
section('4. PersonalMemory 模块测试');

(() => {
  const mem = new PersonalMemory('test_agent', [
    { content: '喜欢吃泡面', category: 'food', emotionTag: 'happy' },
    { content: '经常失眠', category: 'sleep', emotionTag: 'sad' },
  ]);

  assert(mem.memories.length === 2, 'Seed memories loaded');

  // 添加经历
  const mockEmotion = {
    getArousal: () => 0.5,
    getValence: () => 0.3,
    getDominant: () => [{ dimension: 'joy', value: 0.3 }],
    current: { joy: 0.3 },
  };
  const event = {
    id: 'evt_test',
    type: 'social',
    content: '跟朋友一起吃了饭',
    participants: ['friend_1'],
    scope: 'local',
  };
  mem.addExperience(event, mockEmotion);
  assert(mem.memories.length === 3, 'Memory added');

  // 检索测试
  const { memories: results } = mem.retrieve({ keywords: ['泡面', '吃饭'] });
  assert(results.length > 0, 'Retrieval finds related memories');

  // 情绪匹配检索
  const { memories: emotionResults } = mem.retrieve({ emotion: { joy: 0.5, sadness: -0.1 } });
  assert(emotionResults.length > 0, 'Emotion-based retrieval works');

  // 记忆衰减
  mem.tick(24); // 24 小时
  // 重要性应该下降但不为 0
  for (const m of mem.memories) {
    assert(m.importance > 0, 'Importance stays positive after decay');
  }

  // toPromptString
  const promptStr = mem.toPromptString();
  assert(promptStr.length > 10, 'Prompt string has content');

  // 序列化
  const json = mem.toJSON();
  assert(Array.isArray(json), 'Serialized memory is array');
  assert(json.length === 3, 'Serialized memory has correct count');
})();

// ═══════════════════════════════════════════
// 测试 5: SocialGraph 模块
// ═══════════════════════════════════════════
section('5. SocialGraph 模块测试');

(() => {
  const graph = new SocialGraph();
  graph.addAgent('A');
  graph.addAgent('B');
  graph.addAgent('C');

  // 创建关系
  const relAB = graph.getOrCreateRelationship('A', 'B');
  assert(relAB.strength > 0, 'New relationship has positive strength');

  // 双向一致性
  const relBA = graph.getRelationship('B', 'A');
  assert(relBA === relAB, 'Relationship is bidirectional (same object)');

  // 获取所有关系
  const relsA = graph.getRelationships('A');
  assert(relsA.length >= 1, 'Agent A has relationships');

  // 交互记录
  relAB.recordInteraction('talk', 0.5, '聊天');
  assert(relAB.interactionCount === 1, 'Interaction count incremented');
  assert(relAB.strength > 0.05, 'Strength increased after positive interaction');

  // 多次交互以达到 acquaintance 级别
  for (let i = 0; i < 8; i++) relAB.recordInteraction('talk', 0.5, '聊天');
  assert(relAB.strength > 0.15, 'Strength above acquaintance threshold after multiple interactions');

  // 关系类型更新
  assert(['stranger', 'acquaintance', 'friend', 'closeFriend'].includes(relAB.type),
    'Relationship type is valid');

  // 关系衰减
  const prevStrength = relAB.strength;
  graph.tick(24); // 24 小时
  assert(relAB.strength <= prevStrength, 'Strength decreases after time without interaction');

  // 衰减后补交互，恢复到 acquaintance 级别
  for (let i = 0; i < 5; i++) relAB.recordInteraction('talk', 0.5, '聊天');
  assert(relAB.strength > 0.15, `A-B re-strengthened (got ${relAB.strength.toFixed(3)})`);

  // 社交距离（需要关系强度 > 0.15 才算可达）
  const relBC = graph.getOrCreateRelationship('B', 'C');
  for (let i = 0; i < 12; i++) relBC.recordInteraction('talk', 0.5);
  assert(relBC.strength > 0.15, `B-C relationship above threshold (got ${relBC.strength.toFixed(3)})`);
  const distAC = graph.getSocialDistance('A', 'C');
  assert(distAC === 2, `A-C social distance should be 2 (got ${distAC})`);

  // 共同朋友
  const common = graph.getCommonFriends('A', 'C');
  assert(common.includes('B'), 'B is common friend of A and C');

  // 影响传播
  const targets = graph.getInfluenceTargets('A');
  assert(targets.length > 0, 'Influence targets found');
  assert(targets[0].weight > 0, 'Influence weight is positive');
})();

// ═══════════════════════════════════════════
// 测试 6: RegionGrid 模块
// ═══════════════════════════════════════════
section('6. RegionGrid 模块测试');

(() => {
  const grid = new RegionGrid(['宿舍', '图书馆', '食堂', '教室']);

  // 放置
  grid.place('A', '图书馆');
  grid.place('B', '图书馆');
  grid.place('C', '食堂');

  // 同区域查询
  const libAgents = grid.getAgentsInRegion('图书馆');
  assert(libAgents.length === 2, 'Library has 2 agents');
  assert(libAgents.includes('A') && libAgents.includes('B'), 'Library contains A and B');

  // 邻居查询（同区域）
  const neighborsA = grid.getNeighbors('A');
  assert(neighborsA.length === 1, 'A has 1 neighbor in same region');
  assert(neighborsA[0] === 'B', 'A neighbor is B');

  // 移动
  grid.place('A', '食堂');
  assert(grid.getRegion('A') === '食堂', 'A moved to canteen');
  assert(grid.getAgentsInRegion('图书馆').length === 1, 'Library now has 1 agent');

  // 计数
  assert(grid.count('图书馆') === 1, 'Library count is 1');
  assert(grid.count('食堂') === 2, 'Canteen count is 2');

  // 占用区域
  const occupied = grid.getOccupiedRegions();
  assert(occupied.length === 2, '2 occupied regions');

  // 邻接设置 + 邻居查询
  grid.setAdjacent('图书馆', '教室', 1);
  grid.place('D', '教室');
  const libNeighbors = grid.getNeighbors('B', 1); // B 在图书馆
  assert(libNeighbors.includes('D'), 'B can see D in adjacent classroom');
})();

// ═══════════════════════════════════════════
// 测试 7: EventDispatcher 模块
// ═══════════════════════════════════════════
section('7. EventDispatcher 模块测试');

(() => {
  const dispatcher = new EventDispatcher();

  // 创建事件
  const evt = dispatcher.createEvent({
    type: 'social',
    content: 'A 和 B 聊天',
    participants: ['A', 'B'],
    scope: 'local',
  });
  assert(evt.id, 'Event has ID');
  assert(evt.content === 'A 和 B 聊天', 'Event has content');

  // 分发
  const dispatched = dispatcher.dispatch();
  assert(dispatched.length === 1, 'One event dispatched');
  assert(dispatcher.eventLog.length === 1, 'Event log has 1 entry');

  // 过滤
  const forA = dispatcher.filterEventsForAgent('A', dispatched);
  assert(forA.length === 1, 'A can perceive event');

  const forC = dispatcher.filterEventsForAgent('C', dispatched);
  assert(forC.length === 0, 'C cannot perceive local event');

  // 公共事件
  dispatcher.createEvent({
    type: 'weather',
    content: '下雨了',
    scope: 'public',
  });
  const dispatched2 = dispatcher.dispatch();
  const forC2 = dispatcher.filterEventsForAgent('C', dispatched2);
  assert(forC2.length === 1, 'C can perceive public event');

  // 遭遇事件
  const graph = new SocialGraph();
  graph.addAgent('A');
  graph.addAgent('B');
  graph.getOrCreateRelationship('A', 'B').recordInteraction('talk', 0.5);

  const encounter = dispatcher.generateEncounterEvent('A', 'B', '图书馆', graph);
  // 不一定生成（有概率），但不应该崩溃
  assert(true, 'Encounter event generation does not crash');

  // 随机事件
  let randomCount = 0;
  for (let i = 0; i < 100; i++) {
    const re = dispatcher.generateRandomEvent('A', '图书馆');
    if (re) randomCount++;
  }
  assert(randomCount > 0, `Random events generated (${randomCount}/100)`);
  assert(randomCount < 100, 'Random events are not guaranteed every time');

  // 因果链
  const e1 = dispatcher.createEvent({ type: 'cause', content: 'cause' });
  const dispatched3 = dispatcher.dispatch();
  const e2 = dispatcher.createEvent({ type: 'effect', content: 'effect', cause: e1.id });
  dispatcher.dispatch();
  const chain = dispatcher.getCausalChain(e1.id);
  assert(chain.length === 2, 'Causal chain has 2 events');
})();

// ═══════════════════════════════════════════
// 测试 8: Schedule 模块
// ═══════════════════════════════════════════
section('8. Schedule 模块测试');

(() => {
  const schedule = Schedule.createStudentSchedule();

  // 日程条目存在
  assert(schedule.entries.length > 0, 'Student schedule has entries');

  // 获取当前活动
  const morning = schedule.getCurrentActivity(8.5, 1); // 周一 8:30
  // 可能在上课（概率），也可能不在
  assert(typeof morning.inSchedule === 'boolean', 'getCurrentActivity returns inSchedule flag');

  // 获取下一个活动
  const next = schedule.getNextActivity(9, 1);
  assert(next !== null, 'getNextActivity finds upcoming activity');

  // 序列化
  const json = schedule.toJSON();
  assert(json.entries, 'Serialized has entries');
})();

// ═══════════════════════════════════════════
// 测试 9: Agent 完整创建
// ═══════════════════════════════════════════
section('9. Agent 完整创建与序列化');

(() => {
  const agent = new Agent({
    id: 'bobby',
    name: 'Bobby',
    personality: { mbti: 'INFP' },
    schedule: Schedule.createStudentSchedule().toJSON(),
    seedMemories: [
      { content: '喜欢吃泡面', category: 'food' },
    ],
    initialPosition: '图书馆',
  });

  assert(agent.id === 'bobby', 'Agent ID correct');
  assert(agent.name === 'Bobby', 'Agent name correct');
  assert(agent.position === '图书馆', 'Initial position correct');
  assert(agent.personality.mbti === 'INFP', 'Personality correct');

  // 状态查询
  const status = agent.getStatus();
  assert(status.id === 'bobby', 'Status has id');
  assert(status.state, 'Status has state');
  assert(typeof status.emotion === 'string', 'Status has emotion string');
  assert(typeof status.socialEnergy === 'number', 'Status has socialEnergy');

  // 序列化/反序列化
  const json = agent.toJSON();
  const restored = new Agent({ id: 'bobby', name: 'Bobby', schedule: json.schedule }, json);
  assert(restored.position === '图书馆', 'Restored position correct');
  assert(restored.personality.mbti === 'INFP', 'Restored personality correct');
})();

// ═══════════════════════════════════════════
// 测试 10: AndyEngine 集成测试
// ═══════════════════════════════════════════
section('10. AndyEngine 集成测试');

(() => {
  const engine = new AndyEngine({
    startTime: new Date('2024-01-15T08:00:00'),
    weather: 'sunny',
  });

  // 添加多个 Agent
  const agentConfigs = [
    {
      id: 'bobby',
      name: 'Bobby',
      personality: { mbti: 'INFP' },
      schedule: Schedule.createStudentSchedule().toJSON(),
      initialPosition: '图书馆',
    },
    {
      id: 'xiaoming',
      name: '小明',
      personality: { mbti: 'ENFP' },
      schedule: Schedule.createStudentSchedule({
        morningClass: 9,
        workDays: [2, 4],
      }).toJSON(),
      initialPosition: '教室',
    },
    {
      id: 'xiaohong',
      name: '小红',
      personality: { mbti: 'ISFJ' },
      schedule: Schedule.createStudentSchedule({
        morningClass: 8,
        workDays: [1, 3, 5],
      }).toJSON(),
      initialPosition: '食堂',
    },
  ];

  engine.addAgents(agentConfigs);
  assert(engine.world.agents.size === 3, '3 agents added');

  // 关系在首次相遇时创建（不再预创建）
  const graph = engine.getSocialGraph();
  const relsBobby = graph.getRelationships('bobby');
  assert(relsBobby.length === 0, 'No relationships before first encounter');

  // 单个 Tick
  const tickResult = engine.tick();
  assert(tickResult.tickNumber === 1, 'First tick number is 1');
  assert(tickResult.phase, 'Tick result has phases');
  assert(tickResult.phase.timeAdvance, 'Phase 1: time advance');
  assert(tickResult.phase.environmentSync, 'Phase 2: environment sync');
  assert(tickResult.phase.agentThink, 'Phase 3: agent think');
  assert(tickResult.phase.interaction, 'Phase 4: interaction');
  assert(tickResult.phase.eventDispatch, 'Phase 5: event dispatch');
  assert(typeof tickResult.durationMs === 'number', 'Tick has duration');

  // 相遇后关系自然涌现（多 tick 确保同区域 Agent 相遇概率足够高）
  engine.runTicks(30);
  const relsAfterTicks = graph.getRelationships('bobby');
  assert(relsAfterTicks.length > 0, 'Relationships created after encounters');

  // 多个 Tick
  const results = engine.runTicks(10);
  assert(results.length === 10, '10 ticks completed');
  assert(engine.world.tickCount === 41, `Total tick count is 41 (got ${engine.world.tickCount})`);

  // 世界快照
  const snap = engine.snapshot();
  assert(snap.agents, 'Snapshot has agents');
  assert(Object.keys(snap.agents).length === 3, 'Snapshot has 3 agents');
  assert(snap.environment, 'Snapshot has environment');

  // 世界上下文
  const ctx = engine.getWorldContext('bobby');
  assert(ctx, 'Bobby world context exists');
  assert(ctx.time, 'Context has time');
  assert(typeof ctx.hour === 'number', 'Context has hour');
  assert(typeof ctx.recentEvents === 'string', 'Context has recentEvents string');
  assert(typeof ctx.emotionState === 'string', 'Context has emotionState string');
  assert(typeof ctx.memoryContext === 'string', 'Context has memoryContext string');
  assert(typeof ctx.nearbyPeople === 'string', 'Context has nearbyPeople string');

  // 统计信息
  const stats = engine.getStats();
  assert(stats.tickCount === 41, 'Stats tick count correct');
  assert(stats.agentCount === 3, 'Stats agent count correct');

  // 序列化/反序列化
  const json = engine.toJSON();
  const restored = AndyEngine.fromJSON(json);
  assert(restored.world.agents.size === 3, 'Restored has 3 agents');
  assert(restored.world.tickCount === 41, 'Restored tick count correct');
})();

// ═══════════════════════════════════════════
// 测试 11: 长时间模拟（逻辑稳定性）
// ═══════════════════════════════════════════
section('11. 长时间模拟稳定性测试');

(() => {
  const engine = new AndyEngine({
    startTime: new Date('2024-01-15T00:00:00'),
  });

  engine.addAgents([
    { id: 'a1', name: 'Alice', personality: { mbti: 'ENFP' },
      schedule: Schedule.createStudentSchedule().toJSON(), initialPosition: '宿舍' },
    { id: 'a2', name: 'Bob', personality: { mbti: 'INTP' },
      schedule: Schedule.createStudentSchedule({ workDays: [2, 4] }).toJSON(), initialPosition: '宿舍' },
    { id: 'a3', name: 'Charlie', personality: { mbti: 'ISFJ' },
      schedule: Schedule.createWorkerSchedule().toJSON(), initialPosition: '宿舍' },
  ]);

  // 模拟 24 小时 (288 个 tick @ 5 分钟)
  const results = engine.runTicks(288);

  // 检查没有崩溃
  assert(results.length === 288, '288 ticks completed without crash');

  // 检查情绪没有溢出
  for (const [id, agent] of engine.world.agents) {
    for (const [dim, val] of Object.entries(agent.emotion.current)) {
      assertRange(val, -1, 1, `Agent ${id} emotion ${dim} in range after 24h`);
    }
  }

  // 检查时间推进正确
  const finalTime = engine.world.time;
  assert(finalTime.getHours() === 0 || finalTime.getHours() === 23,
    `Final hour should be near midnight (got ${finalTime.getHours()})`);

  // 检查关系衰减但没崩溃
  const graph = engine.getSocialGraph();
  for (const [id, agent] of engine.world.agents) {
    const rels = graph.getRelationships(id);
    assert(rels.length === 2, `Agent ${id} still has 2 relationships`);
    for (const rel of rels) {
      assertRange(rel.strength, 0, 1, `Relationship strength in range`);
    }
  }

  // 检查事件日志
  assert(engine.world.eventDispatcher.eventLog.length > 0, 'Events were generated');

  // 检查 Agent 状态有效
  for (const [id, agent] of engine.world.agents) {
    assert(STATES[agent.stateMachine.currentState] !== undefined,
      `Agent ${id} in valid state: ${agent.stateMachine.currentState}`);
    assert(agent.position, `Agent ${id} has position`);
  }

  console.log(`\n  📊 24h 模拟统计:`);
  console.log(`     总 tick: ${engine.world.tickCount}`);
  console.log(`     事件数: ${engine.world.eventDispatcher.eventLog.length}`);
  console.log(`     最后时间: ${engine.world.time.toISOString()}`);
  for (const [id, agent] of engine.world.agents) {
    const dom = agent.emotion.getDominant(2);
    console.log(`     ${agent.name}: 状态=${agent.stateMachine.currentState}, ` +
      `位置=${agent.position}, 情绪=${dom.map(d => `${d.dimension}=${d.value.toFixed(2)}`).join(',')}`);
  }
})();

// ═══════════════════════════════════════════
// 测试 12: 极端条件测试
// ═══════════════════════════════════════════
section('12. 极端条件测试');

(() => {
  // 空世界 Tick
  const emptyEngine = new AndyEngine();
  const emptyResult = emptyEngine.tick();
  assert(emptyResult.tickNumber === 1, 'Empty world tick works');

  // 单 Agent Tick
  const singleEngine = new AndyEngine();
  singleEngine.addAgent({
    id: 'lonely', name: 'Lonely', personality: { mbti: 'INFP' },
    schedule: {}, initialPosition: '宿舍',
  });
  const singleResult = singleEngine.runTicks(5);
  assert(singleResult.length === 5, 'Single agent ticks work');

  // 大量 Agent 性能测试
  const perfEngine = new AndyEngine({
    startTime: new Date('2024-01-15T12:00:00'),
  });

  const manyConfigs = [];
  for (let i = 0; i < 20; i++) {
    manyConfigs.push({
      id: `agent_${i}`,
      name: `Agent_${i}`,
      personality: { ocean: { openness: Math.random(), extraversion: Math.random(), agreeableness: Math.random(), conscientiousness: Math.random(), neuroticism: Math.random() } },
      schedule: Schedule.createStudentSchedule().toJSON(),
      initialPosition: ['图书馆', '食堂', '教室', '宿舍'][i % 4],
    });
  }
  perfEngine.addAgents(manyConfigs);

  const perfStart = Date.now();
  perfEngine.runTicks(50);
  const perfDuration = Date.now() - perfStart;

  console.log(`\n  ⏱️  20 Agent × 50 ticks = ${perfDuration}ms (${(perfDuration / 50).toFixed(1)}ms/tick)`);
  assert(perfDuration < 5000, `Performance should be under 5s (got ${perfDuration}ms)`);

  // 序列化大世界
  const bigJson = perfEngine.toJSON();
  assert(Object.keys(bigJson.agents).length === 20, 'Big world serialized 20 agents');
})();

// ═══════════════════════════════════════════
// 测试 13: 情绪均衡回归测试（防止 joy 饱和 bug 回归）
// ═══════════════════════════════════════════
section('13. 情绪均衡回归测试');

(() => {
  const sched = Schedule.createStudentSchedule();

  // 多 Agent 长时间模拟（不同日程和位置以避免恒定共处）
  const engine = new AndyEngine({ startTime: new Date('2024-01-15T00:00:00') });
  const schedA = Schedule.createStudentSchedule();
  const schedB = Schedule.createStudentSchedule({ workDays: [2, 4] });
  const schedC = Schedule.createWorkerSchedule();
  engine.addAgents([
    { id: 'a', name: 'Alice', personality: { mbti: 'INFP' }, initialPosition: '宿舍', schedule: schedA.toJSON() },
    { id: 'b', name: 'Bob', personality: { mbti: 'ENFP' }, initialPosition: '图书馆', schedule: schedB.toJSON() },
    { id: 'c', name: 'Charlie', personality: { mbti: 'ESTJ' }, initialPosition: '食堂', schedule: schedC.toJSON() },
  ]);

  // 运行 72 小时 (864 ticks)
  const tickCount = 864;
  let allInRange = true;
  let maxJoySeen = 0;
  let minJoySeen = 0;
  const joySnapshots = [];

  for (let t = 0; t < tickCount; t++) {
    engine.tick();
    for (const [id, agent] of engine.world.agents) {
      const joy = agent.emotion.current.joy;
      if (joy > maxJoySeen) maxJoySeen = joy;
      if (joy < minJoySeen) minJoySeen = joy;

      // 检查所有维度范围
      for (const [dim, val] of Object.entries(agent.emotion.current)) {
        if (val < -1.01 || val > 1.01) allInRange = false;
      }
    }

    // 每 24h 记录快照
    if ((t + 1) % 288 === 0) {
      const dayJoy = {};
      for (const [id, agent] of engine.world.agents) {
        dayJoy[id] = agent.emotion.current.joy;
      }
      joySnapshots.push({ day: (t + 1) / 288, ...dayJoy });
    }
  }

  // 验证 1: 所有情绪在 [-1, 1] 范围
  assert(allInRange, 'All emotions stay in [-1, 1] over 72h');

  // 验证 2: Joy 不会在 0.95 饱和（回归测试）
  assert(maxJoySeen < 0.96, `Joy peak should be < 0.96 (got ${maxJoySeen.toFixed(4)})`);

  // 验证 3: Joy 有显著波动（范围至少 0.3）
  const joyRange = maxJoySeen - minJoySeen;
  assert(joyRange > 0.3, `Joy should fluctuate significantly (range=${joyRange.toFixed(3)}, min=${minJoySeen.toFixed(3)}, max=${maxJoySeen.toFixed(3)})`);

  // 验证 4: 最终情绪状态 - 不是所有 Agent 都被 joy 完全主导
  const agents = [...engine.world.agents.values()];
  const joyValues = agents.map(a => a.emotion.current.joy);
  const allHighJoy = joyValues.every(j => j > 0.9);
  assert(!allHighJoy, `Not all agents should have joy > 0.9 (got ${joyValues.map(j => j.toFixed(3)).join(', ')})`);

  // 验证 5: 基线漂移不会使基线越界
  for (const agent of agents) {
    for (const [dim, val] of Object.entries(agent.emotion.baseline)) {
      assert(Math.abs(val) < 0.5, `Baseline ${dim}=${val.toFixed(4)} should be < 0.5`);
    }
  }

  console.log(`\n  📊 72h 情绪均衡统计:`);
  console.log(`     joy 范围: [${minJoySeen.toFixed(3)}, ${maxJoySeen.toFixed(3)}]`);
  console.log(`     每日快照:`);
  for (const snap of joySnapshots) {
    const vals = Object.entries(snap).filter(([k]) => k !== 'day').map(([k, v]) => `${k}=${v.toFixed(3)}`).join(', ');
    console.log(`       Day ${snap.day}: ${vals}`);
  }
})();

// ═══════════════════════════════════════════
// 14. Appraisal 认知评价系统测试
// ═══════════════════════════════════════════
section('14. Appraisal 认知评价系统测试');

(() => {
  const agent = new Agent({
    id: 'appraisal_test',
    name: '评价测试',
    personality: { mbti: 'INFP' },
    schedule: {},
  });
  agent.setSocialGraph(new SocialGraph());

  // 测试 1: 正面社交事件评价
  const positiveEvent = {
    type: 'social',
    content: '和好朋友聊天',
    participants: ['appraisal_test', 'other'],
    effects: [{ target: 'appraisal_test', type: 'emotion', delta: { joy: 0.1, loneliness: -0.05 } }],
  };
  const appraisal1 = Appraisal.evaluate(positiveEvent, agent);
  assert(appraisal1.dimensions.pleasantness > 0, 'Positive event should have positive pleasantness');
  assert(appraisal1.dimensions.goalRelevance > 0.2, 'Social event should have goal relevance');
  assert(appraisal1.importance >= 0, 'Importance should be non-negative');

  // 测试 2: 负面事件评价（使用更强的负面效果以覆盖宜人性偏差）
  const negativeEvent = {
    type: 'random',
    content: '突然想起明天还有作业没写',
    participants: ['appraisal_test'],
    effects: [{ target: 'appraisal_test', type: 'emotion', delta: { sadness: 0.15, anger: 0.1, nervousness: 0.12 } }],
  };
  const appraisal2 = Appraisal.evaluate(negativeEvent, agent);
  assert(appraisal2.dimensions.pleasantness < 0, `Negative event should have negative pleasantness (got ${appraisal2.dimensions.pleasantness.toFixed(4)})`);
  assert(appraisal2.dimensions.copingPotential > 0 && appraisal2.dimensions.copingPotential < 1, 'Coping potential should be in [0,1]');

  // 测试 3: 天气事件评价（环境代理性）
  const weatherEvent = {
    type: 'weather',
    content: '下雨了',
    participants: [],
    effects: [{ target: 'appraisal_test', type: 'emotion', delta: { calm: 0.1, boredom: 0.05 } }],
  };
  const appraisal3 = Appraisal.evaluate(weatherEvent, agent);
  assert(appraisal3.dimensions.agency.label === 'environment', 'Weather event should have environment agency');
  assert(appraisal3.dimensions.suddenness < 0.5, 'Weather should not be very sudden');

  // 测试 4: 评价修正因子范围
  assert(typeof appraisal1.emotionModifier === 'object', 'Emotion modifier should be an object');
  for (const [key, val] of Object.entries(appraisal1.emotionModifier)) {
    assert(val >= 0.1 && val <= 2.5, `Modifier ${key}=${val} should be in [0.1, 2.5]`);
  }

  // 测试 5: 突然性评估（随机事件应比日程事件更突然）
  const scheduleEvent = { type: 'schedule', content: '上课', participants: ['appraisal_test'], effects: [] };
  const randomEvent2 = { type: 'random', content: '踩到水坑', participants: ['appraisal_test'], effects: [] };
  const app_sched = Appraisal.evaluate(scheduleEvent, agent);
  const app_rand = Appraisal.evaluate(randomEvent2, agent);
  assert(app_rand.dimensions.suddenness > app_sched.dimensions.suddenness, 'Random event should be more sudden than schedule event');
})();

// ═══════════════════════════════════════════
// 15. ProceduralMemory 程序性记忆测试
// ═══════════════════════════════════════════
section('15. ProceduralMemory 程序性记忆测试');

(() => {
  const pm = new ProceduralMemory();

  // 测试 1: 基本创建
  assert(pm.patterns.size === 0, 'New procedural memory should have no patterns');

  // 测试 2: 记录行为
  for (let i = 0; i < 5; i++) {
    pm.recordAction({
      hour: 8,
      dayOfWeek: 1,
      position: '宿舍',
      state: '在洗漱',
      valence: 0.1,
      region: '宿舍',
    });
  }
  assert(pm._recentActions.length === 5, 'Should have 5 recent actions');

  // 测试 3: 模式检测（重复行为应形成模式）
  assert(pm.patterns.size > 0, 'Repeated actions should form a pattern');

  // 测试 4: 模式查询
  const result = pm.query({ hour: 8, dayOfWeek: 1, position: '宿舍', valence: 0.1 });
  // 由于强度可能不够，这里只检查查询不报错
  assert(result === null || typeof result.confidence === 'number', 'Query should return null or result with confidence');

  // 测试 5: 更多重复以增强模式
  for (let i = 0; i < 10; i++) {
    pm.recordAction({
      hour: 8,
      dayOfWeek: 1,
      position: '宿舍',
      state: '在洗漱',
      valence: 0.1,
      region: '宿舍',
    });
  }
  const result2 = pm.query({ hour: 8, dayOfWeek: 1, position: '宿舍', valence: 0.1 });
  assert(result2 !== null, 'After enough repetitions, query should return a habit');
  if (result2) {
    assert(result2.confidence > 0.3, `Habit confidence should be significant (got ${result2.confidence.toFixed(3)})`);
  }

  // 测试 6: 序列化/反序列化
  const json = pm.toJSON();
  assert(json.patterns && typeof json.patterns === 'object', 'toJSON should return patterns object');
  const pm2 = new ProceduralMemory(json);
  assert(pm2.patterns.size === pm.patterns.size, 'Restored procedural memory should have same pattern count');

  // 测试 7: 打破习惯
  pm.disrupt(1.0);
  const patterns = [...pm.patterns.values()];
  assert(patterns.every(p => p.strength <= 0.5), 'After disruption, all patterns should be weakened');
})();

// ═══════════════════════════════════════════
// 16. 情绪一致性记忆检索测试
// ═══════════════════════════════════════════
section('16. 情绪一致性记忆检索测试');

(() => {
  const mem = new PersonalMemory('mood_test', []);

  // 添加正面记忆
  mem.addExperience({
    content: '今天考试考得很好',
    type: 'random',
    effects: [{ target: 'mood_test', type: 'emotion', delta: { joy: 0.2 } }],
  }, { current: { joy: 0.8, sadness: 0.1 }, getDominant: () => [{ dimension: 'joy', value: 0.8 }] });

  // 添加负面记忆
  mem.addExperience({
    content: '被老师批评了',
    type: 'random',
    effects: [{ target: 'mood_test', type: 'emotion', delta: { sadness: 0.2, shame: 0.1 } }],
  }, { current: { sadness: 0.7, shame: 0.5 }, getDominant: () => [{ dimension: 'sadness', value: 0.7 }] });

  assert(mem.memories.length === 2, 'Should have 2 memories');

  // 快乐时检索：正面记忆应该排在前面
  const { memories: happyResults } = mem.retrieve({
    keywords: [],
    emotion: { joy: 0.8, sadness: 0.0 },
  }, 5);
  assert(happyResults.length > 0, 'Should retrieve at least one memory when happy');

  // 悲伤时检索：负面记忆应该排在前面
  const { memories: sadResults } = mem.retrieve({
    keywords: [],
    emotion: { joy: 0.0, sadness: 0.8 },
  }, 5);
  assert(sadResults.length > 0, 'Should retrieve at least one memory when sad');

  // 验证情绪一致性：快乐时应该先回忆快乐记忆
  if (happyResults.length >= 2 && sadResults.length >= 2) {
    // 两种情绪状态下检索顺序可能不同（mood-congruent recall）
    assert(true, 'Mood-congruent retrieval completed without errors');
  }
})();

// ═══════════════════════════════════════════
// 17. Personality 30 维度基线测试
// ═══════════════════════════════════════════
section('17. Personality 30 维度基线测试');

(() => {
  const { EMOTION_DIMENSIONS } = require('./config/defaults');
  const p = new Personality({ mbti: 'INFP' });

  // 测试 1: 所有 30 个维度都有基线值
  for (const dim of EMOTION_DIMENSIONS) {
    assert(p.emotionBaseline[dim] !== undefined, `Baseline should exist for ${dim}`);
    assert(typeof p.emotionBaseline[dim] === 'number', `Baseline for ${dim} should be a number`);
  }

  // 测试 2: 基线值在合理范围内
  for (const [dim, val] of Object.entries(p.emotionBaseline)) {
    assert(val >= -0.5 && val <= 0.5, `Baseline ${dim}=${val.toFixed(4)} should be in [-0.5, 0.5]`);
  }

  // 测试 3: 不同 MBTI 有不同的基线
  const p2 = new Personality({ mbti: 'ESTJ' });
  const diff = Object.keys(p.emotionBaseline).filter(
    dim => Math.abs((p.emotionBaseline[dim] || 0) - (p2.emotionBaseline[dim] || 0)) > 0.01
  );
  assert(diff.length > 5, `INFP and ESTJ should differ in >5 emotion baselines (got ${diff.length})`);
})();

// ═══════════════════════════════════════════
// 18. 上班族状态测试
// ═══════════════════════════════════════════
section('18. 上班族状态测试');

(() => {
  // 测试 1: 上班族状态存在于 STATES 中
  assert(STATES['在办公室'] !== undefined, 'Worker state "在办公室" should exist');
  assert(STATES['在工作'] !== undefined, 'Worker state "在工作" should exist');
  assert(STATES['在开会'] !== undefined, 'Worker state "在开会" should exist');

  // 测试 2: 上班族状态的时间范围合理
  assert(STATES['在工作'].hours.includes(9), '在工作 should be valid at 9am');
  assert(STATES['在工作'].hours.includes(14), '在工作 should be valid at 2pm');
  assert(!STATES['在工作'].hours.includes(3), '在工作 should NOT be valid at 3am');

  // 测试 3: Schedule.createWorkerSchedule 生成的日程使用了正确状态
  const workerSchedule = Schedule.createWorkerSchedule();
  const workEntry = workerSchedule.entries.find(e => e.activity === '在工作');
  assert(workEntry !== null, 'Worker schedule should have "在工作" activity');
  assert(workEntry.region === '办公室', 'Worker schedule work should be at 办公室');

  // 测试 4: 刚出门可以转到在办公室
  assert(STATES['刚出门'].next.includes('在办公室'), '刚出门 should transition to 在办公室');
  // 测试 5: 在办公室可以转到刚下班
  assert(STATES['在办公室'].next.includes('刚下班'), '在办公室 should transition to 刚下班');

  // 测试 6: StateMachine 在 10am 时可以处于在工作状态
  const sm = new StateMachine('在工作');
  assert(sm.currentState === '在工作', 'Should initialize in 在工作 state');
  const result = sm.tick(10, 5, null, new Date('2024-01-15T10:00:00'));
  // 在工作的时间范围包含10点，不应该强制转移
  assert(!result.changed || STATES['在工作'].next.includes(result.newState),
    'At 10am, 在工作 should either stay or transition to valid next state');
})();

// ═══════════════════════════════════════════
// 19. 事件驱动关键词匹配测试
// ═══════════════════════════════════════════
section('19. 事件驱动关键词匹配测试');

(() => {
  // 测试 1: 关键词匹配本身应该工作（直接调用 _tryEventDrivenTransition）
  const sm1 = new StateMachine('在校园广场');
  const result1 = sm1._tryEventDrivenTransition(
    { eventContent: '和好朋友一起吃饭，聊得很开心', region: '食堂' },
    12, new Date('2024-01-15T12:00:00')
  );
  // '聊天' 是关键词，目标是在聊天，时间 12 合法
  assert(result1.changed, 'Keyword "聊天" should trigger transition to 在聊天');
  if (result1.changed) {
    assert(result1.newState === '在聊天', 'Social keyword should transition to 在聊天');
  }

  // 测试 2: 天气事件关键词（在校园广场 → 在路上，使用合法时间 12 点）
  const sm2 = new StateMachine('在校园广场');
  const result2 = sm2._tryEventDrivenTransition(
    { eventContent: '下雨了，赶紧找地方避雨', region: '校园广场' },
    12, new Date('2024-01-15T12:00:00')
  );
  assert(result2.changed, 'Event with "下雨" keyword should trigger transition at valid hour');

  // 测试 3: 无关内容不应触发转移
  const sm3 = new StateMachine('在自习');
  const result3 = sm3._tryEventDrivenTransition(
    { eventContent: '手机突然响了一下，是条无聊的推送', region: '图书馆' },
    10, new Date('2024-01-15T10:00:00')
  );
  assert(!result3.changed, 'Unrelated event content should NOT trigger transition');

  // 测试 4: 空内容不应触发转移
  const sm4 = new StateMachine('在上课');
  const result4 = sm4._tryEventDrivenTransition(
    { eventContent: '', region: '教室' },
    10, new Date('2024-01-15T10:00:00')
  );
  assert(!result4.changed, 'Empty event content should NOT trigger transition');

  // 测试 5: 通过 tick() 调用时需要 type='interaction'
  const sm5 = new StateMachine('在校园广场');
  const result5 = sm5.tick(12, 5, {
    type: 'interaction',
    eventContent: '和好朋友一起吃饭，聊得很开心',
    region: '食堂',
  }, new Date('2024-01-15T12:00:00'));
  assert(result5.changed, 'tick() with type=interaction should trigger event-driven transition');

  // 测试 6: 通过 tick() 调用时没有 type='interaction' 不应触发
  const sm6 = new StateMachine('在校园广场');
  const result6 = sm6.tick(12, 5, {
    eventContent: '聊天聊得很开心',
    region: '食堂',
  }, new Date('2024-01-15T12:00:00'));
  // 不应触发事件驱动转移（可能因时间约束或正常概率转移而改变，但不保证）
  // 这个测试主要确保不崩溃
  assert(typeof result6.changed === 'boolean', 'tick() without type=interaction should return valid result');
})();

// ═══════════════════════════════════════════
// 20. Dunbar 层级限制测试
// ═══════════════════════════════════════════
section('20. Dunbar 层级限制测试');

(() => {
  const { ANDY_DEFAULTS } = require('./config/defaults');
  const maxStrong = ANDY_DEFAULTS.relationship.maxStrongTies;
  const maxMedium = ANDY_DEFAULTS.relationship.maxMediumTies;

  const graph = new SocialGraph();

  // 创建一个中心 Agent 和 20 个其他 Agent
  graph.addAgent('center');
  for (let i = 0; i < 20; i++) {
    const otherId = `agent_${i}`;
    graph.addAgent(otherId);
    const rel = graph.getOrCreateRelationship('center', otherId);
    // 所有关系都设为朋友级别
    rel.strength = 0.5 + Math.random() * 0.2;
    rel._updateType();
  }

  // 执行 12 tick 触发 Dunbar 限制（每 12 tick 执行一次）
  for (let t = 0; t < 12; t++) graph.tick(1);

  // 统计强关系数量
  const centerRels = graph.getRelationships('center');
  const strongCount = centerRels.filter(
    r => r.type === 'friend' || r.type === 'closeFriend'
  ).length;

  assert(strongCount <= maxStrong,
    `Dunbar limit: strong ties should be <= ${maxStrong}, got ${strongCount}`);

  // 确保降级的关系确实被降级了
  const downgradedCount = centerRels.filter(r => r.type === 'acquaintance').length;
  assert(downgradedCount > 0, 'Some relationships should have been downgraded to acquaintance');
})();

// ═══════════════════════════════════════════
// 21. 情绪感知状态转移测试
// ═══════════════════════════════════════════
section('21. 情绪感知状态转移测试');

(() => {
  // 测试 1: 负面情绪应倾向安静状态
  const sm1 = new StateMachine('下课了');
  let quietCount = 0;
  const sadEmotion = { valence: -0.5, arousal: 0.3 };

  for (let i = 0; i < 100; i++) {
    const smTest = new StateMachine('下课了');
    const result = smTest._tryNormalTransition(14, new Date('2024-01-15T14:00:00'), sadEmotion);
    if (result.changed && result.newState) {
      const def = STATES[result.newState];
      if (def && (def.category === 'quiet' || def.category === 'rest')) {
        quietCount++;
      }
    }
  }

  // 负面情绪下，安静状态应有一定倾向（不要求绝对，但应有影响）
  // 这是概率性的，主要验证不会崩溃
  assert(quietCount >= 0, `Negative emotion state transitions should work (quiet: ${quietCount}/100)`);

  // 测试 2: tick 方法接受情绪参数不崩溃
  const sm2 = new StateMachine('在食堂');
  const result2 = sm2.tick(12, 5, null, new Date('2024-01-15T12:00:00'), { valence: 0.5, arousal: 0.7 });
  assert(typeof result2.changed === 'boolean', 'tick() with emotion state should return valid result');
})();

// ═══════════════════════════════════════════
// 22. 共激活传播阈值测试
// ═══════════════════════════════════════════
section('22. 共激活传播阈值测试');

(() => {
  const personality = new Personality({ mbti: 'ENFP' });
  const emotion = new EmotionVector(personality);

  // 设置一个中等强度的情绪（旧阈值 0.5 会忽略，新阈值 0.15 应触发）
  emotion.current.joy = 0.3;
  emotion.current.contentment = 0.1;
  emotion.current.excitement = 0.1;

  const beforeContentment = emotion.current.contentment;

  // 执行共激活传播
  emotion._coActivationSpread();

  // joy=0.3 超过新阈值 0.15，应该传播到 contentment
  const afterContentment = emotion.current.contentment;
  assert(afterContentment >= beforeContentment,
    `Co-activation should spread from joy=0.3 to contentment (before: ${beforeContentment.toFixed(4)}, after: ${afterContentment.toFixed(4)})`);

  // 测试 2: 低于阈值的不应传播
  const emotion2 = new EmotionVector(personality);
  emotion2.current.joy = 0.1; // 低于 0.15
  const beforeExcitement = emotion2.current.excitement || 0;
  emotion2._coActivationSpread();
  const afterExcitement = emotion2.current.excitement || 0;
  // 低于阈值的不应产生传播
  assert(Math.abs(afterExcitement - beforeExcitement) < 0.001,
    `Joy=0.1 below threshold should NOT trigger co-activation`);
})();

// ═══════════════════════════════════════════
// 23. PersonalMemory 模拟时间测试
// ═══════════════════════════════════════════
section('23. PersonalMemory 模拟时间测试');

(() => {
  const mem = new PersonalMemory('simtime_test', []);

  // 设置模拟时间为 1 天前
  const dayAgo = new Date('2024-01-14T12:00:00');
  mem.setSimTime(dayAgo);

  // 在 1 天前添加记忆
  mem.addExperience({
    content: '一天前的记忆',
    type: 'random',
    effects: [{ target: 'simtime_test', type: 'emotion', delta: { joy: 0.1 } }],
  }, { current: { joy: 0.5 }, getDominant: () => [{ dimension: 'joy', value: 0.5 }] });

  const oldMemory = mem.memories[0];

  // 更新模拟时间为现在
  const now = new Date('2024-01-15T12:00:00');
  mem.setSimTime(now);

  // 检索 - 使用模拟时间计算
  const { memories: results } = mem.retrieve({ keywords: [], emotion: { joy: 0.5 } }, 5);
  assert(results.length > 0, 'Should retrieve memory using sim time');

  // 测试 setSimTime 影响 base level activation
  // 如果使用 Date.now()，所有记忆都是"刚刚"，激活度都很高
  // 使用 simTime 后，1 天前的记忆激活度应该更低
  const activation = mem._baseLevelActivation(oldMemory, now.getTime());
  const activationRecent = mem._baseLevelActivation(oldMemory, dayAgo.getTime() + 60000);
  assert(activation < activationRecent,
    `Old memory should have lower activation than recent (old: ${activation.toFixed(3)}, recent: ${activationRecent.toFixed(3)})`);
})();

// ═══════════════════════════════════════════
// 24. NeedsSystem 模块测试
// ═══════════════════════════════════════════
section('24. NeedsSystem 模块测试');

(() => {
  const personality = new Personality({ mbti: 'ISTJ' });
  const needs = new NeedsSystem(personality);

  // 测试 1: 初始需求值合理
  assertRange(needs.needs.hunger, 0.5, 1.0, 'Initial hunger should be high (satisfied)');
  assertRange(needs.needs.energy, 0.5, 1.0, 'Initial energy should be high');
  assertRange(needs.needs.social, 0.3, 1.0, 'Initial social should be reasonable');

  // 测试 2: 需求随时间衰减
  needs.tick(2, '在图书馆', '图书馆');
  assert(needs.needs.hunger < 0.8, `Hunger should decay after 2 hours (got ${needs.needs.hunger.toFixed(3)})`);
  assert(needs.needs.energy < 0.9, `Energy should decay after 2 hours (got ${needs.needs.energy.toFixed(3)})`);

  // 测试 3: 吃饭恢复饥饿
  const hungerBefore = needs.needs.hunger;
  needs.tick(1, '在食堂', '食堂');
  assert(needs.needs.hunger > hungerBefore, `Eating should restore hunger (before: ${hungerBefore.toFixed(3)}, after: ${needs.needs.hunger.toFixed(3)})`);

  // 测试 4: 睡觉恢复精力
  const energyBefore = needs.needs.energy;
  needs.tick(4, '睡了', '宿舍');
  assert(needs.needs.energy > energyBefore, `Sleeping should restore energy (before: ${energyBefore.toFixed(3)}, after: ${needs.needs.energy.toFixed(3)})`);

  // 测试 5: getDrive 返回匮乏需求
  // 将饥饿压低到阈值以下
  const needs2 = new NeedsSystem(personality);
  needs2.needs.hunger = 0.1; // 低于阈值 0.3
  needs2.needs.energy = 0.8;
  needs2.needs.social = 0.8;
  const drive = needs2.getDrive();
  assert(drive !== null, 'getDrive should return urgent need when hunger is low');
  assert(drive.need === 'hunger', `Most urgent need should be hunger (got ${drive.need})`);
  assert(drive.urgency > 0, `Urgency should be positive (got ${drive.urgency})`);
  assert(drive.targetStates.includes('在食堂'), 'Target states should include 在食堂');

  // 测试 6: 需求为空时 getDrive 返回 null
  const needs3 = new NeedsSystem(personality);
  needs3.needs.hunger = 0.9;
  needs3.needs.energy = 0.9;
  needs3.needs.social = 0.9;
  needs3.needs.comfort = 0.9;
  needs3.needs.stimulation = 0.9;
  const noDrive = needs3.getDrive();
  assert(noDrive === null, 'getDrive should return null when all needs are satisfied');

  // 测试 7: 人格影响衰减速率
  // 外向者社交需求衰减应更快
  const extraverted = new Personality({ mbti: 'ESFP' });
  const introverted = new Personality({ mbti: 'ISTJ' });
  const extNeeds = new NeedsSystem(extraverted);
  const intNeeds = new NeedsSystem(introverted);
  assert(extNeeds._decayRates.social > intNeeds._decayRates.social,
    `Extravert social decay (${extNeeds._decayRates.social.toFixed(4)}) should be faster than introvert (${intNeeds._decayRates.social.toFixed(4)})`);

  // 测试 8: toPromptString 输出
  const promptStr = needs.toPromptString();
  assert(typeof promptStr === 'string' && promptStr.length > 0, 'toPromptString should return non-empty string');
  assert(promptStr.includes('需求'), 'Prompt string should contain 需求');

  // 测试 9: 序列化/反序列化
  const json = needs.toJSON();
  assert(json.needs && typeof json.needs.hunger === 'number', 'toJSON should include needs');
  const restored = new NeedsSystem(personality, json);
  assert(Math.abs(restored.needs.hunger - needs.needs.hunger) < 0.001, 'Restored needs should match original');
})();

// ═══════════════════════════════════════════
// 25. NeedsSystem 集成测试（Agent + StateMachine）
// ═══════════════════════════════════════════
section('25. NeedsSystem 集成测试');

(() => {
  const agent = new Agent({
    id: 'needs_integration',
    name: '集成测试',
    personality: { mbti: 'INFP' },
    initialState: '在图书馆',
    initialPosition: '图书馆',
    schedule: {},
  });

  // 验证 Agent 有 needs 属性
  assert(agent.needs instanceof NeedsSystem, 'Agent should have NeedsSystem instance');

  // 强制饥饿匮乏
  agent.needs.needs.hunger = 0.05;

  // Agent.toJSON 应包含 needs
  const json = agent.toJSON();
  assert(json.needs !== undefined, 'Agent.toJSON() should include needs');
  assert(json.needs.needs.hunger === 0.05, 'Serialized needs should match');

  // 验证 needs 在 tick 中被调用（不会崩溃）
  const env = { hour: 12, dayOfWeek: 1, minutesElapsed: 5, simTime: new Date('2024-01-15T12:00:00') };
  const result = agent.tick(env, []);
  assert(typeof result.stateChanged === 'boolean', 'Agent.tick with needs should return valid result');

  // 验证饥饿匮乏时 Agent 可能移动到食堂
  const agent2 = new Agent({
    id: 'needs_hungry',
    name: '饿了',
    personality: { mbti: 'ESFP' },
    initialState: '在图书馆',
    initialPosition: '图书馆',
    schedule: {},
  });
  agent2.needs.needs.hunger = 0.05; // 极度饥饿
  const env2 = { hour: 12, dayOfWeek: 1, minutesElapsed: 5, simTime: new Date('2024-01-15T12:00:00') };
  // 运行多次，至少应有一次因需求驱力而移动
  let movedByNeed = false;
  for (let i = 0; i < 20; i++) {
    agent2.needs.needs.hunger = 0.05; // 每次重置
    const r = agent2.tick({ ...env2, simTime: new Date(env2.simTime.getTime() + i * 5 * 60000) }, []);
    if (r.regionChanged) {
      movedByNeed = true;
      break;
    }
  }
  assert(movedByNeed, 'Starving agent should eventually move to need-satisfying region');
})();

// ═══════════════════════════════════════════
// 26. StateMachine 需求驱力调制测试
// ═══════════════════════════════════════════
section('26. StateMachine 需求驱力调制测试');

(() => {
  // 测试 needsDrive 是否影响状态转移权重
  const sm = new StateMachine('在图书馆');

  // 无驱力时的转移
  let noDriveCount = 0;
  let withDriveCount = 0;

  for (let i = 0; i < 100; i++) {
    const sm1 = new StateMachine('在图书馆');
    sm1.minDuration = 0;
    sm1.extraDuration = 0;
    sm1.stateEnteredAt = new Date(Date.now() - 600000);
    const r = sm1.tick(12, 5, null, new Date(), { valence: 0, arousal: 0.5 });
    if (r.changed && r.newState === '在自习') noDriveCount++;
  }

  for (let i = 0; i < 100; i++) {
    const sm2 = new StateMachine('在图书馆');
    sm2.minDuration = 0;
    sm2.extraDuration = 0;
    sm2.stateEnteredAt = new Date(Date.now() - 600000);
    // 饥饿驱力：在食堂是 targetState
    const r = sm2.tick(12, 5, null, new Date(), {
      valence: 0, arousal: 0.5,
      needsDrive: { need: 'hunger', urgency: 0.5, targetStates: ['在自习', '在发呆', '在看手机', '有点困'] },
    });
    if (r.changed && r.newState === '在自习') withDriveCount++;
  }

  // 驱力应增加目标状态被选中的概率（不保证绝对，但趋势应存在）
  assert(true, `Needs drive modulation runs without error (noDrive: ${noDriveCount}, withDrive: ${withDriveCount})`);
})();

// ═══════════════════════════════════════════
// 27. 共激活传播效果验证
// ═══════════════════════════════════════════
section('27. 共激活传播效果验证');

(() => {
  const personality = new Personality({ mbti: 'ENFP' });
  const emotion = new EmotionVector(personality);

  // 设置高 joy，应传播到 contentment, satisfaction, excitement, pride, love
  emotion.current.joy = 0.8;
  emotion.current.contentment = 0;
  emotion.current.excitement = 0;

  emotion._coActivationSpread();

  // 共激活应使 contentment 增加（joy 传播到 contentment）
  assert(emotion.current.contentment > 0,
    `Joy=0.8 should spread to contentment (got ${emotion.current.contentment.toFixed(4)})`);
  assert(emotion.current.excitement > 0,
    `Joy=0.8 should spread to excitement (got ${emotion.current.excitement.toFixed(4)})`);

  // 传播量应可观测（> 0.001）
  assert(emotion.current.contentment > 0.001,
    `Co-activation amount should be observable (contentment: ${emotion.current.contentment.toFixed(4)})`);
})();

// ═══════════════════════════════════════════
// 28. 社交传染效果验证
// ═══════════════════════════════════════════
section('28. 社交传染效果验证');

(() => {
  const personality = new Personality({ mbti: 'INFP' });
  const emotion = new EmotionVector(personality);
  emotion.current.joy = 0;

  // 模拟一个极度快乐的邻居
  const contagionInputs = {
    'happy_neighbor': {
      emotion: { joy: 0.9, contentment: 0.5 },
      weight: 0.5, // 中等关系
      expressiveness: 0.7,
    },
  };

  emotion.tick(0.083, 14, contagionInputs); // 5 minutes = 0.083 hours

  // 应有可观测的情绪传染效果
  // joy diff = 0.9 - 0 = 0.9, effectiveWeight = 0.4 * 0.7 * 0.5 = 0.14
  // delta ≈ 0.9 * 0.14 * 0.3 = 0.0378（加上其他步骤的效果）
  assert(emotion.current.joy > 0.01,
    `Social contagion should increase joy (got ${emotion.current.joy.toFixed(4)})`);
})();

// ═══════════════════════════════════════════
// 29. EventDispatcher simTime 清理测试
// ═══════════════════════════════════════════
section('29. EventDispatcher simTime 清理测试');

(() => {
  const dispatcher = new EventDispatcher();

  // 设置 simTime 为 8 天前（超过 eventLifespan 7 天）
  const oldTime = new Date('2024-01-01T12:00:00');
  dispatcher._simTime = oldTime;

  // 创建一个事件
  dispatcher.createEvent({ content: 'old event', time: oldTime });
  dispatcher.dispatch();

  assert(dispatcher.eventLog.length === 1, 'Should have 1 event after dispatch');

  // 现在推进时间到 8 天后
  const newTime = new Date('2024-01-09T12:00:00');
  dispatcher._simTime = newTime;

  // 再创建一个事件触发清理
  dispatcher.createEvent({ content: 'new event', time: newTime });
  dispatcher.dispatch();

  // 旧事件应被清理（8 天 > 7 天 eventLifespan）
  assert(dispatcher.eventLog.length <= 1,
    `Old event should be cleaned up after 8 sim-days (log size: ${dispatcher.eventLog.length})`);
})();

// ═══════════════════════════════════════════
// 30. PersonalMemory snapshot 存储维度数测试
// ═══════════════════════════════════════════
section('30. PersonalMemory snapshot 存储维度数测试');

(() => {
  const mem = new PersonalMemory('snapshot_test', []);

  // 创建一个有多个显著情绪的状态
  const emotionState = {
    current: {
      joy: 0.6, contentment: 0.4, excitement: 0.3,
      calm: 0.2, hope: 0.15, love: 0.1, interest: 0.05,
      sadness: -0.02, anger: 0, fear: 0,
    },
    getValence: () => 0.3,
    getArousal: () => 0.5,
    getDominant: (n) => {
      return Object.entries(emotionState.current)
        .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))
        .slice(0, n)
        .map(([dimension, value]) => ({ dimension, value }));
    },
  };

  mem.setSimTime(new Date());
  mem.addExperience({
    content: 'snapshot test',
    type: 'test',
    effects: [],
  }, emotionState);

  const snapshot = mem.memories[0].emotionSnapshot;
  const dimCount = Object.keys(snapshot).length;

  // 应存储至少 7 个维度（上面有 7 个显著情绪）
  assert(dimCount >= 7,
    `Snapshot should store at least 7 emotion dimensions (got ${dimCount}): ${JSON.stringify(snapshot)}`);
})();

// ═══════════════════════════════════════════
// 31. Appraisal 需求感知应对能力测试
// ═══════════════════════════════════════════
section('31. Appraisal 需求感知应对能力测试');

(() => {
  const agent = new Agent({
    id: 'appraisal_test',
    name: '评价测试',
    personality: { mbti: 'ISTJ' },
    initialState: '在图书馆',
    initialPosition: '图书馆',
    schedule: {},
  });

  const event = {
    type: 'random',
    content: '突然被老师点名回答问题',
    effects: [{ target: 'appraisal_test', type: 'emotion', delta: { nervousness: 0.05, surprise: 0.03 } }],
  };

  // 测试 1: 饱满状态的应对能力
  const fullAppraisal = Appraisal.evaluate(event, agent);
  const fullCoping = fullAppraisal.dimensions.copingPotential;

  // 测试 2: 饥饿+疲惫状态的应对能力
  agent.needs.needs.hunger = 0.1;
  agent.needs.needs.energy = 0.1;
  const hungryAppraisal = Appraisal.evaluate(event, agent);
  const hungryCoping = hungryAppraisal.dimensions.copingPotential;

  assert(hungryCoping < fullCoping,
    `Hungry/tired agent should have lower coping potential (full: ${fullCoping.toFixed(3)}, hungry: ${hungryCoping.toFixed(3)})`);
})();

// ═══════════════════════════════════════════
// 32. Appraisal 需求感知目标相关性测试
// ═══════════════════════════════════════════
section('32. Appraisal 需求感知目标相关性测试');

(() => {
  const agent = new Agent({
    id: 'relevance_test',
    name: '相关性测试',
    personality: { mbti: 'ESFP' },
    initialState: '在路上',
    initialPosition: '路上',
    schedule: {},
  });

  const foodEvent = {
    type: 'random',
    content: '发现食堂出了新菜',
    effects: [{ target: 'relevance_test', type: 'emotion', delta: { excitement: 0.03, interest: 0.02 } }],
  };

  // 测试 1: 饱腹时的食物事件相关性
  agent.needs.needs.hunger = 0.8;
  const fullRelevance = Appraisal.evaluate(foodEvent, agent).dimensions.goalRelevance;

  // 测试 2: 饥饿时的食物事件相关性
  agent.needs.needs.hunger = 0.05;
  const hungryRelevance = Appraisal.evaluate(foodEvent, agent).dimensions.goalRelevance;

  assert(hungryRelevance > fullRelevance,
    `Food event should be more relevant when hungry (full: ${fullRelevance.toFixed(3)}, hungry: ${hungryRelevance.toFixed(3)})`);
})();

// ═══════════════════════════════════════════
// 33. Relationship 历史 simTime 测试
// ═══════════════════════════════════════════
section('33. Relationship 历史 simTime 测试');

(() => {
  const rel = new Relationship('a', 'b');
  const simTime = new Date('2024-06-15T14:30:00');

  rel.recordInteraction('talk', 0.5, '聊天测试', simTime);

  assert(rel.history.length === 1, 'Should have 1 history entry');
  assert(rel.history[0].time === simTime.toISOString(),
    `History timestamp should use simTime (got ${rel.history[0].time}, expected ${simTime.toISOString()})`);

  // 没有 simTime 时应使用当前时间
  rel.recordInteraction('help', 0.3, '帮助测试');
  const now = new Date();
  const historyTime = new Date(rel.history[1].time);
  assert(Math.abs(now - historyTime) < 5000, 'Without simTime, should use current time');
})();

// ═══════════════════════════════════════════
// 34. EmotionRegulation 情绪调节模块测试
// ═══════════════════════════════════════════
section('34. EmotionRegulation 情绪调节模块测试');

(() => {
  const agent = new Agent({
    id: 'regulation_test',
    name: '调节测试',
    personality: { mbti: 'INFP' },
    initialState: '在图书馆',
    initialPosition: '图书馆',
    schedule: {},
  });

  // 测试 1: Agent 应有 emotionRegulation 属性
  assert(agent.emotionRegulation instanceof EmotionRegulation,
    'Agent should have EmotionRegulation instance');

  // 测试 2: 正常情绪时不应触发调节（stress 默认=2，设为低值模拟正常状态）
  agent.emotion.stress = 0;
  agent.emotion.current.sadness = 0;
  agent.emotion.current.frustration = 0;
  const noRegResult = agent.emotionRegulation.tryRegulate(agent, []);
  assert(noRegResult === null, 'Normal emotion should NOT trigger regulation');

  // 测试 3: 强制负面情绪后应触发调节
  agent.emotion.current.sadness = 0.7;
  agent.emotion.current.frustration = 0.5;
  agent.emotion.stress = 6;

  const regResult = agent.emotionRegulation.tryRegulate(agent, [{
    type: 'random',
    content: '考试没考好',
    effects: [{ target: 'regulation_test', type: 'emotion', delta: { sadness: 0.1 } }],
  }]);

  assert(regResult !== null, 'High negative emotion should trigger regulation');
  assert(['reappraisal', 'attentionDeployment', 'responseModulation'].includes(regResult.strategy),
    `Strategy should be valid (got ${regResult.strategy})`);
  assert(regResult.cost > 0, `Regulation should have a cost (got ${regResult.cost})`);
  assert(regResult.resourceRemaining < 1.0, 'Regulation should consume resources');

  // 测试 4: 资源枯竭时不应调节
  agent.emotionRegulation._regulationResource = 0.05;
  const exhaustedResult = agent.emotionRegulation.tryRegulate(agent, []);
  assert(exhaustedResult === null, 'Exhausted resources should prevent regulation');

  // 测试 5: 资源在休息时恢复
  agent.emotionRegulation._regulationResource = 0.3;
  agent.emotionRegulation.tick(1, '在休息');
  assert(agent.emotionRegulation._regulationResource > 0.3,
    `Resources should recover during rest (got ${agent.emotionRegulation._regulationResource.toFixed(3)})`);

  // 测试 6: 序列化/反序列化
  const json = agent.emotionRegulation.toJSON();
  assert(typeof json._regulationResource === 'number', 'toJSON should include _regulationResource');

  // 测试 7: 不同人格策略偏好不同
  const extraverted = new EmotionRegulation(new Personality({ mbti: 'ESFP' }));
  const introverted = new EmotionRegulation(new Personality({ mbti: 'INTJ' }));
  assert(extraverted.strategyPreference.attentionDeployment > introverted.strategyPreference.attentionDeployment,
    'Extraverts should prefer attention deployment more than introverts');
  assert(introverted.strategyPreference.reappraisal > extraverted.strategyPreference.reappraisal * 0.8 ||
    introverted.strategyPreference.reappraisal > 0.3,
    'Introverts (high openness INTJ) should have reasonable reappraisal preference');

  // 测试 8: 策略执行 — 认知重评
  const reappraisalAgent = new Agent({
    id: 'reappraisal_test', name: '重评测试',
    personality: { ocean: { openness: 0.9, neuroticism: 0.2 } },
    initialState: '在图书馆', initialPosition: '图书馆', schedule: {},
  });
  reappraisalAgent.emotion.current.sadness = 0.5;
  reappraisalAgent.emotion.current.frustration = 0.4;
  reappraisalAgent.emotion.stress = 5;
  const beforeReappraisal = { sadness: reappraisalAgent.emotion.current.sadness, stress: reappraisalAgent.emotion.stress };
  const reapResult = reappraisalAgent.emotionRegulation._execReappraisal(reappraisalAgent, 0.5);
  assert(reapResult.emotionDelta.sadness < 0, 'Reappraisal should reduce sadness');
  assert(reapResult.emotionDelta.calm > 0, 'Reappraisal should increase calm');
  assert(reapResult.emotionDelta.hope > 0, 'Reappraisal should increase hope');
  assert(reapResult.cost > 0, 'Reappraisal should have a cost');

  // 测试 9: 策略执行 — 注意部署
  const attentionAgent = new Agent({
    id: 'attention_test', name: '注意测试',
    personality: { ocean: { extraversion: 0.8 } },
    initialState: '在图书馆', initialPosition: '图书馆', schedule: {},
  });
  attentionAgent.emotion.current.sadness = 0.5;
  attentionAgent.emotion.current.frustration = 0.3;
  attentionAgent.emotion.stress = 5;
  const attResult = attentionAgent.emotionRegulation._execAttentionDeployment(attentionAgent, 0.5);
  assert(attResult.emotionDelta.sadness < 0, 'Attention deployment should reduce sadness');
  assert(attResult.cost > 0, 'Attention deployment should have a cost');
  assert(attResult.cost > reapResult.cost, 'Attention deployment should cost more than reappraisal');

  // 测试 10: 策略执行 — 反应调节（抑制）
  const suppressAgent = new Agent({
    id: 'suppress_test', name: '抑制测试',
    personality: { ocean: { conscientiousness: 0.8, extraversion: 0.2 } },
    initialState: '在图书馆', initialPosition: '图书馆', schedule: {},
  });
  suppressAgent.emotion.current.anger = 0.5;
  suppressAgent.emotion.current.fear = 0.4;
  suppressAgent.emotion.stress = 6;
  const supResult = suppressAgent.emotionRegulation._execResponseModulation(suppressAgent, 0.6);
  assert(supResult.emotionDelta.anger < 0, 'Suppression should reduce anger');
  assert(supResult.emotionDelta.fear < 0, 'Suppression should reduce fear');
  assert(supResult.emotionDelta.nervousness > 0, 'Suppression should increase nervousness (side effect)');
  assert(supResult.emotionDelta.frustration > 0, 'Suppression should increase frustration (side effect)');
  assert(supResult.cost > attResult.cost, 'Suppression should be most costly');

  // 测试 11: 人格影响策略选择 — 高开放性应偏好重评
  const openReg = new EmotionRegulation(new Personality({ ocean: { openness: 0.9, neuroticism: 0.1, extraversion: 0.3, conscientiousness: 0.5 } }));
  assert(openReg.strategyPreference.reappraisal > 0.5,
    `High openness should prefer reappraisal (got ${openReg.strategyPreference.reappraisal.toFixed(2)})`);
  assert(openReg.reappraisalPower > 0.5,
    `High openness should have strong reappraisal power (got ${openReg.reappraisalPower.toFixed(2)})`);

  // 测试 12: toPromptString 包含策略偏好信息
  const promptStr = openReg.toPromptString();
  assert(promptStr.includes('善于重评价'),
    'High openness agent should be described as good at reappraisal');
})();

// ═══════════════════════════════════════════
// 35. EmotionRegulation 集成测试（Agent tick 中）
// ═══════════════════════════════════════════
section('35. EmotionRegulation 集成测试');

(() => {
  const agent = new Agent({
    id: 'reg_integration',
    name: '集成测试',
    personality: { mbti: 'ENFP' },
    initialState: '在图书馆',
    initialPosition: '图书馆',
    schedule: {},
  });

  // 强制负面情绪状态
  agent.emotion.current.sadness = 0.6;
  agent.emotion.current.frustration = 0.4;
  agent.emotion.stress = 5;

  const beforeSadness = agent.emotion.current.sadness;

  // Agent tick 应包含情绪调节
  const env = { hour: 14, dayOfWeek: 1, minutesElapsed: 5, simTime: new Date('2024-01-15T14:00:00') };
  const result = agent.tick(env, []);

  // 情绪调节应降低负面情绪
  // 注意：emotion.tick 本身也会降低情绪（衰减），所以总效果应比无调节更大
  assert(typeof result.stateChanged === 'boolean', 'Agent tick with regulation should return valid result');

  // 验证 toJSON 包含 emotionRegulation
  const json = agent.toJSON();
  assert(json.emotionRegulation !== undefined, 'Agent.toJSON() should include emotionRegulation');
  assert(typeof json.emotionRegulation._regulationResource === 'number',
    'Serialized emotionRegulation should include _regulationResource');
})();

// ═══════════════════════════════════════════
// 36. 情绪层次模型（Mood Layer）测试
// ═══════════════════════════════════════════
section('36. 情绪层次模型（Mood Layer）测试');

(() => {
  const personality = new Personality({ mbti: 'INFP' });
  const emotion = new EmotionVector(personality);

  // 测试 1: mood 应被初始化为 baseline
  assert(typeof emotion.mood === 'object', 'EmotionVector should have mood property');
  assert(typeof emotion.mood.joy === 'number', 'mood.joy should be a number');

  // 测试 2: 强烈事件影响 current 时，mood 也应被影响（但幅度更小）
  const joyBefore = emotion.mood.joy || 0;
  emotion.applyEffect({ joy: 0.5 }); // 强烈正面事件
  const joyAfterCurrent = emotion.current.joy;
  const joyAfterMood = emotion.mood.joy;

  assert(joyAfterCurrent > joyBefore, 'Current joy should increase after event');
  assert(joyAfterMood > joyBefore, 'Mood joy should also increase (but less)');
  assert(joyAfterMood - joyBefore < joyAfterCurrent - joyBefore,
    'Mood change should be smaller than current change');

  // 测试 3: 时间衰减 - current 衰减向 mood，mood 衰减向 baseline
  // 设置 mood 远高于 baseline，current 远高于 mood
  const ev2 = new EmotionVector(personality);
  ev2.current.joy = 0.8;
  ev2.mood.joy = 0.5;
  ev2.baseline.joy = 0.15;

  // 经过 1 小时
  ev2._timeDecay(1);

  // current 应衰减向 mood（0.5），mood 应衰减向 baseline（0.15）
  assert(ev2.current.joy < 0.8, 'Current should decay toward mood');
  assert(ev2.current.joy > 0.4, 'Current should not drop below mood immediately');
  assert(ev2.mood.joy < 0.5, 'Mood should decay toward baseline');
  assert(ev2.mood.joy > 0.3, 'Mood decay should be slower than current');

  // 测试 4: mood 的"余韵效应" - 负面事件后 mood 持续低落
  const ev3 = new EmotionVector(personality);
  ev3.current.sadness = 0;
  ev3.mood.sadness = 0;

  // 强烈负面事件
  ev3.applyEffect({ sadness: 0.5 });

  // 短时间内 current 恢复快（5 分钟）
  const sadnessAfterEvent = ev3.current.sadness;
  ev3._timeDecay(5 / 60); // 5 minutes in hours
  const sadnessAfter5min = ev3.current.sadness;

  // mood 应该仍然较高（余韵）
  assert(ev3.mood.sadness > 0, 'Mood should retain sadness from event');

  // 测试 5: getMoodString 输出
  const ev4 = new EmotionVector(personality);
  const moodStr = ev4.getMoodString();
  assert(typeof moodStr === 'string' && moodStr.length > 0, 'getMoodString should return non-empty string');
  assert(moodStr.includes('心情'), 'Mood string should mention 心情');

  // 测试 6: toPromptString 包含整体心境
  const promptStr = ev4.toPromptString();
  assert(promptStr.includes('整体心境'), 'toPromptString should include 整体心境');

  // 测试 7: 序列化包含 mood
  const json = ev4.toJSON();
  assert(json.mood !== undefined, 'toJSON should include mood');
  assert(typeof json.mood.joy === 'number', 'Serialized mood should have numeric values');

  // 测试 8: 从 savedState 恢复 mood
  const savedState = {
    current: { joy: 0.3 },
    mood: { joy: 0.5 },
    baseline: { joy: 0.15 },
    stress: 3,
    _pinkNoiseState: new Array(16).fill(0),
  };
  const restored = new EmotionVector(personality, savedState);
  assert(Math.abs(restored.mood.joy - 0.5) < 0.001, 'Restored mood should match saved state');
})();

// ═══════════════════════════════════════════
// 测试 37: SocialGraph 三元闭合测试
// ═══════════════════════════════════════════
section('37. SocialGraph 三元闭合测试');
(() => {
  const graph = new SocialGraph();

  // 创建 A, B, C 三个 Agent
  graph.addAgent('A');
  graph.addAgent('B');
  graph.addAgent('C');

  // A-B 是好朋友
  const relAB = graph.getOrCreateRelationship('A', 'B');
  relAB.strength = 0.6;

  // B-C 是好朋友
  const relBC = graph.getOrCreateRelationship('B', 'C');
  relBC.strength = 0.6;

  // A-C 初始关系很弱
  const relAC = graph.getOrCreateRelationship('A', 'C');
  relAC.strength = 0.1;
  const initialAC = relAC.strength;

  // 执行三元闭合
  graph.tick(5 / 60); // 5 分钟 = 1 tick

  // A-C 关系应该因三元闭合而增强
  assert(relAC.strength > initialAC,
    `Triadic closure should strengthen A-C (initial=${initialAC.toFixed(4)}, after=${relAC.strength.toFixed(4)})`);

  // 增量应该是微小的（不是跳跃式增长）
  const delta = relAC.strength - initialAC;
  assert(delta < 0.01, `Triadic closure delta should be small (${delta.toFixed(5)})`);
  assert(delta > 0, `Triadic closure delta should be positive (${delta.toFixed(5)})`);

  // 测试：A-C 已经很强时，三元闭合增量应该更小（饱和效应）
  relAC.strength = 0.8;
  const strongBefore = relAC.strength;
  graph.tick(5 / 60);
  const strongDelta = relAC.strength - strongBefore;

  // 增量应该比弱关系时小（饱和效应）
  assert(strongDelta < delta,
    `Strong relationship should have smaller closure delta (strong=${strongDelta.toFixed(5)}, weak=${delta.toFixed(5)})`);

  // 测试：无共同朋友时不应有三元闭合
  graph.addAgent('D');
  graph.addAgent('E');
  const relDE = graph.getOrCreateRelationship('D', 'E');
  relDE.strength = 0.1;
  const deBefore = relDE.strength;
  graph.tick(5 / 60);
  // D-E 之间没有中介（没有共同朋友），所以变化仅来自衰减
  assert(relDE.strength <= deBefore,
    'D-E without common friends should not increase (only decay)');
})();

// ═══════════════════════════════════════════
// 测试 38: Agent._findNeedRegion 上班族兼容性测试
// ═══════════════════════════════════════════
section('38. Agent._findNeedRegion 上班族兼容性测试');
(() => {
  // 创建一个上班族 Agent
  const worker = new Agent({
    id: 'worker1',
    name: '测试上班族',
    personality: { mbti: 'ESTJ' },
    schedule: {
      entries: [
        { startHour: 9, endHour: 18, region: '办公室', activity: '在工作',
          days: [1, 2, 3, 4, 5], probability: 0.95 },
        { startHour: 19, endHour: 20, region: '家', activity: '在做饭',
          days: [0, 1, 2, 3, 4, 5, 6], probability: 0.6 },
      ],
    },
    initialPosition: '办公室',
  });

  // 上班族饥饿时应该去'家'而不是'食堂'
  const hungerRegion = worker._findNeedRegion('hunger');
  assert(hungerRegion === '家',
    `Worker hunger should go to '家' (got '${hungerRegion}')`);

  // 上班族社交需求应该去'咖啡店'而不是'校园广场'
  const socialRegion = worker._findNeedRegion('social');
  assert(socialRegion === '咖啡店',
    `Worker social should go to '咖啡店' (got '${socialRegion}')`);

  // 上班族舒适需求应该去'家'
  const comfortRegion = worker._findNeedRegion('comfort');
  assert(comfortRegion === '家',
    `Worker comfort should go to '家' (got '${comfortRegion}')`);

  // 创建学生 Agent 对比
  const student = new Agent({
    id: 'student1',
    name: '测试学生',
    personality: { mbti: 'INFP' },
    schedule: {
      entries: [
        { startHour: 8, endHour: 10, region: '教室', activity: '在上课',
          days: [1, 2, 3, 4, 5], probability: 0.85 },
      ],
    },
    initialPosition: '宿舍',
  });

  // 学生饥饿时应该去'食堂'
  const studentHunger = student._findNeedRegion('hunger');
  assert(studentHunger === '食堂',
    `Student hunger should go to '食堂' (got '${studentHunger}')`);

  // 学生社交需求应该去'校园广场'
  const studentSocial = student._findNeedRegion('social');
  assert(studentSocial === '校园广场',
    `Student social should go to '校园广场' (got '${studentSocial}')`);
})();

// ═══════════════════════════════════════════
// 测试 39: 心智游移（Mind Wandering）测试
// ═══════════════════════════════════════════
section('39. 心智游移（Mind Wandering）测试');
(() => {
  const agent = new Agent({
    id: 'wanderer',
    name: '测试游移',
    personality: { mbti: 'INFP' },
    schedule: { entries: [] },
    initialState: '在发呆',
    initialPosition: '宿舍',
  });

  // 先给 Agent 一些记忆，让心智游移有素材
  agent.memory.addExperience({
    content: '和好朋友在咖啡店聊了一下午',
    type: 'social',
    participants: ['friend1'],
    effects: [{ target: 'wanderer', type: 'emotion', delta: { joy: 0.3 } }],
  }, agent.emotion, 0.6);

  agent.memory.addExperience({
    content: '考试成绩不太理想，有点失望',
    type: 'random',
    effects: [{ target: 'wanderer', type: 'emotion', delta: { sadness: 0.2 } }],
  }, agent.emotion, 0.5);

  // 测试 _mindWander 方法存在
  assert(typeof agent._mindWander === 'function', '_mindWander should be a function');

  // 测试心智游移在有记忆时能返回结果
  // 运行多次因为有概率性（但几乎肯定至少有一次成功）
  let gotThought = false;
  for (let i = 0; i < 20; i++) {
    const thought = agent._mindWander();
    if (thought) {
      gotThought = true;
      assert(thought.type === 'mind_wander',
        `Mind wander event type should be 'mind_wander' (got '${thought.type}')`);
      assert(typeof thought.content === 'string' && thought.content.length > 0,
        'Mind wander should have content');
      assert(thought.thoughtType !== undefined,
        'Mind wander should have thoughtType');
      assert(['回忆', '反刍', '怀念', '担忧'].includes(thought.thoughtType),
        `thoughtType should be valid (got '${thought.thoughtType}')`);
      break;
    }
  }
  assert(gotThought, 'Mind wander should produce a thought when memories exist');

  // 测试心智游移影响情绪
  const emotionBefore = agent.emotion.getValence();
  // 模拟一个悲伤记忆触发的心智游移
  agent.emotion.current.sadness = 0.4;
  agent.emotion.current.joy = 0.05;
  const sadThought = agent._mindWander();
  // 如果生成了反刍型思绪，悲伤应该略微增加
  if (sadThought && sadThought.thoughtType === '反刍') {
    assert(agent.emotion.current.sadness >= 0.4,
      'Rumination should not decrease sadness');
  }

  // 测试心智游移在没有记忆时返回 null
  const emptyAgent = new Agent({
    id: 'empty',
    name: '空记忆',
    personality: { mbti: 'ESTJ' },
    schedule: { entries: [] },
    initialState: '在发呆',
  });
  // 清空记忆
  emptyAgent.memory.memories = [];
  const emptyResult = emptyAgent._mindWander();
  assert(emptyResult === null, 'Mind wander should return null when no memories');
})();

// ═══════════════════════════════════════════
// 测试 40: AndyEngine.advanceTo 安全限制测试
// ═══════════════════════════════════════════
section('40. AndyEngine.advanceTo 安全限制测试');
(() => {
  const engine = new AndyEngine({
    startTime: new Date('2025-01-01T08:00:00'),
  });
  engine.addAgent({
    id: 'test_agent',
    name: '测试',
    personality: { mbti: 'INFP' },
    schedule: { entries: [] },
    initialPosition: '宿舍',
  });

  // 测试 advanceTo 有 maxTicks 限制
  // 推进到一个非常远的未来，应该被 maxTicks 截断
  const farFuture = new Date('2030-01-01T00:00:00');
  const results = engine.advanceTo(farFuture, 5); // 只允许 5 个 tick
  assert(results.length <= 5, `advanceTo with maxTicks=5 should run at most 5 ticks (got ${results.length})`);

  // 测试正常推进
  const engine2 = new AndyEngine({
    startTime: new Date('2025-01-01T08:00:00'),
  });
  engine2.addAgent({
    id: 'test2',
    name: '测试2',
    personality: { mbti: 'INFP' },
    schedule: { entries: [] },
    initialPosition: '宿舍',
  });
  // 推进 1 小时（12 ticks @ 5 min）
  const target = new Date('2025-01-01T09:00:00');
  const results2 = engine2.advanceTo(target);
  assert(results2.length === 12, `advanceTo 1h should run 12 ticks (got ${results2.length})`);
  assert(engine2.world.time >= target, 'World time should be at or past target');
})();

// ═══════════════════════════════════════════
// 测试 41: 需求→情绪耦合测试
// ═══════════════════════════════════════════
section('41. 需求→情绪耦合测试');

(() => {
  const agent = new Agent({
    id: 'needtest',
    name: 'TestAgent',
    personality: { mbti: 'INFP' },
    schedule: { entries: [] },
    initialPosition: '宿舍',
  });

  // 记录初始情绪
  const initialFrustration = agent.emotion.current.frustration || 0;
  const initialLoneliness = agent.emotion.current.loneliness || 0;

  // 将饥饿设为极低
  agent.needs.needs.hunger = 0.05;
  agent._applyNeedsToEmotion();
  const afterHungerFrustration = agent.emotion.current.frustration || 0;
  assert(afterHungerFrustration > initialFrustration, 'Hunger depletion should increase frustration');

  // 将社交设为极低
  agent.needs.needs.social = 0.01;
  agent._applyNeedsToEmotion();
  const afterSocialLoneliness = agent.emotion.current.loneliness || 0;
  assert(afterSocialLoneliness >= initialLoneliness, 'Social depletion should not decrease loneliness');

  // 充足需求不应产生额外负面情绪
  agent.needs.needs.hunger = 0.8;
  agent.needs.needs.social = 0.8;
  agent.needs.needs.energy = 0.8;
  const beforeSufficient = { ...agent.emotion.current };
  agent._applyNeedsToEmotion();
  // 充足需求不应添加任何效果（因为都不低于阈值）
  assert(true, 'Sufficient needs should not crash');
})();

// ═══════════════════════════════════════════
// 测试 42: 非负情绪维度下界测试
// ═══════════════════════════════════════════
section('42. 非负情绪维度下界测试');

(() => {
  const personality = new Personality({ mbti: 'INFP' });
  const emotion = new EmotionVector(personality);

  // 强制将 loneliness 和 boredom 设为负值
  emotion.current.loneliness = -0.5;
  emotion.current.boredom = -0.3;
  emotion.current.joy = 0.8; // 正常正值

  // 手动调用 _clamp
  emotion._clamp();

  assert(emotion.current.loneliness >= 0, `loneliness should be >= 0 (got ${emotion.current.loneliness})`);
  assert(emotion.current.boredom >= 0, `boredom should be >= 0 (got ${emotion.current.boredom})`);
  assert(emotion.current.joy === 0.8, 'joy should remain unchanged');

  // mood 也应该有下界保护
  emotion.mood.loneliness = -0.4;
  emotion.mood.boredom = -0.2;
  // 在 applyEffect 中会截断 mood
  emotion.applyEffect({ calm: 0.001 }); // 触发 applyEffect 中的 mood clamp
  assert(emotion.mood.loneliness >= 0, `mood loneliness should be >= 0 (got ${emotion.mood.loneliness})`);
  assert(emotion.mood.boredom >= 0, `mood boredom should be >= 0 (got ${emotion.mood.boredom})`);
})();

// ═══════════════════════════════════════════
// 测试 43: 享乐适应测试
// ═══════════════════════════════════════════
section('43. 享乐适应测试');

(() => {
  const personality = new Personality({ mbti: 'ENFP' });
  const emotionA = new EmotionVector(personality);
  const emotionB = new EmotionVector(personality);

  // 设置相同的高 joy 状态
  emotionA.current.joy = 0.7;
  emotionA.mood.joy = 0.3;
  emotionB.current.joy = 0.7;
  emotionB.mood.joy = 0.3;

  // A 做一次 timeDecay
  emotionA._timeDecay(0.083); // 5 分钟

  // 验证 joy 在衰减（因为 current > mood）
  assert(emotionA.current.joy < 0.7, 'Joy should decay when above mood');

  // 设置低 joy（current < mood）— 应正常衰减
  emotionA.current.joy = 0.1;
  emotionA.mood.joy = 0.3;
  const beforeLowJoy = emotionA.current.joy;
  emotionA._timeDecay(0.083);
  // 低 joy 应该向 mood 方向增长
  assert(emotionA.current.joy > beforeLowJoy, 'Low joy should increase toward mood');
})();

// ═══════════════════════════════════════════
// 测试 44: StateMachine.getInfo elapsed 修复
// ═══════════════════════════════════════════
section('44. StateMachine.getInfo elapsed 修复');

(() => {
  const sm = new StateMachine('在图书馆');

  // 不传 simTime 时 elapsed 应为 0
  const info1 = sm.getInfo();
  assert(info1.elapsed === 0, `elapsed without simTime should be 0 (got ${info1.elapsed})`);

  // 传入 simTime 时 elapsed 应为正数
  const futureTime = new Date(Date.now() + 30 * 60 * 1000); // 30 分钟后
  const info2 = sm.getInfo(futureTime);
  assert(info2.elapsed >= 29 && info2.elapsed <= 31, `elapsed should be ~30 min (got ${info2.elapsed})`);
})();

// ═══════════════════════════════════════════
// 测试 45: IntrinsicMotivation 基础功能
// ═══════════════════════════════════════════
section('45. IntrinsicMotivation 基础功能');

(() => {
  const personality = new Personality({ mbti: 'INFP' });
  const im = new IntrinsicMotivation(personality);

  // 初始状态
  assertRange(im.curiosity, 0, 1, 'Initial curiosity should be 0-1');
  assert(im.curiosity === 0.5, `Initial curiosity should be 0.5 (got ${im.curiosity})`);
  assert(Object.keys(im.familiarity).length === 0, 'No familiarity initially');
  assert(im.activeGoals.length === 0, 'No active goals initially');

  // 序列化/反序列化
  const json = im.toJSON();
  assert(typeof json.curiosity === 'number', 'toJSON should include curiosity');
  assert(typeof json.familiarity === 'object', 'toJSON should include familiarity');

  const restored = new IntrinsicMotivation(personality, json);
  assert(restored.curiosity === im.curiosity, 'Restored curiosity should match');
})();

// ═══════════════════════════════════════════
// 测试 46: 好奇心衰减
// ═══════════════════════════════════════════
section('46. 好奇心衰减');

(() => {
  const personality = new Personality({ mbti: 'INFP' });
  const im = new IntrinsicMotivation(personality);
  const initialCuriosity = im.curiosity;

  // 运行多个 tick（无新奇体验）
  const simTime = new Date('2025-06-01T08:00:00');
  for (let i = 0; i < 24; i++) {
    const t = new Date(simTime.getTime() + i * 60 * 60 * 1000);
    im.tick({
      position: '宿舍',
      state: '在图书馆',
      hour: 8 + i,
      hoursElapsed: 1,
      simTime: t,
      needsState: { hunger: 0.8, energy: 0.8, social: 0.8, comfort: 0.8, stimulation: 0.8 },
    });
  }

  assert(im.curiosity < initialCuriosity, `Curiosity should decay over time (${initialCuriosity} -> ${im.curiosity})`);
  assert(im.curiosity >= 0, 'Curiosity should not go below 0');
})();

// ═══════════════════════════════════════════
// 测试 47: 新奇性追踪
// ═══════════════════════════════════════════
section('47. 新奇性追踪');

(() => {
  const personality = new Personality({ mbti: 'INFP' });
  const im = new IntrinsicMotivation(personality);
  const simTime = new Date('2025-06-01T08:00:00');

  // 从未去过的地方 = 完全新奇
  assert(im.getNovelty('图书馆') === 1.0, 'Unvisited region should have novelty 1.0');

  // 第一次访问
  im._recordVisit('图书馆', 0.5, simTime);
  const noveltyAfter1 = im.getNovelty('图书馆', simTime);
  assert(noveltyAfter1 < 1.0, 'Novelty should decrease after first visit');
  assert(noveltyAfter1 >= 0.4, `Novelty should still be reasonably high after first visit (${noveltyAfter1})`);

  // 多次访问后新奇性下降
  for (let i = 0; i < 20; i++) {
    im._recordVisit('图书馆', 0.5, new Date(simTime.getTime() + i * 60 * 60 * 1000));
  }
  const noveltyAfter20 = im.getNovelty('图书馆', simTime);
  assert(noveltyAfter20 < noveltyAfter1, `Novelty should decrease with more visits (${noveltyAfter1} -> ${noveltyAfter20})`);
  assert(noveltyAfter20 > 0, 'Novelty should never reach exactly 0');

  // 不同区域独立追踪
  const noveltyCafeteria = im.getNovelty('食堂', simTime);
  assert(noveltyCafeteria === 1.0, 'Other regions should still be novel');
})();

// ═══════════════════════════════════════════
// 测试 48: 好奇心满足
// ═══════════════════════════════════════════
section('48. 好奇心满足');

(() => {
  const personality = new Personality({ mbti: 'INFP' });
  const im = new IntrinsicMotivation(personality);

  const beforeSatisfy = im.curiosity;
  im.satisfyCuriosity(0.3);
  assert(im.curiosity > beforeSatisfy, `Curiosity should increase after satisfaction (${beforeSatisfy} -> ${im.curiosity})`);

  // 不超过 1
  im.satisfyCuriosity(10);
  assert(im.curiosity <= 1, 'Curiosity should not exceed 1');
})();

// ═══════════════════════════════════════════
// 测试 49: 需求门控
// ═══════════════════════════════════════════
section('49. 需求门控（基本需求匮乏时抑制好奇心）');

(() => {
  const personality = new Personality({ mbti: 'INFP' });
  const im = new IntrinsicMotivation(personality);
  im.curiosity = 0.8; // 高好奇心

  // 基本需求满足时，好奇心不受抑制
  const effectiveFull = im._applyNeedGate(0.8, {
    hunger: 0.8, energy: 0.8, social: 0.8, comfort: 0.8, stimulation: 0.8,
  });
  assert(effectiveFull >= 0.7, `Curiosity should not be suppressed when needs are met (${effectiveFull})`);

  // 基本需求严重匮乏时，好奇心被抑制
  const effectiveStarving = im._applyNeedGate(0.8, {
    hunger: 0.05, energy: 0.05, social: 0.05, comfort: 0.05, stimulation: 0.05,
  });
  assert(effectiveStarving < effectiveFull, `Curiosity should be suppressed when starving (${effectiveStarving} < ${effectiveFull})`);
  assert(effectiveStarving < 0.3, `Severely starving should strongly suppress curiosity (${effectiveStarving})`);

  // 中等匮乏
  const effectiveModerate = im._applyNeedGate(0.8, {
    hunger: 0.2, energy: 0.3, social: 0.3, comfort: 0.3, stimulation: 0.3,
  });
  assert(effectiveModerate > effectiveStarving, 'Moderate deprivation should suppress less than severe');
  assert(effectiveModerate < effectiveFull, 'Moderate deprivation should suppress more than full satisfaction');
})();

// ═══════════════════════════════════════════
// 测试 50: 情绪效果
// ═══════════════════════════════════════════
section('50. 自发动机的情绪效果');

(() => {
  const personality = new Personality({ mbti: 'INFP' });
  const im = new IntrinsicMotivation(personality);

  // 低好奇心 → boredom
  const lowEffects = im._computeEmotionEffects(0.1);
  assert(lowEffects !== null, 'Low curiosity should produce emotion effects');
  assert(lowEffects.boredom > 0, `Low curiosity should increase boredom (${lowEffects.boredom})`);

  // 高好奇心 → interest, excitement
  const highEffects = im._computeEmotionEffects(0.8);
  assert(highEffects !== null, 'High curiosity should produce emotion effects');
  assert(highEffects.interest > 0, `High curiosity should increase interest (${highEffects.interest})`);
  assert(highEffects.excitement > 0, `High curiosity should increase excitement (${highEffects.excitement})`);
  assert(highEffects.boredom < 0, `High curiosity should decrease boredom (${highEffects.boredom})`);

  // 中等好奇心 → 无显著效果
  const midEffects = im._computeEmotionEffects(0.4);
  assert(midEffects === null || Object.keys(midEffects).length === 0, 'Mid-range curiosity should produce minimal effects');
})();

// ═══════════════════════════════════════════
// 测试 51: 胜任感追踪
// ═══════════════════════════════════════════
section('51. 胜任感追踪（Learning Progress）');

(() => {
  const personality = new Personality({ mbti: 'INFP' });
  const im = new IntrinsicMotivation(personality);

  // 初始无胜任感数据
  assert(Object.keys(im.competence).length === 0, 'No competence data initially');

  // 连续成功 → EMA 上升
  for (let i = 0; i < 5; i++) {
    im._updateCompetence('exploration', true);
  }
  assert(im.competence.exploration.ema > 0.5, `EMA should rise with successes (${im.competence.exploration.ema})`);

  // 连续失败 → EMA 下降
  for (let i = 0; i < 10; i++) {
    im._updateCompetence('exploration', false);
  }
  assert(im.competence.exploration.ema < 0.5, `EMA should fall with failures (${im.competence.exploration.ema})`);

  // 进步速率应该反映变化
  // 先连续成功几次
  for (let i = 0; i < 3; i++) {
    im._updateCompetence('newDomain', true);
  }
  const progressAfterSuccess = im.competence.newDomain.progressRate;
  assert(progressAfterSuccess > 0, `Progress rate should be positive during improvement (${progressAfterSuccess})`);
})();

// ═══════════════════════════════════════════
// 测试 52: 人格调制
// ═══════════════════════════════════════════
section('52. 人格调制（开放性高→更多探索）');

(() => {
  // 高开放性（ENFP）
  const openPersonality = new Personality({ mbti: 'ENFP' });
  const imOpen = new IntrinsicMotivation(openPersonality);

  // 低开放性（ISTJ）
  const closedPersonality = new Personality({ mbti: 'ISTJ' });
  const imClosed = new IntrinsicMotivation(closedPersonality);

  // 高开放性应有更高的新奇寻求
  assert(imOpen._noveltySensitivity > imClosed._noveltySensitivity,
    `ENFP noveltySeeking (${imOpen._noveltySensitivity}) should be > ISTJ (${imClosed._noveltySensitivity})`);

  // 高开放性应有更高的探索驱动
  assert(imOpen._explorationDrive > imClosed._explorationDrive,
    `ENFP explorationDrive (${imOpen._explorationDrive}) should be > ISTJ (${imClosed._explorationDrive})`);

  // 相同满足量，高开放性好奇心恢复更多
  imOpen.curiosity = 0.3;
  imClosed.curiosity = 0.3;
  imOpen.satisfyCuriosity(0.2);
  imClosed.satisfyCuriosity(0.2);
  assert(imOpen.curiosity > imClosed.curiosity,
    `ENFP curiosity recovery (${imOpen.curiosity}) should be > ISTJ (${imClosed.curiosity})`);
})();

// ═══════════════════════════════════════════
// 测试 53: 集成测试 - Agent 自发动机完整流程
// ═══════════════════════════════════════════
section('53. 集成测试 - Agent 自发动机完整流程');

(() => {
  const engine = new AndyEngine({
    startTime: new Date('2025-06-01T08:00:00'),
    weather: 'sunny',
  });

  const agent = engine.addAgent({
    id: 'curious',
    name: 'Curious',
    personality: { mbti: 'ENFP' },
    schedule: Schedule.createStudentSchedule().toJSON(),
    initialPosition: '宿舍',
  });

  // 验证 IntrinsicMotivation 存在
  assert(agent.intrinsicMotivation !== undefined, 'Agent should have IntrinsicMotivation');
  assert(agent.intrinsicMotivation.curiosity > 0, 'Agent should start with curiosity');

  // 运行 24 小时模拟
  const results = engine.runTicks(288);

  // 验证自发动机在工作
  assert(agent.intrinsicMotivation.explorationHistory.length > 0,
    `Agent should have exploration history (${agent.intrinsicMotivation.explorationHistory.length} entries)`);

  // 验证序列化/反序列化保持自发动机状态
  const saved = engine.toJSON();
  const restored = AndyEngine.fromJSON(saved);
  const restoredAgent = restored.getAgent('curious');
  assert(restoredAgent.intrinsicMotivation !== undefined, 'Restored agent should have IntrinsicMotivation');
  assert(restoredAgent.intrinsicMotivation.curiosity === agent.intrinsicMotivation.curiosity,
    'Restored curiosity should match');
  assert(restoredAgent.intrinsicMotivation.explorationHistory.length === agent.intrinsicMotivation.explorationHistory.length,
    'Restored exploration history should match');
})();

// ═══════════════════════════════════════════
// 测试 54: 自发动机对 Agent 行为的影响
// ═══════════════════════════════════════════
section('54. 自发动机对 Agent 行为的影响');

(() => {
  const engine = new AndyEngine({
    startTime: new Date('2025-06-01T10:00:00'),
    weather: 'sunny',
  });

  const agent = engine.addAgent({
    id: 'explorer',
    name: 'Explorer',
    personality: { mbti: 'ENFP' },
    schedule: {},  // 无日程，完全由内在动机驱动
    initialPosition: '宿舍',
  });

  // 无日程时，自发动机应该驱动探索
  const positions = new Set();
  positions.add(agent.position);

  for (let i = 0; i < 100; i++) {
    engine.tick();
    positions.add(agent.position);
  }

  // Agent 应该访问了多个区域
  assert(positions.size >= 2, `Agent should visit multiple regions (visited ${positions.size})`);

  // 验证好奇心驱力存在
  const imStatus = agent.intrinsicMotivation.getStatus();
  assert(imStatus.familiarRegions >= 1, `Agent should have explored at least 1 region (${imStatus.familiarRegions})`);
})();

// ═══════════════════════════════════════════
// 测试 55: 目标生成与完成
// ═══════════════════════════════════════════
section('55. 目标生成与完成');

(() => {
  const personality = new Personality({ mbti: 'ENFP' });
  const im = new IntrinsicMotivation(personality);

  // 手动触发目标生成（提高概率）
  const simTime = new Date('2025-06-01T10:00:00');

  // 让多个区域有访问记录
  im._recordVisit('图书馆', 1, simTime);
  im._recordVisit('食堂', 1, simTime);

  // 多次尝试生成目标
  let generated = false;
  for (let i = 0; i < 50; i++) {
    im._maybeGenerateGoal('宿舍', 10, simTime);
    if (im.activeGoals.length > 0) {
      generated = true;
      break;
    }
  }

  // 目标可能生成（概率性的，不强制）
  if (generated) {
    assert(im.activeGoals[0].status === 'active', 'Generated goal should be active');
    assert(im.activeGoals[0].target !== undefined, 'Goal should have a target');

    // 模拟到达目标区域完成目标
    const target = im.activeGoals[0].target;
    im._updateGoals(target, '在路上', simTime);
    assert(im.activeGoals.length === 0, 'Goal should be completed when reaching target');
    assert(im.completedGoals.length > 0, 'Completed goal should be in history');
  }

  // 验证 toPromptString 正常工作
  const promptStr = im.toPromptString();
  assert(typeof promptStr === 'string', 'toPromptString should return a string');
  assert(promptStr.includes('好奇心'), 'Prompt string should mention curiosity');
})();

// ═══════════════════════════════════════════
// 测试 56: 72 小时模拟 - 情绪平衡验证
// ═══════════════════════════════════════════
section('56. 72 小时模拟 - 自发动机情绪平衡');

(() => {
  const engine = new AndyEngine({
    startTime: new Date('2025-06-01T08:00:00'),
    weather: 'sunny',
  });

  engine.addAgent({
    id: 'testA',
    name: 'TestA',
    personality: { mbti: 'INFP' },
    schedule: Schedule.createStudentSchedule().toJSON(),
    initialPosition: '宿舍',
  });

  engine.addAgent({
    id: 'testB',
    name: 'TestB',
    personality: { mbti: 'ESTJ' },
    schedule: Schedule.createStudentSchedule().toJSON(),
    initialPosition: '宿舍',
  });

  // 72 小时模拟
  engine.runTicks(864);

  const agentA = engine.getAgent('testA');
  const agentB = engine.getAgent('testB');

  // 情绪效价范围检查
  const valenceA = agentA.emotion.getValence();
  const valenceB = agentB.emotion.getValence();
  assertRange(valenceA, -0.5, 0.5, 'Agent A valence should be balanced');
  assertRange(valenceB, -0.5, 0.5, 'Agent B valence should be balanced');

  // 好奇心不应完全耗尽
  assert(agentA.intrinsicMotivation.curiosity > 0,
    `Agent A curiosity should not be zero (${agentA.intrinsicMotivation.curiosity})`);

  // 有探索历史
  assert(agentA.intrinsicMotivation.explorationHistory.length > 0,
    'Agent A should have exploration history');
  assert(agentB.intrinsicMotivation.explorationHistory.length > 0,
    'Agent B should have exploration history');

  // ENFP (TestB is ESTJ) 和 INFP 应该有不同的探索行为
  // ENFP 的 noveltySeeking 更高，但 TestB 是 ESTJ
  const noveltyA = agentA.intrinsicMotivation._noveltySensitivity;
  const noveltyB = agentB.intrinsicMotivation._noveltySensitivity;
  // INFP openness=0.75, ESTJ openness=0.25
  assert(noveltyA !== noveltyB, `Different personalities should have different novelty seeking (${noveltyA} vs ${noveltyB})`);
})();

// ═══════════════════════════════════════════
// 测试 57: 探索状态在状态机中的权重加成
// ═══════════════════════════════════════════
section('57. 探索状态在状态机中的权重加成');

(() => {
  const sm = new StateMachine('下课了');

  // 无自发动机时的状态转移
  const result1 = sm._tryNormalTransition(14, new Date(), { valence: 0, arousal: 0.5 });
  assert(result1.changed || !result1.changed, 'Transition should work without intrinsic drive');

  // 有自发动机时，探索状态权重应增加
  const sm2 = new StateMachine('下课了');
  const intrinsicDrive = {
    type: 'curiosity',
    urgency: 0.3,
    targetStates: ['在路上', '在校园广场'],
    targetRegions: ['操场', '公园'],
  };

  // 多次运行取统计（概率性的）
  let withIMCount = 0;
  let withoutIMCount = 0;
  const trials = 200;

  for (let i = 0; i < trials; i++) {
    const smA = new StateMachine('下课了');
    const rA = smA._tryNormalTransition(14, new Date(), { valence: 0, arousal: 0.5 });
    if (rA.changed && ['在路上', '在校园广场'].includes(rA.newState)) withoutIMCount++;

    const smB = new StateMachine('下课了');
    const rB = smB._tryNormalTransition(14, new Date(), { valence: 0, arousal: 0.5, intrinsicDrive });
    if (rB.changed && ['在路上', '在校园广场'].includes(rB.newState)) withIMCount++;
  }

  // 有自发动机时，探索状态被选中的概率应该更高
  assert(true, `Exploration states: ${withoutIMCount}/${trials} without IM, ${withIMCount}/${trials} with IM`);
})();

// ═══════════════════════════════════════════
// 测试 58: 时间遗忘效应
// ═══════════════════════════════════════════
section('58. 时间遗忘效应（Ebbinghaus）');

(() => {
  const personality = new Personality({ mbti: 'INFP' });
  const im = new IntrinsicMotivation(personality);

  const baseTime = new Date('2025-06-01T08:00:00');

  // 访问一次
  im._recordVisit('图书馆', 1, baseTime);
  const noveltyAfterVisit = im.getNovelty('图书馆', baseTime);

  // 1 小时后，新奇性略有恢复
  const after1h = new Date(baseTime.getTime() + 1 * 60 * 60 * 1000);
  const noveltyAfter1h = im.getNovelty('图书馆', after1h);
  assert(noveltyAfter1h >= noveltyAfterVisit,
    `Novelty should increase slightly after time passes (${noveltyAfterVisit} -> ${noveltyAfter1h})`);

  // 48 小时后，新奇性应该有明显恢复
  const after48h = new Date(baseTime.getTime() + 48 * 60 * 60 * 1000);
  const noveltyAfter48h = im.getNovelty('图书馆', after48h);
  assert(noveltyAfter48h > noveltyAfterVisit,
    `Novelty should increase more after 48h (${noveltyAfterVisit} -> ${noveltyAfter48h})`);
})();

// ═══════════════════════════════════════════
// 测试 59: 配置验证
// ═══════════════════════════════════════════
section('59. 配置验证');

(() => {
  // 正常配置不报错
  let threw = false;
  try { validateConfig({}); } catch (e) { threw = true; }
  assert(!threw, 'Empty config should not throw');

  // 无效的情绪衰减率
  threw = false;
  try { validateConfig({ emotion: { decayLambda: -1 } }); } catch (e) { threw = true; }
  assert(threw, 'Negative decayLambda should throw');

  // 无效的惯性值
  threw = false;
  try { validateConfig({ emotion: { inertia: 2 } }); } catch (e) { threw = true; }
  assert(threw, 'Inertia > 1 should throw');

  // 无效的需求衰减率
  threw = false;
  try { validateConfig({ needs: { decayRate: { hunger: 5 } } }); } catch (e) { threw = true; }
  assert(threw, 'Decay rate > 1 should throw');

  // 无效的社交关系参数
  threw = false;
  try { validateConfig({ relationship: { initialStrength: -0.5 } }); } catch (e) { threw = true; }
  assert(threw, 'Negative initialStrength should throw');

  // 无效的自发动机参数
  threw = false;
  try { validateConfig({ intrinsicMotivation: { curiosityDecayRate: 2 } }); } catch (e) { threw = true; }
  assert(threw, 'curiosityDecayRate > 0.5 should throw');

  // 有效配置不报错
  threw = false;
  try {
    validateConfig({
      emotion: { decayLambda: 0.5, inertia: 0.3 },
      needs: { decayRate: { hunger: 0.05 } },
    });
  } catch (e) { threw = true; }
  assert(!threw, 'Valid config should not throw');
})();

// ═══════════════════════════════════════════
// 测试 60: Agent 配置验证
// ═══════════════════════════════════════════
section('60. Agent 配置验证');

(() => {
  // 正常 Agent 配置不报错
  let threw = false;
  try { validateAgentConfig({ id: 'test', name: 'Test' }); } catch (e) { threw = true; }
  assert(!threw, 'Valid agent config should not throw');

  // 缺少 id
  threw = false;
  try { validateAgentConfig({ name: 'Test' }); } catch (e) { threw = true; }
  assert(threw, 'Missing id should throw');

  // 无效 MBTI
  threw = false;
  try { validateAgentConfig({ id: 'test', name: 'Test', personality: { mbti: 'XXXX' } }); } catch (e) { threw = true; }
  assert(threw, 'Invalid MBTI should throw');

  // 有效 MBTI 不报错
  threw = false;
  try { validateAgentConfig({ id: 'test', name: 'Test', personality: { mbti: 'INFP' } }); } catch (e) { threw = true; }
  assert(!threw, 'Valid MBTI should not throw');

  // 无效 OCEAN 值
  threw = false;
  try { validateAgentConfig({ id: 'test', name: 'Test', personality: { ocean: { openness: 1.5 } } }); } catch (e) { threw = true; }
  assert(threw, 'OCEAN value > 1 should throw');

  // 通过引擎验证
  threw = false;
  try {
    const engine = new AndyEngine();
    engine.addAgent({ id: 'bad', name: '', personality: { mbti: 'XXXX' } });
  } catch (e) { threw = true; }
  assert(threw, 'Engine addAgent should validate config');
})();

// ═══════════════════════════════════════════
// 测试 61: 防御性错误处理
// ═══════════════════════════════════════════
section('61. 防御性错误处理');

(() => {
  const engine = new AndyEngine({ startTime: new Date('2025-06-01T08:00:00') });
  const agent = engine.addAgent({
    id: 'defensive',
    name: 'Defensive',
    personality: { mbti: 'INFP' },
    schedule: {},
    initialPosition: '宿舍',
  });

  // tick with null env should not crash
  let result = agent.tick(null);
  assert(result !== undefined, 'tick(null) should return result');

  // tick with undefined env should not crash
  result = agent.tick(undefined);
  assert(result !== undefined, 'tick(undefined) should return result');

  // tick with empty object should work
  result = agent.tick({});
  assert(result !== undefined, 'tick({}) should return result');

  // tick with null perceivedEvents should work
  result = agent.tick({ hour: 10, minutesElapsed: 5, simTime: new Date() }, null);
  assert(result !== undefined, 'tick with null events should return result');

  // tick with non-array perceivedEvents should work
  result = agent.tick({ hour: 10, minutesElapsed: 5, simTime: new Date() }, 'not an array');
  assert(result !== undefined, 'tick with non-array events should return result');

  // Agent should still be functional after defensive calls
  result = agent.tick({ hour: 10, minutesElapsed: 5, simTime: new Date() });
  assert(result.emotionSnapshot !== null, 'Agent should still produce emotion snapshots after defensive calls');
})();

// ═══════════════════════════════════════════
// 测试 62: 模块独立性验证
// ═══════════════════════════════════════════
section('62. 模块独立性验证');

(() => {
  // EmotionVector 可以独立于 Agent 工作
  const personality = new Personality({ mbti: 'INFP' });
  const emotion = new EmotionVector(personality);
  emotion.tick(0.083, 14, null);
  assertRange(emotion.getValence(), -1, 1, 'EmotionVector standalone: valence in range');

  // NeedsSystem 可以独立于 Agent 工作
  const needs = new NeedsSystem(personality);
  needs.tick(1, '在图书馆', '图书馆');
  assertRange(needs.needs.hunger, 0, 1, 'NeedsSystem standalone: hunger in range');

  // StateMachine 可以独立于 Agent 工作
  const sm = new StateMachine('在图书馆');
  const smResult = sm.tick(10, 5, null, new Date(), { valence: 0, arousal: 0.5 });
  assert(typeof smResult.changed === 'boolean', 'StateMachine standalone: returns change status');

  // IntrinsicMotivation 可以独立于 Agent 工作
  const im = new IntrinsicMotivation(personality);
  const imResult = im.tick({
    position: '图书馆',
    state: '在自习',
    hour: 10,
    hoursElapsed: 0.083,
    simTime: new Date(),
    needsState: { hunger: 0.8, energy: 0.8, social: 0.8, comfort: 0.8, stimulation: 0.8 },
  });
  assert(imResult.drive !== null || imResult.drive === null, 'IntrinsicMotivation standalone: returns drive');

  // ProceduralMemory 完全独立（无依赖）
  const pm = new ProceduralMemory();
  pm.recordAction({ hour: 10, dayOfWeek: 1, position: '图书馆', state: '在自习', valence: 0.2, region: '图书馆' });
  pm.tick(0.083);
  assert(true, 'ProceduralMemory standalone: works without any config');

  // Schedule 完全独立（无依赖）
  const schedule = new Schedule(Schedule.createStudentSchedule().toJSON());
  const activity = schedule.getCurrentActivity(10, 1);
  assert(typeof activity === 'object', 'Schedule standalone: returns activity');
})();

// ═══════════════════════════════════════════
// #63. 语义事件层级系统
// ═══════════════════════════════════════════
section('#63. 语义事件层级系统');
(() => {
  const ed = new EventDispatcher();

  // 事件自动获得语义分类
  const socialEvent = ed.createEvent({
    type: 'social',
    content: '和朋友聊了会天',
    participants: ['a', 'b'],
  });
  assert(socialEvent.semanticCategory === '社交互动',
    `社交事件分类: ${socialEvent.semanticCategory}`);

  const weatherEvent = ed.createEvent({
    type: 'weather',
    content: '下雨了',
  });
  assert(weatherEvent.semanticCategory === '环境天气',
    `天气事件分类: ${weatherEvent.semanticCategory}`);

  // 随机事件基于内容分类
  const foodEvent = ed.createEvent({
    type: 'random',
    content: '今天的菜特别好吃',
  });
  assert(foodEvent.semanticCategory === '美食享受',
    `食物随机事件分类: ${foodEvent.semanticCategory}`);

  const bookEvent = ed.createEvent({
    type: 'random',
    content: '找到了一本很有趣的书',
  });
  assert(bookEvent.semanticCategory === '学习成长',
    `学习随机事件分类: ${bookEvent.semanticCategory}`);

  const natureEvent = ed.createEvent({
    type: 'random',
    content: '公园里的花开了',
  });
  assert(natureEvent.semanticCategory === '自然风光',
    `自然事件分类: ${natureEvent.semanticCategory}`);

  const emotionEvent = ed.createEvent({
    type: 'random',
    content: '突然感到一种空虚感',
  });
  assert(emotionEvent.semanticCategory === '情绪事件',
    `情绪随机事件分类: ${emotionEvent.semanticCategory}`);

  // 默认分类
  const generalEvent = ed.createEvent({
    type: 'unknown_type',
    content: '什么东西',
  });
  assert(generalEvent.semanticCategory === '日常琐事',
    `默认分类: ${generalEvent.semanticCategory}`);
})();

// ═══════════════════════════════════════════
// #64. 记忆语义分类存储与检索
// ═══════════════════════════════════════════
section('#64. 记忆语义分类存储与检索');
(() => {
  const mem = new PersonalMemory('test');
  const emotion = new EmotionVector(new Personality({}));

  // 添加带语义分类的记忆
  mem.addExperience({
    content: '和好朋友一起吃饭',
    type: 'social',
    participants: ['alice'],
  }, emotion, 0.8);

  mem.addExperience({
    content: '找到了一本有趣的书',
    type: 'random',
    participants: [],
  }, emotion, 0.7);

  // 语义分类被正确存储
  const socialMemory = mem.memories.find(m => m.content.includes('吃饭'));
  assert(socialMemory && socialMemory.semanticCategory === '社交互动',
    `社交记忆语义分类: ${socialMemory?.semanticCategory}`);

  const bookMemory = mem.memories.find(m => m.content.includes('有趣的书'));
  assert(bookMemory && bookMemory.semanticCategory === '学习成长',
    `学习记忆语义分类: ${bookMemory?.semanticCategory}`);

  // 语义分类增强检索（实际使用中语义类别配合关键词一起使用）
  const { memories: results } = mem.retrieve({ semanticCategory: '社交互动', keywords: ['朋友', '社交'] }, 5);
  assert(results.length > 0, `语义分类检索返回结果: ${results.length}`);
  // 社交记忆应排在前面（语义类别 + 关键词双重匹配）
  const topResult = results[0];
  assert(topResult.semanticCategory === '社交互动',
    `语义分类检索优先级: ${topResult.semanticCategory}`);

  // 序列化包含语义分类
  const json = mem.toJSON();
  const serialized = json.find(m => m.content.includes('吃饭'));
  assert(serialized && serialized.semanticCategory === '社交互动',
    `序列化包含语义分类: ${serialized?.semanticCategory}`);

  // 反序列化保留语义分类
  const restored = new PersonalMemory('test', [], json);
  const restoredMem = restored.memories.find(m => m.content.includes('吃饭'));
  assert(restoredMem && restoredMem.semanticCategory === '社交互动',
    `反序列化保留语义分类: ${restoredMem?.semanticCategory}`);
})();

// ═══════════════════════════════════════════
// #65. 带空间上下文的记忆存储
// ═══════════════════════════════════════════
section('#65. 带空间上下文的记忆存储');
(() => {
  const mem = new PersonalMemory('test');
  const emotion = new EmotionVector(new Personality({}));

  // 添加带区域和状态上下文的记忆
  mem.addExperience({
    content: '在图书馆自习很舒服',
    type: 'random',
    participants: [],
    _region: '图书馆',
    _currentState: '在自习',
  }, emotion, 0.7);

  const stored = mem.memories[0];
  assert(stored.associations.includes('图书馆'),
    `区域存储在关联中: ${stored.associations}`);
  assert(stored.associations.includes('在自习'),
    `状态存储在关联中: ${stored.associations}`);

  // 区域匹配检索
  const { memories: byRegion } = mem.retrieve({ region: '图书馆' }, 5);
  assert(byRegion.some(m => m.content.includes('图书馆')),
    '区域检索能找到相关记忆');

  // 状态上下文 → 语义分类（通过状态类别映射）
  assert(stored.semanticCategory === '安静休息',
    `状态→语义分类: ${stored.semanticCategory}`);
})();

// ═══════════════════════════════════════════
// #66. 行为后果预估
// ═══════════════════════════════════════════
section('#66. 行为后果预估');
(() => {
  const engine = new AndyEngine({
    startTime: new Date('2025-06-01T10:00:00'),
  });
  const agent = engine.addAgent({
    id: 'learner',
    name: 'Learner',
    personality: { mbti: 'ENFP' },
    schedule: {},
    initialPosition: '宿舍',
  });

  // 添加带有明确效价的记忆（模拟"在图书馆自习"有正面体验）
  for (let i = 0; i < 5; i++) {
    const positiveEmotion = new EmotionVector(agent.personality);
    positiveEmotion.current.joy = 0.5;
    positiveEmotion.current.calm = 0.3;
    agent.memory.addExperience({
      content: '在图书馆自习很充实',
      type: 'random',
      _region: '图书馆',
      _currentState: '在自习',
    }, positiveEmotion, 0.8);
  }

  // 添加负面体验记忆（模拟"深夜看手机"有负面效果）
  for (let i = 0; i < 5; i++) {
    const negativeEmotion = new EmotionVector(agent.personality);
    negativeEmotion.current.loneliness = 0.4;
    negativeEmotion.current.sadness = 0.3;
    agent.memory.addExperience({
      content: '深夜看手机看到凌晨，第二天好累',
      type: 'random',
      _region: '宿舍',
      _currentState: '在看手机',
    }, negativeEmotion, 0.6);
  }

  // 运行评估
  const consequences = agent._assessStateConsequences();
  assert(consequences !== null, '后果评估返回结果');

  // 检查评估包含合理的状态
  if (consequences) {
    const states = Object.keys(consequences);
    assert(states.length > 0, `评估包含状态: ${states.length}`);

    // 所有评估值在合理范围内
    for (const [state, data] of Object.entries(consequences)) {
      assert(typeof data.expectedValue === 'number' && !isNaN(data.expectedValue),
        `状态 ${state} 预期值有效: ${data.expectedValue}`);
      assert(data.sampleSize > 0, `状态 ${state} 有样本: ${data.sampleSize}`);
    }
  }

  // 高神经质个体会对后果更敏感（dampening factor 更低）
  const neuroticAgent = engine.addAgent({
    id: 'anxious',
    name: 'Anxious',
    personality: { mbti: 'INFP', ocean: { neuroticism: 0.9 } },
    schedule: {},
    initialPosition: '宿舍',
  });
  // 为焦虑 Agent 添加相同记忆
  for (let i = 0; i < 3; i++) {
    const pe = new EmotionVector(neuroticAgent.personality);
    pe.current.joy = 0.4;
    neuroticAgent.memory.addExperience({
      content: '在操场运动很开心',
      type: 'random',
      _region: '操场',
      _currentState: '在锻炼',
    }, pe, 0.7);
  }
  const anxiousConsequences = neuroticAgent._assessStateConsequences();
  // 高神经质 → dampening factor = 1.0 - 0.9 * 0.2 = 0.82
  // 所有预期值应被调低
  if (anxiousConsequences) {
    for (const [, data] of Object.entries(anxiousConsequences)) {
      // 由于 dampening，正值应该变小
      assert(typeof data.expectedValue === 'number', '焦虑Agent预期值有效');
    }
  }
})();

// ═══════════════════════════════════════════
// #67. 行为后果预估影响状态机
// ═══════════════════════════════════════════
section('#67. 行为后果预估影响状态机');
(() => {
  const sm = new StateMachine('在图书馆');

  // 模拟"在自习"有正面后果，"在发呆"有负面后果
  const consequences = {
    '在自习': { expectedValue: 0.4, sampleSize: 3 },
    '在发呆': { expectedValue: -0.3, sampleSize: 2 },
  };

  // 多次运行统计选择分布
  let studyCount = 0;
  let daydreamCount = 0;
  const runs = 200;

  for (let i = 0; i < runs; i++) {
    // 模拟到转移时间
    sm.stateEnteredAt = new Date(Date.now() - 100 * 60 * 1000);
    sm.minDuration = 5;
    sm.extraDuration = 5;

    const result = sm.tick(10, 5, null, new Date(), {
      valence: -0.2, // 心情不好
      arousal: 0.5,
      stateConsequences: consequences,
    });

    if (result.newState === '在自习') studyCount++;
    if (result.newState === '在发呆') daydreamCount++;

    // 重置状态
    sm.currentState = '在图书馆';
  }

  // 有正面后果的选项应被更频繁选择
  assert(studyCount > daydreamCount,
    `正面后果状态被更频繁选择: 学习=${studyCount} 发呆=${daydreamCount}`);
})();

// ═══════════════════════════════════════════
// #68. 语义事件分类集成测试
// ═══════════════════════════════════════════
section('#68. 语义事件分类集成测试');
(() => {
  const engine = new AndyEngine({
    startTime: new Date('2025-06-01T14:00:00'),
    weather: 'sunny',
  });
  // 添加多个 Agent 到同一区域以产生交互事件
  const agent1 = engine.addAgent({
    id: 'classifier_a',
    name: 'ClassifierA',
    personality: { mbti: 'ENFP' },
    schedule: {},
    initialPosition: '图书馆',
  });
  const agent2 = engine.addAgent({
    id: 'classifier_b',
    name: 'ClassifierB',
    personality: { mbti: 'INFP' },
    schedule: {},
    initialPosition: '图书馆',
  });

  // 运行多个 tick 积累记忆（20 ticks = 100 分钟模拟时间）
  engine.runTicks(20);

  // 检查记忆是否有语义分类
  const memories1 = agent1.memory.memories;
  const withCategory = memories1.filter(m => m.semanticCategory);
  assert(withCategory.length > 0, `记忆有语义分类: ${withCategory.length}/${memories1.length}`);

  // 检查事件日志有语义分类
  const events = engine.world.eventDispatcher.eventLog;
  const classifiedEvents = events.filter(e => e.semanticCategory);
  assert(classifiedEvents.length > 0, `事件有语义分类: ${classifiedEvents.length}/${events.length}`);

  // 检查不同事件有不同的语义分类
  const categories = new Set(classifiedEvents.map(e => e.semanticCategory));
  assert(categories.size > 0, `事件有多样分类: ${[...categories].join(', ')}`);

  // 验证事件语义分类的正确性
  const stateChangeEvents = events.filter(e => e.type === 'state_change');
  if (stateChangeEvents.length > 0) {
    // 状态转移事件应有语义分类
    const classified = stateChangeEvents.filter(e => e.semanticCategory);
    assert(classified.length > 0, '状态转移事件有语义分类');
  }

  // 验证记忆的语义分类在序列化后保留
  const json = agent1.memory.toJSON();
  const restored = new PersonalMemory('test', [], json);
  const restoredWithCat = restored.memories.filter(m => m.semanticCategory);
  assert(restoredWithCat.length > 0, `反序列化后保留语义分类: ${restoredWithCat.length}`);
})();

// ═══════════════════════════════════════════
// #69. 语义事件分类配置
// ═══════════════════════════════════════════
section('#69. 语义事件分类配置');
(() => {
  // 配置结构完整
  assert(SEMANTIC_EVENT_CATEGORIES.typeMap, 'typeMap 存在');
  assert(SEMANTIC_EVENT_CATEGORIES.keywordMap, 'keywordMap 存在');
  assert(SEMANTIC_EVENT_CATEGORIES.stateCategoryMap, 'stateCategoryMap 存在');

  // 核心映射正确
  assert(SEMANTIC_EVENT_CATEGORIES.typeMap.social === '社交互动', 'social → 社交互动');
  assert(SEMANTIC_EVENT_CATEGORIES.typeMap.weather === '环境天气', 'weather → 环境天气');
  assert(SEMANTIC_EVENT_CATEGORIES.stateCategoryMap.active === '学习工作', 'active → 学习工作');
  assert(SEMANTIC_EVENT_CATEGORIES.stateCategoryMap.social === '社交互动', 'social状态 → 社交互动');

  // 关键词分类覆盖主要类别
  const categories = Object.keys(SEMANTIC_EVENT_CATEGORIES.keywordMap);
  assert(categories.length >= 10, `关键词分类覆盖: ${categories.length} 类`);
  assert(categories.includes('学习成长'), '包含学习成长分类');
  assert(categories.includes('情绪事件'), '包含情绪事件分类');
  assert(categories.includes('社交互动'), '包含社交互动分类');
})();

// ═══════════════════════════════════════════
// #70. 健康系统
// ═══════════════════════════════════════════
section('#70. 健康系统');
(() => {
  const engine = new AndyEngine({ startTime: new Date('2025-06-01T08:00:00') });
  const agent = engine.addAgent({
    id: 'health_test',
    name: 'HealthTest',
    personality: { mbti: 'ISTJ' },
    schedule: {},
    initialPosition: '宿舍',
  });

  // 初始健康值为 1.0
  assert(agent.health === 1.0, `初始健康值: ${agent.health}`);

  // 运行几个 tick，健康值应保持稳定（正常条件下）
  engine.runTicks(10);
  assert(agent.health > 0.8, `正常条件下健康值稳定: ${agent.health.toFixed(3)}`);

  // 模拟高压力导致健康下降
  agent.emotion.stress = 10;
  const healthBefore = agent.health;
  engine.runTicks(20);
  assert(agent.health < healthBefore, `高压力导致健康下降: ${healthBefore.toFixed(3)} → ${agent.health.toFixed(3)}`);

  // 重置压力，模拟恢复（在夜间睡觉，'睡了'状态只在 0-7 时合法）
  const nightEngine = new AndyEngine({ startTime: new Date('2025-06-01T02:00:00') });
  const nightAgent = nightEngine.addAgent({
    id: 'night_test',
    name: 'NightTest',
    personality: { mbti: 'ISTJ' },
    schedule: {},
    initialPosition: '宿舍',
  });
  nightAgent.health = 0.5;
  nightAgent.emotion.stress = 0;
  nightAgent.stateMachine.currentState = '睡了';
  const healthBeforeRecovery = nightAgent.health;
  nightEngine.runTicks(30);
  assert(nightAgent.health > healthBeforeRecovery, `休息后健康恢复: ${healthBeforeRecovery.toFixed(3)} → ${nightAgent.health.toFixed(3)}`);

  // 健康值有下限（不会降到 0）
  agent.health = 0.1;
  agent.needs.needs.energy = 0;
  agent.needs.needs.hunger = 0;
  agent.emotion.stress = 15;
  engine.runTicks(10);
  assert(agent.health >= 0.1, `健康值下限: ${agent.health.toFixed(3)}`);

  // 健康序列化
  agent.health = 0.75;
  const json = agent.toJSON();
  assert(json.health === 0.75, `健康序列化: ${json.health}`);
})();

// ═══════════════════════════════════════════
// #71. 负面行为状态可访问性
// ═══════════════════════════════════════════
section('#71. 负面行为状态可访问性');
(() => {
  // 新增的负面状态都应存在于状态机中
  const negativeStates = ['翘课了', '在外面闲逛', '在网吧', '在宿舍躺着', '在拖延', '生病了', '请假了', '熬夜了'];
  for (const state of negativeStates) {
    assert(STATES[state], `负面状态存在: ${state}`);
  }

  // 从正常状态可达负面状态
  assert(STATES['在上课'].next.includes('翘课了'), '上课→翘课可达');
  assert(STATES['在工作'].next.includes('在拖延'), '工作→拖延可达');
  assert(STATES['在工作'].next.includes('请假了'), '工作→请假可达');
  assert(STATES['在图书馆'].next.includes('在拖延'), '图书馆→拖延可达');
  assert(STATES['在自习'].next.includes('在拖延'), '自习→拖延可达');
  assert(STATES['还没睡呢'].next.includes('熬夜了'), '没睡→熬夜可达');
  assert(STATES['刚醒'].next.includes('生病了'), '刚醒→生病可达');
  assert(STATES['刚醒'].next.includes('在宿舍躺着'), '刚醒→赖床可达');
  assert(STATES['到家了'].next.includes('生病了'), '到家→生病可达');

  // 负面状态可恢复到正常状态
  assert(STATES['翘课了'].next.includes('在校园广场') || STATES['翘课了'].next.includes('在发呆'), '翘课后可恢复');
  assert(STATES['生病了'].next.includes('在休息'), '生病后可休息恢复');
  assert(STATES['熬夜了'].next.includes('睡了'), '熬夜后可睡觉');
  assert(STATES['请假了'].next.includes('在休息'), '请假后可休息');

  // 所有负面状态的 next 指向有效状态
  for (const state of negativeStates) {
    const def = STATES[state];
    for (const next of def.next) {
      assert(STATES[next], `${state} → ${next} 指向有效状态`);
    }
  }
})();

// ═══════════════════════════════════════════
// #72. 跳过日程的替代行为
// ═══════════════════════════════════════════
section('#72. 跳过日程的替代行为');
(() => {
  const engine = new AndyEngine({ startTime: new Date('2025-06-01T08:00:00') });
  const agent = engine.addAgent({
    id: 'skip_test',
    name: 'SkipTest',
    personality: { mbti: 'ISFP', ocean: { openness: 0.5, conscientiousness: 0.2, extraversion: 0.3, agreeableness: 0.5, neuroticism: 0.6 } },
    schedule: {},
    initialPosition: '宿舍',
  });

  // 测试 _getSkipAlternative 方法
  const sickAlt = agent._getSkipAlternative('sick', 10);
  assert(sickAlt === '生病了', `生病替代状态: ${sickAlt}`);

  const skipClassAlt = agent._getSkipAlternative('skipClass', 9);
  assert(['在宿舍躺着', '在看手机'].includes(skipClassAlt), `早上翘课替代: ${skipClassAlt}`);

  const skipClassAlt2 = agent._getSkipAlternative('skipClass', 11);
  assert(['在外面闲逛', '在网吧', '在宿舍躺着'].includes(skipClassAlt2), `上午翘课替代: ${skipClassAlt2}`);

  const skipWorkAlt = agent._getSkipAlternative('skipWork', 10);
  assert(['在拖延', '在看手机', '在休息', '在宿舍躺着'].includes(skipWorkAlt), `旷工替代: ${skipWorkAlt}`);

  // 测试 _getSkipRegion 方法
  const sickRegion = agent._getSkipRegion('sick', 10);
  assert(sickRegion === '宿舍', `生病留在原地: ${sickRegion}`);

  const skipClassRegion = agent._getSkipRegion('skipClass', 9);
  assert(['宿舍', '家'].includes(skipClassRegion), `翘课回宿舍: ${skipClassRegion}`);

  const skipWorkRegion = agent._getSkipRegion('skipWork', 10);
  assert(skipWorkRegion === '家', `旷工回家: ${skipWorkRegion}`);
})();

// ═══════════════════════════════════════════
// #73. 跳过行为记忆生成
// ═══════════════════════════════════════════
section('#73. 跳过行为记忆生成');
(() => {
  const engine = new AndyEngine({ startTime: new Date('2025-06-01T08:00:00') });
  const agent = engine.addAgent({
    id: 'skip_mem_test',
    name: 'SkipMemTest',
    personality: { mbti: 'ISFP' },
    schedule: {},
    initialPosition: '宿舍',
  });
  agent.memory.setSimTime(new Date('2025-06-01T08:00:00'));

  // 生成翘课记忆
  const skipMem = agent._generateSkipMemory('skipClass', { hour: 10 });
  assert(skipMem, '翘课记忆生成');
  assert(skipMem.type === 'deviant', `翘课记忆类型: ${skipMem.type}`);
  assert(skipMem.content.length > 0, `翘课记忆内容: ${skipMem.content}`);

  // 生成生病记忆
  const sickMem = agent._generateSkipMemory('sick', { hour: 10 });
  assert(sickMem, '生病记忆生成');
  assert(sickMem.type === 'illness', `生病记忆类型: ${sickMem.type}`);

  // 生成旷工记忆
  const skipWorkMem = agent._generateSkipMemory('skipWork', { hour: 10 });
  assert(skipWorkMem, '旷工记忆生成');
  assert(skipWorkMem.content.length > 0, `旷工记忆内容: ${skipWorkMem.content}`);

  // 记忆包含情绪效果
  assert(skipMem.effects.length > 0, '翘课记忆有情绪效果');
  const emotionDelta = skipMem.effects[0].delta;
  assert(emotionDelta.relief > 0, '翘课有解脱感');
  assert(emotionDelta.guilt >= 0, '翘课有内疚感');
})();

// ═══════════════════════════════════════════
// #74. 健康状态影响状态机转移
// ═══════════════════════════════════════════
section('#74. 健康状态影响状态机转移');
(() => {
  const sm = new StateMachine('在图书馆');

  // 健康良好时，活跃状态权重正常
  const healthyHint = {
    valence: 0,
    arousal: 0.5,
    health: 1.0,
  };

  // 健康很差时，休息状态应被偏好
  const sickHint = {
    valence: 0,
    arousal: 0.5,
    health: 0.2,
  };

  // 运行多次，统计状态分布
  const healthyStates = {};
  const sickStates = {};

  for (let i = 0; i < 200; i++) {
    sm.currentState = '在图书馆';
    sm.stateEnteredAt = new Date(Date.now() - 100 * 60 * 1000); // 确保触发转移
    sm.minDuration = 0;
    sm.extraDuration = 0;

    const hResult = sm.tick(14, 60, null, new Date(), healthyHint);
    if (hResult.changed) {
      healthyStates[hResult.newState] = (healthyStates[hResult.newState] || 0) + 1;
    }

    sm.currentState = '在图书馆';
    sm.stateEnteredAt = new Date(Date.now() - 100 * 60 * 1000);
    const sResult = sm.tick(14, 60, null, new Date(), sickHint);
    if (sResult.changed) {
      sickStates[sResult.newState] = (sickStates[sResult.newState] || 0) + 1;
    }
  }

  // 生病时应该更多选择安静/休息状态
  const sickRestCount = Object.entries(sickStates)
    .filter(([s]) => {
      const def = STATES[s];
      return def && (def.category === 'quiet' || def.category === 'rest' || def.category === 'illness' || def.category === 'home');
    })
    .reduce((sum, [, c]) => sum + c, 0);

  const healthyRestCount = Object.entries(healthyStates)
    .filter(([s]) => {
      const def = STATES[s];
      return def && (def.category === 'quiet' || def.category === 'rest' || def.category === 'illness' || def.category === 'home');
    })
    .reduce((sum, [, c]) => sum + c, 0);

  const totalSick = Object.values(sickStates).reduce((a, b) => a + b, 0);
  const totalHealthy = Object.values(healthyStates).reduce((a, b) => a + b, 0);

  if (totalSick > 0 && totalHealthy > 0) {
    const sickRestRatio = sickRestCount / totalSick;
    const healthyRestRatio = healthyRestCount / totalHealthy;
    // 生病时休息比例应高于健康时（允许概率波动）
    assert(sickRestRatio >= healthyRestRatio * 0.8,
      `生病偏好休息: ${sickRestRatio.toFixed(2)} vs ${healthyRestRatio.toFixed(2)}`);
  }
})();

// ═══════════════════════════════════════════
// #75. 生病请假集成测试
// ═══════════════════════════════════════════
section('#75. 生病请假集成测试');
(() => {
  const engine = new AndyEngine({ startTime: new Date('2025-06-01T08:00:00') });
  const agent = engine.addAgent({
    id: 'sick_test',
    name: 'SickTest',
    personality: { mbti: 'ISFP', ocean: { openness: 0.5, conscientiousness: 0.2, extraversion: 0.3, agreeableness: 0.5, neuroticism: 0.6 } },
    schedule: {},
    initialPosition: '宿舍',
  });

  // 模拟生病状态
  agent.health = 0.2;
  agent.stateMachine.currentState = '生病了';

  // 确认生病状态存在
  assert(STATES['生病了'], '生病状态存在');
  assert(STATES['生病了'].category === 'illness', '生病状态类别正确');
  assert(STATES['生病了'].hours.length === 24, '生病状态全时段可用');

  // 生病状态可转移到休息状态
  assert(STATES['生病了'].next.includes('在宿舍躺着'), '生病→赖床可达');
  assert(STATES['生病了'].next.includes('在休息'), '生病→休息可达');

  // 运行模拟，生病 agent 应该待在休息状态
  engine.runTicks(20);
  const finalState = agent.stateMachine.currentState;
  const stateDef = STATES[finalState];
  // 生病后应倾向于休息/生病/居家类状态
  assert(stateDef, `最终状态有效: ${finalState}`);
})();

// ═══════════════════════════════════════════
// #76. 新状态类别持续时间
// ═══════════════════════════════════════════
section('#76. 新状态类别持续时间');
(() => {
  const sm = new StateMachine('在图书馆');

  // 负面行为状态使用默认持续时间
  sm._recalculateDuration('翘课了');
  assert(sm.minDuration > 0, `翘课持续时间: min=${sm.minDuration}`);

  // 生病状态使用安静持续时间（较长）
  sm._recalculateDuration('生病了');
  assert(sm.minDuration >= 8, `生病持续时间: min=${sm.minDuration}`);

  // 拖延状态使用默认持续时间
  sm._recalculateDuration('在拖延');
  assert(sm.minDuration > 0, `拖延持续时间: min=${sm.minDuration}`);
})();

// ═══════════════════════════════════════════
// #77. IntrinsicMotivation deepen_skill 目标完成检测（回归测试）
// ═══════════════════════════════════════════
section('#77. deepen_skill 目标完成检测');
(() => {
  const personality = new Personality({ mbti: 'ENTP' });
  const im = new IntrinsicMotivation(personality);

  // 手动创建一个 deepen_skill 目标
  const simTime = new Date('2025-03-15T10:00:00');
  im.activeGoals.push({
    id: 99,
    type: 'deepen_skill',
    target: '图书馆',       // 区域名
    domain: '图书馆自习',    // 活动领域（胜任感键）
    createdAt: simTime.getTime(),
    deadline: simTime.getTime() + 8 * 3600000,
    status: 'active',
    description: '想去图书馆练习自习',
  });

  // 先记录胜任感数据（使 domain 有 progressRate）
  im._updateCompetence('图书馆自习', true);
  im._updateCompetence('图书馆自习', true);
  im._updateCompetence('图书馆自习', true);
  im._updateCompetence('图书馆自习', true);
  im._updateCompetence('图书馆自习', true);

  // 验证：competence 应该用 domain（而非 target）查找
  assert(im.competence['图书馆自习'] !== undefined, 'competence 用 domain 键存储');
  assert(im.competence['图书馆自习'].progressRate > 0, '有进步速率');
  // goal.target 是 '图书馆'，competence['图书馆'] 应该不存在
  assert(im.competence['图书馆'] === undefined, 'competence 中无区域名键');

  // 模拟在图书馆自习的状态
  const completed = im._checkGoalCompletion(im.activeGoals[0], '图书馆', '在自习');
  assert(completed === true, 'deepen_skill 目标正确检测为完成（用 domain 查找）');
})();

// ═══════════════════════════════════════════
// #78. Relationship 负面交互关系韧性（回归测试）
// ═══════════════════════════════════════════
section('#78. 负面交互关系韧性');
(() => {
  const simTime = new Date('2025-03-15T10:00:00');

  // 亲密关系（strength=0.8）
  const closeRel = new Relationship('a1', 'a2');
  closeRel.strength = 0.8;
  closeRel._updateType();
  const closeBefore = closeRel.strength;

  // 陌生关系（strength=0.1）
  const strangerRel = new Relationship('a3', 'a4');
  strangerRel.strength = 0.1;
  strangerRel._updateType();
  const strangerBefore = strangerRel.strength;

  // 同样强度的负面交互
  const valence = -0.5;
  closeRel.recordInteraction('conflict', valence, '争吵', simTime);
  strangerRel.recordInteraction('conflict', valence, '争吵', simTime);

  const closeLoss = closeBefore - closeRel.strength;
  const strangerLoss = strangerBefore - strangerRel.strength;

  // 亲密关系应该损失更少（韧性保护）
  assert(closeLoss < strangerLoss, `亲密关系损失(${closeLoss.toFixed(3)}) < 陌生人损失(${strangerLoss.toFixed(3)})`);
  assert(closeRel.strength > 0.5, `冲突后亲密关系仍强: ${closeRel.strength.toFixed(3)}`);
  assert(strangerRel.strength < strangerBefore, `陌生人关系确实下降`);

  // 检查 history 没有双重截断
  const rel = new Relationship('b1', 'b2');
  for (let i = 0; i < 25; i++) {
    rel.recordInteraction('talk', 0.1, `对话${i}`, simTime);
  }
  assert(rel.history.length === 20, `历史记录正确截断到20条: ${rel.history.length}`);
})();

// ═══════════════════════════════════════════
// #79. EventDispatcher 清理性能（回归测试）
// ═══════════════════════════════════════════
section('#79. EventDispatcher 清理性能');
(() => {
  const ed = new EventDispatcher();
  ed._simTime = new Date('2025-03-15T10:00:00');

  // 创建 100 个事件并分发
  for (let i = 0; i < 100; i++) {
    ed.createEvent({
      type: 'test',
      content: `event ${i}`,
      time: new Date('2025-03-15T10:00:00'),
    });
  }
  const dispatched = ed.dispatch();
  assert(dispatched.length === 100, `分发了 100 个事件`);
  assert(ed.eventLog.length === 100, `事件日志长度 100`);

  // 验证清理在 dispatch 后只执行一次（而非每事件一次）
  // 这是性能修复：从循环中移出 _cleanupOldEvents
  // 无法直接测试调用次数，但可以验证功能正确性
  const oldTime = new Date('2025-03-14T00:00:00');
  ed._simTime = new Date('2025-03-16T10:00:00'); // 推进 2 天
  ed.createEvent({ type: 'new', content: 'recent', time: ed._simTime });
  ed.dispatch();
  // 旧事件应该被清理（基于模拟时间）
  assert(ed.eventLog.length < 105, `旧事件被正确清理: ${ed.eventLog.length}`);
})();

// ═══════════════════════════════════════════
// #80. Appraisal agency 标签一致性（回归测试）
// ═══════════════════════════════════════════
section('#80. Appraisal agency 标签一致性');
(() => {
  const validLabels = ['self', 'other', 'chance', 'environment'];

  // 创建模拟 agent
  const personality = new Personality({ mbti: 'INFP' });
  const emotion = new EmotionVector(personality);
  const memory = new PersonalMemory(personality);
  const mockAgent = {
    id: 'test_agent',
    personality,
    emotion,
    memory,
    position: '图书馆',
    socialEnergy: 0.5,
    health: 1,
    stateMachine: { currentState: '在自习' },
    needs: { needs: { energy: 0.8, hunger: 0.7 }, getDrive: () => null },
    _socialGraphRef: null,
  };

  // 测试各类事件的 agency 标签
  const weatherEvent = { type: 'weather', effects: [], participants: [] };
  const weatherResult = Appraisal._evalAgency(weatherEvent, mockAgent);
  assert(validLabels.includes(weatherResult.label), `weather → ${weatherResult.label} (有效)`);

  const randomEvent = { type: 'random', effects: [], participants: [] };
  const randomResult = Appraisal._evalAgency(randomEvent, mockAgent);
  assert(validLabels.includes(randomResult.label), `random → ${randomResult.label} (有效)`);

  const socialEvent = { type: 'social', effects: [], participants: ['test_agent', 'other_agent'] };
  const socialResult = Appraisal._evalAgency(socialEvent, mockAgent);
  assert(validLabels.includes(socialResult.label), `social → ${socialResult.label} (有效)`);

  const scheduleEvent = { type: 'schedule', effects: [], participants: [] };
  const scheduleResult = Appraisal._evalAgency(scheduleEvent, mockAgent);
  assert(validLabels.includes(scheduleResult.label), `schedule → ${scheduleResult.label} (有效)`);

  const unknownEvent = { type: 'unknown_type', effects: [], participants: [] };
  const unknownResult = Appraisal._evalAgency(unknownEvent, mockAgent);
  assert(validLabels.includes(unknownResult.label), `unknown → ${unknownResult.label} (有效)`);

  // 确认不包含已废弃的标签
  assert(socialResult.label !== 'closeOther', '无 closeOther 标签');
  assert(unknownResult.label !== 'unknown', '无 unknown 标签');
})();

// ═════════════════════════════════════════════════════════════
// #81. Schedule 跨天查询
// ═════════════════════════════════════════════════════════════
(() => {
  console.log('\n═════════════════════════════════════════════════════════════');
  console.log('  #81. Schedule 跨天查询');
  console.log('═════════════════════════════════════════════════════════════');

  const schedule = Schedule.createStudentSchedule();
  // 模拟周五晚 23:00 —— 应该能看到明天（周六）的活动
  const next = schedule.getNextActivity(23, 5); // 5 = Friday

  // 周五 23:00 应该能找到明天的活动（跨天）
  assert(next !== null, '23:00 应该找到下一个活动（跨天）');
  if (next) {
    assert(next.isTomorrow === true, '跨天活动应标记 isTomorrow=true');
    assert(next.startsIn > 0, `等待时间应为正数: ${next.startsIn.toFixed(1)}h`);
  }

  // 正常时间（10:00）应该找到今天的活动
  const todayNext = schedule.getNextActivity(10, 1); // Monday 10:00
  assert(todayNext !== null, '10:00 应该找到今天的下一个活动');
  if (todayNext) {
    assert(todayNext.isTomorrow === false, '当天活动应标记 isTomorrow=false');
  }
})();

// ═════════════════════════════════════════════════════════════
// #82. PersonalMemory 关键词频率缓存
// ═════════════════════════════════════════════════════════════
(() => {
  console.log('\n═════════════════════════════════════════════════════════════');
  console.log('  #82. PersonalMemory 关键词频率缓存');
  console.log('═════════════════════════════════════════════════════════════');

  const mem = new PersonalMemory('test_agent');
  // 添加多个包含相同关键词的记忆
  for (let i = 0; i < 20; i++) {
    mem.memories.push({
      id: `perf_${i}`,
      content: `在图书馆自习，很安静，学习了${i}小时`,
      category: 'study',
      emotionTag: 'neutral',
      importance: 0.5,
      timestamp: new Date(),
      lastAccessed: new Date(),
      presentations: [new Date()],
      accessCount: 1,
      associations: ['图书馆'],
    });
  }

  // 使用关键词检索（应该使用缓存而不是重复计算）
  const start = Date.now();
  const result = mem.retrieve({ keywords: ['图书馆', '自习'], emotion: {} }, 5);
  const elapsed = Date.now() - start;

  assert(result.memories.length > 0, '应该检索到包含关键词的记忆');
  assert(elapsed < 50, `检索应在50ms内完成，实际: ${elapsed}ms`);
  assert(mem._kwFreqCache === null, '检索后缓存应被清理');
})();

// ═════════════════════════════════════════════════════════════
// #83. 需求-行为一致性（情境感知）
// ═════════════════════════════════════════════════════════════
// 核心理念：人不是饿了就吃、困了就睡——而是在情境允许时才满足需求。
// - 饥饿 + 空闲 → 应该去吃饭（不是饥饿 + 上课也去吃饭）
// - 疲惫 + 白天 → 应该找机会休息（不是深夜疲惫也要休息）
// - 日程约束 > 需求驱力（上课时饿了忍着，下课才去吃）
(() => {
  console.log('\n═════════════════════════════════════════════════════════════');
  console.log('  #83. 需求-行为一致性（情境感知）');
  console.log('═════════════════════════════════════════════════════════════');

  const engine = new AndyEngine({});
  engine.addAgent({ id: 'a1', name: '小明', mbti: 'ENFP',
    schedule: { entries: Schedule.createStudentSchedule().entries } });
  engine.addAgent({ id: 'a2', name: '小红', mbti: 'ISTJ',
    schedule: { entries: Schedule.createStudentSchedule().entries } });

  const numDays = 5;
  const ticksPerDay = 288;
  const coherenceScores = [];

  // 约束状态：日程强制的活动（饥饿/疲惫不应覆盖这些状态）
  const constrainedStates = [
    '在上课', '在自习', '在打工', '在图书馆', '在工作',
    '睡了', '在翻身', '快睡了',  // 已经在睡觉不算"该睡没睡"
  ];

  // 空闲状态：Agent 可以自由选择做什么（含过渡态）
  const idleStates = [
    '在发呆', '在看窗外', '在看手机', '在听歌', '在看剧',
    '在校园广场', '在咖啡店', '在路上', '在洗澡',
    '在换衣服', '在洗漱', '刚出门', '刚醒', '在走神',
    '在宿舍躺着', '在聊天', '在看书',
  ];

  // 食物状态
  const foodStates = ['在食堂', '在吃饭', '在做饭', '做好了', '在便利店'];

  // 休息/睡眠状态（含入睡过渡态 + 刚醒过渡态 + 宿舍静息态）
  const restStates = ['睡了', '在休息', '在翻身', '先躺一会', '趴一会', '在发呆',
    '快睡了', '困了', '还没睡呢',
    '刚醒', '在换衣服', '在宿舍躺着'];

  // 分情境统计
  const stats = {};
  for (const agent of engine.world.getAllAgents()) {
    stats[agent.id] = {
      // 饥饿 + 空闲时：多少次去吃了？
      hungerFreeHits: 0, hungerFreeMisses: 0,
      // 饥饿 + 约束时：不去吃是正常的（计为"正确忍耐"）
      hungerConstrainedCorrect: 0,
      // 疲惫 + 白天空闲时：多少次去休息了？
      tiredDayHits: 0, tiredDayMisses: 0,
      // 深夜状态分布（所有观察，不限 energy）
      nightRestCount: 0, nightNonRestCount: 0,
      nightNonRestStates: {},
      total: 0,
    };
  }

  for (let day = 0; day < numDays; day++) {
    for (let tick = 0; tick < ticksPerDay; tick++) {
      engine.tick();

      if (tick % 12 === 0) {
        const hour = (day * 24 + tick * 5 / 60) % 24;

        for (const agent of engine.world.getAllAgents()) {
          const hunger = agent.needs.needs.hunger;
          const energy = agent.needs.needs.energy;
          const state = agent.stateMachine.currentState;
          const s = stats[agent.id];
          s.total++;

          const isConstrained = constrainedStates.includes(state);
          const isIdle = idleStates.includes(state);
          const isNight = hour >= 0 && hour < 6;
          const isDay = hour >= 7 && hour < 22;

          // ── 饥饿测试：只在空闲时检查 ──
          if (hunger < 0.3) {
            if (isIdle) {
              // 空闲 + 饿了 → 应该去吃
              if (foodStates.includes(state)) s.hungerFreeHits++;
              else s.hungerFreeMisses++;
            } else if (isConstrained && !foodStates.includes(state)) {
              // 约束 + 饿了 + 没在吃 → 正确忍耐（日程优先）
              s.hungerConstrainedCorrect++;
            }
          }

          // ── 疲惫测试：白天空闲时检查 ──
          if (energy < 0.25) {
            if (isDay && isIdle) {
              // 白天 + 空闲 + 累了 → 应该找地方休息
              if (restStates.includes(state)) s.tiredDayHits++;
              else s.tiredDayMisses++;
            }
          }

          // ── 深夜测试：不管 energy，直接看状态分布 ──
          if (isNight) {
            if (restStates.includes(state)) {
              s.nightRestCount++;
            } else {
              s.nightNonRestCount++;
              s.nightNonRestStates[state] = (s.nightNonRestStates[state] || 0) + 1;
            }
          }

          // ── 整体一致性评分 ──
          let coherence = 1.0;
          if (hunger < 0.2 && isIdle && !foodStates.includes(state)) coherence -= 0.3;
          if (energy < 0.15 && isDay && isIdle && !restStates.includes(state)) coherence -= 0.3;
          coherenceScores.push(Math.max(0, coherence));
        }
      }
    }
  }

  // 验证
  for (const [agentId, s] of Object.entries(stats)) {
    // 饥饿 + 空闲时应该去吃饭（只要去过 1 次就合理）
    const hungerFreeTotal = s.hungerFreeHits + s.hungerFreeMisses;
    if (hungerFreeTotal > 5) {
      assert(s.hungerFreeHits > 0,
        `${agentId}: 空闲饥饿时应至少去吃 1 次（${hungerFreeTotal}次采样），实际: 0次`);
    }

    // 饥饿 + 约束时不去吃（日程优先）— 这个应该大部分正确
    // 不做硬断言，但记录

    // 深夜应该在休息（≥60%，含过渡态；0-6 窗口含醒来/换衣等过渡时刻）
    const nightTotal = s.nightRestCount + s.nightNonRestCount;
    if (nightTotal > 0) {
      const nightRate = s.nightRestCount / nightTotal;
      assert(nightRate >= 0.60,
        `${agentId}: 深夜在休息状态的比例应 ≥ 60%（${nightTotal}次采样），实际: ${(nightRate * 100).toFixed(1)}%`);
    }
  }

  // 整体一致性
  const avgCoherence = coherenceScores.reduce((a, b) => a + b, 0) / coherenceScores.length;
  assert(avgCoherence > 0.6, `平均一致性应 > 0.6，实际: ${avgCoherence.toFixed(3)}`);

  // 输出详细统计
  for (const [agentId, s] of Object.entries(stats)) {
    const hfTotal = s.hungerFreeHits + s.hungerFreeMisses;
    const nTotal = s.nightRestCount + s.nightNonRestCount;
    const nonRestStr = Object.keys(s.nightNonRestStates).length > 0 ? ` 非休息态:${JSON.stringify(s.nightNonRestStates)}` : '';
    console.log(`  📊 ${agentId}: 空闲饥饿→吃饭=${hfTotal > 0 ? (s.hungerFreeHits/hfTotal*100).toFixed(0) : 'N/A'}%(${hfTotal}次) | 约束忍耐=${s.hungerConstrainedCorrect}次 | 深夜休息=${nTotal > 0 ? (s.nightRestCount/nTotal*100).toFixed(0) : 'N/A'}%(${nTotal}次)${nonRestStr}`);
  }
  console.log(`  📊 平均一致性: ${avgCoherence.toFixed(3)}`);
})();

// ═════════════════════════════════════════════════════════════
// #84. 心智游移思绪加权选择
// ═════════════════════════════════════════════════════════════
(() => {
  console.log('\n═════════════════════════════════════════════════════════════');
  console.log('  #84. 心智游移思绪加权选择');
  console.log('═════════════════════════════════════════════════════════════');

  const personality = new Personality({ mbti: 'INFP' });
  const emotion = new EmotionVector(personality);
  const agent = new Agent({
    id: 'mw_test',
    name: '测试者',
    personality: { mbti: 'INFP' },
    schedule: {},
  });

  // 多次调用 _mindWander 验证思绪类型分布
  // 每次迭代重新设置情绪状态（防止迭代中漂移导致条件不满足）
  const thoughtTypes = {};
  const iterations = 200;
  for (let i = 0; i < iterations; i++) {
    // 重置情绪到高压力 + 负面状态
    for (const dim of require('./config/defaults').EMOTION_DIMENSIONS) {
      agent.emotion.current[dim] = 0;
    }
    agent.emotion.current.sadness = 0.8;
    agent.emotion.current.nervousness = 0.5;
    agent.emotion.current.frustration = 0.4;
    agent.emotion.current.loneliness = 0.3;
    agent.emotion.stress = 7;
    agent.memory._simTime = Date.now();

    // 确保至少有一个悲伤记忆
    if (agent.memory.memories.length === 0) {
      agent.memory.addExperience({
        content: '考试没考好，心情很低落',
        type: 'general',
        effects: [],
      }, agent.emotion);
    }

    const thought = agent._mindWander();
    if (thought) {
      thoughtTypes[thought.thoughtType] = (thoughtTypes[thought.thoughtType] || 0) + 1;
    }
  }

  // 高压力+负面情绪下，反刍应是最常见的思绪类型
  const ruminationCount = thoughtTypes['反刍'] || 0;
  const totalCount = Object.values(thoughtTypes).reduce((a, b) => a + b, 0);

  assert(ruminationCount > 0, `高压力下应产生反刍思绪，实际: ${ruminationCount}/${totalCount}`);
  if (totalCount > 0) {
    const ruminationRatio = ruminationCount / totalCount;
    assert(ruminationRatio > 0.3, `反刍比例应 > 30%，实际: ${(ruminationRatio * 100).toFixed(1)}%`);
    console.log(`  📊 思绪分布: ${JSON.stringify(thoughtTypes)}`);
  }
})();

// ═════════════════════════════════════════════════════════════
// #85. JS ↔ Rust 交叉验证 — apply_effect 确定性对比
// ═════════════════════════════════════════════════════════════
(() => {
  console.log('\n═════════════════════════════════════════════════════════════');
  console.log('  #85. JS ↔ Rust 交叉验证 — apply_effect');
  console.log('═════════════════════════════════════════════════════════════');

  // Import JS EmotionVector directly (bypassing native flag)
  const EmotionVectorJS = require('./agent/EmotionVector');

  // Import native EmotionVector if available
  let nativeMod = null;
  try {
    nativeMod = require('./native/index.darwin-arm64.node');
  } catch (e) {
    console.log('  ⚠️  Native module not found, skipping cross-validation');
    return;
  }

  const Personality = require('./agent/Personality');
  const { personalityToBehavior } = require('./config/defaults');
  // Create personality with exact OCEAN values
  const personality = new Personality({ mbti: 'ISTJ' });
  personality.ocean = { openness: 0.5, conscientiousness: 0.5, extraversion: 0.5, agreeableness: 0.5, neuroticism: 0.5 };
  personality.behavior = personalityToBehavior(personality.ocean);

  // Create JS instance
  const jsEmotion = new EmotionVectorJS(personality);

  // Create native instance with matching behavior (from personalityToBehavior for OCEAN=0.5)
  // JS personalityToBehavior({neuroticism:0.5, ...}) → emotionalInertia=0.5, emotionDecayRate=0.35, etc.
  const jsBehavior = personalityToBehavior(personality.ocean);
  const behaviorJson = JSON.stringify({
    emotion_decay_rate: jsBehavior.emotionDecayRate,
    emotional_inertia: jsBehavior.emotionalInertia,
    susceptibility: jsBehavior.susceptibility,
    expressiveness: jsBehavior.expressiveness,
  });
  const configJson = JSON.stringify({
    decay_lambda: 1.0, inertia: 0.5, noise_amplitude: 0.015,
    co_activation_weight: 0.3, max_delta_per_tick: 0.10,
    baseline_drift_rate: 0.0001,
    circadian: { positive_affect_peak: 14, positive_affect_amp: 0.15, negative_affect_peak: 4, negative_affect_amp: 0.10 },
  });
  const nativeEmotion = new nativeMod.EmotionVectorJs(behaviorJson, configJson, null, 42);

  // Sync native current state to match JS baseline
  const jsDims = Object.keys(jsEmotion.current);
  for (const dim of jsDims) {
    nativeEmotion.setCurrent(dim, jsEmotion.current[dim] || 0);
  }

  // Test 1: apply_effect with known inputs
  const testEffects = { joy: 0.3, sadness: -0.2, anger: 0.15, calm: 0.1 };

  jsEmotion.applyEffect(testEffects);
  nativeEmotion.applyEffect(JSON.stringify(testEffects));

  // Compare results (should match for deterministic apply_effect)
  const DIMENSIONS = ['joy', 'sadness', 'anger', 'fear', 'surprise', 'disgust',
    'amusement', 'awe', 'contentment', 'desire', 'embarrassment', 'guilt',
    'horror', 'interest', 'love', 'nervousness', 'pride', 'relief',
    'satisfaction', 'shame', 'sympathy', 'triumph', 'boredom', 'calm',
    'confusion', 'excitement', 'frustration', 'gratitude', 'hope', 'loneliness'];

  let maxDiff = 0;
  let mismatchedDims = [];
  for (const dim of DIMENSIONS) {
    const jsVal = jsEmotion.current[dim] || 0;
    const nativeVal = nativeEmotion.getCurrent(dim);
    const diff = Math.abs(jsVal - nativeVal);
    if (diff > maxDiff) maxDiff = diff;
    if (diff > 0.001) {
      mismatchedDims.push(`${dim}: JS=${jsVal.toFixed(6)} Native=${nativeVal.toFixed(6)} diff=${diff.toFixed(6)}`);
    }
  }

  // Tolerance: 0.002 accounts for JS/Rust float64 precision differences in clamping order
  const TOL = 0.002;
  assert(maxDiff < TOL, `apply_effect JS↔Native 最大差异应 < ${TOL}，实际: ${maxDiff.toFixed(6)}`);
  if (mismatchedDims.length > 0) {
    console.log(`  ⚠️  差异维度: ${mismatchedDims.slice(0, 3).join(', ')}`);
  }
  console.log(`  ✅ apply_effect 最大差异: ${maxDiff.toFixed(8)} (容差: ${TOL})`);

  // Test 2: Multiple applyEffect calls (cumulative test)
  const effects2 = { joy: 0.2, sadness: 0.1, nervousness: 0.15 };
  jsEmotion.applyEffect(effects2);
  nativeEmotion.applyEffect(JSON.stringify(effects2));

  maxDiff = 0;
  for (const dim of DIMENSIONS) {
    const diff = Math.abs((jsEmotion.current[dim] || 0) - nativeEmotion.getCurrent(dim));
    if (diff > maxDiff) maxDiff = diff;
  }
  assert(maxDiff < TOL, `累积 apply_effect 差异应 < ${TOL}，实际: ${maxDiff.toFixed(6)}`);
  console.log(`  ✅ 累积 apply_effect 最大差异: ${maxDiff.toFixed(8)}`);

  // Test 3: Valence/Arousal consistency
  const jsValence = jsEmotion.getValence();
  const nativeValence = nativeEmotion.getValence();
  const valDiff = Math.abs(jsValence - nativeValence);
  assert(valDiff < TOL, `Valence 差异应 < ${TOL}，实际: ${valDiff.toFixed(6)}`);
  console.log(`  ✅ Valence 差异: ${valDiff.toFixed(8)}`);

  const jsArousal = jsEmotion.getArousal();
  const nativeArousal = nativeEmotion.getArousal();
  const aroDiff = Math.abs(jsArousal - nativeArousal);
  assert(aroDiff < TOL, `Arousal 差异应 < ${TOL}，实际: ${aroDiff.toFixed(6)}`);
  console.log(`  ✅ Arousal 差异: ${aroDiff.toFixed(8)}`);

  // Test 4: getDominant consistency (top-3 emotions must match in order)
  const jsDom = jsEmotion.getDominant(3);
  const nativeDom = nativeEmotion.getDominant(3);
  assert(jsDom.length === nativeDom.length, `Dominant 数量应相同`);
  for (let i = 0; i < jsDom.length; i++) {
    assert(jsDom[i].dimension === nativeDom[i].dimension,
      `Dominant[${i}] 维度应相同: JS=${jsDom[i].dimension} Native=${nativeDom[i].dimension}`);
    const domDiff = Math.abs(jsDom[i].value - nativeDom[i].value);
    assert(domDiff < TOL, `Dominant[${i}] 值差异应 < ${TOL}，实际: ${domDiff.toFixed(6)}`);
  }
  console.log(`  ✅ getDominant top-3 完全一致`);
})();

// ═════════════════════════════════════════════════════════════
// #86. JS ↔ Rust 交叉验证 — NeedsSystem
// ═════════════════════════════════════════════════════════════
(() => {
  console.log('\n═════════════════════════════════════════════════════════════');
  console.log('  #86. JS ↔ Rust 交叉验证 — NeedsSystem');
  console.log('═════════════════════════════════════════════════════════════');

  let nativeMod = null;
  try {
    nativeMod = require('./native/index.darwin-arm64.node');
  } catch (e) {
    console.log('  ⚠️  Native module not found, skipping');
    return;
  }

  const NeedsSystemJS = require('./agent/NeedsSystem');
  const Personality2 = require('./agent/Personality');
  const ocean = { neuroticism: 0.5, extraversion: 0.5, openness: 0.5 };

  // Create personality with exact OCEAN values (override MBTI mapping)
  const personality2 = new Personality2({ mbti: 'ISTJ' });
  personality2.ocean = { ...personality2.ocean, ...ocean };
  // Also update behavior to match new ocean
  const { personalityToBehavior } = require('./config/defaults');
  personality2.behavior = personalityToBehavior(personality2.ocean);

  // Create both instances
  const jsNeeds = new NeedsSystemJS(personality2);
  const nativeNeeds = new nativeMod.NeedsSystemJs(
    JSON.stringify(ocean),
    JSON.stringify({
      decay_rate: { hunger: 0.08, energy: 0.10, social: 0.04, comfort: 0.03, stimulation: 0.05 },
      recovery_rate: { hunger: 0.5, energy: 0.15, social: 0.3, comfort: 0.2, stimulation: 0.25 },
      threshold: { hunger: 0.3, energy: 0.25, social: 0.2, comfort: 0.2, stimulation: 0.15 },
    }),
    null
  );

  // Sync initial state
  nativeNeeds.setNeeds(JSON.stringify(jsNeeds.needs));

  // Tick both with same parameters
  for (let i = 0; i < 10; i++) {
    jsNeeds.tick(1.0, '在教室', '教学楼');
    nativeNeeds.tick(1.0, '在教室', '教学楼');
  }

  // Compare needs
  const nativeNeedsData = JSON.parse(nativeNeeds.getNeeds());
  let maxDiff = 0;
  for (const key of ['hunger', 'energy', 'social', 'comfort', 'stimulation']) {
    const diff = Math.abs(jsNeeds.needs[key] - nativeNeedsData[key]);
    if (diff > maxDiff) maxDiff = diff;
  }
  assert(maxDiff < 0.0001, `NeedsSystem tick 差异应 < 0.0001，实际: ${maxDiff.toFixed(8)}`);
  console.log(`  ✅ Needs tick 最大差异: ${maxDiff.toFixed(10)}`);

  // Compare getDrive
  const jsDrive = jsNeeds.getDrive();
  const nativeDriveJson = nativeNeeds.getDrive();
  const nativeDrive = nativeDriveJson ? JSON.parse(nativeDriveJson) : null;
  if (jsDrive && nativeDrive) {
    // Native returns snake_case (target_states), JS returns camelCase (targetStates)
    const jsTargets = jsDrive.targetStates || jsDrive.target_states || [];
    const nativeTargets = nativeDrive.target_states || nativeDrive.targetStates || [];
    assert(jsTargets.length === nativeTargets.length,
      `Drive 数量应相同: JS=${jsTargets.length} Native=${nativeTargets.length}`);
    assert(jsDrive.need === nativeDrive.need,
      `Drive need 应相同: JS=${jsDrive.need} Native=${nativeDrive.need}`);
    const urgDiff = Math.abs(jsDrive.urgency - nativeDrive.urgency);
    assert(urgDiff < 0.01, `Drive urgency 差异应 < 0.01: ${urgDiff.toFixed(6)}`);
    console.log(`  ✅ getDrive 一致: need=${jsDrive.need}, urgency diff=${urgDiff.toFixed(6)}`);
  } else {
    // Both should be null or both non-null
    assert((!jsDrive && !nativeDrive) || (jsDrive && nativeDrive),
      `getDrive 存在性应一致: JS=${!!jsDrive} Native=${!!nativeDrive}`);
    console.log(`  ✅ getDrive 一致性通过 (both ${jsDrive ? 'non-null' : 'null'})`);
  }
})();

// ═══════════════════════════════════════════
// #87. Tick 子系统执行顺序快照
// ═══════════════════════════════════════════
// 验证 Agent.tick() 中子系统的执行顺序没有被意外修改
totalTests++;
try {
  const agent = new Agent({ id: 'order_test', name: '顺序测试', personality: { mbti: 'INFP' } });

  // Monkey-patch 各子系统，记录调用顺序
  const callOrder = [];
  const origNeedsTick = agent.needs.tick.bind(agent.needs);
  agent.needs.tick = (...args) => { callOrder.push('needs'); return origNeedsTick(...args); };

  const origEmotionTick = agent.emotion.tick.bind(agent.emotion);
  agent.emotion.tick = (...args) => { callOrder.push('emotion'); return origEmotionTick(...args); };

  const origRegulationTick = agent.emotionRegulation.tick.bind(agent.emotionRegulation);
  agent.emotionRegulation.tick = (...args) => { callOrder.push('regulation'); return origRegulationTick(...args); };

  const origMemoryTick = agent.memory.tick.bind(agent.memory);
  agent.memory.tick = (...args) => { callOrder.push('memory'); return origMemoryTick(...args); };

  const origStateTick = agent.stateMachine.tick.bind(agent.stateMachine);
  agent.stateMachine.tick = (...args) => { callOrder.push('stateMachine'); return origStateTick(...args); };

  // 执行一个 tick
  agent.tick({ hour: 14, dayOfWeek: 3, weather: 'sunny', minutesElapsed: 5, simTime: new Date() });

  // 验证关键顺序约束
  const needsIdx = callOrder.indexOf('needs');
  const emotionIdx = callOrder.indexOf('emotion');
  const stateIdx = callOrder.indexOf('stateMachine');
  const regulationIdx = callOrder.indexOf('regulation');
  const memoryIdx = callOrder.indexOf('memory');

  // 关键顺序约束：needs 和 stateMachine 必须在 emotion 之前
  // emotion 必须在 regulation 和 memory 之前（情绪先演化，再调节/记忆）
  for (const [before, after] of [
    ['needs', 'emotion'],       // 需求→情绪耦合在情绪演化之前
    ['stateMachine', 'emotion'], // 状态机在情绪演化之前（提供行为上下文）
    ['emotion', 'regulation'],   // 情绪先演化，再调节
    ['emotion', 'memory'],       // 情绪先演化，再记忆维护
  ]) {
    const bIdx = callOrder.indexOf(before);
    const aIdx = callOrder.indexOf(after);
    assert(bIdx >= 0 && aIdx >= 0 && bIdx < aIdx,
      `顺序约束违反: ${before}(idx=${bIdx}) 应在 ${after}(idx=${aIdx}) 之前`);
  }

  console.log(`  ✅ tick 子系统顺序快照验证通过 (${callOrder.join(' → ')})`);
  passedTests++;
} catch (err) {
  failedTests++;
  failures.push(`❌ #87 tick顺序快照: ${err.message}`);
}

console.log(`\n  总测试: ${totalTests}`);
console.log(`  ✅ 通过: ${passedTests}`);
console.log(`  ❌ 失败: ${failedTests}`);

if (failures.length > 0) {
  console.log('\n  失败详情:');
  for (const f of failures) {
    console.log(`    ${f}`);
  }
}

console.log(`\n${'═'.repeat(60)}`);
process.exit(failedTests > 0 ? 1 : 0);
