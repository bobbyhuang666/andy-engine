/**
 * 实验 17：关系生命周期深度追踪（R5）
 *
 * 30 天追踪 8 个多样 Agent 的每条关系：
 *   - 关系是否能长期停留在 friend 层（不只是跳板）
 *   - 冷却效应：低频交互是否导致关系衰减
 *   - 关系是否能从 closeFriend 回落到 friend
 *   - 交互频率与最终关系强度的相关性
 */

const path = require('path');
const AndyEngine = require(path.join(__dirname, '..', 'index'));
const Schedule = require(path.join(__dirname, '..', 'agent', 'Schedule'));

function run() {
  const TOTAL_TICKS = 8640; // 30 天
  const TICKS_PER_DAY = 288;

  const engine = new AndyEngine({
    startTime: new Date('2025-06-01T08:00:00'),
    weather: 'sunny',
  });

  // 8 个 Agent，日程高度分散以减少交互频率
  const agents = engine.addAgents([
    { id: 'morning_extrovert', name: '早起鸟(ESFJ)',
      personality: { mbti: 'ESFJ' },
      schedule: new Schedule({ entries: [
        { startHour: 6, endHour: 8, region: '操场', activity: '在晨跑', days: [0,1,2,3,4,5,6], probability: 0.8, noise: 15 },
        { startHour: 9, endHour: 12, region: '教室', activity: '在上课', days: [1,3,5], probability: 0.9, noise: 15 },
        { startHour: 13, endHour: 15, region: '食堂', activity: '在吃饭', days: [0,1,2,3,4,5,6], probability: 0.7, noise: 30 },
        { startHour: 16, endHour: 18, region: '校园广场', activity: '在社交', days: [0,2,4,6], probability: 0.5, noise: 60 },
      ]}).toJSON(),
      initialPosition: '宿舍' },

    { id: 'night_introvert', name: '夜猫子(INTP)',
      personality: { mbti: 'INTP' },
      schedule: new Schedule({ entries: [
        { startHour: 11, endHour: 12, region: '宿舍', activity: '在洗漱', days: [0,1,2,3,4,5,6], probability: 0.8, noise: 60 },
        { startHour: 14, endHour: 16, region: '图书馆', activity: '在看书', days: [1,3,5], probability: 0.6, noise: 30 },
        { startHour: 17, endHour: 20, region: '网吧', activity: '在打游戏', days: [0,2,4,6], probability: 0.7, noise: 60 },
        { startHour: 21, endHour: 23, region: '网吧', activity: '在打游戏', days: [5,6], probability: 0.5, noise: 30 },
      ]}).toJSON(),
      initialPosition: '宿舍' },

    { id: 'busy_worker', name: '加班狂(ISTJ)',
      personality: { mbti: 'ISTJ' },
      schedule: Schedule.createWorkerSchedule({ workStart: 8, workEnd: 20 }).toJSON(),
      initialPosition: '家' },

    { id: 'chill_worker', name: '佛系职员(ISFP)',
      personality: { mbti: 'ISFP' },
      schedule: Schedule.createWorkerSchedule({ workStart: 10, workEnd: 17 }).toJSON(),
      initialPosition: '家' },

    { id: 'social_butterfly', name: '社交达人(ENFP)',
      personality: { mbti: 'ENFP' },
      schedule: new Schedule({ entries: [
        { startHour: 10, endHour: 12, region: '咖啡店', activity: '在看书', days: [0,1,2,3,4,5,6], probability: 0.5, noise: 60 },
        { startHour: 13, endHour: 15, region: '食堂', activity: '在吃饭', days: [0,1,2,3,4,5,6], probability: 0.7, noise: 30 },
        { startHour: 16, endHour: 18, region: '公园', activity: '在散步', days: [0,2,4], probability: 0.4, noise: 60 },
        { startHour: 16, endHour: 18, region: '操场', activity: '在运动', days: [1,3,5], probability: 0.4, noise: 30 },
        { startHour: 19, endHour: 21, region: '校园广场', activity: '在社交', days: [0,1,2,3,4,5,6], probability: 0.6, noise: 60 },
      ]}).toJSON(),
      initialPosition: '宿舍' },

    { id: 'hermit', name: '隐居者(INTJ)',
      personality: { mbti: 'INTJ' },
      schedule: new Schedule({ entries: [
        { startHour: 9, endHour: 12, region: '图书馆', activity: '在研究', days: [0,1,2,3,4,5,6], probability: 0.7, noise: 60 },
        { startHour: 14, endHour: 16, region: '宿舍', activity: '在冥想', days: [0,2,4,6], probability: 0.5, noise: 60 },
      ]}).toJSON(),
      initialPosition: '图书馆' },

    { id: 'freelancer', name: '自由人(ENTP)',
      personality: { mbti: 'ENTP' },
      schedule: new Schedule({ entries: [
        { startHour: 11, endHour: 13, region: '咖啡店', activity: '在工作', days: [0,1,2,3,4,5,6], probability: 0.6, noise: 60 },
        { startHour: 15, endHour: 17, region: '商场', activity: '在逛街', days: [0,3,6], probability: 0.3, noise: 60 },
        { startHour: 18, endHour: 19, region: '食堂', activity: '在吃饭', days: [0,1,2,3,4,5,6], probability: 0.6, noise: 30 },
      ]}).toJSON(),
      initialPosition: '咖啡店' },

    { id: 'student_athlete', name: '运动健将(ESTP)',
      personality: { mbti: 'ESTP' },
      schedule: Schedule.createStudentSchedule({ workDays: [1,3,5] }).toJSON(),
      initialPosition: '操场' },
  ]);

  const agentIds = agents.map(a => a.id);

  // 每 36 ticks (3小时) 采样一次
  const SNAP_INT = 36;
  const relSnapshots = [];
  const t0 = Date.now();

  for (let i = 0; i < TOTAL_TICKS; i++) {
    engine.tick();
    const tickCount = i + 1;

    if (tickCount % SNAP_INT === 0) {
      const graph = engine.getSocialGraph();
      const rels = {};
      for (let a = 0; a < agentIds.length; a++) {
        for (let b = a + 1; b < agentIds.length; b++) {
          const rel = graph.getRelationship(agentIds[a], agentIds[b]);
          const key = `${agentIds[a]}-${agentIds[b]}`;
          if (rel) {
            rels[key] = {
              strength: Math.round(rel.strength * 10000) / 10000,
              type: rel.type,
              interactions: rel.interactionCount,
            };
          }
        }
      }

      const simTime = engine.world.time;
      relSnapshots.push({
        tick: tickCount,
        day: Math.floor(tickCount / TICKS_PER_DAY) + 1,
        hour: Math.round((simTime.getHours() + simTime.getMinutes() / 60) * 100) / 100,
        totalRels: Object.keys(rels).length,
        rels,
      });
    }

    if (tickCount % 2160 === 0) {
      console.log(`    tick ${tickCount}/${TOTAL_TICKS} - ${((Date.now()-t0)/1000).toFixed(0)}s`);
    }
  }

  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(`  完成: ${elapsed}s, ${relSnapshots.length} 快照`);

  // ─── 分析 ───
  const analysis = {};
  const allPairs = [];
  for (let a = 0; a < agentIds.length; a++) {
    for (let b = a + 1; b < agentIds.length; b++) {
      allPairs.push(`${agentIds[a]}-${agentIds[b]}`);
    }
  }

  // 1. 关系出现时间和最终状态
  analysis.timeline = {};
  for (const pair of allPairs) {
    const first = relSnapshots.find(s => s.rels[pair]);
    const last = relSnapshots.filter(s => s.rels[pair]).slice(-1)[0];
    if (first) {
      const final = last.rels[pair];
      analysis.timeline[pair] = {
        firstDay: first.day,
        finalStrength: final.strength,
        finalType: final.type,
        totalInteractions: final.interactions,
      };
    } else {
      analysis.timeline[pair] = { neverFormed: true };
    }
  }

  const formed = Object.entries(analysis.timeline).filter(([_, v]) => !v.neverFormed);
  const notFormed = Object.entries(analysis.timeline).filter(([_, v] ) => v.neverFormed);
  console.log(`\n  关系形成: ${formed.length}/${allPairs.length} (${notFormed.length} 未形成)`);

  // 2. 关系强度分布
  const typeDist = { acquaintance: 0, friend: 0, closeFriend: 0 };
  for (const [_, data] of formed) typeDist[data.finalType]++;

  console.log(`  最终分布: acqu=${typeDist.acquaintance}, fri=${typeDist.friend}, close=${typeDist.closeFriend}`);

  // 3. 每条关系的强度曲线（找冷却和降级事件）
  analysis.degradationEvents = [];
  for (const pair of allPairs) {
    const curve = relSnapshots.filter(s => s.rels[pair]).map(s => ({
      tick: s.tick, day: s.day, str: s.rels[pair].strength, type: s.rels[pair].type,
    }));

    // 找降级事件 (type 降低)
    for (let i = 1; i < curve.length; i++) {
      const typeOrder = { stranger: 0, acquaintance: 1, friend: 2, closeFriend: 3 };
      if (typeOrder[curve[i].type] < typeOrder[curve[i-1].type]) {
        analysis.degradationEvents.push({
          pair, from: curve[i-1].type, to: curve[i].type,
          day: curve[i].day, fromStr: curve[i-1].str, toStr: curve[i].str,
        });
      }
    }
  }

  console.log(`  关系降级事件: ${analysis.degradationEvents.length} 个`);
  for (const evt of analysis.degradationEvents.slice(0, 15)) {
    console.log(`    ${evt.pair}: ${evt.from}→${evt.to} @D${evt.day} (${evt.fromStr}→${evt.toStr})`);
  }

  // 4. 关系强度分层分析（最后一天）
  const lastSnap = relSnapshots[relSnapshots.length - 1];
  const strengthBuckets = { '0.0-0.15': 0, '0.15-0.30': 0, '0.30-0.50': 0, '0.50-0.70': 0, '0.70-0.85': 0, '0.85-1.00': 0 };
  for (const [_, rel] of Object.entries(lastSnap.rels)) {
    const s = rel.strength;
    if (s < 0.15) strengthBuckets['0.0-0.15']++;
    else if (s < 0.30) strengthBuckets['0.15-0.30']++;
    else if (s < 0.50) strengthBuckets['0.30-0.50']++;
    else if (s < 0.70) strengthBuckets['0.50-0.70']++;
    else if (s < 0.85) strengthBuckets['0.70-0.85']++;
    else strengthBuckets['0.85-1.00']++;
  }

  analysis.strengthDistribution = strengthBuckets;
  console.log(`\n  最终强度分布:`);
  for (const [bucket, count] of Object.entries(strengthBuckets)) {
    console.log(`    ${bucket}: ${count}`);
  }

  // 5. 交互频率 vs 最终强度
  analysis.interactionVsStrength = formed.map(([pair, data]) => ({
    pair, interactions: data.totalInteractions, finalStrength: data.finalStrength,
  })).sort((a, b) => b.interactions - a.interactions);

  console.log(`\n  交互频率 vs 最终强度 (前5):`);
  for (const item of analysis.interactionVsStrength.slice(0, 5)) {
    console.log(`    ${item.pair}: ${item.interactions}次 → str=${item.finalStrength}`);
  }

  return { experiment: 'rel_lifecycle_r5', config: { totalTicks: TOTAL_TICKS }, analysis };
}

module.exports = { run };
