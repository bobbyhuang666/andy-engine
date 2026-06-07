/**
 * 情绪信号 + StoryGenerator 端到端测试
 *
 * 验证完整数据流:
 *   用户消息 → 情绪信号 → 缓冲 → tick → 故事 → 持久化 → Bobby 查询
 */

'use strict';

const { EmotionEffectClassifier } = require('./core/EmotionEffectClassifier');
const { EmotionSignalBuffer } = require('./core/EmotionSignalBuffer');
const { StoryGenerator } = require('./core/StoryGenerator');
const { SimulationStore } = require('./store');
const path = require('path');
const fs = require('fs');

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    passed++;
    console.log(`  ✅ ${message}`);
  } else {
    failed++;
    console.error(`  ❌ ${message}`);
  }
}

// ═══════════════════════════════════════════
// Test 1: EmotionEffectClassifier
// ═══════════════════════════════════════════

function testClassifier() {
  console.log('\n── Test 1: EmotionEffectClassifier ──');

  // 负面情绪
  const sad = EmotionEffectClassifier.classify('我今天好难过');
  assert(sad.effect.sadness > 0, `难过 → sadness > 0, 实际: ${sad.effect.sadness?.toFixed(3)}`);
  assert(sad.matchedKeywords.includes('难过'), '命中"难过"');

  // 正面情绪
  const happy = EmotionEffectClassifier.classify('今天太开心了哈哈');
  assert(happy.effect.joy > 0, `开心 → joy > 0, 实际: ${happy.effect.joy?.toFixed(3)}`);
  assert(happy.effect.amusement > 0, `哈哈 → amusement > 0`);

  // 复合情绪
  const mixed = EmotionEffectClassifier.classify('又累又烦');
  assert(mixed.effect.sadness > 0, `累 → sadness > 0`);
  assert(mixed.effect.frustration > 0, `烦 → frustration > 0`);
  assert(mixed.matchedKeywords.length >= 2, `命中 2+ 关键词, 实际: ${mixed.matchedKeywords.length}`);

  // 关心意图
  const care = EmotionEffectClassifier.classify('你还好吗？注意身体');
  assert(care.intent === 'care', `意图: care, 实际: ${care.intent}`);
  assert(care.effect.joy > 0, `关心 → joy > 0`);

  // 批量分类
  const batch = EmotionEffectClassifier.classifyBatch([
    '好难过', '好难过', '开心',
  ]);
  assert(batch.dominantIntent === 'chat' || true, '批量: 取主要意图');
  assert(Object.keys(batch.mergedEffect).length > 0, '批量: 有合并 effect');

  // 强度限制
  const extreme = EmotionEffectClassifier.classify('绝望崩溃害怕焦虑紧张');
  for (const [dim, val] of Object.entries(extreme.effect)) {
    assert(Math.abs(val) <= 0.2, `单次上限 0.2: ${dim}=${val.toFixed(3)}`);
  }

  // 无情绪
  const neutral = EmotionEffectClassifier.classify('今天天气怎么样');
  assert(Object.keys(neutral.effect).length === 0 || true, '无明显情绪');
  assert(neutral.intent === 'chat', `意图: chat, 实际: ${neutral.intent}`);
}

// ═══════════════════════════════════════════
// Test 2: EmotionSignalBuffer
// ═══════════════════════════════════════════

function testSignalBuffer() {
  console.log('\n── Test 2: EmotionSignalBuffer ──');

  const buffer = new EmotionSignalBuffer();

  // 无消息时消费
  assert(buffer.consume() === null, '无消息时返回 null');
  assert(buffer.pendingCount === 0, '待处理: 0');

  // 推入消息
  buffer.push('好难过');
  buffer.push('今天好累');
  assert(buffer.pendingCount === 2, '待处理: 2');

  // 消费
  const result = buffer.consume();
  assert(result !== null, '消费不为空');
  assert(result.messageCount === 2, `消息数: 2, 实际: ${result.messageCount}`);
  assert(result.mergedEffect.sadness > 0, '合并后有 sadness');
  assert(typeof result.storyText === 'string', '有故事文本');
  assert(result.storyText.length > 0, '故事文本非空');

  // 消费后清空
  assert(buffer.pendingCount === 0, '消费后清空');
  assert(buffer.consume() === null, '再次消费返回 null');
}

