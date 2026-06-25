# Wave 3 执行拆分计划 — 域纯度(P0 高风险内核迁移)

> 阶段:A 级内核硬化。本计划严格遵循用户决策:高风险内核迁移管理、不扩功能、不动 Envelope 结构、保 campus 存档可加载、默认 campus 注入点在入口层。
> 执行顺序硬性:测试前置 → DomainRegistry → Schedule → WorldStateAdapter/compiler/migration → 终验。
> 每个子波次独立可验证、有回滚方案。不允许跨波次并行写入同一文件。

---

## 全局护栏(所有子波次通用)

- **不改变 Stable World Envelope 结构**:`src/store/Serialization.js` 信封 schema(version/runtimeSnapshot 字段)不变。允许改 domainRef 解析路径(经注册表/config),不允许改信封字段。
- **向后兼容铁律**:`new AndyEngine()` 无 domain 时继续注入 campus,行为不变。既有 campus 存档(`domainRef:'campus'`)必须可加载。自定义域存档必须可加载。
- **不扩功能**:只做解耦迁移,不新增 domain 能力、不动 StoryArc/Town/UI。
- **写回规则**:不动 action provider / narrative 写状态逻辑。
- **domainRef 解析路径可改**:campus 不再是「免校验特权域」,改为「经入口层注册的默认域实例」。

---

## Wave 3a — 前置 characterization tests(测试先行,不改 src)

**目标**:锁住现有 campus 默认行为、自定义 domain 行为、存档 round-trip,作为后续迁移的回归安全网。先有红绿基线,再动 core。

**写入边界**:仅 `tests/` 新增文件。绝不改 `src/`、`presets/`、任何 facade。

**新增测试(必须覆盖以下行为契约)**:
1. `tests/unit/wave3-characterization.test.js`:
   - 默认 `new AndyEngine()` 的 domain.id === 'campus'(锁向后兼容)。
   - 默认引擎创建 character、tick 多轮不抛错。
   - campus schedule 工厂(`Schedule.createStudentSchedule` 等)产出可用 Schedule。
   - 自定义 domain(构造最小合法 domain config)的 domain.id !== 'campus',且不 require campus preset。
   - campus 存档 `save()/load()` round-trip:domainRef 一致、agent 状态可恢复。
   - 自定义 domain 存档 round-trip。
   - `domainRef` 不匹配时(fromWorldState)抛错的行为锁定。
2. 复用既有 `tests/domain*.test.js`、`tests/sdk-custom-domain.test.js`、`tests/source-scan.test.js` 作为补充基线。

**测试前置验收**:
- `npx vitest run tests/unit/wave3-characterization.test.js` 全绿。
- `npm run test:domain` 既有 81 测试仍全过(确认未破坏既有 domain 行为)。

**风险点**:低。纯新增测试。
**回滚方案**:`git checkout -- tests/unit/wave3-characterization.test.js`(删除新文件即可,无 src 改动)。

---

## Wave 3b — DomainRegistry 迁纯机制(核心解耦)

**目标**:移除 `src/domain/DomainRegistry.js` 顶部 `require('../../presets/campus')` 与 `this.domain = domainConfig || campusDomain`。DomainRegistry 成为纯机制(注册/校验/查询),默认域由入口层注入。

**写入边界**:
- 必改:`src/domain/DomainRegistry.js`。
- 必改(入口层注入点):`index.js`(当 `config.domain` 未传时,在入口层 `require('./presets/campus')` 显式传入 `new DomainRegistry(campusPreset, {validate:false})`)。
- 可选:若需要注册表解析存档 domainRef,在 DomainRegistry 加轻量 `register(id,config)`/`get(id)`,或在入口层维护默认域映射。
- 不动:`presets/campus/`(preset 是外部 domain 实例,保留)。

**实施要点**:
- DomainRegistry 构造 `domainConfig` 改为**必填语义**:无 config 不再静默用 campus。但为保独立测试,可接受 `domainConfig=null` 时用一个空壳 domain(空 regions/空 schedules),而非 campus。
- 入口层 `index.js:79` `new DomainRegistry()` 改为显式注入 campus preset。
- 确认 `index.js:157` `this.domain.id === 'campus'` 的 schedule fallback 分支仍工作(入口层 campus 注入后 id 仍为 'campus')。
- 任何 `src/` 内的 `require('...presets/campus')` 必须清零(用 grep 验证)。

**测试前置**:Wave 3a 必须先完成并全绿。
**验收命令**:
- `npm test`(全套,含 characterization)
- `npm run test:domain`
- `npm run check:boundaries`
- `rg -n "require.*presets/campus" src/domain/` 必须为空
- `rg -n "campusDomain\s*=\s*require" src/` 必须为空

**风险点**:中。DomainRegistry 是多处依赖的核心。若入口注入遗漏,默认引擎会拿到空壳 domain 而非 campus。
**回滚方案**:`git checkout -- src/domain/DomainRegistry.js index.js`。因 Wave 3a 测试已锁定行为,回滚后测试仍应绿(回滚到注入 leak 状态)。

---

## Wave 3c — Schedule campus 工厂出 core(迁移 deprecated 工厂)

