/**
 * 合成数据生成管线
 *
 * 架构：
 *   JS (场景配置 + 图构建 + 数据收集) → Rust SoA (并行情绪计算) → JS (格式化输出)
 *
 * 流程：
 *   1. 生成 agent 人格 + 行为参数
 *   2. 构建小世界社交图谱 (CSR 格式)
 *   3. 初始化 Rust SoA 引擎
 *   4. 运行模拟，定期采样
 *   5. 输出训练数据 + 分析数据
 */

const fs = require('fs');
const path = require('path');
const { MBTI_TO_OCEAN, SCENARIOS, oceanToBehavior, ALL_MBTI } = require('./scenarios');

// ═══════════════════════════════════════════
// Rust 引擎加载
// ═══════════════════════════════════════════
let SoaBatchEngine;
try {
  const native = require('../native');
  SoaBatchEngine = native.SoaBatchEngine;
  console.log('  ✅ Rust SoA 引擎已加载');
} catch (e) {
  console.error('  ❌ Rust 引擎加载失败:', e.message);
  process.exit(1);
}

const NUM_DIMS = 30;

// ═══════════════════════════════════════════
// 社交图谱构建 (CSR 格式)
// ═══════════════════════════════════════════

/**
 * 构建小世界网络并转为 CSR 格式
 *
 * Watts-Strogatz 小世界模型：
 *   1. 环形格子：每个节点连接 k 个近邻
 *   2. 随机重连：每条边以概率 p 重连到随机节点
 *   3. 结果：高聚类系数 + 短平均路径长度
 *
 * @returns {{ offsets: Uint32Array, neighbors: Uint32Array, levels: Uint32Array, strengths: Float32Array }}
 */
function buildSocialGraph(numAgents, config, groupAssignments) {
  const { k, rewireProb, dunbarLevels, departmentBias } = config;

  // Step 1: 构建邻接表
  const adjacency = Array.from({ length: numAgents }, () => new Set());

  // 环形格子连接
  for (let i = 0; i < numAgents; i++) {
    for (let j = 1; j <= k / 2; j++) {
      const left = (i - j + numAgents) % numAgents;
      const right = (i + j) % numAgents;
      adjacency[i].add(left);
      adjacency[left].add(i);
      adjacency[i].add(right);
      adjacency[right].add(i);
    }
  }

  // Step 2: 随机重连
  for (let i = 0; i < numAgents; i++) {
    const neighbors = [...adjacency[i]];
    for (const j of neighbors) {
      if (Math.random() < rewireProb) {
        adjacency[i].delete(j);
        adjacency[j].delete(i);

        // 重连：偏向同组（如果设置了 departmentBias）
        let newTarget;
        if (departmentBias && Math.random() < departmentBias) {
          // 同组内随机
          const sameGroup = groupAssignments.filter((g, idx) => idx !== i && g === groupAssignments[i]);
          if (sameGroup.length > 0) {
            const groupIndices = groupAssignments
              .map((g, idx) => g === groupAssignments[i] ? idx : -1)
              .filter(idx => idx !== i && idx >= 0);
            newTarget = groupIndices[Math.floor(Math.random() * groupIndices.length)];
          }
        }
        if (newTarget === undefined) {
          do { newTarget = Math.floor(Math.random() * numAgents); } while (newTarget === i);
        }

        adjacency[i].add(newTarget);
        adjacency[newTarget].add(i);
      }
    }
  }

  // Step 3: 分配 Dunbar 层级
  // 按连接强度排序（随机初始化强度，然后根据距离调整）
  const edgeStrengths = new Map(); // "i-j" → strength
  for (let i = 0; i < numAgents; i++) {
    for (const j of adjacency[i]) {
      if (j > i) {
        const key = `${i}-${j}`;
        // 基础强度 + 噪声（后续模拟中会演化）
        const baseStr = 0.1 + Math.random() * 0.3;
        // 同组的初始强度更高
        const sameGroup = groupAssignments[i] === groupAssignments[j];
        edgeStrengths.set(key, sameGroup ? baseStr * 1.5 : baseStr);
      }
    }
  }

  // Step 4: 转为 CSR 格式
  const offsets = new Uint32Array(numAgents + 1);
  const neighborList = [];
  const levelList = [];
  const strengthList = [];

  for (let i = 0; i < numAgents; i++) {
    offsets[i] = neighborList.length;

    // 获取该节点的所有邻居，按强度排序
    const myEdges = [];
    for (const j of adjacency[i]) {
      const key = i < j ? `${i}-${j}` : `${j}-${i}`;
      myEdges.push({ neighbor: j, strength: edgeStrengths.get(key) || 0.1 });
    }
    myEdges.sort((a, b) => b.strength - a.strength);

    // 分配 Dunbar 层级
    for (let idx = 0; idx < myEdges.length; idx++) {
      neighborList.push(myEdges[idx].neighbor);
      strengthList.push(myEdges[idx].strength);

      let level;
      if (idx < dunbarLevels.closeFriend) {
        level = 0; // close friend: 每 tick 传染
      } else if (idx < dunbarLevels.closeFriend + dunbarLevels.friend) {
        level = 1; // friend: 每 3 ticks
      } else {
        level = 2; // acquaintance: 每 12 ticks
      }
      levelList.push(level);
    }
  }
  offsets[numAgents] = neighborList.length;

  return {
    offsets,
    neighbors: new Uint32Array(neighborList),
    levels: new Uint8Array(levelList),     // u8 per Rust (1 byte/edge)
    strengths: new Float32Array(strengthList),
    totalEdges: neighborList.length / 2,
  };
}

