/**
 * NarrativeBuilder integration with AffectCompiler.compile()
 *
 * Migrated from tests/affect-frame-seam.test.js after removing the
 * buildAffectFrame / buildBasicAffectFrame seam modules.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { compile } from '../../src/agent/psychology/AffectCompiler.js';
import NarrativeBuilder from '../../src/sdk/NarrativeBuilder.js';
import Personality from '../../src/agent/psychology/Personality.js';
import EmotionVector from '../../src/agent/psychology/EmotionVector.js';
import NeedsSystem from '../../src/agent/psychology/NeedsSystem.js';
import { BehaviorField } from '../../src/agent/psychology/BehaviorField.js';
import { getDefaultDomain } from '../../src/domain/DomainRegistry.js';

const campusDomain = getDefaultDomain();

function createMockAgent() {
  const personality = new Personality({ mbti: 'INFP' });
  const emotion = new EmotionVector(personality);
  const needs = new NeedsSystem(personality, null, campusDomain);
  const behaviorField = new BehaviorField(personality, null, {}, campusDomain);

  emotion.applyEffect({ joy: 0.3, sadness: -0.1 });

  return { emotion, needs, behaviorField };
}

describe('NarrativeBuilder with AffectCompiler (migrated from seam)', () => {
  let agent;

  beforeEach(() => {
    agent = createMockAgent();
  });

  it('buildSystemPrompt works without affectFrame (backward compatible)', () => {
    const worldContext = {
      hour: 14,
      season: 'spring',
      weather: 'sunny',
      currentRegion: '图书馆',
      needsState: agent.needs.toPromptString(),
      emotionState: agent.emotion.toPromptString(),
    };
    const result = NarrativeBuilder.buildSystemPrompt(worldContext, {
      domain: campusDomain,
      characterName: 'Maya',
    });
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
    expect(result).toContain('Maya');
  });

  it('buildSystemPrompt works with affectFrame from AffectCompiler.compile()', () => {
    const affectFrame = compile({ emotion: agent.emotion, needs: agent.needs, behaviorField: agent.behaviorField });
    const worldContext = {
      hour: 14,
      season: 'spring',
      weather: 'sunny',
      currentRegion: '图书馆',
    };
    const result = NarrativeBuilder.buildSystemPrompt(worldContext, {
      domain: campusDomain,
      characterName: 'Maya',
      affectFrame,
    });
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
    expect(result).toContain('Maya');
  });

  it('NarrativeBuilder with affectFrame produces compatible output', () => {
    const affectFrame = compile({ emotion: agent.emotion, needs: agent.needs, behaviorField: agent.behaviorField });
    const worldContext = {
      hour: 14,
      season: 'spring',
      weather: 'sunny',
      currentRegion: '图书馆',
    };
    const withFrame = NarrativeBuilder.buildSystemPrompt(worldContext, {
      domain: campusDomain,
      characterName: 'Maya',
      affectFrame,
    });
    const withoutFrame = NarrativeBuilder.buildSystemPrompt(worldContext, {
      domain: campusDomain,
      characterName: 'Maya',
      needsState: agent.needs.toPromptString(),
      emotionState: agent.emotion.toPromptString(),
    });

    // Both should be valid strings with similar structure
    expect(typeof withFrame).toBe('string');
    expect(typeof withoutFrame).toBe('string');
    // Both should contain the identity section
    expect(withFrame).toContain('你是Maya');
    expect(withoutFrame).toContain('你是Maya');
    // Both should contain the current situation section
    expect(withFrame).toContain('你现在的情况');
    expect(withoutFrame).toContain('你现在的情况');
  });
});
