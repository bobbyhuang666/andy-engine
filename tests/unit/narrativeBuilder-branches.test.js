/**
 * NarrativeBuilder branch coverage — Wave 5 batch 3
 *
 * 此前 narrativeBuilder-affectFrame/structuredContext 已覆盖 needs/emotions happy path +
 * 附近的人/事件 array 路径。本文件补:
 *   - buildSystemPrompt 边界(无 worldContext / 无 domain / personalityAnchor / backstory /
 *     conversationHistory / scenario)
 *   - _buildIdentity 全 timeDesc + weather/season maps
 *   - _buildCurrentState affectFrame need tiers / emotion intensityLabel / health / behavior dynamic
 *
 * 纯函数:无 DB / 无 LLM。用 getDefaultDomain + hand-crafted domain。
 */

import { describe, it, expect } from 'vitest';
import NarrativeBuilder from '../../src/sdk/NarrativeBuilder.js';
import { getDefaultDomain } from '../../src/domain/DomainRegistry.js';

const campusDomain = getDefaultDomain();

function baseCtx(overrides = {}) {
  return {
    hour: 10,
    season: 'spring',
    weather: 'sunny',
    currentRegion: null,
    personalityAnchor: null,
    memoryContext: '',
    nearbyPeople: null,
    recentEvents: null,
    health: 90,
    agentStatus: {},
    ...overrides,
  };
}

// ═══════════════════════════════════════════
// buildSystemPrompt 边界
// ═══════════════════════════════════════════
describe('NarrativeBuilder.buildSystemPrompt — boundary branches', () => {
  it('returns "" when worldContext is null', () => {
    expect(NarrativeBuilder.buildSystemPrompt(null, { domain: campusDomain })).toBe('');
  });
  it('throws when domain is null', () => {
    expect(() => NarrativeBuilder.buildSystemPrompt(baseCtx(), { domain: null }))
      .toThrow(/requires a domain config/);
  });
  it('includes personalityAnchor section when provided', () => {
    const prompt = NarrativeBuilder.buildSystemPrompt(
      baseCtx({ personalityAnchor: '# 你的性格\n内向' }),
      { domain: campusDomain, characterName: 'A' }
    );
    expect(prompt).toContain('# 你的性格');
    expect(prompt).toContain('内向');
  });
  it('includes backstory section when provided', () => {
    const prompt = NarrativeBuilder.buildSystemPrompt(
      baseCtx(),
      { domain: campusDomain, characterName: 'A', backstory: ['b1', 'b2'] }
    );
    expect(prompt).toContain('# 你的故事');
    expect(prompt).toContain('- b1');
    expect(prompt).toContain('- b2');
  });
  it('includes conversationHistory section when provided', () => {
    const prompt = NarrativeBuilder.buildSystemPrompt(
      baseCtx(),
      { domain: campusDomain, characterName: 'A', conversationHistory: '之前的对话' }
    );
    expect(prompt).toContain('# 你们之前聊过');
    expect(prompt).toContain('之前的对话');
  });
  it('includes scenario section when provided', () => {
    const prompt = NarrativeBuilder.buildSystemPrompt(
      baseCtx(),
      { domain: campusDomain, characterName: 'A', scenario: '咖啡馆偶遇' }
    );
    expect(prompt).toContain('# 场景');
    expect(prompt).toContain('咖啡馆偶遇');
  });
});

// ═══════════════════════════════════════════
// _buildIdentity — timeDesc / weather / season maps
// ═══════════════════════════════════════════
describe('NarrativeBuilder._buildIdentity — timeDesc branches', () => {
  const cases = [
    [6, '清晨'], [10, '上午'], [13, '中午'], [16, '下午'], [20, '晚上'], [2, '深夜'],
  ];
  for (const [hour, expected] of cases) {
    it(`hour=${hour} → ${expected}`, () => {
      const id = NarrativeBuilder._buildIdentity('X', baseCtx({ hour }));
      expect(id).toContain(`现在是${expected}`);
    });
  }
});

describe('NarrativeBuilder._buildIdentity — weather/season maps', () => {
  const weatherCases = [
    ['sunny', '阳光明媚'], ['cloudy', '天色阴沉'], ['rainy', '窗外下着雨'],
    ['snowy', '外面飘着雪'], ['windy', '风很大'],
  ];
  for (const [weather, expected] of weatherCases) {
    it(`weather=${weather} → ${expected}`, () => {
      const id = NarrativeBuilder._buildIdentity('X', baseCtx({ hour: 10, weather }));
      expect(id).toContain(expected);
    });
  }
  const seasonCases = [
    ['spring', '春天'], ['summer', '夏天'], ['autumn', '秋天'], ['winter', '冬天'],
  ];
  for (const [season, expected] of seasonCases) {
    it(`season=${season} → ${expected}`, () => {
      const id = NarrativeBuilder._buildIdentity('X', baseCtx({ hour: 10, season }));
      expect(id).toContain(expected);
    });
  }
  it('omits season/weather when not provided', () => {
    const id = NarrativeBuilder._buildIdentity('X', { hour: 10 });
    expect(id).toBe('你是X。现在是上午。');
  });
});

