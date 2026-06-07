/**
 * Andy Engine 第五轮实验运行器 (Round 5)
 *
 * R5 修复验证目标：
 *   1. [性能] memory tick cache → 100-agent tick 耗时下降 60%+
 *   2. [关系] 对数增长阈值 0.4→0.55 → closeFriend 层涌现
 *   3. [需求] energy decay 0.06→0.10 → 精力不再恒为 1.0
 *   4. [健康] 低压力自然恢复 → 健康不再锁死在 0.4
 *   5. [关系] 迟滞带 0.05→0.08 → 关系类型不再频繁振荡
 *
 * 使用方式：
 *   cd server/andy
 *   node experiments/run_round5.js
 *
 * 预计耗时：EXP15(31天) ~2-5min, EXP16(15天×100agent) ~5-15min,
 *           EXP17 ~2-5min, EXP18 ~3-8min, EXP19(60天) ~10-30min, EXP20 ~1-3min
 *   总计约 25-70 分钟
 */

const fs = require('fs');
const path = require('path');

const outputDir = path.join(__dirname, 'output_round5');
if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

const experiments = [
  { name: '实验 15: 社交图谱自然涌现(R5)', file: 'exp15_social_graph_r5.js' },
  { name: '实验 16: 100 Agent 规模(R5)', file: 'exp16_scale_100_r5.js' },
  { name: '实验 17: 关系生命周期深度(R5)', file: 'exp17_rel_lifecycle_r5.js' },
  { name: '实验 18: 负面效价深度探索(R5)', file: 'exp18_negative_deep_r5.js' },
  { name: '实验 19: 长期压力适应(60天,R5)', file: 'exp19_longterm_stress_r5.js' },
  { name: '实验 20: 交互瓶颈分析(R5)', file: 'exp20_encounter_bottleneck_r5.js' },
];

// R4 基线数据（用于对比）
const R4_BASELINE = {
  'exp15': {
    closeFriendLayer: 0,          // R4: 无 closeFriend
    maxStrength: 0.410,           // R4: 最大强度 0.41
    finalDensity: 1.0,            // R4: 全连接
    avgFriends: 6.7,              // R4: 平均朋友数
  },
  'exp16': {
    avgTickMs: 2447,              // R4: 平均 2447ms/tick
    medianTickMs: 170,            // R4: 中位数 170ms
    p95TickMs: 12787,             // R4: P95 12787ms
    closeFriendLayer: 0,          // R4: 无 closeFriend
    memEndMB: 161,                // R4: 结束内存 161MB
  },
  'exp19': {
    // R4: 健康在长期压力下锁死在低水平
    stressHealthLocked: true,     // R4: 健康不恢复
  },
};

console.log('═══════════════════════════════════════════════════════════');
console.log('  Andy Engine 第五轮实验（R5 修复验证）');
console.log(`  开始时间: ${new Date().toISOString()}`);
console.log(`  实验数: ${experiments.length}`);
console.log('  验证目标:');
console.log('    ✦ 性能: memory cache → tick 耗时 ↓60%+');
console.log('    ✦ 关系: 对数增长修复 → closeFriend 涌现');
console.log('    ✦ 需求: energy decay 0.10 → 精力系统正常');
console.log('    ✦ 健康: 低压力恢复 → 健康不再锁死');
console.log('    ✦ 关系: 迟滞带 0.08 → 类型稳定');
console.log('═══════════════════════════════════════════════════════════\n');

const totalTime0 = Date.now();
const allResults = {};
const summaries = [];

for (const exp of experiments) {
  console.log(`▶ ${exp.name}`);
  console.log('─────────────────────────────────────────');

  try {
    const t0 = Date.now();
    const mod = require(path.join(__dirname, exp.file));
    const result = mod.run();
    const elapsed = ((Date.now() - t0) / 1000).toFixed(1);

    // 保存原始数据
    const filename = exp.file.replace('.js', '.json');
    fs.writeFileSync(path.join(outputDir, filename), JSON.stringify(result, null, 2));
    console.log(`  ✅ 完成，数据已保存 (${elapsed}s)`);

    allResults[exp.file] = { success: true, elapsed, result };

    // 提取关键对比指标
    const summary = extractSummary(exp.file, result, elapsed);
    summaries.push(summary);
  } catch (err) {
    console.error(`  ❌ 失败: ${err.message}`);
    console.error(err.stack);
    allResults[exp.file] = { success: false, error: err.message };
    summaries.push({ name: exp.name, file: exp.file, status: 'FAILED', error: err.message });
  }
}

const totalElapsed = ((Date.now() - totalTime0) / 1000).toFixed(1);

