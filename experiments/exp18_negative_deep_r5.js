/**
 * 实验 18：负面效价深度探索（R5）
 *
 * R3 发现：仅高N+恶劣天气可产生18.4%负面率，但3天后回升
 * 本实验探索更极端的组合条件：
 *   - 场景 A: 基线
 *   - 场景 B: 极端高N(0.99) + 持续恶劣天气 + 低需求
 *   - 场景 C: 极端高N + 恶劣天气 + 需求持续匮乏（不恢复）
 *   - 场景 D: 正常人格但极端需求匮乏 + 持续雨天 + 高事件概率
 *   - 场景 E: 高N + 孤独（1个Agent独自运行）
 *
 * 目标：找到能产生稳定负面效价的条件组合
 */

const path = require('path');
const AndyEngine = require(path.join(__dirname, '..', 'index'));
const Schedule = require(path.join(__dirname, '..', 'agent', 'Schedule'));
const { EMOTION_DIMENSIONS } = require(path.join(__dirname, '..', 'config', 'defaults'));

function run() {
  const TOTAL_TICKS = 5760; // 20 天
  const TICKS_PER_DAY = 288;
  const SNAP_INT = 24;

  const scenarios = [
    {
      key: 'A_基线', label: '基线',
      weather: 'sunny', autoWeather: true,
      neuroticism: 0.5, numAgents: 3,
      drainNeeds: false, disableNeedsRecovery: false,
    },
    {
      key: 'B_极端高N', label: '极端高N+恶劣天气+低需求',
      weather: 'cold',
      weatherChanges: makeWeatherSchedule(),
      autoWeather: false,
      neuroticism: 0.99, numAgents: 3,
      drainNeeds: true, disableNeedsRecovery: false,
    },
    {
      key: 'C_需求锁死', label: '高N+恶劣+需求不恢复',
      weather: 'rain',
      weatherChanges: makeWeatherSchedule(),
      autoWeather: false,
      neuroticism: 0.95, numAgents: 3,
      drainNeeds: true, disableNeedsRecovery: true,
    },
    {
      key: 'D_环境压垮', label: '正常人+极端环境',
      weather: 'rain',
      weatherChanges: makeWeatherSchedule(),
      autoWeather: false,
      neuroticism: 0.5, numAgents: 3,
      drainNeeds: true, disableNeedsRecovery: false,
    },
    {
      key: 'E_孤独高N', label: '高N+独自1人',
      weather: 'rain',
      weatherChanges: makeWeatherSchedule(),
      autoWeather: false,
      neuroticism: 0.95, numAgents: 1,
      drainNeeds: true, disableNeedsRecovery: false,
    },
  ];

  const results = {};

  for (const sc of scenarios) {
    console.log(`\n  ─── ${sc.label} ───`);
    results[sc.key] = runScenario(sc, TOTAL_TICKS, TICKS_PER_DAY, SNAP_INT);
  }

  // 综合分析
  console.log('\n  ─── 综合分析 ───\n');
  const analysis = {};

  for (const [key, result] of Object.entries(results)) {
    const allVals = [];
    for (const snap of result.snapshots) {
      for (const agentId of result.agentIds) {
        allVals.push(snap.agents[agentId].valence);
      }
    }
    const mean = allVals.reduce((a, b) => a + b, 0) / allVals.length;
    const neg = allVals.filter(v => v < 0).length;
    const veryNeg = allVals.filter(v => v < -0.1).length;
    const deeplyNeg = allVals.filter(v => v < -0.3).length;

    analysis[key] = {
      meanValence: round4(mean),
      negativeRate: round4(neg / allVals.length),
      veryNegativeRate: round4(veryNeg / allVals.length),
      deeplyNegativeRate: round4(deeplyNeg / allVals.length),
      minValence: round4(Math.min(...allVals)),
      maxValence: round4(Math.max(...allVals)),
    };

    console.log(`  ${key}: mean=${analysis[key].meanValence}, neg=${(analysis[key].negativeRate*100).toFixed(1)}%, ` +
                `deepNeg=${(analysis[key].deeplyNegativeRate*100).toFixed(1)}%, range=[${analysis[key].minValence}, ${analysis[key].maxValence}]`);
  }

  // 每日效价趋势
  analysis.dailyTrends = {};
  for (const [key, result] of Object.entries(results)) {
    const daily = {};
    for (const snap of result.snapshots) {
      const day = snap.day;
      if (!daily[day]) daily[day] = [];
      for (const agentId of result.agentIds) {
        daily[day].push(snap.agents[agentId].valence);
      }
    }
    analysis.dailyTrends[key] = {};
    for (const [day, vals] of Object.entries(daily)) {
      analysis.dailyTrends[key][day] = round4(vals.reduce((a, b) => a + b, 0) / vals.length);
    }
  }

  console.log('\n  每日效价趋势:');
  for (const [scenario, daily] of Object.entries(analysis.dailyTrends)) {
    const line = Object.entries(daily).map(([d, v]) => `D${d}=${v}`).join(', ');
    console.log(`    ${scenario}: ${line}`);
  }

  // 维度深度对比
  const dims = ['joy', 'sadness', 'anger', 'fear', 'frustration', 'nervousness', 'boredom', 'loneliness', 'calm'];
  analysis.dimComparison = {};
  for (const dim of dims) {
    analysis.dimComparison[dim] = {};
    for (const [key, result] of Object.entries(results)) {
      const vals = [];
      for (const snap of result.snapshots) {
        for (const agentId of result.agentIds) {
          vals.push(snap.agents[agentId].dimensions[dim] || 0);
        }
      }
      analysis.dimComparison[dim][key] = round4(vals.reduce((a, b) => a + b, 0) / vals.length);
    }
  }

  console.log('\n  维度对比 (关键维度):');
  for (const dim of ['joy', 'frustration', 'boredom', 'nervousness', 'loneliness']) {
    const vals = analysis.dimComparison[dim];
    const line = Object.entries(vals).map(([k, v]) => `${k}=${v}`).join(', ');
    console.log(`    ${dim}: ${line}`);
  }

  return {
    experiment: 'negative_deep_r5',
    config: { totalTicks: TOTAL_TICKS, scenarios: scenarios.map(s => s.key) },
    analysis,
  };
}