**目标**:移除 `src/agent/schedule/Schedule.js:182` 的 `require('../../../presets/campus/schedules')` 及 4 个 `create*Schedule` 静态工厂,把工厂迁到 `presets/campus/schedules.js`(或由 domain.roleArchetypes 驱动)。

**写入边界**:
- 必改:`src/agent/schedule/Schedule.js`(移除工厂与 preset require)。
- 必改:`presets/campus/schedules.js`(接收迁入的工厂,若尚不存在则新建导出)。
- 可能改:入口层 `index.js:152-161`(campus schedule fallback 分支改为调用 preset 工厂,而非 `Schedule.create*`)。
- 不动:Stable World Envelope。

**实施要点**:
- 4 个 `createStudentSchedule/createWorkerSchedule/createFreelancerSchedule/createHomeSchedule` 从 Schedule 类移除。
- 若有调用方依赖这些静态方法,在入口层或 preset 模块提供同名导出作兼容垫片(保向后兼容)。
- `Schedule.js` 仅保留通用 Schedule 类逻辑 + `fromJSON`(Wave 4 已加)。
- grep 验证 `src/` 内无 `createStudentSchedule` 等调用(若有,改走 preset)。

**测试前置**:Wave 3a/3b 完成。
**验收命令**:
- `npm test`
- `rg -n "require.*campus/schedules" src/` 必须为空
- `rg -n "createStudentSchedule|createWorkerSchedule|createFreelancerSchedule|createHomeSchedule" src/agent/schedule/Schedule.js` 必须为空(已迁出)

**风险点**:中。若有外部/测试依赖静态工厂,迁移会破坏。characterization test(3a)已覆盖 campus schedule 工厂产出。
**回滚方案**:`git checkout -- src/agent/schedule/Schedule.js presets/campus/schedules.js index.js`。

---

## Wave 3d — WorldStateAdapter / compiler / migration 泛化(去 campus 特判)

**目标**:消除 `domainRef !== 'campus'` 特判,改为基于 domain 注册表/config 的通用校验。campus 不再是免校验特权域。

**写入边界**:
- 必改:`src/store/world/WorldStateAdapter.js:85-87`、`src/store/world/compiler.js:31-32`、`src/store/world/migration.js:127`。
- 不动:信封结构。
- 允许:domainRef 解析改为「校验 domainRef 是否有对应 domain config(经注册表或 config.domain 参数)」。

**实施要点**:
- `WorldStateAdapter.fromWorldState`:domainRef 校验改为「有 config.domain 则匹配 id;无 config.domain 则查注册表解析默认域(campus)」。campus 存档无 config 时仍可加载。
- `compiler.js`:同理,非 campus domain 必须有 domainConfig,但 campus 不再靠字面量特判,而靠「是否为已注册/默认域」。
- `migration.js:127`:默认 `domainRef:'campus'` 改为从存档/domainRef 解析,或入口层注入默认。
- 保证既有 campus 存档与自定义域存档 round-trip 不变(3a 测试覆盖)。

**测试前置**:Wave 3a/3b/3c 完成。
**验收命令**:
- `npm test`
- `npm run smoke:pack`
- `rg -n "domainRef !== 'campus'|domainRef === 'campus'" src/store/world/` 应清零或仅在入口层兼容分支

**风险点**:高。触碰存档加载路径,直接影响 campus 存档兼容性。这是 Wave 3 最高风险点。
**回滚方案**:`git checkout -- src/store/world/WorldStateAdapter.js src/store/world/compiler.js src/store/world/migration.js`。3a 的存档 round-trip 测试可验证回滚后仍兼容。

---

## Wave 3e — 终验与复核报告

**目标**:跑完整门控,产出 Wave 3 复核报告,确认 core 已从 campus 解耦且向后兼容成立。

**验收命令(AGENTS.md 全套 + 域纯度专项)**:
- `npm test`
- `npm run test:domain`
- `npm run check:boundaries`
- `npm run smoke:pack`
- `npm run perf:check`
- `git diff --check`
- 域纯度 grep:`rg -i "campus" src --glob '!**/config/**'` 仅剩注释 / 入口层向后兼容注入点(index.js)。
- `rg -n "require.*presets/campus" src/` 仅剩入口层(index.js),core src/domain/、src/agent/、src/store/ 为空。

**复核报告**:更新 `docs/current/WAVE3_DOMAIN_PURITY_MIGRATION_DESIGN.md` 标注实施完成状态,或在 `A_GRADE_REMEDIATION_ROADMAP.md` 记录。

---

## 委派策略

- Wave 3a(测试前置)先单独委派一个 worker,完成且全绿后再启动后续。
- Wave 3b/3c/3d 严格串行(同文件链依赖),不并行,每波独立验证后再启动下一波。
- 每个 worker 必须先读本计划文档 + Wave 3a 测试作为回归网。
- 架构师在每波 worker 返回后独立复核(grep + 测试),不轻信报告。

## 待用户确认(若有)
- DomainRegistry 是否引入显式 register/get 注册表(我倾向轻量:入口层维护默认域映射,core 保持纯机制即可)。默认按「不引入注册表,入口层注入」推进,除非你要求注册表。
