import { describe, it, expect } from 'vitest';
import AndyEngine from '../../index.js';

describe('Semantic Profile Integration', () => {
  it('custom domain with English semantic profile works correctly', () => {
    const customDomain = {
      id: 'custom-en',
      name: 'Custom English Domain',
      version: '1.0.0',
      
      regions: ['home', 'office', 'park', 'cafe'],
      adjacency: [
        ['home', 'office', 1],
        ['office', 'park', 1],
        ['park', 'cafe', 1],
      ],
      regionCoords: {
        home: { shape: 'rect', x: 0, y: 0, w: 100, h: 100 },
        office: { shape: 'rect', x: 200, y: 0, w: 100, h: 100 },
        park: { shape: 'rect', x: 100, y: 200, w: 100, h: 100 },
        cafe: { shape: 'rect', x: 300, y: 200, w: 100, h: 100 },
      },
      
      placeTypes: {
        food: ['cafe'],
        rest: ['home'],
        social: ['cafe', 'park'],
        work: ['office'],
        sleep: ['home'],
        explore: ['park'],
        outdoor: ['park'],
      },
      
      states: {
        'at_home': { next: ['at_office', 'at_park', 'at_cafe'], hours: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23], category: 'home' },
        'at_office': { next: ['at_home', 'at_park', 'at_cafe'], hours: [8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18], category: 'active' },
        'at_park': { next: ['at_home', 'at_office', 'at_cafe'], hours: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23], category: 'social' },
        'at_cafe': { next: ['at_home', 'at_office', 'at_park'], hours: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23], category: 'social' },
      },
      
      stateCenters: {
        'at_home': [0.3, 0.2, 0.4, 0.3],
        'at_office': [0.7, 0.4, 0.8, 0.5],
        'at_park': [0.6, 0.5, 0.3, 0.6],
        'at_cafe': [0.4, 0.7, 0.4, 0.7],
      },
      
      roleArchetypes: {
        worker: {
          schedule: [
            { hour: 8, state: 'at_office', region: 'office' },
            { hour: 12, state: 'at_cafe', region: 'cafe' },
            { hour: 18, state: 'at_home', region: 'home' },
          ],
        },
      },
      
      semanticProfile: {
        language: 'en',
        
        eventMeaningRules: [
          { keywords: ['rest', 'sleep', 'nap', 'relax'], meaningType: 'rest', weight: 0.3 },
          { keywords: ['work', 'study', 'research', 'focus', 'task'], meaningType: 'work', weight: 0.3 },
          { keywords: ['chat', 'social', 'gathering', 'date', 'conversation'], meaningType: 'social', weight: 0.3 },
          { keywords: ['exercise', 'run', 'workout', 'fitness'], meaningType: 'exercise', weight: 0.2 },
          { keywords: ['eat', 'lunch', 'dinner', 'breakfast', 'meal', 'food'], meaningType: 'dining', weight: 0.2 },
        ],
        
        emotionKeywords: {
          happy: ['happy', 'glad', 'joyful', 'pleased', 'excited', 'delighted'],
          sad: ['sad', 'sorrowful', 'gloomy', 'dejected', 'down'],
          angry: ['angry', 'furious', 'irritated', 'annoyed'],
          fear: ['afraid', 'scared', 'nervous', 'anxious', 'worried'],
          surprise: ['surprised', 'astonished', 'shocked'],
          disgust: ['disgusted', 'nauseated', 'repulsed'],
        },
        
        tendencyRules: [
          { keywords: ['rest', 'sleep', 'nap'], delta: [-0.3, -0.2, 0, 0] },
          { keywords: ['work', 'study', 'research'], delta: [0.3, 0, 0.4, 0] },
          { keywords: ['chat', 'social', 'gathering'], delta: [0, 0.4, 0, 0.3] },
          { keywords: ['exercise', 'run', 'workout'], delta: [0.4, 0, 0, 0.2] },
          { keywords: ['eat', 'lunch', 'dinner'], delta: [0.1, 0.2, 0, 0] },
        ],
        
        defaultSemanticCategories: {
          typeMap: {
            social: 'social_interaction',
            weather: 'environment_weather',
            state_change: 'behavior_change',
            regulation: 'emotion_regulation',
            mind_wander: 'inner_thoughts',
            need_satisfied: 'need_satisfaction',
            intrinsic: 'self_exploration',
            gossip: 'social_information',
            encounter: 'social_interaction',
            general: 'daily_matters',
            deviant: 'deviation_from_norm',
            illness: 'physical_discomfort',
          },
          keywordMap: {
            'emotion_event': ['happy', 'sad', 'angry', 'afraid', 'surprised', 'moved', 'wronged', 'anxious', 'excited', 'down', 'empty', 'sad', 'lonely', 'sorrowful', 'joyful', 'glad'],
            'learning_growth': ['interesting_book', 'interesting_topic', 'found', 'discovered', 'new_discovery', 'learning', 'learned'],
            'social_interaction': ['chat', 'friend', 'share', 'encourage', 'together', 'meet', 'greet', 'talk', 'mention', 'couple', 'argue'],
            'environment_weather': ['rain', 'weather', 'sunshine', 'cold', 'hot', 'sunny', 'wet', 'rain_sound'],
            'food_enjoyment': ['delicious', 'new_dish', 'eat', 'coffee', 'snack', 'taste', 'midnight_snack'],
            'work_labor': ['part_time', 'work', 'office', 'off_work', 'meeting'],
            'leisure_entertainment': ['watch_show', 'movie', 'game', 'music', 'song', 'tv', 'sing'],
            'nature_scenery': ['flower', 'scenery', 'sunset', 'sky', 'moon', 'stars', 'fresh', 'park'],
            'daily_chores': ['phone', 'charge', 'wifi', 'task', 'push', 'battery'],
            'physical_feeling': ['tired', 'exhausted', 'itchy', 'mosquito', 'puddle', 'sunburn'],
            'inner_reflection': ['remember', 'recall', 'childhood', 'thoughts', 'daydream', 'past'],
            'late_night': ['midnight', 'dawn', 'night'],
            'embarrassment': ['embarrassed', 'ashamed', 'blushing'],
            'physical_discomfort': ['unwell', 'headache', 'cold', 'fever', 'sick', 'weak', 'take_break', 'rest'],
            'deviation_from_norm': ['skip_class', 'dont_want_work', 'wander', 'procrastinate', 'stay_up_late'],
          },
          stateCategoryMap: {
            active: 'study_work',
            social: 'social_interaction',
            quiet: 'quiet_rest',
            rest: 'quiet_rest',
            leisure: 'leisure_entertainment',
            home: 'home_life',
            lateNight: 'late_night',
            transit: 'daily_commute',
            morning: 'daily_life',
            break: 'break_time',
            sleep: 'sleep_rest',
            deviant: 'deviation_from_norm',
            illness: 'physical_discomfort',
          },
        },
      },
    };
    
    const engine = new AndyEngine({ domain: customDomain });
    
    const agent = engine.createCharacter({
      id: 'test-agent',
      name: 'Test Agent',
      mbti: 'INFP',
      schedule: 'worker',
    });
    
    engine.tick();
    
    expect(agent).toBeDefined();
    expect(agent.id).toBe('test-agent');
    
    const domain = engine.domain;
    expect(domain.semanticProfile).toBeDefined();
    expect(domain.semanticProfile.language).toBe('en');
    expect(domain.semanticProfile.emotionKeywords.happy).toContain('happy');
  });
  
  it('custom domain uses domain-specific state names in narrative', () => {
    const customDomain = {
      id: 'custom-en',
      name: 'Custom English Domain',
      version: '1.0.0',
      
      regions: ['home', 'office', 'park', 'cafe'],
      adjacency: [
        ['home', 'office', 1],
        ['office', 'park', 1],
        ['park', 'cafe', 1],
      ],
      regionCoords: {
        home: { shape: 'rect', x: 0, y: 0, w: 100, h: 100 },
        office: { shape: 'rect', x: 200, y: 0, w: 100, h: 100 },
        park: { shape: 'rect', x: 100, y: 200, w: 100, h: 100 },
        cafe: { shape: 'rect', x: 300, y: 200, w: 100, h: 100 },
      },
      
      placeTypes: {
        food: ['cafe'],
        rest: ['home'],
        social: ['cafe', 'park'],
        work: ['office'],
        sleep: ['home'],
        explore: ['park'],
        outdoor: ['park'],
      },
      
      states: {
        'at_home': { next: ['at_office', 'at_park', 'at_cafe'], hours: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23], category: 'home' },
        'at_office': { next: ['at_home', 'at_park', 'at_cafe'], hours: [8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18], category: 'active' },
        'at_park': { next: ['at_home', 'at_office', 'at_cafe'], hours: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23], category: 'social' },
        'at_cafe': { next: ['at_home', 'at_office', 'at_park'], hours: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23], category: 'social' },
      },
      
      stateCenters: {
        'at_home': [0.3, 0.2, 0.4, 0.3],
        'at_office': [0.7, 0.4, 0.8, 0.5],
        'at_park': [0.6, 0.5, 0.3, 0.6],
        'at_cafe': [0.4, 0.7, 0.4, 0.7],
      },
      
      roleArchetypes: {
        worker: {
          schedule: [
            { hour: 8, state: 'at_office', region: 'office' },
            { hour: 12, state: 'at_cafe', region: 'cafe' },
            { hour: 18, state: 'at_home', region: 'home' },
          ],
        },
      },
      
      narrativeTemplates: {
        statePositionMap: {
          'at_home': 'at home',
          'at_office': 'at office',
          'at_park': 'at the park',
          'at_cafe': 'at the cafe',
        },
        regionMap: {
          'home': 'at home',
          'office': 'at the office',
          'park': 'at the park',
          'cafe': 'at the cafe',
        },
      },
      
      semanticProfile: {
        language: 'en',
        eventMeaningRules: [
          { keywords: ['rest', 'sleep', 'nap', 'relax'], meaningType: 'rest', weight: 0.3 },
          { keywords: ['work', 'study', 'research', 'focus', 'task'], meaningType: 'work', weight: 0.3 },
          { keywords: ['chat', 'social', 'gathering', 'date', 'conversation'], meaningType: 'social', weight: 0.3 },
        ],
        emotionKeywords: {
          happy: ['happy', 'glad', 'joyful', 'pleased', 'excited'],
          sad: ['sad', 'sorrowful', 'gloomy', 'dejected'],
          angry: ['angry', 'furious', 'irritated', 'annoyed'],
        },
        narrativeModifiers: {
          needPhrases: {
            veryTired: 'very tired',
            tired: 'a bit tired',
            veryHungry: 'very hungry',
            hungry: 'a bit hungry',
            restless: 'feeling restless',
          },
          emotionLabels: {
            sadness: 'feeling down',
            loneliness: 'feeling lonely',
            frustration: 'feeling frustrated',
            nervousness: 'feeling anxious',
            boredom: 'feeling bored',
            anger: 'feeling irritated',
            fear: 'feeling uneasy',
            joy: 'feeling happy',
            contentment: 'feeling content',
            excitement: 'feeling excited',
            calm: 'feeling calm',
            hope: 'feeling hopeful',
          },
          cognitivePhrases: {
            highStress: 'under a lot of pressure',
            thinking: 'thinking about something',
            unwell: 'not feeling well',
            distracted: 'having trouble focusing',
            wantsSocial: 'wanting to chat with someone',
          },
        },
        defaultSemanticCategories: {
          typeMap: {
            social: 'social_interaction',
            general: 'daily_matters',
          },
          keywordMap: {
            'emotion_event': ['happy', 'sad', 'angry'],
          },
          stateCategoryMap: {
            active: 'study_work',
            rest: 'quiet_rest',
          },
        },
      },
    };
    
    const engine = new AndyEngine({ domain: customDomain });
    
    const agent = engine.createCharacter({
      id: 'test-agent',
      name: 'Test Agent',
      mbti: 'INFP',
      schedule: 'worker',
    });
    
    for (let i = 0; i < 5; i++) {
      engine.tick();
    }
    
    const narrative = engine.getNarrative('test-agent');
    
    expect(narrative).toBeDefined();
    expect(typeof narrative).toBe('string');
    
    const domain = engine.domain;
    expect(domain.semanticProfile.language).toBe('en');
    expect(domain.narrativeTemplates.statePositionMap['at_home']).toBe('at home');
    expect(domain.narrativeTemplates.statePositionMap['at_office']).toBe('at office');
  });
});
