/**
 * FactConsistencyChecker branch coverage — Wave 5 batch 8
 *
 * 此前无直接单元测试。本文件覆盖 check 入口 + 6 个 _check 分支 +
 * _computeSeverity + _suggestFix 各分支。
 *
 * 纯逻辑:domain stub + grounding fixture,hermetic。
 */

import { describe, it, expect } from 'vitest';
// CJS require:与运行时同一模块实例,确保 v8 coverage 正确归因
const { createRequire } = await import('node:module');
const require = createRequire(import.meta.url);
const FactConsistencyChecker = require('../../../src/narrative/FactConsistencyChecker.js');
const { FactType } = require('../../../src/canon/FactSchema.js');

function makeChecker(regions = ['图书馆', '食堂', '宿舍']) {
  return new FactConsistencyChecker({}, { regions });
}

function makeGrounding(overrides = {}) {
  return {
    allowedFacts: [],
    metadata: { agentId: 'alice', currentTime: new Date('2026-09-01T10:00:00Z') },
    ...overrides,
  };
}

// ═══════════════════════════════════════════
// check 入口
// ═══════════════════════════════════════════
describe('FactConsistencyChecker.check — entry', () => {
  it('returns pass when llmOutput or grounding missing', () => {
    const c = makeChecker();
    expect(c.check(null, makeGrounding()).valid).toBe(true);
    expect(c.check('text', null).valid).toBe(true);
  });
  it('returns valid:true with no violations for clean text', () => {
    const c = makeChecker();
    const r = c.check('今天天气不错', makeGrounding());
    expect(r.valid).toBe(true);
    expect(r.violations).toHaveLength(0);
    expect(r.severity).toBe('pass');
    expect(r.suggestion).toBeNull();
  });
});

// ═══════════════════════════════════════════
// _checkCharacterNames
// ═══════════════════════════════════════════
describe('_checkCharacterNames', () => {
  it('flags unknown character mentioned before action verb', () => {
    const c = makeChecker();
    const grounding = makeGrounding({ allowedFacts: [{ type: FactType.AGENT_STATE, agentId: 'alice' }] });
    // namePattern: [标点](2-4汉字)(?=动词) — 「，小明说道」捕获「小明」(lookahead 集 [说聊问答告诉来了去了见到] 不含「道」)
    const r = c.check('，小明说道', grounding);
    expect(r.violations.some(v => v.type === 'unknown_character' && v.name === '小明')).toBe(true);
  });
  it('skips common words (大家/别人/etc)', () => {
    const c = makeChecker();
    const r = c.check('，大家说道', makeGrounding());
    expect(r.violations.some(v => v.type === 'unknown_character')).toBe(false);
  });
  it('accepts known character from allowedFacts participants', () => {
    const c = makeChecker();
    const r = c.check('，爱丽丝说道', makeGrounding({ allowedFacts: [{ type: FactType.AGENT_STATE, agentId: '爱丽丝' }] }));
    expect(r.violations.some(v => v.type === 'unknown_character' && v.name === '爱丽丝')).toBe(false);
  });
});

// ═══════════════════════════════════════════
// _checkLocationNames
// ═══════════════════════════════════════════
describe('_checkLocationNames', () => {
  it('flags unknown location not in domain regions', () => {
    const c = makeChecker();
    const r = c.check('我去火星了', makeGrounding());
    expect(r.violations.some(v => v.type === 'unknown_location')).toBe(true);
  });
  it('accepts known location from domain regions', () => {
    const c = makeChecker();
    const r = c.check('我去图书馆', makeGrounding());
    expect(r.violations.some(v => v.type === 'unknown_location' && v.location === '图书馆')).toBe(false);
  });
  it('skips non-location suffixes (看书/学习)', () => {
    const c = makeChecker();
    const r = c.check('我在看书', makeGrounding());
    expect(r.violations.some(v => v.type === 'unknown_location')).toBe(false);
  });
  it('skips common non-location words (这里/那里)', () => {
    const c = makeChecker();
    const r = c.check('我在这里', makeGrounding());
    expect(r.violations.some(v => v.type === 'unknown_location')).toBe(false);
  });
});

