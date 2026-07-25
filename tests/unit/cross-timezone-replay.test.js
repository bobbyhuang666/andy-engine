/**
 * Core simulation semantics must not depend on the host process timezone.
 * This exercises separate Node processes because changing TZ in-process does
 * not reliably update Date's local-time behavior on every platform.
 */

import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

const scenario = `
  const AndyEngine = require('./index.js');
  const { toWorldState } = require('./store');
  const engine = new AndyEngine({
    seed: 'cross-timezone-replay-v1',
    startTime: new Date('2026-09-01T23:55:00.000Z'),
    enableFacts: true,
  });
  engine.createCharacter({ id: 'maya', name: 'Maya', mbti: 'INFP', schedule: 'student' });
  engine.createCharacter({ id: 'leo', name: 'Leo', mbti: 'ESTP', schedule: 'student' });
  for (let i = 0; i < 72; i++) engine.tick();
  process.stdout.write(JSON.stringify(toWorldState(engine, 'cross-timezone')));
`;

function runInTimezone(TZ) {
  return execFileSync(process.execPath, ['-e', scenario], {
    cwd: process.cwd(),
    env: { ...process.env, TZ },
    encoding: 'utf8',
  });
}

describe('seeded replay is host-timezone independent', () => {
  it('produces the same serialized world for UTC, Tokyo, and Los Angeles', () => {
    const utc = runInTimezone('UTC');
    expect(runInTimezone('Asia/Tokyo')).toBe(utc);
    expect(runInTimezone('America/Los_Angeles')).toBe(utc);
  });
});
