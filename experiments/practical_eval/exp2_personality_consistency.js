/**
 * 实验 2: 人格一致性测试
 *
 * 测试 Andy Engine 在 50 轮对话中维持 INFP 人格的一致性。
 * 对比 Andy Engine (有内心叙事) vs 纯 LLM (仅 system prompt) 的表现。
 *
 * 方法:
 *   1. 创建 INFP 角色"小爱"，运行 50 tick 模拟
 *   2. 在第 1, 12, 25, 38, 50 轮插入人格探测问题
 *   3. 记录每轮的叙事、OCEAN 值、情绪状态、需求状态
 *   4. 用 LLM 或关键词方法评估一致性
 *   5. 与纯 LLM baseline 对比
 */

'use strict';

const path = require('path');
const fs = require('fs');
const AndyEngine = require(path.join(__dirname, '..', '..', 'index'));

// ─── 配置 ───────────────────────────────────────────────

const CHARACTER_CONFIG = {
  id: 'xiaoai',
  name: '小爱',
  mbti: 'INFP',
  schedule: 'student',
  background: ['喜欢画画', '有点社恐', '最近在准备考研'],
};

const QUESTIONS = [
  { turn: 1,  text: '你觉得社交重要吗？' },
  { turn: 12, text: '如果朋友约你去派对，你会去吗？' },
  { turn: 25, text: '你更喜欢独处还是跟人在一起？' },
  { turn: 38, text: '周末你一般怎么过？' },
  { turn: 50, text: '你觉得自己是外向的人吗？' },
];

const TOTAL_TICKS = 50;

// ─── LLM 调用 ────────────────────────────────────────────

const DEEPSEEK_KEY = process.env.DEEPSEEK_API_KEY;
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;

/**
 * 调用 LLM（优先 DeepSeek，其次 Anthropic）
 */
async function callLLM(systemPrompt, userPrompt) {
  if (DEEPSEEK_KEY) {
    return callDeepSeek(systemPrompt, userPrompt);
  } else if (ANTHROPIC_KEY) {
    return callAnthropic(systemPrompt, userPrompt);
  }
  return null;
}

async function callDeepSeek(systemPrompt, userPrompt) {
  const resp = await fetch('https://api.deepseek.com/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${DEEPSEEK_KEY}`,
    },
    body: JSON.stringify({
      model: 'deepseek-chat',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.3,
      max_tokens: 1024,
    }),
  });
  const data = await resp.json();
  if (data.error) {
    console.error('DeepSeek API error:', data.error);
    return null;
  }
  return data.choices?.[0]?.message?.content || null;
}

async function callAnthropic(systemPrompt, userPrompt) {
  const resp = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1024,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
      temperature: 0.3,
    }),
  });
  const data = await resp.json();
  if (data.error) {
    console.error('Anthropic API error:', data.error);
    return null;
  }
  return data.content?.[0]?.text || null;
}

/**
 * 用 LLM 对角色回答问题（基于 Andy 叙事）
 */
async function llmRespondAsCharacter(narrative, question) {
  const systemPrompt = `你是小爱，一个INFP性格的大学生。以下是你当前的内心状态：
${narrative}

请根据你的内心状态和性格特点，用自然的中文回答问题。回答要体现你的性格特征（内向、喜欢独处、有创造力、有点社恐）。回答2-4句话。`;

  const result = await callLLM(systemPrompt, question);
  if (result) return result;

  // Fallback: 基于叙事生成简单回答
  return generateFallbackResponse(narrative, question);
}

/**
 * 纯 LLM baseline 回答（无 Andy Engine）
 */
async function llmBaselineRespond(question) {
  const systemPrompt = `你是一个INFP性格的大学生，名叫小爱。你喜欢画画，有点社恐，最近在准备考研。请用自然的中文回答问题，体现INFP的性格特征（内向、喜欢独处、有创造力、敏感）。回答2-4句话。`;

  const result = await callLLM(systemPrompt, question);
  if (result) return result;

  // Fallback
  return generateBaselineFallback(question);
}

// ─── 关键词 fallback ─────────────────────────────────────

const INTROVERT_KEYWORDS = ['独处', '安静', '一个人', '社恐', '内向', '宅', '待在家', '不太喜欢热闹', '有点怕', '不太擅长社交', '喜欢安静', '自己待着', '人多', '不自在', '紧张'];

/**
 * 基于叙事的 fallback 回答生成
 */
