/**
 * NarrativeBuilder Evidence-aware Grounding Tests (v2.5-W1)
 *
 * Verify that _buildGroundingSection groups facts by evidence source
 * and annotates each group with appropriate source labels.
 */
import { describe, it, expect } from 'vitest';
const { createRequire } = await import('node:module');
const require = createRequire(import.meta.url);
const NarrativeBuilder = require('../../../src/sdk/NarrativeBuilder.js');
const { FactType } = require('../../../src/canon/FactSchema.js');

describe('NarrativeBuilder — evidence-aware grounding (v2.5-W1)', () => {
  describe('_buildGroundingSection source grouping', () => {
    it('renders direct facts without source annotation', () => {
      const grounding = {
        allowedFacts: [
          { id: 'f1', type: FactType.EVENT, description: '直接事件', location: '图书馆', _evidence: { source: 'direct', confidence: 1.0, propagatedFrom: null } },
        ],
        inferredFacts: [],
      };

      const section = NarrativeBuilder._buildGroundingSection(grounding);
      expect(section).toContain('直接事件');
      // The fact line itself should not have source annotation suffix
      const factSection = section.split('# 你知道的事实')[1] || '';
      expect(factSection).not.toContain('（听闻）');
      expect(factSection).not.toContain('（推测）');
    });

    it('renders told facts with source annotation', () => {
      const grounding = {
        allowedFacts: [
          { id: 'f2', type: FactType.EVENT, description: '听说的事件', location: '食堂', _evidence: { source: 'told', confidence: 0.6, propagatedFrom: 'bob' } },
        ],
        inferredFacts: [],
      };

      const section = NarrativeBuilder._buildGroundingSection(grounding);
      expect(section).toContain('听说的事件');
      expect(section).toContain('bob告诉你');
    });

    it('renders overheard facts with source annotation', () => {
      const grounding = {
        allowedFacts: [
          { id: 'f3', type: FactType.EVENT, description: '旁听的事件', location: '图书馆', _evidence: { source: 'overheard', confidence: 0.7, propagatedFrom: null } },
        ],
        inferredFacts: [],
      };

      const section = NarrativeBuilder._buildGroundingSection(grounding);
      expect(section).toContain('旁听的事件');
      expect(section).toContain('（听闻）');
    });

    it('renders inferred facts with "推测" annotation', () => {
      const grounding = {
        allowedFacts: [
          { id: 'f4', type: FactType.EVENT, description: '推断的事件', location: '图书馆', _evidence: { source: 'inferred', confidence: 0.5, propagatedFrom: null } },
        ],
        inferredFacts: [],
      };

      const section = NarrativeBuilder._buildGroundingSection(grounding);
      expect(section).toContain('推断的事件');
      expect(section).toContain('（推测）');
    });

    it('renders observed facts without source annotation', () => {
      const grounding = {
        allowedFacts: [
          { id: 'f5', type: FactType.EVENT, description: '亲眼看到的事件', location: '图书馆', _evidence: { source: 'observed', confidence: 0.9, propagatedFrom: null } },
        ],
        inferredFacts: [],
      };

      const section = NarrativeBuilder._buildGroundingSection(grounding);
      expect(section).toContain('亲眼看到的事件');
      // The fact line itself should not have source annotation suffix
      const factSection = section.split('# 你知道的事实')[1] || '';
      expect(factSection).not.toContain('（听闻）');
      expect(factSection).not.toContain('（推测）');
    });

    it('groups facts by source with section headers', () => {
      const grounding = {
        allowedFacts: [
          { id: 'f1', type: FactType.EVENT, description: '直接事件', location: '图书馆', _evidence: { source: 'direct', confidence: 1.0, propagatedFrom: null } },
          { id: 'f2', type: FactType.EVENT, description: '听说事件', location: '食堂', _evidence: { source: 'told', confidence: 0.6, propagatedFrom: 'bob' } },
          { id: 'f3', type: FactType.EVENT, description: '推断事件', location: '图书馆', _evidence: { source: 'inferred', confidence: 0.5, propagatedFrom: null } },
        ],
        inferredFacts: [],
      };

      const section = NarrativeBuilder._buildGroundingSection(grounding);
      expect(section).toContain('直接事件');
      expect(section).toContain('听说事件');
      expect(section).toContain('推断事件');
      expect(section).toContain('bob告诉你');
      expect(section).toContain('（推测）');
    });

    it('renders facts without _evidence as direct (backward compat)', () => {
      const grounding = {
        allowedFacts: [
          { id: 'f_old', type: FactType.EVENT, description: '旧格式事件', location: '图书馆' },
        ],
        inferredFacts: [],
      };

      const section = NarrativeBuilder._buildGroundingSection(grounding);
      expect(section).toContain('旧格式事件');
    });

    it('updated constraint text mentions source attribution rules', () => {
      const grounding = {
        allowedFacts: [],
        inferredFacts: [],
      };

      const section = NarrativeBuilder._buildGroundingSection(grounding);
      expect(section).toContain('听闻');
      expect(section).toContain('推测');
    });
  });
});
