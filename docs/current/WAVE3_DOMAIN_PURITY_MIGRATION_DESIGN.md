# Wave 3 — 域纯度迁移设计(架构师决策草案)

> 状态:**待用户批准**。本文档先定设计,再动代码。
> 触碰 Stable World Envelope,AGENTS.md 要求迁移计划。

## 1. 目标

让 `src/domain/DomainRegistry` 成为**纯域机制**(注册/校验/查询),
不再在 core 内硬编码 campus 为默认域。campus 退化为「一个 preset 实例」,
仅由**入口层**注入以保向后兼容。

## 2. 现状(实测)

### 2.1 架构性违规(必须修)
- `src/domain/DomainRegistry.js:10,23` — 模块顶 `require('../../presets/campus')`,构造 `this.domain = domainConfig || campusDomain`。
  后果:DomainRegistry 自身是 campus 耦合的,自定义域靠「传入覆盖默认」,而非注册机制。
- `src/agent/schedule/Schedule.js:182` — `require('../../../presets/campus/schedules')` + 4 个 `create*Schedule` 静态工厂。
  已标 `@deprecated`,但物理上 core 仍 require preset。

### 2.2 特判/默认(代码异味,需泛化)
- `src/store/world/WorldStateAdapter.js:85-87` — `worldState.domainRef !== 'campus'` 抛错:把 campus 当「免校验特权域」。
- `src/store/world/compiler.js:31-32` — 同样 `domainRef !== 'campus'` 特判。
- `src/store/world/migration.js:127` — 默认 `domainRef: 'campus'`。

### 2.3 向后兼容默认(AGENTS.md 允许,保留)
- `src/sdk/Andy.js:180`、`src/sdk/Character.js:343`、`Andy.js:159` 的 `state.domainRef || 'campus'`。
  AGENTS.md:「`new AndyEngine()` 默认 campus preset,向后兼容」——SDK 入口层注入默认,**允许保留**。

## 3. 设计决策

### 3.1 DomainRegistry 改为纯机制 + 默认域注入点
- 移除 `DomainRegistry.js` 顶部的 `require('../../presets/campus')`。
- 构造函数 `domainConfig` 改为**必填语义**:无 config 时不再静默用 campus,而是接受一个「默认域解析器」或由入口层传入。
- **入口层注入**(保向后兼容):`index.js` 的 `AndyEngine` 构造,当 `options.domain` 未传时,在**入口层** `require('./presets/campus')` 传入。这样 core `src/domain/` 无 campus 字面量,只有顶层入口知道默认。
- DomainRegistry 提供 `register(id, config)` + `get(id)` 轻量注册表,使存档的 `domainRef` 可经注册表解析为 config(替代 WorldStateAdapter 的 campus 特判)。

### 3.2 Schedule 静态工厂迁移
- 4 个 `create*Schedule` + `_campusSchedules()` 从 `src/agent/schedule/Schedule.js` **移除**。
- 迁移目标:`presets/campus/schedules.js` 导出对应的 `create*Schedule`(factory),或由 domain `roleArchetypes` 驱动(注释已指引)。
- `Schedule.js` 仅保留通用 `Schedule` 类逻辑。若需保留向后兼容入口,放在**入口层**或 `presets/campus`。

### 3.3 WorldStateAdapter / compiler / migration 泛化
- `domainRef !== 'campus'` 特判 → 改为「校验 domainRef 是否已在注册表/config 中解析」,campus 不再是特权。
- `migration.js:127` 默认 `'campus'` → 改为从存档/domainRef 解析,无 config 时走入口层默认域注入。

## 4. 迁移与兼容

- **现有 campus 存档**:domainRef='campus' 经注册表解析到 campus preset config,仍可加载(入口层注册 campus 为内置默认域)。
- **自定义域**:不再需要靠「覆盖默认」,显式 `new AndyEngine({ domain })` 或注册。
- **行为不变**:默认无 domain 时,入口层注入 campus,对调用方透明。

## 5. 写入边界(批准后)

- 必改:`src/domain/DomainRegistry.js`、`src/agent/schedule/Schedule.js`、`src/store/world/{WorldStateAdapter,compiler,migration}.js`、入口层 `index.js`。
- 移动:`Schedule.create*Schedule` → `presets/campus/schedules.js`。
- 不动:Stable World Envelope 信封结构(只改 domainRef 解析路径,不改信封 schema)。

## 6. 验收

- `npm run test:domain` 通过(含 domain-deep / domain-contract / source-scan)。
- 新增「自定义域无 campus 字面量依赖」测试:构造一个纯自定义域,确认 DomainRegistry 不 require campus。
- `rg -i "campus" src --glob '!**/config/**'` 仅剩注释 / 入口层向后兼容注入点。
- 现有 campus 存档 round-trip 仍成立。

## 7. 待批准问题

1. 是否批准启动 Wave 3 实施(默认先本设计,再分批小步代码)?
2. DomainRegistry 是否引入显式 `register/get` 注册表(推荐),还是保持「构造传入 + 入口层默认」更轻量?
