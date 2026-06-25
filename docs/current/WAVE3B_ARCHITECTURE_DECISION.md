# Wave 3b 架构决策点 — core 对 campus 的隐式依赖

> 状态:**待用户决策**。Wave 3b-0 已完成(模块级硬绑定消除,行为中性),3b-1 暴露真实障碍。

## 已完成:Wave 3b-0(行为中性重构)

4 个文件的模块级 `const defaultDomain = getDefaultDomain()`(require 时即求值)已改为惰性求值。这一步纯行为中性,2052 测试通过。模块级硬绑定已消除。

## 暴露的真实障碍:11 处构造函数级兜底

core 内仍有 11 处 `this.domain = domain || getDefaultDomain()` 兜底:
- `AndyWorld.js:38`、`EventDispatcher.js:23`、`PersonalMemory.js:41`、`Appraisal.js:41`、
  `StateMachine.js:26`、`NeedsSystem.js:67`、`IntrinsicMotivation.js:47`、`BehaviorField.js:120`、
  `AgentSubsystemFactory.js:56`、`MemoryCandidateProvider.js:73`、`NarrativeBuilder.js:32`。

**事实**:在真实引擎路径(index.js 总传 `this.domain`),这些兜底**永不触发**,是死代码。
**但**:独立测试直接构造这些子系统时不传 domain,会触发兜底拿到 `getDefaultDomain()` 的返回值。

之前 3b-1 方案(空壳 EMPTY_DOMAIN)失败根因:这 11 处兜底拿到空壳后,子系统用空壳的 `stateCenters`/`needSatisfactionMap` 等计算,崩溃 → 58 测试红。

## 三个方案(架构取舍)

### 方案 A:彻底消除兜底,domain 改必传(A 级,工作量大)
- 11 处 `|| getDefaultDomain()` 删除,domain 改为必填,缺失抛错。
- 所有直接构造子系统的测试改为显式传 domain(或传 campus preset)。
- **优点**:core 完全无 campus 依赖,最符合用户「core 不再硬编码 campus」目标。
- **代价**:触及 11 个 src 文件 + 多个测试文件,工作量大,偏离 Wave 3b 边界。
- **风险**:构造函数签名语义变化(domain 从可选变必填),需排查所有调用点。

### 方案 B:getDefaultDomain 惰性 require campus(渐进,core 仍间接耦合)
- `getDefaultDomain()` 改为函数内惰性 `require('../../presets/campus')`,顶层无 `const campusDomain`。
- **优点**:行为完全不变(全绿);顶层 grep `const.*require.*campus` 清零;模块级硬绑定已由 3b-0 消除。
- **代价**:core 仍间接耦合 campus(getDefaultDomain 内部 require),不满足「core 完全无 campus 字面量」。
- **定位**:这是「core 无顶层硬编码 + 无模块级硬绑定」的渐进中间态。

### 方案 C:暂缓 3b-1,先推进 3c/3d(收益优先)
- 3b-0 已消除最严重的模块级硬绑定。3b-1(getDefaultDomain 解耦)暂缓。
- 先做 3c(Schedule 工厂出 core)、3d(WorldStateAdapter 泛化),这两处是更直接的 campus 字面量特判。
- **优点**:先把易解、高收益的 campus 字面量清掉,3b-1 作为遗留。
- **代价**:DomainRegistry.js 顶层 `require(presets/campus)` 仍在。

## 架构师建议

**方案 B + 后续 A**:
- 先用方案 B 让 3b-1 全绿推进(惰性 require,行为不变,顶层硬编码清零)。
- 把方案 A(彻底消除 11 处兜底)列为 Wave 3 后续或独立 RFC,因为它触及构造函数签名语义,应单独评审。
- 理由:方案 B 已达成「core 无顶层 campus 硬编码 + 无模块级硬绑定」的实质进展,且零风险;方案 A 是更大重构,不应混入当前高风险迁移。

**若用户坚持 core 完全无 campus 依赖**:选方案 A,但需批准扩大写入边界(11 src + 测试)。

## 待用户决策
1. 方案 A(彻底,工作量大,触及构造函数语义)?
2. 方案 B(惰性 require,渐进,全绿,core 仍间接耦合)— 架构师推荐?
3. 方案 C(暂缓 3b-1,先 3c/3d)?
