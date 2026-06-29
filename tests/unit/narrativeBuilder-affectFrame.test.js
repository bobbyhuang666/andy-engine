import { describe, it, expect } from 'vitest';
import NarrativeBuilder from '../../src/sdk/NarrativeBuilder.js';
import { getDefaultDomain } from '../../src/domain/DomainRegistry.js';

const campusDomain = getDefaultDomain();

describe('NarrativeBuilder AffectFrame Integration', () => {
  it('old string path still works without affectFrame', () => {
    const worldContext = {
      hour: 10,
      weather: 'sunny',
      season: 'spring',
      currentRegion: '宿舍',
      emotionState: '开心的情绪主导着你的心境（效价=0.35, 唤醒=0.52）',
      needsState: '需求：精力不足，饱腹充足。',
      health: 80,
    };

    const prompt = NarrativeBuilder.buildSystemPrompt(worldContext, {
      domain: campusDomain,
      characterName: '测试角色',
    });

    expect(prompt).toContain('测试角色');
    expect(prompt).toContain('上午');
    expect(prompt).toContain('阳光明媚');
    expect(prompt).toContain('春天');
  });

  it('AffectFrame path works for needs', () => {
    const worldContext = {
      hour: 10,
      weather: 'sunny',
      season: 'spring',
      currentRegion: '宿舍',
      health: 80,
    };

    const affectFrame = {
      emotions: [
        { dimension: 'joy', intensity: 0.4 },
        { dimension: 'sadness', intensity: -0.2 },
      ],
      valence: 0.2,
      arousal: 0.5,
      needs: [
        { need: 'energy', urgency: 0.8 },
        { need: 'hunger', urgency: 0.6 },
      ],
      behavior: { activity: 0.5, sociality: 0.3, focus: 0.6, expressiveness: 0.4 },
      behaviorSpeed: 0.1,
      stability: 0.5,
      _meta: { version: '0.1-seam' },
    };

    const prompt = NarrativeBuilder.buildSystemPrompt(worldContext, {
      domain: campusDomain,
      characterName: '测试角色',
      affectFrame,
    });

    expect(prompt).toContain('眼皮重得抬不起来');
    expect(prompt).toContain('有点饿');
  });

  it('AffectFrame path works for emotions', () => {
    const worldContext = {
      hour: 10,
      weather: 'sunny',
      season: 'spring',
      currentRegion: '宿舍',
      health: 80,
    };

    const affectFrame = {
      emotions: [
        { dimension: 'joy', intensity: 0.6 },
        { dimension: 'sadness', intensity: -0.1 },
      ],
      valence: 0.5,
      arousal: 0.6,
      needs: [],
      behavior: { activity: 0.5, sociality: 0.3, focus: 0.6, expressiveness: 0.4 },
      behaviorSpeed: 0.1,
      stability: 0.5,
      _meta: { version: '0.1-seam' },
    };

    const prompt = NarrativeBuilder.buildSystemPrompt(worldContext, {
      domain: campusDomain,
      characterName: '测试角色',
      affectFrame,
    });

    expect(prompt).toContain('开心');
    expect(prompt).toContain('主导');
  });

  it('AffectFrame path works for negative valence', () => {
    const worldContext = {
      hour: 10,
      weather: 'sunny',
      season: 'spring',
      currentRegion: '宿舍',
      health: 80,
    };

    // R24: sadness with intensity > 0 (above baseline) → feels sad → goes into negative[]
    const affectFrame = {
      emotions: [
        { dimension: 'sadness', intensity: 0.5 },
        { dimension: 'joy', intensity: 0.1 },
      ],
      valence: -0.4,
      arousal: 0.4,
      needs: [],
      behavior: { activity: 0.3, sociality: 0.2, focus: 0.4, expressiveness: 0.3 },
      behaviorSpeed: 0.1,
      stability: 0.5,
      _meta: { version: '0.1-seam' },
    };

    const prompt = NarrativeBuilder.buildSystemPrompt(worldContext, {
      domain: campusDomain,
      characterName: '测试角色',
      affectFrame,
    });

    expect(prompt).toContain('难过');
    expect(prompt).toContain('笼罩');
  });

  it('AffectFrame path works for guidelines', () => {
    const worldContext = {
      hour: 10,
      weather: 'sunny',
      season: 'spring',
      currentRegion: '宿舍',
      health: 80,
    };

    const affectFrame = {
      emotions: [
        { dimension: 'sadness', intensity: -0.5 },
      ],
      valence: -0.4,
      arousal: 0.4,
      needs: [
        { need: 'energy', urgency: 0.8 },
      ],
      behavior: { activity: 0.3, sociality: 0.2, focus: 0.4, expressiveness: 0.3 },
      behaviorSpeed: 0.1,
      stability: 0.5,
      _meta: { version: '0.1-seam' },
    };

    const prompt = NarrativeBuilder.buildSystemPrompt(worldContext, {
      domain: campusDomain,
      characterName: '测试角色',
      affectFrame,
    });

    expect(prompt).toContain('心情不好');
    expect(prompt).toContain('很困');
  });

  it('Same AffectFrame produces stable prompt sections', () => {
    const worldContext = {
      hour: 10,
      weather: 'sunny',
      season: 'spring',
      currentRegion: '宿舍',
      health: 80,
    };

    const affectFrame = {
      emotions: [
        { dimension: 'joy', intensity: 0.4 },
        { dimension: 'sadness', intensity: -0.2 },
      ],
      valence: 0.2,
      arousal: 0.5,
      needs: [
        { need: 'energy', urgency: 0.7 },
      ],
      behavior: { activity: 0.5, sociality: 0.3, focus: 0.6, expressiveness: 0.4 },
      behaviorSpeed: 0.1,
      stability: 0.5,
      _meta: { version: '0.1-seam' },
    };

    const prompt1 = NarrativeBuilder.buildSystemPrompt(worldContext, {
      domain: campusDomain,
      characterName: '测试角色',
      affectFrame,
    });

    const prompt2 = NarrativeBuilder.buildSystemPrompt(worldContext, {
      domain: campusDomain,
      characterName: '测试角色',
      affectFrame,
    });

    expect(prompt1).toBe(prompt2);
  });

  it('No public API shape change', () => {
    const worldContext = {
      hour: 10,
      weather: 'sunny',
      season: 'spring',
      currentRegion: '宿舍',
      emotionState: '开心的情绪主导着你的心境（效价=0.35, 唤醒=0.52）',
      needsState: '需求：精力不足，饱腹充足。',
      health: 80,
    };

    const prompt1 = NarrativeBuilder.buildSystemPrompt(worldContext, {
      domain: campusDomain,
      characterName: '测试角色',
    });

    const affectFrame = {
      emotions: [
        { dimension: 'joy', intensity: 0.4 },
      ],
      valence: 0.35,
      arousal: 0.52,
      needs: [
        { need: 'energy', urgency: 0.6 },
      ],
      behavior: { activity: 0.5, sociality: 0.3, focus: 0.6, expressiveness: 0.4 },
      behaviorSpeed: 0.1,
      stability: 0.5,
      _meta: { version: '0.1-seam' },
    };

    const prompt2 = NarrativeBuilder.buildSystemPrompt(worldContext, {
      domain: campusDomain,
      characterName: '测试角色',
      affectFrame,
    });

    expect(prompt1).toContain('测试角色');
    expect(prompt2).toContain('测试角色');
    expect(prompt1).toContain('上午');
    expect(prompt2).toContain('上午');
  });
});
