# W6 任务卡 — L4 截断续跑验证

> Lane: P2 Replay（核心护城河）
> 触及边界: **可能触及 Stable World Envelope**（若 schema/restore 路径阻塞截断续跑，需回总规划师确认是否动 schema）。
> 状态: 待执行
> 依赖: W3（tickHash）、W4（replay-diff 可复用比对）、W5（L1-L3 已达）

## 1. 背景

REPLAY_TRUST_ROADMAP v0.3 §7 L4：从 tick N 的快照续跑到 tick M，与全程回放的 tick M hash 一致。Q1 裁定：保留 v2.1 目标，不预降级；实测有损再降 v2.2 并记录。

底层能力已核实就位：
- `WorldStateAdapter.fromWorldState()`（`src/store/world/WorldStateAdapter.js:81`）：Stable Envelope → 引擎实例。
- `AndyEngine.fromJSON(data, config)`（`index.js:480`）：公开 restore 路径。
- `this.rng.setState(savedState.rngState)`（`index.js:64`）：RNG 状态恢复（截断续跑的关键——RNG 状态决定后续随机性，必须可恢复）。

W6 验证：跑 100 ticks → 在 tick 50 序列化 → 从 tick 50 快照恢复 → 续跑到 100 → 比对续跑段（tick 50-100）的 per-tick hash 与全程回放对应段一致。

## 2. 写入边界（执行仅可改/新建这些）

| 文件 | 改动 | 说明 |
|---|---|---|
| `tests/unit/replay-trust-l4.test.js` | 新建 | L4 截断续跑验证：全程回放产 hash 序列 → tick 50 序列化 → 恢复续跑 → 比对续跑段 hash 一致 |

**不得改**：sim 热路径行为、Stable World Envelope 契约字段、tickHash 算法、既有 golden fixture、既有测试逻辑、public API contract、其他 src/ 代码。

**若发现 schema/restore 阻塞**：停下，不强行改 schema，回总规划师确认（触及 Stable Envelope 边界）。

## 3. L4 测试设计

`tests/unit/replay-trust-l4.test.js`：

1. **全程回放**：seed42/100ticks 跑到底，逐 tick 采 `toWorldState` + `computeTickHash`，产完整 hash 序列 `fullHashes[0..99]`。
2. **截断续跑**：
   - 跑到 tick 50，`toWorldState` 序列化为 envelope_50。
   - 用 `WorldStateAdapter.fromWorldState(envelope_50, config, AndyEngine)` 恢复新引擎实例（或 `AndyEngine.fromJSON`）。
   - 续跑 tick 51-100，逐 tick 采 hash，产续跑段 `resumedHashes[51..99]`。
3. **断言**：`resumedHashes[i]` === `fullHashes[i]`（i from 51 to 99）——续跑段与全程对应段 hash 一致。
4. **额外断言**：tick 50 恢复点 hash 一致（恢复无状态损失）。

**关键验证点**：
- RNG 状态恢复：若 `rngState` 未正确恢复，续跑段 hash 必然漂移。L4 通过即证明 RNG 状态可序列化恢复。
- agent 状态恢复：position/emotion/needs/memory 等必须无损还原。
- 续跑后行为与全程一致：证明世界可持续（停服续跑不丢演化）。

## 4. 验收命令（全部须通过）

```bash
npm test
npm run test:domain
npm run check:boundaries
npm run smoke:pack
npm run perf:check
npm run replay:diff
```

关键验收点：
- `tests/unit/replay-trust-l4.test.js`：续跑段（tick 51-99）hash 与全程回放对应段一致，通过。
- `npm run replay:diff`：仍 exit 0（W6 不动 fixture）。

## 5. 风险与回退

- **风险（触及边界）**：`fromWorldState` 恢复后续跑段 hash 与全程不一致——说明 restore 有损（agent 状态/RNG/memory 等未完整还原）。**这是触及 Stable Envelope 的信号**。
  - **处理**：先排查根因（哪个字段未还原），若属既有 restore 实现 bug 且修复不破坏契约，可在本波次修；若需改 Stable Envelope schema 或 restore 语义，**停下回总规划师**（触及 Stable Envelope 边界）。
  - **降级路径（Q1）**：若根因属 schema 设计限制（如 runtimeSnapshot 不透明字段无法还原），L4 降级为 v2.2 目标，在 RFC 记录原因与阻塞点。
- **风险**：恢复点 tick 50 的 hash 与全程 tick 50 不一致（restore 前后状态变化）。**处理**：排查 `toWorldState` 是否有副作用或 restore 是否引入漂移。
- **回退**：若 L4 失败且无法在不触及边界的前提下修复，W6 记录 Gap + 降级 v2.2，回总规划师。

## 6. 回写现实状态

W6 完成后须回写：
- `docs/rfc/REPLAY_TRUST_ROADMAP.md` §7 表 L4 行：
  - 若通过 → "✅ 已达（W6）"
  - 若降级 → "⬜ 降级 v2.2（W6 实测：[原因]）"
- 若降级，§8 审计裁定记录 Q1 补充实测结论。

## 7. 不做的事

- 不改 sim 热路径行为。
- 不改 tickHash 算法。
- 不改既有 golden fixture。
- 不改 Stable Envelope schema 或 restore 语义（若需改，回总规划师）。
- 不为通过 L4 调测试参数掩盖 restore 有损。
- 若 L4 失败触及边界，停下回总规划师，不强行降级（降级需总规划师确认）。
