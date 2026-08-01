import { describe, it, expect } from 'vitest';
import { EvidenceBinder, SUPPORT } from '../../../../src/narrative/grounding/EvidenceBinder.js';
import GroundingChecker from '../../../../src/narrative/GroundingChecker.js';
import { observationAssertion } from '../../../../src/narrative/ObservationAssertion.js';

const observation = {
  id: 'fact_observation_1', type: 'observation', observerId: 'alice',
  targetId: 'bob', action: '在阅读', context: '图书馆',
};

function observationClaim(action = observation.action) {
  return {
    id: 'claim_observation', type: 'event', subject: 'alice', predicate: 'observed',
    object: observationAssertion('bob', action, '图书馆'), span: '察到鲍勃在阅读', confidence: 1,
  };
}

describe('direct observation evidence', () => {
  it('binds an exact allowed observation to its fact ID', () => {
    const result = new EvidenceBinder({ selfId: 'alice' }).bind([observationClaim()], [observation]);
    expect(result.bindings).toHaveLength(1);
    expect(result.bindings[0]).toMatchObject({
      support: SUPPORT.SUPPORTS, factId: 'fact_observation_1', evidenceSource: 'direct_observation',
    });
  });

  it('does not bind a changed observation assertion', () => {
    const result = new EvidenceBinder({ selfId: 'alice' }).bind([observationClaim('在睡觉')], [observation]);
    expect(result.bindings[0].support).toBe(SUPPORT.UNSUPPORTED);
    expect(result.bindings[0].factId).toBeNull();
  });

  it('checker accepts only the exact allowed observation sidecar', () => {
    const checker = new GroundingChecker(null, null);
    const grounding = { allowedFacts: [observation], metadata: { agentId: 'alice', agentNames: { alice: '爱丽丝', bob: '鲍勃' } } };
    expect(checker.check('我观察到鲍勃在阅读。', grounding, { structuredClaims: [observationClaim()] }).valid).toBe(true);
    const invalid = checker.check('我观察到鲍勃在睡觉。', grounding, { structuredClaims: [observationClaim('在睡觉')] });
    expect(invalid.valid).toBe(false);
    expect(invalid.violations.some(v => v.type === 'unsupported_claim')).toBe(true);
  });
});
