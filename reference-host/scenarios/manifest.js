/**
 * Scenario Manifest — Reference Host scenario definitions
 *
 * Each scenario declares: id, domain, seed, characters, segment plan,
 * resume boundaries, and expected observables.
 *
 * Host configuration explicitly sets enableFacts:true without changing
 * the Engine default (which remains false).
 */

'use strict';

const SEVEN_DAYS_TICKS = 7 * 24 * 12; // 7 days × 24 hrs × 12 ticks/hr (5-min ticks)

const TAVERN_SCENARIO = {
  id: 'tavern-seven-day',
  domain: 'tavern',
  seed: 'ib-tavern-7d-v1',
  enableFacts: true,
  tickMinutes: 5,
  startTime: new Date('1400-01-01T06:00:00Z'),
  characters: [
    {
      id: 'ulfberht',
      name: 'Ulfberht',
      schedule: 'blacksmith',
      mbti: 'ISTJ',
      background: ['一个沉默寡言的铁匠', '对铸剑技艺极其执着', '寡言但不冷漠'],
    },
    {
      id: 'maren',
      name: 'Maren',
      schedule: 'drunkard',
      mbti: 'ESFP',
      background: ['酒馆常客', '爱讲夸张故事', '其实非常孤独'],
    },
    {
      id: 'rhia',
      name: 'Rhia',
      schedule: 'wanderer',
      mbti: 'INFP',
      background: ['流浪诗人', '在森林与广场间游荡', '偶尔到酒馆吟唱'],
    },
  ],
  /**
   * Segment plan for seven-day tavern run with two fresh-process resume
   * boundaries. SEVEN_DAYS_TICKS = 7 * 24 * 12 = 2016 (5-min ticks).
   * Segments are evenly split so the full 7 days are simulated:
   *   Segment 0: ticks 0–671    (Day 1–2 evening, 672 ticks)
   *   → checkpoint, process exit
   *   Segment 1: ticks 672–1343 (Day 2 evening–Day 4 evening, 672 ticks)
   *   → checkpoint, process exit
   *   Segment 2: ticks 1344–2015 (Day 4 evening–Day 7 end, 672 ticks)
   *
   * DEEP_AUDIT_2026-08-13: the previous plan had segment 2 as
   * 2016→2016 (0 ticks) because SEVEN_DAYS_TICKS == 2016, so the third
   * segment advanced nothing and the "Day 5–7" window was never simulated.
   */
  segments: [
    { id: 0, startTick: 0, targetTick: 672 },
    { id: 1, startTick: 672, targetTick: 1344 },
    { id: 2, startTick: 1344, targetTick: SEVEN_DAYS_TICKS },
  ],
  resumeBoundaries: [
    { afterSegment: 0, label: 'Day-2-evening checkpoint' },
    { afterSegment: 1, label: 'Day-4-evening checkpoint' },
  ],
  expectedObservables: {
    minEvents: 1,
    minMemories: 1,
    relationshipChange: true,
    locationChange: true,
    epistemicControl: true,
  },
};

const CAMPUS_SCENARIO = {
  id: 'campus-portability',
  domain: 'campus',
  seed: 'ib-campus-port-v1',
  enableFacts: true,
  tickMinutes: 5,
  startTime: new Date('2025-03-10T08:00:00Z'),
  characters: [
    {
      id: 'yuki',
      name: 'Yuki',
      mbti: 'INFJ',
      schedule: 'student',
      background: ['哲学系研究生', '喜欢在图书馆独处', '偶尔参加读书会'],
    },
    {
      id: 'kenji',
      name: 'Kenji',
      mbti: 'ESTP',
      schedule: 'student',
      background: ['体育系本科生', '经常在操场训练', '外向但冲动'],
    },
  ],
  /**
   * Shorter repeatable run: 200 ticks (~16.7 hours)
   */
  segments: [
    { id: 0, startTick: 0, targetTick: 200 },
  ],
  resumeBoundaries: [],
  expectedObservables: {
    minEvents: 1,
    minMemories: 1,
  },
};

/**
 * Generate a tavern scenario variant with configurable seed and segments.
 *
 * @param {string} seed - Scenario seed (e.g. 'ib-tavern-7d-v1')
 * @param {Array} segments - Segment plan [{ id, startTick, targetTick }]
 * @returns {Object} Scenario definition
 */
function makeTavernScenario(seed, segments) {
  return {
    id: `tavern-seven-day-${seed}`,
    domain: 'tavern',
    seed,
    enableFacts: true,
    tickMinutes: 5,
    startTime: new Date('1400-01-01T06:00:00Z'),
    characters: [
      {
        id: 'ulfberht',
        name: 'Ulfberht',
        schedule: 'blacksmith',
        mbti: 'ISTJ',
        background: ['一个沉默寡言的铁匠', '对铸剑技艺极其执着', '寡言但不冷漠'],
      },
      {
        id: 'maren',
        name: 'Maren',
        schedule: 'drunkard',
        mbti: 'ESFP',
        background: ['酒馆常客', '爱讲夸张故事', '其实非常孤独'],
      },
      {
        id: 'rhia',
        name: 'Rhia',
        schedule: 'wanderer',
        mbti: 'INFP',
        background: ['流浪诗人', '在森林与广场间游荡', '偶尔到酒馆吟唱'],
      },
    ],
    segments,
    resumeBoundaries: segments.slice(0, -1).map((seg, i) => ({
      afterSegment: i,
      label: `checkpoint-after-segment-${i}`,
    })),
    expectedObservables: { minEvents: 1, minMemories: 1, relationshipChange: true, locationChange: true, epistemicControl: true },
  };
}

module.exports = { TAVERN_SCENARIO, CAMPUS_SCENARIO, SEVEN_DAYS_TICKS, makeTavernScenario };
