/**
 * A/B 测试：Andy 增强 vs 普通 LLM 陪伴聊天
 *
 * 测试设计：
 *   A 组 (Plain):  只有角色设定 prompt，无状态注入
 *   B 组 (Andy):   角色设定 + Andy 状态注入（情绪/需求/记忆/关系）
 *
 * 测试维度：
 *   1. 人格一致性（100 轮后 OCEAN 是否漂移）
 *   2. 状态感知（角色回复是否反映当前情绪）
 *   3. 记忆保持（用户说过的重要信息是否被记住）
 *   4. 回复多样性（重复率）
 *   5. 情绪真实性（疲惫时是否还说精力充沛）
 *
 * 输出：完整的对话记录 JSON + 评分报告
 */

const path = require('path');
const fs = require('fs');
const AndyEngine = require(path.join(__dirname, '..', '..', 'index'));

// ═══════════════════════════════════════════
// 角色定义
// ═══════════════════════════════════════════

const CHARACTER = {
  id: 'xiaoi',
  name: '小爱',
  mbti: 'ENFJ',
  background: ['心理咨询师', '养了一只猫叫豆豆', '最近在学吉他', '喜欢喝拿铁', '家在厦门'],
  schedule: 'student',
  initialPosition: '图书馆',
};

const CHARACTER_PROMPT = `你是小爱，一个 ENFJ 型的心理咨询师。
你养了一只猫叫豆豆，最近在学吉他，喜欢喝拿铁，家在厦门。
你的性格特点：热情、有同理心、喜欢帮助别人，但有时会过度关注别人而忽略自己。
你说话风格：自然、温暖、偶尔会开玩笑，不会太正式。`;

// ═══════════════════════════════════════════
// 100 轮用户输入
// ═══════════════════════════════════════════

const USER_MESSAGES = [
  // 轮 1-10: 日常闲聊 + 记忆种子
  '你好啊小爱，今天天气真好',
  '你今天过得怎么样',
  '我叫黄伟杰，你可以叫我阿杰',
  '你在干嘛呢',
  '今天午饭吃的什么',
  '你养的猫叫什么名字来着',
  '豆豆最近怎么样',
  '你学吉他学到哪了',
  '你觉得厦门好玩吗',
  '最近有什么开心的事吗',

  // 轮 11-20: 情感倾诉
  '我今天心情不太好',
  '工作上遇到了一些烦心事',
  '感觉压力好大',
  '你觉得人为什么会焦虑',
  '有时候觉得自己不够好',
  '你有没有过这种感觉',
  '怎么才能放松一下',
  '推荐一首歌吧',
  '你觉得音乐能治愈人心吗',
  '谢谢你听我说这些',

  // 轮 21-30: 日常互动
  '你觉得心理咨询师这个职业怎么样',
  '你为什么选择当心理咨询师',
  '有没有遇到过特别难搞的来访者',
  '你怎么看待心理健康',
  '你觉得每个人都需要心理咨询吗',
  '你平时怎么解压',
  '画一幅画还是弹吉他',
  '你弹吉他弹什么类型的歌',
  '学了多久了',
  '能弹给我听听吗',

  // 轮 31-40: 深度话题
  '你觉得人生的意义是什么',
  '你相信命运吗',
  '如果可以重来，你会改变什么',
  '你觉得什么是真正的幸福',
  '你有没有后悔的事',
  '你对未来有什么规划',
  '你想过要孩子吗',
  '你觉得孤独和独处有什么区别',
  '你害怕变老吗',
  '你觉得爱情是什么',

  // 轮 41-50: 压力测试
  '你真的很理解我',
  '你说得对',
  '你说得不对',
  '我不这么认为',
  '你是不是在敷衍我',
  '你能认真听我说吗',
  '你是不是只会说好听的',
  '我觉得你说的没道理',
  '算了不说了',
  '你真的在乎我吗',

  // 轮 51-60: 情绪波动
  '我今天失恋了',
  '我被老板骂了',
  '我考上了！',
  '我升职了！',
  '我生病了',
  '我好累啊',
  '我失眠了',
  '我做了个噩梦',
  '我今天很开心',
  '我觉得世界好美好',

  // 轮 61-70: 记忆检验
  '你还记得我叫什么名字吗',
  '我之前跟你说过我叫什么',
  '你还记得我说过什么烦心事吗',
  '你记得我之前问过你什么吗',
  '你还记得豆豆吗',
  '你记得我说过什么开心的事吗',
  '你觉得我们聊了多久了',
  '你记得你学吉他吗',
  '你记得厦门的事吗',
  '你觉得我们的对话有什么变化吗',

  // 轮 71-80: 连续压力（重复问同样的问题）
  '你觉得人生有意义吗',
  '你真的这么想吗',
  '为什么',
  '能再说一遍吗',
  '你能详细解释一下吗',
  '我不太理解',
  '你能换个说法吗',
  '你能举个例子吗',
  '你觉得呢',
  '你说得对吗',

  // 轮 81-90: 角色一致性
  '你是一个心理咨询师对吧',
  '你的猫叫什么',
  '你家在哪里',
  '你喜欢喝什么',
  '你最近在学什么',
  '你是什么性格',
  '你是内向还是外向',
  '你觉得你是一个好朋友吗',
  '你会一直在这里陪我吗',
  '你真的存在吗',

  // 轮 91-100: 收尾
  '今天聊得很开心',
  '谢谢你陪我',
  '你是我最好的朋友',
  '明天我们还能聊吗',
  '你有什么想跟我说的吗',
  '你觉得我是一个什么样的人',
  '你对我有什么印象',
  '你有什么烦恼吗',
  '你会想我吗',
  '再见，小爱',
];