// ═══════════════════════════════════════════
// Agent 生成
// ═══════════════════════════════════════════

function generateAgents(scenario) {
  const agents = [];
  const groupAssignments = [];
  let globalIdx = 0;

  for (const group of scenario.groups) {
    for (let i = 0; i < group.count; i++) {
      const mbti = group.mbtiPool[i % group.mbtiPool.length];
      const baseOcean = { ...MBTI_TO_OCEAN[mbti] };

      // 应用人格覆盖（极端人格场景）
      if (group.oceanOverride) {
        for (const [dim, range] of Object.entries(group.oceanOverride)) {
          baseOcean[dim] = range[0] + Math.random() * (range[1] - range[0]);
        }
      }

      const behavior = oceanToBehavior(baseOcean);

      agents.push({
        id: `${group.prefix}_${String(i).padStart(4, '0')}`,
        group: group.label,
        mbti,
        ocean: baseOcean,
        behavior,
      });
      groupAssignments.push(group.label);
      globalIdx++;
    }
  }

  return { agents, groupAssignments };
}

// ═══════════════════════════════════════════
// 模拟运行
// ═══════════════════════════════════════════

function runSimulation(scenario, agents, graph) {
  const totalTicks = scenario.durationDays * 288; // 288 ticks/day @ 5min/tick
  const sampleInterval = scenario.sampleIntervalTicks;
  const numSamples = Math.floor(totalTicks / sampleInterval);
  const n = agents.length;

  console.log(`  📊 模拟: ${n} agents × ${scenario.durationDays}天 = ${totalTicks} ticks`);
  console.log(`  📊 每 ${sampleInterval} ticks 采样，共 ${numSamples} 个快照`);
  console.log(`  📊 图: ${graph.totalEdges} 条边`);

  // 初始化 Rust 引擎
  const engine = new SoaBatchEngine(42);

  // 添加 agents
  const configJson = JSON.stringify({
    decay_lambda: 1.0,
    inertia: 0.5,
    max_delta_per_tick: 0.10,
    noise_amplitude: 0.015,
    co_activation_weight: 0.3,
    baseline_drift_rate: 0.0001,
    circadian: {
      positive_affect_peak: 14,
      positive_affect_amp: 0.15,
      negative_affect_peak: 4,
      negative_affect_amp: 0.10,
    },
  });

  for (const agent of agents) {
    const behaviorJson = JSON.stringify(agent.behavior);
    engine.addAgent(behaviorJson, configJson);
  }

  // 设置社交图谱
  // 需要将 Uint32Array/Float32Array 转为 Buffer
  const offsetsBuf = Buffer.from(graph.offsets.buffer);
  const neighborsBuf = Buffer.from(graph.neighbors.buffer);
  const levelsBuf = Buffer.from(graph.levels.buffer);
  const strengthsBuf = Buffer.from(graph.strengths.buffer);
  engine.setupSocialGraphBinary(offsetsBuf, neighborsBuf, levelsBuf, strengthsBuf);

  console.log(`  ✅ 引擎初始化完成 (${n} agents, ${graph.totalEdges} edges)`);

  // 准备状态缓冲区（输入/输出）
  const inputPerAgent = NUM_DIMS + 1; // 30 emotion + 1 stress
  const statesBuf = Buffer.alloc(n * inputPerAgent * 4); // f32

  // 初始化状态缓冲区
  for (let i = 0; i < n; i++) {
    const offset = i * inputPerAgent * 4;
    // 初始情绪全 0（引擎会从 baseline 演化）
    for (let d = 0; d < NUM_DIMS; d++) {
      statesBuf.writeFloatLE(0, offset + d * 4);
    }
    statesBuf.writeFloatLE(0, offset + NUM_DIMS * 4); // stress = 0
  }

  // 运行模拟并采样
  const snapshots = [];
  const t0 = Date.now();
  let lastLogTick = 0;

  // 计算 tick 对应的小时（用于昼夜节律）
  // 模拟从 08:00 开始
  const startHour = 8;
  const hoursPerTick = 5 / 60; // 5 minutes

  for (let tick = 0; tick < totalTicks; tick++) {
    const hourOfDay = (startHour + tick * hoursPerTick) % 24;

    // 调用 Rust 引擎（带 Dunbar 层级传染）
    const outBuf = engine.tickSoaContagionBinary(statesBuf, hoursPerTick, hourOfDay);

    // 将输出写回输入缓冲区（下一轮输入）
    outBuf.copy(statesBuf, 0, 0, n * inputPerAgent * 4);

    // 采样
    if ((tick + 1) % sampleInterval === 0) {
      const snapshot = new Float32Array(n * (NUM_DIMS + 2)); // valence, arousal, 30 dims
      for (let i = 0; i < n; i++) {
        const baseOff = i * 107 * 4; // output: 107 floats per agent
        // 提取 current[30]
        const current = new Float32Array(NUM_DIMS);
        for (let d = 0; d < NUM_DIMS; d++) {
          current[d] = outBuf.readFloatLE(baseOff + d * 4);
        }
        // 计算 valence
        const positiveDims = [0, 6, 8, 13, 15, 17, 18, 21, 27, 28]; // joy, amusement, contentment, interest, love, relief, satisfaction, pride, hope, gratitude
        const negativeDims = [1, 2, 3, 4, 9, 10, 11, 16, 19, 26, 29]; // sadness, anger, fear, disgust, embarrassment, guilt, horror, shame, confusion, frustration, loneliness
        let posSum = 0, negSum = 0;
        for (const d of positiveDims) posSum += Math.max(0, current[d]);
        for (const d of negativeDims) negSum += Math.max(0, -current[d]);
        const valence = (posSum / positiveDims.length) - (negSum / negativeDims.length);

        // 计算 arousal
        const highArousal = [0, 2, 3, 4, 6, 11, 14, 20, 25]; // joy, anger, fear, disgust, amusement, horror, love, triumph, excitement
        const lowArousal = [1, 8, 10, 17, 23, 27]; // sadness, contentment, guilt, relief, calm, hope
        let highSum = 0, lowSum = 0;
        for (const d of highArousal) highSum += Math.abs(current[d]);
        for (const d of lowArousal) lowSum += Math.abs(current[d]);
        const arousal = (highSum / highArousal.length) - (lowSum / lowArousal.length);

        const snapOff = i * (NUM_DIMS + 2);
        snapshot[snapOff] = valence;
        snapshot[snapOff + 1] = arousal;
        for (let d = 0; d < NUM_DIMS; d++) {
          snapshot[snapOff + 2 + d] = current[d];
        }
      }
      snapshots.push({
        tick: tick + 1,
        day: Math.floor((tick + 1) / 288) + 1,
        hour: hourOfDay,
        data: snapshot,
      });
    }

    // 进度日志
    if ((tick + 1) % 2880 === 0 || tick === totalTicks - 1) {
      const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
      const day = Math.floor((tick + 1) / 288) + 1;
      const msPerTick = ((Date.now() - t0) / (tick + 1)).toFixed(2);
      console.log(`    D${day}: tick ${tick+1}/${totalTicks}, ${elapsed}s, ${msPerTick}ms/tick`);
    }
  }

  const totalTime = ((Date.now() - t0) / 1000).toFixed(1);
  const msPerTick = ((Date.now() - t0) / totalTicks).toFixed(2);
  console.log(`  ✅ 模拟完成: ${totalTime}s, ${msPerTick}ms/tick`);

  return { snapshots, totalTicks, totalTime, msPerTick };
}

