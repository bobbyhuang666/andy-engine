import { describe, it, expect } from 'vitest';
import NarrativeBuilder from '../../src/sdk/NarrativeBuilder.js';
import { getDefaultDomain } from '../../src/domain/DomainRegistry.js';

const campusDomain = getDefaultDomain();

describe('NarrativeBuilder Structured Context', () => {
  it('old sentinel string path still works', () => {
    const worldContext = {
      hour: 10,
      weather: 'sunny',
      season: 'spring',
      currentRegion: '宿舍',
      nearbyPeople: '附近没有人',
      recentEvents: '没有特别的事情发生',
      health: 80,
    };
    
    const prompt = NarrativeBuilder.buildSystemPrompt(worldContext, {
      domain: campusDomain,
      characterName: '测试角色',
    });
    
    expect(prompt).toContain('测试角色');
    expect(prompt).not.toContain('你身边的人');
    expect(prompt).not.toContain('最近的事');
  });
  
  it('old string content path still works', () => {
    const worldContext = {
      hour: 10,
      weather: 'sunny',
      season: 'spring',
      currentRegion: '宿舍',
      nearbyPeople: '小明（朋友，关系强度0.80）',
      recentEvents: '- 今天天气不错\n- 和朋友聊天',
      health: 80,
    };
    
    const prompt = NarrativeBuilder.buildSystemPrompt(worldContext, {
      domain: campusDomain,
      characterName: '测试角色',
    });
    
    expect(prompt).toContain('小明');
    expect(prompt).toContain('今天天气不错');
  });
  
  it('structured nearbyPeople path works', () => {
    const worldContext = {
      hour: 10,
      weather: 'sunny',
      season: 'spring',
      currentRegion: '宿舍',
      health: 80,
    };
    
    const nearbyPeopleArray = [
      { name: '小明', type: 'friend', strength: 0.8 },
      { name: '小红', type: 'acquaintance', strength: 0.3 },
    ];
    
    const prompt = NarrativeBuilder.buildSystemPrompt(worldContext, {
      domain: campusDomain,
      characterName: '测试角色',
      nearbyPeopleArray,
    });
    
    expect(prompt).toContain('小明');
    expect(prompt).toContain('小红');
    expect(prompt).toContain('你身边的人');
  });
  
  it('structured recentEvents path works', () => {
    const worldContext = {
      hour: 10,
      weather: 'sunny',
      season: 'spring',
      currentRegion: '宿舍',
      health: 80,
    };
    
    const recentEventsArray = [
      { content: '今天天气不错' },
      { content: '和朋友聊天' },
    ];
    
    const prompt = NarrativeBuilder.buildSystemPrompt(worldContext, {
      domain: campusDomain,
      characterName: '测试角色',
      recentEventsArray,
    });
    
    expect(prompt).toContain('今天天气不错');
    expect(prompt).toContain('和朋友聊天');
    expect(prompt).toContain('最近的事');
  });
  
  it('structured input takes priority over string', () => {
    const worldContext = {
      hour: 10,
      weather: 'sunny',
      season: 'spring',
      currentRegion: '宿舍',
      nearbyPeople: '旧数据',
      recentEvents: '旧事件',
      health: 80,
    };
    
    const nearbyPeopleArray = [{ name: '新朋友' }];
    const recentEventsArray = [{ content: '新事件' }];
    
    const prompt = NarrativeBuilder.buildSystemPrompt(worldContext, {
      domain: campusDomain,
      characterName: '测试角色',
      nearbyPeopleArray,
      recentEventsArray,
    });
    
    expect(prompt).toContain('新朋友');
    expect(prompt).toContain('新事件');
    expect(prompt).not.toContain('旧数据');
    expect(prompt).not.toContain('旧事件');
  });
  
  it('No public API shape change', () => {
    const worldContext = {
      hour: 10,
      weather: 'sunny',
      season: 'spring',
      currentRegion: '宿舍',
      nearbyPeople: '附近没有人',
      recentEvents: '没有特别的事情发生',
      health: 80,
    };
    
    const prompt1 = NarrativeBuilder.buildSystemPrompt(worldContext, {
      domain: campusDomain,
      characterName: '测试角色',
    });
    
    const prompt2 = NarrativeBuilder.buildSystemPrompt(worldContext, {
      domain: campusDomain,
      characterName: '测试角色',
      nearbyPeopleArray: [],
      recentEventsArray: [],
    });
    
    expect(prompt1).toContain('测试角色');
    expect(prompt2).toContain('测试角色');
  });
});