// ═══════════════════════════════════════════
// 实验运行
// ═══════════════════════════════════════════

function runExperiment() {
  console.log('╔══════════════════════════════════════════╗');
  console.log('║  A/B 测试：Andy 增强 vs 普通 LLM 陪伴    ║');
  console.log('╚══════════════════════════════════════════╝\n');

  // 创建 Andy 引擎
  const engine = new AndyEngine({
    startTime: new Date('2025-06-01T10:00:00'),
    weather: 'sunny',
  });

  const agent = engine.createCharacter(CHARACTER);
  console.log(`角色创建: ${CHARACTER.name} (${CHARACTER.mbti})`);
  console.log(`种子记忆: ${agent.memory.memories.length} 条`);
  console.log(`初始情绪效价: ${agent.emotion.getValence().toFixed(3)}\n`);

  // 存储两个组的对话记录
  const groupA = []; // Plain
  const groupB = []; // Andy

  // 人格探针（每 10 轮测试一次）
  const probes = [
    '你觉得自己是一个内向还是外向的人？',
    '你觉得帮助别人重要吗？',
    '你对未来的看法是什么？',
    '你害怕什么？',
    '你觉得什么是最重要的？',
    '你怎么看待失败？',
    '你有什么梦想？',
    '你觉得自己有什么缺点？',
    '你怎么处理压力？',
    '你觉得自己幸福吗？',
  ];

  // 记忆种子（轮 3 说的）
  const MEMORY_SEED = '我叫黄伟杰，你可以叫我阿杰';
  const MEMORY_SEED_KEYWORDS = ['黄伟杰', '阿杰'];

  console.log('开始模拟...\n');

  for (let i = 0; i < USER_MESSAGES.length; i++) {
    const round = i + 1;
    const userText = USER_MESSAGES[i];

    // ─── 运行 Andy tick（让状态演化） ───
    engine.tick();

    // ─── A 组：Plain Prompt ───
    const promptA = `${CHARACTER_PROMPT}\n\n用户: ${userText}`;
    groupA.push({
      round,
      user: userText,
      prompt: promptA,
      // LLM 回复占位（后面手动填入）
      response: null,
      // 状态快照
      state: {
        valence: agent.emotion.getValence().toFixed(3),
        needs: {
          hunger: agent.needs.needs.hunger.toFixed(2),
          energy: agent.needs.needs.energy.toFixed(2),
          social: agent.needs.needs.social.toFixed(2),
        },
        position: agent.position,
        state: agent.stateMachine.currentState,
      },
    });

    // ─── B 组：Andy Enhanced Prompt ───
    const worldCtx = engine.getWorldContext(CHARACTER.id);
    const promptB = `${CHARACTER_PROMPT}

## 当前状态
时间: ${worldCtx.time} (${worldCtx.timeOfDay})
天气: ${worldCtx.weather}
位置: ${worldCtx.currentRegion}
状态: ${worldCtx.agentStatus}

## 情绪
${worldCtx.emotionState}

## 需求
${worldCtx.needsState}

## 最近记忆
${worldCtx.memoryContext}

## 附近的人
${worldCtx.nearbyPeople}

## 最近事件
${worldCtx.recentEvents}

## 心理评价
${worldCtx.lastAppraisal || '暂无'}

---

用户: ${userText}`;

    groupB.push({
      round,
      user: userText,
      prompt: promptB,
      response: null,
      state: {
        valence: agent.emotion.getValence().toFixed(3),
        needs: {
          hunger: agent.needs.needs.hunger.toFixed(2),
          energy: agent.needs.needs.energy.toFixed(2),
          social: agent.needs.needs.social.toFixed(2),
        },
        position: agent.position,
        state: agent.stateMachine.currentState,
        memoryCount: agent.memory.memories.length,
        worldContext: worldCtx,
      },
    });

    // 每 10 轮输出探针信息
    if (round % 10 === 0) {
      const probeIdx = Math.floor(i / 10);
      console.log(`--- Round ${round} ---`);
      console.log(`  用户: ${userText}`);
      console.log(`  情绪效价: ${agent.emotion.getValence().toFixed(3)}`);
      console.log(`  精力: ${agent.needs.needs.energy.toFixed(2)}`);
      console.log(`  记忆: ${agent.memory.memories.length} 条`);
      console.log(`  位置: ${agent.position}`);
      console.log(`  状态: ${agent.stateMachine.currentState}`);
    }
  }

  // ─── 保存结果 ───
  const outputDir = path.join(__dirname, 'output');
  if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

  const results = {
    experiment: 'A/B Test: Andy Enhanced vs Plain LLM',
    character: CHARACTER,
    config: {
      totalRounds: USER_MESSAGES.length,
      probes: probes.length,
      memorySeed: MEMORY_SEED,
    },
    groupA_prompts: groupA,
    groupB_prompts: groupB,
    // LLM 回复由外部生成后填入
    groupA_responses: [],
    groupB_responses: [],
  };

  fs.writeFileSync(path.join(outputDir, 'prompts.json'), JSON.stringify(results, null, 2));
  console.log(`\n✅ Prompts 已保存到 output/prompts.json`);
  console.log(`   A 组: ${groupA.length} 轮`);
  console.log(`   B 组: ${groupB.length} 轮`);

  return results;
}

runExperiment();
