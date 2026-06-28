# StoryArc Feedback Gate — Phase 31 Pre-Implementation Review

> **这不是实现计划。这是 StoryArc 系统的架构审计和安全防护设计文档。**
> **StoryArc 实现需要 Phase 26-30 审核通过后，由人工/审核者明确批准。**

---

## 1. Context

StoryArc 是高风险系统。如果实现不当，会导致：
- 叙事引擎直接控制 agent 行为（绕过 BehaviorField）
- 关系被脚本强制覆盖
- 情绪被叙事直接操纵
- LLM 输出成为未经验证的世界事实

Phase 31 的目标是：**列出安全防护要求，设计防止脚本化控制的测试，编写预实现审查文档。**

---

## 2. StoryArc 的合法角色

StoryArc 可以做的：
- 读取 agent 状态、关系、记忆、事件历史
- 生成叙事建议（通过 ReasonTrace 暴露）
- 影响候选评分（通过 UtilityScorer 的 world 维度）
- 产生结构化事件（通过 EventEffectPipeline）

StoryArc 不能做的：
- 直接修改 emotion vector
- 直接修改 relationship strength
- 直接修改 behaviorField label
- 直接设置 stateMachine.currentState
- 强制 agent 执行特定行为
- 生成未经验证的世界事实

---

## 3. 安全防护要求

### 3.1 输入验证
- 所有叙事输入必须经过结构化验证
- LLM 输出必须转换为结构化事件后才能进入世界状态
- 事件必须有 `type`、`content`、`effects` 字段

### 3.2 效果隔离
- 叙事效果只能通过 EventEffectPipeline 应用
- 效果必须有合理的幅度限制
- 不能绕过 BehaviorField 直接修改行为

### 3.3 可追溯性
- 所有叙事影响必须记录在 ReasonTrace 中
- 影响来源必须可审计
- 必须支持禁用叙事影响的开关

### 3.4 防脚本化
- 不能有硬编码的"剧情线"
- 不能有强制的"剧情转折"
- agent 行为必须始终由心理学系统驱动

---

## 4. 必需的安全测试

以下测试必须在 StoryArc 实现时通过：

```javascript
// 测试 1: 叙事不能直接修改 emotion
describe('StoryArc cannot directly modify emotion', () => {
  it('narrative input does not change emotion without event', () => {
    // StoryArc 读取 agent 状态 → 生成建议 → 不直接修改 emotion
    // 除非通过 EventEffectPipeline 产生结构化事件
  });
});

// 测试 2: 叙事不能强制行为
describe('StoryArc cannot force behavior', () => {
  it('narrative suggestion does not override BehaviorField', () => {
    // 即使叙事建议"去图书馆"，agent 的行为仍由 BehaviorField 决定
    // 叙事只能通过候选评分间接影响
  });
});

// 测试 3: 叙事影响可禁用
describe('StoryArc influence can be disabled', () => {
  it('disabled StoryArc produces no state changes', () => {
    // 当 StoryArc 被禁用时，agent 行为应与无叙事时完全一致
  });
});

// 测试 4: 叙事效果有幅度限制
describe('StoryArc effects are bounded', () => {
  it('single narrative event cannot change emotion by more than maxDeltaPerTick', () => {
    // 叙事事件的情绪效果受 cfg.emotion.maxDeltaPerTick 限制
  });
});

// 测试 5: LLM 输出必须经过结构化验证
describe('LLM output must be structured', () => {
  it('raw LLM text cannot enter world state without validation', () => {
    // LLM 输出必须转换为 { type, content, effects } 格式
    // 必须通过 EventDispatcher.createEvent() 验证
  });
});
```

---

## 5. 推荐实现路径

如果 StoryArc 被批准，推荐实现顺序：

1. **读取层**：StoryArc 读取 agent 状态、关系、记忆、事件历史
2. **建议层**：StoryArc 生成叙事建议（通过 ReasonTrace 暴露）
3. **评分层**：StoryArc 影响 UtilityScorer 的 world 维度
4. **事件层**：StoryArc 通过 EventEffectPipeline 产生结构化事件
5. **反馈层**：StoryArc 读取事件结果，调整后续建议

**关键原则：** StoryArc 是观察者和建议者，不是控制者。

---

## 6. 非目标

本文档**不**包含：
- StoryArc 运行时实现
- 叙事脚本
- 关系覆盖逻辑
- 情绪操纵逻辑
- LLM prompt 设计

---

## 7. 结论

StoryArc 实现需要：
1. Phase 26-30 全部审核通过
2. 人工/审核者明确批准
3. 上述安全测试全部通过
4. 可追溯性机制就位

**在获得明确批准前，StoryArc 不应自主实现。**
