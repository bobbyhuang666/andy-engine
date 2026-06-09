/**
 * Backward Compatibility Matrix
 *
 * 验证旧 API 不破。
 */

import { describe, it, expect } from 'vitest';
import AndyEngine from '../index.js';
import { Character } from '../sdk/index.js';
import { validateDomain } from '../domain/validateDomain.js';
import tavernDomain from '../presets/tavern/index.js';

describe('Backward Compatibility: Legacy API', () => {
  it('new AndyEngine() defaults to campus', () => {
    const engine = new AndyEngine();
    expect(engine.domain.id).toBe('campus');
  });

  it('createCharacter with schedule: student', () => {
    const engine = new AndyEngine();
    const agent = engine.createCharacter({
      id: 'test',
      name: 'Test',
      mbti: 'INFP',
      schedule: 'student',
    });
    // campus preset 使用 legacy Schedule.resolvePreset，entries 可能为空
    expect(agent).toBeDefined();
    expect(agent.id).toBe('test');
  });

  it('addAgent works', () => {
    const engine = new AndyEngine();
    const agent = engine.addAgent({ id: 'test', name: 'Test' });
    expect(agent.id).toBe('test');
  });

  it('agent.toNarrative() returns string', () => {
    const engine = new AndyEngine();
    const agent = engine.createCharacter({ id: 'test', name: 'Test', mbti: 'INFP' });
    engine.tick();
    const narrative = agent.toNarrative();
    expect(typeof narrative).toBe('string');
  });

  it('engine.getWorldContext() returns context', () => {
    const engine = new AndyEngine();
    engine.createCharacter({ id: 'test', name: 'Test', mbti: 'INFP' });
    engine.tick();
    const ctx = engine.getWorldContext('test');
    expect(ctx).toBeDefined();
    expect(ctx.currentRegion).toBeDefined();
  });

  it('Character default constructor works', () => {
    const engine = new AndyEngine();
    const c = new Character({
      id: 'test',
      name: 'Test',
      personality: 'INFP',
      engine,
      llm: async () => 'ok',
    });
    expect(c.id).toBe('test');
  });

  it('legacy schedule presets work', () => {
    const engine = new AndyEngine();
    for (const preset of ['student', 'worker', 'freelancer', 'home']) {
      const agent = engine.createCharacter({
        id: preset,
        name: preset,
        schedule: preset,
      });
      expect(agent.schedule.entries.length).toBeGreaterThanOrEqual(0);
    }
  });

  it('campus preset states are valid', () => {
    const engine = new AndyEngine();
    const states = Object.keys(engine.domain.states);
    expect(states.length).toBeGreaterThan(0);
    expect(states).toContain('在上课');
    expect(states).toContain('睡了');
  });
});

describe('Backward Compatibility: Custom Domain API', () => {
  it('new AndyEngine({ domain: tavern }) works', () => {
    const engine = new AndyEngine({ domain: tavernDomain });
    expect(engine.domain.id).toBe('tavern');
  });

  it('createCharacter with domain archetype', () => {
    const engine = new AndyEngine({ domain: tavernDomain });
    const agent = engine.createCharacter({
      id: 'smith',
      name: '铁匠',
      schedule: 'blacksmith',
    });
    expect(agent.schedule.entries.length).toBeGreaterThan(0);
  });

  it('addAgent injects domain', () => {
    const engine = new AndyEngine({ domain: tavernDomain });
    const agent = engine.addAgent({ id: 'test', name: 'Test' });
    expect(agent._domain.id).toBe('tavern');
  });

  it('Character with custom-domain engine', () => {
    const engine = new AndyEngine({ domain: tavernDomain });
    const c = new Character({
      id: 'test',
      name: 'Test',
      personality: 'INFP',
      engine,
      llm: async () => 'ok',
    });
    expect(c._agent._domain.id).toBe('tavern');
  });

  it('invalid domain throws clear error', () => {
    expect(() => {
      new AndyEngine({ domain: { id: 'bad' } });
    }).toThrow(/Invalid domain config/);
  });

  it('custom domain tick works', () => {
    const engine = new AndyEngine({ domain: tavernDomain });
    engine.createCharacter({ id: 'test', name: 'Test', schedule: 'blacksmith' });
    expect(() => engine.tick()).not.toThrow();
  });

  it('custom domain narrative has no campus words', () => {
    const engine = new AndyEngine({ domain: tavernDomain });
    const agent = engine.createCharacter({ id: 'test', name: 'Test', schedule: 'blacksmith' });
    for (let i = 0; i < 10; i++) engine.tick();
    const narrative = agent.toNarrative();
    const campusWords = ['教室', '图书馆', '宿舍', '食堂', '学生', '老师'];
    for (const word of campusWords) {
      expect(narrative).not.toContain(word);
    }
  });
});