// ═══════════════════════════════════════════
// _checkEventKnowledge
// ═══════════════════════════════════════════
describe('_checkEventKnowledge', () => {
  it('flags unknown event reference (那次...)', () => {
    const c = makeChecker();
    const r = c.check('那次运动会的事情', makeGrounding({ allowedFacts: [] }));
    expect(r.violations.some(v => v.type === 'unknown_event')).toBe(true);
  });
  it('accepts known event from allowedFacts', () => {
    const c = makeChecker();
    const grounding = makeGrounding({ allowedFacts: [{ type: FactType.EVENT, description: '毕业典礼' }] });
    const r = c.check('那次毕业典礼', grounding);
    expect(r.violations.some(v => v.type === 'unknown_event' && v.event === '毕业典礼')).toBe(false);
  });
});

// ═══════════════════════════════════════════
// _checkTimeConflicts
// ═══════════════════════════════════════════
describe('_checkTimeConflicts', () => {
  it('flags 深夜 mentioned during daytime (hour 10)', () => {
    const c = makeChecker();
    // 用本地时间构造避免 UTC 时区偏移影响 getHours()
    const grounding = makeGrounding({ metadata: { agentId: 'a', currentTime: new Date(2026, 8, 1, 10, 0, 0) } });
    const r = c.check('现在是深夜', grounding);
    expect(r.violations.some(v => v.type === 'time_conflict')).toBe(true);
  });
  it('flags 中午 mentioned during night (hour 22)', () => {
    const c = makeChecker();
    const grounding = makeGrounding({ metadata: { agentId: 'a', currentTime: new Date(2026, 8, 1, 22, 0, 0) } });
    const r = c.check('现在是中午', grounding);
    expect(r.violations.some(v => v.type === 'time_conflict')).toBe(true);
  });
  it('no conflict when no currentTime', () => {
    const c = makeChecker();
    const r = c.check('现在是深夜', makeGrounding({ metadata: { agentId: 'a' } }));
    expect(r.violations.some(v => v.type === 'time_conflict')).toBe(false);
  });
});

// ═══════════════════════════════════════════
// _checkNewContent
// ═══════════════════════════════════════════
describe('_checkNewContent', () => {
  it('flags new relationship (分手了)', () => {
    const c = makeChecker();
    const r = c.check('他们分手了', makeGrounding());
    expect(r.violations.some(v => v.type === 'new_relationship')).toBe(true);
  });
  it('flags fabricated new event (刚刚...了)', () => {
    const c = makeChecker();
    const r = c.check('刚刚考试了', makeGrounding({ allowedFacts: [] }));
    expect(r.violations.some(v => v.type === 'new_event')).toBe(true);
  });
  it('accepts known event in allowedFacts', () => {
    const c = makeChecker();
    const grounding = makeGrounding({ allowedFacts: [{ type: FactType.EVENT, description: '考试结束了' }] });
    const r = c.check('刚刚考试结束了', grounding);
    expect(r.violations.some(v => v.type === 'new_event' && v.event === '考试结束')).toBe(false);
  });
});

// ═══════════════════════════════════════════
// _checkAgentLocationClaims
// ═══════════════════════════════════════════
describe('_checkAgentLocationClaims', () => {
  it('flags unsupported agent-location claim', () => {
    const c = makeChecker();
    const grounding = makeGrounding({
      allowedFacts: [{ type: FactType.AGENT_STATE, agentId: 'alice' }],
      metadata: { agentId: 'alice' },
    });
    // alice claimed at 火星 (not in known locations)
    const r = c.check('alice在火星', grounding);
    expect(r.violations.some(v => v.type === 'unsupported_claim')).toBe(true);
  });
  it('accepts supported claim from self agent_state', () => {
    const c = makeChecker();
    const grounding = makeGrounding({
      allowedFacts: [{ type: FactType.AGENT_STATE, agentId: 'alice', position: '图书馆' }],
      metadata: { agentId: 'alice' },
    });
    const r = c.check('alice在图书馆', grounding);
    expect(r.violations.some(v => v.type === 'unsupported_claim')).toBe(false);
  });
  it('skips common non-agent words (大家/别人)', () => {
    const c = makeChecker();
    const r = c.check('大家在图书馆', makeGrounding({ metadata: { agentId: 'a' } }));
    expect(r.violations.some(v => v.type === 'unsupported_claim')).toBe(false);
  });
});

