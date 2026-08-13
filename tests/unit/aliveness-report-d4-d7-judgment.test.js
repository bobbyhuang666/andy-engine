/**
 * D4 / D7 fail-closed judgment regression guard (DEEP_AUDIT_2026-08-13 §5 N5)
 *
 * P1-5 follow-up: D4 previously passed if any parsed tests/unit/effects/ file
 * was green, without requiring the declared "golden seed replay" entry; D7
 * only checked the domain command exit code and ignored the declared
 * tests/compatibility.test.js entry. Both are now fail-closed against ALL
 * declared entries: any fail → Gap, any missing → Warning, never Pass on
 * partial evidence. This test pins that behavior.
 */
import { describe, it, expect } from 'vitest';
const { createRequire } = await import('node:module');
const require = createRequire(import.meta.url);
const { judgeDimension, DIMENSIONS } = require('../../scripts/aliveness-report.js');

const d4 = DIMENSIONS.find(d => d.id === 'D4');
const d7 = DIMENSIONS.find(d => d.id === 'D7');

describe('D4 causal writeback judgment (fail-closed declared entries)', () => {
  it('effects dir all pass + golden-seed-replay pass → Pass', () => {
    const parsed = {
      fileResults: [
        { file: 'tests/unit/effects/position-delta.test.js', status: 'pass' },
        { file: 'tests/unit/effects/effect-committer-atomicity.test.js', status: 'pass' },
        { file: 'tests/unit/golden-seed-replay.test.js', status: 'pass' },
      ],
    };
    expect(judgeDimension(d4, parsed, { status: 0 }, { status: 0 }, { status: 0 })).toBe('Pass');
  });

  it('effects dir pass but golden-seed-replay missing → Warning (never Pass)', () => {
    const parsed = {
      fileResults: [
        { file: 'tests/unit/effects/position-delta.test.js', status: 'pass' },
      ],
    };
    expect(judgeDimension(d4, parsed, { status: 0 }, { status: 0 }, { status: 0 })).toBe('Warning');
  });

  it('golden-seed-replay fail → Gap even when effects dir is green', () => {
    const parsed = {
      fileResults: [
        { file: 'tests/unit/effects/position-delta.test.js', status: 'pass' },
        { file: 'tests/unit/golden-seed-replay.test.js', status: 'fail' },
      ],
    };
    expect(judgeDimension(d4, parsed, { status: 0 }, { status: 0 }, { status: 0 })).toBe('Gap');
  });

  it('any effects file fail → Gap', () => {
    const parsed = {
      fileResults: [
        { file: 'tests/unit/effects/position-delta.test.js', status: 'fail' },
        { file: 'tests/unit/effects/effect-committer-atomicity.test.js', status: 'pass' },
        { file: 'tests/unit/golden-seed-replay.test.js', status: 'pass' },
      ],
    };
    expect(judgeDimension(d4, parsed, { status: 0 }, { status: 0 }, { status: 0 })).toBe('Gap');
  });

  it('no effects files parsed at all → Gap (evidence missing)', () => {
    const parsed = {
      fileResults: [
        { file: 'tests/unit/golden-seed-replay.test.js', status: 'pass' },
      ],
    };
    expect(judgeDimension(d4, parsed, { status: 0 }, { status: 0 }, { status: 0 })).toBe('Gap');
  });
});

describe('D7 domain portability judgment (fail-closed declared entries)', () => {
  it('domain gate pass + compatibility pass → Pass', () => {
    const parsed = {
      fileResults: [{ file: 'tests/compatibility.test.js', status: 'pass' }],
    };
    expect(judgeDimension(d7, parsed, { status: 0 }, { status: 0 }, { status: 0 })).toBe('Pass');
  });

  it('domain gate pass but compatibility missing → Warning (never Pass)', () => {
    const parsed = { fileResults: [] };
    expect(judgeDimension(d7, parsed, { status: 0 }, { status: 0 }, { status: 0 })).toBe('Warning');
  });

  it('compatibility fail → Gap', () => {
    const parsed = {
      fileResults: [{ file: 'tests/compatibility.test.js', status: 'fail' }],
    };
    expect(judgeDimension(d7, parsed, { status: 0 }, { status: 0 }, { status: 0 })).toBe('Gap');
  });

  it('domain gate non-zero exit → Gap regardless of compatibility', () => {
    const parsed = {
      fileResults: [{ file: 'tests/compatibility.test.js', status: 'pass' }],
    };
    expect(judgeDimension(d7, parsed, { status: 1 }, { status: 0 }, { status: 0 })).toBe('Gap');
  });
});
