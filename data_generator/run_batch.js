#!/usr/bin/env node
/**
 * Andy Engine 批量数据生成 — 每场景独立进程
 *
 * 解决 macOS Jetsam 杀进程问题：每个场景单独起一个 Node.js 进程，
 * 进程退出时所有内存（包括 Rust 原生内存）完全释放。
 *
 * 用法：
 *   RAYON_NUM_THREADS=2 node data_generator/run_batch.js
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const outputRoot = path.join(__dirname, 'output');
const logFile = path.join(__dirname, 'batch.log');
const logStream = fs.createWriteStream(logFile, { flags: 'a' });

function log(msg) {
  const ts = new Date().toISOString().slice(11, 19);
  const line = `[${ts}] ${msg}`;
  console.log(line);
  logStream.write(line + '\n');
}

// ═══════════════════════════════════════════
// 场景列表
// ═══════════════════════════════════════════

const SCENARIOS = [];

// Phase 1: 中等规模
SCENARIOS.push({ id: 'mega_5k_30d', numAgents: 5000, durationDays: 30, sampleInterval: 24, k: 20, rewireProb: 0.15 });

// Phase 2: 多随机种子
for (let seed = 0; seed < 50; seed++) {
  SCENARIOS.push({
    id: `campus_2k_seed${String(seed).padStart(3, '0')}`,
    numAgents: 2000, durationDays: 15, sampleInterval: 12,
    k: 18 + Math.floor(Math.random() * 6), rewireProb: 0.10 + Math.random() * 0.15,
  });
}

// Phase 3: 年度
SCENARIOS.push({ id: 'yearlong_3k', numAgents: 3000, durationDays: 365, sampleInterval: 24, k: 20, rewireProb: 0.12 });

// Phase 4: 极端人格
for (let seed = 0; seed < 10; seed++) {
  SCENARIOS.push({
    id: `extreme_seed${String(seed).padStart(3, '0')}`,
    numAgents: 200, durationDays: 15, sampleInterval: 4,
    k: 15, rewireProb: 0.20, extreme: true,
  });
}

// ═══════════════════════════════════════════
// 执行
// ═══════════════════════════════════════════

log(`批量生成启动: ${SCENARIOS.length} 个场景`);
const t0 = Date.now();
let success = 0, fail = 0, totalDataPoints = 0;

for (let i = 0; i < SCENARIOS.length; i++) {
  const s = SCENARIOS[i];
  log(`\n[${i + 1}/${SCENARIOS.length}] ${s.id}`);

  const configJson = JSON.stringify(s);
  const cmd = `RAYON_NUM_THREADS=2 node --expose-gc ${path.join(__dirname, 'run_single.js')} '${configJson.replace(/'/g, "'\\''")}'`;

  try {
    const result = execSync(cmd, {
      encoding: 'utf-8',
      timeout: 300000, // 5min per scenario max
      maxBuffer: 10 * 1024 * 1024,
      cwd: path.join(__dirname, '..'),
      env: { ...process.env, RAYON_NUM_THREADS: '2' },
    });

    // 解析输出
    const lines = result.trim().split('\n');
    const lastLine = lines[lines.length - 1];
    try {
      const r = JSON.parse(lastLine);
      log(`  ✅ ${r.dataPoints?.toLocaleString() || 0} 数据点, ${r.msPerTick}ms/tick, ${r.totalTime}s`);
      success++;
      totalDataPoints += r.dataPoints || 0;
    } catch {
      log(`  ✅ 完成 (输出: ${lines.length} 行)`);
      success++;
    }
  } catch (err) {
    log(`  ❌ 失败: ${err.message?.slice(0, 200)}`);
    fail++;
  }

  // 进度汇报
  if ((i + 1) % 10 === 0 || i === SCENARIOS.length - 1) {
    const elapsed = ((Date.now() - t0) / 1000 / 60).toFixed(1);
    log(`\n📊 进度: ${i + 1}/${SCENARIOS.length}, ${elapsed}min, 成功${success} 失败${fail}, ${(totalDataPoints / 1e6).toFixed(0)}M 数据点`);
  }
}

const totalElapsed = ((Date.now() - t0) / 1000).toFixed(1);

log(`\n${'═'.repeat(60)}`);
log(`✅ 完成: ${success}/${SCENARIOS.length} 成功, ${fail} 失败`);
log(`📊 总数据点: ${(totalDataPoints / 1e6).toFixed(0)}M`);
log(`⏱  总耗时: ${(totalElapsed / 60).toFixed(1)} 分钟`);
log(`${'═'.repeat(60)}`);

// 保存汇总
fs.writeFileSync(path.join(outputRoot, 'batch_summary.json'), JSON.stringify({
  date: new Date().toISOString(), totalElapsed, totalDataPoints,
  success, fail, total: SCENARIOS.length,
}, null, 2));

logStream.end();
