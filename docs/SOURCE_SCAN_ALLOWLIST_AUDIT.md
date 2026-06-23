# Source Scan Allowlist 审计报告

> Status: active audit document.
> Date: 2026-06-23.
> Purpose: 审计 `tests/source-scan.test.js` 中 `CHINESE_FALLBACK_ALLOWED_FILES` 的 9 个文件，分析是否可以收窄 allowlist。

---

## 当前 Allowlist

根据 `tests/source-scan.test.js:477-487`，当前 allowlist 包含 9 个文件：

```javascript
const CHINESE_FALLBACK_ALLOWED_FILES = [
  'src/agent/facade/AgentNarrative.js',
  'src/agent/runtime/MindWanderRuntime.js',
  'src/runtime/EventDispatcher.js',
  'src/agent/psychology/Appraisal.js',
  'src/agent/psychology/BehaviorLabeler.js',
  'src/agent/psychology/EmotionRegulation.js',
  'src/agent/psychology/EmotionVector.js',
  'src/agent/psychology/IntrinsicMotivation.js',
  'src/agent/runtime/PhysiologyRuntime.js',
];
```

---

## 审计结果

### 1. `src/agent/facade/AgentNarrative.js`

**允许原因**: 包含中文 fallback 字符串用于情绪标签、时间标签、行为描述等。

**具体中文字符串**:
- 情绪标签: `心情不太好`, `有点孤独`, `有点烦`, `有点焦虑`, `好无聊`, `有点烦躁`, `有点不安`, `心情还不错`, `挺满足的`, `有点兴奋`, `挺平静的`, `有点期待`
- 时间标签: `刚才`, `不久前`
- 行为维度名称: `活动程度`, `社交倾向`, `专注度`, `表达欲`
- 动态描述: `在上升`, `在下降`

**是否可以移除**: ✅ 可以

**修复建议**:
1. 确保 `domain.semanticProfile.narrativeModifiers` 提供所有需要的中文字符串
2. 移除 fallback 中文字符串，改用英文或空字符串作为最终 fallback
3. 更新 `SEMANTIC_PROFILE_EXCEPTIONS` 中的对应条目

**迁移示例**:
```javascript
// 当前
const negLabels = {
  sadness: '心情不太好', loneliness: '有点孤独', ...
};
const label = emotionLabels[topNeg.dimension] || negLabels[topNeg.dimension] || null;

// 迁移后
const label = emotionLabels[topNeg.dimension] || topNeg.dimension;
```

---

### 2. `src/agent/runtime/MindWanderRuntime.js`

**允许原因**: 包含中文 fallback 字符串用于思维内容、时间标签等。

**具体中文字符串**:
- 思维内容: `想起了`, `的事：`, `心里不太舒服`, `嘴角不自觉上扬`, `脑子里乱乱的...`, `想着等下做什么好呢`, `今天天气不错...`, `希望这样的日子...`, `突然想到了一个有趣的想法`
- 时间标签: `秒前`, `分钟前`, `小时前`, `天前`, `周前`, `刚刚`

**是否可以移除**: ✅ 可以

**修复建议**:
1. 确保 `domain.semanticProfile.mindWander` 提供所有需要的中文字符串
2. 移除 fallback 中文字符串，改用英文或空字符串作为最终 fallback
3. 更新 `SEMANTIC_PROFILE_EXCEPTIONS` 中的对应条目

**迁移示例**:
```javascript
// 当前
const negativeKeywords = (mwSp && mwSp.negativeKeywords) || ['难过', '不开心', '孤独', '压力'];

// 迁移后
const negativeKeywords = (mwSp && mwSp.negativeKeywords) || ['sad', 'unhappy', 'lonely', 'stress'];
```

---

### 3. `src/runtime/EventDispatcher.js`

**允许原因**: 包含中文 fallback 字符串用于天气事件模板。

**具体中文字符串**:
- 天气事件模板: `天气变化: ${weatherType}`
- 社交互动模板: `和好朋友一起在${r}，聊得很开心`
- 社交描述: `在附近注意到有人，没什么特别的`, `在附近注意到有人`

**是否可以移除**: ✅ 可以

**修复建议**:
1. 确保 `domain.eventTemplates.weatherEvents` 提供所有需要的天气事件模板
2. 确保 `domain.socialInteractions` 提供所有需要的社交互动描述
3. 移除 fallback 中文字符串，改用英文或空字符串作为最终 fallback

**迁移示例**:
```javascript
// 当前
const weatherEvent = domainEvent || {
  content: `天气变化: ${weatherType}`,
  effects: [{ target: '*', type: 'emotion', delta: {} }],
};

// 迁移后
const weatherEvent = domainEvent || {
  content: `Weather changed: ${weatherType}`,
  effects: [{ target: '*', type: 'emotion', delta: {} }],
};
```

---

### 4. `src/agent/psychology/Appraisal.js`

**允许原因**: 包含中文 fallback 字符串用于社会规范关键词。

