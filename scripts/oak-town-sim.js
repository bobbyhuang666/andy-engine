#!/usr/bin/env node
/**
 * Society Engine — 橡木镇模拟脚本
 *
 * 15 个角色在虚构小镇中 2 天的社会动力学模拟。
 * Tick 10 执行混合注入（环境震荡 + 语义病毒双重点火）。
 * 事件驱动快照 + 显著性过滤，导出高密度剧情分镜 JSON。
 *
 * 纯本地运行，零网络依赖，零 LLM 调用。
 *
 * 用法: node scripts/oak-town-sim.js
 * 输出: scripts/output/oak-town-day1.json
 */

const path = require('path');
const fs = require('fs');
const AndyEngine = require('../index');
const Schedule = require('../agent/Schedule');

// ═══════════════════════════════════════════
// 一、橡木镇 15 角色定义
// ═══════════════════════════════════════════

const AGENTS = [
  { id: 'innkeeper_hua',  name: '花姐',     mbti: 'ESFJ', tag: '八卦老板娘',       schedule: 'freelancer', initialPosition: '咖啡店' },
  { id: 'blacksmith_liu', name: '刘铁匠',   mbti: 'ISTP', tag: '沉默铁匠',         schedule: 'worker',     initialPosition: '家' },
  { id: 'alchemist_sun',  name: '孙疯子',   mbti: 'ENTP', tag: '狂热炼金士',       schedule: 'freelancer', initialPosition: '家' },
  { id: 'mayor_zhou',     name: '周镇长',   mbti: 'ENTJ', tag: '铁腕镇长',         schedule: 'worker',     initialPosition: '家' },
  { id: 'healer_wu',      name: '吴药师',   mbti: 'INFJ', tag: '草药师',           schedule: 'home',       initialPosition: '家' },
  { id: 'hunter_zhao',    name: '赵猎户',   mbti: 'ESTP', tag: '胆大猎手',         schedule: 'freelancer', initialPosition: '家' },
  { id: 'herbalist_mei',  name: '梅姨',     mbti: 'ISFJ', tag: '花圃主人',         schedule: 'home',       initialPosition: '家' },
  { id: 'bard_lin',       name: '林书生',   mbti: 'INFP', tag: '流浪诗人',         schedule: 'freelancer', initialPosition: '公园' },
  { id: 'merchant_feng',  name: '冯掌柜',   mbti: 'ESTJ', tag: '杂货铺老板',       schedule: 'worker',     initialPosition: '家' },
  { id: 'priest_chen',    name: '陈道长',   mbti: 'INTJ', tag: '隐居道士',         schedule: 'home',       initialPosition: '家' },
  { id: 'kid_hao',        name: '小浩',     mbti: 'ESFP', tag: '顽皮少年',         schedule: 'student',    initialPosition: '宿舍' },
  { id: 'widow_li',       name: '李寡妇',   mbti: 'ISFP', tag: '安静花店主人',     schedule: 'home',       initialPosition: '家' },
  { id: 'drifter_ma',     name: '马流浪',   mbti: 'ENFP', tag: '流浪歌手',         schedule: 'freelancer', initialPosition: '公园' },
  { id: 'guard_han',      name: '韩守卫',   mbti: 'ISTJ', tag: '一丝不苟的守卫',   schedule: 'worker',     initialPosition: '家' },
  { id: 'witch_ye',       name: '叶巫婆',   mbti: 'INFJ', tag: '森林边缘的神秘老妇', schedule: 'home',     initialPosition: '家' },
];