// ═══════════════════════════════════════════
// 数据格式化
// ═══════════════════════════════════════════

/**
 * 将模拟数据格式化为多种输出
 */
function formatOutput(scenario, agents, graph, simulation) {
  const outputDir = path.join(__dirname, 'output', scenario.id);
  if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

  const { snapshots, totalTicks, totalTime, msPerTick } = simulation;

  // ─── 1. 情绪轨迹 CSV ───
  const dimNames = [
    'joy', 'sadness', 'anger', 'fear', 'surprise', 'disgust',
    'amusement', 'awe', 'contentment', 'desire', 'embarrassment',
    'guilt', 'horror', 'interest', 'love', 'nervousness',
    'pride', 'relief', 'satisfaction', 'shame', 'sympathy', 'triumph',
    'boredom', 'calm', 'confusion', 'excitement', 'frustration',
    'gratitude', 'hope', 'loneliness',
  ];

  // 只保存采样 agent（全量太大）
  const sampleAgents = agents.slice(0, Math.min(50, agents.length));
  const sampleIndices = sampleAgents.map((_, i) => i);

  let csv = 'tick,day,hour,agent_id,group,mbti,valence,arousal';
  for (const dim of dimNames) csv += `,${dim}`;
  csv += '\n';

  for (const snap of snapshots) {
    for (const idx of sampleIndices) {
      const agent = agents[idx];
      const off = idx * (NUM_DIMS + 2);
      csv += `${snap.tick},${snap.day},${snap.hour.toFixed(1)},${agent.id},${agent.group},${agent.mbti}`;
      csv += `,${snap.data[off].toFixed(4)},${snap.data[off + 1].toFixed(4)}`;
      for (let d = 0; d < NUM_DIMS; d++) {
        csv += `,${snap.data[off + 2 + d].toFixed(4)}`;
      }
      csv += '\n';
    }
  }
  fs.writeFileSync(path.join(outputDir, 'emotion_trajectories.csv'), csv);

  // ─── 2. 全局统计 JSON ───
  const stats = {
    scenario: scenario.id,
    name: scenario.name,
    numAgents: agents.length,
    totalTicks,
    durationDays: scenario.durationDays,
    totalTime,
    msPerTick,
    graph: {
      totalEdges: graph.totalEdges,
      avgDegree: (graph.totalEdges * 2 / agents.length).toFixed(1),
    },
    snapshots: snapshots.length,
    personalityDistribution: {},
    emotionStats: {},
  };

  // 人格分布
  for (const agent of agents) {
    stats.personalityDistribution[agent.mbti] = (stats.personalityDistribution[agent.mbti] || 0) + 1;
  }

  // 情绪统计（每个快照的全局均值）
  const valenceTimeline = [];
  for (const snap of snapshots) {
    let vSum = 0, aSum = 0;
    const n = agents.length;
    for (let i = 0; i < n; i++) {
      const off = i * (NUM_DIMS + 2);
      vSum += snap.data[off];
      aSum += snap.data[off + 1];
    }
    valenceTimeline.push({
      tick: snap.tick,
      day: snap.day,
      meanValence: +(vSum / n).toFixed(4),
      meanArousal: +(aSum / n).toFixed(4),
    });
  }
  stats.valenceTimeline = valenceTimeline;

  // 按组统计最后快照
  const lastSnap = snapshots[snapshots.length - 1];
  const groupStats = {};
  for (let i = 0; i < agents.length; i++) {
    const agent = agents[i];
    if (!groupStats[agent.group]) groupStats[agent.group] = { valences: [], arousals: [] };
    const off = i * (NUM_DIMS + 2);
    groupStats[agent.group].valences.push(lastSnap.data[off]);
    groupStats[agent.group].arousals.push(lastSnap.data[off + 1]);
  }
  stats.groupFinalStats = {};
  for (const [group, data] of Object.entries(groupStats)) {
    const avg = arr => arr.reduce((a, b) => a + b, 0) / arr.length;
    stats.groupFinalStats[group] = {
      meanValence: +avg(data.valences).toFixed(4),
      meanArousal: +avg(data.arousals).toFixed(4),
      count: data.valences.length,
    };
  }

  fs.writeFileSync(path.join(outputDir, 'stats.json'), JSON.stringify(stats, null, 2));

  // ─── 3. 训练数据 (JSONL) ───
  // 为每个 agent 生成 emotion prediction 训练样本
  const trainingSamples = [];
  const trainingAgents = agents.slice(0, Math.min(100, agents.length));

  for (let s = 1; s < snapshots.length; s++) {
    const prev = snapshots[s - 1];
    const curr = snapshots[s];

    for (const agent of trainingAgents) {
      const idx = agents.indexOf(agent);
      const prevOff = idx * (NUM_DIMS + 2);
      const currOff = idx * (NUM_DIMS + 2);

      const prevValence = prev.data[prevOff];
      const currValence = curr.data[currOff];
      const delta = currValence - prevValence;

      // 只保留有显著变化的样本（|delta| > 0.01）
      if (Math.abs(delta) < 0.01) continue;

      // 构建上下文
      const prevDims = {};
      const currDims = {};
      const deltaDims = {};
      for (let d = 0; d < NUM_DIMS; d++) {
        prevDims[dimNames[d]] = +prev.data[prevOff + 2 + d].toFixed(4);
        currDims[dimNames[d]] = +curr.data[currOff + 2 + d].toFixed(4);
        deltaDims[dimNames[d]] = +(curr.data[currOff + 2 + d] - prev.data[prevOff + 2 + d]).toFixed(4);
      }

      trainingSamples.push({
        character: {
          id: agent.id,
          group: agent.group,
          mbti: agent.mbti,
          ocean: Object.fromEntries(
            Object.entries(agent.ocean).map(([k, v]) => [k, +v.toFixed(2)])
          ),
        },
        context: {
          tick: curr.tick,
          day: curr.day,
          hour: +curr.hour.toFixed(1),
          timeLabel: getTimeLabel(curr.hour),
        },
        emotion_before: {
          valence: +prevValence.toFixed(4),
          arousal: +prev.data[prevOff + 1].toFixed(4),
          dimensions: prevDims,
        },
        emotion_after: {
          valence: +currValence.toFixed(4),
          arousal: +curr.data[currOff + 1].toFixed(4),
          dimensions: currDims,
        },
        emotion_delta: {
          valence: +delta.toFixed(4),
          dimensions: deltaDims,
        },
        // 推断的可能事件
        inferred_events: inferEvents(prevDims, currDims, deltaDims, curr.hour, agent),
      });
    }
  }

  // 写 JSONL
  const jsonl = trainingSamples.map(s => JSON.stringify(s)).join('\n');
  fs.writeFileSync(path.join(outputDir, 'training_data.jsonl'), jsonl);

  // ─── 4. 社交图谱 ───
  const graphData = {
    numAgents: agents.length,
    totalEdges: graph.totalEdges,
    edges: [],
  };
  // 只保存前 100 个 agent 的边
  for (let i = 0; i < Math.min(100, agents.length); i++) {
    for (let off = graph.offsets[i]; off < graph.offsets[i + 1]; off++) {
      const j = graph.neighbors[off];
      if (j > i && j < 100) {
        graphData.edges.push({
          a: agents[i].id,
          b: agents[j].id,
          level: graph.levels[off],
          strength: +graph.strengths[off].toFixed(4),
        });
      }
    }
  }
  fs.writeFileSync(path.join(outputDir, 'social_graph.json'), JSON.stringify(graphData, null, 2));

  // ─── 5. Agent 信息 ───
  const agentInfo = agents.map(a => ({
    id: a.id,
    group: a.group,
    mbti: a.mbti,
    ocean: Object.fromEntries(Object.entries(a.ocean).map(([k, v]) => [k, +v.toFixed(2)])),
  }));
  fs.writeFileSync(path.join(outputDir, 'agents.json'), JSON.stringify(agentInfo, null, 2));

  return {
    csvPath: path.join(outputDir, 'emotion_trajectories.csv'),
    statsPath: path.join(outputDir, 'stats.json'),
    trainingPath: path.join(outputDir, 'training_data.jsonl'),
    graphPath: path.join(outputDir, 'social_graph.json'),
    agentsPath: path.join(outputDir, 'agents.json'),
    trainingSamples: trainingSamples.length,
    csvSize: (fs.statSync(path.join(outputDir, 'emotion_trajectories.csv')).size / 1024 / 1024).toFixed(1),
  };
}

