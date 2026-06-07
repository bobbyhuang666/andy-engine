#!/usr/bin/env node
/**
 * Experiment 5: Emergent Behaviors in Andy Engine
 *
 * Large-scale simulation testing emergent social dynamics:
 *   a) Relationship Emergence (Dunbar social layers)
 *   b) Emotion Contagion (valence correlation between frequent interactors)
 *   c) Behavior-Needs Consistency (do agents act on their drives?)
 *   d) Personality Differentiation (extraverts vs introverts)
 *   e) Emotion Dynamics (persistence, negativity bias)
 *
 * 20 agents, 2880 ticks (10 simulated days, 5 min/tick)
 * Target runtime: 2-5 minutes on M1 16GB
 */

'use strict';

const fs = require('fs');
const path = require('path');

// ─── Load Andy Engine ─────────────────────────────────────────────────────────

let AndyEngine;
try {
  AndyEngine = require('../../index.js');
} catch (e) {
  try {
    AndyEngine = require('andy-engine');
  } catch (e2) {
    console.error('ERROR: Cannot load AndyEngine.');
    process.exit(1);
  }
}

// ─── Constants ─────────────────────────────────────────────────────────────────

const TOTAL_TICKS = 2880;       // 10 days at 5 min/tick
const TICKS_PER_DAY = 288;
const PROGRESS_INTERVAL = 288;  // log every simulated day
const CHECKPOINT_TICKS = [0, 288, 1440, 2880];

const SOCIAL_STATES = new Set([
  '在聊天', '在校园广场', '在咖啡店', '在食堂',
]);
const SLEEP_STATES = new Set([
  '睡了', '在翻身', '快睡了',
]);
const FOOD_REGIONS = new Set([
  '食堂', '便利店',
]);

const OUTPUT_DIR = path.join(__dirname, 'output');
const OUTPUT_FILE = path.join(OUTPUT_DIR, 'exp5_results.json');

// ─── Agent Definitions ─────────────────────────────────────────────────────────

const AGENT_DEFS = [
  // Students (5)
  { id: 's_enfp', name: '活泼学生(ENFP)', mbti: 'ENFP', schedule: 'student',
    background: ['大二中文系学生', '喜欢参加社团活动', '最近在学吉他', '宿舍里贴满了海报', '和室友关系很好'] },
  { id: 's_istj', name: '学霸(ISTJ)', mbti: 'ISTJ', schedule: 'student',
    background: ['大三计算机系', '每天早起去图书馆', '成绩年级第一', '不太爱说话', '做事很有条理'] },
  { id: 's_intp', name: '研究狂(INTP)', mbti: 'INTP', schedule: 'student',
    background: ['大四物理系', '在做毕业设计', '经常忘记吃饭', '喜欢深夜思考问题', '有一个小众爱好'] },
  { id: 's_esfj', name: '班长(ESFJ)', mbti: 'ESFJ', schedule: 'student',
    background: ['大二管理系', '是班里的班长', '组织能力很强', '喜欢照顾同学', '周末会做志愿者'] },
  { id: 's_intj', name: '独行侠(INTJ)', mbti: 'INTJ', schedule: 'student',
    background: ['大三哲学系', '喜欢一个人待着', '在写一本小说', '对存在主义很感兴趣', '很少参加聚会'] },

  // Workers (5)
  { id: 'w_entj', name: '项目经理(ENTJ)', mbti: 'ENTJ', schedule: 'worker',
    background: ['在科技公司做项目经理', '工作压力很大', '经常加班', '周末喜欢爬山', '有一个三岁的女儿'] },
  { id: 'w_isfp', name: '设计师(ISFP)', mbti: 'ISFP', schedule: 'worker',
    background: ['在广告公司做设计', '喜欢画画和摄影', '养了一只猫', '性格比较安静', '最近在学烘焙'] },
  { id: 'w_entp', name: '创业者(ENTP)', mbti: 'ENTP', schedule: 'worker',
    background: ['自己创业做APP', '想法很多执行力一般', '社交能力很强', '喜欢辩论', '最近在找投资'] },
  { id: 'w_istp', name: '工程师(ISTP)', mbti: 'ISTP', schedule: 'worker',
    background: ['在互联网公司做后端', '喜欢拆解机械', '话不多但很靠谱', '周末骑摩托车', '住在公司附近'] },
  { id: 'w_enfj', name: '老师(ENFJ)', mbti: 'ENFJ', schedule: 'worker',
    background: ['在高中教语文', '很受学生欢迎', '喜欢读书和写作', '养了两条金鱼', '最近在准备公开课'] },

  // Freelancers (5)
  { id: 'f_infp', name: '插画师(INFP)', mbti: 'INFP', schedule: 'freelancer',
    background: ['自由插画师', '在家工作', '喜欢看日落', '养了一盆多肉', '最近在画一本绘本'] },
  { id: 'f_estp', name: '摄影师(ESTP)', mbti: 'ESTP', schedule: 'freelancer',
    background: ['自由摄影师', '经常到处跑', '喜欢冒险和刺激', '朋友圈很广', '最近在拍一个纪录片'] },
  { id: 'f_infj', name: '作家(INFJ)', mbti: 'INFJ', schedule: 'freelancer',
    background: ['自由撰稿人', '喜欢安静的环境', '在写一部长篇小说', '经常去咖啡店写作', '有一个笔友'] },
  { id: 'f_estj', name: '咨询师(ESTJ)', mbti: 'ESTJ', schedule: 'freelancer',
    background: ['管理咨询顾问', '工作时间不固定', '做事很有效率', '喜欢健身', '最近在考一个证书'] },
  { id: 'f_intp', name: '独立开发者(INTP)', mbti: 'INTP', schedule: 'freelancer',
    background: ['独立游戏开发者', '在家写代码', '喜欢玩桌游', '经常忘记时间', '养了一只仓鼠'] },

  // Homebodies (5)
  { id: 'h_isfj', name: '全职妈妈(ISFJ)', mbti: 'ISFJ', schedule: 'home',
    background: ['全职在家带孩子', '喜欢做饭和收拾家', '最近在学插花', '有两个小孩', '老公经常出差'] },
  { id: 'h_esfp', name: '美食博主(ESFP)', mbti: 'ESFP', schedule: 'home',
    background: ['在家做美食博主', '喜欢尝试新菜谱', '性格开朗', '最近在学日语', '养了三只猫'] },
  { id: 'h_entp', name: '网文作者(ENTP)', mbti: 'ENTP', schedule: 'home',
    background: ['在家写网文', '更新不太稳定', '喜欢打游戏', '经常熬夜', '最近在追一部动漫'] },
  { id: 'h_istj', name: '退休教授(ISTJ)', mbti: 'ISTJ', schedule: 'home',
    background: ['退休的数学教授', '生活很有规律', '喜欢下棋', '每天看新闻', '有一个老朋友住附近'] },
  { id: 'h_infp', name: '自由撰稿人(INFP)', mbti: 'INFP', schedule: 'home',
    background: ['在家写散文和诗歌', '喜欢听雨声', '养了一只兔子', '最近在学画画', '很少出门'] },
];

