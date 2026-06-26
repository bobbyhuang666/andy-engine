# Replay Trust Roadmap

> World Kernel Trust Phase — 草案 v0.3，独立审计师已审（Pass）。
> v0.3 修订（响应审计 Q1/Q3/S4/S5）：§2 明确为 SERIALIZATION_CONTRACT 增补章节；§3 generationCommand 实现须对齐真实脚本；§4 `--accept-intentional` 仅跳过立即 fail 不跳过 changelog；§7 L4 保留 v2.1 不预降级。
> v0.2 修订：用真实 API 名称、补纯函数前提、golden corpus metadata、replay-diff 人审流程、tickHash canonical JSON。

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

此声明作为 `docs/SERIALIZATION_CONTRACT.md` 的**增补章节**（审计 S5：保护 Stable World Envelope 不变性，不重写既有契约），章节名建议 `## Determinism Boundary`，仅追加、不改写既有段落。

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

**审计 S4 提示**：`_meta.generationCommand` 引用的 `npm run golden:regen` 脚本当前**不存在**（`package.json` 无 `golden` script，`scripts/` 无 golden 文件）。草案可写，但实现时 fixture 的 generationCommand 必须与真实落地的脚本路径对齐，不得写死一个不存在的命令。

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

**审计 Q3 采纳**：可加 `--accept-intentional` flag，但其语义**仅**为"跳过立即 fail 并自动进入 §5 更新流程"——**不得**跳过 §5 的 changelog 记录。即：flag 只改变 fail 时机，不改变审计痕迹义务。未写 changelog 的 fixture 更新仍视为流程违规（见 §5）。

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

未记录原因的 fixture 更新视为流程违规，不合并。`--accept-intentional`（§4）不能豁免此项。

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

**审计 Q1 采纳**：L4 保留 v2.1 目标，不预降级。理由：`WorldStateAdapter.fromWorldState()` 已实现（`src/store/world/WorldStateAdapter.js`），22 个可持久化类型有 `static fromJSON`、18 个 round-trip 断言已过，续跑底层能力已就位。原 §7 末段"若 schema 阻塞则降级 v2.2"的担忧在实际代码中未发现阻塞，故改为：**先在 v2.1 做实测验证，若实测发现 round-trip 有损再降级 v2.2 并在 RFC 记录**，不预先降级。

## 8. 审计裁定记录

- **Q1（已采纳）**：L4 保留 v2.1，不预降级；实测有损再降。
- **Q2（已采纳）**：9 位量化精度保持不变。
- **Q3（已采纳）**：`--accept-intentional` 仅跳过立即 fail，不跳过 changelog（§4 已写入）。
- **S4（已记录）**：generationCommand 须对齐真实脚本（§3 已写入）。
- **S5（已采纳）**：确定性边界声明作为 SERIALIZATION_CONTRACT 增补章节（§2 已写入）。