**具体中文字符串**:
- 正面规范关键词: `打招呼`, `聊天`, `帮助`
- 负面规范关键词: `冲突`, `吵架`

**是否可以移除**: ✅ 可以

**修复建议**:
1. 确保 `domain.appraisalConfig.normConformityKeywords` 提供所有需要的关键词
2. 确保 `domain.semanticProfile.socialNormKeywords` 提供所有需要的关键词
3. 移除 fallback 中文字符串，改用英文关键词

**迁移示例**:
```javascript
// 当前
const positiveNorms = normKeywords.positive || (sp && sp.socialNormKeywords && sp.socialNormKeywords.positive) || ['打招呼', '聊天', '帮助'];

// 迁移后
const positiveNorms = normKeywords.positive || (sp && sp.socialNormKeywords && sp.socialNormKeywords.positive) || ['greet', 'chat', 'help'];
```

---

### 5. `src/agent/psychology/BehaviorLabeler.js`

**允许原因**: 包含中文 fallback 字符串用于行为修饰描述。

**具体中文字符串**:
- 行为修饰: `有点心不在焉`, `想找人说话`, `不太想动`

**是否可以移除**: ✅ 可以

**修复建议**:
1. 确保 `domain.semanticProfile.behaviorModifiers` 提供所有需要的修饰词
2. 确保 `domain.narrativeTemplates` 提供所有需要的文本
3. 移除 fallback 中文字符串，改用英文或空字符串作为最终 fallback

**迁移示例**:
```javascript
// 当前
if (B[DIM_FOCUS] < 0.25 && _isHighFocusState(primary, domain)) {
  modifiers.push('有点心不在焉');
}

// 迁移后
if (B[DIM_FOCUS] < 0.25 && _isHighFocusState(primary, domain)) {
  const bm = domain.semanticProfile && domain.semanticProfile.behaviorModifiers;
  modifiers.push((bm && bm.distracted) || 'distracted');
}
```

---

### 6. `src/agent/psychology/EmotionRegulation.js`

**允许原因**: 包含中文 fallback 字符串用于调节状态描述。

**具体中文字符串**:
- 调节能力描述: `调节能力充足`, `调节能力一般`, `调节能力不足`, `调节资源枯竭`
- 策略偏好描述: `善于重评价`, `善于转移注意力`, `善于控制表达`, `擅长`
- 前缀: `情绪调节：`

**是否可以移除**: ✅ 可以

**修复建议**:
1. 确保 `domain.semanticProfile.emotionRegulation` 提供所有需要的描述
2. 移除 fallback 中文字符串，改用英文或空字符串作为最终 fallback
3. 更新 `SEMANTIC_PROFILE_EXCEPTIONS` 中的对应条目

**迁移示例**:
```javascript
// 当前
const resourceDesc =
  this._regulationResource > 0.7 ? '调节能力充足' :
  this._regulationResource > 0.4 ? '调节能力一般' :
  this._regulationResource > 0.1 ? '调节能力不足' : '调节资源枯竭';

// 迁移后
const erSp = domain.semanticProfile && domain.semanticProfile.emotionRegulation;
const resourceDesc =
  this._regulationResource > 0.7 ? (erSp && erSp.resourceHigh) || 'sufficient regulation capacity' :
  this._regulationResource > 0.4 ? (erSp && erSp.resourceMedium) || 'moderate regulation capacity' :
  this._regulationResource > 0.1 ? (erSp && erSp.resourceLow) || 'low regulation capacity' : 
  (erSp && erSp.resourceDepleted) || 'regulation resource depleted';
```

---

### 7. `src/agent/psychology/EmotionVector.js`

**允许原因**: 包含大量中文 fallback 字符串用于情绪描述、强度标签、心境描述等。

**具体中文字符串**:
- 情绪名称: `开心`, `难过`, `生气`, `害怕`, `惊讶`, `厌恶`, `觉得好笑`, `敬畏`, `满足`, `渴望`, `尴尬`, `内疚`, `恐惧`, `感兴趣`, `喜欢/爱`, `紧张`, `自豪`, `如释重负`, `满意`, `羞耻`, `同情`, `得意`, `无聊`, `平静`, `困惑`, `兴奋`, `沮丧/烦躁`, `感激`, `希望`, `孤独`
- 负面情绪反义: `不开心`, `不满足`, `不安`, `低落`, `失望`, `不满意`
- 强度标签: `极度`, `非常`, `很`, `挺`, `比较`, `有点`, `略微`
- 心境描述: `心情不错`, `心情还行`, `心情一般`, `有点低落`, `心情不太好`
- 场景描述: `你的内心比较平静`, `压力很大`, `有点压力`, `精力充沛`, `有些疲倦`

**是否可以移除**: ✅ 可以

**修复建议**:
1. 确保 `domain.semanticProfile.emotionNames` 提供所有需要的情绪名称
2. 确保 `domain.semanticProfile.intensityLabels` 提供所有需要的强度标签
3. 确保 `domain.semanticProfile.moodDescriptions` 提供所有需要的心境描述
4. 移除 fallback 中文字符串，改用英文或空字符串作为最终 fallback
5. 更新 `SEMANTIC_PROFILE_EXCEPTIONS` 中的对应条目

