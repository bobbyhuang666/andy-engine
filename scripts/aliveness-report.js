#!/usr/bin/env node

/**
 * Aliveness Report Generator (ALIVENESS_BENCHMARK_RFC v0.3 §3)
 *
 * 跑测试命令捕获输出 → 按七维提取证据 → 产 markdown 报告。
 * 每维度含标准/测试入口/输出引用/owner/状态。
 * 禁止手写"已达标"——状态必须从测试输出和 checked-in quality report 提取。
 *
 * Usage: node scripts/aliveness-report.js [--write]
 *   --write  生成/更新 docs/quality/aliveness-report.md
 *   默认仅打印报告到 stdout。
 */

const { spawnSync } = require('child_process');
const { writeFileSync } = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

// ─── 七维配置 ───

const DIMENSIONS = [
  {
    id: 'D1',
    name: 'World Persistence',
    standard: '世界状态可序列化→反序列化→续跑，结构无损。',
    entry: 'tests/unit/persistence-trust.test.js (G1/G2/G3/G6) + golden-seed-replay L1-L4 + tests/unit/replay-trust-l4.test.js',
    owner: 'store 层',
    // RFC W5 / Patch E: removed hardcoded `special: 'Pass'` — the D1 judge
    // below already checks persistence-trust + golden-seed-replay + replay-trust-l4
    // from real test output. The special short-circuit bypassed that check,
    // allowing D1 to Pass without live evidence (fail-open).
  },
  {
    id: 'D2',
    name: 'Character Continuity',
    standard: '4 子指标全 Pass：memory continuity / need trajectory / relationship continuity / personality-BehaviorField stability。',
    entry: 'tests/unit/serialization-roundtrip.test.js + tests/unit/golden-seed-replay.test.js',
    owner: 'agent memory/psychology/social 层',
  },
  {
    id: 'D3',
    name: 'Epistemic Correctness',
    standard: 'AGENT_STATE 视为私有知识；其他 agent 仅凭 direct/observed/told/inferred 证据获知。',
    entry: 'tests/e2e/alice-bob-epistemic-boundary.test.js + tests/e2e/epistemic-evidence-matrix.test.js',
    owner: 'knowledge 层',
  },
  {
    id: 'D4',
    name: 'Causal Consequence Writeback',
    standard: 'world-changing event 产生 typed delta；observation/narrative-only event 显式分类并说明无写回原因。',
    entry: 'tests/unit/effects/ (含 position-delta.test.js) + golden seed replay',
    owner: 'effects 层',
  },
  {
    id: 'D5',
    name: 'Grounded Narrative Faithfulness',
    standard: '公开 synthetic checker 与真实 LLM outcome 分层报告；synthetic pass 不得升级 real-LLM 状态。',
    entry: 'tests/unit/narrative/grounding-smoke.test.js + tests/unit/narrative/grounding/',
    owner: 'narrative 层',
  },
  {
    id: 'D6',
    name: 'Multi-Agent Social Emergence',
    standard: 'triadic closure, Dunbar differentiation, emotion contagion convergence, gossip 2-hop, serialization fidelity.',
    entry: 'tests/e2e/social-emergence.test.js + tests/e2e/gossip-propagation.test.js + tests/e2e/emotion-contagion-cluster.test.js',
    owner: 'social 层',
  },
  {
    id: 'D7',
    name: 'Domain Portability',
    standard: '同一 engine 跑 campus/tavern/自定义 domain，core src 不含具体世界词。',
    entry: 'npm run test:domain + tests/compatibility.test.js',
    owner: 'domain 层',
  },
];

// ─── 测试命令执行 ───

function runCommand(cmd, args, timeoutMs = 120000) {
  const result = spawnSync(cmd, args, {
    cwd: ROOT,
    encoding: 'utf-8',
    timeout: timeoutMs,
    shell: process.platform === 'win32',
  });
  return {
    stdout: result.stdout || '',
    stderr: result.stderr || '',
    status: result.status,
    combined: (result.stdout || '') + (result.stderr || ''),
  };
}