// ─── Utility Functions ─────────────────────────────────────────────────────────

/**
 * Pearson correlation coefficient
 */
function pearsonCorrelation(xs, ys) {
  const n = xs.length;
  if (n < 3) return 0;

  let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0, sumY2 = 0;
  for (let i = 0; i < n; i++) {
    sumX += xs[i];
    sumY += ys[i];
    sumXY += xs[i] * ys[i];
    sumX2 += xs[i] * xs[i];
    sumY2 += ys[i] * ys[i];
  }

  const num = n * sumXY - sumX * sumY;
  const den = Math.sqrt((n * sumX2 - sumX * sumX) * (n * sumY2 - sumY * sumY));
  if (den === 0) return 0;
  return num / den;
}

/**
 * Simple two-sample t-test (Welch's)
 */
function welchTTest(xs, ys) {
  const n1 = xs.length, n2 = ys.length;
  if (n1 < 2 || n2 < 2) return { t: 0, df: 0, significant: false };

  const mean1 = xs.reduce((a, b) => a + b, 0) / n1;
  const mean2 = ys.reduce((a, b) => a + b, 0) / n2;
  const var1 = xs.reduce((a, x) => a + (x - mean1) ** 2, 0) / (n1 - 1);
  const var2 = ys.reduce((a, x) => a + (x - mean2) ** 2, 0) / (n2 - 1);

  const se = Math.sqrt(var1 / n1 + var2 / n2);
  if (se === 0) return { t: 0, df: 0, significant: false };

  const t = (mean1 - mean2) / se;
  const df = ((var1 / n1 + var2 / n2) ** 2) /
    ((var1 / n1) ** 2 / (n1 - 1) + (var2 / n2) ** 2 / (n2 - 1));

  // Approximate critical value for p < 0.05 two-tailed
  const critical = 2.0; // rough approximation for moderate df
  return { t, df, significant: Math.abs(t) > critical };
}

/**
 * Autocorrelation at given lag
 */
function autocorrelation(series, lag) {
  const n = series.length;
  if (n <= lag + 2) return 0;

  const mean = series.reduce((a, b) => a + b, 0) / n;
  let num = 0, den = 0;
  for (let i = 0; i < n; i++) {
    den += (series[i] - mean) ** 2;
  }
  for (let i = 0; i < n - lag; i++) {
    num += (series[i] - mean) * (series[i + lag] - mean);
  }
  return den === 0 ? 0 : num / den;
}

/**
 * Count relationship types from social graph
 */
