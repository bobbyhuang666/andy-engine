# v2.7 Direction Brief

> 2026-06-27 | v2.6 关闭后方向评估

---

## 背景

v2.6 关闭后，aliveness D1-D7 中唯一非 Pass 维度是 D5（Grounded Narrative Faithfulness = Warning）。其余 6 维全 Pass。

两个候选方向：
1. **D5 Hardening** — 将 D5 从 Warning 升为 Pass
2. **Release Readiness** — 评估发布准备度，补齐 consumer-facing 缺口

本 brief 对比两者，给出建议。

---

## 候选方向 A：D5 Narrative Faithfulness Hardening

### 当前状态（代码级证据）

| 项目 | 状态 |
|---|---|
| FactConsistencyChecker | 100% regex-based，847 行，9 个子检查器，自标注"实验性" |
| Corpus 规模 | 35 条（nv-001→nv-035），覆盖 10 类（9 violation + pass） |
| 检出率 gate | ≥85%（non-boundary），实际 100% |
| 边界 case | 5 条（may_detect: false），soft-assert |
| 测试覆盖 | ~151 个测试（4 个文件） |
| **D5 判定代码路径** | **无 Pass 路径** — `judgeDimension` 仅返回 Warning 或 Gap |

### 关键发现：D5 无 Pass 出口

```javascript
// aliveness-report.js line 154-158
if (dim.id === 'D5') {
  const corpusStatus = findFileStatus(testParsed, 'narrative-violation-corpus');
  if (corpusStatus === 'pass') return 'Warning';  // 永远是 Warning
  return 'Gap';
}
```

即使 corpus 测试 100% 通过，D5 永远是 Warning。升 Pass 需要修改判定逻辑。

### 升 Pass 的真实门槛

`specialNote` 列出了隐含条件（但未编码）：

1. **Checker 不再是 regex-only** — 当前 9 个子检查器全部依赖硬编码中文正则和词表。无语义分析、无 embedding 相似度、无 LLM-in-the-loop。
2. **Corpus ≥ 30** — 已达（35 条），但 corpus 是手工构造来匹配 regex 触发模式的，不是从真实 LLM 输出中采集的。100% 检出率证明 regex 在自己的触发模式上工作，不证明能捕获真实 LLM 幻觉。
3. **误报率纳入判定** — 当前 pass 样本误报 ≤1，但只有 6 个 pass 样本，统计意义不足。

### 升 Pass 的工作量估算

| 方案 | 工作量 | 风险 |
|---|---|---|
| **方案 A1：轻量升级** — 修改判定逻辑 + 扩 corpus + 量化误报 | 2-3 工作包 | Corpus 仍手工构造，不改变 regex 本质 |
| **方案 A2：中期升级** — A1 + 添加 claim extraction（非 regex） | 4-6 工作包 | 需设计 claim extraction 架构，可能引入 LLM dependency |
| **方案 A3：完整升级** — A2 + 语义级 checker | 8+ 工作包 | 本质上是新系统，v2.7 scope 过大 |

**方案 A1 不改变 regex 本质**，只是把 Warning 标签换成 Pass。如果 checker 仍 regex-only，这个 Pass 的可信度存疑。

**方案 A2 是合理的中间态**，但需要设计 claim extraction 架构决策（继续 regex？改规则引擎？引入 embedding？），这本身是方向选择。

### D5 是否是 release blocker？

**判断：对于 alpha release 不是 blocker，对于 stable release 是。**

理由：
- D5 Warning 的语义是"checker 实验性，不达语义完备"——这是一个诚实声明
- Consumer 可以理解：narrative faithfulness 检查是 best-effort，不是保证
- 但如果宣称 stable / production-ready，D5 Warning 意味着 narrative 可能包含未捕获的幻觉
- 当前项目定位是 "Foundation Alpha"（README line 16），alpha 阶段 Warning 可接受

---

## 候选方向 B：Release Readiness

### 当前发布准备度评估（代码级证据）

#### 已就绪

| 项目 | 状态 | 证据 |
|---|---|---|
| 公共 API 面定义 | ✓ | 10 subpath，package.json exports 与 PUBLIC_API_CONTRACT.md 一致 |
| 打包基础设施 | ✓ | smoke:pack (18 assertions), release-gate (11 checks), fresh-consumer-matrix |
| 边界强制 | ✓ | check-boundaries.js 自动化 |
| 核心 TS 声明 | ✓ | index.d.ts + sdk/index.d.ts |
| Domain preset | ✓ | campus (855行) + tavern (582行) |
| 门控全绿 | ✓ | 7-command gate 全 pass |

#### 未就绪