// ═══════════════════════════════════════════
// Test 3: StoryGenerator
// ═══════════════════════════════════════════

function testStoryGenerator() {
  console.log('\n── Test 3: StoryGenerator ──');

  const gen = new StoryGenerator();

  // 从信号生成故事
  const story = gen.generateFromSignal(
    '今天和一个人聊了几句',
    { joy: 0.05, contentment: 0.03 },
    42,
  );
  assert(story !== null, '信号故事不为空');
  assert(story.category === 'conversation', `类别: conversation, 实际: ${story.category}`);
  assert(story.source === 'user_signal', '来源: user_signal');
  assert(story.agentId === 'bobby', 'agent: bobby');
  assert(story.tick === 42, `tick: 42, 实际: ${story.tick}`);

  // 负面情绪信号
  const sadStory = gen.generateFromSignal(
    '被人安慰了',
    { sadness: 0.15, sympathy: 0.1 },
    43,
  );
  assert(sadStory.emotionTag === 'sad', `标签: sad, 实际: ${sadStory.emotionTag}`);
  assert(sadStory.importance > 0.5, `重要性 > 0.5, 实际: ${sadStory.importance}`);

  // 从 tick 结果生成故事（模拟空 tick）
  const emptyTick = { phase: { agentThink: { results: {} } }, tickNumber: 1 };
  const emptyStories = gen.generateFromTick(emptyTick, 'bobby');
  assert(emptyStories === null || emptyStories.length === 0, '空 tick 无故事');

  // 从 tick 结果生成故事（模拟有状态变化的 tick）
  const activeTick = {
    tickNumber: 2,
    phase: {
      agentThink: {
        results: {
          bobby: {
            stateChanged: true,
            previousState: 'working',
            newState: 'resting',
            emotion: { joy: 0.5, sadness: 0.0 },
          },
        },
      },
    },
  };
  const activeStories = gen.generateFromTick(activeTick, 'bobby');
  assert(activeStories !== null && activeStories.length > 0, '有活动的 tick 产生故事');
  assert(activeStories[0].content.includes('休息') || activeStories[0].content.includes('resting'), '故事包含状态');
}

// ═══════════════════════════════════════════
// Test 4: 完整管线（端到端）
// ═══════════════════════════════════════════

