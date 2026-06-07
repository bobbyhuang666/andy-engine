/**
 * 实验 16：100 Agent 规模测试（R5）
 *
 * 验证三元闭合修复后的大规模行为：
 *   - 网络密度是否保持合理（不再 D2 全连接）
 *   - Dunbar 层级是否自然分层
 *   - 性能和内存
 *   - 社群结构是否涌现
 */

const path = require('path');
const AndyEngine = require(path.join(__dirname, '..', 'index'));
const Schedule = require(path.join(__dirname, '..', 'agent', 'Schedule'));

function run() {
  const TOTAL_TICKS = 4320; // 15 天
  const TICKS_PER_DAY = 288;
  const NUM_AGENTS = 100;

  const MBTI = ['INFP','INFJ','INTJ','INTP','ISFP','ISFJ','ISTJ','ISTP',
                'ENFP','ENFJ','ENTJ','ENTP','ESFP','ESFJ','ESTJ','ESTP'];
  const pick = arr => arr[Math.floor(Math.random() * arr.length)];

  const engine = new AndyEngine({
    startTime: new Date('2025-06-01T08:00:00'),
    weather: 'sunny',
  });

  // 60 学生 + 25 上班族 + 15 自由职业
  const configs = [];
  for (let i = 0; i < 60; i++) {
    configs.push({
      id: `stu_${String(i).padStart(3, '0')}`,
      name: `S${i}`,
      personality: { mbti: pick(MBTI) },
      schedule: Schedule.createStudentSchedule({ workDays: i % 2 === 0 ? [1,3,5] : [2,4] }).toJSON(),
      initialPosition: pick(['宿舍', '食堂', '图书馆', '教室']),
    });
  }
  for (let i = 0; i < 25; i++) {
    configs.push({
      id: `wrk_${String(i).padStart(3, '0')}`,
      name: `W${i}`,
      personality: { mbti: pick(MBTI) },
      schedule: Schedule.createWorkerSchedule({ workStart: 8 + (i % 3), workEnd: 17 + (i % 2) }).toJSON(),
      initialPosition: '家',
    });
  }
  const freeSchedule = new Schedule({
    entries: [
      { startHour: 10, endHour: 12, region: '咖啡店', activity: '在看书', days: [0,1,2,3,4,5,6], probability: 0.5, noise: 60 },
      { startHour: 14, endHour: 17, region: '公园', activity: '在散步', days: [0,2,4,6], probability: 0.4, noise: 60 },
      { startHour: 18, endHour: 19, region: '食堂', activity: '在食堂', days: [0,1,2,3,4,5,6], probability: 0.6, noise: 30 },
    ],
  });
  for (let i = 0; i < 15; i++) {
    configs.push({
      id: `fre_${String(i).padStart(3, '0')}`,
      name: `F${i}`,
      personality: { mbti: pick(MBTI) },
      schedule: freeSchedule.toJSON(),
      initialPosition: pick(['宿舍', '咖啡店', '公园']),
    });
  }

  console.log(`  创建 ${NUM_AGENTS} Agent (60学生+25上班+15自由)`);
  const agents = engine.addAgents(configs);
  const agentIds = agents.map(a => a.id);
  const maxEdges = NUM_AGENTS * (NUM_AGENTS - 1) / 2;
  console.log(`  初始边: ${engine.getSocialGraph().snapshot().edgeCount}, 最大=${maxEdges}`);

  const memBefore = process.memoryUsage();
  const perfLog = [];
  const dailySnapshots = [];
  let lastDay = 0;
  const t0 = Date.now();

  for (let i = 0; i < TOTAL_TICKS; i++) {
    const pt0 = Date.now();
    engine.tick();
    const tickMs = Date.now() - pt0;
    const tickCount = i + 1;
    const currentDay = Math.floor(tickCount / TICKS_PER_DAY) + 1;

    if (tickCount % 100 === 0) {
      const mem = process.memoryUsage();
      perfLog.push({ tick: tickCount, tickMs, heapMB: Math.round(mem.heapUsed / 1024 / 1024 * 10) / 10 });
    }

    if (currentDay > lastDay && tickCount % TICKS_PER_DAY === 0) {
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

      const strengths = snap.edges.map(e => e.strength);
      const meanStr = strengths.length > 0 ? strengths.reduce((a, b) => a + b, 0) / strengths.length : 0;

      dailySnapshots.push({
        day: currentDay, tick: tickCount,
        totalEdges: snap.edgeCount,
        density: Math.round(snap.edgeCount / maxEdges * 10000) / 10000,
        dist,
        avgCF: avg(layerStats.cf), avgF: avg(layerStats.f), avgA: avg(layerStats.a),
        meanStrength: Math.round(meanStr * 10000) / 10000,
      });

      const perf = perfLog.length > 0 ? perfLog[perfLog.length - 1] : null;
      console.log(`    D${currentDay}: 边=${snap.edgeCount}(${(snap.edgeCount/maxEdges*100).toFixed(1)}%), ` +
                  `fri=${dist.friend} close=${dist.closeFriend}, ` +
                  `CF=${avg(layerStats.cf)} F=${avg(layerStats.f)}` +
                  (perf ? `, ${perf.tickMs}ms, ${perf.heapMB}MB` : ''));
    }

    if (tickCount % 720 === 0) {
      console.log(`    tick ${tickCount}/${TOTAL_TICKS} - ${((Date.now()-t0)/1000).toFixed(0)}s`);
    }
  }

  const elapsed = ((Date.now() - t0) / 1000).toFixed(2);
  const memAfter = process.memoryUsage();

  // 性能统计
  const ticksMs = perfLog.map(p => p.tickMs).sort((a, b) => a - b);
  const analysis = {
    performance: {
      totalTicks: TOTAL_TICKS,
      avgMs: Math.round(ticksMs.reduce((a, b) => a + b, 0) / ticksMs.length * 100) / 100,
      medianMs: ticksMs[Math.floor(ticksMs.length / 2)],
      p95Ms: ticksMs[Math.floor(ticksMs.length * 0.95)],
      maxMs: Math.max(...ticksMs),
      memStartMB: Math.round(memBefore.heapUsed / 1024 / 1024),
      memEndMB: Math.round(memAfter.heapUsed / 1024 / 1024),
    },
    network: {
      fullyConnected: dailySnapshots[dailySnapshots.length - 1].totalEdges === maxEdges,
      densityEvolution: dailySnapshots.map(s => ({
        day: s.day, edges: s.totalEdges, density: s.density,
        dist: s.dist, avgF: s.avgF, avgCF: s.avgCF, meanStr: s.meanStrength,
      })),
    },
  };

  const last = dailySnapshots[dailySnapshots.length - 1];
  console.log(`\n  完成: ${elapsed}s, ${(parseFloat(elapsed)/TOTAL_TICKS*1000).toFixed(2)}ms/tick`);
  console.log(`  内存: ${analysis.performance.memStartMB}MB → ${analysis.performance.memEndMB}MB`);
  console.log(`  全连接: ${analysis.network.fullyConnected ? '是 ⚠️' : '否 ✅'}`);
  console.log(`  Dunbar: CF=${last.avgCF}, F=${last.avgF}, A=${last.avgA}`);

  return { experiment: 'scale_100_r5', config: { totalTicks: TOTAL_TICKS, numAgents: NUM_AGENTS }, analysis, dailySnapshots, perfLog };
}

module.exports = { run };