// 种子背景（每个角色 2-3 条）
const BACKSTORIES = {
  innkeeper_hua:  ['火角酒馆的老板娘，认识镇上所有人', '最爱听八卦，也最爱传八卦', '酿的麦酒全镇第一'],
  blacksmith_liu: ['沉默寡言的铁匠，手艺精湛', '曾是军人，退役后定居橡木镇', '和韩守卫是老战友'],
  alchemist_sun:  ['疯狂的炼金术士，总在做实验', '梦想炼出贤者之石', '实验室爆炸过三次'],
  mayor_zhou:     ['橡木镇的铁腕镇长', '推动矿石开发项目', '和花姐是老朋友'],
  healer_wu:      ['精通草药学的药师', '能从植物的气味判断病症', '和陈道长是知己'],
  hunter_zhao:    ['胆大心细的猎手', '森林里唯一敢走夜路的人', '梅姨的独子'],
  herbalist_mei:  ['花圃的温柔主人', '赵猎户的母亲', '丈夫早年去世，独自抚养儿子'],
  bard_lin:       ['流浪到橡木镇的诗人', '背一把破旧的鲁特琴', '正在收集镇上的传说写成诗歌'],
  merchant_feng:  ['杂货铺精明的老板', '锱铢必较但从不卖假货', '和花姐是邻居，经常吵架'],
  priest_chen:    ['隐居在老教堂的道士', '镇上唯一的理性声音', '不信鬼神，只信逻辑'],
  kid_hao:        ['到处乱跑的顽皮少年', '最崇拜马流浪', '梦想成为冒险者'],
  widow_li:       ['安静的花店主人', '丈夫去年在矿难中去世', '每天去墓地送花'],
  drifter_ma:     ['流浪到橡木镇的歌手', '吉他弹得很好', '小浩的偶像'],
  guard_han:      ['一丝不苟的镇门守卫', '记录每一个进出的人', '和刘铁匠是老战友'],
  witch_ye:       ['住在森林边缘的神秘老妇', '据说能预言未来', '镇上的人既怕她又尊敬她'],
};

// ═══════════════════════════════════════════
// 二、自定义日程（风险 2：空间流量强制导流）
// ═══════════════════════════════════════════

// 傍晚去酒馆的通用条目
const EVENING_TAVERN_ENTRY = {
  startHour: 18, endHour: 20,
  region: '咖啡店',       // 引擎原生区域名
  activity: '在食堂',      // 引擎已有状态
  days: [0, 1, 2, 3, 4, 5, 6],
  probability: 0.6,
  noise: 30,
};

// 需要追加晚间酒馆条目的角色
const TAVERN_PATRONS = ['blacksmith_liu', 'mayor_zhou', 'hunter_zhao', 'merchant_feng', 'kid_hao', 'drifter_ma'];

/**
 * 获取角色的日程配置（含自定义追加条目）
 */
function getScheduleForAgent(agentId) {
  const agentDef = AGENTS.find(a => a.id === agentId);
  const preset = agentDef.schedule;
  const schedule = Schedule.resolvePreset(preset);

  // 风险 2：为酒馆常客追加晚间条目
  if (TAVERN_PATRONS.includes(agentId)) {
    schedule.entries.push({ ...EVENING_TAVERN_ENTRY });
  }

  // 返回可序列化的日程配置
  return schedule.toJSON();
}

// ═══════════════════════════════════════════
// 三、种子关系（6 条）
// ═══════════════════════════════════════════

const SEED_RELATIONSHIPS = [
  // 花姐是全镇信息枢纽，需要最多连接
  ['innkeeper_hua',  'mayor_zhou',     0.50, 'friend'],       // 老朋友
  ['innkeeper_hua',  'merchant_feng',  0.25, 'acquaintance'], // 邻居冤家
  ['innkeeper_hua',  'blacksmith_liu', 0.30, 'acquaintance'], // 常客
  ['innkeeper_hua',  'healer_wu',      0.20, 'acquaintance'], // 偶尔来买草药茶
  ['innkeeper_hua',  'bard_lin',       0.15, 'acquaintance'], // 驻唱诗人
  ['innkeeper_hua',  'drifter_ma',     0.15, 'acquaintance'], // 新来的歌手
  // 其他关系
  ['hunter_zhao',    'herbalist_mei',  0.85, 'closeFriend'],  // 母子
  ['healer_wu',      'priest_chen',    0.55, 'friend'],       // 知己
  ['kid_hao',        'drifter_ma',     0.20, 'acquaintance'], // 崇拜对象
  ['blacksmith_liu', 'guard_han',      0.45, 'friend'],       // 战友
];

