#!/usr/bin/env node

/**
 * Replay Diff Tool (REPLAY_TRUST_ROADMAP §4)
 *
 * 比对当前回放与 golden fixture 的 tickHash 序列，产出 tick-by-tick diff 报告。
 * diff 非空默认 exit 1；--accept-intentional 跳过立即 fail 但强制提示 changelog 义务（Q3）。
 *
 * 回放配置必须与 tests/unit/golden-seed-replay.test.js 完全一致：
 *   seed=42, startTime=2026-09-01T08:00:00Z, 2 角色 (maya INFP / leo ESTP), 100 ticks
 * 同步靠 tests/unit/replay-diff.test.js 的"未扰动 fixture 应无 diff"用例守护。
 *
 * Usage: node scripts/replay-diff.js [--accept-intentional] [--fixture <path>]
 */

const { readFileSync, existsSync } = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

// 回放配置（与 golden-seed-replay.test.js 一致，勿单独修改）
const START_TIME = new Date('2026-09-01T08:00:00Z');
const SEED = 42;
const TICKS = 100;
const DEFAULT_FIXTURE = path.join(ROOT, 'tests', 'fixtures', 'golden-campus-seed42-100ticks.json');
const GOLDEN_REPLAY_TZ = 'Asia/Shanghai';

function withGoldenReplayTimezone(fn) {
  const hadTZ = Object.prototype.hasOwnProperty.call(process.env, 'TZ');
  const previousTZ = process.env.TZ;
  process.env.TZ = GOLDEN_REPLAY_TZ;
  try {
    return fn();
  } finally {
    if (hadTZ) process.env.TZ = previousTZ;
    else delete process.env.TZ;
  }
}

/**
 * 跑当前回放并产 per-tick hash 序列。
 * 复用 W3 的 computeTickHash，不重写 hash 逻辑。
 */
function runCurrentReplay() {
  return withGoldenReplayTimezone(() => {
    // 延迟 require 避免影响测试 import 缓存
    const AndyEngine = require('../index.js');
    const { toWorldState } = require('../store/index.js');
    const { computeTickHash } = require('../src/store/world/tickHash.js');

    const engine = new AndyEngine({ seed: SEED, startTime: START_TIME });
    engine.createCharacter({ id: 'maya', name: 'Maya', mbti: 'INFP', schedule: 'student' });
    engine.createCharacter({ id: 'leo', name: 'Leo', mbti: 'ESTP', schedule: 'student' });

    const tickHashes = [];
    for (let i = 0; i < TICKS; i++) {
      engine.tick();
      const envelope = toWorldState(engine, 'golden-campus-v1');
      tickHashes.push(computeTickHash(envelope, i));
    }
    return tickHashes;
  });
}

/**
 * 比对两个 tickHash 序列，产 diff 报告对象。
 * @returns {{ total, matched, mismatched, details: Array<{tick, expected, actual}> }}
 */
function diffHashes(goldenHashes, currentHashes) {
  const maxLen = Math.max(goldenHashes.length, currentHashes.length);
  let matched = 0;
  const mismatched = [];
  for (let i = 0; i < maxLen; i++) {
    const g = goldenHashes[i];
    const c = currentHashes[i];
    if (!g || !c) {
      mismatched.push({ tick: i, expected: g ? g.hash : '<missing>', actual: c ? c.hash : '<missing>' });
      continue;
    }
    if (g.hash === c.hash) {
      matched++;
    } else {
      mismatched.push({ tick: g.tick, expected: g.hash, actual: c.hash });
    }
  }
  return { total: maxLen, matched, mismatched: mismatched.length, details: mismatched };
}

/**
 * 验证 fixture _meta 前提字段存在（REPLAY_TRUST §3 合规检查）
 */
function validateMeta(fixture) {
  if (!fixture._meta) return { valid: false, missing: ['_meta'] };
  const required = ['engineVersion', 'schemaVersion', 'domainId', 'seed', 'ticks', 'startTime', 'nodeVersion', 'nativeMode', 'generationCommand'];
  const missing = required.filter(k => !(k in fixture._meta));
  return { valid: missing.length === 0, missing };
}

function renderReport(diff, metaCheck, acceptIntentional, fixturePath) {
  const lines = [];
  lines.push('Replay Diff Report');
  lines.push('─────────────────────────────────────────────');
  lines.push(`fixture: ${path.relative(ROOT, fixturePath)}`);
  lines.push(`_meta 合规: ${metaCheck.valid ? 'yes' : 'NO (missing: ' + metaCheck.missing.join(', ') + ')'}`);
  lines.push(`ticks: ${diff.total} | matched: ${diff.matched} | mismatched: ${diff.mismatched}`);
  lines.push('');

  if (diff.mismatched === 0) {
    lines.push('✓ 当前回放与 golden fixture 一致（无 diff）');
    return lines.join('\n');
  }

  lines.push('✗ 发现 diff（按 tick 分类）:');
  for (const d of diff.details) {
    lines.push(`  tick ${d.tick}:`);
    lines.push(`    expected (fixture): ${d.expected}`);
    lines.push(`    actual   (current): ${d.actual}`);
  }
  lines.push('');

  if (acceptIntentional) {
    lines.push('⚠ --accept-intentional: exit code 不 fail，但 changelog 义务不豁免。');
    lines.push('  请在 docs/quality/golden-corpus-changelog.md 记录变更原因后运行:');
    lines.push('    npm run golden:regen');
  } else {
    lines.push('判定:');
    lines.push('  - 若非有意变更：视为回归，修复代码后重跑 npm run replay:diff');
    lines.push('  - 若有意变更：npm run replay:diff -- --accept-intentional 确认后走更新流程');
    lines.push('    更新流程：记录 changelog 原因 → npm run golden:regen → 提交 fixture + changelog');
  }

  return lines.join('\n');
}

function main() {
  const args = process.argv.slice(2);
  const acceptIntentional = args.includes('--accept-intentional');
  const fixtureIdx = args.indexOf('--fixture');
  const fixturePath = fixtureIdx !== -1 && args[fixtureIdx + 1]
    ? path.resolve(ROOT, args[fixtureIdx + 1])
    : DEFAULT_FIXTURE;

  if (!existsSync(fixturePath)) {
    console.error(`fixture 不存在: ${fixturePath}`);
    console.error('运行 npm run golden:regen 生成基线。');
    process.exit(2);
  }

  const fixture = JSON.parse(readFileSync(fixturePath, 'utf-8'));
  const goldenHashes = fixture.tickHashes || [];
  const metaCheck = validateMeta(fixture);

  const currentHashes = runCurrentReplay();
  const diff = diffHashes(goldenHashes, currentHashes);

  console.log(renderReport(diff, metaCheck, acceptIntentional, fixturePath));

  if (diff.mismatched > 0 && !acceptIntentional) {
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = { runCurrentReplay, diffHashes, validateMeta, renderReport };
