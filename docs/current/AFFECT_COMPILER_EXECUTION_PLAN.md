# A-Level Phase B1 — AffectCompiler Integration 执行计划

## 1. Current Path Audit

### 当前情绪到叙事路径

#### 直接读取 EmotionVector 的文件

| 文件 | 路径 | 用途 |
|------|------|------|
| EmotionVector.js | `src/agent/psychology/EmotionVector.js` | 内部心理状态 |
| AffectFrame.js | `src/shared/AffectFrame.js` | 提取 emotion snapshot |
| BasicAffectFrame.js | `src/shared/BasicAffectFrame.js` | 扩展 expression constraints |
| NarrativeBuilder.js | `src/sdk/NarrativeBuilder.js` | 解释 emotion labels |
| AndyEngineHelpers.js | `src/sdk/AndyEngineHelpers.js` | 构建 worldContext |
| AgentNarrative.js | `src/agent/facade/AgentNarrative.js` | 生成 narrative |

#### 直接解释 emotion labels 的文件

| 文件 | 路径 | 问题 |
|------|------|------|
| NarrativeBuilder.js | `src/sdk/NarrativeBuilder.js:154-206` | 直接从 affectFrame.emotions 解释情绪 |
| NarrativeBuilder.js | `src/sdk/NarrativeBuilder.js:330-358` | 直接检查 emotion dimension |
| AgentNarrative.js | `src/agent/facade/AgentNarrative.js:64-89` | 直接解释 valence 和 dominant |

#### BasicAffectFrame 当前生成位置

| 文件 | 路径 | 状态 |
|------|------|------|
| BasicAffectFrame.js | `src/shared/BasicAffectFrame.js` | 已实现，但是 seam 不是 compiler |
| tests/affect/basic-affect-frame.test.js | `tests/affect/basic-affect-frame.test.js` | 已有测试 |

#### AffectFrame 是否进入 narrative grounding package

**当前状态**: 否。AffectFrame 只作为可选参数传入 NarrativeBuilder，不进入 grounding package。

#### LLM prompt 是否还包含 raw emotion vector

**当前状态**: 是。`AndyEngineHelpers.buildWorldContext()` 返回 `emotionState: agent.emotion.toPromptString()`，这是 raw emotion vector 的字符串表示。

#### 测试覆盖情况

| 测试 | 覆盖内容 | 状态 |
|------|----------|------|
| basic-affect-frame.test.js | AffectFrame shape | ✅ |
| basic-affect-frame.test.js | Semantic diff tests | ✅ |
| narrativeBuilder-affect-frame.test.js | NarrativeBuilder 使用 AffectFrame | ✅ |
| alice-bob-epistemic-boundary.test.js | Epistemic boundary | ✅ |
| cause-effect-memory-narrative.test.js | Event provenance | ✅ |

**缺失测试**:
- Raw emotion 不泄漏到 LLM prompt
- LLM 只接收 constraints，不接收 raw emotion

---

## 2. Target Architecture

```
EmotionVector (30D)
NeedsState (5D)
RelationshipState
MemoryPressure
RecentEvents
BehaviorField (4D)
        ↓
AffectCompiler (src/agent/psychology/AffectCompiler.js)
        ↓
AffectFrame (src/shared/AffectFrame.js)
        ↓
Narrative Grounding Package
        ↓
LLM / Surface Wording
```

### 各层职责

| 层 | 职责 | 输入 | 输出 |
|----|------|------|------|
| EmotionVector | 内部心理状态 | - | 30D vector |
| NeedsState | 需求状态 | - | 5D vector |
| RelationshipState | 关系状态 | - | strength, type, history |
| MemoryPressure | 记忆压力 | - | activated memories |
| RecentEvents | 最近事件 | - | event list |
| BehaviorField | 行为场状态 | - | 4D vector |
| AffectCompiler | 状态到表达策略的编译器 | 上述所有 | AffectFrame |
| AffectFrame | 结构化表达约束 | - | expression constraints |
| Narrative Grounding | 叙事输入 | AffectFrame | prompt sections |
| LLM | 语言生成 | constraints | wording |

---

## 3. AffectFrame Contract

### 最小 contract