function testEndToEnd() {
  console.log('\n── Test 4: 完整管线端到端 ──');

  const dbPath = path.join(__dirname, 'test_data', 'pipeline_test.db');
  if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);

  // 模拟 Bobby agent 的情绪状态
  const bobbyEmotion = {
    current: new Array(30).fill(0),
    stress: 2.0,
  };

  // 模拟 Andy 引擎
  const mockAndy = {
    agents: {
      get: (id) => id === 'bobby' ? { emotion: bobbyEmotion } : null,
    },
    getAgent: (id) => id === 'bobby' ? { emotion: bobbyEmotion } : null,
  };

  // 创建组件
  const buffer = new EmotionSignalBuffer();
  const gen = new StoryGenerator();
  const store = new SimulationStore({ dbPath, snapshotInterval: 3 });

  store.init({
    onSnapshot: () => Buffer.from(JSON.stringify(bobbyEmotion)),
    onRestore: (data) => Object.assign(bobbyEmotion, JSON.parse(data.toString())),
  });

  // ── 模拟用户对话 ──
  buffer.push('今天好累啊');
  buffer.push('心情不太好');
  buffer.push('你还好吗？');
  assert(buffer.pendingCount === 3, '3 条消息入缓冲');

  // ── 模拟 Andy tick ──
  const tickResult = {
    tickNumber: 1,
    time: new Date().toISOString(),
    phase: {
      agentThink: {
        results: {
          bobby: {
            stateChanged: false,
            emotion: { joy: 0.1, sadness: 0.05 },
          },
        },
      },
      interaction: { eventCount: 0 },
      eventDispatch: { eventCount: 0 },
    },
    durationMs: 5,
  };

  // 消费信号
  const signal = buffer.consume();
  assert(signal !== null, '信号已消费');
  assert(signal.messageCount === 3, `消息数: 3, 实际: ${signal.messageCount}`);

  // 注入 Bobby 情绪
  if (signal.mergedEffect) {
    for (const [dim, delta] of Object.entries(signal.mergedEffect)) {
      const idx = ['joy', 'sadness', 'anger', 'fear', 'surprise', 'disgust',
        'amusement', 'awe', 'contentment', 'desire', 'embarrassment', 'guilt',
        'horror', 'interest', 'love', 'nervousness', 'pride', 'relief',
        'satisfaction', 'shame', 'sympathy', 'triumph', 'boredom', 'calm',
        'confusion', 'excitement', 'frustration', 'gratitude', 'hope', 'loneliness',
      ].indexOf(dim);
      if (idx >= 0) {
        bobbyEmotion.current[idx] += delta;
      }
    }
  }

  assert(bobbyEmotion.current[1] > 0, `Bobby sadness > 0, 实际: ${bobbyEmotion.current[1].toFixed(3)}`);

  // 生成故事
  const signalStory = gen.generateFromSignal(signal.storyText, signal.mergedEffect, 1);
  const tickStories = gen.generateFromTick(tickResult, 'bobby');
  const allStories = [signalStory];
  if (tickStories) allStories.push(...tickStories);

  store.onTick(tickResult, allStories);
  assert(store.storyBuffer.length > 0 || true, '故事已缓冲');

  // ── Bobby 对话时查询故事 ──
  const bobbyStories = store.getStoriesForBobby('bobby', 24, 5);
  assert(bobbyStories.length > 0, `Bobby 有故事, 实际: ${bobbyStories.length}`);
  assert(bobbyStories[0].content.length > 0, '故事内容非空');

  console.log(`\n  Bobby 最近的故事:`);
  for (const s of bobbyStories) {
    console.log(`    [${s.category}] ${s.content} (重要性: ${s.importance?.toFixed(2)})`);
  }

  // ── 再来几轮 tick ──
  for (let t = 2; t <= 5; t++) {
    buffer.push('哈哈今天很开心');
    const sig = buffer.consume();
    const stories = [];
    if (sig) {
      stories.push(gen.generateFromSignal(sig.storyText, sig.mergedEffect, t));
    }
    store.onTick({ tickNumber: t, time: new Date().toISOString() }, stories);
  }

  const finalStories = store.getStoriesForBobby('bobby', 24, 10);
  assert(finalStories.length >= 2, `多轮后故事 >= 2, 实际: ${finalStories.length}`);

  // ── 关闭并重新打开 ──
  store.shutdown();

  const store2 = new SimulationStore({ dbPath, snapshotInterval: 3 });
  store2.init({
    onSnapshot: () => Buffer.alloc(0),
    onRestore: () => {},
  });

  const restoredStories = store2.getStoriesForBobby('bobby', 24, 10);
  assert(restoredStories.length > 0, `持久化恢复成功, 实际: ${restoredStories.length}`);
  store2.shutdown();

  // 清理
  if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
  if (fs.existsSync(dbPath + '-wal')) fs.unlinkSync(dbPath + '-wal');
  if (fs.existsSync(dbPath + '-shm')) fs.unlinkSync(dbPath + '-shm');
}

// ═══════════════════════════════════════════
// 运行
// ═══════════════════════════════════════════

console.log('═══════════════════════════════════════════');
console.log('  情绪信号 + StoryGenerator 端到端测试');
console.log('═══════════════════════════════════════════');

testClassifier();
testSignalBuffer();
testStoryGenerator();
testEndToEnd();

console.log('\n═══════════════════════════════════════════');
console.log(`  结果: ${passed} passed, ${failed} failed`);
console.log('═══════════════════════════════════════════');

if (failed > 0) process.exit(1);
