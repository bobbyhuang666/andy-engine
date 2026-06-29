/**
 * B2 回归测试 — chat() / chatStream() 不外泄 rewrite 级一致性违规内容
 *
 * 根因 (R39/R40):
 *   checkConsistency 可返回 { valid:false, severity:'rewrite' } 表示违规但可改写。
 *   chat() 原实现只拦截 severity==='reject'，rewrite 级违规内容被原样返回/yield 给用户，
 *   违反 "consistency invalid 不外泄" 目标。chatStream 在 R39 已修，chat() 在 R40 补齐。
 *
 * 本测试覆盖两条路径: rewrite 级违规在 chat() 与 chatStream() 都应降级为沉默，
 * 违规原文不外泄。reject 级与 valid 级作为对照，确保不误伤正常回复。
 */

import { describe, it, expect } from 'vitest';
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

  it('chat() 对 valid 回复原样返回，不误伤', async () => {
    const character = makeCharacterWithConsistency({ valid: true, severity: 'ok' });
    const reply = await character.chat('随便说点什么');
    expect(reply).toBe('这是一段违规内容');
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

  it('chatStream() 对 valid 回复原样 yield，不误伤', async () => {
    const character = makeCharacterWithConsistency({ valid: true, severity: 'ok' });
    const tokens = [];
    for await (const token of character.chatStream('随便说点什么')) {
      tokens.push(token);
    }
    expect(tokens.join('')).toBe('这是一段违规内容');
  });
});
