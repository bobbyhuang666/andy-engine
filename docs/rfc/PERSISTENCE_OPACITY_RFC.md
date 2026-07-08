# RFC: Migration v0→v1 与 runtimeSnapshot Opacity 契约的张力

> 状态:**Open(待澄清)** · 优先级:P1/契约一致性 · 不阻塞当前硬化
> 关联:P1 Persistence trust · `docs/WORLD_SCHEMA.md` §4.7 / §5.2
> 说明:记录构建 persistence-trust 测试时发现的契约与实现张力。

---

## 0. 摘要

`docs/WORLD_SCHEMA.md` 声明 migration「不定义 runtimeSnapshot internals」(§4.7/§5.2),
但 `src/store/world/migration.js` 的 v0→v1 迁移**必须**构造 runtimeSnapshot(因 v0 是
pre-envelope 的扁平 `AndyEngine.toJSON()` 输出,无结构化 snapshot)。这构成契约文字与
实现之间的张力。本 RFC 澄清:这是**契约措辞不精确**,非代码违规,并提议文档修订方案。

---

## 1. 现状

### 1.1 契约声明

`docs/WORLD_SCHEMA.md:184-187`:

> **关键约束：**
> - `runtimeSnapshot` 的内部结构**不是公共契约**
> - Validator **只做 `typeof === 'object'` 校验**，不解析内部细节
> - Stable Envelope validator does not inspect runtimeSnapshot. **Stable Envelope migration does not define runtimeSnapshot internals.** Runtime snapshot compatibility/migration is a future engine-owned concern outside core tick runtime.

`docs/WORLD_SCHEMA.md:230-233`:

> Migration Pipeline **只转换 Stable World Envelope**：
> - 补齐缺失的公共字段（如 `schemaVersion`、`worldId`）
> - 转换字段格式（如 `stateVersion` → `schemaVersion`）
> - 修正引用一致性（如确保 `relationships` 中的角色 ID 存在）

### 1.2 实现现状

`src/store/world/migration.js:94-123`(v0→v1 `migrateV0ToV1`):

```js
// 构建 runtimeSnapshot events（全新对象，不修改原 oldState.events）
const originalEventLog = (oldState.events && oldState.events.eventLog) || [];
const migratedEventLog = originalEventLog.map(evt => {
  let time = evt.time;
  if (typeof time === 'string') { time = new Date(time); }
  return { participants: [], observers: [], effects: [], cause: null, scope: 'local', ...evt, time };
});
const runtimeSnapshotEvents = { eventLog: migratedEventLog };

const runtimeSnapshot = JSON.parse(JSON.stringify({
  time: oldState.time || ...,
  tickCount: ...,
  environment: ...,
  agents: oldState.agents || {},
  socialGraph: ...,
}));
runtimeSnapshot.events = runtimeSnapshotEvents;   // ← 触及 runtimeSnapshot 内部
```

### 1.3 张力

- 契约说 migration「不定义 runtimeSnapshot internals」。
- 但 v0 没有结构化 runtimeSnapshot——v0 是 pre-envelope 的扁平输出
  (`AndyEngine.toJSON()` 直接产出 `{ time, tickCount, agents, socialGraph, events }`)。
- v0→v1 迁移**必须**把 v0 的扁平字段重组进 v1 的 `runtimeSnapshot`,并补齐 events
  的 engine 期望字段(`participants`/`observers`/`effects`/`cause`/`scope`)。
  否则 v0 存档加载后 engine 会因 events 缺字段而崩。

**这是「无 Envelope → 有 Envelope」迁移的固有需求**,不是 opacity 违规。
opacity 契约的本意是针对 **v1+ 之间**的迁移(此时 runtimeSnapshot 已存在,应 opaque 传递)。

---

## 2. 判定

**这是契约措辞不精确,非代码违规。**

理由:
1. v0→v1 是「无结构 → 有结构」迁移,必然要定义 v1 runtimeSnapshot 的内部形状。
2. opacity 契约的真实语义是「已结构化的 runtimeSnapshot 在 v1+ 迁移中不被解析/重写」。
3. migration.js 的 header comment(line 8-9「Opaque runtimeSnapshot: 只做深拷贝」)
   与 v0→v1 的构造行为表面矛盾,但 v0→v1 是特殊情形(构造,非拷贝)。

代码行为正确(v0 存档可加载),问题在契约文字未区分「v0→v1 构造」与「v1+ 传递」。

---

## 3. 方案

### 方案 A:修订契约文档(推荐)

更新 `docs/WORLD_SCHEMA.md` §4.7 / §5.2,明确区分:

- **v0→v1 迁移**(无 Envelope → 有 Envelope):**必须**构造 runtimeSnapshot,
  从 v0 扁平字段重组并补齐 engine 期望字段。这是构造,非 opacity 违规。
- **v1+ 迁移**(已有 Envelope):runtimeSnapshot 是 opaque payload,migration
  只深拷贝、不解析、不重写内部结构。

同时更新 `migration.js` header comment,标注 v0→v1 是构造例外。

**代价**:纯文档改动,零代码风险。
**收益**:契约文字与实现一致,消除审计歧义。

### 方案 B:重构 v0→v1 让 engine 自己补齐

让 migration 只把 v0 扁平字段原样塞进 `runtimeSnapshot`(不补 events 字段),
engine ctor 在加载时自行补齐缺失的 events 字段。

**代价**:改 engine ctor,blast radius 大;且 engine 不应「知道」v0 形状(违反封装)。
**收益**:migration 严格 opaque。但不值得——v0 是历史格式,engine 不该背负兼容包袱。

### 方案 C:不修(维持现状)

接受契约文字与实现张力。`persistence-trust.test.js` G1 已锁定 fromWorldState 的
opacity forwarding(v1+ 路径),G2 锁定 idempotent round-trip。v0→v1 的构造行为
由现有 `world-tooling.test.js` 的 v0 fixture 测试覆盖。零代价,但契约文字歧义留存。

---

## 4. 推荐

**方案 A**:纯文档修订,消除歧义,零风险。属 P1 Public contract discipline 范畴。

本 RFC 不立即改文档(留待 Public contract discipline 波次统一处理契约文档),
仅记录判定:**代码无违规,契约文字待修订**。

---

## 5. 验收标准(未来执行时)

- [ ] `docs/WORLD_SCHEMA.md` §4.7/§5.2 明确区分 v0→v1 构造与 v1+ opaque 传递。
- [ ] `migration.js` header comment 标注 v0→v1 构造例外。
- [ ] `persistence-trust.test.js` G1/G2 仍绿。
- [ ] 现有 `world-tooling.test.js` v0 迁移测试仍绿。
