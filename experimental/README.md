# experimental/ — 未接入 Core 的隔离区

本目录收容**未接入 Engine Core 运行时**的实验性模块与外部产品适配器。
它们从 `src/` 移出，以保持 core 精简，但代码与测试覆盖予以保留，git 可追溯。

## 边界约定

- 这里的模块**不参与 runtime**：`src/` 任何模块都不 import 本目录。
- 不被 public facade（`index.js` / `sdk/index.js` / `action/index.js` 等）导出。
- 不被 `module-guard-scan`、`check-boundaries`、`source-scan` 扫描
  （这些 guard 只覆盖 `src/` 与既定顶层目录）。
- 这里的代码**不是**旧顶层实现目录的恢复（见 AGENTS.md），
  仅作隔离区，未来要么接入 core（届时迁回 `src/` 并补 guard），
  要么正式退役删除。

## 当前模块

| 模块 | 来源 | 状态 |
|------|------|------|
| `action/GoalSystem.js` | `src/action/GoalSystem.js` | 纯 action-layer 压力源，代码注释明确"不接入 Agent.tick"；实际 action selection 用 `IntrinsicMotivation.activeGoals`，是另一套机制。待接入或退役。 |
| `action/WorldObject.js` | `src/action/WorldObject.js` | 抽象实体数据模型，无 runtime consumer，属 deferred 能力。 |
| `sdk/AndyTownAdapter.js` | `src/sdk/AndyTownAdapter.js` | Andy Town (localhost:3457) 外部服务适配层，非 Engine 逻辑；AGENTS.md 明确"不做 Andy Town 逻辑到 Engine Core"。 |

## 对应测试

专属测试保留在 `tests/` 下，import 路径已指向本目录，继续提供覆盖：

- `tests/unit/goalsystem.test.js`、`tests/phase-29-goalsystem.test.js`
- `tests/unit/worldobject.test.js`、`tests/phase-30-worldobject.test.js`、
  `tests/phase-32-1-worldobject-provider.test.js`、`tests/facts/worldobject-integration.test.js`