| 缺口 | 严重度 | 说明 |
|---|---|---|
| **无 CHANGELOG** | 高 | v2.0.1 无版本历史，consumer 无从了解变更 |
| **Examples 引用本地路径** | 中 | `quickstart.js` 用 `require('../../index')`，npm install 后不可用 |
| **6/10 subpath 无 TS 声明** | 中 | domain/facts/store/config/presets 无 .d.ts |
| **无 ESM 支持** | 低 | exports 仅 `require` 条件，无 `import` |
| **README 矛盾** | 低 | 声称 "npm publish not planned" 但打包基础设施假设 npm 分发 |
| **smoke:pack 不测行为** | 中 | 18 assertions 仅验证 import 可达，不测 persistence/SDK chat/facts pipeline |
| **domain/validate 和 domain/registry 绕过 facade** | 低 | 指向 src/ 文件，consumer 直达内部 |
| **从未 npm publish** | 信息性 | 无真实 consumer 反馈 |

### Release Readiness 工作量估算

| 方案 | 工作量 | 产出 |
|---|---|---|
| **方案 B1：最小 release 准备** — CHANGELOG + 修 examples + README 一致性 | 2 工作包 | alpha 可发布 |
| **方案 B2：标准 release 准备** — B1 + 补 TS 声明 + 扩 smoke:pack 行为测试 | 4-5 工作包 | 接近 stable |
| **方案 B3：完整 release 准备** — B2 + ESM + 所有 subpath TS | 6-8 工作包 | stable 可发布 |

---

## 对比与建议

### 风险矩阵

| 方向 | 技术风险 | 范围风险 | 收益 |
|---|---|---|---|
| A1 D5 轻量升 Pass | 低（改判定逻辑+扩corpus） | 低 | D5 标签变化，但实质未变 |
| A2 D5 中期升 Pass | 中（claim extraction 架构决策） | 中 | checker 能力提升，但仍是过渡态 |
| B1 最小 release 准备 | 低 | 低 | 项目首次可 alpha 发布 |
| B2 标准 release 准备 | 低-中 | 中 | 接近 stable 发布质量 |

### 核心判断

1. **D5 的 Pass 标签与实质**：方案 A1 可以让 D5 变成 Pass，但如果 checker 仍是 regex-only，这个 Pass 的技术含量有限。D5 Warning 是对当前能力的诚实描述，强行升 Pass 可能反而降低 aliveness 报告的可信度。

2. **Release readiness 的杠杆效应**：B1/B2 的工作（CHANGELOG、examples、TS 声明、行为测试）对所有 consumer 有直接价值，不依赖 checker 能力提升。

3. **D5 不是 alpha release blocker**：当前项目定位是 Foundation Alpha，D5 Warning 可接受。

4. **D5 可能是 stable release blocker**：如果未来宣称 production-ready，regex-only checker 不够。

### 建议路径

```
v2.7: B1 (最小 release 准备)
  → 产出可 alpha 发布的包
  → D5 保持 Warning（诚实声明）

v2.8: D5 A2 (中期 hardening)
  → claim extraction 架构
  → 量化真实 LLM 输出的检出率/误报率
  → D5 升 Pass（有实质支撑）

v2.9: B2 (标准 release 准备)
  → TS 声明补齐
  → smoke:pack 行为扩展
  → stable 发布评估
```

### 如果必须选一个

**v2.7 = B1（Release Readiness）**

理由：
- B1 工作量小（2 WP），杠杆效应大
- D5 Warning 不阻塞 alpha 发布
- 先让项目可被外部 consumer 使用，获得真实反馈
- 再回来 harden D5，可以基于真实 consumer 场景设计 checker 升级

---

## v2.7 B1 工作包草案（待审批）

| WP | 内容 | 验收 |
|---|---|---|
| W1 | 创建 CHANGELOG.md（v2.0→v2.6 变更记录） | CHANGELOG 存在且覆盖所有 commit |
| W2 | 修复 examples 引用（本地路径→包名兼容） | smoke:pack + fresh-consumer-matrix 通过 |
| W3 | README 一致性修复（npm publish 说法、测试计数自动化） | release-gate 通过 |
| W4 | 全量门控 + aliveness report 更新 | 7-command gate 全绿 |

**不包含**：D5 hardening、TS 声明补齐、ESM 支持、npm publish 执行。

---

## 附录：D5 checker 能力边界速查

| 子检查器 | 方法 | 已知局限 |
|---|---|---|
| _checkCharacterNames | 正则：2-4汉字+动作词 | 中文名误报，5 词白名单 |
| _checkLocationNames | 正则：在/去/到/从+2-6汉字 | "找到了" 误触发，9 后缀排除 |
| _checkEventKnowledge | 正则：那次/上次+2-20字符 | 仅匹配回指词，不检测自由叙述 |
| _checkTimeConflicts | 硬编码日夜二元 | 无细粒度时间冲突检测 |
| _checkNewContent | 正则：5 关系词+事件词 | 仅硬编码模式，不检测自由叙述 |
| _checkAgentLocationClaims | 正则：名字+方位词+地点 | 依赖 agent ID 匹配 |
| _checkMissingSourceAttribution | 11 told 标记+11 inferred 标记 | 全文搜索，非 per-fact 追踪 |
| _checkAgentStateLeak | 33 情绪词+9 需求词+18 活动词 | 两层证据判定（v2.5-W2/W3），但词汇硬编码 |
| _checkLocalScopeLeak | 子串匹配+4 字滑动窗口 | 无语义匹配 |
