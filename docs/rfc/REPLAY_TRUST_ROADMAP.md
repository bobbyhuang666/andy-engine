# Replay Trust Roadmap

> World Kernel Trust Phase — 草案 v0.2，待独立审计师审查。仅文档，无实现。
> 上一版变更：用真实 API 名称、补纯函数前提、golden corpus metadata、replay-diff 人审流程、tickHash canonical JSON。

## 0. 范围

确定性回放信任等级建设路径。明确哪些路径承诺 deterministic，哪些不承诺，以及 v2.1 应达到的回放信任等级。

## 1. 目标表述与前提

目标表述：**世界演化是 `(seed, simTime)` 的纯函数**。

但必须加前提——纯函数性仅在以下全部相等时承诺：

```text
相同 domain / domain version
相同 config / initial state
相同 runtime version（package.json version）
相同 Node major version
相同 native mode（native 绑定开关状态）
```

任一前提变化，回放结果可能合法漂移，不视为 bug。前提列表写入每份 golden fixture 的 metadata。

### API 术语（真实名称）

- 公开推进入口：`engine.tick()`（`index.js` 的 `AndyEngine` facade，`index.js:369`）
- 内部推进实现：`AndyWorld.step()`（`src/runtime/AndyWorld.js:313`）

不引入 `AndyWorld.step()` 以外的虚构术语。

## 2. 确定性边界声明

明确哪些路径承诺 deterministic，哪些不承诺：

| 路径 | 是否承诺 deterministic | 备注 |
|---|---|---|
| 世界 tick 推进、action selection、effect commit | ✅ 承诺 | 种子 RNG 接入，tickHash 稳定 |
| 持久化序列化（含 runtimeSnapshot 不透明转发） | ✅ 承诺（结构稳定） | runtimeSnapshot 内部字段在 v1+ 不透明，仅承诺 forward 语义 |
| SDK / tooling / store 迁移脚本 | ⚠️ 不承诺 | 非模拟热路径 |
| LLM narrative 输出 | ❌ 不承诺 | LLM 本身非确定；narrative 不进入 golden corpus |
| 种子记忆墙上时钟 | ✅ 已修复（方案 B） | `backgroundToMemories(background, simTime)`，simTime 由 `this.world.clock.time` 传入 |

此声明写入 `docs/SERIALIZATION_CONTRACT.md`，作为"哪些是承诺、哪些不是"的单一事实源。

## 3. golden corpus 必带 metadata

每份 golden fixture 必须以 `_meta` 字段记录：

```json
{
  "_meta": {
    "engineVersion": "<package.json version>",
    "schemaVersion": "<WORLD_SCHEMA.md § 当前版本>",
    "domainId": "<DomainRegistry id>",
    "domainVersion": "<domain version>",
    "seed": 42,
    "ticks": 100,
    "startTime": "<simTime 起始值，非墙上时钟>",
    "nodeVersion": "<process.versions.node major>",
    "nativeMode": "<native 绑定开关，如 'disabled'>",
    "generationCommand": "npm run golden:regen -- --seed 42 --ticks 100",
    "generatedAt": "<ISO 时间戳，仅用于审计，不参与 hash>"
  }
}
```

`generatedAt` **不参与** tickHash 计算。前提字段缺失的 fixture 视为不合规。

## 4. replay-diff 工具与人审流程

replay-diff 用于比对当前回放与 golden fixture。必须支持"有意行为变更"流程，避免 golden corpus 阻碍正常演进：

```text
1. 工具产出 diff 报告（tick-by-tick，按字段分类）
2. 若 diff 非空：
   a. 工具默认 fail（CI/本地均如此）
   b. 开发者判定 diff 是否为"有意行为变更"
      - 若否：视为回归，修复代码
      - 若是：进入人审更新流程（§5）
3. 人审通过后：更新 fixture + 记录原因，diff 归零
```

## 5. golden fixture 更新流程

"有意行为变更"更新 fixture 必须留下审计痕迹：

```text
- 在 docs/quality/golden-corpus-changelog.md 记录：
  - 变更 PR / commit
  - 变更原因（功能演进 / bug 修复 / schema 升级）
  - 受影响 fixture 与 tick 范围
  - 审阅人
- 更新 fixture 的 _meta.engineVersion / schemaVersion / domainVersion
- 重新生成命令必须与 _meta.generationCommand 一致
```

未记录原因的 fixture 更新视为流程违规，不合并。

## 6. tickHash 设计（canonical 化）

tickHash 消除无意义格式差异，三条规定：

1. **canonical JSON**：`JSON.stringify(value)` 前先做 key sort（递归），无空格。
2. **浮点精度策略**：所有参与 hash 的数值，按 `Math.round(x * 1e9) / 1e9` 量化到 9 位小数（纳秒级），消除 IEEE-754 末位漂移。boolean/string/null 不量化。
3. **hash 输入**：仅 hash `worldState` 的规范字段（agent states / clock / canon facts / positions），**不** hash `_meta`、narrative 文本、墙上时间戳。

hash 算法：Node 内置 `crypto.createHash('sha256')`，输出 hex。每 tick 记一条 `{ tick, tickHash }`，fixture 存全量 hash 序列。

## 7. v2.1 应达到的 replay 信任等级

| 等级 | 标准 | 当前状态 |
|---|---|---|
| L1 单 seed 单长度回放 | seed42 / 100ticks 通过 | ✅ 已达 |
| L2 多 seed 回放 | ≥3 个 seed 各跑 100 ticks，hash 全匹配 | ⬜ v2.1 目标 |
| L3 跨进程回放 | 同一 fixture 在不同进程启动回放，hash 全匹配 | ⬜ v2.1 目标（依赖墙上时钟修复已就位） |
| L4 截断续跑 | 从 tick N 的快照续跑到 tick M，与全程回放的 tick M..M hash 一致 | ⬜ v2.1 目标 |

L4 是"世界可持续"的硬证据，但依赖 runtimeSnapshot 续跑能力，若 schema 阻塞则降级为 v2.2 目标并在 RFC 记录。

## 8. 待审计师裁定的问题

- L4 截断续跑是否可在 v2.1 达成，还是直接降级为 v2.2。
- tickHash 的 9 位小数量化精度是否足够（关系/情绪等连续量），还是需调到 6 位以容忍更大漂移。
- replay-diff 默认 fail 是否对正常演进过严，是否允许 `--accept-intentional` 跳过标记流程。
