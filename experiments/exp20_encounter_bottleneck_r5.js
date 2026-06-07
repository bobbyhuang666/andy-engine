/**
 * 实验 20：交互瓶颈分析（R5）
 *
 * 深入理解 encounter 机制：
 *   - 每天每对 agent 平均产生多少次交互？
 *   - 日程重叠如何导致交互频率差异？
 *   - interactionProb=0.3+strength*0.5 在不同关系强度下的实际通过率
 *   - 是否存在"过度社交"（某些对交互过于频繁）
 *
 * 这个实验帮助确定：是否需要降低 encounter 频率来减缓关系增长
 */

const path = require('path');
const AndyEngine = require(path.join(__dirname, '..', 'index'));
const Schedule = require(path.join(__dirname, '..', 'agent', 'Schedule'));

function run() {
  const TOTAL_TICKS = 2880; // 10 天
  const TICKS_PER_DAY = 288;

  const engine = new AndyEngine({
    startTime: new Date('2025-06-01T08:00:00'),
    weather: 'sunny',
  });

  // 10 个 Agent，多样日程
  const agents = engine.addAgents([
    { id: 's1', name: '学生A(ESFJ)', personality: { mbti: 'ESFJ' },
      schedule: Schedule.createStudentSchedule({ workDays: [1,3,5] }).toJSON(), initialPosition: '宿舍' },
    { id: 's2', name: '学生B(INTP)', personality: { mbti: 'INTP' },
      schedule: Schedule.createStudentSchedule({ workDays: [2,4] }).toJSON(), initialPosition: '图书馆' },
    { id: 's3', name: '学生C(ENFP)', personality: { mbti: 'ENFP' },
      schedule: Schedule.createStudentSchedule({ workDays: [1,3,5] }).toJSON(), initialPosition: '食堂' },
    { id: 's4', name: '学生D(ISFP)', personality: { mbti: 'ISFP' },
      schedule: new Schedule({ entries: [
        { startHour: 10, endHour: 12, region: '图书馆', activity: '在看书', days: [0,1,2,3,4,5,6], probability: 0.6, noise: 60 },
        { startHour: 14, endHour: 16, region: '操场', activity: '在运动', days: [0,2,4,6], probability: 0.4, noise: 30 },
      ]}).toJSON(), initialPosition: '宿舍' },
    { id: 's5', name: '学生E(ISTJ)', personality: { mbti: 'ISTJ' },
      schedule: Schedule.createStudentSchedule({ workDays: [1,2,3,4,5] }).toJSON(), initialPosition: '宿舍' },
    { id: 'w1', name: '上班族A(ESTJ)', personality: { mbti: 'ESTJ' },
      schedule: Schedule.createWorkerSchedule({ workStart: 8, workEnd: 18 }).toJSON(), initialPosition: '家' },
    { id: 'w2', name: '上班族B(INFJ)', personality: { mbti: 'INFJ' },
      schedule: Schedule.createWorkerSchedule({ workStart: 10, workEnd: 17 }).toJSON(), initialPosition: '家' },
    { id: 'w3', name: '上班族C(ENTP)', personality: { mbti: 'ENTP' },
      schedule: Schedule.createWorkerSchedule({ workStart: 9, workEnd: 19 }).toJSON(), initialPosition: '家' },
    { id: 'f1', name: '自由人A(ENFP)', personality: { mbti: 'ENFP' },
      schedule: new Schedule({ entries: [
        { startHour: 11, endHour: 13, region: '咖啡店', activity: '在看书', days: [0,1,2,3,4,5,6], probability: 0.6, noise: 60 },
        { startHour: 15, endHour: 17, region: '公园', activity: '在散步', days: [0,2,4,6], probability: 0.4, noise: 60 },
        { startHour: 18, endHour: 19, region: '食堂', activity: '在吃饭', days: [0,1,2,3,4,5,6], probability: 0.7, noise: 30 },
      ]}).toJSON(), initialPosition: '咖啡店' },
    { id: 'f2', name: '自由人B(INTJ)', personality: { mbti: 'INTJ' },
      schedule: new Schedule({ entries: [
        { startHour: 9, endHour: 11, region: '图书馆', activity: '在研究', days: [0,1,2,3,4,5,6], probability: 0.5, noise: 60 },
        { startHour: 14, endHour: 16, region: '咖啡店', activity: '在工作', days: [1,3,5], probability: 0.4, noise: 30 },
      ]}).toJSON(), initialPosition: '图书馆' },
  ]);

  const agentIds = agents.map(a => a.id);

  // Hook into EventDispatcher to count encounters
  const encounterCounts = {};
  const interactionCounts = {};
  const regionHistory = {};

  // Track co-location
  for (let i = 0; i < TOTAL_TICKS; i++) {
    engine.tick();
    const tickCount = i + 1;

    // Sample location every 12 ticks
    if (tickCount % 12 === 0) {
      const day = Math.floor(tickCount / TICKS_PER_DAY) + 1;
      const hour = engine.world.time.getHours();
      const regionMap = {};

      for (const agent of agents) {
        const pos = agent.position || 'unknown';
        if (!regionMap[pos]) regionMap[pos] = [];
        regionMap[pos].push(agent.id);
      }

      // Count co-located pairs
      for (const [region, occupants] of Object.entries(regionMap)) {
        if (occupants.length >= 2) {
          for (let a = 0; a < occupants.length; a++) {
            for (let b = a + 1; b < occupants.length; b++) {
              const key = [occupants[a], occupants[b]].sort().join('-');
              if (!encounterCounts[key]) encounterCounts[key] = { total: 0, byDay: {} };
              encounterCounts[key].total++;
              encounterCounts[key].byDay[day] = (encounterCounts[key].byDay[day] || 0) + 1;
            }
          }
        }
      }
    }

    // Record relationship snapshots every 144 ticks (12h)
    if (tickCount % 144 === 0) {
      const graph = engine.getSocialGraph();
      for (let a = 0; a < agentIds.length; a++) {
        for (let b = a + 1; b < agentIds.length; b++) {
          const rel = graph.getRelationship(agentIds[a], agentIds[b]);
          const key = `${agentIds[a]}-${agentIds[b]}`;
          if (rel) {
            if (!interactionCounts[key]) interactionCounts[key] = [];
            interactionCounts[key].push({
              tick: tickCount,
              day: Math.floor(tickCount / TICKS_PER_DAY) + 1,
              strength: Math.round(rel.strength * 10000) / 10000,
              interactions: rel.interactionCount,
              type: rel.type,
            });
          }
        }
      }
    }
  }

  console.log(`\n  ─── 分析结果 ───\n`);

  // 1. 共处频率排名
  const sortedPairs = Object.entries(encounterCounts)
    .sort((a, b) => b[1].total - a[1].total);

  console.log('  共处频率 (每12tick采样, 10天):');
  for (const [pair, data] of sortedPairs.slice(0, 15)) {
    const avgPerDay = (data.total / 10).toFixed(1);
    console.log(`    ${pair}: ${data.total}次 (${avgPerDay}/天)`);
  }

  const neverMet = sortedPairs.filter(([_, d]) => d.total === 0);
  console.log(`\n  从未共处的对: ${neverMet.length}`);

  // 2. 关系最终状态 vs 共处频率
  console.log('\n  共处频率 vs 关系状态:');
  for (const [pair, coData] of sortedPairs.slice(0, 10)) {
    const relData = interactionCounts[pair];
    if (relData && relData.length > 0) {
      const last = relData[relData.length - 1];
      console.log(`    ${pair}: 共处${coData.total}次 → str=${last.strength}(${last.type}), 交互${last.interactions}次`);
    }
  }

  // 3. 每 Agent 的社交频率
  const agentEncounterCount = {};
  for (const [pair, data] of Object.entries(encounterCounts)) {
    const [a, b] = pair.split('-');
    agentEncounterCount[a] = (agentEncounterCount[a] || 0) + data.total;
    agentEncounterCount[b] = (agentEncounterCount[b] || 0) + data.total;
  }

  console.log('\n  每 Agent 社交频率:');
  for (const agent of agents) {
    const count = agentEncounterCount[agent.id] || 0;
    console.log(`    ${agent.name}: ${count}次共处`);
  }

  // 4. 区域重叠分析
  console.log('\n  区域分布热点:');
  const regionFreq = {};
  for (const agent of agents) {
    // Sample position at key hours
    const sched = agent.schedule;
    if (sched && sched.entries) {
      for (const entry of sched.entries) {
        const key = `${entry.region}(${entry.startHour}-${entry.endHour}h)`;
        regionFreq[key] = (regionFreq[key] || 0) + 1;
      }
    }
  }

  const analysis = {
    encounterCounts: Object.fromEntries(sortedPairs.slice(0, 20)),
    neverMetCount: neverMet.length,
    agentEncounterCount,
    totalPairs: agentIds.length * (agentIds.length - 1) / 2,
    formedPairs: Object.keys(interactionCounts).length,
  };

  return { experiment: 'encounter_bottleneck_r5', config: { totalTicks: TOTAL_TICKS, numAgents: agentIds.length }, analysis };
}

module.exports = { run };
