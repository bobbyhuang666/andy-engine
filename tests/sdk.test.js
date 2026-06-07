/**
 * SDK 测试套件
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { Character, Andy, NarrativeBuilder, LLMAdapter, ConversationLog, AutoTick, create } from '../sdk/index.js';

// Mock LLM：返回固定回复，不实际调用 API
const mockLLM = async (messages) => {
  const lastUser = messages.filter(m => m.role === 'user').pop();
  if (!lastUser) return '...';
  const text = lastUser.content;
  if (text.includes('累')) return '我也挺累的，考研压力大。你呢？';
  if (text.includes('开心')) return '真的吗？那太好了！我也替你开心。';
  return `听你说了"${text.substring(0, 10)}"，我有些想法。`;
};

describe('Character 基础功能', () => {
  let character;

  beforeEach(() => {
    character = new Character({
      name: 'Maya',
      personality: 'INFP',
      backstory: ['一个安静的图书馆管理员', '喜欢看星星'],
      llm: mockLLM,
    });
  });

  it('创建成功', () => {
    expect(character).toBeDefined();
    expect(character.name).toBe('Maya');
  });

  it('chat 返回字符串', async () => {
    const reply = await character.chat('你好');
    expect(typeof reply).toBe('string');
    expect(reply.length).toBeGreaterThan(0);
  });

  it('chat 包含情绪相关内容', async () => {
    const reply = await character.chat('我今天好累');
    expect(reply).toContain('累');
  });

  it('多轮对话保持上下文', async () => {
    await character.chat('你好');
    await character.chat('我今天好累');
    const reply = await character.chat('你记得我说了什么吗');
    expect(typeof reply).toBe('string');
    // 对话历史应该有 6 条消息（3轮 user + 3轮 assistant）
    expect(character._conversation.length).toBe(6);
  });

  it('getContext 返回完整上下文', () => {
    const ctx = character.getContext();
    expect(ctx.systemPrompt).toBeDefined();
    expect(typeof ctx.systemPrompt).toBe('string');
    expect(ctx.systemPrompt.length).toBeGreaterThan(100);
    expect(ctx.worldContext).toBeDefined();
    expect(ctx.narrative).toBeDefined();
  });

  it('save/load 保持状态', async () => {
    await character.chat('你好');
    await character.chat('我叫小明');

    const state = character.save();
    expect(state.version).toBe(1);
    expect(state.name).toBe('Maya');

    const restored = Character.load(state, mockLLM);
    expect(restored.name).toBe('Maya');
    expect(restored._conversation.length).toBe(4);
  });
});

describe('create() 快速创建', () => {
  it('一行代码创建角色', async () => {
    const maya = create({
      name: 'Maya',
      personality: 'INFP',
      llm: mockLLM,
    });
    expect(maya).toBeDefined();
    const reply = await maya.chat('你好');
    expect(typeof reply).toBe('string');
  });
});

describe('NarrativeBuilder', () => {
  it('buildSystemPrompt 包含角色名', () => {
    const engine = new (require('../index.js').default || require('../index.js'))();
    engine.createCharacter({ id: 'test', name: 'TestChar', mbti: 'INFP' });
    engine.tick();

    const ctx = engine.getWorldContext('test');
    const prompt = NarrativeBuilder.buildSystemPrompt(ctx, {
      characterName: 'TestChar',
      backstory: ['喜欢读书'],
    });

    expect(prompt).toContain('TestChar');
    expect(prompt).toContain('性格内向');
    expect(prompt).toContain('喜欢读书');
    expect(prompt).toContain('怎么回复');
  });

  it('空上下文返回空字符串', () => {
    const prompt = NarrativeBuilder.buildSystemPrompt(null, {});
    expect(prompt).toBe('');
  });
});

describe('LLMAdapter', () => {
  it('自定义函数模式', async () => {
    const adapter = new LLMAdapter(mockLLM);
    const reply = await adapter.chat([
      { role: 'system', content: '你是角色' },
      { role: 'user', content: '你好' },
    ]);
    expect(typeof reply).toBe('string');
  });

  it('无效 provider 抛错', async () => {
    const adapter = new LLMAdapter({ provider: 'invalid' });
    await expect(adapter.chat([{ role: 'user', content: 'test' }])).rejects.toThrow();
  });
});

describe('ConversationLog', () => {
  it('记录消息', () => {
    const log = new ConversationLog({ characterName: 'Test' });
    log.addUserMessage('你好');
    log.addAssistantMessage('你好啊');
    expect(log.length).toBe(2);
    expect(log.turnCount).toBe(1);
  });

  it('toMessages 返回正确格式', () => {
    const log = new ConversationLog();
    log.addUserMessage('你好');
    log.addAssistantMessage('你好啊');
    const messages = log.toMessages();
    expect(messages[0].role).toBe('user');
    expect(messages[0].content).toBe('你好');
    expect(messages[1].role).toBe('assistant');
  });

  it('滑动窗口裁剪', () => {
    const log = new ConversationLog({ maxMessages: 4 });
    for (let i = 0; i < 10; i++) {
      log.addUserMessage(`消息${i}`);
      log.addAssistantMessage(`回复${i}`);
    }
    expect(log.length).toBeLessThanOrEqual(4);
  });

  it('序列化/反序列化', () => {
    const log = new ConversationLog({ characterName: 'Test' });
    log.addUserMessage('你好');
    log.addAssistantMessage('你好啊');

    const json = log.toJSON();
    const restored = ConversationLog.fromJSON(json);
    expect(restored.length).toBe(2);
    expect(restored.characterName).toBe('Test');
  });
});

describe('AutoTick', () => {
  it('首次消息不推进', () => {
    const at = new AutoTick();
    const engine = new (require('../index.js').default || require('../index.js'))();
    engine.createCharacter({ id: 'test', name: 'Test', mbti: 'INFP' });
    const ticks = at.calculateTicksToAdvance(engine);
    expect(ticks).toBe(0);
  });
});

describe('Andy 多角色引擎', () => {
  it('添加多个角色', async () => {
    const world = new Andy({ llm: mockLLM });
    world.addCharacter({ name: 'Maya', personality: 'INFP' });
    world.addCharacter({ name: 'Bob', personality: 'ENTP' });

    expect(world.getCharacter('char_0')).toBeDefined();
    expect(world.getCharacter('char_1')).toBeDefined();
  });

  it('与指定角色对话', async () => {
    const world = new Andy({ llm: mockLLM });
    world.addCharacter({ name: 'Maya', personality: 'INFP', id: 'maya' });

    const reply = await world.chat('maya', '你好');
    expect(typeof reply).toBe('string');
  });

  it('tick 推进模拟', () => {
    const world = new Andy();
    world.addCharacter({ name: 'Maya', personality: 'INFP' });
    world.addCharacter({ name: 'Bob', personality: 'ENTP' });

    const result = world.tick();
    expect(result.tickNumber).toBeGreaterThan(0);
  });

  it('getStates 返回所有角色状态', () => {
    const world = new Andy();
    world.addCharacter({ name: 'Maya', personality: 'INFP', id: 'maya' });
    world.addCharacter({ name: 'Bob', personality: 'ENTP', id: 'bob' });

    const states = world.getStates();
    expect(states.maya).toBeDefined();
    expect(states.bob).toBeDefined();
    expect(states.maya.name).toBe('Maya');
  });

  it('save/load 保持完整状态', async () => {
    const world = new Andy({ llm: mockLLM });
    world.addCharacter({ name: 'Maya', personality: 'INFP', id: 'maya' });
    world.addCharacter({ name: 'Bob', personality: 'ENTP', id: 'bob' });
    await world.chat('maya', '你好');

    const state = world.save();
    const restored = Andy.load(state);
    expect(restored.getCharacter('maya')).toBeDefined();
    expect(restored.getCharacter('bob')).toBeDefined();
  });
});

describe('chatStream 流式输出', () => {
  it('逐 token 产出', async () => {
    const character = new Character({
      name: 'Maya',
      personality: 'INFP',
      llm: async (messages) => '你好啊朋友',
    });
    const tokens = [];
    for await (const token of character.chatStream('你好')) {
      tokens.push(token);
    }
    expect(tokens.length).toBeGreaterThan(0);
    expect(tokens.join('')).toBe('你好啊朋友');
  });

  it('流式输出后对话历史正确', async () => {
    const character = new Character({
      name: 'Maya',
      personality: 'INFP',
      llm: async (messages) => '你好',
    });
    for await (const token of character.chatStream('测试')) {}
    expect(character._conversation.length).toBe(2);
  });
});

describe('NarrativeBuilder 各种状态', () => {
  it('疲劳状态生成正确提示', () => {
    const ctx = {
      hour: 3, weather: 'sunny', season: 'summer',
      currentRegion: '宿舍',
      needsState: '需求：饱腹充足，精力极度匮乏，社交一般，舒适充足，兴趣饱满。',
      emotionState: '（效价=-0.12, 唤醒=0.2）。整体心境：心情不太好。',
      personalityAnchor: '你性格内向。',
      health: 90,
    };
    const prompt = NarrativeBuilder.buildSystemPrompt(ctx, { characterName: 'Test' });
    expect(prompt).toContain('深夜');
    expect(prompt).toContain('眼皮重得抬不起来');
    expect(prompt).toContain('你现在很困');
  });

  it('开心状态生成正确提示', () => {
    const ctx = {
      hour: 15, weather: 'sunny', season: 'spring',
      currentRegion: '操场',
      needsState: '需求：饱腹充足，精力饱满，社交充足，舒适充足，兴趣饱满。',
      emotionState: '满足的情绪主导着你的心境（效价=0.35, 唤醒=0.6）。整体心境：心情不错。',
      personalityAnchor: '你性格外向。',
      health: 100,
    };
    const prompt = NarrativeBuilder.buildSystemPrompt(ctx, { characterName: 'Test' });
    expect(prompt).toContain('下午');
    expect(prompt).toContain('春天');
    expect(prompt).toContain('操场上');
  });

  it('空上下文返回空字符串', () => {
    expect(NarrativeBuilder.buildSystemPrompt(null, {})).toBe('');
    expect(NarrativeBuilder.buildSystemPrompt(undefined, {})).toBe('');
  });

  it('去重最近事件', () => {
    const ctx = {
      hour: 12, weather: 'sunny', season: 'summer',
      recentEvents: '- 太阳太晒了\n- 太阳太晒了\n- 食堂人很多',
    };
    const prompt = NarrativeBuilder.buildSystemPrompt(ctx, { characterName: 'T' });
    const recentSection = prompt.match(/# 最近的事\n([\s\S]*?)(?=\n#|$)/);
    expect(recentSection).toBeTruthy();
    expect(recentSection[1].split('\n').filter(l => l.includes('太阳太晒了')).length).toBe(1);
  });
});

describe('Character 边界情况', () => {
  it('空消息处理', async () => {
    const c = new Character({ name: 'T', personality: 'INFP', llm: async () => '...' });
    const reply = await c.chat('');
    expect(typeof reply).toBe('string');
  });

  it('超长消息处理', async () => {
    const c = new Character({ name: 'T', personality: 'INFP', llm: async () => 'ok' });
    const longMsg = '你好'.repeat(500);
    const reply = await c.chat(longMsg);
    expect(typeof reply).toBe('string');
  });

  it('特殊字符消息', async () => {
    const c = new Character({ name: 'T', personality: 'INFP', llm: async () => 'ok' });
    const reply = await c.chat('<script>alert("xss")</script>');
    expect(typeof reply).toBe('string');
  });

  it('LLM 返回空字符串时返回省略号', async () => {
    const c = new Character({ name: 'T', personality: 'INFP', llm: async () => '' });
    const reply = await c.chat('你好');
    expect(reply).toBe('...');
  });

  it('LLM 抛错时传播错误', async () => {
    const c = new Character({
      name: 'T', personality: 'INFP',
      llm: async () => { throw new Error('API error'); },
    });
    await expect(c.chat('你好')).rejects.toThrow('API error');
  });

  it('多次 save/load 保持一致性', async () => {
    const c = new Character({ name: 'Maya', personality: 'INFP', llm: async () => 'ok' });
    await c.chat('第一句');
    const state1 = c.save();
    const restored1 = Character.load(state1, async () => 'ok');
    await restored1.chat('第二句');
    const state2 = restored1.save();
    expect(state2.conversation.messages.length).toBe(4);
  });
});

describe('Andy 多角色边界情况', () => {
  it('不存在的角色抛错', async () => {
    const world = new Andy({ llm: async () => 'ok' });
    await expect(world.chat('不存在', '你好')).rejects.toThrow('Character not found');
  });

  it('添加角色后 tick 正常', () => {
    const world = new Andy();
    for (let i = 0; i < 10; i++) {
      world.addCharacter({ name: `Agent${i}`, personality: 'INFP' });
    }
    const result = world.tick();
    expect(result.tickNumber).toBeGreaterThan(0);
    expect(world.getStats().agentCount).toBe(10);
  });
});
