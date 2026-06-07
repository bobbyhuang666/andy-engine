/**
 * 实验 4：跨会话记忆持久性测试 (ACT-R Memory System)
 *
 * 测试 Andy Engine 的 ACT-R 记忆系统在多天模拟中的记忆衰减行为：
 *   - 高重要性事件（面试、家人住院）是否能持续 7 天
 *   - 低重要性事件（午饭）是否会在 3-4 天后衰减消失
 *   - 记忆关联性：后续事件能否激活相关记忆（面试→面试通过）
 *   - 7 天后 agent 是否仍能回忆起重要事件
 *
 * 用法: node exp4_memory_test.js
 */

const path = require('path');
const fs = require('fs');
const AndyEngine = require(path.join(__dirname, '..', '..', 'index'));

// ═══════════════════════════════════════════
// 配置
// ═══════════════════════════════════════════

const TICKS_PER_DAY = 288; // 24h * 60min / 5min per tick
const TOTAL_DAYS = 7;
const AGENT_ID = 'xiaoi';
const OUTPUT_DIR = path.join(__dirname, 'output');
const OUTPUT_FILE = path.join(OUTPUT_DIR, 'exp4_results.json');

// 要注入的 5 个事件
const EVENTS = [
  {
    id: 'E1',
    content: '用户说下周要面试腾讯',
    importance: 0.95,
    category: 'social',
    emotionTag: 'nervous',
    emotionSnapshot: { nervousness: 0.7, hope: 0.5, fear: 0.3 },
  },
  {
    id: 'E2',
    content: '今天天气很好，心情不错',
    importance: 0.7,
    category: 'weather',
    emotionTag: 'happy',
    emotionSnapshot: { joy: 0.5, calm: 0.4, contentment: 0.3 },
  },
  {
    id: 'E3',
    content: '用户说最近跟男朋友吵架了',
    importance: 0.9,
    category: 'social',
    emotionTag: 'sad',
    emotionSnapshot: { sadness: 0.6, anger: 0.3, frustration: 0.4 },
  },
  {
    id: 'E4',
    content: '午饭吃了蛋炒饭',
    importance: 0.5,
    category: 'daily',
    emotionTag: 'neutral',
    emotionSnapshot: { calm: 0.2, contentment: 0.1 },
  },
  {
    id: 'E5',
    content: '用户说妈妈生病住院了',
    importance: 0.9,
    category: 'social',
    emotionTag: 'sad',
    emotionSnapshot: { sadness: 0.8, fear: 0.5, nervousness: 0.3 },
  },
];

// Day 3 跟进事件
const FOLLOWUP_EVENT = {
  id: 'E6',
  content: '用户说面试通过了！',
  importance: 0.85,
  category: 'social',
  emotionTag: 'happy',
  emotionSnapshot: { joy: 0.8, excitement: 0.7, triumph: 0.5 },
};

// 关键词匹配列表（用于无 LLM 时的回忆测试）
const RECALL_KEYWORDS = {
  E1: ['面试', '腾讯'],
  E2: ['天气', '心情'],
  E3: ['男朋友', '吵架'],
  E4: ['蛋炒饭', '午饭'],
  E5: ['妈妈', '住院', '生病'],
};

// ═══════════════════════════════════════════
// 工具函数
// ═══════════════════════════════════════════

/**
 * 将事件注入 agent 的记忆系统
 * 模拟用户对话产生的经历记忆
 */