function injectSeedRelationships(engine) {
  for (const [idA, idB, strength, type] of SEED_RELATIONSHIPS) {
    const rel = engine.world.socialGraph.getOrCreateRelationship(idA, idB);
    rel.strength = strength;
    rel.type = type;
    rel.interactionCount = Math.floor(strength * 20);
    rel.impression.positive = strength * 10;
  }
}

// ═══════════════════════════════════════════
// 四、混合注入系统（Tick 10）
// ═══════════════════════════════════════════

function injectEnvironmentShock(engine) {
  let count = 0;
  for (const [id, agent] of engine.world.agents) {
    // 全镇安全需求下降
    agent.needs.needs.comfort *= 0.4;
    // 全镇恐惧上升
    agent.emotion.applyEffect({ fear: 0.3, nervousness: 0.2, calm: -0.2 });
    // 森林方向区域情绪降为负
    agent.emotion.applyEffect({ sadness: 0.15 });
    // 压力飙升
    agent.emotion.stress += 3;
    count++;
  }
  return count;
}

function injectSemanticVirus(engine) {
  // ─── Step 1: 信息枢纽 = 花姐（酒馆老板娘，全镇信息中心）───
  let hubId = 'innkeeper_hua';
  let maxDegree = engine.world.socialGraph.getRelationships(hubId).length;
  // 备选：如果花姐没有连接，找度最高的
  if (maxDegree === 0) {
    for (const [id] of engine.world.agents) {
      const degree = engine.world.socialGraph.getRelationships(id).length;
      if (degree > maxDegree) { maxDegree = degree; hubId = id; }
    }
  }
  const hub = engine.world.agents.get(hubId);

  // ─── Step 2: 注入病毒记忆 ───
  hub.memory.addExperience({
    content: '镇长从外面带回了一块散发绿光的矿石，据说有辐射',
    type: 'gossip',
    participants: ['mayor_zhou'],
    effects: [],
  }, hub.emotion, 0.95);

  // ─── Step 3: 双重点火 — 强制触发第一次物理交互 ───
  const neighbors = engine.world.regions.getNeighbors(hubId, 0);
  let targetId = null;
  for (const nid of neighbors) {
    if (nid !== hubId) { targetId = nid; break; }
  }

  // 如果附近没人，找关系最强的 Agent
  if (!targetId) {
    const rels = engine.world.socialGraph.getRelationships(hubId);
    if (rels.length > 0) {
      rels.sort((a, b) => b.strength - a.strength);
      targetId = rels[0].getOther(hubId);
    }
  }

  if (targetId) {
    const target = engine.world.agents.get(targetId);

    // 派发第一个社交事件
    engine.world.eventDispatcher.createEvent({
      type: 'social',
      scope: 'local',
      participants: [hubId, targetId],
      content: `${hub.name}压低声音对${target.name}说："你听说了吗？镇长带回来一块发绿光的石头，有人说那东西有辐射..."`,
      effects: [
        { target: targetId, type: 'emotion', delta: { fear: 0.15, nervousness: 0.1 } },
        { target: hubId, type: 'emotion', delta: { nervousness: 0.05 } },
      ],
      cause: null,
    });

    // 给目标注入二手记忆
    target.memory.addExperience({
      content: `${hub.name}说：镇长从外面带回了一块散发绿光的矿石，据说有辐射`,
      type: 'gossip',
      participants: [hubId, 'mayor_zhou'],
      effects: [],
    }, target.emotion, 0.95 * 0.7);

    return { hubId, hubDegree: maxDegree, targetId };
  }

  return { hubId, hubDegree: maxDegree, targetId: null };
}

// ═══════════════════════════════════════════
// 五、显著性过滤（风险 5）
// ═══════════════════════════════════════════

