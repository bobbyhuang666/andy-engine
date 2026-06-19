/**
 * IntrinsicMotivation domain-boundary tests.
 */

import { describe, it, expect } from 'vitest';
import Personality from '../../agent/Personality.js';
import IntrinsicMotivation from '../../agent/IntrinsicMotivation.js';
import { DomainRegistry } from '../../domain/DomainRegistry.js';
import tavernDomain from '../../presets/tavern/index.js';

describe('IntrinsicMotivation domain boundaries', () => {
  it('uses custom domain regions when generating exploration goals', () => {
    const personality = new Personality({ mbti: 'ENFP' });
    const domain = new DomainRegistry(tavernDomain);
    const intrinsic = new IntrinsicMotivation(personality, null, domain);

    const goal = intrinsic._generateGoal('explore_new', '小屋', 12, new Date('2026-06-19T12:00:00Z'));

    expect(goal).toBeTruthy();
    expect(tavernDomain.regions).toContain(goal.target);
    expect(goal.target).not.toBe('宿舍');
    expect(goal.target).not.toBe('食堂');
  });
});