```javascript
{
  version: '0.2-basic',
  
  // 情绪带
  valenceBand: 'negative' | 'neutral' | 'positive',
  arousalBand: 'low' | 'medium' | 'high',
  
  // 人际姿态
  interpersonalPosture: 'open' | 'guarded' | 'attached' | 'avoidant' | 'guarded_closeness',
  
  // 表达约束 (0-1)
  warmth: number,
  directness: number,
  initiative: number,
  defensiveness: number,
  emotionalExplicitness: number,
  stability: number,
  
  // 表达限制
  visibleMicroBehaviors: string[],
  forbiddenExpressionModes: string[],
  
  // 溯源 (debug only, 不进入 LLM prompt)
  sourceSignals: {
    emotion: string[],
    needs: string[],
    relationship: string[],
    memoryPressure: string[]
  },
  
  // 元数据
  _meta: {
    version: '0.2-basic',
    compilerVersion: string
  }
}
```

### 约束

- 所有 number 必须 clamp 到 [0,1]
- 不允许 raw 30D vector 泄漏到 LLM prompt
- sourceSignals 只能是解释 trace，不是让 LLM 自行推断心理

---

## 4. AffectCompiler Inputs

### 必需输入

| 输入 | 来源 | 状态 |
|------|------|------|
| emotionVector snapshot | `agent.emotion` | ✅ 已有 |
| needs snapshot | `agent.needs.needs` | ✅ 已有 |
| behavior field state | `agent.behaviorField` | ✅ 已有 |

### 可选输入

| 输入 | 来源 | 状态 |
|------|------|------|
| relationship to interlocutor | `socialGraph.getRelationship()` | ⚠️ 需要传入 |
| memory pressure | `agent.memory` | ⚠️ 需要提取 |
| recent events | `eventDispatcher.eventLog` | ⚠️ 需要传入 |
| domain semantic profile | `domain.semanticProfile` | ⚠️ 需要传入 |

### 设计原则

- 如果当前系统没有某些输入，就设计 optional path，不要强行伪造
- 所有输入都是只读，不修改任何状态

---

## 5. Narrative Integration

### 需要修改的地方

#### 5.1 Narrative grounding package 增加 affectFrame

**文件**: `src/agent/facade/AgentNarrative.js`

**修改**:
```javascript
// 在 toNarrative 函数中
const groundingPackage = {
  // ... 现有字段
  affectFrame: buildBasicAffectFrame(agent)  // 新增
};
```

#### 5.2 NarrativeBuilder 不再直接从 raw emotion vector 推断语气

**文件**: `src/sdk/NarrativeBuilder.js`

**修改**:
- 删除 `_buildCurrentState` 中的 emotionNames map
- 删除 `_buildGuidelines` 中的 emotion dimension 检查
- 只使用 AffectFrame 的 expression constraints

#### 5.3 LLMAdapter / prompt builder 使用 affectFrame expression constraints

**文件**: `src/sdk/AndyEngineHelpers.js`

**修改**:
- 删除 `emotionState: agent.emotion.toPromptString()`
- 改为 `affectFrame: buildBasicAffectFrame(agent)`

#### 5.4 raw emotion vector 保留在 debug trace

**文件**: `src/shared/AffectFrame.js`

**修改**:
- 在 AffectFrame 中添加 `_debug` 字段，包含 raw emotion vector
- 只在 debug 模式下使用

---

## 6. Tests Required

### Test A: raw emotion not leaked

**目标**: 验证 normal narrative / LLM prompt 不包含 raw 30D emotion vector 或未编译的 emotion map。

**文件**: `tests/affect/no-raw-emotion-leak.test.js`

**断言**:
```javascript
// 1. Narrative 不包含 raw emotion labels
expect(narrative).not.toContain('效价=');
expect(narrative).not.toContain('唤醒=');
expect(narrative).not.toContain('关键维度：');

// 2. LLM prompt 不包含 raw emotion vector
const prompt = NarrativeBuilder.buildSystemPrompt(worldContext, { affectFrame });
expect(prompt).not.toContain('效价=');
expect(prompt).not.toContain('唤醒=');

// 3. Grounding package 不包含 raw emotion
const grounding = engine.getGroundingPackage('alice');
expect(grounding.emotionState).toBeUndefined();
```

### Test B: same valence different arousal

**目标**: 相同 valence，不同 arousal，产生不同 initiative / emotionalExplicitness / microBehaviors。

**文件**: `tests/affect/valence-arousal-diff.test.js`

**断言**:
```javascript
// 相同 valence，不同 arousal
const lowArousalFrame = buildBasicAffectFrame(lowArousalAgent);
const highArousalFrame = buildBasicAffectFrame(highArousalAgent);

// 不同 initiative
expect(highArousalFrame.initiative).toBeGreaterThan(lowArousalFrame.initiative);

// 不同 emotionalExplicitness
expect(highArousalFrame.emotionalExplicitness).toBeGreaterThan(lowArousalFrame.emotionalExplicitness);

// 不同 microBehaviors
expect(highArousalFrame.visibleMicroBehaviors).toContain('fidgeting');
expect(lowArousalFrame.visibleMicroBehaviors).not.toContain('fidgeting');
```

