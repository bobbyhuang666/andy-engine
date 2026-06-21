#!/usr/bin/env node
/**
 * Phase 6c: 人格对比实验
 *
 * 验证：同一情境下，不同人格的行为轨迹有统计显著差异。
 * 这是 BehaviorField 的核心价值主张——人格通过势能面形状直接表达行为倾向。
 *
 * 运行：node experiments/behavior_field_personality.js
 */

const AndyEngine = require('../index');
const { BehaviorField } = require('../src/agent/psychology/BehaviorField');
const { STATE_CENTERS, STATE_NAMES, DIMS } = require('../src/agent/psychology/BehaviorLabeler');

// ═══════════════════════════════════════════
// 实验配置
// ═══════════════════════════════════════════

const PERSONALITIES = [
  { mbti: 'INFP', label: 'INFP (内向/直觉/情感/知觉)', expect: '低活动、低社交、高情绪敏感' },
  { mbti: 'ESTP', label: 'ESTP (外向/实感/思维/知觉)', expect: '高活动、高社交、低惯性' },
  { mbti: 'ISTJ', label: 'ISTJ (内向/实感/思维/判断)', expect: '高日程遵守、高习惯性' },
  { mbti: 'ENFP', label: 'ENFP (外向/直觉/情感/知觉)', expect: '高探索、高噪声、社交活跃' },
];

const TICKS = 200;
const START_TIME = new Date('2025-06-01T08:00:00');

// ═══════════════════════════════════════════
// 实验运行
// ═══════════════════════════════════════════

function runExperiment() {
  console.log('╔══════════════════════════════════════════════════╗');
  console.log('║  Phase 6c: 人格对比实验                          ║');
  console.log('╚══════════════════════════════════════════════════╝\n');

  const results = {};

  for (const p of PERSONALITIES) {
    const engine = new AndyEngine({ startTime: START_TIME, weather: 'sunny' });
    engine.createCharacter({
      id: p.mbti.toLowerCase(),
      name: p.label.split(' ')[0],
      mbti: p.mbti,
      schedule: 'student',
    });

    const agent = engine.getAgent(p.mbti.toLowerCase());
    const trajectory = [];

    for (let i = 0; i < TICKS; i++) {
      engine.tick();
      trajectory.push({
        tick: i,
        B: [...agent.behaviorField.B],
        label: agent.behaviorField.label,
        speed: agent.behaviorField.speed,
      });
    }

    // 统计分析
    const stats = analyzeTrajectory(trajectory, p);
    results[p.mbti] = stats;

    console.log(`── ${p.label} ──`);
    console.log(`  期望: ${p.expect}`);
    console.log(`  γ (摩擦): ${agent.behaviorField.gamma.toFixed(2)}`);
    console.log(`  σ (噪声): ${agent.behaviorField.sigma.toFixed(3)}`);
    console.log(`  B 均值: [${stats.meanB.map(v => v.toFixed(3)).join(', ')}]`);
    console.log(`  B 标准差: [${stats.stdB.map(v => v.toFixed(3)).join(', ')}]`);
    console.log(`  平均速度: ${stats.avgSpeed.toFixed(4)}`);
    console.log(`  标签分布: ${Object.entries(stats.labelCounts).sort((a,b) => b[1]-a[1]).slice(0,5).map(([k,v]) => `${k}(${v})`).join(', ')}`);
    console.log(`  标签种类: ${stats.uniqueLabels}`);
    console.log('');
  }

  // 跨人格比较
  console.log('═══════════════════════════════════════════');
  console.log('跨人格差异分析\n');

  const mbtis = Object.keys(results);
  for (let i = 0; i < mbtis.length; i++) {
    for (let j = i + 1; j < mbtis.length; j++) {
      const a = results[mbtis[i]];
      const b = results[mbtis[j]];
      const bDist = euclideanDist(a.meanB, b.meanB);
      const speedRatio = Math.max(a.avgSpeed, b.avgSpeed) / Math.max(0.001, Math.min(a.avgSpeed, b.avgSpeed));
      console.log(`  ${mbtis[i]} vs ${mbtis[j]}: B距离=${bDist.toFixed(3)}, 速度比=${speedRatio.toFixed(2)}×`);
    }
  }

  // 统计显著性检验（简化版：比较 B 向量的各维度均值差异）
  console.log('\n═══════════════════════════════════════════');
  console.log('结论\n');

  const dimNames = ['activity', 'sociality', 'focus', 'expressiveness'];
  let maxDiffDim = 0;
  let maxDiffVal = 0;

  for (let d = 0; d < DIMS; d++) {
    const values = mbtis.map(m => results[m].meanB[d]);
    const range = Math.max(...values) - Math.min(...values);
    if (range > maxDiffVal) {
      maxDiffVal = range;
      maxDiffDim = d;
    }
  }

  console.log(`  最大差异维度: ${dimNames[maxDiffDim]} (范围=${maxDiffVal.toFixed(3)})`);
  console.log(`  判定: ${maxDiffVal > 0.08 ? '✅ 人格差异显著' : maxDiffVal > 0.04 ? '⚠️ 差异中等' : '❌ 差异不显著'}`);

  // 检查速度差异
  const speeds = mbtis.map(m => results[m].avgSpeed);
  const speedRange = Math.max(...speeds) - Math.min(...speeds);
  console.log(`  速度差异: ${speedRange.toFixed(4)} (高外向 vs 低外向)`);
  console.log(`  判定: ${speedRange > 0.02 ? '✅ 惯性差异显著' : '⚠️ 惯性差异较小'}`);
}

// ═══════════════════════════════════════════
// 统计分析
// ═══════════════════════════════════════════

function analyzeTrajectory(trajectory, personality) {
  const n = trajectory.length;
  const meanB = [0, 0, 0, 0];
  const meanBSq = [0, 0, 0, 0];
  let totalSpeed = 0;
  const labelCounts = {};

  for (const t of trajectory) {
    for (let d = 0; d < DIMS; d++) {
      meanB[d] += t.B[d];
      meanBSq[d] += t.B[d] ** 2;
    }
    totalSpeed += t.speed;
    labelCounts[t.label] = (labelCounts[t.label] || 0) + 1;
  }

  for (let d = 0; d < DIMS; d++) {
    meanB[d] /= n;
    meanBSq[d] /= n;
  }

  const stdB = meanB.map((m, d) => Math.sqrt(Math.max(0, meanBSq[d] - m ** 2)));

  return {
    meanB,
    stdB,
    avgSpeed: totalSpeed / n,
    labelCounts,
    uniqueLabels: Object.keys(labelCounts).length,
  };
}

function euclideanDist(a, b) {
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += (a[i] - b[i]) ** 2;
  return Math.sqrt(sum);
}

runExperiment();
