import { describe, it, expect } from 'vitest';
import { DomainRegistry } from '../../src/domain/DomainRegistry.js';
import campusDomain from '../../presets/campus/index.js';
import tavernDomain from '../../presets/tavern/index.js';

describe('SemanticProfile Merge Logic', () => {
  it('campus domain has complete semanticProfile', () => {
    const registry = new DomainRegistry(campusDomain);
    const profile = registry.getSemanticProfile();

    expect(profile).toBeDefined();
    expect(profile.language).toBe('zh-CN');
    expect(profile.emotionKeywords).toBeDefined();
    expect(profile.defaultSemanticCategories).toBeDefined();
    expect(profile.defaultSemanticCategories.typeMap).toBeDefined();
    expect(profile.defaultSemanticCategories.keywordMap).toBeDefined();
    expect(profile.defaultSemanticCategories.eventMeaningRules).toBeDefined();
    expect(profile.defaultSemanticCategories.stateCategoryMap).toBeDefined();
  });

  it('tavern domain has complete semanticProfile', () => {
    const registry = new DomainRegistry(tavernDomain);
    const profile = registry.getSemanticProfile();

    expect(profile).toBeDefined();
    expect(profile.language).toBe('zh-CN');
    expect(profile.emotionKeywords).toBeDefined();
    expect(profile.defaultSemanticCategories).toBeDefined();
  });

  it('custom domain with partial semanticProfile uses neutral fallback', () => {
    const customDomain = {
      id: 'custom',
      name: 'Custom Domain',
      version: '1.0.0',
      regions: ['home'],
      adjacency: [],
      regionCoords: { home: { shape: 'rect', x: 0, y: 0, w: 100, h: 100 } },
      placeTypes: { rest: ['home'] },
      states: { 'at_home': { next: ['at_home'], hours: Array.from({ length: 24 }, (_, i) => i), category: 'rest' } },
      stateCenters: { 'at_home': [0.3, 0.2, 0.4, 0.3] },
      roleArchetypes: { default: { schedule: [{ hour: 0, state: 'at_home', region: 'home' }] } },
      semanticProfile: {
        language: 'en',
        emotionKeywords: {
          happy: ['happy', 'glad'],
          sad: ['sad', 'sorrowful'],
        },
      },
    };

    const registry = new DomainRegistry(customDomain);
    const profile = registry.getSemanticProfile();

    expect(profile).toBeDefined();
    expect(profile.language).toBe('en');
    expect(profile.emotionKeywords).toBeDefined();
    expect(profile.emotionKeywords.happy).toContain('happy');

    // 验证不会 fallback 到 campus 中文
    expect(profile.emotionKeywords.happy).not.toContain('开心');
  });

  it('mergeSemanticProfile merges correctly', () => {
    const customDomain = {
      id: 'custom',
      name: 'Custom Domain',
      version: '1.0.0',
      regions: ['home'],
      adjacency: [],
      regionCoords: { home: { shape: 'rect', x: 0, y: 0, w: 100, h: 100 } },
      placeTypes: { rest: ['home'] },
      states: { 'at_home': { next: ['at_home'], hours: Array.from({ length: 24 }, (_, i) => i), category: 'rest' } },
      stateCenters: { 'at_home': [0.3, 0.2, 0.4, 0.3] },
      roleArchetypes: { default: { schedule: [{ hour: 0, state: 'at_home', region: 'home' }] } },
      semanticProfile: {
        language: 'en',
        emotionKeywords: {
          happy: ['happy', 'glad'],
        },
      },
    };

    const registry = new DomainRegistry(customDomain);
    const defaults = {
      language: 'zh-CN',
      emotionKeywords: {
        happy: ['开心', '高兴'],
        sad: ['难过', '伤心'],
      },
    };

    const merged = registry.mergeSemanticProfile(defaults);

    // domain 优先
    expect(merged.language).toBe('en');
    expect(merged.emotionKeywords.happy).toContain('happy');
    expect(merged.emotionKeywords.happy).not.toContain('开心');

    // defaults 补充
    expect(merged.emotionKeywords.sad).toContain('难过');
  });

  it('empty domain semanticProfile returns empty object', () => {
    const customDomain = {
      id: 'custom',
      name: 'Custom Domain',
      version: '1.0.0',
      regions: ['home'],
      adjacency: [],
      regionCoords: { home: { shape: 'rect', x: 0, y: 0, w: 100, h: 100 } },
      placeTypes: { rest: ['home'] },
      states: { 'at_home': { next: ['at_home'], hours: Array.from({ length: 24 }, (_, i) => i), category: 'rest' } },
      stateCenters: { 'at_home': [0.3, 0.2, 0.4, 0.3] },
      roleArchetypes: { default: { schedule: [{ hour: 0, state: 'at_home', region: 'home' }] } },
    };

    const registry = new DomainRegistry(customDomain);
    const profile = registry.getSemanticProfile();

    expect(profile).toBeDefined();
    expect(Object.keys(profile).length).toBe(0);
  });
});
