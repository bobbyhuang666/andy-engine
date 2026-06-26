/**
 * L3 Replay Trust — 跨进程回放一致性 (REPLAY_TRUST_ROADMAP §7)
 *
 * L3 语义：同一回放在不同进程启动产出相同 hash 序列。
 * 主进程跑 vs 子进程跑，比对 hash；额外子进程间互比。
 * 全新子进程无主进程全局状态/模块缓存污染，验证无进程级非确定源。
 */

import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import AndyEngine from '../../index.js';
import { toWorldState } from '../../store/index.js';
const { computeTickHash } = require('../../src/store/world/tickHash');

const __dirname = dirname(fileURLToPath(import.meta.url));
const CHILD_SCRIPT = join(__dirname, '..', '..', 'scripts', 'replay-child.js');

const START_TIME = new Date('2026-09-01T08:00:00Z');
const SEED = 42;
const TICKS = 100;

function runMainProcessHashes(seed, ticks) {
  const engine = new AndyEngine({ seed, startTime: START_TIME });
  engine.createCharacter({ id: 'maya', name: 'Maya', mbti: 'INFP', schedule: 'student' });
  engine.createCharacter({ id: 'leo', name: 'Leo', mbti: 'ESTP', schedule: 'student' });
  const hashes = [];
  for (let i = 0; i < ticks; i++) {
    engine.tick();
    const envelope = toWorldState(engine, `l3-seed${seed}`);
    hashes.push(computeTickHash(envelope, i).hash);
  }
  return hashes;
}

function runChildProcessHashes(seed, ticks) {
  const result = spawnSync('node', [CHILD_SCRIPT, '--seed', String(seed), '--ticks', String(ticks)], {
    encoding: 'utf-8',
    timeout: 30000,
  });
  if (result.status !== 0) {
    throw new Error(`child process failed (status ${result.status}): ${result.stderr}`);
  }
  return JSON.parse(result.stdout).map(h => h.hash);
}

describe('L3 Replay Trust — 跨进程回放一致性', () => {
  it('主进程 vs 子进程 hash 序列一致（seed42/100ticks）', () => {
    const mainHashes = runMainProcessHashes(SEED, TICKS);
    const childHashes = runChildProcessHashes(SEED, TICKS);
    expect(mainHashes).toEqual(childHashes);
  });

  it('子进程之间 hash 序列一致（排除子进程间非确定）', () => {
    const child1 = runChildProcessHashes(SEED, TICKS);
    const child2 = runChildProcessHashes(SEED, TICKS);
    expect(child1).toEqual(child2);
  });

  it('子进程产出长度正确', () => {
    const childHashes = runChildProcessHashes(SEED, TICKS);
    expect(childHashes.length).toBe(TICKS);
  });
});
