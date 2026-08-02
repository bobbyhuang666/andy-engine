/**
 * B2 回归测试 — chat() / chatStream() 不外泄 rewrite 级一致性违规内容
 *
 * 根因 (R39/R40):
 *   checkConsistency 可返回 { valid:false, severity:'rewrite' } 表示违规但可改写。
 *   chat() 原实现只拦截 severity==='reject'，rewrite 级违规内容被原样返回/yield 给用户，
 *   违反 "consistency invalid 不外泄" 目标。chatStream 在 R39 已修，chat() 在 R40 补齐。
 *
 * 本测试覆盖两条路径: rewrite 级违规在 chat() 与 chatStream() 都不得外泄。
 * 若公开 grounding 可构造并验证事实回退，则交付该回退；否则降级为沉默。
 * reject 级与 valid 级作为对照，确保不误伤正常回复。
 */

import { describe, it, expect } from 'vitest';
import AndyEngine from '../../index.js';
import Character from '../../src/sdk/Character.js';

function makeCharacterWithConsistency(consistencyResult) {
  const character = new Character({
    name: 'Maya',
    personality: 'INFP',
    llm: async () => '这是一段违规内容',
  });
  // 覆盖 checkConsistency 为受控桩，模拟 rewrite/reject/valid 三种结果
  character._engine.checkConsistency = () => consistencyResult;
  return character;
}

function makeCharacterWithVerifiedFallback() {
  const character = new Character({
    name: 'Maya',
    id: 'maya',
    personality: 'INFP',
    llm: async () => '这是一段违规内容',
  });
  let checks = 0;
  character._engine.getGroundingPackage = () => ({
    allowedFacts: [{ id: 'fact_maya_library', type: 'agent_state', agentId: 'maya', region: '图书馆' }],
  });
  character._engine.checkConsistency = () => {
    checks += 1;
    return checks === 1
      ? { valid: false, severity: 'rewrite' }
      : { valid: true, severity: 'pass' };
  };
  return character;
}

function makeCharacterWithQuestionAwareFallback() {
  const character = new Character({
    name: 'Maya',
    id: 'maya',
    personality: 'INFP',
    llm: async () => '我感觉平静。',
  });
  character._engine.getGroundingPackage = () => ({
    allowedFacts: [{
      id: 'fact_maya_state', type: 'agent_state', agentId: 'maya',
      region: '图书馆', state: '休息', emotionSummary: 'calm',
    }],
  });
  character._engine.checkConsistency = () => ({ valid: true, severity: 'pass' });
  return character;
}

function makeCharacterWithObservationFallback() {
  const character = new Character({
    name: 'Maya', id: 'maya', personality: 'INFP', llm: async () => '我不知道。',
  });
  character._engine.getGroundingPackage = () => ({
    allowedFacts: [
      { id: 'fact_maya_state', type: 'agent_state', agentId: 'maya', region: '图书馆', state: '休息' },
      { id: 'fact_observation', type: 'observation', observerId: 'maya', targetId: 'li', action: '在阅读', context: '图书馆' },
    ],
    metadata: { agentNames: { maya: 'Maya', li: '李' } },
  });
  character._engine.checkConsistency = () => ({ valid: true, severity: 'pass' });
  return character;
}

