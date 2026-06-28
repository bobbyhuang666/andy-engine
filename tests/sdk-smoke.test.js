import { describe, it, expect } from 'vitest';
import { NarrativeBuilder, LLMAdapter, ConversationLog } from '../sdk/index.js';
import { EmotionSignalBuffer } from '../src/sdk/EmotionSignalBuffer.js';
import { AndyBridge } from '../src/sdk/AndyBridge.js';
import { DomainRegistry } from '../src/domain/DomainRegistry.js';
import { getDefaultDomain } from '../src/domain/DomainRegistry.js';

const campusDomain = getDefaultDomain();

describe('EmotionSignalBuffer (A4.5)', () => {
  it('push() returns classification result', () => {
    const buf = new EmotionSignalBuffer();
    const result = buf.push('你今天开心吗');
    expect(result).toBeDefined();
    expect(result.intent).toBeDefined();
    expect(result.effect).toBeDefined();
  });

  it('consume() returns null when empty', () => {
    const buf = new EmotionSignalBuffer();
    expect(buf.consume()).toBeNull();
  });

  it('consume() returns merged effect and story text', () => {
    const buf = new EmotionSignalBuffer();
    buf.push('你今天好累');
    const result = buf.consume();
    expect(result).not.toBeNull();
    expect(result.mergedEffect).toBeDefined();
    expect(result.storyText).toBeDefined();
    expect(typeof result.storyText).toBe('string');
    expect(result.messageCount).toBe(1);
  });

  it('pendingCount tracks pending messages', () => {
    const buf = new EmotionSignalBuffer();
    expect(buf.pendingCount).toBe(0);
    buf.push('消息一');
    expect(buf.pendingCount).toBe(1);
    buf.push('消息二');
    expect(buf.pendingCount).toBe(2);
    buf.consume();
    expect(buf.pendingCount).toBe(0);
  });
});

describe('ConversationLog edge cases (A4.5)', () => {
  it('getSummary() returns empty for empty log', () => {
    const log = new ConversationLog();
    expect(log.getSummary()).toBe('');
  });

  it('getSummary() includes topic list', () => {
    const log = new ConversationLog();
    log.addUserMessage('今天天气怎么样');
    log.addAssistantMessage('天气不错');
    log.addUserMessage('周末去哪里玩');
    log.addAssistantMessage('可以去公园');
    const summary = log.getSummary();
    expect(summary).toContain('最近聊过的话题');
    expect(summary).toContain('今天天气怎么样');
  });

  it('clear() generates summarized history from >10 messages', () => {
    const log = new ConversationLog({ characterName: 'Test' });
    for (let i = 0; i < 12; i++) {
      log.addUserMessage(`用户消息${i}内容很长用于测试摘要功能`);
      log.addAssistantMessage(`角色回复${i}`);
    }
    expect(log.length).toBeGreaterThan(10);
    log.clear();
    expect(log.length).toBe(0);
    // After clear with >10 messages, _summarizedHistory should be populated
    // We verify through toJSON since _summarizedHistory is internal
    const json = log.toJSON();
    expect(json.summarizedHistory).toBeTruthy();
  });
});

describe('LLMAdapter (A4.5)', () => {
  it('chat() retry works (fails once then succeeds)', async () => {
    let attempts = 0;
    const flakyFn = async (messages) => {
      attempts++;
      if (attempts === 1) throw new Error('transient error');
      return 'success';
    };
    const adapter = new LLMAdapter(flakyFn);
    const result = await adapter.chat([{ role: 'user', content: 'hi' }]);
    expect(result).toBe('success');
    expect(attempts).toBe(2);
  });

  it('chatStream() with custom function yields result', async () => {
    const adapter = new LLMAdapter(async () => 'streamed text');
    const tokens = [];
    for await (const token of adapter.chatStream([{ role: 'user', content: 'hi' }])) {
      tokens.push(token);
    }
    expect(tokens.join('')).toBe('streamed text');
  });

  it('maxRetries=0 means no retry', async () => {
    let attempts = 0;
    const failFn = async () => {
      attempts++;
      throw new Error('always fails');
    };
    const adapter = new LLMAdapter(failFn);
    adapter.maxRetries = 0;
    await expect(adapter.chat([{ role: 'user', content: 'hi' }])).rejects.toThrow('always fails');
    expect(attempts).toBe(1);
  });
});

describe('NarrativeBuilder (A4.5)', () => {
  it('buildSystemPrompt with grounding package', () => {
    const ctx = {
      hour: 12,
      weather: 'sunny',
      season: 'summer',
      currentRegion: '图书馆',
    };
    const groundingPackage = {
      allowedFacts: [
        { type: 'static_env', id: 'f1', content: '图书馆很安静' },
      ],
      inferredFacts: [],
      locationMeaning: '安静的学习场所',
      behaviorTendency: '想安静读书',
    };
    const prompt = NarrativeBuilder.buildSystemPrompt(ctx, {
      characterName: 'Test',
      domain: campusDomain,
      groundingPackage,
    });
    expect(prompt).toContain('事实约束');
    expect(prompt).toContain('安静的学习场所');
    expect(prompt).toContain('想安静读书');
  });

  it('buildSystemPrompt with domain forbidden terms', () => {
    const domain = new DomainRegistry({
      id: 'test',
      name: 'Test',
      version: '1.0',
      forbiddenTerms: ['魔法', '龙'],
      states: { idle: [0, 0, 0, 0] },
      stateCenters: {},
      regions: ['广场'],
      narrativeTemplates: {},
    }, { validate: false });
    const ctx = { hour: 14, weather: 'sunny', season: 'spring' };
    const prompt = NarrativeBuilder.buildSystemPrompt(ctx, {
      characterName: 'Test',
      domain,
    });
    expect(prompt).toContain('世界观约束');
    expect(prompt).toContain('禁止提及以下词汇');
    // forbidden terms are replaced with *** by applyForbiddenTerms
    expect(prompt).not.toContain('魔法');
    expect(prompt).not.toContain('龙');
    expect(prompt).toContain('***');
  });
});

describe('AndyBridge (A4.5)', () => {
  it('constructor creates without error', () => {
    const bridge = new AndyBridge({ dbPath: ':memory:' });
    expect(bridge).toBeDefined();
    expect(bridge.signalBuffer).toBeDefined();
  });

  it('onUserMessage returns effect and intent', async () => {
    const bridge = new AndyBridge({ dbPath: ':memory:' });
    await bridge.init();
    const result = bridge.onUserMessage('你今天开心吗');
    expect(result).toBeDefined();
    expect(result.effect).toBeDefined();
    expect(result.intent).toBeDefined();
    await bridge.shutdown();
  });

  it('getStats returns expected shape', async () => {
    const bridge = new AndyBridge({ dbPath: ':memory:' });
    await bridge.init();
    const stats = bridge.getStats();
    expect(stats).toBeDefined();
    expect(stats.tickCount).toBeDefined();
    expect(stats.pendingSignals).toBeDefined();
    expect(stats.storyStats).toBeDefined();
    await bridge.shutdown();
  });

  it('getStoriesForAgent returns empty array initially', async () => {
    const bridge = new AndyBridge({ dbPath: ':memory:' });
    await bridge.init();
    const stories = bridge.getStoriesForAgent();
    expect(Array.isArray(stories)).toBe(true);
    expect(stories.length).toBe(0);
    await bridge.shutdown();
  });
});
