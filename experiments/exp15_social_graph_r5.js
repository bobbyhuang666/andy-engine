/**
 * 实验 15：社交图谱自然涌现（R5 验证）
 *
 * 验证三元闭合修复后：
 *   - 网络是否保持稀疏（不再 D2 全连接）
 *   - friend 层级是否持续存在
 *   - 社会结构是否涌现（学生/上班族社群）
 *   - Dunbar 层级分布是否合理
 */

const path = require('path');
const AndyEngine = require(path.join(__dirname, '..', 'index'));
const Schedule = require(path.join(__dirname, '..', 'agent', 'Schedule'));

function run() {
  const TOTAL_TICKS = 8640; // 30 天
  const TICKS_PER_DAY = 288;
  const SNAPSHOT_INTERVAL = 288; // 每天一次

  const MBTI = ['INFP','INFJ','INTJ','INTP','ISFP','ISFJ','ISTJ','ISTP',
                'ENFP','ENFJ','ENTJ','ENTP','ESFP','ESFJ','ESTJ','ESTP'];
  const pick = arr => arr[Math.floor(Math.random() * arr.length)];

  const engine = new AndyEngine({
    startTime: new Date('2025-06-01T08:00:00'),
    weather: 'sunny',
  });

  // 12 学生 + 8 上班族
  const configs = [];
  for (let i = 0; i < 12; i++) {
    configs.push({
      id: `stu_${String(i).padStart(2, '0')}`,
      name: `学生${i+1}(${pick(MBTI)})`,
      personality: { mbti: pick(MBTI) },
      schedule: Schedule.createStudentSchedule({ workDays: i < 6 ? [1,3,5] : [2,4] }).toJSON(),
      initialPosition: pick(['宿舍', '食堂', '图书馆']),
    });
  }
  for (let i = 0; i < 8; i++) {
    configs.push({
      id: `wrk_${String(i).padStart(2, '0')}`,
      name: `上班族${i+1}(${pick(MBTI)})`,
      personality: { mbti: pick(MBTI) },
      schedule: Schedule.createWorkerSchedule({ workStart: 9 + (i % 3), workEnd: 17 + (i % 2) }).toJSON(),
      initialPosition: '家',
    });
  }

  const agents = engine.addAgents(configs);
  const agentIds = agents.map(a => a.id);
  const studentIds = new Set(configs.filter(c => c.id.startsWith('stu')).map(c => c.id));
  const workerIds = new Set(configs.filter(c => c.id.startsWith('wrk')).map(c => c.id));
  const maxEdges = agentIds.length * (agentIds.length - 1) / 2;

  const initSnap = engine.getSocialGraph().snapshot();
  console.log(`  创建 ${agentIds.length} Agent, 初始边=${initSnap.edgeCount}, 最大=${maxEdges}`);

  const snapshots = [];
  let lastDay = 0;
  const t0 = Date.now();

  for (let i = 0; i < TOTAL_TICKS; i++) {
    engine.tick();
    const tickCount = i + 1;
    const currentDay = Math.floor(tickCount / TICKS_PER_DAY) + 1;

    if (currentDay > lastDay && tickCount % SNAPSHOT_INTERVAL === 0) {
      lastDay = currentDay;
      const graph = engine.getSocialGraph();
      const snap = graph.snapshot();

      const dist = { stranger: 0, acquaintance: 0, friend: 0, closeFriend: 0 };
      for (const e of snap.edges) dist[e.type]++;

      const layerStats = { cf: [], f: [], a: [] };
      for (const id of agentIds) {
        const layers = graph.getLayers(id);
        layerStats.cf.push(layers.closeFriends.length);
        layerStats.f.push(layers.friends.length);
        layerStats.a.push(layers.acquaintances.length);
      }
      const avg = arr => Math.round(arr.reduce((a, b) => a + b, 0) / arr.length * 100) / 100;

      // 组内 vs 组间
      let intraStrong = 0, interStrong = 0;
      for (const e of snap.edges) {
        if (e.strength >= 0.4) {
          const same = (studentIds.has(e.agentA) && studentIds.has(e.agentB)) ||
                       (workerIds.has(e.agentA) && workerIds.has(e.agentB));
          if (same) intraStrong++; else interStrong++;
        }
      }

      // 关系强度分布
      const strengths = snap.edges.map(e => e.strength);
      const meanStr = strengths.length > 0 ? strengths.reduce((a, b) => a + b, 0) / strengths.length : 0;

      const data = {
        day: currentDay, tick: tickCount,
        totalEdges: snap.edgeCount,
        density: Math.round(snap.edgeCount / maxEdges * 10000) / 10000,
        dist,
        avgCF: avg(layerStats.cf), avgF: avg(layerStats.f), avgA: avg(layerStats.a),
        intraStrong, interStrong,
        meanStrength: Math.round(meanStr * 10000) / 10000,
        maxStrength: strengths.length > 0 ? Math.round(Math.max(...strengths) * 10000) / 10000 : 0,
      };
      snapshots.push(data);

      console.log(`  D${currentDay}: 边=${snap.edgeCount}(${(snap.edgeCount/maxEdges*100).toFixed(1)}%), ` +
                  `str=${dist.stranger} acqu=${dist.acquaintance} fri=${dist.friend} close=${dist.closeFriend}, ` +
                  `CF=${data.avgCF} F=${data.avgF} A=${data.avgA}, 均强=${data.meanStrength}`);
    }

    if (tickCount % 2160 === 0) {
      console.log(`    tick ${tickCount}/${TOTAL_TICKS} - ${((Date.now()-t0)/1000).toFixed(0)}s`);
    }
  }

  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(`\n  完成: ${elapsed}s`);

  const analysis = {};
  const first = snapshots[0], last = snapshots[snapshots.length - 1];

  analysis.summary = {
    day1: { edges: first.totalEdges, density: first.density, dist: first.dist, friend: first.avgF },
    lastDay: { edges: last.totalEdges, density: last.density, dist: last.dist, friend: last.avgF },
    fullyConnected: last.totalEdges === maxEdges,
    friendLayerExists: last.avgF > 0,
    closedFriendLayerExists: last.avgCF > 0,
    intraVsInterStrong: { intra: last.intraStrong, inter: last.interStrong },
  };

  analysis.densityEvolution = snapshots.map(s => ({
    day: s.day, edges: s.totalEdges, density: s.density,
    friend: s.dist.friend, closeFriend: s.dist.closeFriend,
    avgF: s.avgF, avgCF: s.avgCF, meanStr: s.meanStrength,
  }));

  console.log(`\n  全连接: ${analysis.summary.fullyConnected ? '是 ⚠️' : '否 ✅'}`);
  console.log(`  friend 层存在: ${analysis.summary.friendLayerExists ? '✅' : '❌'}`);
  console.log(`  组内强关系=${last.intraStrong}, 组间强关系=${last.interStrong}`);

  return { experiment: 'social_graph_r5', config: { totalTicks: TOTAL_TICKS, numAgents: agentIds.length }, analysis, snapshots };
}

module.exports = { run };