// ─── 输出解析 ───

/**
 * RFC W5 / Patch E: prefer Vitest JSON reporter for precise file/test ID
 * extraction. Falls back to verbose-text parsing if JSON is unavailable.
 */
function parseVitestJSON(jsonStr) {
  let j;
  try { j = JSON.parse(jsonStr); } catch { return null; }
  const fileResults = [];
  for (const tr of (j.testResults || [])) {
    // tr.name is the absolute file path; normalize to tests/.../file.test.js
    const rel = tr.name.replace(/.*\/(tests\/)/, '$1');
    let fileStatus = 'pass';
    for (const a of (tr.assertionResults || [])) {
      if (a.status === 'failed') fileStatus = 'fail';
    }
    fileResults.push({ file: rel, status: fileStatus });
  }
  const testFilesLine = `Test Files ${j.numPassedTestSuites || 0} passed`;
  const testsLine = `Tests ${j.numPassedTests || 0} passed | ${j.numFailedTests || 0} failed | ${(j.numPendingTests || 0) + (j.numTodoTests || 0)} skipped`;
  return { testFilesLine, testsLine, fileResults };
}

function parseVitestOutput(output) {
  // 提取 Test Files / Tests 计数行
  const lines = output.split('\n');
  let testFilesLine = '';
  let testsLine = '';
  const fileResults = []; // { file, status }
  const seenFiles = new Set();
  for (const line of lines) {
    const tfMatch = line.match(/Test Files\s+(\d+)\s+passed/);
    if (tfMatch) testFilesLine = line.trim();
    const tMatch = line.match(/Tests\s+(\d+)\s+passed/);
    if (tMatch) testsLine = line.trim();
    // verbose reporter: "  ✓ tests/xxx/yyy.test.js > describe > test" 或 "×"/"FAIL"
    // 行首可能有空格（vitest 缩进）
    const fr = line.match(/^\s*([✓×])\s+(tests\/\S+\.test\.js)/);
    if (fr) {
      const file = fr[2];
      if (!seenFiles.has(file)) {
        seenFiles.add(file);
        fileResults.push({ status: fr[1] === '✓' ? 'pass' : 'fail', file });
      } else if (fr[1] === '×') {
        // 已记录为 pass 但出现 fail，更新为 fail
        const existing = fileResults.find(f => f.file === file);
        if (existing) existing.status = 'fail';
      }
    }
    // 兜底：FAIL 标记行
    if (line.includes('FAIL') && line.includes('.test.js')) {
      const m = line.match(/(tests\/\S+\.test\.js)/);
      if (m) {
        const existing = fileResults.find(f => f.file === m[1]);
        if (existing) existing.status = 'fail';
        else if (!seenFiles.has(m[1])) {
          seenFiles.add(m[1]);
          fileResults.push({ status: 'fail', file: m[1] });
        }
      }
    }
  }
  return { testFilesLine, testsLine, fileResults };
}

function findFileStatus(parsed, fileSubstring) {
  const found = parsed.fileResults.find(f => f.file.includes(fileSubstring));
  return found ? found.status : 'not-found';
}

// ─── 状态判定 ───

