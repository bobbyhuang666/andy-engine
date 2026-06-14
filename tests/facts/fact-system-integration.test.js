/**
 * Fact System Integration Tests
 *
 * 端到端验证事实系统的完整流程：
 *   - 启用/未启用事实系统的行为
 *   - tick 后事实生成
 *   - getGroundingPackage 返回有效对象
 *   - checkConsistency 返回有效结果
 *   - 多 tick 后事实增长/更新
 *   - Domain-agnostic 验证（Tavern 不含 campus 术语）
 *   - FactEmitter 不使用 Math.random 或 Date.now
 */

import { describe, it, expect } from 'vitest';
import AndyEngine from '../../index.js';
import tavernDomain from '../../presets/tavern/index.js';
import fs from 'fs';
import { FactFormatter, createEventFact } from '../../facts/index.js';

describe('Fact System Integration', () => {
  it('启用事实系统后 tick 生成事实', () => {
    const engine = new AndyEngine({ enableFacts: true });
    engine.createCharacter({ id: 'test', name: '测试', mbti: 'INFP' });

    engine.tick();

    const stats = engine.world.factStore.getStats();
    expect(stats.total).toBeGreaterThan(0);
    expect(stats.byType.agent_state).toBeGreaterThan(0);
  });

  it('未启用事实系统时 getGroundingPackage 返回 null', () => {
    const engine = new AndyEngine();
    engine.createCharacter({ id: 'test', name: '测试', mbti: 'INFP' });

    expect(engine.getGroundingPackage('test')).toBeNull();
  });

  it('启用事实系统后 getGroundingPackage 返回有效对象', () => {
    const engine = new AndyEngine({ enableFacts: true });
    engine.createCharacter({ id: 'test', name: '测试', mbti: 'INFP' });
    engine.tick();

    const grounding = engine.getGroundingPackage('test');
    expect(grounding).not.toBeNull();
    expect(grounding.allowedFacts).toBeDefined();
    expect(Array.isArray(grounding.allowedFacts)).toBe(true);
    expect(grounding.metadata.currentTime.toISOString()).toBe(engine.world.time.toISOString());
    expect(grounding.metadata.factCount.allowed).toBe(grounding.allowedFacts.length);
    expect(grounding.metadata.factCount.inferred).toBe(grounding.inferredFacts.length);
    expect(grounding.metadata.factCount.forbidden).toBe(grounding.forbiddenFacts.length);
  });

  it('checkConsistency 返回有效结果', () => {
    const engine = new AndyEngine({ enableFacts: true });
    engine.createCharacter({ id: 'test', name: '测试', mbti: 'INFP' });
    engine.tick();

    const result = engine.checkConsistency('我在图书馆看书', 'test');
    expect(result).toHaveProperty('valid');
    expect(result).toHaveProperty('violations');
    expect(result).toHaveProperty('severity');
  });

  it('多 tick 后 agent_state 事实更新而非无限增长', () => {
    const engine = new AndyEngine({ enableFacts: true });
    engine.createCharacter({ id: 'test', name: '测试', mbti: 'INFP' });

    engine.tick();
    const stats1 = engine.world.factStore.getStats();

    for (let i = 0; i < 5; i++) {
      engine.tick();
    }

    const stats2 = engine.world.factStore.getStats();
    expect(stats2.byType.agent_state).toBe(stats1.byType.agent_state);
  });

  it('Tavern domain 不含 campus 术语', () => {
    const engine = new AndyEngine({ enableFacts: true, domain: tavernDomain });
    engine.createCharacter({ id: 'test', name: '测试', mbti: 'INFP' });
    engine.tick();

    const facts = engine.world.factStore.getStaticFacts();
    const campusTerms = ['图书馆', '食堂', '宿舍', '教学楼'];

    for (const fact of facts) {
      for (const term of campusTerms) {
        expect(fact.object).not.toContain(term);
        expect(fact.area).not.toContain(term);
      }
    }
  });

  it('FactEmitter 不使用 Math.random 或 Date.now', () => {
    const content = fs.readFileSync('facts/FactEmitter.js', 'utf8');

    expect(content).not.toMatch(/Math\.random\(\)/);
    expect(content).not.toMatch(/Date\.now\(\)/);
    expect(content).toMatch(/_getSimTime/);
  });

  it('FactEmitter 对缺失 id 的事件使用可重复 fallback id', () => {
    const engineA = new AndyEngine({ enableFacts: true, seed: 'facts', startTime: new Date('2026-01-01T00:00:00Z') });
    const engineB = new AndyEngine({ enableFacts: true, seed: 'facts', startTime: new Date('2026-01-01T00:00:00Z') });

    engineA.world.factEmitter.setSimTime(engineA.world.time);
    engineB.world.factEmitter.setSimTime(engineB.world.time);

    const [factA] = engineA.world.factEmitter.emitEventFacts([{ type: 'custom', content: '测试事件' }]);
    const [factB] = engineB.world.factEmitter.emitEventFacts([{ type: 'custom', content: '测试事件' }]);

    expect(factA.eventId).toBe(factB.eventId);
    expect(factA.eventId).toContain('2026-01-01T00:00:00.000Z');
  });

  it('legacy runtime snapshot 应恢复 factStore', () => {
    const engine = new AndyEngine({ enableFacts: true, seed: 'facts-restore', startTime: new Date('2026-01-01T00:00:00Z') });
    engine.createCharacter({ id: 'test', name: '测试', mbti: 'INFP' });
    engine.tick();

    const before = engine.world.factStore.getStats();
    const restored = AndyEngine.fromJSON(engine.toJSON(), { enableFacts: true, seed: 'facts-restore' });
    const after = restored.world.factStore.getStats();

    expect(after.total).toBe(before.total);
    expect(after.byType.agent_state).toBe(before.byType.agent_state);
  });

  it('FactFormatter 正确格式化 agent_state 区域', () => {
    const text = FactFormatter.toNaturalLanguage({
      type: 'agent_state',
      agentId: 'test',
      region: '小屋',
      state: '休息',
    });

    expect(text).toBe('在小屋，正在休息');
  });

  it('createBaseFact 默认 timestamp 不依赖 wall clock', () => {
    const fact = createEventFact({ eventId: 'evt_fixed', description: '固定事件' });
    expect(fact.timestamp.toISOString()).toBe('1970-01-01T00:00:00.000Z');
  });
});
