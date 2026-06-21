/**
 * Domain-Safe Behavior Label Initialization Tests
 *
 * Validates that BehaviorField and BehaviorLabeler use domain-driven
 * fallbacks instead of hardcoded campus-specific labels.
 */

import { describe, it, expect } from 'vitest';
import { BehaviorField } from '../../src/agent/psychology/BehaviorField.js';
import { BehaviorLabeler } from '../../src/agent/psychology/BehaviorLabeler.js';
import { DomainRegistry } from '../../src/domain/DomainRegistry.js';

// Minimal domain for testing
const minimalDomain = {
  id: 'minimal',
  name: 'Minimal Domain',
  version: '1.0.0',
  regions: ['base'],
  adjacency: [],
  regionCoords: { base: { shape: 'rect', x: 0, y: 0, w: 10, h: 10 } },
  states: {
    'idle': { next: ['active'], hours: Array.from({ length: 24 }, (_, i) => i), category: 'rest' },
    'active': { next: ['idle'], hours: Array.from({ length: 24 }, (_, i) => i), category: 'active' },
  },
  stateCenters: {
    'idle': [0.1, 0.1, 0.1, 0.1],
    'active': [0.8, 0.5, 0.7, 0.5],
  },
  fallback: {
    defaultRegion: 'base',
    defaultState: 'idle',
    unknownState: 'idle',
    unknownRegion: 'base',
  },
};

// Tavern domain
import tavernDomain from '../../presets/tavern/index.js';

// Campus domain
import campusDomain from '../../presets/campus/index.js';

// Mock personality
const mockPersonality = {
  ocean: {
    neuroticism: 0.5,
    extraversion: 0.5,
    openness: 0.5,
    conscientiousness: 0.5,
    agreeableness: 0.5,
  },
};