function makeWeatherSchedule() {
  const changes = [];
  for (let day = 0; day < 20; day++) {
    const tick = day * 288;
    changes.push({ tick, weather: day % 2 === 0 ? 'cold' : 'rain' });
    changes.push({ tick: tick + 144, weather: day % 2 === 0 ? 'rain' : 'cold' });
  }
  return changes;
}

function runScenario(sc, totalTicks, ticksPerDay, snapInterval) {
  const engine = new AndyEngine({
    startTime: new Date('2025-06-01T08:00:00'),
    weather: sc.weather,
  });

  if (!sc.autoWeather) {
    engine.world._maybeChangeWeather = () => {};
  }

  const MBTI = ['INFJ', 'INFP', 'ISTP'];
  const configs = [];
  for (let i = 0; i < sc.numAgents; i++) {
    configs.push({
      id: `agent_${i}`, name: `角色${i+1}`,
      personality: { mbti: MBTI[i % MBTI.length], ocean: { neuroticism: sc.neuroticism } },
      schedule: Schedule.createStudentSchedule().toJSON(),
      initialPosition: '宿舍',
    });
  }

  const agents = engine.addAgents(configs);
  const agentIds = agents.map(a => a.id);

  // 需求匮乏
  if (sc.drainNeeds) {
    for (const agent of agents) {
      agent.needs.needs.hunger = 0.15;
      agent.needs.needs.energy = 0.1;
      agent.needs.needs.comfort = 0.08;
      agent.needs.needs.social = 0.08;
      agent.needs.needs.stimulation = 0.05;
    }
  }

  // 禁用需求恢复
  if (sc.disableNeedsRecovery) {
    for (const agent of agents) {
      const origTick = agent.needs.tick.bind(agent.needs);
      agent.needs.tick = function(hoursElapsed, currentState, currentRegion) {
        origTick(hoursElapsed, currentState, currentRegion);
        // 需求只降不升
        this.needs.hunger = Math.min(this.needs.hunger, 0.15);
        this.needs.energy = Math.min(this.needs.energy, 0.1);
        this.needs.comfort = Math.min(this.needs.comfort, 0.08);
        this.needs.social = Math.min(this.needs.social, 0.08);
        this.needs.stimulation = Math.min(this.needs.stimulation, 0.05);
      };
    }
  }

  const changeMap = new Map((sc.weatherChanges || []).map(c => [c.tick, c.weather]));
  const snapshots = [];

  for (let i = 0; i < totalTicks; i++) {
    if (changeMap.has(i)) engine.setWeather(changeMap.get(i));
    engine.tick();
    const tickCount = i + 1;

    if (tickCount % snapInterval === 0) {
      const simTime = engine.world.time;
      const hour = simTime.getHours() + simTime.getMinutes() / 60;
      const day = Math.floor(tickCount / ticksPerDay) + 1;

      const snap = { tick: tickCount, day, hour: round2(hour), agents: {} };
      for (const agent of agents) {
        const emo = agent.emotion;
        const dims = {};
        for (const dim of EMOTION_DIMENSIONS) {
          dims[dim] = round4(emo.current[dim] || 0);
        }
        snap.agents[agent.id] = {
          valence: round4(emo.getValence()),
          arousal: round4(emo.getArousal()),
          health: round3(agent.health),
          stress: round2(emo.stress),
          dimensions: dims,
          needs: {
            hunger: round3(agent.needs.needs.hunger),
            energy: round3(agent.needs.needs.energy),
            social: round3(agent.needs.needs.social),
          },
        };
      }
      snapshots.push(snap);
    }
  }

  console.log(`    完成: ${snapshots.length} 快照`);
  return { agentIds, snapshots };
}

function round2(v) { return Math.round(v * 100) / 100; }
function round3(v) { return Math.round(v * 1000) / 1000; }
function round4(v) { return Math.round(v * 10000) / 10000; }

module.exports = { run };
