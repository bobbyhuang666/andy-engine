/**
 * IntrinsicMotivation domain-boundary tests.
 */

import { describe, it, expect } from 'vitest';
import Personality from '../../src/agent/psychology/Personality.js';
import IntrinsicMotivation from '../../src/agent/psychology/IntrinsicMotivation.js';
import { DomainRegistry } from '../../src/domain/DomainRegistry.js';
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

  it('partial user domainRegionMap preserves preset domain mappings', () => {
    const personality = new Personality({ mbti: 'INFP' });
    const domain = new DomainRegistry(tavernDomain);
    const intrinsic = new IntrinsicMotivation(personality, null, domain, null, {
      domainRegionMap: { customCraft: '铁匠铺' },
    });

    expect(intrinsic._imConfig.domainRegionMap['森林探索']).toBe('森林');
    expect(intrinsic._imConfig.domainRegionMap.customCraft).toBe('铁匠铺');
    expect(intrinsic._domainToRegion('森林探索', '小屋')).toBe('森林');
    expect(intrinsic._domainToRegion('customCraft', '小屋')).toBe('铁匠铺');
  });

  it('need gate caps satisfied needs at raw curiosity', () => {
    const personality = new Personality({ mbti: 'INFP' });
    const domain = new DomainRegistry(tavernDomain);
    const intrinsic = new IntrinsicMotivation(personality, null, domain, null, {
      needGateThreshold: 0.5,
    });

    const effective = intrinsic._applyNeedGate(0.4, {
      hunger: 2,
      energy: 2,
      social: 2,
      comfort: 2,
      stimulation: 2,
    }, {
      hunger: 1,
      energy: 1,
      social: 1,
      comfort: 1,
      stimulation: 1,
    });

    expect(effective).toBeCloseTo(0.4, 8);
  });

  it('need gate tolerates invalid needGateThreshold without NaN', () => {
    const personality = new Personality({ mbti: 'INFP' });
    const domain = new DomainRegistry(tavernDomain);
    const intrinsic = new IntrinsicMotivation(personality, null, domain, null, {
      needGateThreshold: 0,
    });

    const effective = intrinsic._applyNeedGate(0.4, {
      hunger: 0.5,
      energy: 0.5,
      social: 0.5,
      comfort: 0.5,
      stimulation: 0.5,
    }, {
      hunger: 1,
      energy: 1,
      social: 1,
      comfort: 1,
      stimulation: 1,
    });

    expect(Number.isFinite(effective)).toBe(true);
    expect(effective).toBeCloseTo(0.2, 8);
  });
});
