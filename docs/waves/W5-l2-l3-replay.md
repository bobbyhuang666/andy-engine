# W5 任务卡 — L2 多 seed + L3 跨进程回放验证

> Lane: P2 Replay（核心护城河）
> 触及边界: **否**（新增测试验证既有确定性，不动 sim 行为、不动 Stable Envelope、不修改 tickHash 算法）
> 状态: 待执行
> 依赖: W3（tickHash + golden corpus metadata）、W4（replay-diff 可复用比对逻辑）

## 1. 背景

REPLAY_TRUST_ROADMAP v0.3 §7 定义 replay 信任等级：

- L1（已达）：seed42 / 100ticks + per-tick hash 序列。
- L2：≥3 个 seed 各跑 100 ticks，hash 全匹配（跨 run 一致性，非跨 seed 相同——不同 seed 产出不同轨迹但同 seed 跨 run 必须一致）。
- L3：同一 fixture 在不同进程启动回放，hash 全匹配（跨进程 byte-stable，依赖墙上时钟修复已就位）。

当前 L2/L3 未验证。W5 落地验证测试，确认 v2.1 信任等级目标达成。

**L2 语义澄清**：L2 不是"3 个 seed 互相产出相同 hash"，而是"3 个不同 seed 各自跨 run 稳定"——即 seed42 跑两次 hash 一致、seed7 跑两次 hash 一致、seed100 跑两次 hash 一致。3 个 seed 各自确定性，组合证明 seed 参数化下回放稳定。

**L3 语义澄清**：L3 是跨进程确定性。同进程内两次 run 一致（L1 已证）不足以排除进程级非确定源（如 Date.now 渗漏、全局状态污染）。L3 通过子进程隔离验证：主进程 spawn 子进程跑回放，比对 hash。

## 2. 写入边界（执行仅可改/新建这些）

| 文件 | 改动 | 说明 |
|---|---|---|
| `tests/unit/replay-trust-l2.test.js` | 新建 | L2：3 个 seed（42/7/100）各跑两 run，per-tick hash 序列跨 run 一致 |
| `tests/unit/replay-trust-l3.test.js` | 新建 | L3：spawn 子进程跑回放产 hash 序列，主进程跑同 seed 比对，跨进程一致 |
| `scripts/replay-child.js` | 新建 | L3 子进程入口：跑回放产 hash 序列，stdout 输出 JSON（供主进程读取） |

**不得改**：sim 热路径行为、tickHash 算法、既有 golden fixture、既有测试逻辑、public API contract、其他 src/ 代码。

## 3. L2 测试设计

`tests/unit/replay-trust-l2.test.js`：

1. 定义 3 个 seed：`[42, 7, 100]`。
2. 对每个 seed，跑两 run（同 seed/startTime/角色配置，与 golden-seed-replay 一致），各产 100 ticks 的 per-tick hash 序列（用 `computeTickHash` + `toWorldState`）。
3. 断言：每 seed 两 run 的 hash 序列完全相等。
4. 额外断言：3 个 seed 之间产出的 hash 序列**不全等**（证明 seed 参数化生效，非所有 seed 产出相同轨迹——否则 seed 无意义）。

复用 golden-seed-replay 的 `buildSeededEngine` 配置（seed 参数化）。不写 fixture（L2 是跨 run 一致性，不需提交快照）。

## 4. L3 测试设计

`scripts/replay-child.js`（子进程入口）：

```js
// 读 argv: seed, ticks
// 跑回放产 per-tick hash 序列
// stdout 输出 JSON.stringify(hashes)
```

`tests/unit/replay-trust-l3.test.js`（主进程测试）：

1. 主进程跑 seed42/100ticks 产 hash 序列 A。
2. spawn 子进程 `node scripts/replay-child.js --seed 42 --ticks 100`，读 stdout 解析 hash 序列 B。
3. 断言 A === B（跨进程一致）。
4. 额外：spawn 两次子进程，断言两次子进程产出一致（排除子进程间非确定）。

**L3 关键验证点**：子进程是全新 Node 进程，无主进程的全局状态/模块缓存污染。若 hash 一致，证明回放无进程级非确定源（Date.now 渗漏、全局 RNG 等已在 W1/W3 前修复）。

## 5. 验收命令（全部须通过）

```bash
npm test                    # 含 L2/L3 新测试
npm run test:domain
npm run check:boundaries
npm run smoke:pack
npm run perf:check
npm run replay:diff
```

关键验收点：
- `tests/unit/replay-trust-l2.test.js`：3 seed 各自跨 run 一致 + seed 间不全等，通过。
- `tests/unit/replay-trust-l3.test.js`：主进程 vs 子进程 hash 一致 + 子进程间一致，通过。
- `npm run replay:diff`：仍 exit 0（W5 不动 fixture）。

## 6. 风险与回退

- **风险**：L3 子进程 hash 与主进程不一致——说明存在进程级非确定源。**这是触及 determinism 承诺边界的严重信号**。**处理**：不停下硬调测试通过，而是排查非确定源（如 Date.now 渗漏、未种子 RNG 路径），修复后重测。若无法定位根因，停下回总规划师（触及 determinism 承诺边界）。
- **风险**：L2 某 seed 跨 run 不一致——说明该 seed 路径触发 sim bug。**处理**：同上，排查而非掩盖。
- **风险**：子进程 spawn 慢（每次 ~1s）。**缓解**：L3 测试 spawn 次数控制（2 次），总时长 < 3s 可接受。
- **回退**：若 L3 失败且根因属既有 seed-memory 墙上时钟未完全修复（W1 方案 B 的边界情况），回退 L3 测试为 skip + 记录 Gap，回总规划师定是否扩修方案 B。

## 7. 回写现实状态

W5 完成后须回写：
- `docs/rfc/REPLAY_TRUST_ROADMAP.md` §7 表 L2/L3 行"当前状态"从 ⬜ 改为 ✅ 已达（含 commit）。

## 8. 不做的事

- 不改 sim 热路径行为（W5 是验证工具，不反馈到 sim）。
- 不改 tickHash 算法。
- 不改既有 golden fixture（L2/L3 不需提交快照，只验证一致性）。
- 不为通过 L3 调测试参数掩盖非确定。
- 若发现非确定源（L2/L3 失败），停下排查根因，触及 determinism 承诺边界回总规划师。
- 不实现 W6（L4 截断续跑，W6 单独波次）。
