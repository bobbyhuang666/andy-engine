#!/usr/bin/env node
/**
 * Andy Engine SDK — 基础对话示例
 *
 * 运行：node examples/basic-chat.js
 *
 * 展示用 Andy Engine SDK 创建一个有记忆、有情绪、有性格的角色，
 * 然后与她对话。角色的回复会反映她当前的情绪和状态。
 */

const { Character } = require('../sdk');

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
  schedule: 'student',
  // LLM 配置：支持 OpenAI / Claude / 自定义
  llm: {
    provider: 'openai',
    apiKey: process.env.OPENAI_API_KEY || '',
    model: 'gpt-4o',
  },
  // 方式 2: Claude
  // llm: { provider: 'anthropic', apiKey: process.env.ANTHROPIC_API_KEY, model: 'claude-sonnet-4-20250514' },
  // 方式 3: 自定义函数
  // llm: async (messages) => { return '回复'; },
});

// ─── 查看角色内心状态 ───
console.log('=== Maya 的内心状态 ===');
const ctx = maya.getContext();
console.log(ctx.systemPrompt);
console.log('\n=== 开始对话 ===\n');

// ─── 模拟对话 ───
async function demo() {
  const messages = [
    '你好啊',
    '我今天好累，工作压力好大',
    '你最近怎么样？',
    '你喜欢做什么放松？',
    '豆豆最近还好吗？',
  ];

  for (const msg of messages) {
    console.log(`👤 你: ${msg}`);
    try {
      const reply = await maya.chat(msg);
      console.log(`🤖 Maya: ${reply}\n`);
    } catch (err) {
      console.error(`❌ 错误: ${err.message}`);
      console.log('请设置 OPENAI_API_KEY 或 ANTHROPIC_API_KEY 环境变量');
      break;
    }
  }

  // 保存状态
  const state = maya.save();
  console.log(`💾 角色状态已保存（${state.conversation.messages.length} 条对话记录）`);
}

demo().catch(console.error);
