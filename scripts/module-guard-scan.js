#!/usr/bin/env node

/**
 * Module Guard Scanner
 *
 * R5 "未守护模块"判定工具 (QUALITY_GATE_RFC v0.3 §6 主判定)。
 *
 * 静态扫描 tests 下全部 .test.js 的 require/import 字面量，解析到实际文件，
 * 递归跟踪上游 require 构建可达性集合（覆盖 transitive / facade 转发），
 * 与 src 下全部 .js（排除 native）比对，输出每模块守护状态：
 *   - guarded-direct   有测试直接 import
 *   - guarded-indirect  经上游/facade 可达但无直接测试入口
 *   - weak              可达但 coverage 0%（仅 coverage artifact 存在时判定）
 *   - unguarded         不可达 → Release blocker 候选
 *
 * Usage: node scripts/module-guard-scan.js [--write]
 *   --write  生成/更新 docs/quality/module-guard-manifest.md
 *   默认仅扫描并打印 summary，exit 1 若存在未守护模块。
 */

const { readFileSync, readdirSync, statSync, existsSync, writeFileSync } = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

// --- 文件枚举 ---

function walkJs(dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    if (['node_modules', '.git', 'native', '__tests__'].includes(name)) continue;
    const full = path.join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) {
      walkJs(full, out);
    } else if (full.endsWith('.js')) {
      out.push(full);
    }
  }
  return out;
}

function listSrcModules() {
  const all = walkJs(path.join(ROOT, 'src'));
  // 排除 native.js（与 vitest coverage.exclude 一致）与 __tests__
  return all.filter(f => !f.endsWith('.native.js') && !f.includes(`${path.sep}__tests__${path.sep}`));
}

function listTestFiles() {
  const testsDir = path.join(ROOT, 'tests');
  if (!existsSync(testsDir)) return [];
  const out = [];
  (function collect(d) {
    for (const name of readdirSync(d)) {
      const full = path.join(d, name);
      const st = statSync(full);
      if (st.isDirectory()) collect(full);
      else if (full.endsWith('.test.js')) out.push(full);
    }
  })(testsDir);
  return out;
}

// --- require/import 字面量提取 ---

const REQUIRE_RE = /require\(\s*['"]([^'"]+)['"]\s*\)/g;
const IMPORT_RE = /\bfrom\s+['"]([^'"]+)['"]/g;
const DYNAMIC_IMPORT_RE = /\bimport\(\s*['"]([^'"]+)['"]\s*\)/g;

function extractSpecs(content) {
  const specs = [];
  for (const re of [REQUIRE_RE, IMPORT_RE, DYNAMIC_IMPORT_RE]) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(content)) !== null) {
      specs.push(m[1]);
    }
  }
  return specs;
}

function resolveSpec(fromFile, spec) {
  // 仅处理相对/绝对路径，跳过 package spec（如 'vitest'、'andy-engine'）
  if (!spec.startsWith('.') && !spec.startsWith('/')) return null;
  const baseDir = path.dirname(fromFile);
  const abs = path.resolve(baseDir, spec);
  for (const cand of [abs, abs + '.js', abs + '.json', path.join(abs, 'index.js')]) {
    if (existsSync(cand) && statSync(cand).isFile()) return cand;
  }
  return null;
}

// --- 可达性图 ---

const fileCache = new Map();
function getSpecsFromFile(file) {
  if (fileCache.has(file)) return fileCache.get(file);
  let specs = [];
  try {
    specs = extractSpecs(readFileSync(file, 'utf-8'));
  } catch {
    specs = [];
  }
  fileCache.set(file, specs);
  return specs;
}

function buildReachability(testFiles, maxDepth = 12) {
  // directEntry: 直接被某测试 import 的文件
  const directEntry = new Set();
  // reachable: 从测试出发经递归上游可达的全部文件
  const reachable = new Set();
  const queue = [];

  for (const test of testFiles) {
    for (const spec of getSpecsFromFile(test)) {
      const resolved = resolveSpec(test, spec);
      if (!resolved) continue;
      directEntry.add(resolved);
      if (!reachable.has(resolved)) {
        reachable.add(resolved);
        queue.push({ file: resolved, depth: 0 });
      }
    }
  }

  while (queue.length) {
    const { file, depth } = queue.shift();
    if (depth >= maxDepth) continue;
    for (const spec of getSpecsFromFile(file)) {
      const resolved = resolveSpec(file, spec);
      if (!resolved || reachable.has(resolved)) continue;
      reachable.add(resolved);
      queue.push({ file: resolved, depth: depth + 1 });
    }
  }

  return { directEntry, reachable };
}

// --- coverage artifact 辅助判定 ---

function loadCoverageSummary() {
  const candidates = [
    path.join(ROOT, 'coverage', 'coverage-summary.json'),
    path.join(ROOT, 'coverage', 'coverage-final.json'),
  ];
  for (const c of candidates) {
    if (existsSync(c)) {
      try {
        const data = JSON.parse(readFileSync(c, 'utf-8'));
        if (c.endsWith('coverage-summary.json')) {
          // 形如 { "/abs/path": { lines: {pct, total, covered}, ... } }
          return { kind: 'summary', data };
        }
        // coverage-final 不含 pct 汇总，跳过弱守护判定
        return { kind: 'final', data: null };
      } catch {
        return { kind: 'none', data: null };
      }
    }
  }
  return { kind: 'none', data: null };
}