function countRelationshipTypes(graph, agentIds) {
  const counts = { closeFriend: 0, friend: 0, acquaintance: 0, stranger: 0 };
  const processed = new Set();

  for (let i = 0; i < agentIds.length; i++) {
    const rels = graph.getRelationships(agentIds[i]);
    for (const rel of rels) {
      const key = [rel.agentA, rel.agentB].sort().join('_');
      if (processed.has(key)) continue;
      processed.add(key);
      const type = rel.type || 'stranger';
      counts[type] = (counts[type] || 0) + 1;
    }
  }

  // All pairs not found are strangers
  const totalPairs = (agentIds.length * (agentIds.length - 1)) / 2;
  const foundPairs = counts.closeFriend + counts.friend + counts.acquaintance;
  counts.stranger = totalPairs - foundPairs;

  return counts;
}

/**
 * Get top relationship pairs by strength
 */
function getTopPairs(graph, agentIds, limit = 10) {
  const pairs = [];
  const processed = new Set();

  for (let i = 0; i < agentIds.length; i++) {
    const rels = graph.getRelationships(agentIds[i]);
    for (const rel of rels) {
      const key = [rel.agentA, rel.agentB].sort().join('_');
      if (processed.has(key)) continue;
      processed.add(key);
      pairs.push([rel.agentA, rel.agentB, Math.round(rel.strength * 10000) / 10000]);
    }
  }

  pairs.sort((a, b) => b[2] - a[2]);
  return pairs.slice(0, limit);
}

// ─── Main Experiment ───────────────────────────────────────────────────────────

