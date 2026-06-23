import { describe, it, expect } from 'vitest';
import AndyEngine from '../../index.js';
import campusDomain from '../../presets/campus/index.js';
import tavernDomain from '../../presets/tavern/index.js';

describe('Semantic Profile Regression Tests', () => {
  describe('Campus Domain', () => {
    it('Chinese event content is classified into original semantic categories', () => {
      const engine = new AndyEngine({ domain: campusDomain });
      engine.createCharacter({
        id: 'test-agent',
        name: 'Test Agent',
        mbti: 'INFP',
        schedule: 'student',
      });

      const profile = engine.domain.semanticProfile;

      expect(profile).toBeDefined();
      expect(profile.language).toBe('zh-CN');
      expect(profile.emotionKeywords.happy).toContain('开心');
      expect(profile.emotionKeywords.sad).toContain('难过');
      expect(profile.emotionKeywords.angry).toContain('生气');

      expect(profile.defaultSemanticCategories.typeMap.social).toBe('社交互动');
      expect(profile.defaultSemanticCategories.typeMap.weather).toBe('环境天气');
      expect(profile.defaultSemanticCategories.typeMap.general).toBe('日常琐事');

      expect(profile.defaultSemanticCategories.keywordMap['情绪事件']).toContain('开心');
      expect(profile.defaultSemanticCategories.keywordMap['社交互动']).toContain('聊天');
      expect(profile.defaultSemanticCategories.keywordMap['环境天气']).toContain('下雨');
    });

    it('Chinese states are classified via stateCategoryMap', () => {
      const engine = new AndyEngine({ domain: campusDomain });

      const profile = engine.domain.semanticProfile;
      const stateCategoryMap = profile.defaultSemanticCategories.stateCategoryMap;

      expect(stateCategoryMap).toBeDefined();
      expect(stateCategoryMap.active).toBe('学习工作');
      expect(stateCategoryMap.social).toBe('社交互动');
      expect(stateCategoryMap.quiet).toBe('安静休息');
      expect(stateCategoryMap.rest).toBe('安静休息');
      expect(stateCategoryMap.leisure).toBe('休闲娱乐');
      expect(stateCategoryMap.home).toBe('居家生活');
      expect(stateCategoryMap.lateNight).toBe('深夜时刻');
      expect(stateCategoryMap.transit).toBe('日常通勤');
      expect(stateCategoryMap.morning).toBe('日常生活');
      expect(stateCategoryMap.break).toBe('课间休息');
      expect(stateCategoryMap.sleep).toBe('睡眠休息');
      expect(stateCategoryMap.deviant).toBe('偏离常规');
      expect(stateCategoryMap.illness).toBe('身体不适');
    });

    it('campus engine tick works correctly with Chinese semantic profile', () => {
      const engine = new AndyEngine({ domain: campusDomain });

      const agent = engine.createCharacter({
        id: 'test-agent',
        name: 'Test Agent',
        mbti: 'INFP',
        schedule: 'student',
      });

      for (let i = 0; i < 10; i++) {
        engine.tick();
      }

      expect(agent).toBeDefined();
      expect(agent.id).toBe('test-agent');

      const narrative = engine.getNarrative('test-agent');
      expect(narrative).toBeDefined();
      expect(typeof narrative).toBe('string');
      expect(narrative.length).toBeGreaterThan(0);
    });
  });

  describe('Tavern Domain', () => {
    it('tavern Chinese/custom semantics are classified', () => {
      const engine = new AndyEngine({ domain: tavernDomain });
      engine.createCharacter({
        id: 'test-agent',
        name: 'Test Agent',
        mbti: 'INFP',
        schedule: 'blacksmith',
      });

      const profile = engine.domain.semanticProfile;

      expect(profile).toBeDefined();
      expect(profile.language).toBe('zh-CN');
      expect(profile.emotionKeywords.happy).toContain('开心');
      expect(profile.emotionKeywords.sad).toContain('难过');

      expect(profile.defaultSemanticCategories.keywordMap['工作劳动']).toContain('打铁');
      expect(profile.defaultSemanticCategories.keywordMap['工作劳动']).toContain('锻造');
    });

    it('tavern engine tick works correctly with Chinese semantic profile', () => {
      const engine = new AndyEngine({ domain: tavernDomain });

      const agent = engine.createCharacter({
        id: 'test-agent',
        name: 'Test Agent',
        mbti: 'INFP',
        schedule: 'blacksmith',
      });

      for (let i = 0; i < 10; i++) {
        engine.tick();
      }

      expect(agent).toBeDefined();
      expect(agent.id).toBe('test-agent');

      const narrative = engine.getNarrative('test-agent');
      expect(narrative).toBeDefined();
      expect(typeof narrative).toBe('string');
      expect(narrative.length).toBeGreaterThan(0);
    });
  });

  describe('Custom Domain', () => {
    it('custom mini-domain does not contain Chinese fallback in semantic profile', () => {
      const customDomain = {
        id: 'custom-no-zh',
        name: 'Custom No Chinese Domain',
        version: '1.0.0',

        regions: ['home', 'office'],
        adjacency: [['home', 'office', 1]],
        regionCoords: {
          home: { shape: 'rect', x: 0, y: 0, w: 100, h: 100 },
          office: { shape: 'rect', x: 200, y: 0, w: 100, h: 100 },
        },
        placeTypes: { rest: ['home'], work: ['office'] },
        states: {
          at_home: { next: ['at_office'], hours: [0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23], category: 'home' },
          at_office: { next: ['at_home'], hours: [8,9,10,11,12,13,14,15,16,17,18], category: 'active' },
        },
        stateCenters: {
          at_home: [0.3, 0.2, 0.4, 0.3],
          at_office: [0.7, 0.4, 0.8, 0.5],
        },
        roleArchetypes: { default: { schedule: [{ hour: 0, state: 'at_home', region: 'home' }] } },

        narrativeTemplates: {
          statePositionMap: {
            at_home: 'at home',
            at_office: 'at the office',
          },
          regionMap: {
            home: 'at home',
            office: 'at the office',
          },
        },

        semanticProfile: {
          language: 'en',
          emotionKeywords: {
            happy: ['happy', 'glad'],
            sad: ['sad', 'sorrowful'],
          },
          narrativeModifiers: {
            emotionLabels: {
              sadness: 'feeling down', loneliness: 'feeling lonely', frustration: 'feeling frustrated',
              nervousness: 'feeling anxious', boredom: 'feeling bored', anger: 'feeling irritated',
              fear: 'feeling uneasy',
              joy: 'feeling happy', contentment: 'feeling content', excitement: 'feeling excited',
              calm: 'feeling calm', hope: 'feeling hopeful',
            },
            needPhrases: {
              veryTired: 'very tired', tired: 'a bit tired', veryHungry: 'very hungry',
              hungry: 'a bit hungry', restless: 'feeling restless',
            },
            cognitivePhrases: {
              highStress: 'under a lot of pressure',
              distracted: 'having trouble focusing',
              wantsSocial: 'wanting to chat with someone',
              thinking: 'thinking about something',
              unwell: 'not feeling well',
            },
          },
          defaultSemanticCategories: {
            typeMap: {
              social: 'social_interaction',
              general: 'daily_matters',
            },
            keywordMap: {
              emotion_event: ['happy', 'sad'],
            },
            stateCategoryMap: {
              active: 'study_work',
              rest: 'quiet_rest',
            },
          },
        },
      };

      const engine = new AndyEngine({ domain: customDomain });

      engine.createCharacter({
        id: 'test-agent',
        name: 'Test Agent',
        mbti: 'INFP',
        schedule: 'default',
      });

      for (let i = 0; i < 10; i++) {
        engine.tick();
      }

      const narrative = engine.getNarrative('test-agent');

      const chineseRegex = /[\u4e00-\u9fff]/;
      expect(chineseRegex.test(narrative)).toBe(false);

      const domain = engine.domain;
      const profile = domain.semanticProfile;
      expect(profile.language).toBe('en');
      expect(profile.emotionKeywords.happy).toContain('happy');
      expect(profile.emotionKeywords.happy).not.toContain('开心');
    });

    it('custom domain with partial semanticProfile does not fallback to campus Chinese', () => {
      const customDomain = {
        id: 'custom-partial',
        name: 'Custom Partial Domain',
        version: '1.0.0',

        regions: ['home', 'office'],
        adjacency: [['home', 'office', 1]],
        regionCoords: {
          home: { shape: 'rect', x: 0, y: 0, w: 100, h: 100 },
          office: { shape: 'rect', x: 200, y: 0, w: 100, h: 100 },
        },
        placeTypes: { rest: ['home'], work: ['office'] },
        states: {
          at_home: { next: ['at_office'], hours: [0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23], category: 'home' },
          at_office: { next: ['at_home'], hours: [8,9,10,11,12,13,14,15,16,17,18], category: 'active' },
        },
        stateCenters: {
          at_home: [0.3, 0.2, 0.4, 0.3],
          at_office: [0.7, 0.4, 0.8, 0.5],
        },
        roleArchetypes: { default: { schedule: [{ hour: 0, state: 'at_home', region: 'home' }] } },

        semanticProfile: {
          language: 'en',
          emotionKeywords: {
            happy: ['happy', 'glad'],
          },
        },
      };

      const engine = new AndyEngine({ domain: customDomain });

      const domain = engine.domain;
      const profile = domain.semanticProfile;

      expect(profile.language).toBe('en');
      expect(profile.emotionKeywords.happy).toContain('happy');
      expect(profile.emotionKeywords.happy).not.toContain('开心');
    });
  });
});