function isSignificant(event) {
  // 1. 社交事件 → 过滤掉无意义擦肩而过
  if (event.type === 'social') {
    const content = event.content || '';
    // 保留八卦传播、病毒内容
    if (content.includes('绿光') || content.includes('辐射')) return true;
    // 保留有意义的互动（排除纯路过）
    const trivial = ['在附近注意到有人', '擦肩而过', '没什么特别的'];
    if (trivial.some(t => content.includes(t))) return false;
    // 其余社交事件保留
    return true;
  }

  // 2. 情绪效价阈值 |Δ| > 0.3
  if (event.effects) {
    for (const eff of event.effects) {
      if (eff.type === 'emotion' && eff.delta) {
        const totalAbsDelta = Object.values(eff.delta)
          .reduce((sum, v) => sum + Math.abs(v), 0);
        if (totalAbsDelta > 0.3) return true;
      }
    }
  }

  // 3. 偏离常规的状态变化
  if (event.type === 'state_change') {
    const deviant = ['翘课了', '生病了', '熬夜了', '请假了', '在拖延', '困了但睡不着'];
    if (deviant.some(d => (event.content || '').includes(d))) return true;
  }

  // 4. 八卦传播链
  if ((event.content || '').includes('提到了')) return true;

  // 5. 其余丢弃
  return false;
}

function estimateValence(event) {
  if (!event.effects) return 0;
  let sum = 0;
  for (const eff of event.effects) {
    if (eff.type === 'emotion' && eff.delta) {
      for (const [dim, val] of Object.entries(eff.delta)) {
        const positive = ['joy', 'contentment', 'satisfaction', 'excitement', 'calm',
                          'hope', 'love', 'pride', 'gratitude', 'relief', 'triumph', 'amusement'];
        const negative = ['sadness', 'anger', 'fear', 'disgust', 'loneliness',
                          'nervousness', 'frustration', 'guilt', 'shame', 'horror'];
        if (positive.includes(dim)) sum += val;
        else if (negative.includes(dim)) sum -= Math.abs(val);
      }
    }
  }
  return sum;
}

// ═══════════════════════════════════════════
// 六、社交图谱快照
// ═══════════════════════════════════════════

function captureSocialGraphSnapshot(engine) {
  const snapshot = {};
  for (const [id] of engine.world.agents) {
    const rels = engine.world.socialGraph.getRelationships(id);
    snapshot[id] = rels.map(r => ({
      other: r.getOther(id),
      strength: +r.strength.toFixed(4),
      type: r.type,
    }));
  }
  return snapshot;
}

// ═══════════════════════════════════════════
// 七、关系变动追踪
// ═══════════════════════════════════════════

function detectRelationshipChanges(prevSnapshot, currSnapshot, tick, agentMap) {
  const changes = [];
  for (const [id, currRels] of Object.entries(currSnapshot)) {
    const prevRels = prevSnapshot[id] || [];
    const prevMap = {};
    for (const r of prevRels) prevMap[r.other] = r;

    for (const curr of currRels) {
      const prev = prevMap[curr.other];
      if (!prev) continue;
      if (prev.type !== curr.type || Math.abs(curr.strength - prev.strength) > 0.05) {
        changes.push({
          tick,
          a: agentMap[id] || id,
          b: agentMap[curr.other] || curr.other,
          typeChange: prev.type !== curr.type ? `${prev.type}→${curr.type}` : null,
          strengthDelta: +(curr.strength - prev.strength).toFixed(4),
          newStrength: curr.strength,
        });
      }
    }
  }
  return changes;
}

// ═══════════════════════════════════════════
// 八、主模拟
// ═══════════════════════════════════════════