function judgeDimension(dim, testParsed, domainResult, perfResult, replayResult) {
  // RFC W5 / Patch E: removed `special` short-circuit that bypassed real
  // test evidence. All dimensions now derive status from test output.

  if (dim.id === 'D5') {
    const smokeStatus = findFileStatus(testParsed, 'grounding-smoke');
    if (smokeStatus === 'fail') return 'Gap';
    // Public synthetic coverage cannot establish real-LLM faithfulness.
    // D5 remains Warning until the private held-out evaluation is complete.
    return 'Warning';
  }

  // D7: domain gate + declared compatibility test (entry:
  // 'npm run test:domain + tests/compatibility.test.js'). Both must pass.
  // compatibility missing from test results → Warning (never Pass).
  if (dim.id === 'D7') {
    if (domainResult.status !== 0) return 'Gap';
    const compatStatus = findFileStatus(testParsed, 'compatibility');
    if (compatStatus === 'fail') return 'Gap';
    if (compatStatus !== 'pass') return 'Warning';
    return 'Pass';
  }

  // D1: persistence-trust + replay L1-L4 + replay-trust-l4
  if (dim.id === 'D1') {
    const ptStatus = findFileStatus(testParsed, 'persistence-trust');
    const gsrStatus = findFileStatus(testParsed, 'golden-seed-replay');
    const l4Status = findFileStatus(testParsed, 'replay-trust-l4');
    // v2.2-W1: L4 达标，全部 pass 即 Pass
    if (ptStatus === 'pass' && gsrStatus === 'pass' && l4Status === 'pass') return 'Pass';
    return 'Gap';
  }

  // D4: effects 目录全绿 + 声明入口中的 golden seed replay（entry:
  // 'tests/unit/effects/ (含 position-delta.test.js) + golden seed replay'）。
  // 两者缺一不可：golden replay 缺失/未参跑 → Warning（不得 Pass）。
  if (dim.id === 'D4') {
    const effectsFiles = testParsed.fileResults.filter(f => f.file.includes('tests/unit/effects/'));
    if (effectsFiles.length === 0) return 'Gap';
    if (effectsFiles.some(f => f.status === 'fail')) return 'Gap';
    const gsrStatus = findFileStatus(testParsed, 'golden-seed-replay');
    if (gsrStatus === 'fail') return 'Gap';
    if (gsrStatus !== 'pass') return 'Warning';
    return 'Pass';
  }

  // D3: 入口包含两个 E2E 文件，两者都须 pass
  if (dim.id === 'D3') {
    const epistemicStatus = findFileStatus(testParsed, 'alice-bob-epistemic-boundary');
    const matrixStatus = findFileStatus(testParsed, 'epistemic-evidence-matrix');
    if (epistemicStatus === 'pass' && matrixStatus === 'pass') return 'Pass';
    if (epistemicStatus === 'fail' || matrixStatus === 'fail') return 'Gap';
    return 'Warning';
  }

  // D6: social emergence E2E — all 3 test files must pass (must be before generic path)
  if (dim.id === 'D6') {
    const socialStatus = findFileStatus(testParsed, 'social-emergence');
    const gossipStatus = findFileStatus(testParsed, 'gossip-propagation');
    const contagionStatus = findFileStatus(testParsed, 'emotion-contagion-cluster');
    if (socialStatus === 'pass' && gossipStatus === 'pass' && contagionStatus === 'pass') return 'Pass';
    if (socialStatus === 'fail' || gossipStatus === 'fail' || contagionStatus === 'fail') return 'Gap';
    return 'Warning';
  }

  // 通用：测试入口在 npm test 输出 pass。RFC W5 / Patch E: check ALL
  // entry files (not just the first). Previously entryTokens[0] was the
  // only one checked, so D2 (entry = 2 files) passed if just the first was
  // green — fail-open. Now all entry files must be 'pass'.
  const entryTokens = dim.entry.match(/tests\/[^\s)]+\.test\.js/g) || [];
  if (entryTokens.length > 0) {
    const statuses = entryTokens.map(tf => {
      const frag = tf.split('/').pop().replace('.test.js', '');
      return findFileStatus(testParsed, frag);
    });
    // fail-closed: any fail → Gap; any not-found/missing → Warning (never Pass);
    // all pass → Pass (or Warning if warningNote set).
    if (statuses.some(s => s === 'fail')) return 'Gap';
    if (statuses.some(s => s === 'not-found')) return 'Warning';
    if (statuses.every(s => s === 'pass')) {
      return dim.warningNote ? 'Warning' : 'Pass';
    }
    // Mixed (e.g. some pass + some not-found) → Warning
    return 'Warning';
  }

  return 'Warning';
}

