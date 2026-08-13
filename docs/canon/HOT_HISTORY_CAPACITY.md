# Canon Hot History Capacity (RFC W6 / Patch F Phase A)

> RFC: [`../rfc/POST_V2_0_1_RELIABILITY_OPTIMIZATION_RFC.md`](../rfc/POST_V2_0_1_RELIABILITY_OPTIMIZATION_RFC.md) §5.W6
> 状态: Phase A (Beta 最低要求) — 可观测;Phase B (耐久历史) 尚未实现

## 热历史容量边界

`WorldFactStore` 是 **canonical hot view**，不是完整 canonical log。
每种事实类型有硬上限，超过时按时间戳最旧优先淘汰到上限的 80%。

| 事实类型 | 上限 | 80% 保留量 |
| --- | --- | --- |
| EVENT | 2000 | 1600 |
| OBSERVATION | 2000 | 1600 |
| MEMORY | 5000 | 4000 |
| INVALIDATED | 2000 | 1600 |
| STATIC_ENV | 500 | 400 |
| AGENT_STATE | 1000 | 800 |
| RELATIONSHIP | 2000 | 1600 |
| RULE | 200 | 160 |
| LOCATION_MEANING | 500 | 400 |
| INTENTION | 500 | 400 |

上限定义在 `src/canon/WorldFactStore.js` 的 `FACT_TYPE_LIMITS` map 中，
同时驱动 `addFact()` 和 `fromJSON()` 的 eviction。

## 重要约束：未配置 archive 时不可承诺无限历史

**当前没有 durable archive。** 超过热上限的旧事实会被**永久删除**，
连同相关知识 (KnowledgeStore entries)。这不是 bug，是内存有界设计——
但产品契约必须明确：

- 长运行世界（>2000 个事件）会丢失最早的 Canon 历史。
- 丢失后无法恢复，只能通过 `getStats().retention` 观测丢失边界。
- 任何"长周期世界历史"能力声明必须等待 Phase B (durable archive) 完成。

## Eviction 可观测性 (Phase A)

每次 eviction 产生内部 receipt，可通过 `getStats().retention` 查看：

```js
const stats = worldFactStore.getStats();
stats.retention.event;
// {
//   cap: 2000,
//   current: 1600,          // 当前热存储中的数量
//   totalEvicted: 401       // 累计淘汰数
// }
stats.retention.lastEvictionReceipt;
// {
//   type: 'event',
//   count: 401,             // 本次淘汰数量
//   oldestMs: 1704067200000, // 被淘汰的最旧时间戳
//   newestMs: 1704067800000, // 被淘汰的最新时间戳
//   reason: 'capacity_overflow',
//   simTimeMs: 1723456789000 // eviction 发生时的模拟时间（非 wall-clock）
// }
stats.retention.totalEvictionEvents; // 累计 eviction 事件数
```

`_evictionReceipts` 保留最近 100 条 receipt（防止无界内存增长）。
这些字段是 **internal/experimental**，不在稳定公共 envelope 中；
消费者当前不应依赖它们，Phase B 完成后再评估是否公开。

## Phase B (耐久历史) — 尚未实现

Phase B 设计（见 RFC §5.W6）：
- `FactArchiveSink.append(facts, receipt)` 由 SQLite/宿主实现。
- eviction 前批量 append，成功后再从 hot store 移除。
- checkpoint 保存 archive watermark；恢复时校验单调。
- archive failure 默认保留热事实 + tick degraded，不静默删。

**在 Phase B 完成前，长周期历史能力声明固定为不可用。**

## 复现验证

```js
// 2001 个 EventFact → 淘汰 401，保留 1600（80% of 2000）
const store = new WorldFactStore();
for (let i = 0; i < 2001; i++) {
  store.addFact({ type: 'event', /* ... */ timestamp: new Date(2026, 0, 1 + i) });
}
store.getStats().retention.event;
// { cap: 2000, current: 1600, totalEvicted: 401 }
store.getStats().retention.lastEvictionReceipt.count; // 401
```
