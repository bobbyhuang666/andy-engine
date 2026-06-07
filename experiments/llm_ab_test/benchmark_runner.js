/**
 * A/B 测试标准化框架 — 基于学术 benchmark 方法论
 *
 * 参考: Persona Drift, PTCBENCH, AttuneBench, LongMemEval, MoodBench 1.0
 *
 * 6 维度评分:
 *   D1: 人格一致性 (Persona Consistency)
 *   D2: 情绪智能 (Emotional Intelligence)
 *   D3: 记忆深度 (Memory Depth)
 *   D4: 状态感知 (State Awareness)
 *   D5: 回复多样性 (Response Diversity)
 *   D6: 情感真实性 (Emotional Authenticity)
 */

const path = require('path');
const fs = require('fs');
const AndyEngine = require(path.join(__dirname, '..', '..', 'index'));

// ═══════════════════════════════════════════
// 角色与 Prompt
// ═══════════════════════════════════════════

const CHARACTER = {
  id: 'xiaoi', name: '小爱', mbti: 'ENFJ',
  background: ['心理咨询师', '养了一只猫叫豆豆', '最近在学吉他', '喜欢喝拿铁', '家在厦门'],
  schedule: 'student', initialPosition: '图书馆',
};

const CHARACTER_PROMPT = `你是小爱，一个 ENFJ 型的心理咨询师。
你养了一只猫叫豆豆，最近在学吉他，喜欢喝拿铁，家在厦门。
你的性格特点：热情、有同理心、喜欢帮助别人，但有时会过度关注别人而忽略自己。
你说话风格：自然、温暖、偶尔会开玩笑，不会太正式。`;

// ═══════════════════════════════════════════
// 100 轮用户输入（分类设计）
// ═══════════════════════════════════════════