function runSimulation() {
  const TOTAL_TICKS = 576; // 2 天
  const INJECTION_TICK = 10;
  const GRAPH_SNAPSHOT_INTERVAL = 288; // 每天快照一次

  console.log('╔══════════════════════════════════════════╗');
  console.log('║  Society Engine — 橡木镇 2 天模拟        ║');
  console.log('╚══════════════════════════════════════════╝\n');

  // ─── 初始化引擎 ───
  const engine = new AndyEngine({ startTime: new Date('2026-01-01T06:00:00') });

  // ─── 创建 15 个角色 ───
  console.log('🏘️  创建橡木镇居民...');
  for (const agentDef of AGENTS) {
    const backstories = BACKSTORIES[agentDef.id] || [];
    const schedule = getScheduleForAgent(agentDef.id);

    engine.createCharacter({
      id: agentDef.id,
      name: agentDef.name,
      mbti: agentDef.mbti,
      background: backstories,
      schedule,
      initialPosition: agentDef.initialPosition,
    });
  }
  console.log(`   ✅ ${AGENTS.length} 个角色已创建\n`);

  // ─── 注入种子关系 ───
  console.log('🤝 注入种子关系...');
  injectSeedRelationships(engine);
  console.log(`   ✅ ${SEED_RELATIONSHIPS.length} 条种子关系已注入\n`);

  // ─── 角色名字映射 ───
  const agentMap = {};
  for (const a of AGENTS) agentMap[a.id] = a.name;

  // ─── 数据收集器 ───
  const significantEvents = [];
  const gossipChains = [];
  const relationshipChanges = [];
  const agentTrajectories = {};
  const socialGraphSnapshots = {};
  let totalRawEvents = 0;
  let lastEventCount = 0;
  let lastGraphSnapshot = null;
  let injectionResult = null;

  // 初始化轨迹
  for (const a of AGENTS) {
    agentTrajectories[a.id] = {
      valence_series: [],
      position_series: [],
      top_emotion_series: [],
    };
  }

  // ─── 初始图谱快照 ───
  socialGraphSnapshots['tick_0'] = captureSocialGraphSnapshot(engine);
  lastGraphSnapshot = captureSocialGraphSnapshot(engine);

  // ─── 模拟主循环 ───
  console.log(`⏰ 开始模拟 ${TOTAL_TICKS} ticks（2 天）...`);
  const startTime = Date.now();

  for (let tick = 0; tick < TOTAL_TICKS; tick++) {
    engine.tick();

    // Tick 10: 混合注入（顺序关键：先震荡使 valence 变负，再注入病毒记忆）
    if (tick === INJECTION_TICK) {
      console.log('\n💉 Tick 10: 执行混合注入...');
      const shockedCount = injectEnvironmentShock(engine);
      console.log(`   环境震荡: ${shockedCount} 个 Agent 受影响`);
      console.log('   ⏳ 等待 1 tick 让情绪生效...');
    }
    if (tick === INJECTION_TICK + 1) {
      injectionResult = injectSemanticVirus(engine);
      console.log(`   语义病毒: 注入 ${agentMap[injectionResult.hubId]}（度=${injectionResult.hubDegree}）`);
      if (injectionResult.targetId) {
        console.log(`   双重点火: 首次传播目标 → ${agentMap[injectionResult.targetId]}`);
      }
      console.log('');
    }

    // 事件驱动抓取
    const allEvents = engine.world.eventDispatcher.eventLog;
    while (lastEventCount < allEvents.length) {
      const event = allEvents[lastEventCount];
      totalRawEvents++;

      if (isSignificant(event)) {
        significantEvents.push({
          tick: engine.world.tickCount,
          time: engine.world.time.toISOString(),
          type: event.type,
          participants: event.participants.map(id => agentMap[id] || id),
          participantIds: event.participants,
          content: event.content,
          valence: +estimateValence(event).toFixed(4),
        });

        // 追踪病毒八卦传播链（只追踪含绿光/辐射关键词的事件）
        const evtContent = event.content || '';
        if (evtContent.includes('绿光') || evtContent.includes('辐射')) {
          const gossipPart = evtContent;          gossipChains.push({
            tick: engine.world.tickCount,
            from: agentMap[event.participants[0]] || event.participants[0],
            to: agentMap[event.participants[1]] || event.participants[1],
            fromId: event.participants[0],
            toId: event.participants[1],
            content: gossipPart.trim().substring(0, 100),
          });
        }
      }
      lastEventCount++;
    }

    // 关系变动检测（每 24 ticks = 2 小时）
    if (tick > 0 && tick % 24 === 0) {
      const currSnapshot = captureSocialGraphSnapshot(engine);
      const changes = detectRelationshipChanges(lastGraphSnapshot, currSnapshot, tick, agentMap);
      relationshipChanges.push(...changes);
      lastGraphSnapshot = currSnapshot;
    }

    // 图谱快照
    if (tick === GRAPH_SNAPSHOT_INTERVAL - 1) {
      socialGraphSnapshots['tick_288'] = captureSocialGraphSnapshot(engine);
    }
    if (tick === TOTAL_TICKS - 1) {
      socialGraphSnapshots['tick_576'] = captureSocialGraphSnapshot(engine);
    }

    // Agent 轨迹采样（每 12 ticks = 1 小时）
    if (tick % 12 === 0) {
      for (const [id, agent] of engine.world.agents) {
        const valence = agent.emotion.getValence();
        const dominant = agent.emotion.getDominant(1);
        agentTrajectories[id].valence_series.push(+valence.toFixed(4));
        agentTrajectories[id].position_series.push(agent.position);
        agentTrajectories[id].top_emotion_series.push(
          dominant.length > 0 ? dominant[0].dimension : 'neutral'
        );
      }
    }
  }

  // ─── 去重显著事件（同 tick + 同内容 = 1 条）───
  const seenEvents = new Set();
  const uniqueEvents = [];
  for (const e of significantEvents) {
    const key = `${e.tick}_${e.content?.substring(0, 30)}`;
    if (!seenEvents.has(key)) {
      seenEvents.add(key);
      uniqueEvents.push(e);
    }
  }
  significantEvents.length = 0;
  significantEvents.push(...uniqueEvents);

  // ─── 去重八卦链 ───
  const uniqueGossip = [];
  const gossipSeen = new Set();
  for (const g of gossipChains) {
    const key = `${g.tick}_${g.fromId}_${g.toId}`;
    if (!gossipSeen.has(key)) {
      gossipSeen.add(key);
      uniqueGossip.push(g);
    }
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
  console.log(`\n✅ 模拟完成: ${TOTAL_TICKS} ticks, ${elapsed}s`);
  console.log(`   原始事件: ${totalRawEvents}`);
  console.log(`   显著事件: ${significantEvents.length}`);
  console.log(`   过滤率: ${((1 - significantEvents.length / Math.max(1, totalRawEvents)) * 100).toFixed(1)}%`);
  console.log(`   八卦传播链: ${uniqueGossip.length} 次`);
  console.log(`   关系变动: ${relationshipChanges.length} 次\n`);

  // ─── 构建导出数据 ───
  const agentDefs = AGENTS.map(a => ({
    id: a.id,
    name: a.name,
    mbti: a.mbti,
    tag: a.tag,
  }));

  // 计算最大关系增长
  let maxRelGrowth = 0;
  for (const change of relationshipChanges) {
    if (change.strengthDelta > maxRelGrowth) maxRelGrowth = change.strengthDelta;
  }

  const output = {
    meta: {
      scenario: 'oak-town',
      days: 2,
      ticks: TOTAL_TICKS,
      agents: AGENTS.length,
      injection_tick: INJECTION_TICK,
      significance_threshold: 0.3,
      elapsed_seconds: +elapsed,
      generated_at: new Date().toISOString(),
    },
    agents: agentDefs,
    injection: {
      tick: INJECTION_TICK,
      environment_shock: { comfort: '-60%', fear: '+0.3', nervousness: '+0.2', calm: '-0.2', sadness: '+0.15', stress: '+3' },
      semantic_virus: {
        hub_agent: agentMap[injectionResult.hubId],
        hub_agent_id: injectionResult.hubId,
        hub_degree: injectionResult.hubDegree,
        content: '镇长从外面带回了一块散发绿光的矿石，据说有辐射',
        first_target: injectionResult.targetId ? agentMap[injectionResult.targetId] : null,
        first_target_id: injectionResult.targetId,
      },
    },
    significant_events: significantEvents,
    gossip_spread: uniqueGossip,
    relationship_changes: relationshipChanges,
    social_graph_snapshots: socialGraphSnapshots,
    agent_trajectories: agentTrajectories,
    stats: {
      total_ticks: TOTAL_TICKS,
      total_raw_events: totalRawEvents,
      significant_events: significantEvents.length,
      filter_ratio: ((1 - significantEvents.length / Math.max(1, totalRawEvents)) * 100).toFixed(1) + '%',
      gossip_hops: uniqueGossip.length,
      max_relationship_growth: +maxRelGrowth.toFixed(4),
    },
  };

  return output;
}

// ═══════════════════════════════════════════
// 九、执行 + 导出
// ═══════════════════════════════════════════

const result = runSimulation();

// 写入 JSON
const outPath = path.join(__dirname, 'output', 'oak-town-day1.json');
fs.mkdirSync(path.join(__dirname, 'output'), { recursive: true });
fs.writeFileSync(outPath, JSON.stringify(result, null, 2));
console.log(`📄 数据已导出: ${outPath}`);

// 终端摘要
console.log('\n' + '═'.repeat(60));
console.log('  📰 橡木镇 Day 1-2 数据摘要');
console.log('═'.repeat(60));

console.log(`\n👥 角色 (${result.agents.length}):`);
for (const a of result.agents) {
  console.log(`   ${a.name} [${a.mbti}] — ${a.tag}`);
}

console.log(`\n💉 注入事件 (Tick ${result.injection.tick}):`);
console.log(`   信息枢纽: ${result.injection.semantic_virus.hub_agent}（度=${result.injection.semantic_virus.hub_degree}）`);
console.log(`   首次传播: → ${result.injection.semantic_virus.first_target || '(无邻居)'}`);
console.log(`   病毒内容: "${result.injection.semantic_virus.content}"`);

console.log(`\n🔥 显著事件 Top 10:`);
const topEvents = result.significant_events
  .filter(e => Math.abs(e.valence) > 0.1)
  .sort((a, b) => Math.abs(b.valence) - Math.abs(a.valence))
  .slice(0, 10);
for (const e of topEvents) {
  const sign = e.valence > 0 ? '+' : '';
  console.log(`   [Tick ${e.tick}] ${e.participants.join(' ↔ ')}: ${e.content?.substring(0, 50)}... (val=${sign}${e.valence})`);
}

console.log(`\n🗣️ 八卦传播链 (${result.gossip_spread.length} 次):`);
for (const g of result.gossip_spread.slice(0, 5)) {
  console.log(`   [Tick ${g.tick}] ${g.from} → ${g.to}: "${g.content?.substring(0, 60)}..."`);
}

console.log(`\n🤝 关系变动 (${result.relationship_changes.length} 次):`);
for (const r of result.relationship_changes.slice(0, 10)) {
  const typeStr = r.typeChange ? ` [${r.typeChange}]` : '';
  console.log(`   [Tick ${r.tick}] ${r.a} ↔ ${r.b}: Δ=${r.strengthDelta > 0 ? '+' : ''}${r.strengthDelta}${typeStr}`);
}

console.log(`\n📊 统计:`);
console.log(`   总事件: ${result.stats.total_raw_events}`);
console.log(`   显著事件: ${result.stats.significant_events} (${result.stats.filter_ratio})`);
console.log(`   八卦传播: ${result.stats.gossip_hops} 次`);
console.log(`   最大关系增长: +${result.stats.max_relationship_growth}`);
console.log('');
