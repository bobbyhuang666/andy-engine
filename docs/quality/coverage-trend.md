# Coverage Trend

> Foundation Alpha 阶段 coverage 趋势追踪。coverage 不作为 release/merge blocker（见 QUALITY_GATE_RFC v0.3 §2 方案 c），仅作 trend metric + 3pp 回归 warning。
> 每次 release 由 `npm run test:coverage` 产出数值后 append 一条。

## 基线规则

- 数值来源：`npm run test:coverage` 的 `All files` 汇总行。
- 4 项指标：statements / branches / functions / lines。
- 回归 warning：任一指标较上次 release 下降超过 3 个百分点，发 warning，需在 release notes 说明原因。
- 小数四舍五入到两位。

## 趋势记录

| date | engineVersion | commit | stmts | branches | functions | lines | note |
|---|---|---|---|---|---|---|---|
| 2026-06-26 | 2.0.1 | W1 baseline | 80.56 | 68.46 | 77.96 | 82.48 | W1 thresholds 移除后首条基线 |

## 备注

- v2.0.1 基线为 thresholds 移除后的首条记录。此前 `vitest.config.js` 声明 thresholds（stmt 80 / branch 70 / func 85 / line 80），实测 functions 77.7% / branches 68.0% 未达阈会导致 `test:coverage` exit 1。W1 移除 thresholds 后，`test:coverage` 退出码归 0，coverage 数据进入本趋势文档供回归监控。
