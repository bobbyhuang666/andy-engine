#!/usr/bin/env node
/**
 * Andy Engine SDK — 多角色示例
 *
 * 运行：node examples/multi-character.js
 *
 * 展示多个角色共同生活：她们有各自的性格、情绪、社交关系，
 * 会自主互动，形成真实的社会。
 */

const { Andy } = require('andy-engine/sdk');

// ─── 创建世界 ───
const world = new Andy({
  llm: {
    provider: 'openai',
    apiKey: process.env.OPENAI_API_KEY || '',
    model: 'gpt-4o',
  },
});

// ─── 添加角色 ───
world.addCharacter({
  name: 'Maya',
  personality: 'INFP',
  backstory: ['图书馆管理员', '喜欢看星星', '养了一只橘猫叫豆豆'],
  schedule: 'student',
});

world.addCharacter({
  name: 'Bob',
  personality: 'ENTP',
  backstory: ['计算机系学生', '喜欢辩论', '是Maya的同班同学'],
  schedule: 'student',
});

world.addCharacter({
  name: '小红',
  personality: 'ISFJ',
  backstory: ['护理专业', '温柔细心', '是Maya的室友'],
  schedule: 'student',
});

// ─── 模拟一天 ───
console.log('=== 模拟 24 小时 ===\n');

for (let i = 0; i < 288; i++) { // 288 ticks = 24 小时
  world.tick();
}

// ─── 查看状态 ───
const states = world.getStates();
for (const [id, state] of Object.entries(states)) {
  console.log(`\n--- ${state.name} ---`);
  console.log(`位置: ${state.currentRegion}`);
  console.log(`情绪: ${state.emotionState?.substring(0, 80)}...`);
  console.log(`需求: ${state.needsState}`);
}

// ─── 查看社交关系 ───
const graph = world.getSocialGraph();
console.log('\n=== 社交关系 ===');
for (const [id] of Object.entries(states)) {
  const rels = graph.getRelationships(id);
  if (rels.length > 0) {
    for (const rel of rels) {
      console.log(`${states[id].name} ↔ ${states[rel.getOther(id)]?.name || rel.getOther(id)}: ${rel.type} (${rel.strength.toFixed(2)})`);
    }
  }
}

// ─── 与某个角色对话 ───
async function chatDemo() {
  console.log('\n=== 与 Maya 对话 ===\n');
  try {
    const reply = await world.chat('char_0', '你好，今天怎么样？');
    console.log(`🤖 Maya: ${reply}`);
  } catch (err) {
    console.log('（对话需要设置 LLM API key）');
  }
}

chatDemo().catch(console.error);