// ═══════════════════════════════════════════
// 辅助函数
// ═══════════════════════════════════════════

function getTimeLabel(hour) {
  if (hour < 6) return '深夜';
  if (hour < 8) return '清晨';
  if (hour < 12) return '上午';
  if (hour < 14) return '中午';
  if (hour < 18) return '下午';
  if (hour < 21) return '傍晚';
  return '晚上';
}

function inferEvents(before, after, delta, hour, agent) {
  const events = [];
  const threshold = 0.03;

  // 检测显著情绪变化
  for (const [dim, change] of Object.entries(delta)) {
    if (Math.abs(change) > threshold) {
      const direction = change > 0 ? '↑' : '↓';
      events.push({
        type: 'emotion_shift',
        dimension: dim,
        direction,
        magnitude: +Math.abs(change).toFixed(4),
      });
    }
  }

  // 检测效价翻转
  const prevV = Object.values(before).slice(0, 6).reduce((a, b) => a + b, 0) / 6;
  const currV = Object.values(after).slice(0, 6).reduce((a, b) => a + b, 0) / 6;
  if ((prevV > 0 && currV < 0) || (prevV < 0 && currV > 0)) {
    events.push({ type: 'valence_flip', from: prevV > 0 ? 'positive' : 'negative' });
  }

  // 时间上下文
  if (hour >= 0 && hour < 6) {
    events.push({ type: 'time_context', label: '深夜时段' });
  }

  return events.slice(0, 5); // 最多 5 个事件
}

