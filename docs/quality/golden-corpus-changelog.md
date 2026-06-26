# Golden Corpus Changelog

> 有意行为变更更新 golden fixture 的审计痕迹（REPLAY_TRUST_ROADMAP §5）。
> `replay-diff --accept-intentional` 跳过立即 fail，**不**跳过本 changelog 记录义务（Q3 裁定）。
> 未记录原因的 fixture 更新视为流程违规，不合并。

## 记录格式

每条记录字段：

| 字段 | 说明 |
|---|---|
| date | 变更日期（ISO） |
| commit | 变更引入的 commit hash |
| fixture | 受影响 fixture 文件路径 |
| ticks | 受影响 tick 范围 |
| 原因 | 功能演进 / bug 修复 / schema 升级（具体说明） |
| 审阅人 | 审阅人标识 |

## 记录

| date | commit | fixture | ticks | 原因 | 审阅人 |
|---|---|---|---|---|---|
| 2026-06-26 | b34b7fe | tests/fixtures/golden-campus-seed42-100ticks.json | 0-99 | W3 首版生成（含 _meta + tickHashes 升级，seed42/100ticks 基线） | W3 |