// ─── 生成 R5 对比报告 ───
const report = generateReport(summaries, totalElapsed);
fs.writeFileSync(path.join(outputDir, 'R5_experiment_report.md'), report);

console.log('\n═══════════════════════════════════════════════════════════');
console.log(`  全部实验完成，耗时 ${totalElapsed}s`);
console.log(`  输出目录: ${outputDir}`);
console.log(`  报告: ${outputDir}/R5_experiment_report.md`);
console.log('═══════════════════════════════════════════════════════════');

// ─── 函数 ───

function extractSummary(file, result, elapsed) {
  const s = { name: file.replace('.js', ''), file, status: 'OK', elapsed };

  if (!result || !result.analysis) return s;

  const a = result.analysis;

  // EXP15: 社交图谱
  if (file.includes('exp15') && a.summary) {
    s.closeFriendLayer = a.summary.closedFriendLayerExists;
    s.maxStrength = a.summary.lastDay?.maxStrength || 0;
    s.finalDensity = a.summary.lastDay?.density || 0;
    s.avgFriends = a.summary.lastDay?.friend || 0;
    s.fullyConnected = a.summary.fullyConnected;
    // R4 对比
    s.r4_closeFriend = R4_BASELINE.exp15.closeFriendLayer;
    s.r4_maxStrength = R4_BASELINE.exp15.maxStrength;
  }

  // EXP16: 性能
  if (file.includes('exp16') && a.performance) {
    s.avgTickMs = a.performance.avgMs;
    s.medianTickMs = a.performance.medianMs;
    s.p95TickMs = a.performance.p95Ms;
    s.memEndMB = a.performance.memEndMB;
    s.perfImprovement = R4_BASELINE.exp16.avgTickMs > 0
      ? Math.round((1 - a.performance.avgMs / R4_BASELINE.exp16.avgTickMs) * 100)
      : null;
    // 网络
    if (a.network) {
      const last = a.network.densityEvolution?.slice(-1)[0];
      s.closeFriendLayer = last?.avgCF > 0;
      s.avgFriends = last?.avgF || 0;
    }
  }

  // EXP17: 关系生命周期
  if (file.includes('exp17') && a.timeline) {
    const formed = Object.values(a.timeline).filter(v => !v.neverFormed);
    s.relationshipsFormed = formed.length;
    s.typeDist = a.strengthDistribution;
    s.degradationEvents = a.degradationEvents?.length || 0;
    // 检查 closeFriend
    const hasClose = formed.some(v => v.finalType === 'closeFriend');
    s.closeFriendLayer = hasClose;
    s.maxFinalStrength = Math.max(...formed.map(v => v.finalStrength), 0);
  }

  // EXP18: 负面效价
  if (file.includes('exp18') && a['E_孤独高N']) {
    s.scenarios = {};
    for (const [key, stats] of Object.entries(a)) {
      if (stats && stats.meanValence !== undefined) {
        s.scenarios[key] = {
          mean: stats.meanValence,
          negRate: stats.negativeRate,
          deepNegRate: stats.deeplyNegativeRate,
        };
      }
    }
  }

  // EXP19: 长期压力
  if (file.includes('exp19') && a.dailyValence) {
    s.adaptation = a.adaptation;
    // 健康趋势
    if (a.healthTrend) {
      const stressHealth = a.healthTrend['压力'];
      if (stressHealth) {
        const days = Object.keys(stressHealth).map(Number).sort((a, b) => a - b);
        s.healthEarly = stressHealth[days[0]];
        s.healthMid = stressHealth[Math.floor(days.length / 2)];
        s.healthLate = stressHealth[days[days.length - 1]];
        // 检查是否恢复（后期 > 中期 → 恢复了）
        s.healthRecovered = s.healthLate > s.healthMid + 0.02;
      }
    }
  }

  // EXP20: 交互瓶颈
  if (file.includes('exp20') && a.encounterCounts) {
    s.totalPairs = a.totalPairs;
    s.formedPairs = a.formedPairs;
    s.neverMetCount = a.neverMetCount;
  }

  return s;
}

