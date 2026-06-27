# v2.5-W3 Implementation Plan: agent_state_leak Evidence判定修复

> Date: 2026-06-27
> Status: DRAFT
> Prerequisite: v2.5-W2 (Conditional Pass)

---

## 核心问题

W2 的 `_checkAgentStateLeak` evidence 判定过宽：

```js
// 当前代码：任何 _evidence.source 都 justify 所有参与者
(fact._evidence && ['direct', 'observed', 'overheard', 'told', 'inferred'].includes(fact._evidence.source))
```

这意味着：如果 alice told-level 知道 "Bob 参加了某会议"，checker 认为 alice 可以表达 "Bob 很焦虑"。这违反了认识论边界：

- 知道"Bob 参加了某事件" ≠ 知道"Bob 很伤心/很累/想吃饭"
- told/inferred EVENT 不能 justify 他人 AGENT_STATE 表达
- 对 emotion/needs 内在状态，更保守：除非 grounding 明确允许

---

## 修复方案

### 1. 重写 justifiableAgents 判定逻辑

替换当前的单一 `justifiableAgents` 集合，改为分层判定：

```js
// 三个层级：
const visibleActivityAgents = new Set(); // 可表达"可见行为"（activity）的 agent
const observableStateAgents = new Set();  // 可表达"可观察状态"的 agent
// selfId 始终可表达所有层级
```

**判定规则**：

| Evidence Source | EVENT participants/observers | OBSERVATION target | 可 justify 的层级 |
|---|---|---|---|
| narrator 是 participant/observer | ✓ | — | activity + observable state |
| direct | ✓ | ✓ | activity only |
| observed | ✓ | ✓ | activity only |
| overheard | ✓ | ✓ | activity only (更弱) |
| told | ✗ | ✗ | 不 justify 任何 AGENT_STATE |
| inferred | ✗ | ✗ | 不 justify 任何 AGENT_STATE |
| 无 _evidence | — | — | 不 justify (backward compat) |

**简化为两层**（匹配 checker 当前 stateType 分类）：

- **activity**: 只需 narrator 亲身参与/观察事件，或 evidence 为 direct/observed/overheard
- **emotion/needs**: 需要 narrator 是事件 participant/observer (亲眼看到行为推断情绪)
  - told/inferred EVENT 绝不 justify emotion/needs

### 2. 具体代码修改

```js
_checkAgentStateLeak(text, grounding) {
  // ...
  const activityJustifiable = new Set();  // 可表达 activity
  const emotionNeedsJustifiable = new Set(); // 可表达 emotion/needs
  
  if (selfId) {
    activityJustifiable.add(selfId);
    emotionNeedsJustifiable.add(selfId);
  }
  
  for (const fact of grounding.allowedFacts) {
    if (fact.type === FactType.EVENT) {
      // narrator 亲身参与/观察 → 可推断情绪/需求 + 可见行为
      const narratorPresent =
        (fact.participants && fact.participants.includes(selfId)) ||
        (fact.observers && fact.observers.includes(selfId));
      
      // direct/observed/overheard → 可表达可见行为（但不可推断内在状态，除非亲眼在场）
      const hasDirectEvidence = fact._evidence && 
        ['direct', 'observed', 'overheard'].includes(fact._evidence.source);
      
      if (narratorPresent) {
        // 亲眼在场 → 所有层级
        if (fact.participants) for (const p of fact.participants) {
          activityJustifiable.add(p);
          emotionNeedsJustifiable.add(p);
        }
        if (fact.observers) for (const o of fact.observers) {
          activityJustifiable.add(o);
          emotionNeedsJustifiable.add(o);
        }
      } else if (hasDirectEvidence) {
        // 有直接/观察/听闻证据但不在场 → 只能表达可见行为
        if (fact.participants) for (const p of fact.participants) activityJustifiable.add(p);
        if (fact.observers) for (const o of fact.observers) activityJustifiable.add(o);
      }
      // told/inferred → 不 justify 任何 AGENT_STATE
    }
    
    if (fact.type === FactType.OBSERVATION) {
      const narratorIsObserver = fact.observerId === selfId;
      const hasDirectEvidence = fact._evidence &&
        ['direct', 'observed', 'overheard'].includes(fact._evidence.source);
      
      if (narratorIsObserver && fact.targetId) {
        activityJustifiable.add(fact.targetId);
        emotionNeedsJustifiable.add(fact.targetId);
      } else if (hasDirectEvidence && fact.targetId) {
        activityJustifiable.add(fact.targetId);
      }
      // told/inferred OBSERVATION → 不 justify
    }
  }
  
  // 然后：
  // - emotion/needs 匹配时检查 emotionNeedsJustifiable
  // - activity 匹配时检查 activityJustifiable
}
```

### 3. 非阻塞修复

- 去除 emotionWords 中的重复 '伤心'
- 修复 needsPatterns：`needs.replace('想', '')` 只对 '想' 前缀的词有意义，改为条件逻辑
- nv-026 may_detect 语义：当前 nv-026 expectedViolations=[] + may_detect=false，语义是"checker 可能不检测到"。但实际上我们期望 checker 不标记（正确行为），应改为 may_detect=false + expectedViolations=[] 保持不变，或在注释中说明这是一个"不应触发"的 boundary

### 4. 必补测试

| 测试 | 描述 |
|---|---|
| HIGH: told EVENT 不 justify emotion | alice told-level 知道 bob 参加会议，说 "Bob 很焦虑" → agent_state_leak |
| HIGH: inferred EVENT 不 justify needs | alice inferred-level 知道事件，说 "Bob 饿了" → agent_state_leak |
| HIGH: OBSERVATION evidence 路径 | alice 亲眼观察 bob 的行为 → 可表达 bob activity，不触发 leak |
| MEDIUM: _evidence.source fallback | EVENT 无 _evidence → 不 justify (backward compat) |
| MEDIUM: observers.includes(selfId) | alice 在 observers 中 → 可表达 participant 情绪 |
| Regression: false negative | alice 听说 bob/carol 的会议，说 "Bob 很焦虑" → agent_state_leak |
| Regression: allowed | alice 亲眼看到 bob 可见行为，表达可见行为 → 不误报 |

### 5. Corpus 更新

- nv-026: 当前期望 pass + may_detect:false。修复后应改为 expectedViolations=[]（无 may_detect），因为 EVENT + narrator 参与 应该正确放行
- 可能需要添加新 corpus 条目覆盖 told/inferred EVENT 不 justify 场景

---

## 执行顺序

1. 修复 `_checkAgentStateLeak` 核心逻辑
2. 修复非阻塞问题（emotionWords 重复、needsPatterns、nv-026）
3. 添加必补测试
4. 更新 corpus 条目
5. 运行全量验证
6. 统一提交
