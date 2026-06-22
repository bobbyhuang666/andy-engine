/**
 * AffectFrame seam tests (A4.3 + A4.2)
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { buildAffectFrame } from '../src/shared/AffectFrame.js';
import NarrativeBuilder from '../src/sdk/NarrativeBuilder.js';
import Personality from '../src/agent/psychology/Personality.js';
import EmotionVector from '../src/agent/psychology/EmotionVector.js';
import NeedsSystem from '../src/agent/psychology/NeedsSystem.js';
import { BehaviorField } from '../src/agent/psychology/BehaviorField.js';

function createMockAgent() {
  const personality = new Personality({ mbti: 'INFP' });
  const emotion = new EmotionVector(personality);
  const needs = new NeedsSystem(personality);
  const behaviorField = new BehaviorField(personality);

  emotion.applyEffect({ joy: 0.3, sadness: -0.1 });

  return { emotion, needs, behaviorField };
}

describe('AffectFrame seam (A4.3)', () => {
  let agent;

  beforeEach(() => {
    agent = createMockAgent();
  });

  it('buildAffectFrame returns correct shape from a real agent', () => {
    const frame = buildAffectFrame(agent);
    expect(frame).toBeDefined();
    expect(frame).toHaveProperty('emotions');
    expect(frame).toHaveProperty('valence');
    expect(frame).toHaveProperty('arousal');
    expect(frame).toHaveProperty('needs');
    expect(frame).toHaveProperty('behavior');
    expect(frame).toHaveProperty('behaviorSpeed');
    expect(frame).toHaveProperty('stability');
    expect(frame).toHaveProperty('_meta');
  });

  it('emotions array has dimension + intensity', () => {
    const frame = buildAffectFrame(agent);
    expect(Array.isArray(frame.emotions)).toBe(true);
    for (const e of frame.emotions) {
      expect(e).toHaveProperty('dimension');
      expect(e).toHaveProperty('intensity');
      expect(typeof e.dimension).toBe('string');
      expect(typeof e.intensity).toBe('number');
    }
  });

  it('valence is between -1 and 1', () => {
    const frame = buildAffectFrame(agent);
    expect(frame.valence).toBeGreaterThanOrEqual(-1);
    expect(frame.valence).toBeLessThanOrEqual(1);
  });

  it('arousal is between 0 and 1', () => {
    const frame = buildAffectFrame(agent);
    expect(frame.arousal).toBeGreaterThanOrEqual(0);
    expect(frame.arousal).toBeLessThanOrEqual(1);
  });

  it('needs array contains objects with need + urgency', () => {
    const frame = buildAffectFrame(agent);
    expect(Array.isArray(frame.needs)).toBe(true);
    for (const n of frame.needs) {
      expect(n).toHaveProperty('need');
      expect(n).toHaveProperty('urgency');
      expect(typeof n.need).toBe('string');
      expect(typeof n.urgency).toBe('number');
      expect(n.urgency).toBeGreaterThanOrEqual(0);
      expect(n.urgency).toBeLessThanOrEqual(1);
    }
  });

  it('behavior object has 4 keys', () => {
    const frame = buildAffectFrame(agent);
    expect(frame.behavior).toHaveProperty('activity');
    expect(frame.behavior).toHaveProperty('sociality');
    expect(frame.behavior).toHaveProperty('focus');
    expect(frame.behavior).toHaveProperty('expressiveness');
  });

  it('handles null agent gracefully', () => {
    const frame = buildAffectFrame(null);
    expect(frame.emotions).toEqual([]);
    expect(frame.valence).toBe(0);
    expect(frame.arousal).toBe(0.5);
    expect(frame._meta.version).toBe('0.1-seam');
  });
});

describe('NarrativeBuilder with affectFrame seam (A4.2)', () => {
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
      characterName: 'Maya',
    });
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
    expect(result).toContain('Maya');
  });

  it('buildSystemPrompt works with affectFrame option', () => {
    const affectFrame = buildAffectFrame(agent);
    const worldContext = {
      hour: 14,
      season: 'spring',
      weather: 'sunny',
      currentRegion: '图书馆',
    };
    const result = NarrativeBuilder.buildSystemPrompt(worldContext, {
      characterName: 'Maya',
      affectFrame,
    });
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
    expect(result).toContain('Maya');
  });

  it('NarrativeBuilder with affectFrame produces compatible output', () => {
    const affectFrame = buildAffectFrame(agent);
    const worldContext = {
      hour: 14,
      season: 'spring',
      weather: 'sunny',
      currentRegion: '图书馆',
    };
    const withFrame = NarrativeBuilder.buildSystemPrompt(worldContext, {
      characterName: 'Maya',
      affectFrame,
    });
    const withoutFrame = NarrativeBuilder.buildSystemPrompt(worldContext, {
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
