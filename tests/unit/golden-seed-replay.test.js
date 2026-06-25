/**
 * Golden Seed Replay Corpus (P0 — Determinism/replay trust)
 *
 * 比 deterministic-replay.test.js 更强的不变量：不是「两次 run 互相相等」，
 * 而是「一次 run 等于已提交的 golden 快照」。这样未来任何改动只要改变了
 * 模拟轨迹（即使仍自洽），就会被这个回归基线捕获。
 *
 * 设计：
 *   - 固定 seed (42) + 固定 startTime + 固定 2 角色 + 100 ticks。
 *   - 快照取 Stable World Envelope 顶层字段 + agent 标量 + rngState。
 *   - 剥离 runtimeSnapshot 中 seed-memory 的 wall-clock 时间戳
 *     (timestamp/lastAccessed/presentations)，因 PersonalMemory ctor 用 Date.now()
 *     生成 seed-memory 时间戳，跨进程 byte-compare 会 flaky。
 *     见 docs/rfc/SEED_MEMORY_DETERMINISM_RFC.md。
 *   - 双 run 一致性 cross-check：保留 deterministic-replay 的精神。
 *
 * 重生成工作流（故意改模拟输出时）：
 *   GOLDEN_REGEN=1 npx vitest run tests/unit/golden-seed-replay.test.js
 *   检查 git diff tests/fixtures/golden-campus-seed42-100ticks.json 后提交。
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import AndyEngine from '../../index.js';
import { toWorldState } from '../../store/index.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURE_PATH = join(__dirname, '..', 'fixtures', 'golden-campus-seed42-100ticks.json');

const START_TIME = new Date('2026-09-01T08:00:00Z');
const SEED = 42;
const TICKS = 100;

function buildSeededEngine() {
  const engine = new AndyEngine({ seed: SEED, startTime: START_TIME });
  engine.createCharacter({ id: 'maya', name: 'Maya', mbti: 'INFP', schedule: 'student' });
  engine.createCharacter({ id: 'leo', name: 'Leo', mbti: 'ESTP', schedule: 'student' });
  return engine;
}

/**
 * 构建归一化快照：剥离 wall-clock 时间戳，按稳定键排序。
 * 目标：跨进程 byte-stable。
 */
function normalizeEngine(engine) {
  const envelope = toWorldState(engine, 'golden-campus-v1');

  // Envelope 顶层关系/事件按稳定键排序（消除 Map 迭代顺序假设）
  const relationships = (envelope.relationships || [])
    .slice()
    .sort((a, b) => {
      const ka = `${a.from}|${a.to}`;
      const kb = `${b.from}|${b.to}`;
      return ka < kb ? -1 : ka > kb ? 1 : 0;
    });
  const events = (envelope.events || [])
    .slice()
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

  // Agent 标量投影（不含 memory 时间戳）
  const agentScalars = {};
  for (const agent of engine.getAllAgents().slice().sort((a, b) => (a.id < b.id ? -1 : 1))) {
    agentScalars[agent.id] = {
      position: agent.position,
      health: agent.health,
      socialEnergy: agent.socialEnergy,
      valence: agent.emotion.getValence(),
      drive: agent.needs.getDrive(),
      behaviorField: agent.behaviorField.B.slice(),
      state: agent.stateMachine.current,
      emotionCurrent: { ...agent.emotion.current },
    };
  }

  // runtimeSnapshot 内的 memory 时间戳剥离（seed-memory wall-clock flaky 源）
  const snapshot = envelope.runtimeSnapshot || {};
  const agents = {};
  for (const [id, ag] of Object.entries(snapshot.agents || {})) {
    const mem = (ag.memory && ag.memory.memories) || [];
    const cleanedMem = mem.map(m => {
      const { timestamp, lastAccessed, presentations, ...rest } = m;
      return rest;
    });
    agents[id] = { ...ag };
    if (agents[id].memory) {
      agents[id].memory = { ...agents[id].memory, memories: cleanedMem };
    }
  }

  return {
    schemaVersion: envelope.schemaVersion,
    worldId: envelope.worldId,
    domainRef: envelope.domainRef,
    worldClock: envelope.worldClock,
    characters: envelope.characters,
    relationships,
    events,
    agentScalars,
    runtimeSnapshot: { ...snapshot, agents },
    rngState: snapshot.rngState,
  };
}

describe('Golden Seed Replay Corpus (P0 determinism)', () => {
  it('same seed → identical committed golden snapshot', () => {
    const engine = buildSeededEngine();
    for (let i = 0; i < TICKS; i++) engine.tick();

    const normalized = normalizeEngine(engine);
    const json = JSON.stringify(normalized, null, 2) + '\n';

    // 重生成模式：故意改模拟输出时，开发者用 GOLDEN_REGEN=1 重写 fixture
    if (process.env.GOLDEN_REGEN === '1') {
      writeFileSync(FIXTURE_PATH, json);
      return; // skip assertion
    }

    if (!existsSync(FIXTURE_PATH)) {
      throw new Error(
        `Golden fixture 不存在：${FIXTURE_PATH}\n` +
        '运行 GOLDEN_REGEN=1 npx vitest run tests/unit/golden-seed-replay.test.js 生成首次基线。'
      );
    }

    const golden = readFileSync(FIXTURE_PATH, 'utf-8');
    expect(json).toBe(golden);
  });

  it('cross-check: two same-seed runs produce identical normalized snapshot', () => {
    // 保留 deterministic-replay 的精神：即使 fixture 过期，双 run 一致性仍守护确定性
    const engine1 = buildSeededEngine();
    const engine2 = buildSeededEngine();
    for (let i = 0; i < TICKS; i++) {
      engine1.tick();
      engine2.tick();
    }
    expect(normalizeEngine(engine1)).toEqual(normalizeEngine(engine2));
  });
});
