#!/usr/bin/env node
/**
 * Andy Engine SDK — 离线演示（无需 API key）
 *
 * 运行：node examples/offline-demo.js
 *
 * 用模拟 LLM 展示 SDK 的完整流程：
 *   1. 创建角色
 *   2. 查看 system prompt（角色内心世界）
 *   3. 多轮对话
 *   4. 角色状态变化
 *   5. 保存/恢复
 */

const { Character, NarrativeBuilder } = require('../sdk');

// 模拟 LLM（根据用户消息生成回复）
function mockLLM(messages) {
  const system = messages.find(m => m.role === 'system')?.content || '';
  const lastUser = messages.filter(m => m.role === 'user').pop()?.content || '';

  // 从 system prompt 提取角色状态
  const isTired = system.includes('困') || system.includes('累');
  const isSad = system.includes('不太好') || system.includes('低落');
  const isHappy = system.includes('不错') || system.includes('满足');

  if (lastUser.includes('累') || lastUser.includes('压力')) {
    if (isTired) return '我也挺累的...考研压力大，昨晚又失眠了。你呢？';
    return '工作压力大啊...辛苦了。要不要一起喝杯咖啡？';
  }
  if (lastUser.includes('开心') || lastUser.includes('好')) {
    if (isHappy) return '真的吗？那太好了！我也替你开心~';
    return '嗯，听起来不错。';
  }
  if (lastUser.includes('记得') || lastUser.includes('什么')) {
    return '我记得你说过的...让我想想。';
  }
  return '嗯，我在听。';
}

// ─── 创建角色 ───
const maya = new Character({
  name: 'Maya',
  personality: 'INFP',
  backstory: [
    '你是一个安静的图书馆管理员',
    '你喜欢在晚上看星星',
    '你养了一只橘猫叫豆豆',
    '你正在准备考研，压力有点大',
  ],
  llm: mockLLM,
});

// ─── 展示 system prompt ───
console.log('╔══════════════════════════════════════════╗');
console.log('║     Andy Engine SDK — 离线演示           ║');
console.log('╚══════════════════════════════════════════╝\n');

console.log('📋 Maya 的内心世界（System Prompt）:\n');
const ctx = maya.getContext();
console.log(ctx.systemPrompt);
console.log('\n' + '─'.repeat(50) + '\n');

// ─── 模拟对话 ───
async function demo() {
  const conversations = [
    '你好啊 Maya',
    '我今天好累，工作压力好大',
    '你最近怎么样？',
    '豆豆最近还好吗？',
    '你有什么想跟我说的吗？',
  ];

  for (const msg of conversations) {
    console.log(`👤 你: ${msg}`);
    const reply = await maya.chat(msg);
    console.log(`🤖 Maya: ${reply}\n`);
  }

  // ─── 展示状态变化 ───
  console.log('─'.repeat(50));
  console.log('\n📊 对话后 Maya 的状态:\n');
  const afterCtx = maya.getContext();
  const afterWorld = afterCtx.worldContext;
  console.log(`位置: ${afterWorld.currentRegion}`);
  console.log(`情绪: ${afterWorld.emotionState?.substring(0, 60)}...`);
  console.log(`需求: ${afterWorld.needsState}`);
  console.log(`记忆数: ${afterCtx.narrative}`);

  // ─── 保存/恢复 ───
  console.log('\n─'.repeat(50));
  console.log('\n💾 保存角色状态...');
  const state = maya.save();
  console.log(`保存了 ${state.conversation.messages.length} 条对话记录`);

  console.log('\n🔄 从保存的状态恢复...');
  const restored = Character.load(state, mockLLM);
  console.log(`恢复成功！角色名: ${restored.name}`);
  console.log(`对话历史: ${restored._conversation.length} 条消息`);

  // ─── 继续对话 ───
  console.log('\n--- 继续对话（从保存状态恢复后）---\n');
  console.log('👤 你: 你还记得我之前说了什么吗？');
  const reply = await restored.chat('你还记得我之前说了什么吗？');
  console.log(`🤖 Maya: ${reply}`);
}

demo().catch(console.error);