function generateReport(summaries, totalElapsed) {
  const lines = [];
  const now = new Date().toISOString();

  lines.push('# Andy Engine 第五轮实验报告 (Round 5)');
  lines.push('');
  lines.push(`> 生成日期: ${now}`);
  lines.push('');
  lines.push('---');
  lines.push('');
  lines.push('## 一、概述');
  lines.push('');
  lines.push('### 1.1 R5 修复内容');
  lines.push('');
  lines.push('| 修复项 | 影响模块 | 预期效果 |');
  lines.push('|--------|----------|----------|');
  lines.push('| memory tick-level LRU cache | PersonalMemory.js | 100-agent tick 耗时 ↓60%+ |');
  lines.push('| Appraisal._evalSuddenness O(1) | Appraisal.js | 消除 O(500) 遍历 |');
  lines.push('| 关系对数增长阈值 0.4→0.55 | Relationship.js | closeFriend 层涌现 |');
  lines.push('| 迟滞带 0.05→0.08 | Relationship.js, SocialGraph.js | 关系类型稳定 |');
  lines.push('| energy decay 0.06→0.10 | defaults.js, config.rs | 精力系统正常衰减 |');
  lines.push('| 去除区域精力恢复 | NeedsSystem.js | 防止精力恒为 1.0 |');
  lines.push('| 低压力健康恢复 | Agent.js | 健康不再锁死在 0.4 |');
  lines.push('');
  lines.push('### 1.2 实验总览');
  lines.push('');
  lines.push(`| 实验 | 状态 | 耗时 |`);
  lines.push(`|------|------|------|`);
  for (const s of summaries) {
    lines.push(`| ${s.name} | ${s.status === 'OK' ? '✅' : '❌'} | ${s.elapsed || '-'}s |`);
  }
  lines.push(`| **总计** | | **${totalElapsed}s** |`);
  lines.push('');
  lines.push('---');
  lines.push('');

  // EXP15
  const s15 = summaries.find(s => s.file?.includes('exp15'));
  if (s15 && s15.status === 'OK') {
    lines.push('## 二、EXP15 — 社交图谱自然涌现');
    lines.push('');
    lines.push('| 指标 | R4 | R5 | 变化 |');
    lines.push('|------|-----|-----|------|');
    lines.push(`| closeFriend层 | ${s15.r4_closeFriend ? '有' : '无'} | ${s15.closeFriendLayer ? '✅ 有' : '❌ 无'} | ${s15.closeFriendLayer ? '已修复' : '仍缺失'} |`);
    lines.push(`| 最大关系强度 | ${s15.r4_maxStrength} | ${s15.maxStrength || '-'} | ${(s15.maxStrength || 0) > s15.r4_maxStrength ? '↑' : '↓'} |`);
    lines.push(`| 最终密度 | ${R4_BASELINE.exp15.finalDensity} | ${s15.finalDensity || '-'} | ${s15.fullyConnected ? '保持连通' : '结构化'} |`);
    lines.push(`| 平均朋友数 | ${R4_BASELINE.exp15.avgFriends} | ${s15.avgFriends || '-'} | |`);
    lines.push('');
  }

  // EXP16
  const s16 = summaries.find(s => s.file?.includes('exp16'));
  if (s16 && s16.status === 'OK') {
    lines.push('## 三、EXP16 — 100 Agent 规模测试');
    lines.push('');
    lines.push('### 性能对比');
    lines.push('');
    lines.push('| 指标 | R4 | R5 | 改善 |');
    lines.push('|------|-----|-----|------|');
    lines.push(`| 平均tick耗时 | ${R4_BASELINE.exp16.avgTickMs}ms | ${s16.avgTickMs ? Math.round(s16.avgTickMs) + 'ms' : '-'} | ${s16.perfImprovement !== null ? (s16.perfImprovement > 0 ? '↓' + s16.perfImprovement + '%' : '↑' + Math.abs(s16.perfImprovement) + '%') : '-'} |`);
    lines.push(`| 中位数tick | ${R4_BASELINE.exp16.medianTickMs}ms | ${s16.medianTickMs ? Math.round(s16.medianTickMs) + 'ms' : '-'} | |`);
    lines.push(`| P95 tick | ${R4_BASELINE.exp16.p95TickMs}ms | ${s16.p95TickMs ? Math.round(s16.p95TickMs) + 'ms' : '-'} | |`);
    lines.push(`| 结束内存 | ${R4_BASELINE.exp16.memEndMB}MB | ${s16.memEndMB || '-'}MB | ${s16.memEndMB ? (s16.memEndMB < R4_BASELINE.exp16.memEndMB ? '↓' : '↑') : '-'} |`);
    lines.push(`| closeFriend层 | 无 | ${s16.closeFriendLayer ? '✅ 有' : '❌ 无'} | |`);
    lines.push('');
  }

  // EXP17
  const s17 = summaries.find(s => s.file?.includes('exp17'));
  if (s17 && s17.status === 'OK') {
    lines.push('## 四、EXP17 — 关系生命周期深度');
    lines.push('');
    lines.push(`- 关系形成: ${s17.relationshipsFormed || '-'} 条`);
    lines.push(`- closeFriend 层: ${s17.closeFriendLayer ? '✅ 存在' : '❌ 未出现'}`);
    lines.push(`- 最大最终强度: ${s17.maxFinalStrength || '-'}`);
    lines.push(`- 降级事件: ${s17.degradationEvents || 0} 个`);
    if (s17.typeDist) {
      lines.push(`- 强度分布: ${JSON.stringify(s17.typeDist)}`);
    }
    lines.push('');
  }

  // EXP18
  const s18 = summaries.find(s => s.file?.includes('exp18'));
  if (s18 && s18.status === 'OK' && s18.scenarios) {
    lines.push('## 五、EXP18 — 负面效价深度探索');
    lines.push('');
    lines.push('| 场景 | 均值效价 | 负面率 | 深度负面率 |');
    lines.push('|------|----------|--------|------------|');
    for (const [key, stats] of Object.entries(s18.scenarios)) {
      lines.push(`| ${key} | ${stats.mean} | ${(stats.negRate * 100).toFixed(1)}% | ${(stats.deepNegRate * 100).toFixed(1)}% |`);
    }
    lines.push('');
  }

  // EXP19
  const s19 = summaries.find(s => s.file?.includes('exp19'));
  if (s19 && s19.status === 'OK') {
    lines.push('## 六、EXP19 — 长期压力适应(60天)');
    lines.push('');
    if (s19.adaptation) {
      lines.push(`- 压力稳态: ${s19.adaptation.stableDay ? 'D' + s19.adaptation.stableDay : '未达到'}`);
      lines.push(`- 稳态效价: ${s19.adaptation.stableValence || '-'}`);
      lines.push(`- 基线均值: ${s19.adaptation.baseValence || '-'}`);
    }
    lines.push(`- 健康早期: ${s19.healthEarly || '-'}`);
    lines.push(`- 健康中期: ${s19.healthMid || '-'}`);
    lines.push(`- 健康晚期: ${s19.healthLate || '-'}`);
    lines.push(`- 健康恢复: ${s19.healthRecovered ? '✅ 是（R5 修复生效）' : '❌ 否'}`);
    lines.push('');
  }

  // EXP20
  const s20 = summaries.find(s => s.file?.includes('exp20'));
  if (s20 && s20.status === 'OK') {
    lines.push('## 七、EXP20 — 交互瓶颈分析');
    lines.push('');
    lines.push(`- 总 Agent 对: ${s20.totalPairs || '-'}`);
    lines.push(`- 形成关系对: ${s20.formedPairs || '-'}`);
    lines.push(`- 从未共处: ${s20.neverMetCount || '-'}`);
    lines.push('');
  }

  // 总结
  lines.push('---');
  lines.push('');
  lines.push('## 八、R5 修复验证总结');
  lines.push('');
  lines.push('| 修复项 | 验证实验 | 结果 |');
  lines.push('|--------|----------|------|');

  // 性能
  const perfOk = s16 && s16.perfImprovement !== null && s16.perfImprovement > 30;
  lines.push(`| 性能(memory cache) | EXP16 | ${perfOk ? '✅ tick 耗时 ↓' + s16.perfImprovement + '%' : (s16?.perfImprovement !== null ? '⚠️ 仅 ↓' + s16.perfImprovement + '%' : '❌ 数据缺失')} |`);

  // closeFriend
  const cfOk = (s15?.closeFriendLayer) || (s16?.closeFriendLayer) || (s17?.closeFriendLayer);
  lines.push(`| closeFriend 涌现 | EXP15/16/17 | ${cfOk ? '✅ 存在' : '❌ 未出现'} |`);

  // 关系强度
  const strOk = s15 && s15.maxStrength > 0.55;
  lines.push(`| 关系强度上限 | EXP15 | ${strOk ? '✅ max > 0.55' : (s15?.maxStrength ? '⚠️ max=' + s15.maxStrength : '❌ 数据缺失')} |`);

  // 健康恢复
  const healthOk = s19?.healthRecovered;
  lines.push(`| 健康恢复 | EXP19 | ${healthOk ? '✅ 压力场景健康恢复' : '❌ 未恢复'} |`);

  // 负面效价
  const negOk = s18?.scenarios?.['E_孤独高N']?.mean < 0;
  lines.push(`| 负面效价 | EXP18 | ${negOk ? '✅ 孤独高N 场景均值 < 0' : '❌ 效价偏正'} |`);

  lines.push('');
  lines.push('---');
  lines.push(`*报告由 run_round5.js 自动生成*`);

  return lines.join('\n');
}