function isZeroCoverage(absPath, cov) {
  if (cov.kind !== 'summary' || !cov.data) return false;
  // coverage-summary.json key 为绝对路径（平台相关分隔符）
  const entry = cov.data[absPath] || cov.data[absPath.replace(/\\/g, '/')];
  if (!entry) return false;
  const lines = entry.lines || {};
  return (lines.total || 0) > 0 && (lines.covered || 0) === 0;
}

// --- 主扫描 ---

function scanModuleGuard(rootDir = ROOT) {
  const modules = listSrcModules();
  const testFiles = listTestFiles();
  const { directEntry, reachable } = buildReachability(testFiles);
  const cov = loadCoverageSummary();

  const results = modules.map(abs => {
    const rel = path.relative(rootDir, abs);
    let status;
    if (!reachable.has(abs)) {
      status = 'unguarded';
    } else if (directEntry.has(abs)) {
      status = 'guarded-direct';
    } else if (isZeroCoverage(abs, cov)) {
      status = 'weak';
    } else {
      status = 'guarded-indirect';
    }
    return { abs, rel: rel.replace(/\\/g, '/'), status };
  });

  const summary = {
    total: results.length,
    guardedDirect: results.filter(r => r.status === 'guarded-direct').length,
    guardedIndirect: results.filter(r => r.status === 'guarded-indirect').length,
    weak: results.filter(r => r.status === 'weak').length,
    unguarded: results.filter(r => r.status === 'unguarded').length,
    coverageAvailable: cov.kind === 'summary',
  };

  return { modules: results, summary };
}

function renderManifest(scan) {
  const { modules, summary } = scan;
  const date = new Date().toISOString().slice(0, 10);
  const lines = [];
  lines.push('# Module Guard Manifest');
  lines.push('');
  lines.push('> R5 "未守护模块"判定 (QUALITY_GATE_RFC v0.3 §6 主判定)。由 `scripts/module-guard-scan.js` 生成。');
  lines.push(`> 生成日期: ${date} | 模块总数: ${summary.total} | 守护(直接): ${summary.guardedDirect} | 守护(间接): ${summary.guardedIndirect} | 弱守护: ${summary.weak} | 未守护: ${summary.unguarded}`);
  lines.push(`> coverage 辅助判定: ${summary.coverageAvailable ? '可用' : '不可用（未跑 test:coverage）'}`);
  lines.push('');
  lines.push('## 守护状态汇总');
  lines.push('');
  lines.push(`- **guarded-direct**: 有测试直接 import（最稳）`);
  lines.push(`- **guarded-indirect**: 经上游/facade 可达，无直接测试入口`);
  lines.push(`- **weak**: 可达但 coverage 0%（warning，需关注是否需补直接测试）`);
  const unguardedNote = summary.unguarded === 0
    ? '当前为 0'
    : `当前 ${summary.unguarded}（已知 Gap 白名单见 tests/module-guard.test.js KNOWN_GAPS）`;
  lines.push(`- **unguarded**: 不可达 → Release blocker 候选。${unguardedNote}。`);
  lines.push('');
  lines.push('| 模块路径 | 状态 |');
  lines.push('|---|---|');
  // 排序：未守护 > 弱 > 间接 > 直接，便于一眼看风险
  const order = { unguarded: 0, weak: 1, 'guarded-indirect': 2, 'guarded-direct': 3 };
  const sorted = [...modules].sort((a, b) => order[a.status] - order[b.status] || a.rel.localeCompare(b.rel));
  for (const m of sorted) {
    lines.push(`| ${m.rel} | ${m.status} |`);
  }
  return lines.join('\n') + '\n';
}

function main() {
  const args = process.argv.slice(2);
  const write = args.includes('--write');
  const scan = scanModuleGuard();
  const { summary } = scan;

  console.log('Module Guard Scan');
  console.log('─────────────────────────────────');
  console.log(`  total          ${summary.total}`);
  console.log(`  guarded-direct   ${summary.guardedDirect}`);
  console.log(`  guarded-indirect ${summary.guardedIndirect}`);
  console.log(`  weak             ${summary.weak}`);
  console.log(`  unguarded        ${summary.unguarded}`);
  console.log(`  coverage avail   ${summary.coverageAvailable}`);
  console.log('');

  if (summary.unguarded > 0) {
    console.log('未守护模块（Release blocker 候选）:');
    for (const m of scan.modules.filter(r => r.status === 'unguarded')) {
      console.log(`  ${m.rel}`);
    }
    console.log('');
  }

  if (write) {
    const manifestPath = path.join(ROOT, 'docs', 'quality', 'module-guard-manifest.md');
    const dir = path.dirname(manifestPath);
    if (!existsSync(dir)) {
      // 极少触发：docs/quality 应已存在（W1 已建 coverage-trend.md）
      writeFileSync(manifestPath, renderManifest(scan));
    } else {
      writeFileSync(manifestPath, renderManifest(scan));
    }
    console.log(`manifest 已写入: ${path.relative(ROOT, manifestPath)}`);
  }

  if (summary.unguarded > 0) {
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = { scanModuleGuard, renderManifest, listSrcModules, listTestFiles };