// ═══════════════════════════════════════════
// _buildCurrentState — affectFrame need tiers
// ═══════════════════════════════════════════
describe('NarrativeBuilder._buildCurrentState — affectFrame need tiers', () => {
  it('energy urgency 0.6 → 有点犯困; 0.8 → 眼皮重得抬不起来', () => {
    const s1 = NarrativeBuilder._buildCurrentState(baseCtx(), {}, {
      needs: [{ need: 'energy', urgency: 0.6 }], emotions: [], valence: 0,
    });
    expect(s1).toContain('有点犯困');
    const s2 = NarrativeBuilder._buildCurrentState(baseCtx(), {}, {
      needs: [{ need: 'energy', urgency: 0.8 }], emotions: [], valence: 0,
    });
    expect(s2).toContain('眼皮重得抬不起来');
  });
  it('hunger urgency 0.6 → 有点饿; 0.8 → 肚子咕咕叫', () => {
    const s1 = NarrativeBuilder._buildCurrentState(baseCtx(), {}, {
      needs: [{ need: 'hunger', urgency: 0.6 }], emotions: [], valence: 0,
    });
    expect(s1).toContain('有点饿');
    const s2 = NarrativeBuilder._buildCurrentState(baseCtx(), {}, {
      needs: [{ need: 'hunger', urgency: 0.8 }], emotions: [], valence: 0,
    });
    expect(s2).toContain('肚子咕咕叫');
  });
  it('social urgency 0.8 → 好久没跟人说话了', () => {
    const s = NarrativeBuilder._buildCurrentState(baseCtx(), {}, {
      needs: [{ need: 'social', urgency: 0.8 }], emotions: [], valence: 0,
    });
    expect(s).toContain('好久没跟人说话了');
  });
  it('currentRegion with narrativeTemplates.regionMap hit and miss', () => {
    const templates = { regionMap: { home: '在家里' } };
    const hit = NarrativeBuilder._buildCurrentState(baseCtx({ currentRegion: 'home' }), templates, null);
    expect(hit).toContain('在家里');
    const miss = NarrativeBuilder._buildCurrentState(baseCtx({ currentRegion: 'unknown' }), templates, null);
    expect(miss).toContain('在unknown');
  });
});

// ═══════════════════════════════════════════
// _buildCurrentState — emotion intensityLabel tiers
// ═══════════════════════════════════════════
describe('NarrativeBuilder._buildCurrentState — emotion intensityLabel', () => {
  const cases = [
    [0.9, '极度'], [0.75, '非常'], [0.6, '很'], [0.45, '挺'], [0.3, '比较'], [0.15, '有点'], [0.05, '略微'],
  ];
  for (const [intensity, label] of cases) {
    it(`joy intensity ${intensity} → ${label}开心`, () => {
      const s = NarrativeBuilder._buildCurrentState(baseCtx(), {}, {
        needs: [], emotions: [{ dimension: 'joy', intensity }], valence: intensity,
      });
      expect(s).toContain(`${label}开心`);
    });
  }
  it('valence≈0 with positive+negative → 平静而微妙...与...并存', () => {
    const s = NarrativeBuilder._buildCurrentState(baseCtx(), {}, {
      needs: [],
      emotions: [
        { dimension: 'joy', intensity: 0.3 },
        { dimension: 'sadness', intensity: -0.3 },
      ],
      valence: 0,
    });
    expect(s).toContain('平静而微妙');
    expect(s).toContain('与');
    expect(s).toContain('并存');
  });
});

// ═══════════════════════════════════════════
// _buildCurrentState — health tiers
// ═══════════════════════════════════════════
describe('NarrativeBuilder._buildCurrentState — health tiers', () => {
  it('health < 40 → 浑身不舒服', () => {
    const s = NarrativeBuilder._buildCurrentState(baseCtx({ health: 30 }), {}, { needs: [], emotions: [], valence: 0 });
    expect(s).toContain('浑身不舒服');
  });
  it('health 40-69 → 身体有点不在状态', () => {
    const s = NarrativeBuilder._buildCurrentState(baseCtx({ health: 50 }), {}, { needs: [], emotions: [], valence: 0 });
    expect(s).toContain('身体有点不在状态');
  });
  it('health >= 70 → no health phrase', () => {
    const s = NarrativeBuilder._buildCurrentState(baseCtx({ health: 90 }), {}, { needs: [], emotions: [], valence: 0 });
    expect(s).not.toContain('不舒服');
    expect(s).not.toContain('不在状态');
  });
  it('lastAppraisal is included when provided', () => {
    const s = NarrativeBuilder._buildCurrentState(baseCtx({ lastAppraisal: '最近发生的事让我感慨' }), {}, { needs: [], emotions: [], valence: 0 });
    expect(s).toContain('最近发生的事让我感慨');
  });
});

// ═══════════════════════════════════════════
// _buildCurrentState — behavior field dynamic phrases
// ═══════════════════════════════════════════
describe('NarrativeBuilder._buildCurrentState — behavior dynamic', () => {
  it('sociality rising → 想去人多的地方', () => {
    const s = NarrativeBuilder._buildCurrentState(baseCtx({
      agentStatus: { behavior: { speed: 0.5, vector: [0.3, 0.7, 0.2, 0.4], gradient: [0, -0.2, 0, 0] } },
    }), {}, { needs: [], emotions: [], valence: 0 });
    expect(s).toContain('想去人多的地方');
  });
  it('focus falling → 心思不太集中', () => {
    const s = NarrativeBuilder._buildCurrentState(baseCtx({
      agentStatus: { behavior: { speed: 0.5, vector: [0.5, 0.5, 0.2, 0.5], gradient: [0, 0, 0.2, 0] } },
    }), {}, { needs: [], emotions: [], valence: 0 });
    expect(s).toContain('心思不太集中');
  });
  it('activity rising → 想动起来', () => {
    const s = NarrativeBuilder._buildCurrentState(baseCtx({
      agentStatus: { behavior: { speed: 0.5, vector: [0.3, 0.5, 0.5, 0.5], gradient: [-0.3, 0, 0, 0] } },
    }), {}, { needs: [], emotions: [], valence: 0 });
    expect(s).toContain('想动起来');
  });
});
