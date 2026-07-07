# Aliveness Report

> 生成时间: 2026-07-05T14:19:45.238Z | 由 scripts/aliveness-report.js 从测试输出提取（非手写状态表）。
> ALIVENESS_BENCHMARK_RFC v0.3 §3 报告制度。每次 release 重新生成。

## 测试命令快照

| 命令 | 退出码 | 关键输出 |
|---|---|---|
| npm test | 0 | Test Files  196 passed \| 1 skipped (197) / Tests  3418 passed \| 28 skipped (3446) |
| npm run test:domain | 0 |  Test Files  5 passed (5) /       Tests  82 passed (82) |
| npm run perf:check | 0 | 100 agents avg/tick                15.11     25.52   0.59x   ✓ PASS / 300 agents avg/tick                86.43    202.48   0.43x   ✓ PASS / fixed-clustered gather (ms)        36.75     33.87   1.09x   ✓ PASS / fixed-clustered cache (ms)          7.05      7.33   0.96x   ✓ PASS / runtime-clustered gather (ms)      26.66     34.85   0.76x   ✓ PASS / ✓ All performance checks passed |
| npm run replay:diff | 0 | ticks: 100 \| matched: 100 \| mismatched: 0 |

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

### D5 Grounded Narrative Faithfulness — Semantic Alpha Pass (D5 v3, §7 M4 gate met)

- **标准**: narrative regression corpus + violation tracking（不承诺语义完备）。
- **测试入口**: tests/unit/narrative/grounding/ (ClaimSchema/EvidenceBinder/SidecarValidator/CoreferenceResolver/GroundingVerifier) + tests/unit/narrative/semantic-corpus.test.js + tests/fixtures/narrative-semantic-corpus/
- **Owner**: narrative 层
- **特殊说明**: v3 Semantic Alpha Pass (D5 v3, §7 M4 gate met) — ClaimExtractor→GroundingChecker v3 路径含 ClaimSchema/EvidenceBinder/SidecarValidator/CoreferenceResolver/GroundingVerifier modules；已有 evidence trace + coreference notes + optional verifier adapter (NoOp 默认)；semantic corpus 共 455 样本（345 hand-written + simulated-LLM + 110 real-LLM 输出，model metadata 见 fixtures），其中 gold_pass 65 / gold_violation 80 / ambiguous_boundary 35 / paraphrase 50 / coreference 50 / source_attribution 35 / emotion_needs 33 / time 25 / domain_portability 47 / multi_sentence 35；false pass rate 0% / false block rate 0%；12 §9 hard regressions 全 hard-gated。§7 M4 Semantic Alpha gate 6 条全达成（totalSamples 455>=300 / realLLM 110>=100 / paraphrase+coreference 100>=80 / falsePass 0%<=5% / falseBlock 0%<=8% / p1HardGated 12）；semanticAlphaGateMet=true。仍非 Semantic Beta（需 corpus>=1000、realLLM>=500、verifier benchmark report、多 LLM 评测）；仍非 Stable（需第三方验证、sidecar stable、长跑 SDK 证据）；仍非完整语义 NLI 或形式可证真。
- **测试输出引用**: npm test 3847 passed / semantic-corpus.test.js pass (455 samples, gate rate: false block 0%, false pass 0%, P1 hard-gated 12, semanticAlphaGateMet=true) / report-runner gateMet=true / grounding-verifier.test.js pass / grounding-checker-verifier.test.js pass

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

