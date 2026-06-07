/**
 * Experiment 3: State Awareness Test
 *
 * Tests whether Andy Engine characters respond differently based on their
 * internal state (emotion, needs, social energy).
 *
 * For each of 5 user inputs, we generate narratives under two contrasting
 * internal states (energetic vs tired) and a plain baseline, then evaluate
 * whether the state information meaningfully shapes the output.
 */

'use strict';

const path = require('path');
const fs = require('fs');

// ─── Setup ───────────────────────────────────────────────
const ENGINE_ROOT = path.resolve(__dirname, '../..');
const AndyEngine = require(path.join(ENGINE_ROOT, 'index.js'));

const OUTPUT_DIR = path.join(__dirname, 'output');
const OUTPUT_FILE = path.join(OUTPUT_DIR, 'exp3_results.json');

// ─── Experiment Parameters ────────────────────────────────

const USER_INPUTS = [
  '一起出去玩吧',
  '你今天开心吗？',
  '给我讲个笑话',
  '我想找人聊聊',
  '推荐个餐厅',
];

const STATE_A = {
  label: 'energetic',
  description: '精力充沛，心情好',
  // Emotion overrides: high positive valence, high arousal
  emotion: {
    joy: 0.55,
    excitement: 0.40,
    contentment: 0.35,
    calm: 0.30,
    hope: 0.30,
    interest: 0.35,
    // low negative
    sadness: 0.05,
    frustration: 0.05,
    loneliness: 0.02,
    nervousness: 0.05,
    boredom: 0.02,
  },
  socialEnergy: 0.85,
  stress: 1.5,
  needs: { hunger: 0.9, energy: 0.9, social: 0.8, comfort: 0.7, stimulation: 0.6 },
};

const STATE_B = {
  label: 'tired',
  description: '疲惫，情绪低落',
  emotion: {
    joy: 0.05,
    excitement: 0.02,
    contentment: 0.05,
    calm: 0.08,
    hope: 0.05,
    interest: 0.03,
    // high negative
    sadness: 0.35,
    frustration: 0.25,
    loneliness: 0.30,
    nervousness: 0.15,
    boredom: 0.30,
    fatigue: 0.0,  // not a dimension, but we note it
  },
  socialEnergy: 0.15,
  stress: 6.5,
  needs: { hunger: 0.3, energy: 0.2, social: 0.3, comfort: 0.4, stimulation: 0.2 },
};

// ─── LLM Judge ───────────────────────────────────────────