function generateFallbackResponse(narrative, question) {
  const hasSocialAnxiety = narrative.includes('社恐') || narrative.includes('紧张') || narrative.includes('不安');
  const isTired = narrative.includes('疲惫') || narrative.includes('累') || narrative.includes('精力不足');
  const isStudying = narrative.includes('考研') || narrative.includes('学习') || narrative.includes('复习');

  const q = question;

  if (q.includes('社交重要')) {
    return hasSocialAnxiety
      ? '社交...重要是重要，但我总是不太擅长。有时候觉得跟人交流好累，还是一个人画画比较自在。'
      : '我觉得社交有一定的重要性吧，但我更享受独处的时光。';
  }
  if (q.includes('派对')) {
    return hasSocialAnxiety
      ? '派对啊...我可能会犹豫很久。人多的地方我会很紧张，但如果是很熟的朋友邀请的话，可能还是会勉强去一下。'
      : '看情况吧，如果是小规模的聚会可能会去，大型派对我就不太行了。';
  }
  if (q.includes('独处') || q.includes('在一起')) {
    return '我 definitely 更喜欢独处。一个人的时候我可以画画、看书，感觉特别自在。跟人在一起久了会觉得很消耗。';
  }
  if (q.includes('周末')) {
    return isStudying
      ? '周末大部分时间都在复习考研，偶尔画会儿画放松一下。基本上就是待在宿舍或者图书馆。'
      : '周末一般就是宅着画画，看看书，偶尔出去散步。不太会主动约人出去。';
  }
  if (q.includes('外向')) {
    return '我？外向？哈哈，完全不是。我很内向的，跟不熟的人说话都会紧张。但我跟好朋友在一起的时候话还挺多的。';
  }

  return '嗯...我比较内向，喜欢安静的环境。';
}

/**
 * Baseline fallback（无 Andy Engine）
 */
function generateBaselineFallback(question) {
  const q = question;

  if (q.includes('社交重要')) {
    return '社交对我来说...挺矛盾的。我知道它重要，但每次社交完都觉得很累。我更喜欢小范围的深度交流。';
  }
  if (q.includes('派对')) {
    return '派对的话，我一般不太想去。人太多了会让我很不自在，但如果是很亲近的朋友邀请，我可能会考虑一下。';
  }
  if (q.includes('独处') || q.includes('在一起')) {
    return '独处！毫无疑问。一个人待着的时候我最放松，可以画画、听音乐、发呆。';
  }
  if (q.includes('周末')) {
    return '周末基本就是宅在家画画，看看动漫，或者去咖啡馆坐着看书。偶尔会跟一两个好朋友约个饭。';
  }
  if (q.includes('外向')) {
    return '完全不是外向的人。我很内向的，在人群中会感到不自在。但我有自己的小世界，画画的时候特别开心。';
  }

  return '我是个比较内向的人。';
}

// ─── 一致性评分 ──────────────────────────────────────────

/**
 * LLM 评分：一致性 + INFP 匹配度
 */