function run() {
  console.log('=== Experiment 5: Emergent Behaviors ===');
  console.log(`Config: ${AGENT_DEFS.length} agents, ${TOTAL_TICKS} ticks (${TOTAL_TICKS / TICKS_PER_DAY} simulated days)`);
  console.log('');

  // ─── Setup ───────────────────────────────────────────────────────────────────

  const engine = new AndyEngine({
    startTime: new Date('2025-06-01T08:00:00'),
    weather: 'sunny',
  });

  const agents = [];
  for (const def of AGENT_DEFS) {
    const agent = engine.createCharacter({
      id: def.id,
      name: def.name,
      mbti: def.mbti,
      schedule: def.schedule,
      background: def.background,
    });
    agents.push(agent);
  }

  const agentIds = agents.map(a => a.id);

  // Pre-compute extraversion groups
  const extraverts = agents.filter(a => a.personality.ocean.extraversion > 0.7);
  const introverts = agents.filter(a => a.personality.ocean.extraversion < 0.3);

  console.log(`Extraverts (E>0.7): ${extraverts.map(a => a.id).join(', ')}`);
  console.log(`Introverts (E<0.3): ${introverts.map(a => a.id).join(', ')}`);
  console.log('');

  // ─── Data Collection Structures ──────────────────────────────────────────────

  // a) Relationship emergence snapshots
  const relSnapshots = {};

  // b) Emotion contagion: valence time series per agent
  const valenceHistory = {};
  for (const id of agentIds) valenceHistory[id] = [];

  // c) Behavior-needs consistency: random observations
  const behaviorObservations = [];

  // d) Personality differentiation: per-tick social state tracking
  const socialStateCounts = {};
  const socialInteractionCounts = {};
  const socialNeedRecovery = {};
  for (const id of agentIds) {
    socialStateCounts[id] = 0;
    socialInteractionCounts[id] = 0;
    socialNeedRecovery[id] = { sum: 0, count: 0 };
  }

  // e) Emotion dynamics: per-agent valence series for autocorrelation
  const emotionSeries = {};
  for (const id of agentIds) emotionSeries[id] = [];

  // Track negative/positive event aftermath
  const negativeEventTicks = {};  // agentId -> tick when negative event hit
  const positiveEventTicks = {};
  const negEventBaseline = {};   // agentId -> baseline valence at event time
  const posEventBaseline = {};
  const negAftermath = [];  // valence deviation samples after negative events
  const posAftermath = [];

  // Random observation schedule (500 random (agent, tick) pairs for better coverage)
  const randomObs = [];
  for (let i = 0; i < 500; i++) {
    randomObs.push({
      agentIdx: Math.floor(Math.random() * agentIds.length),
      tick: Math.floor(Math.random() * TOTAL_TICKS) + 1,
    });
  }

  // Also track per-tick needs-state pairs for systematic analysis
  const needsStateLog = [];
  const NEeds_SAMPLE_INTERVAL = 12; // every 12 ticks (1 hour) to keep data manageable

  // ─── Simulation Loop ─────────────────────────────────────────────────────────

  const t0 = Date.now();
  let lastProgressTime = t0;

  for (let tick = 1; tick <= TOTAL_TICKS; tick++) {
    engine.tick();
    const graph = engine.getSocialGraph();
    const simTime = engine.world.time;
    const hour = simTime.getHours() + simTime.getMinutes() / 60;
    const dayOfWeek = simTime.getDay();

    // ── Collect valence for all agents ──
    for (const agent of agents) {
      const v = agent.emotion.getValence();
      valenceHistory[agent.id].push(v);
      emotionSeries[agent.id].push(v);
    }

    // ── Track social states and interactions ──
    for (const agent of agents) {
      const state = agent.stateMachine.currentState;
      const isSocial = SOCIAL_STATES.has(state);
      if (isSocial) {
        socialStateCounts[agent.id]++;
      }

      // Track social need recovery when in social state
      if (isSocial) {
        const socialNeed = agent.needs.needs.social;
        socialNeedRecovery[agent.id].sum += socialNeed;
        socialNeedRecovery[agent.id].count++;
      }
    }

    // ── Track interaction counts from relationships ──
    // (done at checkpoints instead for performance)

    // ── Behavior-needs consistency checks (random samples) ──
    for (const obs of randomObs) {
      if (obs.tick === tick) {
        const agent = agents[obs.agentIdx];
        const hunger = agent.needs.needs.hunger;
        const energy = agent.needs.needs.energy;
        const state = agent.stateMachine.currentState;
        const position = agent.position;
        const isNight = hour >= 22 || hour < 6;

        behaviorObservations.push({
          agentId: agent.id,
          tick,
          hunger,
          energy,
          state,
          position,
          hour,
          isNight,
          hungerLow: hunger < 0.4,
          energyLow: energy < 0.35,
          atFoodArea: FOOD_REGIONS.has(position) || state === '在吃饭' || state === '在食堂',
          isSleeping: SLEEP_STATES.has(state),
          isIdle: !SOCIAL_STATES.has(state) && state !== '在工作' && state !== '在上课' && state !== '在打工',
        });
      }
    }

    // ── Systematic needs-state sampling (every hour) ──
    if (tick % NEeds_SAMPLE_INTERVAL === 0) {
      for (const agent of agents) {
        const hunger = agent.needs.needs.hunger;
        const energy = agent.needs.needs.energy;
        const state = agent.stateMachine.currentState;
        const position = agent.position;
        const isNight = hour >= 22 || hour < 6;

        needsStateLog.push({
          agentId: agent.id,
          tick,
          hunger,
          energy,
          state,
          position,
          hour,
          isNight,
        });
      }
    }

    // ── Emotion dynamics: detect negative/positive events ──
    // Use rolling window: compare current valence to 24-tick (2h) moving average
    // Use relative thresholds (no absolute sign requirement) since agents rarely go negative
    if (tick > 24) {
      for (const agent of agents) {
        const series = emotionSeries[agent.id];
        const curr = series[series.length - 1];

        // Compute 24-tick moving average (excluding current)
        const windowSize = 24;
        const windowStart = Math.max(0, series.length - 1 - windowSize);
        const window = series.slice(windowStart, series.length - 1);
        const windowMean = window.length > 0 ? window.reduce((a, b) => a + b, 0) / window.length : curr;
        const windowStd = window.length > 1
          ? Math.sqrt(window.reduce((a, v) => a + (v - windowMean) ** 2, 0) / window.length)
          : 0.01;
        const zScore = windowStd > 0 ? (curr - windowMean) / windowStd : 0;

        // Detect negative event: valence drops > 1.5 std below recent average
        if (zScore < -1.5) {
          negativeEventTicks[agent.id] = tick;
          negEventBaseline[agent.id] = windowMean;
        }
        // Detect positive event: valence rises > 1.5 std above recent average
        if (zScore > 1.5) {
          positiveEventTicks[agent.id] = tick;
          posEventBaseline[agent.id] = windowMean;
        }

        // Sample aftermath: measure deviation from the pre-event baseline
        if (negativeEventTicks[agent.id] && tick > negativeEventTicks[agent.id] + 10 && tick <= negativeEventTicks[agent.id] + 50) {
          const baseline = negEventBaseline[agent.id] || 0;
          negAftermath.push(curr - baseline); // deviation from baseline
        }
        if (positiveEventTicks[agent.id] && tick > positiveEventTicks[agent.id] + 10 && tick <= positiveEventTicks[agent.id] + 50) {
          const baseline = posEventBaseline[agent.id] || 0;
          posAftermath.push(curr - baseline); // deviation from baseline
        }
      }
    }

    // ── Relationship snapshots at checkpoints ──
    if (CHECKPOINT_TICKS.includes(tick)) {
      relSnapshots[`tick_${tick}`] = countRelationshipTypes(graph, agentIds);
    }

    // ── Interaction count tracking at day boundaries ──
    if (tick % TICKS_PER_DAY === 0) {
      for (const agent of agents) {
        const rels = graph.getRelationships(agent.id);
        let totalInteractions = 0;
        for (const rel of rels) {
          totalInteractions += rel.interactionCount || 0;
        }
        socialInteractionCounts[agent.id] = totalInteractions;
      }
    }

    // ── Progress logging ──
    if (tick % PROGRESS_INTERVAL === 0) {
      const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
      const day = tick / TICKS_PER_DAY;
      const tickMs = ((Date.now() - lastProgressTime) / PROGRESS_INTERVAL).toFixed(1);
      lastProgressTime = Date.now();

      const relCounts = relSnapshots[`tick_${tick}`] || countRelationshipTypes(engine.getSocialGraph(), agentIds);
      const avgValence = (agents.reduce((s, a) => s + a.emotion.getValence(), 0) / agents.length).toFixed(3);

      console.log(`  Day ${day}/10 | tick ${tick}/${TOTAL_TICKS} | ${elapsed}s | ~${tickMs}ms/tick | rels: CF=${relCounts.closeFriend} F=${relCounts.friend} A=${relCounts.acquaintance} | avgV=${avgValence}`);
    }
  }

  const totalElapsed = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(`\nSimulation complete in ${totalElapsed}s`);

  // ─── Analysis ────────────────────────────────────────────────────────────────

  console.log('\n--- Analysis ---');

  const graph = engine.getSocialGraph();

  // ═══ a) Relationship Emergence ═══
  console.log('\n[a] Relationship Emergence');

  // Ensure we have the final snapshot
  relSnapshots.tick_2880 = countRelationshipTypes(graph, agentIds);
  const topPairs = getTopPairs(graph, agentIds, 10);

  console.log('  Snapshots:');
  for (const [tick, counts] of Object.entries(relSnapshots)) {
    console.log(`    ${tick}: CF=${counts.closeFriend} F=${counts.friend} A=${counts.acquaintance} S=${counts.stranger}`);
  }
  console.log('  Top pairs:');
  for (const [a, b, s] of topPairs.slice(0, 5)) {
    const rel = graph.getRelationship(a, b);
    console.log(`    ${a} <-> ${b}: strength=${s} type=${rel ? rel.type : 'N/A'} interactions=${rel ? rel.interactionCount : 0}`);
  }

  // ═══ b) Emotion Contagion ═══
  console.log('\n[b] Emotion Contagion');

  // For each pair of agents, compute:
  //   - interaction frequency (from relationship interactionCount)
  //   - valence similarity (1 - |mean_v_a - mean_v_b|)
  const pairData = [];
  for (let i = 0; i < agentIds.length; i++) {
    for (let j = i + 1; j < agentIds.length; j++) {
      const rel = graph.getRelationship(agentIds[i], agentIds[j]);
      const interactions = rel ? rel.interactionCount : 0;

      const meanVA = valenceHistory[agentIds[i]].reduce((a, b) => a + b, 0) / valenceHistory[agentIds[i]].length;
      const meanVB = valenceHistory[agentIds[j]].reduce((a, b) => a + b, 0) / valenceHistory[agentIds[j]].length;
      const valenceSimilarity = 1 - Math.abs(meanVA - meanVB);

      // Also compute correlation of valence time series
      const seriesA = valenceHistory[agentIds[i]];
      const seriesB = valenceHistory[agentIds[j]];
      const valenceCorrelation = pearsonCorrelation(seriesA, seriesB);

      pairData.push({ interactions, valenceSimilarity, valenceCorrelation });
    }
  }

  const interactionFreqs = pairData.map(p => p.interactions);
  const valenceSims = pairData.map(p => p.valenceSimilarity);
  const contagionCorrelation = pearsonCorrelation(interactionFreqs, valenceSims);

  // Also check: pairs with high interaction have more correlated valence?
  const highInteractionPairs = pairData.filter(p => p.interactions > 5);
  const lowInteractionPairs = pairData.filter(p => p.interactions <= 5);
  const highIntMeanCorr = highInteractionPairs.length > 0
    ? highInteractionPairs.reduce((s, p) => s + p.valenceCorrelation, 0) / highInteractionPairs.length
    : 0;
  const lowIntMeanCorr = lowInteractionPairs.length > 0
    ? lowInteractionPairs.reduce((s, p) => s + p.valenceCorrelation, 0) / lowInteractionPairs.length
    : 0;

  console.log(`  Interaction-frequency vs valence-similarity correlation: ${contagionCorrelation.toFixed(4)}`);
  console.log(`  High-interaction pairs mean valence correlation: ${highIntMeanCorr.toFixed(4)} (n=${highInteractionPairs.length})`);
  console.log(`  Low-interaction pairs mean valence correlation: ${lowIntMeanCorr.toFixed(4)} (n=${lowInteractionPairs.length})`);

  // ═══ c) Behavior-Needs Consistency ═══
  console.log('\n[c] Behavior-Needs Consistency');

  // Method 1: Random observations with broadened thresholds
  const hungerObs = behaviorObservations.filter(o => o.hungerLow);
  const hungerFoodRate = hungerObs.length > 0
    ? hungerObs.filter(o => o.atFoodArea).length / hungerObs.length
    : 0;

  const nightObs = behaviorObservations.filter(o => o.energyLow && o.isNight);
  const nightSleepRate = nightObs.length > 0
    ? nightObs.filter(o => o.isSleeping).length / nightObs.length
    : 0;

  // Method 2: Systematic analysis from needsStateLog
  // Check: when hunger drops below 0.5, does the agent eventually go to food?
  // We look at consecutive samples: low hunger -> food area within 2 samples (2 hours)
  let hungerFollowedByFood = 0;
  let hungerTotal = 0;
  const samplesPerAgent = {};
  for (const obs of needsStateLog) {
    if (!samplesPerAgent[obs.agentId]) samplesPerAgent[obs.agentId] = [];
    samplesPerAgent[obs.agentId].push(obs);
  }
  for (const [agentId, samples] of Object.entries(samplesPerAgent)) {
    for (let i = 0; i < samples.length - 2; i++) {
      if (samples[i].hunger < 0.5) {
        hungerTotal++;
        // Check if in next 2 samples the agent is at food area
        const future = samples.slice(i + 1, i + 3);
        if (future.some(s => FOOD_REGIONS.has(s.position) || s.state === '在吃饭' || s.state === '在食堂')) {
          hungerFollowedByFood++;
        }
      }
    }
  }
  const hungerFollowRate = hungerTotal > 0 ? hungerFollowedByFood / hungerTotal : 0;

  // Check: when energy < 0.4 at night, is agent sleeping in next 2 samples?
  let sleepFollowedBySleep = 0;
  let sleepTotal = 0;
  for (const [agentId, samples] of Object.entries(samplesPerAgent)) {
    for (let i = 0; i < samples.length - 2; i++) {
      if (samples[i].energy < 0.4 && samples[i].isNight) {
        sleepTotal++;
        const future = samples.slice(i + 1, i + 3);
        if (future.some(s => SLEEP_STATES.has(s.state))) {
          sleepFollowedBySleep++;
        }
      }
    }
  }
  const sleepFollowRate = sleepTotal > 0 ? sleepFollowedBySleep / sleepTotal : 0;

  console.log(`  [Random] Hunger<0.4 at food area: ${hungerObs.filter(o => o.atFoodArea).length}/${hungerObs.length} = ${(hungerFoodRate * 100).toFixed(1)}%`);
  console.log(`  [Random] Energy<0.35 night sleeping: ${nightObs.filter(o => o.isSleeping).length}/${nightObs.length} = ${(nightSleepRate * 100).toFixed(1)}%`);
  console.log(`  [Systematic] Low hunger -> food within 2h: ${hungerFollowedByFood}/${hungerTotal} = ${(hungerFollowRate * 100).toFixed(1)}%`);
  console.log(`  [Systematic] Low energy night -> sleep within 2h: ${sleepFollowedBySleep}/${sleepTotal} = ${(sleepFollowRate * 100).toFixed(1)}%`);
  console.log(`  (Random obs: ${behaviorObservations.length}, Systematic obs: ${needsStateLog.length})`);

  // ═══ d) Personality Differentiation ═══
  console.log('\n[d] Personality Differentiation (Extraversion)');

  const extSocialTime = extraverts.map(a => socialStateCounts[a.id] / TOTAL_TICKS);
  const intSocialTime = introverts.map(a => socialStateCounts[a.id] / TOTAL_TICKS);

  const extSocialInteractions = extraverts.map(a => socialInteractionCounts[a.id]);
  const intSocialInteractions = introverts.map(a => socialInteractionCounts[a.id]);

  const extSocialNeedRecovery = extraverts.map(a => {
    const d = socialNeedRecovery[a.id];
    return d.count > 0 ? d.sum / d.count : 0;
  });
  const intSocialNeedRecovery = introverts.map(a => {
    const d = socialNeedRecovery[a.id];
    return d.count > 0 ? d.sum / d.count : 0;
  });

  const meanExtSocialTime = extSocialTime.length > 0 ? extSocialTime.reduce((a, b) => a + b, 0) / extSocialTime.length : 0;
  const meanIntSocialTime = intSocialTime.length > 0 ? intSocialTime.reduce((a, b) => a + b, 0) / intSocialTime.length : 0;
  const meanExtInteractions = extSocialInteractions.length > 0 ? extSocialInteractions.reduce((a, b) => a + b, 0) / extSocialInteractions.length : 0;
  const meanIntInteractions = intSocialInteractions.length > 0 ? intSocialInteractions.reduce((a, b) => a + b, 0) / intSocialInteractions.length : 0;
  const meanExtSocialNeed = extSocialNeedRecovery.length > 0 ? extSocialNeedRecovery.reduce((a, b) => a + b, 0) / extSocialNeedRecovery.length : 0;
  const meanIntSocialNeed = intSocialNeedRecovery.length > 0 ? intSocialNeedRecovery.reduce((a, b) => a + b, 0) / intSocialNeedRecovery.length : 0;

  const socialTimeTTest = welchTTest(extSocialTime, intSocialTime);
  const interactionsTTest = welchTTest(extSocialInteractions, intSocialInteractions);

  console.log(`  Extraverts (n=${extraverts.length}): social time=${(meanExtSocialTime * 100).toFixed(1)}%, interactions=${meanExtInteractions.toFixed(0)}, social need=${meanExtSocialNeed.toFixed(3)}`);
  console.log(`  Introverts (n=${introverts.length}): social time=${(meanIntSocialTime * 100).toFixed(1)}%, interactions=${meanIntInteractions.toFixed(0)}, social need=${meanIntSocialNeed.toFixed(3)}`);
  console.log(`  Social time t-test: t=${socialTimeTTest.t.toFixed(3)}, df=${socialTimeTTest.df.toFixed(1)}, significant=${socialTimeTTest.significant}`);
  console.log(`  Interactions t-test: t=${interactionsTTest.t.toFixed(3)}, df=${interactionsTTest.df.toFixed(1)}, significant=${interactionsTTest.significant}`);

  // ═══ e) Emotion Dynamics ═══
  console.log('\n[e] Emotion Dynamics');

  // Global stats
  const allValences = [];
  for (const id of agentIds) {
    allValences.push(...emotionSeries[id]);
  }
  const globalMean = allValences.reduce((a, b) => a + b, 0) / allValences.length;
  const globalStd = Math.sqrt(allValences.reduce((a, v) => a + (v - globalMean) ** 2, 0) / allValences.length);

  // Autocorrelation (lag-1 averaged across agents)
  const autocorrPerAgent = agentIds.map(id => autocorrelation(emotionSeries[id], 1));
  const meanAutocorr = autocorrPerAgent.reduce((a, b) => a + b, 0) / autocorrPerAgent.length;

  // Lag-24 autocorrelation (roughly 2 hours)
  const autocorrLag24 = agentIds.map(id => autocorrelation(emotionSeries[id], 24));
  const meanAutocorrLag24 = autocorrLag24.reduce((a, b) => a + b, 0) / autocorrLag24.length;

  // Negativity bias: compare aftermath deviation from baseline
  // Negative bias means: after a negative event, valence stays below baseline longer
  // than it stays above baseline after a positive event
  const negMean = negAftermath.length > 0 ? negAftermath.reduce((a, b) => a + b, 0) / negAftermath.length : 0;
  const posMean = posAftermath.length > 0 ? posAftermath.reduce((a, b) => a + b, 0) / posAftermath.length : 0;
  // Negativity bias: negative aftermath deviation is more negative than positive aftermath is positive
  // i.e., |negMean| > posMean (negative events have longer-lasting effects)
  const negativityBias = negAftermath.length > 10 && posAftermath.length > 10
    ? Math.abs(negMean) > Math.abs(posMean) * 1.1  // negative deviation 10% larger than positive
    : null;

  console.log(`  Global mean valence: ${globalMean.toFixed(4)}`);
  console.log(`  Global std valence: ${globalStd.toFixed(4)}`);
  console.log(`  Autocorrelation lag-1 (mean): ${meanAutocorr.toFixed(4)}`);
  console.log(`  Autocorrelation lag-24 (mean): ${meanAutocorrLag24.toFixed(4)}`);
  console.log(`  Negativity aftermath mean: ${negMean.toFixed(4)} (n=${negAftermath.length})`);
  console.log(`  Positivity aftermath mean: ${posMean.toFixed(4)} (n=${posAftermath.length})`);
  console.log(`  Negativity bias detected: ${negativityBias}`);

  // ─── Build Output Report ─────────────────────────────────────────────────────

  const report = {
    config: {
      agents: AGENT_DEFS.length,
      ticks: TOTAL_TICKS,
      sim_days: TOTAL_TICKS / TICKS_PER_DAY,
      tick_interval_minutes: 5,
      start_time: '2025-06-01T08:00:00',
    },
    relationship_emergence: {
      ...relSnapshots,
      top_pairs: topPairs,
    },
    emotion_contagion: {
      correlation: Math.round(contagionCorrelation * 10000) / 10000,
      method: 'pearson',
      high_interaction_valence_corr: Math.round(highIntMeanCorr * 10000) / 10000,
      low_interaction_valence_corr: Math.round(lowIntMeanCorr * 10000) / 10000,
      high_interaction_pairs: highInteractionPairs.length,
      low_interaction_pairs: lowInteractionPairs.length,
    },
    behavior_needs_consistency: {
      hunger_food_rate: Math.round(hungerFoodRate * 10000) / 10000,
      night_sleep_rate: Math.round(nightSleepRate * 10000) / 10000,
      hunger_observations: hungerObs.length,
      night_observations: nightObs.length,
      total_random_observations: behaviorObservations.length,
      systematic_hunger_follow_rate: Math.round(hungerFollowRate * 10000) / 10000,
      systematic_sleep_follow_rate: Math.round(sleepFollowRate * 10000) / 10000,
      systematic_hunger_observations: hungerTotal,
      systematic_sleep_observations: sleepTotal,
      total_systematic_observations: needsStateLog.length,
    },
    personality_differentiation: {
      extraverts_social_time: Math.round(meanExtSocialTime * 10000) / 10000,
      introverts_social_time: Math.round(meanIntSocialTime * 10000) / 10000,
      extraverts_interactions: Math.round(meanExtInteractions),
      introverts_interactions: Math.round(meanIntInteractions),
      extraverts_social_need: Math.round(meanExtSocialNeed * 10000) / 10000,
      introverts_social_need: Math.round(meanIntSocialNeed * 10000) / 10000,
      social_time_t: Math.round(socialTimeTTest.t * 1000) / 1000,
      social_time_significant: socialTimeTTest.significant,
      interactions_t: Math.round(interactionsTTest.t * 1000) / 1000,
      interactions_significant: interactionsTTest.significant,
      extravert_ids: extraverts.map(a => a.id),
      introvert_ids: introverts.map(a => a.id),
    },
    emotion_dynamics: {
      mean_valence: Math.round(globalMean * 10000) / 10000,
      std_valence: Math.round(globalStd * 10000) / 10000,
      autocorrelation_lag1: Math.round(meanAutocorr * 10000) / 10000,
      autocorrelation_lag24: Math.round(meanAutocorrLag24 * 10000) / 10000,
      negativity_bias: negativityBias,
      negative_aftermath_mean: Math.round(negMean * 10000) / 10000,
      positive_aftermath_mean: Math.round(posMean * 10000) / 10000,
      negative_event_samples: negAftermath.length,
      positive_event_samples: posAftermath.length,
    },
    meta: {
      elapsed_seconds: parseFloat(totalElapsed),
      ms_per_tick: Math.round(parseFloat(totalElapsed) * 1000 / TOTAL_TICKS * 100) / 100,
    },
  };

  // ─── Write Output ────────────────────────────────────────────────────────────

  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(report, null, 2), 'utf-8');
  console.log(`\nReport written to ${OUTPUT_FILE}`);

  // ─── Print Summary ───────────────────────────────────────────────────────────

  console.log('\n========================================');
  console.log('       EMERGENCE EXPERIMENT SUMMARY');
  console.log('========================================');
  console.log('');
  console.log(`Simulation: ${AGENT_DEFS.length} agents, ${TOTAL_TICKS} ticks (${TOTAL_TICKS / TICKS_PER_DAY} days), ${totalElapsed}s`);
  console.log('');
  console.log('RELATIONSHIP EMERGENCE:');
  const final = relSnapshots.tick_2880;
  console.log(`  Close friends: ${final.closeFriend} | Friends: ${final.friend} | Acquaintances: ${final.acquaintance} | Strangers: ${final.stranger}`);
  console.log(`  Top pair: ${topPairs[0] ? `${topPairs[0][0]} <-> ${topPairs[0][1]} (${topPairs[0][2]})` : 'none'}`);
  console.log('');
  console.log('EMOTION CONTAGION:');
  console.log(`  Interaction-frequency vs valence-similarity: r=${contagionCorrelation.toFixed(4)}`);
  console.log(`  High-interaction valence correlation: ${highIntMeanCorr.toFixed(4)}`);
  console.log('');
  console.log('BEHAVIOR-NEEDS CONSISTENCY:');
  console.log(`  [Random] Hunger -> food area: ${(hungerFoodRate * 100).toFixed(1)}%`);
  console.log(`  [Random] Night -> sleeping: ${(nightSleepRate * 100).toFixed(1)}%`);
  console.log(`  [Systematic] Low hunger -> food within 2h: ${(hungerFollowRate * 100).toFixed(1)}%`);
  console.log(`  [Systematic] Low energy night -> sleep within 2h: ${(sleepFollowRate * 100).toFixed(1)}%`);
  console.log('');
  console.log('PERSONALITY DIFFERENTIATION:');
  console.log(`  Extraverts social time: ${(meanExtSocialTime * 100).toFixed(1)}% vs Introverts: ${(meanIntSocialTime * 100).toFixed(1)}%`);
  console.log(`  Significant difference: ${socialTimeTTest.significant}`);
  console.log('');
  console.log('EMOTION DYNAMICS:');
  console.log(`  Mean valence: ${globalMean.toFixed(4)} | Std: ${globalStd.toFixed(4)}`);
  console.log(`  Autocorrelation lag-1: ${meanAutocorr.toFixed(4)} (emotions are ${meanAutocorr > 0.5 ? 'persistent' : 'transient'})`);
  console.log(`  Negativity bias: ${negativityBias === true ? 'DETECTED' : negativityBias === false ? 'not detected' : 'insufficient data'}`);
  console.log('');
  console.log('========================================');

  return report;
}

// ─── Run ───────────────────────────────────────────────────────────────────────

if (require.main === module) {
  run();
}

module.exports = { run };
