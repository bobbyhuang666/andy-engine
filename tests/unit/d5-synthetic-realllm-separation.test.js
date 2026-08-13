/**
 * D5 synthetic/real-LLM separation regression guard (RFC W7 / Patch F)
 *
 * Verifies that the aliveness report's D5 dimension always returns 'Warning'
 * regardless of synthetic test outcome, and that synthetic Pass cannot
 * upgrade real-LLM status. This is a regression guard — the separation is
 * already implemented (aliveness-report.js:150-155); this test prevents
 * future regressions.
 */
import { describe, it, expect } from 'vitest';
const { createRequire } = await import('node:module');
const require = createRequire(import.meta.url);
const { judgeDimension, DIMENSIONS } = require('../../scripts/aliveness-report.js');

const d5 = DIMENSIONS.find(d => d.id === 'D5');

describe('D5 synthetic/real-LLM separation (RFC W7 / Patch F)', () => {
  it('D5 judgeDimension returns Warning when synthetic smoke passes', () => {
    const testParsed = {
      fileResults: [{ file: 'tests/unit/narrative/grounding-smoke.test.js', status: 'pass' }],
    };
    const status = judgeDimension(d5, testParsed, { status: 0 }, { status: 0 }, { status: 0 });
    expect(status).toBe('Warning');
  });

  it('D5 judgeDimension returns Gap when synthetic smoke fails', () => {
    const testParsed = {
      fileResults: [{ file: 'tests/unit/narrative/grounding-smoke.test.js', status: 'fail' }],
    };
    const status = judgeDimension(d5, testParsed, { status: 0 }, { status: 0 }, { status: 0 });
    expect(status).toBe('Gap');
  });

  it('D5 judgeDimension returns Warning when synthetic smoke is not-found (never Pass)', () => {
    const testParsed = {
      fileResults: [{ file: 'tests/unit/narrative/other.test.js', status: 'pass' }],
    };
    const status = judgeDimension(d5, testParsed, { status: 0 }, { status: 0 }, { status: 0 });
    expect(status).toBe('Warning');
  });

  it('synthetic Pass never upgrades D5 to Pass', () => {
    // Even with all synthetic tests green, D5 must stay Warning (not Pass).
    const testParsed = {
      fileResults: [
        { file: 'tests/unit/narrative/grounding-smoke.test.js', status: 'pass' },
        { file: 'tests/unit/narrative/grounding/test1.test.js', status: 'pass' },
        { file: 'tests/unit/narrative/grounding/test2.test.js', status: 'pass' },
      ],
    };
    const status = judgeDimension(d5, testParsed, { status: 0 }, { status: 0 }, { status: 0 });
    expect(status).not.toBe('Pass');
    expect(status).toBe('Warning');
  });
});
