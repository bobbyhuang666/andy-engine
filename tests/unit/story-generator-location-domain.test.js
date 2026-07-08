/**
 * StoryGenerator domain-driven location tests
 *
 * 验证社交故事地点显示名走 domain/semanticProfile.locationNames 驱动：
 *   - 提供 locationNames 时按映射输出显示名（原始 region key 不直出）
 *   - 未映射 / 无 profile 时直出原始 location
 *   - location 缺失才退回无地点短语
 * core 不再硬编码 campus/tavern 具体世界词。
 *
 * 注意：TEMPLATES.social 只有 1/4 模板含 {location}，
 * 因此用确定性 seed 选中含地点模板（loc-b / raw-a → rng.next()≥0.75）。
 */

import { describe, it, expect } from 'vitest';
import { StoryGenerator } from '../../src/narrative/StoryGenerator.js';
import { RNG } from '../../src/shared/rng.js';

function socialTick(location) {
  return {
    tickNumber: 7,
    phase: {
      agentThink: {
        results: {
          bobby: {
            interaction: { otherAgentName: '小明', location },
          },
        },
      },
    },
  };
}

describe('StoryGenerator domain-driven locations', () => {
  const simTime = new Date('2026-06-21T14:00:00Z');

  it('maps location through semanticProfile.locationNames when provided', () => {
    const locationNames = { tavern_hall: '大厅', tavern_cellar: '酒窖' };
    const gen = new StoryGenerator({ locationNames });
    // 'loc-b' rng.next()≈0.88 → 选中含 {location} 的模板
    const rng = new RNG('loc-b');

    const stories = gen.generateFromTick(socialTick('tavern_hall'), 'bobby', { rng, simTime });

    expect(stories).toBeDefined();
    expect(stories.length).toBe(1);
    expect(stories[0].category).toBe('social');
    // 映射后的显示名出现在内容里，原始 region key 不应直出
    expect(stories[0].content).toContain('大厅');
    expect(stories[0].content).not.toContain('tavern_hall');
    expect(stories[0].content).toContain('小明');
  });

  it('falls back to raw location when no profile is provided', () => {
    const gen = new StoryGenerator(); // 无 profile
    // 'raw-a' rng.next()≈0.90 → 选中含 {location} 的模板
    const rng = new RNG('raw-a');

    const stories = gen.generateFromTick(socialTick('plaza'), 'bobby', { rng, simTime });

    expect(stories.length).toBe(1);
    // 没有 domain profile → 直出原始 location
    expect(stories[0].content).toContain('plaza');
    expect(stories[0].content).toContain('小明');
  });

  it('unmapped region key falls back to raw location even with a profile', () => {
    const locationNames = { tavern_hall: '大厅' };
    const gen = new StoryGenerator({ locationNames });
    const rng = new RNG('loc-b');

    const stories = gen.generateFromTick(socialTick('market_square'), 'bobby', { rng, simTime });

    expect(stories.length).toBe(1);
    // 未在 locationNames 中的 key → 直出原值
    expect(stories[0].content).toContain('market_square');
    expect(stories[0].content).not.toContain('大厅');
  });

  it('uses no-location phrase when interaction.location is missing', () => {
    const gen = new StoryGenerator({ locationNames: { tavern_hall: '大厅' } });
    const rng = new RNG('no-loc-seed');

    const tick = {
      tickNumber: 8,
      phase: { agentThink: { results: { bobby: { interaction: { otherAgentName: '小红' } } } } },
    };
    const stories = gen.generateFromTick(tick, 'bobby', { rng, simTime });

    expect(stories.length).toBe(1);
    expect(stories[0].content).toContain('小红');
    // 没有 location → 退回无地点短语，不应出现模板里的地点占位
    expect(stories[0].content).not.toContain('{location}');
  });

  it('does not hardcode campus/tavern world words into core output', () => {
    // core 在无 profile 下应只输出原始 region key，不翻译成具体世界词。
    const gen = new StoryGenerator();
    const rng = new RNG('raw-a');

    const stories = gen.generateFromTick(socialTick('library'), 'bobby', { rng, simTime });

    expect(stories.length).toBe(1);
    // 无 profile：直出 'library'，不再硬编码成 '阅览处'
    expect(stories[0].content).toContain('library');
    expect(stories[0].content).not.toContain('阅览处');
  });
});