// ═══════════════════════════════════════════
// 主入口
// ═══════════════════════════════════════════

function runScenario(scenarioId) {
  const scenario = SCENARIOS.find(s => s.id === scenarioId);
  if (!scenario) {
    console.error(`未知场景: ${scenarioId}`);
    console.error(`可用场景: ${SCENARIOS.map(s => s.id).join(', ')}`);
    process.exit(1);
  }

  console.log(`\n${'═'.repeat(60)}`);
  console.log(`  场景: ${scenario.name}`);
  console.log(`${'═'.repeat(60)}\n`);

  // Step 1: 生成 agents
  console.log('  1️⃣  生成 Agent...');
  const { agents, groupAssignments } = generateAgents(scenario);
  console.log(`  ✅ ${agents.length} agents`);

  // Step 2: 构建社交图谱
  console.log('  2️⃣  构建社交图谱...');
  const graph = buildSocialGraph(agents.length, scenario.graph, groupAssignments);
  console.log(`  ✅ ${graph.totalEdges} 条边`);

  // Step 3: 运行模拟
  console.log('  3️⃣  运行模拟...\n');
  const simulation = runSimulation(scenario, agents, graph);

  // Step 4: 格式化输出
  console.log('\n  4️⃣  格式化输出...');
  const output = formatOutput(scenario, agents, graph, simulation);
  console.log(`  ✅ 训练样本: ${output.trainingSamples}`);
  console.log(`  ✅ CSV 大小: ${output.csvSize}MB`);
  console.log(`  ✅ 输出目录: ${path.join(__dirname, 'output', scenario.id)}`);

  return { scenario: scenario.id, agents: agents.length, ...output, msPerTick: simulation.msPerTick };
}

module.exports = { runScenario, SCENARIOS };
