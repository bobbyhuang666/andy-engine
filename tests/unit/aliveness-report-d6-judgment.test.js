import { describe, it, expect } from 'vitest';
import { judgeDimension, DIMENSIONS } from '../../scripts/aliveness-report.js';

// Helper: build a testParsed with specific file statuses
function makeParsed(fileStatuses) {
  // fileStatuses: { 'social-emergence': 'pass', 'gossip-propagation': 'fail', ... }
  const fileResults = Object.entries(fileStatuses).map(([frag, status]) => ({
    file: `tests/e2e/${frag}.test.js`,
    status,
  }));
  return {
    testFilesLine: `${fileResults.filter(f => f.status === 'pass').length} passed`,
    testsLine: '',
    fileResults,
  };
}

const d6 = DIMENSIONS.find(d => d.id === 'D6');

describe('aliveness-report D6 judgment (v2.6-W4b fix)', () => {
  it('all 3 pass → Pass', () => {
    const parsed = makeParsed({
      'social-emergence': 'pass',
      'gossip-propagation': 'pass',
      'emotion-contagion-cluster': 'pass',
    });
    expect(judgeDimension(d6, parsed, { status: 0 }, { status: 0 }, { status: 0 })).toBe('Pass');
  });

  it('gossip fail → Gap (not Pass)', () => {
    const parsed = makeParsed({
      'social-emergence': 'pass',
      'gossip-propagation': 'fail',
      'emotion-contagion-cluster': 'pass',
    });
    const result = judgeDimension(d6, parsed, { status: 0 }, { status: 0 }, { status: 0 });
    expect(result).toBe('Gap');
  });

  it('contagion fail → Gap (not Pass)', () => {
    const parsed = makeParsed({
      'social-emergence': 'pass',
      'gossip-propagation': 'pass',
      'emotion-contagion-cluster': 'fail',
    });
    const result = judgeDimension(d6, parsed, { status: 0 }, { status: 0 }, { status: 0 });
    expect(result).toBe('Gap');
  });

  it('social-emergence fail → Gap', () => {
    const parsed = makeParsed({
      'social-emergence': 'fail',
      'gossip-propagation': 'pass',
      'emotion-contagion-cluster': 'pass',
    });
    const result = judgeDimension(d6, parsed, { status: 0 }, { status: 0 }, { status: 0 });
    expect(result).toBe('Gap');
  });

  it('all missing → Warning', () => {
    const parsed = makeParsed({}); // no D6 files at all
    const result = judgeDimension(d6, parsed, { status: 0 }, { status: 0 }, { status: 0 });
    expect(result).toBe('Warning');
  });

  it('social-emergence pass alone (others missing) → Warning, not Pass', () => {
    // This is the exact scenario the B1 fix prevents:
    // if D6 check ran after generic path, social-emergence pass would → Pass
    const parsed = makeParsed({
      'social-emergence': 'pass',
    });
    const result = judgeDimension(d6, parsed, { status: 0 }, { status: 0 }, { status: 0 });
    expect(result).toBe('Warning');
  });

  it('2 pass + 1 missing → Warning', () => {
    const parsed = makeParsed({
      'social-emergence': 'pass',
      'gossip-propagation': 'pass',
    });
    const result = judgeDimension(d6, parsed, { status: 0 }, { status: 0 }, { status: 0 });
    expect(result).toBe('Warning');
  });

  it('2 pass + 1 fail → Gap', () => {
    const parsed = makeParsed({
      'social-emergence': 'pass',
      'gossip-propagation': 'fail',
      'emotion-contagion-cluster': 'pass',
    });
    const result = judgeDimension(d6, parsed, { status: 0 }, { status: 0 }, { status: 0 });
    expect(result).toBe('Gap');
  });
});
