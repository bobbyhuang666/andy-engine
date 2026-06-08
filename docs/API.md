# @andy-engine/sdk API 文档

## 快速开始

```js
const { Character } = require('./sdk');

// 最简：3 行代码创建有灵魂的角色
const maya = new Character({
  name: 'Maya',
  personality: 'INFP',
  backstory: ['一个安静的图书馆管理员', '喜欢看星星'],
  llm: { provider: 'ollama' },  // 本地运行，零成本
});

const reply = await maya.chat('我今天好累');
console.log(reply);  // Maya 根据当前情绪、记忆和性格回复
```

---

## Character

高层角色 API，隐藏引擎内部复杂度。

### 构造函数

```js
new Character(config)
```

| 参数 | 类型 | 必需 | 默认值 | 说明 |
|------|------|------|--------|------|
| `name` | `string` | 推荐 | `'角色'` | 角色名 |
| `id` | `string` | 否 | 自动生成 | 角色唯一 ID |
| `personality` | `string` | 否 | `'INFP'` | MBTI 类型（16 种） |
| `ocean` | `object` | 否 | — | 直接指定大五人格 `{ openness, conscientiousness, extraversion, agreeableness, neuroticism }`，范围 0-1 |
| `backstory` | `string[]` | 否 | `[]` | 背景故事，自动转为种子记忆 |
| `schedule` | `string\|object` | 否 | `'student'` | 日程预设：`'student'` \| `'worker'` \| `'freelancer'` \| `'home'`，或自定义配置 |
| `initialPosition` | `string` | 否 | `'宿舍'` | 初始位置 |
| `scenario` | `string` | 否 | `''` | 场景描述（注入 prompt） |
| `llm` | `object\|function` | 推荐 | `{}` | LLM 配置，见 [LLMAdapter](#llmadapter) |
| `engine` | `AndyEngine` | 否 | — | 共享引擎实例（多角色场景用） |
| `maxMessages` | `number` | 否 | `50` | 对话历史最大保留条数 |
| `autoTick` | `object` | 否 | `{}` | 自动 tick 配置，见 [AutoTick](#autotick) |
| `startTime` | `Date` | 否 | `new Date()` | 模拟开始时间 |
| `weather` | `string` | 否 | `'sunny'` | 初始天气 |

**异常**：`config` 传入 `null` 或非对象时抛错。

### character.chat(message, options?)

与角色对话。自动处理时间推进、prompt 构建、LLM 调用、记忆更新。

```js
const reply = await maya.chat('今天被裁员了');
```

| 参数 | 类型 | 说明 |
|------|------|------|
| `message` | `string` | 用户消息。空字符串或纯空白返回 `'...'` |
| `options.llm` | `object` | 临时覆盖 LLM 配置 |

**返回**：`Promise<string>` — 角色回复。

**异常**：LLM 调用失败时抛出，错误信息包含 provider 和状态码。

### character.chatStream(message, options?)

流式对话，逐 token 产出。适合 Web 实时显示。

```js
for await (const token of maya.chatStream('你好')) {
  process.stdout.write(token);
}
```

**返回**：`AsyncGenerator<string>` — 逐 token 产出。

### character.getContext(options?)

获取角色完整上下文（用于自定义 LLM 集成）。

```js
const ctx = maya.getContext();
console.log(ctx.systemPrompt);    // 完整 system prompt
console.log(ctx.worldContext);    // 世界状态数据
console.log(ctx.narrative);       // 角色内心叙事
console.log(ctx.conversationHistory);  // 对话历史
```

**返回**：`{ systemPrompt, narrative, worldContext, conversationHistory }`

### character.getConversation()

获取对话历史管理器。

**返回**：`ConversationLog` 实例。

### character.save()

保存角色完整状态（引擎 + 对话 + 时间管理）。

```js
const state = maya.save();
fs.writeFileSync('maya.json', JSON.stringify(state));
```

**返回**：可序列化的状态对象（version 1）。

**异常**：引擎未初始化时抛错。

### Character.load(state, llmConfig?)

从保存的状态恢复角色。保留所有内在状态（情绪、记忆、关系、需求）。

```js
const state = JSON.parse(fs.readFileSync('maya.json'));
const maya = Character.load(state, { provider: 'ollama' });
```

| 参数 | 类型 | 说明 |
|------|------|------|
| `state` | `object` | `save()` 返回的状态对象 |
| `llmConfig` | `object` | LLM 配置（不传则用空配置） |

**返回**：`Character` 实例。

**异常**：`state` 为 `null` 或缺少 `engineState` 时抛错。

### character.id

角色唯一 ID（只读）。

### character.name

角色名（只读）。

---

## Andy

多角色引擎包装，管理多个 Character 共享同一个世界。

### 构造函数

```js
new Andy(config)
```

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `config.llm` | `object\|function` | `{}` | 默认 LLM 配置（所有角色共享） |
| `config.startTime` | `Date` | `new Date()` | 模拟开始时间 |
| `config.weather` | `string` | `'sunny'` | 初始天气 |

### andy.addCharacter(config)

添加角色到世界。

```js
world.addCharacter({ name: 'Maya', personality: 'INFP', backstory: ['图书馆管理员'] });
world.addCharacter({ name: 'Bob', personality: 'ENTP', llm: { provider: 'ollama' } });
```

**返回**：`Character` 实例。

**异常**：`config.name` 缺失时抛错。

### andy.chat(characterId, message, options?)

与指定角色对话。

```js
const reply = await world.chat('maya', '你好');
```

**异常**：角色不存在时抛错，错误信息包含所有可用角色 ID。

### andy.tick()

推进一个模拟 tick（所有角色自主演化）。

**返回**：tick 结果对象。

### andy.runTicks(count)

推进多个 tick。

### andy.getStates()

获取所有角色状态。

**返回**：`{ [id]: { name, emotion, needs, position, ... } }`

### andy.getSocialGraph()

获取社交图谱。

### andy.getStats()

获取引擎统计信息。

### andy.save() / Andy.load(state)

保存/恢复完整世界状态。行为同 `Character.save()` / `Character.load()`。

---

## LLMAdapter

LLM 调用适配器，支持多种 provider。

### 构造函数

```js
new LLMAdapter(config)
```

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `config.provider` | `string` | `'openai'` | Provider 名称 |
| `config.apiKey` | `string` | 环境变量 | API Key |
| `config.model` | `string` | 见下表 | 模型名 |
| `config.baseUrl` | `string` | 见下表 | API 基础 URL |
| `config.maxTokens` | `number` | `1024` | 最大生成 token 数 |
| `config.temperature` | `number` | `0.8` | 生成温度 |
| `config.maxRetries` | `number` | `2` | 最大重试次数 |
| `config.llm` | `function` | — | 自定义 LLM 函数 `(messages) => string` |

也可以直接传函数：

```js
const adapter = new LLMAdapter(async (messages) => {
  return await myCustomLLM(messages);
});
```

### Provider 列表

| Provider | 默认模型 | 默认 baseUrl | 需要 apiKey |
|----------|---------|-------------|-------------|
| `openai` | `gpt-4o` | `https://api.openai.com/v1` | ✅ |
| `openai-compatible` | `gpt-4o` | `https://api.openai.com/v1` | ✅ |
| `anthropic` | `claude-sonnet-4-20250514` | `https://api.anthropic.com/v1` | ✅ |
| `ollama` | `qwen2.5:7b` | `http://localhost:11434/v1` | ❌ |

**apiKey 延迟检查**：构造时不检查 apiKey，在首次 `chat()` / `chatStream()` 调用时检查。这意味着创建 Character 时不需要 apiKey（如果不调用 chat）。

### Ollama 使用

```js
// 零配置本地运行
const maya = new Character({
  name: 'Maya',
  llm: { provider: 'ollama' },  // 默认 qwen2.5:7b
});

// 指定模型
const maya = new Character({
  name: 'Maya',
  llm: { provider: 'ollama', model: 'llama3:8b' },
});
```

需要先安装 Ollama 并拉取模型：

```bash
# 安装 Ollama
curl -fsSL https://ollama.com/install.sh | sh

# 拉取模型
ollama pull qwen2.5:7b

# 确保 Ollama 正在运行
ollama serve
```

### OpenAI 兼容 Provider

任何兼容 OpenAI API 的服务都可以用 `openai-compatible`：

```js
// DeepSeek
{ provider: 'openai-compatible', apiKey: 'sk-...', baseUrl: 'https://api.deepseek.com/v1', model: 'deepseek-chat' }

// Qwen (通义千问)
{ provider: 'openai-compatible', apiKey: 'sk-...', baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1', model: 'qwen-plus' }

// 本地 vLLM
{ provider: 'openai-compatible', apiKey: 'none', baseUrl: 'http://localhost:8000/v1', model: 'my-model' }
```

### adapter.chat(messages)

非流式调用。

| 参数 | 类型 | 说明 |
|------|------|------|
| `messages` | `object[]` | `[{ role: 'system'\|'user'\|'assistant', content: '...' }]` |

**返回**：`Promise<string>` — 模型回复。

**异常**：messages 为空数组时抛错；apiKey 缺失时抛错（含修复建议）。

### adapter.chatStream(messages)

流式调用。

**返回**：`AsyncGenerator<string>` — 逐 token 产出。

---

## NarrativeBuilder

将角色状态转化为 LLM system prompt。纯静态类，无需实例化。

### NarrativeBuilder.buildSystemPrompt(worldContext, options)

```js
const prompt = NarrativeBuilder.buildSystemPrompt(worldContext, {
  characterName: 'Maya',
  backstory: ['图书馆管理员'],
  scenario: '一个下雨的周末下午',
  conversationHistory: '最近聊过的话题：...',
});
```

| 参数 | 类型 | 说明 |
|------|------|------|
| `worldContext` | `object` | `engine.getWorldContext(agentId)` 的返回值 |
| `options.characterName` | `string` | 角色名 |
| `options.backstory` | `string[]` | 背景故事 |
| `options.scenario` | `string` | 场景描述 |
| `options.conversationHistory` | `string` | 对话历史摘要 |

**返回**：`string` — 完整的 system prompt。

**设计原则**：
- Show Don't Tell — 用行为描述人格，不用标签
- 分层人格 — 表面/内在/秘密三层
- 正面引导 — 告诉 LLM 该做什么，而非不该做什么

---

## AutoTick

自动时间管理，在对话间自动推进模拟时间。

### 构造函数

```js
new AutoTick(options)
```

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `tickIntervalMinutes` | `number` | `5` | 每 tick 推进的模拟分钟数（最小 1） |
| `maxCatchupTicks` | `number` | `288` | 最大追赶 tick 数（288 = 24 小时）（最小 1） |
| `chatTickMin` | `number` | `1` | 对话中每条消息最少 tick 数（最小 0） |
| `chatTickMax` | `number` | `3` | 对话中每条消息最多 tick 数（最小 chatTickMin） |

参数自动钳制到合法范围。

### autoTick.advance(engine)

在处理用户消息前推进引擎。

| 参数 | 类型 | 说明 |
|------|------|------|
| `engine` | `AndyEngine` | 引擎实例 |

**返回**：`number` — 实际推进的 tick 数。

**异常**：engine 为 `null` 或无效时抛错。

### AutoTick.fromJSON(data)

从序列化数据恢复。

---

## ConversationLog

对话历史管理，维护滑动窗口。

### 构造函数

```js
new ConversationLog(options)
```

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `maxMessages` | `number` | `50` | 最大保留消息数（最小 4） |
| `maxTokens` | `number` | `4000` | 估算的最大 token 数（最小 100） |
| `characterName` | `string` | `'角色'` | 角色名 |

### log.addUserMessage(text) / log.addAssistantMessage(text)

添加消息。空消息被忽略。

### log.toMessages()

导出为 LLM messages 格式。

**返回**：`{ role: string, content: string }[]`

### log.getSummary()

获取对话历史摘要（用于长期记忆注入）。

**返回**：`string`

### log.turnCount / log.length

对话轮数 / 消息数量（只读）。

### log.clear()

清空对话历史（清空前自动生成摘要）。

### ConversationLog.fromJSON(data)

从序列化数据恢复。

---

## create(config)

快速创建角色的便捷函数。

```js
const { create } = require('./sdk');
const maya = create({ name: 'Maya', personality: 'INFP', llm: { provider: 'ollama' } });
```

等价于 `new Character(config)`。

---

## 底层导出

以下模块在 `require('./sdk')` 中导出，供高级用户使用：

| 模块 | 说明 |
|------|------|
| `AndyEngine` | 核心引擎（`require('../index')`） |
| `NarrativeBuilder` | Prompt 构建器 |
| `LLMAdapter` | LLM 适配器 |
| `AutoTick` | 自动时间管理 |
| `ConversationLog` | 对话历史管理 |

---

## 错误处理

SDK 的错误分为两类：

### 用户输入错误（同步抛出）

构造时立即报错，信息明确：

```js
new LLMAdapter({ provider: 'invalid' });
// Error: LLMAdapter: 不支持的 provider "invalid"。可选: openai, openai-compatible, anthropic, ollama, custom

new Character({});
// OK（有默认值）

new Andy().addCharacter({});
// Error: Andy.addCharacter(): config.name 是必需的
```

### 运行时错误（异步抛出）

LLM 调用失败等运行时错误，包含重试逻辑和有用的错误信息：

```js
await character.chat('hi');
// Error: Character.chat() LLM 调用失败: ollama API error 404:
//   提示：确保 Ollama 正在运行（ollama serve）且模型已拉取（ollama pull qwen2.5:7b）
```

### 防御性行为

以下情况不抛错，返回安全默认值：

| 情况 | 行为 |
|------|------|
| `chat('')` 或 `chat('   ')` | 返回 `'...'` |
| `addUserMessage('')` | 忽略 |
| `autoTick.advance()` 时间推进失败 | 不阻断对话 |
| `_recordConversation` 记忆写入失败 | 静默忽略 |

---

## 完整示例

### 单角色对话

```js
const { Character } = require('./sdk');

const maya = new Character({
  name: 'Maya',
  personality: 'INFP',
  backstory: ['图书馆管理员', '喜欢看星星', '养了一只橘猫叫豆豆'],
  llm: { provider: 'ollama' },
});

// 对话
console.log(await maya.chat('你好'));
console.log(await maya.chat('今天好累'));

// 流式输出
for await (const token of maya.chatStream('给我讲个故事')) {
  process.stdout.write(token);
}

// 保存/恢复
const state = maya.save();
const restored = Character.load(state, { provider: 'ollama' });
```

### 多角色世界

```js
const { Andy } = require('./sdk');

const world = new Andy({ llm: { provider: 'ollama' } });

world.addCharacter({ name: 'Maya', personality: 'INFP', backstory: ['图书馆管理员'] });
world.addCharacter({ name: 'Bob', personality: 'ENTP', backstory: ['程序员'] });

// 与某个角色对话
const reply = await world.chat('maya', '你好');

// 推进模拟（角色自主演化）
world.tick();

// 获取所有角色状态
console.log(world.getStates());
```

### 自定义 LLM 函数

```js
const maya = new Character({
  name: 'Maya',
  llm: async (messages) => {
    // 你可以接入任何 LLM
    const last = messages.filter(m => m.role === 'user').pop();
    return `你说的是: ${last.content}`;
  },
});
```