### Test C: relationship-aware posture

**目标**: 低 trust + 高 warmth → guarded_closeness 或 guarded but warm。

**文件**: `tests/affect/relationship-posture.test.js`

**断言**:
```javascript
// 低 trust + 高 warmth
const frame = buildBasicAffectFrame(agentWithLowTrustHighWarmth);

// 应该是 guarded_closeness 或 guarded
expect(['guarded_closeness', 'guarded']).toContain(frame.interpersonalPosture);

// warmth 应该高
expect(frame.warmth).toBeGreaterThan(0.5);

// defensiveness 应该中等
expect(frame.defensiveness).toBeGreaterThan(0.3);
expect(frame.defensiveness).toBeLessThan(0.7);
```

### Test D: memory pressure influence

**目标**: 同样 emotion vector，有 activated painful memory 时 defensiveness / emotionalExplicitness 应不同。

**文件**: `tests/affect/memory-pressure.test.js`

**断言**:
```javascript
// 无 painful memory
const frameWithoutPain = buildBasicAffectFrame(agentWithoutPainfulMemory);

// 有 painful memory
const frameWithPain = buildBasicAffectFrame(agentWithPainfulMemory);

// defensiveness 应该更高
expect(frameWithPain.defensiveness).toBeGreaterThan(frameWithoutPain.defensiveness);

// emotionalExplicitness 应该更低
expect(frameWithPain.emotionalExplicitness).toBeLessThan(frameWithoutPain.emotionalExplicitness);
```

### Test E: narrative consumes AffectFrame

**目标**: Narrative grounding package 必须包含 affectFrame。Narrative output 或 prompt 必须使用 affectFrame constraints。

**文件**: `tests/affect/narrative-consumes-affect-frame.test.js`

**断言**:
```javascript
// 1. Grounding package 包含 affectFrame
const grounding = engine.getGroundingPackage('alice');
expect(grounding.affectFrame).toBeDefined();
expect(grounding.affectFrame.version).toBe('0.2-basic');

// 2. Narrative 使用 affectFrame constraints
const narrative = engine.getNarrative('alice');
expect(narrative).toBeDefined();

// 3. Prompt 不包含 raw emotion
const prompt = NarrativeBuilder.buildSystemPrompt(worldContext, { affectFrame: grounding.affectFrame });
expect(prompt).not.toContain('效价=');
```

### Test F: LLM owns wording only

**目标**: 构造一个 fake LLM adapter，验证输入给 LLM 的是 constraints，不是要求 LLM 判断角色心理状态。

**文件**: `tests/affect/llm-owns-wording.test.js`

**断言**:
```javascript
// 1. LLM prompt 包含 expression constraints
const prompt = NarrativeBuilder.buildSystemPrompt(worldContext, { affectFrame });
expect(prompt).toContain('你现在心情不好'); // 来自 affectFrame.valenceBand
expect(prompt).not.toContain('效价=-0.3'); // 不包含 raw value

// 2. LLM prompt 不要求 LLM 判断心理状态
expect(prompt).not.toContain('判断角色情绪');
expect(prompt).not.toContain('分析心理状态');
```

---

## 7. Non-goals

### 禁止事项

- ❌ 禁止实现完整商业级 AffectCompiler
- ❌ 禁止引入 LLM 判断心理状态
- ❌ 禁止修改 EmotionVector 内部演化算法
- ❌ 禁止重构 PersonalMemory
- ❌ 禁止重构 AndyWorld
- ❌ 禁止全量 TypeScript 迁移
- ❌ 禁止把 AffectFrame 变成自然语言 summary
- ❌ 禁止改变 public API，除非同步 PUBLIC_API_CONTRACT 和 types

### 允许事项

- ✅ 添加 AffectCompiler 模块
- ✅ 修改 NarrativeBuilder 使用 AffectFrame
- ✅ 修改 AndyEngineHelpers 构建 AffectFrame
- ✅ 添加新测试
- ✅ 更新文档

---

## 8. Migration Strategy

### Stage B1.1: Audit and contract

**目标**: 审计当前路径，定义 AffectFrame contract。

**文件**:
- `docs/current/AFFECT_COMPILER_CONTRACT.md` — 新增

**内容**:
- 定义 AffectFrame 字段
- 定义输入输出
- 定义测试要求

### Stage B1.2: Implement AffectCompiler basic module

**目标**: 实现 AffectCompiler 模块。

