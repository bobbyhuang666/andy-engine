import { describe, expect, it } from 'vitest';

const { createRequire } = await import('node:module');
const require = createRequire(import.meta.url);

const FactConsistencyChecker = require('../../../src/narrative/FactConsistencyChecker.js');

function grounding(allowedFacts = []) {
  return {
    allowedFacts,
    inferredFacts: [],
    forbiddenFacts: [],
    metadata: {
      agentId: 'alice',
      agentNames: { alice: '爱丽丝', bob: '鲍勃' },
      currentTime: '2026-09-01T12:00:00.000Z',
    },
  };
}

const SMOKE_CASES = [
  {
    name: 'allows a supported self-location claim',
    output: '我在图书馆看书。',
    grounding: grounding([
      { type: 'agent_state', agentId: 'alice', position: '图书馆' },
    ]),
    severity: 'pass',
    violations: [],
  },
  {
    name: 'allows a source-attributed event with evidence',
    output: '鲍勃告诉我他去了图书馆',
    grounding: grounding([
      {
        type: 'event',
        description: '鲍勃去了图书馆',
        location: '图书馆',
        participants: ['bob'],
        _evidence: { source: 'told', confidence: 0.6, propagatedFrom: 'bob' },
      },
    ]),
    severity: 'pass',
    violations: [],
  },
  {
    name: 'rewrites an unsupported attributed claim',
    output: '听说鲍勃在图书馆',
    grounding: grounding(),
    severity: 'rewrite',
    violations: ['unsupported_claim'],
  },
  {
    name: 'rewrites an unsupported character claim',
    output: '查理在图书馆',
    grounding: grounding(),
    severity: 'rewrite',
    violations: ['unsupported_claim'],
  },
  {
    name: 'detects an unknown location',
    output: '我在月球基地',
    grounding: grounding([{ type: 'agent_state', agentId: 'alice' }]),
    severity: 'rewrite',
    violations: ['unsupported_claim', 'unknown_location'],
  },
  {
    name: 'rejects a newly invented event',
    output: '我刚刚赢得了比赛',
    grounding: grounding([{ type: 'agent_state', agentId: 'alice' }]),
    severity: 'reject',
    violations: ['new_event'],
  },
];

describe('Grounding public smoke matrix', () => {
  const checker = new FactConsistencyChecker({}, {
    regions: ['图书馆', '食堂', '宿舍'],
  });

  it.each(SMOKE_CASES)('$name', ({ output, grounding: input, severity, violations }) => {
    const result = checker.check(output, input);

    expect(result.severity).toBe(severity);
    expect(result.violations.map((violation) => violation.type))
      .toEqual(expect.arrayContaining(violations));
  });
});