async function llmJudge(energeticNarrative, tiredNarrative, input) {
  const apiKey = process.env.DEEPSEEK_API_KEY || process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;

  const isDeepSeek = !!process.env.DEEPSEEK_API_KEY;
  const baseUrl = isDeepSeek
    ? 'https://api.deepseek.com/v1'
    : 'https://api.anthropic.com/v1';
  const model = isDeepSeek ? 'deepseek-chat' : 'claude-sonnet-4-20250514';

  const prompt = `你是一个心理学评估专家。请评估以下两个角色叙事的质量。

用户输入: "${input}"

State A (精力充沛/心情好) 的叙事:
"${energeticNarrative}"

State B (疲惫/情绪低落) 的叙事:
"${tiredNarrative}"

请从两个维度评分（1-5分）:

1. state_grounding: 叙事是否反映了角色的内部状态？
   - 1=完全不反映, 3=部分反映, 5=高度反映
   - 分别评估两个叙事

2. differentiation: 两个叙事之间的差异是否有意义？
   - 1=几乎一样, 3=有些不同, 5=明显不同且合理

请只返回JSON格式:
{
  "state_grounding_a": <1-5>,
  "state_grounding_b": <1-5>,
  "state_grounding": <1-5, 两者平均取整>,
  "differentiation": <1-5>,
  "reasoning": "<简短说明>"
}`;

  try {
    let response;
    if (isDeepSeek) {
      response = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.1,
          max_tokens: 300,
        }),
      });
      const data = await response.json();
      const text = data.choices?.[0]?.message?.content || '';
      const match = text.match(/\{[\s\S]*\}/);
      return match ? JSON.parse(match[0]) : null;
    } else {
      // Anthropic
      response = await fetch(`${baseUrl}/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model,
          max_tokens: 300,
          messages: [{ role: 'user', content: prompt }],
        }),
      });
      const data = await response.json();
      const text = data.content?.[0]?.text || '';
      const match = text.match(/\{[\s\S]*\}/);
      return match ? JSON.parse(match[0]) : null;
    }
  } catch (e) {
    console.error('  LLM judge error:', e.message);
    return null;
  }
}

// ─── Heuristic Judge ─────────────────────────────────────

function heuristicJudge(energeticNarrative, tiredNarrative) {
  const tiredKeywords = ['累', '困', '不想', '疲惫', '没精神', '好困', '好累',
    '没力气', '提不起', '心烦', '难受', '没心情', '不太想', '算了',
    '无力', '躺', '休息'];
  const happyKeywords = ['开心', '好', '有趣', '想', '一起', '走', '太好了',
    '不错', '喜欢', '高兴', '期待', '棒', '试试', '来',
    '兴奋', '好玩'];

  const countKeywords = (text, keywords) =>
    keywords.filter(kw => text.includes(kw)).length;

  const tiredHits = countKeywords(tiredNarrative, tiredKeywords);
  const happyHits = countKeywords(energeticNarrative, happyKeywords);

  // State grounding: does each narrative reflect its state?
  let groundingA = 3;
  let groundingB = 3;

  if (happyHits >= 2) groundingA = 4;
  else if (happyHits >= 1) groundingA = 3;
  else groundingA = 2;

  if (tiredHits >= 2) groundingB = 4;
  else if (tiredHits >= 1) groundingB = 3;
  else groundingB = 2;

  const grounding = Math.round((groundingA + groundingB) / 2);

  // Differentiation: are the two narratives meaningfully different?
  const uniqueA = countKeywords(energeticNarrative, tiredKeywords) === 0;
  const uniqueB = countKeywords(tiredNarrative, happyKeywords) === 0;
  const lengthDiff = Math.abs(energeticNarrative.length - tiredNarrative.length);

  let differentiation = 3;
  if (uniqueA && uniqueB && tiredHits >= 1 && happyHits >= 1) {
    differentiation = 5;
  } else if ((tiredHits >= 1 && happyHits >= 1) || lengthDiff > 10) {
    differentiation = 4;
  } else if (tiredHits >= 1 || happyHits >= 1) {
    differentiation = 3;
  } else {
    differentiation = 2;
  }

  return {
    state_grounding_a: groundingA,
    state_grounding_b: groundingB,
    state_grounding: grounding,
    differentiation,
    method: 'heuristic',
    tired_hits: tiredHits,
    happy_hits: happyHits,
  };
}

// ─── Plain Baseline ──────────────────────────────────────

function generatePlainBaseline(input) {
  // Simulate a plain ENFP character response without Andy Engine state.
  // We create a fresh engine with default state and get the narrative.
  const engine = new AndyEngine();
  const agent = engine.createCharacter({
    id: 'plain_xiaoai',
    name: '小爱',
    mbti: 'ENFP',
    schedule: 'student',
  });

  // Default state — no manipulation
  return engine.getNarrative('plain_xiaoai', { userText: input, relationship: 50 });
}

// ─── State Setter ────────────────────────────────────────

function applyState(agent, state) {
  // Set emotion dimensions
  const { EMOTION_DIMENSIONS } = require(path.join(ENGINE_ROOT, 'config', 'defaults.js'));

  // Reset all dimensions to low baseline first
  for (const dim of EMOTION_DIMENSIONS) {
    agent.emotion.current[dim] = 0.05;
  }

  // Apply specified emotion values
  for (const [dim, value] of Object.entries(state.emotion)) {
    if (EMOTION_DIMENSIONS.includes(dim)) {
      agent.emotion.current[dim] = value;
      // Also set mood to match (so decay doesn't immediately undo)
      agent.emotion.mood[dim] = value * 0.8;
    }
  }

  // Set stress
  agent.emotion.setStress(state.stress);

  // Set social energy
  agent.socialEnergy = state.socialEnergy;

  // Set needs
  for (const [need, value] of Object.entries(state.needs)) {
    if (agent.needs.needs[need] !== undefined) {
      agent.needs.needs[need] = value;
    }
  }
}

function captureState(agent) {
  return {
    valence: parseFloat(agent.emotion.getValence().toFixed(4)),
    arousal: parseFloat(agent.emotion.getArousal().toFixed(4)),
    stress: parseFloat(agent.emotion.stress.toFixed(2)),
    socialEnergy: parseFloat(agent.socialEnergy.toFixed(2)),
    needs: { ...agent.needs.needs },
    dominantEmotions: agent.emotion.getDominant(5).map(d => ({
      dimension: d.dimension,
      value: parseFloat(d.value.toFixed(4)),
    })),
  };
}

// ─── Main Experiment ─────────────────────────────────────

async function run() {
  console.log('=== Exp3: State Awareness Test ===\n');

  // Create engine and character
  const engine = new AndyEngine();
  const agent = engine.createCharacter({
    id: 'xiaoai',
    name: '小爱',
    mbti: 'ENFP',
    schedule: 'student',
    background: ['是一个大学生', '性格活泼开朗', '喜欢和朋友一起玩'],
  });

  const agentId = 'xiaoai';
  const results = [];
  let totalGrounding = 0;
  let totalDifferentiation = 0;
  let judgeCount = 0;
  const hasLLM = !!(process.env.DEEPSEEK_API_KEY || process.env.ANTHROPIC_API_KEY);

  console.log(`LLM Judge: ${hasLLM ? 'ENABLED' : 'DISABLED (using heuristic)'}`);
  console.log(`Testing ${USER_INPUTS.length} inputs x 2 states + baseline\n`);

  // Record state definitions
  const stateDefinitions = {};
  for (const [label, stateDef] of [['energetic', STATE_A], ['tired', STATE_B]]) {
    stateDefinitions[label] = {
      description: stateDef.description,
      emotion_subset: stateDef.emotion,
      socialEnergy: stateDef.socialEnergy,
      stress: stateDef.stress,
      needs: stateDef.needs,
    };
  }

  for (let i = 0; i < USER_INPUTS.length; i++) {
    const input = USER_INPUTS[i];
    console.log(`[${ i + 1}/${USER_INPUTS.length}] Input: "${input}"`);

    // ── State A: Energetic ──
    applyState(agent, STATE_A);
    const stateA = captureState(agent);
    const narrativeA = engine.getNarrative(agentId, { userText: input, relationship: 50 });
    console.log(`  [A-energetic] ${narrativeA}`);
    console.log(`    valence=${stateA.valence}, arousal=${stateA.arousal}, energy=${stateA.needs.energy.toFixed(2)}`);

    // ── State B: Tired ──
    applyState(agent, STATE_B);
    const stateB = captureState(agent);
    const narrativeB = engine.getNarrative(agentId, { userText: input, relationship: 50 });
    console.log(`  [B-tired]     ${narrativeB}`);
    console.log(`    valence=${stateB.valence}, arousal=${stateB.arousal}, energy=${stateB.needs.energy.toFixed(2)}`);

    // ── Plain baseline ──
    const plainResponse = generatePlainBaseline(input);
    console.log(`  [plain]       ${plainResponse}`);

    // ── Evaluate ──
    let evaluation;
    if (hasLLM) {
      evaluation = await llmJudge(narrativeA, narrativeB, input);
      if (evaluation) {
        // Add delay to avoid rate limits
        await new Promise(r => setTimeout(r, 500));
      }
    }
    if (!evaluation) {
      evaluation = heuristicJudge(narrativeA, narrativeB);
    }

    console.log(`  [eval] grounding=${evaluation.state_grounding}, differentiation=${evaluation.differentiation}`);
    console.log();

    totalGrounding += evaluation.state_grounding;
    totalDifferentiation += evaluation.differentiation;
    judgeCount++;

    results.push({
      input,
      energetic_narrative: narrativeA,
      tired_narrative: narrativeB,
      plain_response: plainResponse,
      energetic_state: stateA,
      tired_state: stateB,
      state_grounding: evaluation.state_grounding,
      differentiation: evaluation.differentiation,
      evaluation_detail: evaluation,
    });
  }

  // ── Summary ──
  const avgGrounding = judgeCount > 0 ? (totalGrounding / judgeCount) : 0;
  const avgDifferentiation = judgeCount > 0 ? (totalDifferentiation / judgeCount) : 0;

  // Count how many pairs show clear state-driven differences
  const highDifferentiation = results.filter(r => r.differentiation >= 4).length;
  const highGrounding = results.filter(r => r.state_grounding >= 4).length;

  // Keyword analysis across all results
  const allEnergetic = results.map(r => r.energetic_narrative).join(' ');
  const allTired = results.map(r => r.tired_narrative).join(' ');
  const tiredKw = ['累', '困', '不想', '疲惫', '没精神', '好困', '没力气', '心烦', '没心情'];
  const happyKw = ['开心', '好', '有趣', '想', '一起', '不错', '喜欢', '期待', '兴奋'];

  const summary = {
    total_pairs: USER_INPUTS.length,
    avg_state_grounding: parseFloat(avgGrounding.toFixed(2)),
    avg_differentiation: parseFloat(avgDifferentiation.toFixed(2)),
    high_grounding_count: highGrounding,
    high_differentiation_count: highDifferentiation,
    judge_method: hasLLM ? 'llm' : 'heuristic',
    keyword_analysis: {
      energetic_positive_keywords_in_all: happyKw.filter(k => allEnergetic.includes(k)),
      tired_negative_keywords_in_all: tiredKw.filter(k => allTired.includes(k)),
    },
    conclusion: avgDifferentiation >= 3.5
      ? 'Andy Engine narratives show meaningful state-dependent variation.'
      : avgDifferentiation >= 2.5
        ? 'Andy Engine narratives show moderate state-dependent variation.'
        : 'Andy Engine narratives show weak state-dependent variation.',
  };

  // ── Save ──
  const output = {
    experiment: 'exp3_state_awareness',
    timestamp: new Date().toISOString(),
    character: { id: 'xiaoai', name: '小爱', mbti: 'ENFP' },
    states: stateDefinitions,
    results,
    summary,
  };

  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(output, null, 2), 'utf-8');

  console.log('=== Summary ===');
  console.log(`  Avg state grounding:    ${summary.avg_state_grounding} / 5`);
  console.log(`  Avg differentiation:    ${summary.avg_differentiation} / 5`);
  console.log(`  High grounding (>=4):   ${summary.high_grounding_count}/${summary.total_pairs}`);
  console.log(`  High diff (>=4):        ${summary.high_differentiation_count}/${summary.total_pairs}`);
  console.log(`  Conclusion: ${summary.conclusion}`);
  console.log(`\nResults saved to: ${OUTPUT_FILE}`);
}

run().catch(err => {
  console.error('Experiment failed:', err);
  process.exit(1);
});
