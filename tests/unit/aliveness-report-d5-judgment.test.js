import { describe, it, expect } from 'vitest';
import {
  judgeDimension,
  renderReport,
  DIMENSIONS,
} from '../../scripts/aliveness-report.js';

function makeParsed(smokeStatus) {
  const fileResults = smokeStatus
    ? [{
        file: 'tests/unit/narrative/grounding-smoke.test.js',
        status: smokeStatus,
      }]
    : [];

  return {
    testFilesLine: fileResults.length ? '1 passed' : '',
    testsLine: '',
    fileResults,
  };
}

const d5 = DIMENSIONS.find(d => d.id === 'D5');
const passingCommand = { status: 0, stdout: '' };

describe('aliveness-report D5 split status', () => {
  it('keeps overall D5 at Warning when the public synthetic checker passes', () => {
    expect(
      judgeDimension(
        d5,
        makeParsed('pass'),
        passingCommand,
        passingCommand,
        passingCommand,
      ),
    ).toBe('Warning');
  });

  it('reports Gap when the public synthetic checker fails', () => {
    expect(
      judgeDimension(
        d5,
        makeParsed('fail'),
        passingCommand,
        passingCommand,
        passingCommand,
      ),
    ).toBe('Gap');
  });

  it('reports Warning when the public synthetic checker is missing', () => {
    expect(
      judgeDimension(
        d5,
        makeParsed(),
        passingCommand,
        passingCommand,
        passingCommand,
      ),
    ).toBe('Warning');
  });

  it('renders synthetic and real-LLM statuses separately', () => {
    const report = renderReport(
      [d5],
      makeParsed('pass'),
      passingCommand,
      passingCommand,
      passingCommand,
      '2026-07-23T00:00:00.000Z',
    );

    expect(report).toContain('D5 Grounded Narrative Faithfulness — Warning');
    expect(report).toContain('公开 synthetic checker**: Pass');
    expect(report).toContain('真实 LLM outcome**: Warning / not evaluated');
  });
});
