/**
 * 实验 19：长期压力适应（60天, R5）
 *
 * R3 发现：高N+恶劣天气的负面效价在2-3天后回升
 * 本实验用更长时间窗口观察：
 *   - 60天持续压力下效价是否完全恢复
 *   - 是否存在"慢性压力"的稳态（比基线低但不为负）
 *   - 关系在长期压力下如何变化
 *   - 健康系统是否产生连锁反应
 *
 * 场景：3 Agent，N=0.9，持续冷+雨交替，60天
 */

const path = require('path');
const AndyEngine = require(path.join(__dirname, '..', 'index'));
const Schedule = require(path.join(__dirname, '..', 'agent', 'Schedule'));
const { EMOTION_DIMENSIONS } = require(path.join(__dirname, '..', 'config', 'defaults'));

function run() {
  const TOTAL_TICKS = 17280; // 60 天
  const TICKS_PER_DAY = 288;
  const SNAP_INT = 288; // 每天一次详细快照

  // 场景 A：基线（晴天，正常人格）
  console.log('  ─── 场景 A：基线 ───');
  const resultA = runScenario({
    label: '基线', weather: 'sunny', autoWeather: true,
    neuroticism: 0.5, totalTicks: TOTAL_TICKS,
  });

  // 场景 B：长期压力（高N + 恶劣天气交替）
  console.log('\n  ─── 场景 B：长期压力 ───');
  const weatherChanges = [];
  for (let d = 0; d < 60; d++) {
    weatherChanges.push({ tick: d * 288, weather: d % 2 === 0 ? 'cold' : 'rain' });
    weatherChanges.push({ tick: d * 288 + 144, weather: d % 2 === 0 ? 'rain' : 'cold' });
  }

  const resultB = runScenario({
    label: '长期压力', weather: 'cold', weatherChanges,
    autoWeather: false, neuroticism: 0.9, totalTicks: TOTAL_TICKS,
  });

  // ─── 分析 ───
  console.log('\n  ─── 分析 ───\n');
  const analysis = {};

  // 每日效价
  analysis.dailyValence = {};
  for (const [key, result] of Object.entries({ 基线: resultA, 压力: resultB })) {
    const daily = {};
    for (const snap of result.snapshots) {
      const day = snap.day;
      if (!daily[day]) daily[day] = [];
      for (const agentId of result.agentIds) {
        daily[day].push(snap.agents[agentId].valence);
      }
    }
    analysis.dailyValence[key] = {};
    for (const [day, vals] of Object.entries(daily)) {
      analysis.dailyValence[key][day] = r4(vals.reduce((a, b) => a + b, 0) / vals.length);
    }
  }

  // 分阶段统计
  const phases = [
    { name: 'D1-5', start: 1, end: 5 },
    { name: 'D6-15', start: 6, end: 15 },
    { name: 'D16-30', start: 16, end: 30 },
    { name: 'D31-60', start: 31, end: 60 },
  ];

  analysis.phaseStats = {};
  for (const [key, result] of Object.entries({ 基线: resultA, 压力: resultB })) {
    analysis.phaseStats[key] = {};
    for (const phase of phases) {
      const vals = [];
      for (const snap of result.snapshots) {
        if (snap.day >= phase.start && snap.day <= phase.end) {
          for (const agentId of result.agentIds) {
            vals.push(snap.agents[agentId].valence);
          }
        }
      }
      const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
      const neg = vals.filter(v => v < 0).length;
      analysis.phaseStats[key][phase.name] = {
        mean: r4(mean),
        negRate: r4(neg / vals.length),
        min: r4(Math.min(...vals)),
      };
    }
  }

  console.log('  分阶段效价:');
  for (const phase of phases) {
    const base = analysis.phaseStats['基线'][phase.name];
    const stress = analysis.phaseStats['压力'][phase.name];
    console.log(`    ${phase.name}: 基线 mean=${base.mean} neg=${(base.negRate*100).toFixed(1)}% | ` +
                `压力 mean=${stress.mean} neg=${(stress.negRate*100).toFixed(1)}%`);
  }

  // 每日效价趋势（关键日期）
  console.log('\n  每日效价 (抽样):');
  const sampleDays = [1, 2, 3, 5, 7, 10, 14, 21, 30, 45, 60];
  for (const d of sampleDays) {
    const baseVal = analysis.dailyValence['基线'][d];
    const stressVal = analysis.dailyValence['压力'][d];
    console.log(`    D${d}: 基线=${baseVal}, 压力=${stressVal}, Δ=${r4(stressVal - baseVal)}`);
  }

  // 情绪维度长期变化
  const keyDims = ['joy', 'sadness', 'frustration', 'nervousness', 'boredom', 'calm'];
  analysis.dimEvolution = {};
  for (const dim of keyDims) {
    analysis.dimEvolution[dim] = {};
    for (const [key, result] of Object.entries({ 基线: resultA, 压力: resultB })) {
      // 前7天 vs 后7天
      const first = [], last = [];
      for (const snap of result.snapshots) {
        for (const agentId of result.agentIds) {
          const val = snap.agents[agentId].dimensions[dim] || 0;
          if (snap.day <= 7) first.push(val);
          if (snap.day >= 54) last.push(val);
        }
      }
      analysis.dimEvolution[dim][key] = {
        early: r4(first.reduce((a, b) => a + b, 0) / first.length),
        late: r4(last.reduce((a, b) => a + b, 0) / last.length),
      };
    }
  }

  console.log('\n  情绪维度演化 (D1-7 vs D54-60):');
  for (const dim of keyDims) {
    const base = analysis.dimEvolution[dim]['基线'];
    const stress = analysis.dimEvolution[dim]['压力'];
    console.log(`    ${dim}: 基线 ${base.early}→${base.late} | 压力 ${stress.early}→${stress.late}`);
  }

  // 健康趋势
  analysis.healthTrend = {};
  for (const [key, result] of Object.entries({ 基线: resultA, 压力: resultB })) {
    const daily = {};
    for (const snap of result.snapshots) {
      const day = snap.day;
      if (!daily[day]) daily[day] = [];
      for (const agentId of result.agentIds) {
        daily[day].push(snap.agents[agentId].health);
      }
    }
    analysis.healthTrend[key] = {};
    for (const [day, vals] of Object.entries(daily)) {
      analysis.healthTrend[key][day] = r3(vals.reduce((a, b) => a + b, 0) / vals.length);
    }
  }

  console.log('\n  健康趋势 (抽样):');
  for (const d of [1, 7, 14, 30, 60]) {
    console.log(`    D${d}: 基线=${analysis.healthTrend['基线'][d]}, 压力=${analysis.healthTrend['压力'][d]}`);
  }

  // 适应速度分析
  const stressDaily = analysis.dailyValence['压力'];
  const stressVals = Object.entries(stressDaily).map(([d, v]) => ({ day: parseInt(d), val: v })).sort((a, b) => a.day - b.day);
  let stableDay = null;
  for (let i = 5; i < stressVals.length; i++) {
    const window = stressVals.slice(i - 5, i);
    const mean = window.reduce((a, b) => a + b.val, 0) / window.length;
    const std = Math.sqrt(window.reduce((a, b) => a + (b.val - mean) ** 2, 0) / window.length);
    if (std < 0.015) {
      stableDay = stressVals[i].day;
      break;
    }
  }

  analysis.adaptation = {
    stableDay: stableDay,
    stableValence: stableDay ? stressDaily[stableDay] : null,
    baseValence: Object.values(analysis.dailyValence['基线']).reduce((a, b) => a + b, 0) / Object.values(analysis.dailyValence['基线']).length,
  };

  console.log(`\n  适应分析:`);
  console.log(`    压力场景稳态: ${stableDay ? `D${stableDay}, valence=${analysis.adaptation.stableValence}` : '未达到'}`);
  console.log(`    基线均值: ${analysis.adaptation.baseValence}`);
  if (stableDay) {
    console.log(`    持续差值: ${r4(analysis.adaptation.stableValence - analysis.adaptation.baseValence)}`);
  }

  return { experiment: 'longterm_stress_r5', config: { totalTicks: TOTAL_TICKS }, analysis };
}

