#!/usr/bin/env node
/**
 * Andy Engine 合成数据生成器
 *
 * 用法：
 *   # 运行单个场景
 *   node data_generator/run.js campus_1000
 *
 *   # 运行所有场景
 *   node data_generator/run.js all
 *
 *   # 快速测试（小规模）
 *   node data_generator/run.js personality_100
 *
 * 场景列表：
 *   campus_1000      — 大学校园 (1000 agents, 30天)
 *   company_500      — 科技公司 (500 agents, 60天)
 *   community_2000   — 社区邻里 (2000 agents, 30天)
 *   personality_100  — 极端人格对比 (100 agents, 15天)
 */

const fs = require('fs');
const path = require('path');
const { runScenario, SCENARIOS } = require('./pipeline');

const args = process.argv.slice(2);
const target = args[0] || 'personality_100'; // 默认跑小规模测试

if (target === 'help' || target === '--help') {
  console.log('\n用法: node data_generator/run.js <场景ID>\n');
  console.log('可用场景:');
  for (const s of SCENARIOS) {
    console.log(`  ${s.id.padEnd(20)} ${s.name}`);
  }
  console.log('\n  all                  运行所有场景');
  process.exit(0);
}

const outputRoot = path.join(__dirname, 'output');
if (!fs.existsSync(outputRoot)) fs.mkdirSync(outputRoot, { recursive: true });

console.log('╔═══════════════════════════════════════════════════════════╗');
console.log('║        Andy Engine 合成数据生成器                        ║');
console.log(`║  开始: ${new Date().toISOString().padEnd(47)} ║`);
console.log('╚═══════════════════════════════════════════════════════════╝');

const totalTime0 = Date.now();
const results = [];

if (target === 'all') {
  for (const scenario of SCENARIOS) {
    try {
      const result = runScenario(scenario.id);
      results.push(result);
    } catch (err) {
      console.error(`\n  ❌ ${scenario.id} 失败: ${err.message}\n`);
      results.push({ scenario: scenario.id, error: err.message });
    }
  }
} else {
  try {
    const result = runScenario(target);
    results.push(result);
  } catch (err) {
    console.error(`\n  ❌ ${target} 失败: ${err.message}\n`);
    results.push({ scenario: target, error: err.message });
  }
}

const totalElapsed = ((Date.now() - totalTime0) / 1000).toFixed(1);

// 汇总报告
console.log('\n╔═══════════════════════════════════════════════════════════╗');
console.log('║  汇总                                                    ║');
console.log('╠═══════════════════════════════════════════════════════════╣');
for (const r of results) {
  if (r.error) {
    console.log(`║  ❌ ${r.scenario}: ${r.error}`);
  } else {
    console.log(`║  ✅ ${r.scenario}: ${r.agents} agents, ${r.msPerTick}ms/tick, ${r.trainingSamples} 样本`);
  }
}
console.log(`║  总耗时: ${totalElapsed}s`);
console.log(`║  输出: ${outputRoot}`);
console.log('╚═══════════════════════════════════════════════════════════╝');

// 保存汇总
const summary = { date: new Date().toISOString(), totalElapsed, results };
fs.writeFileSync(path.join(outputRoot, 'summary.json'), JSON.stringify(summary, null, 2));