// ─── 报告渲染 ───

function mdCell(value) {
  return String(value ?? '')
    .replace(/\r?\n/g, ' ')
    .replace(/\|/g, '\\|');
}

function renderReport(dimensions, testParsed, domainResult, perfResult, replayResult, generatedAt) {
  const lines = [];
  lines.push('# Aliveness Report');
  lines.push('');
  lines.push(`> 生成时间: ${generatedAt} | 由 scripts/aliveness-report.js 从测试输出提取（非手写状态表）。`);
  lines.push('> ALIVENESS_BENCHMARK_RFC v0.3 §3 报告制度。每次 release 重新生成。');
  lines.push('');
  lines.push('## 测试命令快照');
  lines.push('');
  lines.push('| 命令 | 退出码 | 关键输出 |');
  lines.push('|---|---|---|');
  lines.push(`| npm test | ${testParsed.testFilesLine ? '0' : '?'} | ${mdCell(`${testParsed.testFilesLine} / ${testParsed.testsLine}`)} |`);
  lines.push(`| npm run test:domain | ${domainResult.status} | ${mdCell(domainResult.stdout.split('\n').filter(l => l.match(/Tests|Test Files/)).join(' / ') || '(见完整输出)')} |`);
  lines.push(`| npm run perf:check | ${perfResult.status} | ${mdCell(perfResult.stdout.split('\n').filter(l => l.includes('PASS') || l.includes('performance checks')).join(' / ') || '(见完整输出)')} |`);
  lines.push(`| npm run replay:diff | ${replayResult.status} | ${mdCell(replayResult.stdout.split('\n').filter(l => l.includes('matched') || l.includes('mismatched')).join(' / ') || '(见完整输出)')} |`);
  lines.push('');
  lines.push('## 七维度状态');
  lines.push('');

  for (const dim of dimensions) {
    const status = judgeDimension(dim, testParsed, domainResult, perfResult, replayResult);
    lines.push(`### ${dim.id} ${dim.name} — ${status}`);
    lines.push('');
    lines.push(`- **标准**: ${dim.standard}`);
    lines.push(`- **测试入口**: ${dim.entry}`);
    lines.push(`- **Owner**: ${dim.owner}`);
    if (dim.warningNote) {
      lines.push(`- **Warning 条件**: ${dim.warningNote}`);
    }
    // 测试输出引用（防手写状态表）
    if (dim.id === 'D7') {
      lines.push(`- **测试输出引用**: test:domain exit ${domainResult.status}`);
    } else if (dim.id === 'D5') {
      const smokeStatus = findFileStatus(testParsed, 'grounding-smoke');
      const syntheticStatus = smokeStatus === 'pass'
        ? 'Pass'
        : smokeStatus === 'fail'
          ? 'Gap'
          : 'Not verified';
      lines.push(`- **公开 synthetic checker**: ${syntheticStatus}（grounding-smoke ${smokeStatus}）`);
      lines.push('- **真实 LLM outcome**: Warning / not evaluated（尚未完成私有 held-out 双 provider 评测）');
    } else if (dim.id === 'D1') {
      const ptStatus = findFileStatus(testParsed, 'persistence-trust');
      const gsrStatus = findFileStatus(testParsed, 'golden-seed-replay');
      const l4Status = findFileStatus(testParsed, 'replay-trust-l4');
      lines.push(`- **测试输出引用**: persistence-trust ${ptStatus} / golden-seed-replay ${gsrStatus} / replay-trust-l4 ${l4Status} / replay:diff exit ${replayResult.status}`);
    } else if (dim.id === 'D3') {
      const epistemicStatus = findFileStatus(testParsed, 'alice-bob-epistemic-boundary');
      const matrixStatus = findFileStatus(testParsed, 'epistemic-evidence-matrix');
      lines.push(`- **测试输出引用**: alice-bob-epistemic-boundary ${epistemicStatus} / epistemic-evidence-matrix ${matrixStatus}`);
    } else if (dim.id === 'D4') {
      const effectsFiles = testParsed.fileResults.filter(f => f.file.includes('tests/unit/effects/'));
      const passCount = effectsFiles.filter(f => f.status === 'pass').length;
      lines.push(`- **测试输出引用**: tests/unit/effects/ ${passCount}/${effectsFiles.length} 文件 pass`);
    } else if (dim.id === 'D6') {
      const socialStatus = findFileStatus(testParsed, 'social-emergence');
      const gossipStatus = findFileStatus(testParsed, 'gossip-propagation');
      const contagionStatus = findFileStatus(testParsed, 'emotion-contagion-cluster');
      lines.push(`- **测试输出引用**: social-emergence ${socialStatus} / gossip-propagation ${gossipStatus} / emotion-contagion-cluster ${contagionStatus}`);
    } else {
      // RFC W5 / Patch E: render all entry file statuses (not just first).
      const entryTokens = dim.entry.match(/tests\/[^\s)]+\.test\.js/g) || [];
      if (entryTokens.length > 0) {
        const parts = entryTokens.map(tf => {
          const frag = tf.split('/').pop().replace('.test.js', '');
          const fstatus = findFileStatus(testParsed, frag);
          return `${tf} ${fstatus}`;
        });
        lines.push(`- **测试输出引用**: ${parts.join(' / ')}`);
      } else {
        lines.push(`- **测试输出引用**: (入口非单一测试文件，见测试命令快照)`);
      }
    }
    lines.push('');
  }

  lines.push('## Sanity check');
  lines.push('');
  lines.push(`- **500 tick 不单调发散**: deep-audit-v2/v3 500-tick 长程稳定（${findFileStatus(testParsed, 'deep-audit-v2') === 'pass' && findFileStatus(testParsed, 'deep-audit-v3') === 'pass' ? '通过' : '未确认'}）+ golden-seed-replay 100 ticks（${findFileStatus(testParsed, 'golden-seed-replay') === 'pass' ? '通过' : '未确认'}）+ perf:check exit ${perfResult.status}`);

  return lines.join('\n') + '\n';
}

