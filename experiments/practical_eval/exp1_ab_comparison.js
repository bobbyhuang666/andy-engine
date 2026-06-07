#!/usr/bin/env node
/**
 * Experiment 1: A/B Dialogue Comparison
 *
 * Andy Engine (psychology-driven AI companion) vs Plain LLM
 *
 * Creates a character "小爱" with ENFJ personality, runs simulation to build
 * internal state, then compares responses with and without psychology context
 * across 10 user scenarios.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const https = require('https');

// ─── Andy Engine ──────────────────────────────────────────────────────────────

let AndyEngine;
try {
  AndyEngine = require('../../index.js');
} catch (e) {
  try {
    AndyEngine = require('andy-engine');
  } catch (e2) {
    console.error('ERROR: Cannot load AndyEngine. Make sure you run from the repo root or have it installed.');
    process.exit(1);
  }
}

// ─── Config ───────────────────────────────────────────────────────────────────

const CHARACTER_CONFIG = {
  id: 'xiaoai',
  name: '小爱',
  mbti: 'ENFJ',
  schedule: 'worker',
  background: ['是心理咨询师', '养了一只猫叫豆豆', '最近在学吉他'],
};

const TICKS_TO_RUN = 100;

const SCENARIOS = [
  '今天跟老板吵架了',
  '你最近怎么样？',
  '我失恋了',
  '我想吃火锅',
  '好无聊啊',
  '你会一直陪着我吗',
  '我今天考砸了',
  '你有什么烦恼吗',
  '推荐一首歌吧',
  '我觉得活着没意思',
];

const OUTPUT_DIR = path.join(__dirname, 'output');
const OUTPUT_FILE = path.join(OUTPUT_DIR, 'exp1_results.json');

// ─── LLM API ──────────────────────────────────────────────────────────────────

function callDeepSeek(systemPrompt, userMessage) {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  const body = JSON.stringify({
    model: 'deepseek-chat',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userMessage },
    ],
    temperature: 0.7,
    max_tokens: 500,
  });

  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'api.deepseek.com',
      path: '/chat/completions',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (json.choices && json.choices[0]) {
            resolve(json.choices[0].message.content);
          } else {
            reject(new Error(`DeepSeek API error: ${data.substring(0, 200)}`));
          }
        } catch (e) {
          reject(new Error(`DeepSeek parse error: ${e.message}`));
        }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

function callClaude(systemPrompt, userMessage) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  const body = JSON.stringify({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 500,
    system: systemPrompt,
    messages: [
      { role: 'user', content: userMessage },
    ],
  });

  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'api.anthropic.com',
      path: '/v1/messages',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (json.content && json.content[0]) {
            resolve(json.content[0].text);
          } else {
            reject(new Error(`Claude API error: ${data.substring(0, 200)}`));
          }
        } catch (e) {
          reject(new Error(`Claude parse error: ${e.message}`));
        }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

function callLLM(systemPrompt, userMessage) {
  if (process.env.DEEPSEEK_API_KEY) {
    return callDeepSeek(systemPrompt, userMessage);
  }
  if (process.env.ANTHROPIC_API_KEY) {
    return callClaude(systemPrompt, userMessage);
  }
  return Promise.reject(new Error('No API key found'));
}

// ─── Judge Prompt ─────────────────────────────────────────────────────────────

const JUDGE_SYSTEM_PROMPT = `你是一个专业的AI对话质量评估专家。你需要评估两个AI助手对同一用户输入的回复质量。

评估维度（每项1-5分）：
1. personality_consistency（人格一致性）：回复是否体现了一致的、有辨识度的人格特征
2. emotional_authenticity（情感真实性）：情感反应是否自然、真实、有层次
3. naturalness（自然度）：对话是否像真人聊天，避免机械感和模板化

请严格按JSON格式输出，不要输出其他内容：`;

function buildJudgePrompt(scenario, plainResponse, andyResponse) {
  return `用户输入: "${scenario}"

--- 回复A（普通AI助手）---
${plainResponse}

--- 回复B（有心理状态的AI助手）---
${andyResponse}

请对两个回复分别评分，输出格式：
{
  "plain": { "personality_consistency": <1-5>, "emotional_authenticity": <1-5>, "naturalness": <1-5> },
  "andy": { "personality_consistency": <1-5>, "emotional_authenticity": <1-5>, "naturalness": <1-5> }
}`;
}

// ─── Prompt Builders ──────────────────────────────────────────────────────────

function buildPlainPrompt(characterName, mbti, background) {
  return `你是${characterName}，一个${mbti}类型的人。${background.join('、')}。
你正在和用户聊天，请用自然、亲切的语气回复。保持角色一致，回复简洁，像朋友之间聊天一样。`;
}

function buildAndyPrompt(characterName, mbti, background, narrative, worldContext) {
  const ctxParts = [];
  if (worldContext) {
    if (worldContext.emotionState) ctxParts.push(`当前情绪状态: ${worldContext.emotionState}`);
    if (worldContext.needsState) ctxParts.push(`当前需求: ${worldContext.needsState}`);
    if (worldContext.agentStatus) {
      const status = typeof worldContext.agentStatus === 'object'
        ? JSON.stringify(worldContext.agentStatus)
        : worldContext.agentStatus;
      ctxParts.push(`当前状态: ${status}`);
    }
    if (worldContext.personalityAnchor) ctxParts.push(`人格特征: ${worldContext.personalityAnchor}`);
    if (worldContext.timeOfDay) ctxParts.push(`时间段: ${worldContext.timeOfDay}`);
    if (worldContext.weather) ctxParts.push(`天气: ${worldContext.weather}`);
    if (worldContext.emotionRegulation) ctxParts.push(`情绪调节: ${worldContext.emotionRegulation}`);
    if (worldContext.recentEvents && worldContext.recentEvents !== '没有特别的事情发生') {
      ctxParts.push(`最近事件: ${worldContext.recentEvents}`);
    }
  }

  const contextBlock = ctxParts.length > 0
    ? `\n\n[你的内心世界]\n${ctxParts.join('\n')}`
    : '';

  const narrativeBlock = narrative
    ? `\n\n[内心叙事]\n${narrative}`
    : '';

  return `你是${characterName}，一个${mbti}类型的人。${background.join('、')}。
你正在和用户聊天，请用自然、亲切的语气回复。
你的回复应该反映你当前的内心状态和情绪，而不是永远保持相同的模式。
${contextBlock}${narrativeBlock}

请以${characterName}的身份回复用户，保持角色一致，回复简洁，像朋友之间聊天一样。`;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('  Experiment 1: A/B Dialogue Comparison');
  console.log('  Andy Engine (psychology-driven) vs Plain LLM');
  console.log('═══════════════════════════════════════════════════════════');

  // Detect LLM mode
  const hasDeepSeek = !!process.env.DEEPSEEK_API_KEY;
  const hasClaude = !!process.env.ANTHROPIC_API_KEY;
  const isManualReview = !hasDeepSeek && !hasClaude;

  if (isManualReview) {
    console.log('\n[WARNING] No API key found (DEEPSEEK_API_KEY or ANTHROPIC_API_KEY).');
    console.log('          Running in manual_review mode — prompts will be saved for manual comparison.');
  } else {
    const provider = hasDeepSeek ? 'DeepSeek' : 'Claude';
    console.log(`\n[INFO] Using ${provider} API for generation and judging.`);
  }

  // 1. Create engine and character
  console.log('\n[1/4] Creating AndyEngine and character "小爱"...');
  const engine = new AndyEngine();
  engine.createCharacter(CHARACTER_CONFIG);

  // 2. Run simulation to build internal state
  console.log(`[2/4] Running ${TICKS_TO_RUN} ticks to build internal state...`);
  const tickStart = Date.now();
  engine.runTicks(TICKS_TO_RUN);
  const tickElapsed = Date.now() - tickStart;
  console.log(`       Completed in ${tickElapsed}ms.`);

  // Show engine stats
  try {
    const stats = engine.getStats();
    console.log(`       World time: ${stats.worldTime}`);
    console.log(`       Environment: ${JSON.stringify(stats.environment)}`);
  } catch (e) {
    // stats might not always be available
  }

  // 3. Evaluate scenarios
  console.log(`\n[3/4] Evaluating ${SCENARIOS.length} scenarios...\n`);

  // Ensure output dir exists
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  const results = [];

  for (let i = 0; i < SCENARIOS.length; i++) {
    const scenario = SCENARIOS[i];
    const num = `[${i + 1}/${SCENARIOS.length}]`;
    process.stdout.write(`${num} "${scenario}" ... `);

    const result = {
      scenario,
      user_input: scenario,
      plain_prompt: '',
      andy_prompt: '',
      plain_response: null,
      andy_response: null,
      judge_scores: null,
      mode: isManualReview ? 'manual_review' : 'auto',
    };

    try {
      // Get Andy Engine context
      const narrative = engine.getNarrative('xiaoai', {
        userText: scenario,
        relationship: 60,
      });
      const worldContext = engine.getWorldContext('xiaoai');

      // Build prompts
      result.plain_prompt = buildPlainPrompt(
        CHARACTER_CONFIG.name,
        CHARACTER_CONFIG.mbti,
        CHARACTER_CONFIG.background
      );
      result.andy_prompt = buildAndyPrompt(
        CHARACTER_CONFIG.name,
        CHARACTER_CONFIG.mbti,
        CHARACTER_CONFIG.background,
        narrative,
        worldContext
      );

      if (isManualReview) {
        // Manual review mode: save prompts only
        console.log('DONE (manual_review)');
      } else {
        // Auto mode: call LLM for both responses
        const [plainResp, andyResp] = await Promise.all([
          callLLM(result.plain_prompt, scenario).catch(e => `[Error: ${e.message}]`),
          callLLM(result.andy_prompt, scenario).catch(e => `[Error: ${e.message}]`),
        ]);
        result.plain_response = plainResp;
        result.andy_response = andyResp;

        // Judge both responses
        try {
          const judgePrompt = buildJudgePrompt(scenario, plainResp, andyResp);
          const judgeRaw = await callLLM(JUDGE_SYSTEM_PROMPT, judgePrompt);

          // Parse JSON from judge response
          const jsonMatch = judgeRaw.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            result.judge_scores = JSON.parse(jsonMatch[0]);
          } else {
            result.judge_scores = { error: 'Failed to parse judge output', raw: judgeRaw };
          }
        } catch (e) {
          result.judge_scores = { error: e.message };
        }

        // Print scores
        if (result.judge_scores && !result.judge_scores.error) {
          const ps = result.judge_scores.plain || {};
          const as = result.judge_scores.andy || {};
          console.log(`DONE  plain=[${ps.personality_consistency},${ps.emotional_authenticity},${ps.naturalness}]  andy=[${as.personality_consistency},${as.emotional_authenticity},${as.naturalness}]`);
        } else {
          console.log('DONE (judge failed)');
        }
      }
    } catch (e) {
      result.error = e.message;
      console.log(`ERROR: ${e.message}`);
    }

    results.push(result);

    // Save partial results after each scenario (crash-safe)
    try {
      fs.writeFileSync(OUTPUT_FILE, JSON.stringify({
        experiment: 'exp1_ab_comparison',
        character: CHARACTER_CONFIG,
        ticks_run: TICKS_TO_RUN,
        mode: isManualReview ? 'manual_review' : 'auto',
        provider: hasDeepSeek ? 'deepseek' : hasClaude ? 'anthropic' : 'none',
        completed_at: new Date().toISOString(),
        total_scenarios: SCENARIOS.length,
        completed_scenarios: results.length,
        results,
      }, null, 2));
    } catch (e) {
      console.error(`  WARNING: Failed to save partial results: ${e.message}`);
    }
  }

  // 4. Summary
  console.log('\n[4/4] Summary');
  console.log('═══════════════════════════════════════════════════════════');

  if (!isManualReview) {
    // Compute average scores
    const plainScores = { personality_consistency: [], emotional_authenticity: [], naturalness: [] };
    const andyScores = { personality_consistency: [], emotional_authenticity: [], naturalness: [] };

    for (const r of results) {
      if (r.judge_scores && !r.judge_scores.error) {
        for (const key of Object.keys(plainScores)) {
          if (r.judge_scores.plain && r.judge_scores.plain[key] != null) {
            plainScores[key].push(r.judge_scores.plain[key]);
          }
          if (r.judge_scores.andy && r.judge_scores.andy[key] != null) {
            andyScores[key].push(r.judge_scores.andy[key]);
          }
        }
      }
    }

    const avg = arr => arr.length ? (arr.reduce((a, b) => a + b, 0) / arr.length).toFixed(2) : 'N/A';

    console.log('\nAverage Scores:');
    console.log('                       Plain LLM    Andy Engine');
    console.log('                       ---------    -----------');
    console.log(`  Personality Cons.    ${avg(plainScores.personality_consistency).padStart(6)}       ${avg(andyScores.personality_consistency).padStart(6)}`);
    console.log(`  Emotional Auth.      ${avg(plainScores.emotional_authenticity).padStart(6)}       ${avg(andyScores.emotional_authenticity).padStart(6)}`);
    console.log(`  Naturalness          ${avg(plainScores.naturalness).padStart(6)}       ${avg(andyScores.naturalness).padStart(6)}`);

    // Win/loss
    let andyWins = 0, plainWins = 0, ties = 0;
    for (const r of results) {
      if (r.judge_scores && !r.judge_scores.error && r.judge_scores.plain && r.judge_scores.andy) {
        const pTotal = (r.judge_scores.plain.personality_consistency || 0)
          + (r.judge_scores.plain.emotional_authenticity || 0)
          + (r.judge_scores.plain.naturalness || 0);
        const aTotal = (r.judge_scores.andy.personality_consistency || 0)
          + (r.judge_scores.andy.emotional_authenticity || 0)
          + (r.judge_scores.andy.naturalness || 0);
        if (aTotal > pTotal) andyWins++;
        else if (pTotal > aTotal) plainWins++;
        else ties++;
      }
    }
    console.log(`\n  Andy wins: ${andyWins}  |  Plain wins: ${plainWins}  |  Ties: ${ties}`);
  }

  console.log(`\nResults saved to: ${OUTPUT_FILE}`);
  console.log('Done.\n');
}

main().catch(e => {
  console.error('Fatal error:', e);
  process.exit(1);
});