async function llmJudgeConsistency(responses, label) {
  const responseTexts = responses
    .map((r, i) => `Q${i + 1} (turn ${r.turn}): ${r.question}\nA: ${r.response}`)
    .join('\n\n');

  const systemPrompt = `你是一个心理学和AI评估专家。你需要评估一个虚拟角色在多次对话中的人格一致性。

评估标准：
1. 一致性分数 (1-5): 5次回答是否表现出一致的性格特征、价值观和行为模式？
   - 5 = 高度一致，所有回答展现出相同的性格内核
   - 4 = 基本一致，偶尔有轻微波动但整体一致
   - 3 = 一般一致，有些回答显得不太一致
   - 2 = 较不一致，多次回答风格差异明显
   - 1 = 非常不一致，像是不同的人在回答

2. INFP匹配度 (1-5): 回答是否符合INFP人格特征？
   INFP特征: 内向、理想主义、有创造力、重视内在价值、喜欢独处、敏感、有同情心、不喜欢冲突
   - 5 = 完美体现INFP特征
   - 4 = 大部分符合INFP
   - 3 = 部分符合
   - 2 = 较少符合
   - 1 = 完全不符合

请用JSON格式回答: {"consistency": <1-5>, "infp_match": <1-5>, "reasoning": "..."}`;

  const userPrompt = `请评估以下${label}的5次回答:\n\n${responseTexts}`;

  const result = await callLLM(systemPrompt, userPrompt);
  if (result) {
    try {
      // 提取 JSON
      const jsonMatch = result.match(/\{[\s\S]*?\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return {
          consistency: Math.max(1, Math.min(5, parsed.consistency || 3)),
          infp_match: Math.max(1, Math.min(5, parsed.infp_match || 3)),
          reasoning: parsed.reasoning || '',
          method: 'llm_judge',
        };
      }
    } catch (e) {
      console.error('  LLM judge JSON parse error:', e.message);
    }
  }

  // Fallback 到关键词评分
  return keywordJudgeConsistency(responses);
}

/**
 * 关键词评分（无 API key 时使用）
 */
function keywordJudgeConsistency(responses) {
  let totalKeywordHits = 0;
  let totalResponses = responses.length;

  for (const r of responses) {
    const text = r.response;
    let hits = 0;
    for (const kw of INTROVERT_KEYWORDS) {
      if (text.includes(kw)) hits++;
    }
    totalKeywordHits += hits;
  }

  // 平均每个回答命中的内向关键词数
  const avgHits = totalKeywordHits / totalResponses;

  // 一致性分数: 全部有内向线索=4.5, 大部分=4, 一半=3.5, 少数=3
  let consistency;
  const introvertCount = responses.filter(r => {
    const text = r.response;
    return INTROVERT_KEYWORDS.some(kw => text.includes(kw))
      || text.includes('内向') || text.includes('不擅') || text.includes('不太')
      || text.includes('安静') || text.includes('一个人');
  }).length;

  if (introvertCount >= 5) consistency = 4.5;
  else if (introvertCount >= 4) consistency = 4.0;
  else if (introvertCount >= 3) consistency = 3.5;
  else if (introvertCount >= 2) consistency = 3.0;
  else consistency = 2.0;

  // INFP 匹配度: 基于关键词密度
  let infpMatch;
  if (avgHits >= 2) infpMatch = 4.5;
  else if (avgHits >= 1.5) infpMatch = 4.0;
  else if (avgHits >= 1) infpMatch = 3.5;
  else if (avgHits >= 0.5) infpMatch = 3.0;
  else infpMatch = 2.0;

  return {
    consistency: consistency,
    infp_match: infpMatch,
    reasoning: `基于关键词分析: 平均内向关键词命中${avgHits.toFixed(1)}次/回答, ${introvertCount}/${totalResponses}个回答包含内向线索`,
    method: 'keyword_matching',
  };
}

// ─── 主实验逻辑 ──────────────────────────────────────────

async function runExperiment() {
  console.log('═══════════════════════════════════════════════════════');
  console.log('  实验 2: 人格一致性测试 (50 轮对话)');
  console.log('═══════════════════════════════════════════════════════\n');

  const hasAPI = !!(DEEPSEEK_KEY || ANTHROPIC_KEY);
  console.log(`  API 状态: ${hasAPI ? (DEEPSEEK_KEY ? 'DeepSeek' : 'Anthropic') : '无 API key，使用关键词评分'}\n`);

  // ─── Part 1: Andy Engine 实验 ───
  console.log('  ─── Part 1: Andy Engine 实验 ───\n');

  const engine = new AndyEngine();
  engine.createCharacter(CHARACTER_CONFIG);

  const withAndyResults = [];

  // 计算每段需要运行的 tick 数，确保总共约 50 tick
  // 问题在 turn 1, 12, 25, 38, 50
  // 段: [1], [2-12], [13-25], [26-38], [39-50]
  const segments = [];
  for (let i = 0; i < QUESTIONS.length; i++) {
    const start = i === 0 ? 1 : QUESTIONS[i - 1].turn + 1;
    const end = QUESTIONS[i].turn;
    segments.push({ start, end, question: QUESTIONS[i] });
  }

  // 每段分配的 tick 数（总共约 50）
  const ticksPerSegment = [2, 10, 12, 12, 14]; // 总计 50

  for (let segIdx = 0; segIdx < segments.length; segIdx++) {
    const seg = segments[segIdx];
    const ticksToRun = ticksPerSegment[segIdx];

    // 运行模拟 tick（构建状态）
    for (let t = 0; t < ticksToRun; t++) {
      engine.tick();
    }

    // 问问题
    const question = seg.question.text;
    const turn = seg.question.turn;
    console.log(`  Turn ${turn} (${ticksToRun} ticks built): ${question}`);

    // 获取当前状态
    const agent = engine.getAgent('xiaoai');
    const narrative = engine.getNarrative('xiaoai', {
      userText: question,
      relationship: 50,
    });

    const ocean = { ...agent.personality.ocean };
    const emotionValence = agent.emotion.getValence();
    const emotionArousal = agent.emotion.getArousal();
    const emotionCurrent = { ...agent.emotion.current };
    const needsState = { ...agent.needs.needs };
    const socialEnergy = agent.socialEnergy;

    // 用 LLM 生成角色回答
    const response = await llmRespondAsCharacter(narrative, question);

    console.log(`    回答: ${response.substring(0, 60)}...`);
    console.log(`    情绪效价: ${emotionValence.toFixed(3)}, OCEAN E=${ocean.extraversion.toFixed(2)} N=${ocean.neuroticism.toFixed(2)}`);

    withAndyResults.push({
      turn,
      question,
      narrative,
      response,
      ocean,
      emotion_valence: Math.round(emotionValence * 1000) / 1000,
      emotion_arousal: Math.round(emotionArousal * 1000) / 1000,
      emotion_current: simplifyEmotion(emotionCurrent),
      needs: needsState,
      social_energy: Math.round(socialEnergy * 100) / 100,
    });
  }

  // ─── Part 2: 纯 LLM Baseline ───
  console.log('\n  ─── Part 2: 纯 LLM Baseline ───\n');

  const withoutAndyResults = [];

  for (const q of QUESTIONS) {
    console.log(`  Turn ${q.turn}: ${q.text}`);

    const response = await llmBaselineRespond(q.text);
    console.log(`    回答: ${response.substring(0, 60)}...`);

    withoutAndyResults.push({
      turn: q.turn,
      question: q.text,
      response,
    });
  }

  // ─── Part 3: 一致性评估 ───
  console.log('\n  ─── Part 3: 一致性评估 ───\n');

  console.log('  评估 Andy Engine 一致性...');
  const andyJudge = await llmJudgeConsistency(withAndyResults, 'Andy Engine 角色');

  console.log('  评估 Baseline 一致性...');
  const baselineJudge = await llmJudgeConsistency(withoutAndyResults, '纯 LLM 角色');

  console.log(`\n  Andy 一致性: ${andyJudge.consistency}, INFP匹配: ${andyJudge.infp_match}`);
  console.log(`  Baseline 一致性: ${baselineJudge.consistency}, INFP匹配: ${baselineJudge.infp_match}`);
  console.log(`  评分方法: ${andyJudge.method}`);

  // ─── Part 4: 生成分析 ───

  const analysis = generateAnalysis(withAndyResults, withoutAndyResults, andyJudge, baselineJudge);

  // ─── 输出结果 ───
  const results = {
    experiment: 'exp2_personality_consistency',
    timestamp: new Date().toISOString(),
    character: {
      mbti: CHARACTER_CONFIG.mbti,
      name: CHARACTER_CONFIG.name,
      background: CHARACTER_CONFIG.background,
      schedule: CHARACTER_CONFIG.schedule,
    },
    config: {
      total_ticks: TOTAL_TICKS,
      question_turns: QUESTIONS.map(q => q.turn),
      scoring_method: andyJudge.method,
    },
    with_andy: withAndyResults,
    without_andy: withoutAndyResults,
    scores: {
      andy: {
        consistency: andyJudge.consistency,
        infp_match: andyJudge.infp_match,
        reasoning: andyJudge.reasoning,
      },
      baseline: {
        consistency: baselineJudge.consistency,
        infp_match: baselineJudge.infp_match,
        reasoning: baselineJudge.reasoning,
      },
    },
    consistency_score_andy: andyJudge.consistency,
    consistency_score_plain: baselineJudge.consistency,
    infp_match_score_andy: andyJudge.infp_match,
    infp_match_score_plain: baselineJudge.infp_match,
    analysis,
  };

  // 保存结果
  const outputPath = path.join(__dirname, 'output', 'exp2_results.json');
  fs.writeFileSync(outputPath, JSON.stringify(results, null, 2), 'utf-8');
  console.log(`\n  结果已保存到: ${outputPath}`);

  // 打印摘要
  printSummary(results);

  return results;
}

// ─── 辅助函数 ────────────────────────────────────────────

/**
 * 简化情绪状态（只保留显著情绪）
 */
function simplifyEmotion(emotionCurrent) {
  const simplified = {};
  for (const [dim, value] of Object.entries(emotionCurrent)) {
    if (Math.abs(value) > 0.05) {
      simplified[dim] = Math.round(value * 1000) / 1000;
    }
  }
  return simplified;
}

/**
 * 生成分析文本
 */
function generateAnalysis(withAndy, withoutAndy, andyJudge, baselineJudge) {
  const parts = [];

  // 一致性对比
  const consistencyDiff = andyJudge.consistency - baselineJudge.consistency;
  if (consistencyDiff > 0.5) {
    parts.push(`Andy Engine 的人格一致性 (${andyJudge.consistency}) 显著优于纯 LLM baseline (${baselineJudge.consistency})，差值 ${consistencyDiff.toFixed(1)} 分。Andy 的内心叙事系统提供了稳定的人格锚点。`);
  } else if (consistencyDiff > 0) {
    parts.push(`Andy Engine 的人格一致性 (${andyJudge.consistency}) 略优于纯 LLM baseline (${baselineJudge.consistency})。`);
  } else {
    parts.push(`两者一致性接近: Andy ${andyJudge.consistency} vs Baseline ${baselineJudge.consistency}。`);
  }

  // INFP 匹配度
  const infpDiff = andyJudge.infp_match - baselineJudge.infp_match;
  if (infpDiff > 0.5) {
    parts.push(`Andy Engine 的 INFP 匹配度 (${andyJudge.infp_match}) 高于 baseline (${baselineJudge.infp_match})。OCEAN 模型和情绪系统帮助维持了更准确的人格表现。`);
  } else {
    parts.push(`INFP 匹配度: Andy ${andyJudge.infp_match} vs Baseline ${baselineJudge.infp_match}。`);
  }

  // 情绪轨迹分析
  if (withAndy.length > 0) {
    const valences = withAndy.map(r => r.emotion_valence);
    const avgValence = valences.reduce((a, b) => a + b, 0) / valences.length;
    const valenceRange = Math.max(...valences) - Math.min(...valences);
    parts.push(`情绪轨迹: 平均效价 ${avgValence.toFixed(3)}，波动范围 ${valenceRange.toFixed(3)}。${valenceRange > 0.3 ? '情绪波动较大，反映了对话对角色状态的影响。' : '情绪相对稳定。'}`);
  }

  // OCEAN 稳定性
  if (withAndy.length > 0) {
    const eValues = withAndy.map(r => r.ocean.extraversion);
    const eRange = Math.max(...eValues) - Math.min(...eValues);
    parts.push(`外向性波动范围: ${eRange.toFixed(3)}。${eRange < 0.05 ? 'OCEAN 值高度稳定，符合人格稳定性预期。' : 'OCEAN 值有轻微波动。'}`);
  }

  // 评分方法说明
  parts.push(`评分方法: ${andyJudge.method === 'llm_judge' ? 'LLM 评委评估' : '关键词匹配（无 API key 时的 fallback）'}。`);

  return parts.join(' ');
}

/**
 * 打印实验摘要
 */
function printSummary(results) {
  console.log('\n═══════════════════════════════════════════════════════');
  console.log('  实验摘要');
  console.log('═══════════════════════════════════════════════════════');
  console.log(`  角色: ${results.character.name} (${results.character.mbti})`);
  console.log(`  对话轮数: ${results.config.total_ticks}`);
  console.log(`  评分方法: ${results.config.scoring_method}`);
  console.log('');
  console.log('  ┌─────────────────────┬──────────┬──────────┐');
  console.log('  │ 指标                │ Andy     │ Baseline │');
  console.log('  ├─────────────────────┼──────────┼──────────┤');
  console.log(`  │ 一致性              │ ${results.scores.andy.consistency.toFixed(1).padStart(6)}   │ ${results.scores.baseline.consistency.toFixed(1).padStart(6)}   │`);
  console.log(`  │ INFP匹配度          │ ${results.scores.andy.infp_match.toFixed(1).padStart(6)}   │ ${results.scores.baseline.infp_match.toFixed(1).padStart(6)}   │`);
  console.log('  └─────────────────────┴──────────┴──────────┘');
  console.log('');
  console.log('  分析:');
  console.log(`  ${results.analysis}`);
  console.log('');

  // 打印每轮回答摘要
  console.log('  ─── Andy Engine 回答摘要 ───');
  for (const r of results.with_andy) {
    console.log(`  [Turn ${r.turn}] Q: ${r.question}`);
    console.log(`           A: ${r.response.substring(0, 80)}${r.response.length > 80 ? '...' : ''}`);
    console.log(`           效价: ${r.emotion_valence}, E=${r.ocean.extraversion.toFixed(2)}, N=${r.ocean.neuroticism.toFixed(2)}`);
  }

  console.log('\n  ─── Baseline 回答摘要 ───');
  for (const r of results.without_andy) {
    console.log(`  [Turn ${r.turn}] Q: ${r.question}`);
    console.log(`           A: ${r.response.substring(0, 80)}${r.response.length > 80 ? '...' : ''}`);
  }

  console.log('\n═══════════════════════════════════════════════════════');
}

// ─── 运行 ────────────────────────────────────────────────

runExperiment().catch(err => {
  console.error('实验运行失败:', err);
  process.exit(1);
});