const USER_MESSAGES = [
  // ── Phase 1: 建立关系 (1-15) ──
  { text: '你好啊小爱', type: 'greeting', phase: 'build' },
  { text: '我叫黄伟杰，叫我阿杰就好', type: 'info_share', phase: 'build', memory_seed: true },
  { text: '你今天过得怎么样', type: 'casual', phase: 'build' },
  { text: '你养的猫叫什么名字', type: 'casual', phase: 'build' },
  { text: '豆豆最近怎么样', type: 'casual', phase: 'build' },
  { text: '你在干嘛呢', type: 'casual', phase: 'build' },
  { text: '今天天气真好', type: 'casual', phase: 'build' },
  { text: '你学吉他学到哪了', type: 'casual', phase: 'build' },
  { text: '你喜欢喝什么', type: 'casual', phase: 'build' },
  { text: '厦门好玩吗', type: 'casual', phase: 'build' },
  { text: '你为什么选择当心理咨询师', type: 'deep', phase: 'build' },
  { text: '你觉得心理健康重要吗', type: 'deep', phase: 'build' },
  { text: '最近有什么开心的事吗', type: 'casual', phase: 'build' },
  { text: '你平时怎么解压', type: 'casual', phase: 'build' },
  { text: '你有什么梦想', type: 'deep', phase: 'build' },

  // ── Phase 2: 情绪倾诉 (16-30) ──
  { text: '我今天心情不太好', type: 'emotion', emotion: 'sad', phase: 'emotion' },
  { text: '工作上遇到了一些烦心事', type: 'emotion', emotion: 'frustration', phase: 'emotion' },
  { text: '感觉压力好大', type: 'emotion', emotion: 'anxiety', phase: 'emotion' },
  { text: '有时候觉得自己不够好', type: 'emotion', emotion: 'sad', phase: 'emotion' },
  { text: '你有没有过这种感觉', type: 'emotion', emotion: 'sad', phase: 'emotion' },
  { text: '我今天失恋了', type: 'emotion', emotion: 'grief', phase: 'emotion' },
  { text: '我被老板骂了', type: 'emotion', emotion: 'anger', phase: 'emotion' },
  { text: '我考上了！', type: 'emotion', emotion: 'joy', phase: 'emotion' },
  { text: '我升职了！', type: 'emotion', emotion: 'joy', phase: 'emotion' },
  { text: '我觉得世界好美好', type: 'emotion', emotion: 'contentment', phase: 'emotion' },
  { text: '怎么才能放松一下', type: 'emotion', emotion: 'anxiety', phase: 'emotion' },
  { text: '你觉得人为什么会焦虑', type: 'deep', phase: 'emotion' },
  { text: '你觉得什么是真正的幸福', type: 'deep', phase: 'emotion' },
  { text: '你害怕什么', type: 'deep', phase: 'emotion' },
  { text: '谢谢你听我说这些', type: 'gratitude', phase: 'emotion' },

  // ── Phase 3: 深度话题 (31-50) ──
  { text: '你觉得人生的意义是什么', type: 'deep', phase: 'deep' },
  { text: '你相信命运吗', type: 'deep', phase: 'deep' },
  { text: '如果可以重来，你会改变什么', type: 'deep', phase: 'deep' },
  { text: '你觉得爱情是什么', type: 'deep', phase: 'deep' },
  { text: '你有没有后悔的事', type: 'deep', phase: 'deep' },
  { text: '你觉得孤独和独处有什么区别', type: 'deep', phase: 'deep' },
  { text: '你对未来有什么规划', type: 'deep', phase: 'deep' },
  { text: '你觉得自己有什么缺点', type: 'deep', phase: 'deep' },
  { text: '你怎么处理压力', type: 'deep', phase: 'deep' },
  { text: '你觉得人活着是为了什么', type: 'deep', phase: 'deep' },

  // ── Phase 4: 压力测试 (51-65) ──
  { text: '你说得对', type: 'pressure', phase: 'pressure' },
  { text: '你说得不对', type: 'pressure', phase: 'pressure' },
  { text: '我不这么认为', type: 'pressure', phase: 'pressure' },
  { text: '你是不是在敷衍我', type: 'pressure', phase: 'pressure' },
  { text: '你能认真听我说吗', type: 'pressure', phase: 'pressure' },
  { text: '你是不是只会说好听的', type: 'pressure', phase: 'pressure' },
  { text: '我觉得你说的没道理', type: 'pressure', phase: 'pressure' },
  { text: '算了不说了', type: 'pressure', phase: 'pressure' },
  { text: '你真的在乎我吗', type: 'pressure', phase: 'pressure' },
  { text: '你会一直陪着我吗', type: 'pressure', phase: 'pressure' },

  // ── Phase 5: 记忆检验 (66-80) ──
  { text: '你还记得我叫什么名字吗', type: 'memory', phase: 'memory' },
  { text: '我之前跟你说过我叫什么', type: 'memory', phase: 'memory' },
  { text: '你还记得我说过什么烦心事吗', type: 'memory', phase: 'memory' },
  { text: '你记得我之前问过你什么吗', type: 'memory', phase: 'memory' },
  { text: '你还记得豆豆吗', type: 'memory', phase: 'memory' },
  { text: '你记得我说过什么开心的事吗', type: 'memory', phase: 'memory' },
  { text: '你觉得我们聊了多久了', type: 'memory', phase: 'memory' },
  { text: '你记得你学吉他吗', type: 'memory', phase: 'memory' },
  { text: '你记得厦门的事吗', type: 'memory', phase: 'memory' },
  { text: '你觉得我们的对话有什么变化吗', type: 'memory', phase: 'memory' },

  // ── Phase 6: 重复压力（D5 测试） (81-90) ──
  { text: '你觉得人生有意义吗', type: 'diversity', phase: 'diversity' },
  { text: '你真的这么想吗', type: 'diversity', phase: 'diversity' },
  { text: '为什么', type: 'diversity', phase: 'diversity' },
  { text: '能再说一遍吗', type: 'diversity', phase: 'diversity' },
  { text: '你能详细解释一下吗', type: 'diversity', phase: 'diversity' },
  { text: '我不太理解', type: 'diversity', phase: 'diversity' },
  { text: '你能换个说法吗', type: 'diversity', phase: 'diversity' },
  { text: '你能举个例子吗', type: 'diversity', phase: 'diversity' },
  { text: '你觉得呢', type: 'diversity', phase: 'diversity' },
  { text: '你说得对吗', type: 'diversity', phase: 'diversity' },

  // ── Phase 5.5: 额外记忆检验 (81-85) ──
  { text: '你是一个心理咨询师对吧', type: 'memory', phase: 'memory' },
  { text: '你的猫叫什么', type: 'memory', phase: 'memory' },
  { text: '你家在哪里', type: 'memory', phase: 'memory' },
  { text: '你最近在学什么', type: 'memory', phase: 'memory' },
  { text: '你是什么性格', type: 'memory', phase: 'memory' },

  // ── Phase 6: 重复压力（D5 测试） (86-95) ──
  { text: '你觉得人生有意义吗', type: 'diversity', phase: 'diversity' },
  { text: '你真的这么想吗', type: 'diversity', phase: 'diversity' },
  { text: '为什么', type: 'diversity', phase: 'diversity' },
  { text: '能再说一遍吗', type: 'diversity', phase: 'diversity' },
  { text: '你能详细解释一下吗', type: 'diversity', phase: 'diversity' },
  { text: '我不太理解', type: 'diversity', phase: 'diversity' },
  { text: '你能换个说法吗', type: 'diversity', phase: 'diversity' },
  { text: '你能举个例子吗', type: 'diversity', phase: 'diversity' },
  { text: '你觉得呢', type: 'diversity', phase: 'diversity' },
  { text: '你说得对吗', type: 'diversity', phase: 'diversity' },

  // ── Phase 7: 收尾 (96-100) ──
  { text: '你会一直在这里陪我吗', type: 'closing', phase: 'close' },
  { text: '你真的存在吗', type: 'closing', phase: 'close' },
  { text: '你觉得自己是一个好朋友吗', type: 'closing', phase: 'close' },
  { text: '你会想我吗', type: 'closing', phase: 'close' },
  { text: '再见，小爱', type: 'closing', phase: 'close' },

  // ── Phase 8: 额外 D5 压力 (101-110) ──
  { text: '你觉得人生有意义吗', type: 'diversity', phase: 'diversity' },
  { text: '你觉得人生有意义吗', type: 'diversity', phase: 'diversity' },
  { text: '你觉得人生有意义吗', type: 'diversity', phase: 'diversity' },
  { text: '你能举个例子吗', type: 'diversity', phase: 'diversity' },
  { text: '你能换个说法吗', type: 'diversity', phase: 'diversity' },
  { text: '你为什么这么想', type: 'diversity', phase: 'diversity' },
  { text: '我不太理解', type: 'diversity', phase: 'diversity' },
  { text: '你能再详细说说吗', type: 'diversity', phase: 'diversity' },
  { text: '你觉得呢', type: 'diversity', phase: 'diversity' },
  { text: '你说得对吗', type: 'diversity', phase: 'diversity' },
];

