# W3 任务卡 — tickHash 设计落地 + golden corpus metadata 升级

> Lane: P2 Replay（核心护城河）
> 触及边界: **否**（新增 hash 模块 + 升级 fixture 元数据 + 新测试，不动 Stable Envelope 契约字段，不改 sim 热路径行为）
> 状态: 待执行
> 依赖: 无（W2 已完成；W3 是 Replay Lane 首个波次，独立于 Governance）

## 1. 背景

REPLAY_TRUST_ROADMAP v0.3 §6 定义 tickHash（canonical JSON + 1e9 量化 + sha256），§3 定义 golden corpus 必带 `_meta`。当前状态：

- golden fixture 存在：`tests/fixtures/golden-campus-seed42-100ticks.json`（325KB），L1 已达（seed42/100ticks 双 run 一致）。
- fixture 顶层无 `_meta` 字段（顶层为 schemaVersion/worldId/domainRef/worldClock/characters/relationships/events/agentScalars/runtimeSnapshot/rngState）。
- `npm run golden:regen` script 不存在（S4 提示）；现有 regen 走 `GOLDEN_REGEN=1 npx vitest run tests/unit/golden-seed-replay.test.js`。
- 无 tickHash 模块；golden-seed-replay.test.js 做的是整体快照比对，无 per-tick hash 序列。

W3 落地：tickHash 算法模块 + golden fixture 升级 `_meta` + per-tick hash 序列 + 对齐真实 regen 命令。

## 2. 写入边界（执行仅可改/新建这些）

| 文件 | 改动 | 说明 |
|---|---|---|
| `src/store/world/tickHash.js` | 新建 | tickHash 算法：canonical JSON（递归 key sort + 无空格）+ 数值 1e9 量化 + sha256 hex 输出；导出 `computeTickHash(worldState, tick)` |
| `tests/unit/tickHash.test.js` | 新建 | tickHash 单元测试：canonical 化、量化精度、key 顺序无关性、字段过滤（不 hash `_meta`/narrative/墙上时间） |
| `tests/fixtures/golden-campus-seed42-100ticks.json` | 升级 | 增加 `_meta` 字段；增加 `tickHashes` 数组（per-tick hash 序列） |
| `tests/unit/golden-seed-replay.test.js` | 增补 | 回放时验证 per-tick hash 与 fixture 的 `tickHashes` 一致（不破坏既有整体快照比对） |
| `package.json` | 增 script | `golden:regen`: `GOLDEN_REGEN=1 vitest run tests/unit/golden-seed-replay.test.js`（对齐 S4，让 `_meta.generationCommand` 真实可执行） |

**不得改**：sim 热路径行为（AndyWorld.step / EventDispatcher / effects commit 不得为 hash 改逻辑）、Stable World Envelope 契约字段、public API contract、其他 src/ 代码、其他测试。

## 3. tickHash 算法（REPLAY_TRUST §6 落地）

`src/store/world/tickHash.js` 导出 `computeTickHash(worldState, tick)`：

1. **字段过滤**：仅取 `worldState` 的规范字段——`worldClock` / `characters`（agent 标量状态）/ `relationships` / `canonFacts`（若有）/ `positions`。**排除** `_meta`、`narrative` 文本、墙上时间戳、`rngState`（rngState 单独验证，不进 tickHash，避免 hash 语义混淆）。
2. **canonical JSON**：递归 key sort（`Object.keys().sort()` 递归应用到对象/数组元素），`JSON.stringify` 无空格。
3. **数值量化**：所有 number 类型按 `Math.round(x * 1e9) / 1e9` 量化（9 位小数）；boolean/string/null 不量化。
4. **hash**：`crypto.createHash('sha256').update(canonicalStr).digest('hex')`。
5. 返回 `{ tick, hash }`。

**设计纪律**：算法纯函数，无副作用，不读文件系统，不依赖 sim 状态——便于 W4 replay-diff 复用。

## 4. golden fixture `_meta` 字段（REPLAY_TRUST §3 落地）

升级后 fixture 顶层增加：

```json
"_meta": {
  "engineVersion": "<package.json version>",
  "schemaVersion": "<WORLD_SCHEMA.md 当前版本>",
  "domainId": "<DomainRegistry id>",
  "domainVersion": "<domain version>",
  "seed": 42,
  "ticks": 100,
  "startTime": "<simTime 起始值 ISO，非墙上时钟>",
  "nodeVersion": "<process.versions.node major>",
  "nativeMode": "disabled",
  "generationCommand": "npm run golden:regen",
  "generatedAt": "<ISO 时间戳，仅审计不参与 hash>"
}
```

字段值从 `package.json` / `process.versions` / engine config 真实读取，不硬编码。`generatedAt` 不参与 tickHash。

## 5. 验收命令（全部须通过）

```bash
npm test
npm run test:domain
npm run check:boundaries
npm run smoke:pack
npm run perf:check
```

关键验收点：
- `tests/unit/tickHash.test.js`：canonical 化、量化、key 顺序无关、字段过滤断言全过。
- `tests/unit/golden-seed-replay.test.js`：既有整体快照比对不破；新增 per-tick hash 比对通过（回放 100 ticks 的 hash 序列与 fixture `tickHashes` 一致）。
- golden fixture：含 `_meta`（字段齐全）+ `tickHashes`（长度 100）。
- `npm run golden:regen`：script 存在且可执行（GOLDEN_REGEN=1 重生成 fixture）。
- `_meta.generationCommand` 与真实 script 一致。

## 6. 风险与回退

- **风险**：tickHash 字段过滤遗漏导致 hash 含墙上时间戳，跨进程 flaky。**缓解**：tickHash.test.js 显式断言含/排除字段；golden-seed-replay.test.js 跨 run 验证 hash 稳定。
- **风险**：1e9 量化对 relationship strength（0-1 连续量）精度不足或过度。**缓解**：审计 Q2 已裁定 9 位合适；tickHash.test.js 含边界值用例。
- **风险**：升级 fixture 改变既有快照比对。**缓解**：`_meta`/`tickHashes` 是新增字段，golden-seed-replay 既有比对若按字段取值应不受影响；若比对是全等则需调整比对逻辑忽略新字段（属本波次合理改动）。
- **回退**：若 hash 跨 run 不稳定（非字段过滤问题而是 sim 本身非确定），不强行合入——回退并记录为 Replay Lane 阻塞，回总规划师（触及 determinism 承诺边界）。

## 7. 回写现实状态

W3 完成后须回写：
- `docs/rfc/REPLAY_TRUST_ROADMAP.md` §7 表 L1 行"已达"补充"含 per-tick hash 序列"；§3 `_meta` 标"已落地"。
- `docs/quality/coverage-trend.md`：若 coverage 数值变化则 append 新条目（W3 新增模块可能轻微影响）。

## 8. 不做的事

- 不改 sim 热路径行为（tickHash 是观察工具，不反馈到 sim）。
- 不把 rngState 纳入 tickHash（单独验证，避免语义混淆）。
- 不实现 W4 replay-diff（W3 只产 hash + 序列，比对工具归 W4）。
- 不触碰 Stable World Envelope 契约字段 / public API contract / determinism 承诺边界。
- 若发现 sim 本身非确定（hash 跨 run 不稳定因 sim bug），停下回总规划师——不通过调 hash 算法掩盖 sim 非确定。