// ─── 主流程 ───

function main() {
  const args = process.argv.slice(2);
  const write = args.includes('--write');
  const generatedAt = new Date().toISOString();

  console.error('[aliveness-report] 跑 npm test (JSON reporter)...');
  // RFC W5 / Patch E: use --reporter=json for precise file/test ID extraction
  // instead of parsing human-readable verbose text (fragile to format changes).
  const testResult = runCommand('npm', ['test', '--', '--reporter=json']);
  const testParsed = parseVitestJSON(testResult.stdout) || parseVitestOutput(testResult.combined);

  console.error('[aliveness-report] 跑 npm run test:domain...');
  const domainResult = runCommand('npm', ['run', 'test:domain']);

  console.error('[aliveness-report] 跑 npm run perf:check...');
  const perfResult = runCommand('npm', ['run', 'perf:check']);

  console.error('[aliveness-report] 跑 npm run replay:diff...');
  const replayResult = runCommand('npm', ['run', 'replay:diff']);

  const report = renderReport(DIMENSIONS, testParsed, domainResult, perfResult, replayResult, generatedAt);

  if (write) {
    const reportPath = path.join(ROOT, 'docs', 'quality', 'aliveness-report.md');
    writeFileSync(reportPath, report);
    console.error(`[aliveness-report] 报告已写入: ${path.relative(ROOT, reportPath)}`);
  } else {
    process.stdout.write(report);
  }
}

if (require.main === module) {
  main();
}

module.exports = { DIMENSIONS, parseVitestOutput, judgeDimension, renderReport };