**迁移示例**:
```javascript
// 当前
const emotionNames = {
  joy: '开心', sadness: '难过', anger: '生气', fear: '害怕',
  ...
};

// 迁移后
const emotionNames = {
  joy: 'joy', sadness: 'sadness', anger: 'anger', fear: 'fear',
  ...
};
```

---

### 8. `src/agent/psychology/IntrinsicMotivation.js`

**允许原因**: 包含中文 fallback 字符串用于目标描述和状态描述。

**具体中文字符串**:
- 目标描述: `想去${target}看看`, `想去${relatedRegion}${domain}方面继续练习`, `想去${target}换个环境`
- 状态描述: `好奇心: ${Math.round(this.curiosity * 100)}%`, `当前想做的事: ${goalDescs.join('、')}`, `最近完成了: ${last.description || last.type}`, `正在进步: ${bestProgress} (${Math.round(comp.ema * 100)}%)`

**是否可以移除**: ✅ 可以

**修复建议**:
1. 确保 `domain.semanticProfile.intrinsicMotivation` 提供所有需要的描述
2. 移除 fallback 中文字符串，改用英文或空字符串作为最终 fallback

**迁移示例**:
```javascript
// 当前
return {
  id,
  type: 'explore_new',
  target,
  createdAt: now,
  deadline: now + this._cfg.goalDeadlineHours * 60 * 60 * 1000,
  status: 'active',
  description: `想去${target}看看`,
};

// 迁移后
const imSp = domain.semanticProfile && domain.semanticProfile.intrinsicMotivation;
return {
  id,
  type: 'explore_new',
  target,
  createdAt: now,
  deadline: now + this._cfg.goalDeadlineHours * 60 * 60 * 1000,
  status: 'active',
  description: (imSp && imSp.exploreGoal) ? imSp.exploreGoal(target) : `explore ${target}`,
};
```

---

### 9. `src/agent/runtime/PhysiologyRuntime.js`

**允许原因**: 包含中文 fallback 字符串用于户外区域列表。

**具体中文字符串**:
- 户外区域: `运动场`, `小镇广场`, `公园`, `路上`, `回家路上`

**是否可以移除**: ✅ 可以

**修复建议**:
1. 确保 `domain.placeTypes.outdoor` 提供所有需要的户外区域
2. 移除 fallback 中文字符串，改用英文区域名称

**迁移示例**:
```javascript
// 当前
const outdoorRegions = agent.domain ? (agent.domain.placeTypes.outdoor || []) : ['运动场', '小镇广场', '公园', '路上', '回家路上'];

// 迁移后
const outdoorRegions = agent.domain ? (agent.domain.placeTypes.outdoor || []) : ['sports field', 'town square', 'park', 'road', 'way home'];
```

---

## 收窄建议

### 优先级排序

1. **高优先级** (可立即移除):
   - `src/agent/psychology/Appraisal.js` - 只有 2 个中文字符串，容易迁移
   - `src/agent/runtime/PhysiologyRuntime.js` - 只有 1 个中文数组，容易迁移

2. **中优先级** (需要较多迁移工作):
   - `src/agent/psychology/BehaviorLabeler.js` - 3 个中文字符串
   - `src/agent/psychology/EmotionRegulation.js` - 多个中文字符串
   - `src/runtime/EventDispatcher.js` - 多个中文字符串

3. **低优先级** (大量中文字符串，迁移工作量大):
   - `src/agent/facade/AgentNarrative.js` - 大量中文字符串
   - `src/agent/runtime/MindWanderRuntime.js` - 大量中文字符串
   - `src/agent/psychology/EmotionVector.js` - 大量中文字符串
   - `src/agent/psychology/IntrinsicMotivation.js` - 大量中文字符串

### 迁移策略

1. **阶段一**: 迁移高优先级文件，更新 `SEMANTIC_PROFILE_EXCEPTIONS`
2. **阶段二**: 迁移中优先级文件，确保 domain 配置完整
3. **阶段三**: 迁移低优先级文件，需要大量 domain 配置工作
4. **阶段四**: 从 `CHINESE_FALLBACK_ALLOWED_FILES` 中移除已迁移的文件

### 注意事项

1. 迁移前必须确保所有 domain 配置完整
2. 迁移后必须运行测试验证
3. 更新 `DOMAIN_COMPATIBILITY_EXCEPTIONS.md` 文档
4. 保持向后兼容性，不要破坏现有功能

---

## 结论

所有 9 个文件都可以移除中文字符，但需要确保 domain 配置提供所有需要的替代值。建议按优先级分阶段迁移，避免一次性迁移导致的问题。

当前 allowlist 可以收窄，但需要先完成 domain 配置的迁移工作。建议创建迁移计划，逐步移除中文字符，最终从 `CHINESE_FALLBACK_ALLOWED_FILES` 中移除所有文件。