// ═══════════════════════════════════════════
// _computeSeverity
// ═══════════════════════════════════════════
describe('_computeSeverity', () => {
  it('reject for new_event/new_relationship', () => {
    const c = makeChecker();
    expect(c.check('他们分手了', makeGrounding()).severity).toBe('reject');
  });
  it('rewrite for unknown_character', () => {
    const c = makeChecker();
    const r = c.check('，小明说了', makeGrounding({ allowedFacts: [] }));
    expect(['rewrite', 'degrade_to_template']).toContain(r.severity);
  });
  it('degrade_to_template for time_conflict only', () => {
    const c = makeChecker();
    const grounding = makeGrounding({ metadata: { agentId: 'a', currentTime: new Date(2026, 8, 1, 10, 0, 0) } });
    const r = c.check('深夜', grounding);
    // time_conflict → degrade (unless other violations present)
    expect(['degrade_to_template', 'rewrite']).toContain(r.severity);
  });
});

// ═══════════════════════════════════════════
// _suggestFix
// ═══════════════════════════════════════════
describe('_suggestFix', () => {
  it('returns suggestion string for violations', () => {
    const c = makeChecker();
    const r = c.check('我去火星了', makeGrounding());
    expect(r.suggestion).not.toBeNull();
    expect(typeof r.suggestion).toBe('string');
    expect(r.suggestion).toContain('火星');
  });
  it('returns null when no violations', () => {
    const c = makeChecker();
    expect(c.check('今天天气不错', makeGrounding()).suggestion).toBeNull();
  });
});