describe('Domain-Safe Behavior Label Initialization', () => {
  describe('BehaviorField default label', () => {
    it('campus: should use campus fallback defaultState', () => {
      const domain = new DomainRegistry(campusDomain);
      const field = new BehaviorField(mockPersonality, null, {}, domain);

      // Should be from campus states
      const campusStates = Object.keys(campusDomain.states);
      expect(campusStates).toContain(field.label);
      // Should be the campus fallback defaultState
      expect(field.label).toBe(campusDomain.fallback.defaultState);
    });

    it('tavern: should use tavern fallback defaultState', () => {
      const domain = new DomainRegistry(tavernDomain);
      const field = new BehaviorField(mockPersonality, null, {}, domain);

      // Should be from tavern states
      const tavernStates = Object.keys(tavernDomain.states);
      expect(tavernStates).toContain(field.label);
      // Should be the tavern fallback defaultState
      expect(field.label).toBe(tavernDomain.fallback.defaultState);
      // Should NOT contain campus-specific words
      expect(field.label).not.toContain('在');
      expect(field.label).not.toContain('图书馆');
    });

    it('minimal: should use minimal domain fallback defaultState', () => {
      const domain = new DomainRegistry(minimalDomain, { validate: false });
      const field = new BehaviorField(mockPersonality, null, {}, domain);

      expect(field.label).toBe('idle');
    });
  });

  describe('BehaviorField restore from snapshot', () => {
    it('campus: should keep valid saved _lastLabel', () => {
      const domain = new DomainRegistry(campusDomain);
      const savedState = {
        B: [0.5, 0.5, 0.5, 0.5],
        velocity: [0, 0, 0, 0],
        _lastLabel: '在食堂',
        _tickCount: 10,
      };
      const field = new BehaviorField(mockPersonality, savedState, {}, domain);

      expect(field.label).toBe('在食堂');
    });

    it('campus: should fallback on invalid saved _lastLabel', () => {
      const domain = new DomainRegistry(campusDomain);
      const savedState = {
        B: [0.5, 0.5, 0.5, 0.5],
        velocity: [0, 0, 0, 0],
        _lastLabel: 'drinking_at_tavern', // Not in campus domain
        _tickCount: 10,
      };
      const field = new BehaviorField(mockPersonality, savedState, {}, domain);

      // Should fallback to campus defaultState
      expect(field.label).toBe(campusDomain.fallback.defaultState);
      const campusStates = Object.keys(campusDomain.states);
      expect(campusStates).toContain(field.label);
    });

    it('tavern: should keep valid tavern label on restore', () => {
      const domain = new DomainRegistry(tavernDomain);
      const savedState = {
        B: [0.5, 0.5, 0.5, 0.5],
        velocity: [0, 0, 0, 0],
        _lastLabel: '喝酒',
        _tickCount: 10,
      };
      const field = new BehaviorField(mockPersonality, savedState, {}, domain);

      expect(field.label).toBe('喝酒');
    });

    it('tavern: should replace campus label with tavern fallback', () => {
      const domain = new DomainRegistry(tavernDomain);
      const savedState = {
        B: [0.5, 0.5, 0.5, 0.5],
        velocity: [0, 0, 0, 0],
        _lastLabel: '在图书馆', // Campus label in tavern domain
        _tickCount: 10,
      };
      const field = new BehaviorField(mockPersonality, savedState, {}, domain);

      // Should fallback to tavern defaultState
      expect(field.label).toBe(tavernDomain.fallback.defaultState);
      const tavernStates = Object.keys(tavernDomain.states);
      expect(tavernStates).toContain(field.label);
    });
  });

  describe('BehaviorLabeler fallback', () => {
    it('campus: should return campus fallback for invalid B', () => {
      const labeler = BehaviorLabeler.create(new DomainRegistry(campusDomain));
      const result = labeler.project(null);

      // BehaviorLabelerDomain uses unknownState for invalid inputs
      expect(result.primary).toBe(campusDomain.fallback.unknownState);
      const campusStates = Object.keys(campusDomain.states);
      expect(campusStates).toContain(result.primary);
    });

    it('tavern: should return tavern fallback for invalid B', () => {
      const labeler = BehaviorLabeler.create(new DomainRegistry(tavernDomain));
      const result = labeler.project(null);

      // BehaviorLabelerDomain uses unknownState for invalid inputs
      expect(result.primary).toBe(tavernDomain.fallback.unknownState);
      const tavernStates = Object.keys(tavernDomain.states);
      expect(tavernStates).toContain(result.primary);
      // Should NOT contain campus-specific words
      expect(result.primary).not.toBe('在发呆');
      expect(result.primary).not.toBe('在图书馆');
    });

    it('minimal: should return minimal fallback for invalid B', () => {
      const labeler = BehaviorLabeler.create(new DomainRegistry(minimalDomain, { validate: false }));
      const result = labeler.project(null);

      expect(result.primary).toBe('idle');
    });

    it('campus static: should return campus fallback for invalid B', () => {
      const result = BehaviorLabeler.project(null);

      // Static method uses defaultDomain which is campus
      const campusStates = Object.keys(campusDomain.states);
      expect(campusStates).toContain(result.primary);
    });
  });

  describe('Domain safety validation', () => {
    it('campus labels should all be from campus states', () => {
      const domain = new DomainRegistry(campusDomain);
      const field = new BehaviorField(mockPersonality, null, {}, domain);
      const campusStates = Object.keys(campusDomain.states);

      expect(campusStates).toContain(field.label);
    });

    it('tavern labels should all be from tavern states', () => {
      const domain = new DomainRegistry(tavernDomain);
      const field = new BehaviorField(mockPersonality, null, {}, domain);
      const tavernStates = Object.keys(tavernDomain.states);

      expect(tavernStates).toContain(field.label);
    });

    it('minimal labels should all be from minimal states', () => {
      const domain = new DomainRegistry(minimalDomain, { validate: false });
      const field = new BehaviorField(mockPersonality, null, {}, domain);
      const minimalStates = Object.keys(minimalDomain.states);

      expect(minimalStates).toContain(field.label);
    });
  });
});