function runScenario({ label, weather, weatherChanges, autoWeather, neuroticism, totalTicks }) {
  const TICKS_PER_DAY = 288;
  const SNAP_INT = 288;

  const engine = new AndyEngine({
    startTime: new Date('2025-06-01T08:00:00'),
    weather,
  });

  if (!autoWeather) engine.world._maybeChangeWeather = () => {};

  const agents = engine.addAgents([
    { id: 'a0', name: 'A', personality: { mbti: 'INFJ', ocean: { neuroticism } },
      schedule: Schedule.createStudentSchedule().toJSON(), initialPosition: '宿舍' },
    { id: 'a1', name: 'B', personality: { mbti: 'INFP', ocean: { neuroticism } },
      schedule: Schedule.createStudentSchedule().toJSON(), initialPosition: '宿舍' },
    { id: 'a2', name: 'C', personality: { mbti: 'ISTP', ocean: { neuroticism } },
      schedule: Schedule.createStudentSchedule().toJSON(), initialPosition: '宿舍' },
  ]);

  const agentIds = agents.map(a => a.id);
  const changeMap = new Map((weatherChanges || []).map(c => [c.tick, c.weather]));
  const snapshots = [];

  for (let i = 0; i < totalTicks; i++) {
    if (changeMap.has(i)) engine.setWeather(changeMap.get(i));
    engine.tick();
    const tickCount = i + 1;

    if (tickCount % SNAP_INT === 0) {
      const day = Math.floor(tickCount / TICKS_PER_DAY) + 1;
      const snap = { tick: tickCount, day, agents: {} };
      for (const agent of agents) {
        const emo = agent.emotion;
        const dims = {};
        for (const dim of EMOTION_DIMENSIONS) {
          dims[dim] = r4(emo.current[dim] || 0);
        }
        snap.agents[agent.id] = {
          valence: r4(emo.getValence()),
          arousal: r4(emo.getArousal()),
          health: r3(agent.health),
          stress: r2(emo.stress),
          dimensions: dims,
        };
      }
      snapshots.push(snap);
    }
  }

  console.log(`    ${label}: ${snapshots.length} 快照`);
  return { agentIds, snapshots };
}

function r2(v) { return Math.round(v * 100) / 100; }
function r3(v) { return Math.round(v * 1000) / 1000; }
function r4(v) { return Math.round(v * 10000) / 10000; }

module.exports = { run, runScenario };