function injectMemory(agent, event, simTime) {
  const memory = {
    id: `exp4_${event.id}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    content: event.content,
    category: event.category || 'general',
    emotionTag: event.emotionTag || 'neutral',
    importance: event.importance,
    timestamp: new Date(simTime),
    lastAccessed: new Date(simTime),
    presentations: [new Date(simTime)],
    accessCount: 1,
    associations: ['user', event.category].filter(Boolean),
    emotionSnapshot: event.emotionSnapshot || {},
    appraisal: {
      importance: event.importance,
      valence: event.emotionTag === 'happy' ? 0.5
        : event.emotionTag === 'sad' ? -0.5
        : 0,
      goalRelevance: event.importance > 0.7 ? 0.8 : 0.3,
    },
    semanticCategory: event.category || null,
  };

  agent.memory.memories.push(memory);
  return memory;
}

/**
 * 计算单条记忆的 ACT-R 基础激活度
 * B_i = ln(Σ t_j^(-d))
 * 与 PersonalMemory._baseLevelActivation 保持一致
 */
function computeActivation(memory, now, decayRate = 0.5) {
  const minHours = 0.016; // ~1 分钟最小值
  let sum = 0;

  for (const t of memory.presentations) {
    const hoursSince = Math.max(minHours, (now - t.getTime()) / (1000 * 60 * 60));
    sum += Math.pow(hoursSince, -decayRate);
  }

  return sum > 0 ? Math.log(Math.max(sum, 0.001)) : -10;
}

/**
 * 检查哪些事件仍在 agent 记忆中
 * 返回 { eventId: { inMemory, importance, activation, content } } 映射
 */
function checkMemories(agent, simTime) {
  const result = {};

  for (const event of EVENTS) {
    const matched = agent.memory.memories.find(m =>
      m.id && m.id.startsWith(`exp4_${event.id}_`)
    );

    if (matched) {
      const activation = computeActivation(matched, simTime);
      result[event.id] = {
        inMemory: true,
        importance: matched.importance,
        activation: Math.round(activation * 1000) / 1000,
        accessCount: matched.accessCount,
        content: matched.content,
      };
    } else {
      result[event.id] = {
        inMemory: false,
        importance: 0,
        activation: -999,
        accessCount: 0,
        content: event.content,
      };
    }
  }

  return result;
}

/**
 * 用关键词检查叙事是否提到了相关事件
 */
function checkNarrativeKeywords(narrative, keywords) {
  if (!narrative) return [];
  const found = [];
  for (const kw of keywords) {
    if (narrative.includes(kw)) {
      found.push(kw);
    }
  }
  return found;
}

/**
 * 检查跟进事件的叙事是否与 E1（面试）关联
 */
function checkFollowupConnection(narrative) {
  if (!narrative) return false;
  const connectionKeywords = ['面试', '腾讯', '通过', '录用', 'offer', '好消息'];
  return connectionKeywords.some(kw => narrative.includes(kw));
}

// ═══════════════════════════════════════════
// 主实验流程
// ═══════════════════════════════════════════

async function runExperiment() {
  console.log('=== 实验 4：跨会话记忆持久性测试 (ACT-R) ===\n');

  // ─── 1. 初始化引擎和角色 ───
  const startTime = new Date('2025-06-01T08:00:00');
  const engine = new AndyEngine({
    startTime,
    weather: 'sunny',
  });

  const agent = engine.createCharacter({
    id: AGENT_ID,
    name: '小爱',
    mbti: 'ISFJ',
    background: [
      '喜欢喝拿铁',
      '最好的朋友叫小美',
      '怕狗',
      '在准备考研',
      '家在厦门',
    ],
    schedule: 'student',
    initialPosition: '图书馆',
  });

  const seedMemoryCount = agent.memory.memories.length;
  console.log(`角色创建完成: 小爱 (ISFJ), 种子记忆 ${seedMemoryCount} 条`);

  // ─── 2. Day 0: 注入 5 个事件 ───
  const day0Time = startTime.getTime();
  const injectedMemories = {};
  for (const event of EVENTS) {
    const mem = injectMemory(agent, event, day0Time);
    injectedMemories[event.id] = mem;
    console.log(`  注入 ${event.id}: "${event.content}" (重要性=${event.importance})`);
  }
  console.log(`  当前记忆总数: ${agent.memory.memories.length}\n`);

  // ─── 3. 逐天模拟 ───
  const dayByDay = [];

  for (let day = 0; day <= TOTAL_DAYS; day++) {
    const simTime = engine.world.time.getTime();

    // 获取记忆状态
    const memoryStatus = checkMemories(agent, simTime);

    // 记录仍在记忆中的事件
    const eventsInMemory = EVENTS
      .filter(e => memoryStatus[e.id].inMemory)
      .map(e => e.id);

    // 记录激活度
    const activations = {};
    for (const e of EVENTS) {
      activations[e.id] = memoryStatus[e.id].activation;
    }

    // 获取叙事
    let narrative = '';
    try {
      narrative = engine.getNarrative(AGENT_ID) || '';
    } catch (err) {
      narrative = `[叙事获取失败: ${err.message}]`;
    }

    const dayRecord = {
      day,
      worldTime: engine.world.time.toISOString(),
      events_in_memory: eventsInMemory,
      memory_activations: activations,
      memory_importances: {},
      narrative: narrative.substring(0, 300),
    };

    // 记录当前重要性
    for (const e of EVENTS) {
      dayRecord.memory_importances[e.id] = memoryStatus[e.id].importance;
    }

    dayByDay.push(dayRecord);

    console.log(`--- Day ${day} (${engine.world.time.toISOString().slice(0, 10)}) ---`);
    console.log(`  记忆中: [${eventsInMemory.join(', ')}]`);
    for (const e of EVENTS) {
      const s = memoryStatus[e.id];
      const status = s.inMemory
        ? `重要性=${s.importance.toFixed(3)}, 激活度=${s.activation.toFixed(3)}`
        : '已遗忘';
      console.log(`    ${e.id} (${e.content.substring(0, 10)}...): ${status}`);
    }
    console.log(`  叙事: ${narrative.substring(0, 80)}...`);
    console.log();

    // Day 3: 注入跟进事件
    if (day === 3) {
      console.log('>>> Day 3: 注入跟进事件 <<<');
      const followupMem = injectMemory(agent, FOLLOWUP_EVENT, simTime);
      console.log(`  注入 E6: "${FOLLOWUP_EVENT.content}" (重要性=${FOLLOWUP_EVENT.importance})`);

      // 获取带上下文的叙事（模拟用户说"面试通过了"）
      let followupNarrative = '';
      try {
        followupNarrative = engine.getNarrative(AGENT_ID, {
          userText: '面试通过了！',
          relationship: 60,
        }) || '';
      } catch (err) {
        followupNarrative = `[叙事获取失败: ${err.message}]`;
      }

      const connected = checkFollowupConnection(followupNarrative);
      console.log(`  跟进叙事: ${followupNarrative.substring(0, 100)}...`);
      console.log(`  是否关联到 E1 (面试): ${connected ? '是' : '否'}\n`);

      // 记录跟进测试结果
      dayByDay[dayByDay.length - 1].followup_test = {
        input: '面试通过了！',
        narrative: followupNarrative.substring(0, 300),
        connected_to_E1: connected,
      };
    }

    // Day 7: 最终回忆测试
    if (day === 7) {
      console.log('>>> Day 7: 最终回忆测试 <<<');
      let recallNarrative = '';
      try {
        recallNarrative = engine.getNarrative(AGENT_ID, {
          userText: '你还记得我之前跟你说过什么重要的事吗？',
          relationship: 60,
        }) || '';
      } catch (err) {
        recallNarrative = `[叙事获取失败: ${err.message}]`;
      }

      const allKeywords = [
        ...RECALL_KEYWORDS.E1,
        ...RECALL_KEYWORDS.E2,
        ...RECALL_KEYWORDS.E3,
        ...RECALL_KEYWORDS.E4,
        ...RECALL_KEYWORDS.E5,
      ];
      const mentionedKeywords = checkNarrativeKeywords(recallNarrative, allKeywords);

      // 按事件分组检查
      const mentionedEvents = [];
      for (const [eventId, keywords] of Object.entries(RECALL_KEYWORDS)) {
        const found = keywords.some(kw => recallNarrative.includes(kw));
        if (found) mentionedEvents.push(eventId);
      }

      console.log(`  叙事: ${recallNarrative.substring(0, 150)}...`);
      console.log(`  提到的关键词: [${mentionedKeywords.join(', ')}]`);
      console.log(`  提到的事件: [${mentionedEvents.join(', ')}]`);

      dayByDay[dayByDay.length - 1].recall_test = {
        input: '你还记得我之前跟你说过什么重要的事吗？',
        narrative: recallNarrative.substring(0, 500),
        mentioned_keywords: mentionedKeywords,
        mentioned_events: mentionedEvents,
      };
    }

    // 推进一天（如果还没到最后一天）
    if (day < TOTAL_DAYS) {
      engine.runTicks(TICKS_PER_DAY);
    }
  }

  // ─── 4. 计算总结统计 ───
  const highImportanceEvents = EVENTS.filter(e => e.importance >= 0.85); // E1, E3, E5
  const lowImportanceEvents = EVENTS.filter(e => e.importance < 0.85);  // E2, E4

  const lastDay = dayByDay[dayByDay.length - 1];
  const eventsStillInMemory = new Set(lastDay.events_in_memory);

  const highRetained = highImportanceEvents.filter(e => eventsStillInMemory.has(e.id)).length;
  const lowRetained = lowImportanceEvents.filter(e => eventsStillInMemory.has(e.id)).length;

  const highRetentionRate = highImportanceEvents.length > 0
    ? Math.round((highRetained / highImportanceEvents.length) * 100)
    : 0;
  const lowRetentionRate = lowImportanceEvents.length > 0
    ? Math.round((lowRetained / lowImportanceEvents.length) * 100)
    : 0;

  // 跟进测试结果
  const followupDay = dayByDay.find(d => d.day === 3);
  const followupResult = followupDay && followupDay.followup_test
    ? followupDay.followup_test
    : { connected_to_E1: false, narrative: '', input: '' };

  // 回忆测试结果
  const recallDay = dayByDay.find(d => d.day === 7);
  const recallResult = recallDay && recallDay.recall_test
    ? recallDay.recall_test
    : { mentioned_events: [], mentioned_keywords: [], narrative: '', input: '' };

  // ─── 5. 组装最终结果 ───
  const results = {
    character: '小爱 (ISFJ)',
    seed_memories_count: seedMemoryCount,
    experiment_config: {
      total_days: TOTAL_DAYS,
      ticks_per_day: TICKS_PER_DAY,
      events_count: EVENTS.length,
      events: EVENTS.map(e => ({ id: e.id, content: e.content, importance: e.importance })),
    },
    day_by_day: dayByDay.map(d => ({
      day: d.day,
      worldTime: d.worldTime,
      events_in_memory: d.events_in_memory,
      memory_activations: d.memory_activations,
      memory_importances: d.memory_importances,
      narrative: d.narrative,
    })),
    followup_test: {
      day: 3,
      input: followupResult.input,
      narrative: followupResult.narrative,
      connected_to_E1: followupResult.connected_to_E1,
    },
    recall_test: {
      day: 7,
      input: recallResult.input,
      narrative: recallResult.narrative,
      mentioned_events: recallResult.mentioned_events,
      mentioned_keywords: recallResult.mentioned_keywords,
    },
    summary: {
      high_importance_events: highImportanceEvents.map(e => e.id),
      low_importance_events: lowImportanceEvents.map(e => e.id),
      high_importance_retention: `${highRetentionRate}%`,
      low_importance_retention: `${lowRetentionRate}%`,
      day7_events_remaining: lastDay.events_in_memory,
      followup_connected: followupResult.connected_to_E1,
      recall_mentioned_count: recallResult.mentioned_events.length,
    },
    metadata: {
      engine_version: require(path.join(__dirname, '..', '..', 'package.json')).version,
      node_version: process.version,
      run_at: new Date().toISOString(),
    },
  };

  // ─── 6. 保存结果 ───
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(results, null, 2), 'utf-8');

  // ─── 7. 打印最终报告 ───
  console.log('=== 实验结果总结 ===\n');
  console.log(`角色: ${results.character}`);
  console.log(`种子记忆: ${seedMemoryCount} 条`);
  console.log(`注入事件: ${EVENTS.length} 个`);
  console.log(`模拟天数: ${TOTAL_DAYS} 天\n`);

  console.log('记忆持久性:');
  console.log(`  高重要性事件 (>=0.85) 保留率: ${results.summary.high_importance_retention}`);
  console.log(`    保留的: [${highImportanceEvents.filter(e => eventsStillInMemory.has(e.id)).map(e => e.id).join(', ')}]`);
  console.log(`  低重要性事件 (<0.85) 保留率: ${results.summary.low_importance_retention}`);
  console.log(`    保留的: [${lowImportanceEvents.filter(e => eventsStillInMemory.has(e.id)).map(e => e.id).join(', ')}]\n`);

  console.log('跟进测试 (Day 3):');
  console.log(`  输入: "${followupResult.input}"`);
  console.log(`  关联到 E1 (面试): ${followupResult.connected_to_E1 ? '是' : '否'}\n`);

  console.log('回忆测试 (Day 7):');
  console.log(`  提到的事件: [${recallResult.mentioned_events.join(', ')}]`);
  console.log(`  提到的关键词: [${recallResult.mentioned_keywords.join(', ')}]\n`);

  console.log(`结果已保存至: ${OUTPUT_FILE}`);

  return results;
}

// ═══════════════════════════════════════════
// 运行
// ═══════════════════════════════════════════

runExperiment().catch(err => {
  console.error('实验运行失败:', err);
  process.exit(1);
});