describe('B2: chat()/chatStream() 不外泄 rewrite 级违规内容', () => {
  it('chat() 对 rewrite 级违规应降级为沉默，不返回违规原文', async () => {
    const character = makeCharacterWithConsistency({ valid: false, severity: 'rewrite' });
    const reply = await character.chat('随便说点什么');
    expect(reply).toBe('[Maya沉默了一会儿]');
    expect(reply).not.toContain('违规内容');
  });

  it('chat() 对 reject 级违规仍降级为沉默', async () => {
    const character = makeCharacterWithConsistency({ valid: false, severity: 'reject' });
    const reply = await character.chat('随便说点什么');
    expect(reply).toBe('[Maya沉默了一会儿]');
  });

  it('chat() 对 invalid warning 也不得外泄', async () => {
    const character = makeCharacterWithConsistency({ valid: false, severity: 'warning' });
    const reply = await character.chat('随便说点什么');
    expect(reply).toBe('[Maya沉默了一会儿]');
    expect(reply).not.toContain('违规内容');
  });

  it('chat() 对 valid 回复原样返回，不误伤', async () => {
    const character = makeCharacterWithConsistency({ valid: true, severity: 'ok' });
    const reply = await character.chat('随便说点什么');
    expect(reply).toBe('这是一段违规内容');
  });

  it('chat() 对违规回复交付二次验证后的事实回退', async () => {
    const character = makeCharacterWithVerifiedFallback();
    const reply = await character.chat('随便说点什么');

    expect(reply).toBe('我在图书馆。');
    expect(reply).not.toContain('违规内容');
  });

  it('chat() replaces a valid but off-topic state reply with the requested fact anchor', async () => {
    const character = makeCharacterWithQuestionAwareFallback();
    const reply = await character.chat('你正在做什么？');

    expect(reply).toBe('我目前处于休息状态。');
  });

  it('chat() answers an observation question with a verified direct-observation fallback', async () => {
    const character = makeCharacterWithObservationFallback();
    const reply = await character.chat('你观察到什么？');
    expect(reply).toBe('我观察到李在阅读，当时在图书馆。');
  });

  it('chat() recognizes the common "看见了什么" observation wording', async () => {
    const character = makeCharacterWithObservationFallback();
    const reply = await character.chat('你看见了什么？');
    expect(reply).toBe('我观察到李在阅读，当时在图书馆。');
  });

  it('chat() treats a recent-event question without a pronoun as a grounded question', async () => {
    const character = makeCharacterWithObservationFallback();
    const reply = await character.chat('刚才发生了什么？');
    expect(reply).toBe('我观察到李在阅读，当时在图书馆。');
  });

  it('R8.4: recent_event fallback prefers a specific event over a generic template', async () => {
    // Two EVENT facts: a generic stranger-encounter template (excluded by
    // domain.socialInteractions.strangerNotice) and a specific event. The
    // fallback must deliver the specific event, not the generic template.
    const character = new Character({
      name: 'Maya', id: 'maya', personality: 'INFP', llm: async () => '违规内容',
    });
    const genericDesc = character._engine.domain.socialInteractions.strangerNotice;
    const specificDesc = '今天的麦酒特别好喝';
    character._engine.getGroundingPackage = () => ({
      allowedFacts: [
        { id: 'fact_event_generic', type: 'event', description: genericDesc, location: '酒馆' },
        { id: 'fact_event_specific', type: 'event', description: specificDesc, location: '酒馆' },
        { id: 'fact_maya_state', type: 'agent_state', agentId: 'maya', region: '酒馆', state: '喝酒' },
      ],
      metadata: { agentNames: { maya: 'Maya' } },
    });
    character._engine.checkConsistency = () => ({ valid: true, severity: 'pass' });
    const reply = await character.chat('刚才发生了什么？');
    expect(reply).toBe(`我知道${specificDesc}。`);
    expect(reply).not.toContain(genericDesc);
  });

  it('R8.4: recent_event fallback falls back to generic event when no specific event exists', async () => {
    // When only a generic event is available, the fallback still delivers it
    // (better than silence) but the selection must not crash.
    const character = new Character({
      name: 'Maya', id: 'maya', personality: 'INFP', llm: async () => '违规内容',
    });
    const genericDesc = character._engine.domain.socialInteractions.strangerNotice;
    character._engine.getGroundingPackage = () => ({
      allowedFacts: [
        { id: 'fact_event_generic', type: 'event', description: genericDesc, location: '酒馆' },
        { id: 'fact_maya_state', type: 'agent_state', agentId: 'maya', region: '酒馆', state: '喝酒' },
      ],
      metadata: { agentNames: { maya: 'Maya' } },
    });
    character._engine.checkConsistency = () => ({ valid: true, severity: 'pass' });
    const reply = await character.chat('刚才发生了什么？');
    expect(reply).toBe(`我知道${genericDesc}。`);
  });

  it('chatStream() 对 rewrite 级违规应降级为沉默，不 yield 违规原文', async () => {
    const character = makeCharacterWithConsistency({ valid: false, severity: 'rewrite' });
    const tokens = [];
    for await (const token of character.chatStream('随便说点什么')) {
      tokens.push(token);
    }
    const output = tokens.join('');
    expect(output).toBe('[Maya沉默了一会儿]');
    expect(output).not.toContain('违规内容');
  });

  it('chatStream() 对 reject 级违规仍降级为沉默', async () => {
    const character = makeCharacterWithConsistency({ valid: false, severity: 'reject' });
    const tokens = [];
    for await (const token of character.chatStream('随便说点什么')) {
      tokens.push(token);
    }
    expect(tokens.join('')).toBe('[Maya沉默了一会儿]');
  });

  it('chatStream() 对 invalid warning 也不得外泄', async () => {
    const character = makeCharacterWithConsistency({ valid: false, severity: 'warning' });
    const tokens = [];
    for await (const token of character.chatStream('随便说点什么')) {
      tokens.push(token);
    }
    expect(tokens.join('')).toBe('[Maya沉默了一会儿]');
  });

  it('chatStream() 对 valid 回复原样 yield，不误伤', async () => {
    const character = makeCharacterWithConsistency({ valid: true, severity: 'ok' });
    const tokens = [];
    for await (const token of character.chatStream('随便说点什么')) {
      tokens.push(token);
    }
    expect(tokens.join('')).toBe('这是一段违规内容');
  });

  it('chatStream() 对违规回复 yield 二次验证后的事实回退', async () => {
    const character = makeCharacterWithVerifiedFallback();
    const tokens = [];
    for await (const token of character.chatStream('随便说点什么')) {
      tokens.push(token);
    }

    expect(tokens.join('')).toBe('我在图书馆。');
    expect(tokens.join('')).not.toContain('违规内容');
  });

  it('真实 facts-enabled Engine 中的回退本身通过公开一致性校验', async () => {
    const engine = new AndyEngine({ enableFacts: true, seed: 'sdk-safe-delivery-integration' });
    const character = new Character({
      id: 'maya',
      name: 'Maya',
      personality: 'INFP',
      engine,
      llm: async () => '我在火星散步',
    });
    engine.tick();

    const reply = await character.chat('你好');
    const consistency = engine.checkConsistency(reply, 'maya');

    expect(reply).not.toContain('火星');
    expect(consistency.valid).toBe(true);
    expect(consistency.evidenceTrace.some(entry => entry.factId)).toBe(true);
  });
});