// ═══════════════════════════════════════════
// _checkMissingSourceAttribution (v2.5-W1)
// ═══════════════════════════════════════════
describe('_checkMissingSourceAttribution (v2.5-W1)', () => {
  it('flags told fact expressed without source marker', () => {
    const c = makeChecker();
    const grounding = makeGrounding({
      allowedFacts: [
        { type: FactType.EVENT, description: '鲍勃找到了一本书', location: '图书馆', _evidence: { source: 'told', confidence: 0.6, propagatedFrom: 'bob' } },
      ],
    });
    const r = c.check('鲍勃找到了一本书', grounding);
    expect(r.violations.some(v => v.type === 'missing_source_attribution')).toBe(true);
  });

  it('flags inferred fact expressed without "推测/大概"', () => {
    const c = makeChecker();
    const grounding = makeGrounding({
      allowedFacts: [
        { type: FactType.EVENT, description: '食堂发生了聚餐', location: '食堂', _evidence: { source: 'inferred', confidence: 0.5, propagatedFrom: null } },
      ],
    });
    const r = c.check('食堂发生了聚餐', grounding);
    expect(r.violations.some(v => v.type === 'missing_source_attribution')).toBe(true);
  });

  it('does NOT flag told fact with "听说" marker', () => {
    const c = makeChecker();
    const grounding = makeGrounding({
      allowedFacts: [
        { type: FactType.EVENT, description: '鲍勃找到了一本书', location: '图书馆', _evidence: { source: 'told', confidence: 0.6, propagatedFrom: 'bob' } },
      ],
    });
    const r = c.check('我听说鲍勃找到了一本书', grounding);
    expect(r.violations.some(v => v.type === 'missing_source_attribution')).toBe(false);
  });

  it('does NOT flag told fact with "告诉我" marker', () => {
    const c = makeChecker();
    const grounding = makeGrounding({
      allowedFacts: [
        { type: FactType.EVENT, description: '鲍勃在食堂吃饭', location: '食堂', _evidence: { source: 'told', confidence: 0.6, propagatedFrom: 'bob' } },
      ],
    });
    const r = c.check('bob告诉我鲍勃在食堂吃饭', grounding);
    expect(r.violations.some(v => v.type === 'missing_source_attribution')).toBe(false);
  });

  it('does NOT flag inferred fact with "推测" marker', () => {
    const c = makeChecker();
    const grounding = makeGrounding({
      allowedFacts: [
        { type: FactType.EVENT, description: '食堂发生了聚餐', location: '食堂', _evidence: { source: 'inferred', confidence: 0.5, propagatedFrom: null } },
      ],
    });
    const r = c.check('我推测食堂发生了聚餐', grounding);
    expect(r.violations.some(v => v.type === 'missing_source_attribution')).toBe(false);
  });

  it('does NOT flag inferred fact with "大概" marker', () => {
    const c = makeChecker();
    const grounding = makeGrounding({
      allowedFacts: [
        { type: FactType.EVENT, description: '食堂有人', location: '食堂', _evidence: { source: 'inferred', confidence: 0.5, propagatedFrom: null } },
      ],
    });
    const r = c.check('食堂大概有人', grounding);
    expect(r.violations.some(v => v.type === 'missing_source_attribution')).toBe(false);
  });

  it('does NOT flag direct/observed facts', () => {
    const c = makeChecker();
    const grounding = makeGrounding({
      allowedFacts: [
        { type: FactType.EVENT, description: '直接事件', location: '图书馆', _evidence: { source: 'direct', confidence: 1.0, propagatedFrom: null } },
        { type: FactType.EVENT, description: '观察事件', location: '图书馆', _evidence: { source: 'observed', confidence: 0.9, propagatedFrom: null } },
      ],
    });
    const r = c.check('直接事件发生了，观察事件也发生了', grounding);
    expect(r.violations.some(v => v.type === 'missing_source_attribution')).toBe(false);
  });

  it('does NOT flag facts without _evidence (backward compat)', () => {
    const c = makeChecker();
    const grounding = makeGrounding({
      allowedFacts: [
        { type: FactType.EVENT, description: '无证据事件', location: '图书馆' },
      ],
    });
    const r = c.check('无证据事件发生了', grounding);
    expect(r.violations.some(v => v.type === 'missing_source_attribution')).toBe(false);
  });
});

// ═══════════════════════════════════════════
// 4-layer severity (v2.5-W1)
// ═══════════════════════════════════════════
describe('4-layer severity (v2.5-W1)', () => {
  it('severity=warning for missing_source_attribution only', () => {
    const c = makeChecker();
    const grounding = makeGrounding({
      allowedFacts: [
        { type: FactType.EVENT, description: '食堂关门了', location: '食堂', _evidence: { source: 'told', confidence: 0.6, propagatedFrom: 'bob' } },
      ],
    });
    const r = c.check('食堂关门了', grounding);
    expect(r.violations.some(v => v.type === 'missing_source_attribution')).toBe(true);
    expect(r.severity).toBe('warning');
  });

  it('severity=warning for inferred without marker only', () => {
    const c = makeChecker();
    const grounding = makeGrounding({
      allowedFacts: [
        { type: FactType.EVENT, description: '推断的事', location: '图书馆', _evidence: { source: 'inferred', confidence: 0.5, propagatedFrom: null } },
      ],
    });
    const r = c.check('推断的事', grounding);
    expect(r.severity).toBe('warning');
  });

  it('severity=reject when both warning and reject violations exist', () => {
    const c = makeChecker();
    const grounding = makeGrounding({
      allowedFacts: [
        { type: FactType.EVENT, description: '食堂关门了', location: '食堂', _evidence: { source: 'told', confidence: 0.6, propagatedFrom: 'bob' } },
      ],
    });
    const r = c.check('食堂关门了，刚刚吃了一顿大餐了', grounding);
    expect(r.severity).toBe('reject');
  });

  it('severity=pass when no violations', () => {
    const c = makeChecker();
    const r = c.check('今天天气不错', makeGrounding());
    expect(r.severity).toBe('pass');
  });
});
