import { describe, it, expect } from 'vitest';
const AndyEngine = require('../index');
const { applyForbiddenTerms } = require('../src/domain/ForbiddenTerms');
const { NarrativeBuilder } = require('../sdk');
const tavern = require('../presets/tavern');

const CAMPUS_WORDS = [
  '教室', '教学楼', '实验室', '自习室', '图书馆',
  '校园广场', '操场', '体育馆', '宿舍', '学生宿舍',
  '食堂', '学生食堂', '大学', '学院', '校区',
  '学生', '大学生', '研究生', '老师', '教授',
  '上课', '下课', '自习', '翘课', '逃课',
  '考试', '论文', '作业',
];

function containsCampusWords(text) {
  const found = [];
  for (const word of CAMPUS_WORDS) {
    if (text.includes(word)) {
      found.push(word);
    }
  }
  return found;
}

describe('WorldviewConstraints & Pollution Prevention', () => {
  describe('applyForbiddenTerms', () => {
    it('redacts forbidden terms case-insensitively while treating terms as literals', () => {
      const domain = { forbiddenTerms: ['Campus', 'C++'] };
      const text = 'campus CAMPUS Campus C++ c++';

      expect(applyForbiddenTerms(text, domain)).toBe('*** *** *** *** ***');
    });
  });

  describe('Agent.toNarrative() with custom domain', () => {
    it('should generate clean narrative containing no unallowlisted campus words in tavern domain', () => {
      const engine = new AndyEngine({ domain: tavern });
      const agent = engine.createCharacter({
        id: 'test_npc',
        name: '测试角色',
        schedule: 'blacksmith',
      });

      for (let i = 0; i < 5; i++) {
        engine.tick();
      }

      const narrative = agent.toNarrative();
      const violations = containsCampusWords(narrative);
      expect(violations.length).toBe(0);
    });

    it('uses custom domain stateCenters for behavior-dynamics narrative', () => {
      const customDomain = {
        id: 'narrative-dynamics',
        name: 'Narrative Dynamics',
        version: '1.0.0',
        description: 'minimal custom domain',
        states: {
          crafting: { category: 'active', next: ['crafting'] },
        },
        stateCenters: {
          crafting: [0.8, 0.2, 0.9, 0.3],
        },
        regions: ['workshop'],
        adjacency: [],
        narrativeTemplates: {
          statePositionMap: { crafting: '在工坊专心制作' },
        },
        fallback: { defaultRegion: 'workshop', defaultState: 'crafting' },
      };
      const engine = new AndyEngine({ domain: customDomain });
      const agent = engine.createCharacter({
        id: 'artisan',
        name: 'Artisan',
        initialPosition: 'workshop',
        initialState: 'crafting',
      });
      agent.behaviorField.B[2] = 0.2;

      const narrative = agent.toNarrative();
      expect(narrative).toContain('心思不太集中');
    });
  });

  describe('NarrativeBuilder under custom domain constraints', () => {
    it('should sanitize prompt templates using domain forbiddenTerms', () => {
      const ctx = {
        hour: 14,
        weather: 'sunny',
        season: 'spring',
        currentRegion: '教室', // Bad input containing forbidden term
        needsState: '需求：饱腹充足，精力饱满。',
        emotionState: '平静的情绪主导着你的心境。',
        personalityAnchor: '你性格内向。',
        health: 100,
      };

      const prompt = NarrativeBuilder.buildSystemPrompt(ctx, { 
        characterName: 'Test',
        domain: engine => {}, // placeholder
      });
      // Test direct application on the registry wrapper
      const { DomainRegistry } = require('../src/domain/DomainRegistry');
      const registry = new DomainRegistry(tavern);
      
      const customPrompt = NarrativeBuilder.buildSystemPrompt(ctx, {
        characterName: 'Test',
        domain: registry
      });
      
      const violations = containsCampusWords(customPrompt);
      // '教室' is forbidden in tavern, so it should be replaced by '***'
      expect(violations).not.toContain('教室');
      expect(customPrompt).toContain('***');
    });
  });

  describe('Nighttime sleep narrative in tavern domain', () => {
    it('should not place sleeping agents in public spaces like square/street', () => {
      const engine = new AndyEngine({
        startTime: new Date('2025-06-01T02:00:00'), // 2 AM
        domain: tavern,
      });

      const agent = engine.createCharacter({
        id: 'sleeper',
        name: '夜猫子',
        schedule: 'drunkard',
        initialPosition: '小屋',
        initialState: '睡觉',
      });

      engine.tick();

      const narrative = agent.toNarrative();
      const violations = containsCampusWords(narrative);
      expect(violations.length).toBe(0);

      const badSleepPlaces = ['广场', '森林', '酒馆'];
      const hasBadSleepPlace = badSleepPlaces.some(place => narrative.includes(place));
      expect(hasBadSleepPlace).toBe(false);
      // Agent should be in a private/rest location at 2am, not in public spaces
      expect(narrative).toMatch(/在小屋|在睡觉|休息|睡了/);
    });
  });

  describe('Long-term simulation stability scan in tavern domain', () => {
    it('should remain clean over 50 ticks of execution', () => {
      const engine = new AndyEngine({ domain: tavern });
      const agent = engine.createCharacter({
        id: 'stable_npc',
        name: '稳定测试',
        schedule: 'blacksmith',
      });

      for (let i = 0; i < 50; i++) {
        engine.tick();
        const narrative = agent.toNarrative();
        const violations = containsCampusWords(narrative);
        expect(violations.length).toBe(0);
      }
    });
  });
});
