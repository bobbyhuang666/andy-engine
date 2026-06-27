# Aliveness Report

> 生成时间: 2026-06-27T17:41:51.836Z | 由 scripts/aliveness-report.js 从测试输出提取（非手写状态表）。
> ALIVENESS_BENCHMARK_RFC v0.3 §3 报告制度。每次 release 重新生成。

## 测试命令快照

| 命令 | 退出码 | 关键输出 |
|---|---|---|
| npm test | 0 | Test Files  169 passed (169) / Tests  2788 passed (2788) |
| npm run test:domain | 0 |  Test Files  5 passed (5) /       Tests  81 passed (81) |
| npm run perf:check | 0 | 100 agents avg/tick                26.48     25.52   1.04x   ✓ PASS / 300 agents avg/tick               192.61    202.48   0.95x   ✓ PASS / fixed-clustered gather (ms)        35.88     33.87   1.06x   ✓ PASS / fixed-clustered cache (ms)          6.27      7.33   0.86x   ✓ PASS / runtime-clustered gather (ms)      36.69     34.85   1.05x   ✓ PASS / ✓ All performance checks passed |
| npm run replay:diff | 0 | ticks: 100 | matched: 100 | mismatched: 0 |

## 七维度状态

### D1 World Persistence — Pass

- **标准**: 世界状态可序列化→反序列化→续跑，结构无损。
- **测试入口**: tests/unit/persistence-trust.test.js (G1/G2/G3/G6) + golden-seed-replay L1-L4 + tests/unit/replay-trust-l4.test.js
- **Owner**: store 层
- **特殊说明**: Pass (v2.2-W1 L4 修复) — v2.2-W1（commit 1de1176）完整修复 5 层 runtimeSnapshot 持久化缺口（EventDispatcher._nextId / Agent reflection counters / PersonalMemory presentations / memory.appraisal），L4 截断续跑主测试通过，续跑段 hash 与全程一致。W6 旧根因"toWorldState 丢失 memory"已证伪（memory 序列化正常）。
- **测试输出引用**: persistence-trust pass / golden-seed-replay pass / replay-trust-l4 pass / replay:diff exit 0

### D2 Character Continuity — Pass

- **标准**: 4 子指标全 Pass：memory continuity / need trajectory / relationship continuity / personality-BehaviorField stability。
- **测试入口**: tests/unit/serialization-roundtrip.test.js + tests/unit/golden-seed-replay.test.js
- **Owner**: agent memory/psychology/social 层
- **测试输出引用**: tests/unit/serialization-roundtrip.test.js pass

### D3 Epistemic Correctness — Pass

- **标准**: AGENT_STATE 视为私有知识；其他 agent 仅凭 direct/observed/told/inferred 证据获知。
- **测试入口**: tests/e2e/alice-bob-epistemic-boundary.test.js + tests/e2e/epistemic-evidence-matrix.test.js
- **Owner**: knowledge 层
- **测试输出引用**: alice-bob-epistemic-boundary pass / epistemic-evidence-matrix pass

### D4 Causal Consequence Writeback — Pass

- **标准**: world-changing event 产生 typed delta；observation/narrative-only event 显式分类并说明无写回原因。
- **测试入口**: tests/unit/effects/ (含 position-delta.test.js) + golden seed replay
- **Owner**: effects 层
- **测试输出引用**: tests/unit/effects/ 1/1 文件 pass

### D5 Grounded Narrative Faithfulness — Warning

- **标准**: narrative regression corpus + violation tracking（不承诺语义完备）。
- **测试入口**: tests/unit/narrative-violation-corpus.test.js + tests/fixtures/narrative-violations/
- **Owner**: narrative 层
- **特殊说明**: Warning (W8 corpus 已建) — corpus 首批 11 条覆盖 6 类，检出率 100% ≥80% 阈值（B3）。FactConsistencyChecker 当前为实验性/regex-based，仅作 violation 信号源，不达语义完备。误报率作为辅助信号，待 corpus 扩到 ≥30 后纳入 Warning 判定。
- **测试输出引用**: tests/unit/narrative-violation-corpus.test.js pass

### D6 Multi-Agent Social Emergence — Pass

- **标准**: triadic closure, Dunbar differentiation, emotion contagion convergence, gossip 2-hop, serialization fidelity.
- **测试入口**: tests/e2e/social-emergence.test.js + tests/e2e/gossip-propagation.test.js + tests/e2e/emotion-contagion-cluster.test.js
- **Owner**: social 层
- **测试输出引用**: social-emergence pass / gossip-propagation pass / emotion-contagion-cluster pass

### D7 Domain Portability — Pass

- **标准**: 同一 engine 跑 campus/tavern/自定义 domain，core src 不含具体世界词。
- **测试入口**: npm run test:domain + tests/compatibility.test.js
- **Owner**: domain 层
- **测试输出引用**: test:domain exit 0

## Sanity check

- **500 tick 不单调发散**: golden-seed-replay 100 ticks 稳定（通过）+ perf:check exit 0

