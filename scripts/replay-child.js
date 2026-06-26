#!/usr/bin/env node

/**
 * L3 Replay Child Process (REPLAY_TRUST_ROADMAP §7)
 *
 * L3 跨进程回放验证的子进程入口：跑回放产 per-tick hash 序列，
 * stdout 输出 JSON 供主进程读取。
 *
 * 全新 Node 进程，无主进程全局状态/模块缓存污染，验证回放无进程级非确定源。
 *
 * Usage: node scripts/replay-child.js --seed <n> --ticks <n>
 *   stdout: JSON.stringify([{tick, hash}, ...])
 */

const AndyEngine = require('../index.js');
const { toWorldState } = require('../store/index.js');
const { computeTickHash } = require('../src/store/world/tickHash');

function parseArgs(argv) {
  const out = { seed: 42, ticks: 100 };
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === '--seed') out.seed = parseInt(argv[++i], 10);
    else if (argv[i] === '--ticks') out.ticks = parseInt(argv[++i], 10);
  }
  return out;
}

function main() {
  const { seed, ticks } = parseArgs(process.argv);
  const START_TIME = new Date('2026-09-01T08:00:00Z');

  const engine = new AndyEngine({ seed, startTime: START_TIME });
  engine.createCharacter({ id: 'maya', name: 'Maya', mbti: 'INFP', schedule: 'student' });
  engine.createCharacter({ id: 'leo', name: 'Leo', mbti: 'ESTP', schedule: 'student' });

  const hashes = [];
  for (let i = 0; i < ticks; i++) {
    engine.tick();
    const envelope = toWorldState(engine, `l3-seed${seed}`);
    hashes.push(computeTickHash(envelope, i));
  }

  // stdout 仅输出 JSON，无其他日志（避免污染解析）
  process.stdout.write(JSON.stringify(hashes));
}

main();