**文件**:
- `src/agent/psychology/AffectCompiler.js` — 新增

**内容**:
- 从 EmotionVector / Needs / BehaviorField 提取
- 计算 valenceBand / arousalBand
- 计算 interpersonalPosture
- 计算 warmth / directness / initiative / defensiveness / emotionalExplicitness
- 计算 visibleMicroBehaviors / forbiddenExpressionModes
- 生成 sourceSignals

### Stage B1.3: Inject affectFrame into narrative grounding

**目标**: 将 AffectFrame 注入 narrative grounding package。

**文件**:
- `src/agent/facade/AgentNarrative.js` — 修改

**内容**:
- 在 toNarrative 函数中调用 AffectCompiler
- 将 affectFrame 添加到 grounding package

### Stage B1.4: Stop normal prompt from receiving raw emotion vector

**目标**: 停止 normal prompt 接收 raw emotion vector。

**文件**:
- `src/sdk/AndyEngineHelpers.js` — 修改
- `src/sdk/NarrativeBuilder.js` — 修改

**内容**:
- 删除 `emotionState: agent.emotion.toPromptString()`
- 改为 `affectFrame: buildBasicAffectFrame(agent)`
- 删除 NarrativeBuilder 中的 emotionNames map
- 删除 NarrativeBuilder 中的 emotion dimension 检查

### Stage B1.5: Add tests

**目标**: 添加测试。

**文件**:
- `tests/affect/no-raw-emotion-leak.test.js` — 新增
- `tests/affect/valence-arousal-diff.test.js` — 新增
- `tests/affect/relationship-posture.test.js` — 新增
- `tests/affect/memory-pressure.test.js` — 新增
- `tests/affect/narrative-consumes-affect-frame.test.js` — 新增
- `tests/affect/llm-owns-wording.test.js` — 新增

### Stage B1.6: Docs truth pass

**目标**: 更新文档。

**文件**:
- `docs/current/AFFECT_COMPILER_CONTRACT.md` — 更新
- `README.md` — 更新

---

## 9. Validation Matrix

执行 AI 完成后必须运行：

```bash
npm test
npm run release:gate
npm run check:boundaries
npm run typecheck
npm run smoke:pack
git diff --check
```

并单独运行新增 affect tests：

```bash
npm test -- tests/affect/
```

---

## 10. Output Format

### Changed files proposal

| 文件 | 操作 | 说明 |
|------|------|------|
| `src/agent/psychology/AffectCompiler.js` | 新增 | AffectCompiler 模块 |
| `src/agent/facade/AgentNarrative.js` | 修改 | 注入 affectFrame |
| `src/sdk/AndyEngineHelpers.js` | 修改 | 删除 raw emotion，使用 AffectFrame |
| `src/sdk/NarrativeBuilder.js` | 修改 | 删除 emotion 解释，使用 AffectFrame |
| `docs/current/AFFECT_COMPILER_CONTRACT.md` | 新增 | AffectCompiler contract |
| `tests/affect/no-raw-emotion-leak.test.js` | 新增 | 测试 |
| `tests/affect/valence-arousal-diff.test.js` | 新增 | 测试 |
| `tests/affect/relationship-posture.test.js` | 新增 | 测试 |
| `tests/affect/memory-pressure.test.js` | 新增 | 测试 |
| `tests/affect/narrative-consumes-affect-frame.test.js` | 新增 | 测试 |
| `tests/affect/llm-owns-wording.test.js` | 新增 | 测试 |

### Module design

**AffectCompiler**:
- 纯函数模块
- 输入: agent 状态
- 输出: AffectFrame
- 不修改任何状态

**AffectFrame**:
- 结构化表达约束
- 不包含 raw emotion vector
- 包含 sourceSignals 用于 debug

### Risk assessment

| 风险 | 影响 | 缓解措施 |
|------|------|----------|
| 删除 raw emotion 可能破坏现有测试 | 中 | 保留 debug trace |
| AffectCompiler 计算可能不准确 | 低 | 使用现有启发式算法 |
| NarrativeBuilder 修改可能破坏输出 | 中 | 保留向后兼容路径 |

### Execution order

1. Stage B1.1: Audit and contract
2. Stage B1.2: Implement AffectCompiler basic module
3. Stage B1.3: Inject affectFrame into narrative grounding
4. Stage B1.4: Stop normal prompt from receiving raw emotion vector
5. Stage B1.5: Add tests
6. Stage B1.6: Docs truth pass

### Validation commands

```bash
npm test
npm run release:gate
npm run check:boundaries
npm run typecheck
npm run smoke:pack
git diff --check
npm test -- tests/affect/
```
