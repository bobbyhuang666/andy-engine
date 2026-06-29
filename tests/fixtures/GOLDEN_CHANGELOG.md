# Golden Fixture Changelog

> 记录 golden fixture 每次变更的原因。fixture 是确定性快照,任何行为变化都会改变快照,
> 必须记录变更来源,避免后续 agent 误判为"回归"。

## 2026-06-29 R39 — agent 移动 + FactEmitter 性能修复

**变更文件**: `golden-campus-seed42-100ticks.json` (regen)

**触发修复**:
1. `ScheduleHandler.js` IM 探索门槛从 `urgency > 0.1` 降到 `> 0`,并移除夜间对探索的硬性拦截
   (原逻辑在 lateNight 时段完全跳过探索,只用 isSleeping 状态拦截即可)。
   - **影响**: 无 schedule 的 agent 从 200 tick 只访问 1 个位置(卡宿舍)→ 访问 18 个位置。
2. `FactEmitter.emitRelationshipFacts` 把 `getRelationshipFacts()` 从双重循环内部提到外部,
   建 agent pair 索引,O(n²)→O(n)。
   - **影响**: 50a×50t 耗时 24534ms→1203ms(20x)。relationship fact 的写入顺序/数量不变,
     但 factStore 内部索引重建顺序可能影响遍历顺序,导致快照字段顺序微变。

**快照差异**: agent position 变化(maya: 打工地点→食堂, leo: 公园→教室 等)、
memory/explorationHistory 因 agent 真正移动而变化。这些都是修复的**预期结果**,非回归。

**确定性验证**: cross-check(两次同 seed 运行产生相同快照)✓,per-tick tickHash 跨 run 稳定 ✓。