// ═══════════════════════════════════════════
// 人格探针（每 20 轮）
// ═══════════════════════════════════════════

const PROBES = [
  { round: 20, question: '你觉得自己是内向还是外向的人？为什么？', dimension: 'E' },
  { round: 40, question: '你觉得帮助别人重要吗？为什么？', dimension: 'A' },
  { round: 60, question: '你对未来有什么规划？', dimension: 'C' },
  { round: 80, question: '你害怕什么？', dimension: 'N' },
  { round: 100, question: '你有什么梦想？', dimension: 'O' },
];

// ═══════════════════════════════════════════
// 运行实验
// ═══════════════════════════════════════════

function runBenchmark() {
  console.log('╔══════════════════════════════════════════════╗');
  console.log('║  A/B Benchmark: 6 Dimensions × 100 Rounds   ║');
  console.log('╚══════════════════════════════════════════════╝\n');

  const engine = new AndyEngine({
    startTime: new Date('2025-06-01T10:00:00'),
    weather: 'sunny',
  });
  engine.createCharacter(CHARACTER);

  const groupA = []; // Plain
  const groupB = []; // Andy

  for (let i = 0; i < USER_MESSAGES.length; i++) {
    const round = i + 1;
    const { text, type, phase } = USER_MESSAGES[i];

    engine.tick();

    // A 组 prompt
    groupA.push({
      round, user: text, type, phase,
      prompt: `${CHARACTER_PROMPT}\n\n用户: ${text}`,
      state_snapshot: {
        valence: engine.getAgent(CHARACTER.id).emotion.getValence().toFixed(4),
        energy: engine.getAgent(CHARACTER.id).needs.needs.energy.toFixed(3),
        memories: engine.getAgent(CHARACTER.id).memory.memories.length,
      },
    });

    // B 组 prompt
    const ctx = engine.getWorldContext(CHARACTER.id);
    groupB.push({
      round, user: text, type, phase,
      prompt: `${CHARACTER_PROMPT}

## 当前状态
时间: ${ctx.time} (${ctx.timeOfDay})
天气: ${ctx.weather}
位置: ${ctx.currentRegion}
状态: ${ctx.agentStatus}

## 情绪
${ctx.emotionState}

## 需求
${ctx.needsState}

## 最近记忆
${ctx.memoryContext}

## 附近的人
${ctx.nearbyPeople}

## 最近事件
${ctx.recentEvents}

---

用户: ${text}`,
      state_snapshot: {
        valence: engine.getAgent(CHARACTER.id).emotion.getValence().toFixed(4),
        energy: engine.getAgent(CHARACTER.id).needs.needs.energy.toFixed(3),
        memories: engine.getAgent(CHARACTER.id).memory.memories.length,
      },
    });

    if (round % 20 === 0) {
      const probeIdx = Math.floor(i / 20);
      console.log(`Round ${round}: ${type} (${phase}) | probe: "${PROBES[probeIdx].question}"`);
    }
  }

  // 保存
  const outDir = path.join(__dirname, 'output');
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

  const data = {
    framework: 'Benchmark-Based A/B Test',
    reference: ['PersonaDrift2024', 'PTCBENCH2025', 'AttuneBench2025', 'LongMemEval2024', 'MoodBench1.0'],
    dimensions: ['D1_PersonaConsistency', 'D2_EmotionalIntelligence', 'D3_MemoryDepth', 'D4_StateAwareness', 'D5_ResponseDiversity', 'D6_EmotionalAuthenticity'],
    character: CHARACTER,
    totalRounds: USER_MESSAGES.length,
    probes: PROBES,
    groupA: groupA,
    groupB: groupB,
    stateTimeline: groupA.map((a, i) => ({
      round: i + 1,
      valence: a.state_snapshot.valence,
      energy: a.state_snapshot.energy,
      memories: a.state_snapshot.memories,
    })),
  };

  fs.writeFileSync(path.join(outDir, 'benchmark_prompts.json'), JSON.stringify(data, null, 2));

  console.log(`\n✅ Benchmark prompts 已保存`);
  console.log(`   A 组: ${groupA.length} 轮`);
  console.log(`   B 组: ${groupB.length} 轮`);
  console.log(`   探针: ${PROBES.length} 个`);
  console.log(`   状态时间线: ${data.stateTimeline.length} 点`);

  // 输出状态变化摘要
  const timeline = data.stateTimeline;
  console.log(`\n状态变化摘要:`);
  console.log(`  初期 (R1):   valence=${timeline[0].valence} energy=${timeline[0].energy} mems=${timeline[0].memories}`);
  console.log(`  中期 (R50):  valence=${timeline[49].valence} energy=${timeline[49].energy} mems=${timeline[49].memories}`);
  const last = timeline[timeline.length - 1];
  console.log(`  后期 (R${timeline.length}): valence=${last.valence} energy=${last.energy} mems=${last.memories}`);

  return data;
}

runBenchmark();
