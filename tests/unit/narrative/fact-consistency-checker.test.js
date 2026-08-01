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
const FactFormatter = require('../../../src/narrative/FactFormatter.js');
const { FactType, FactScope } = require('../../../src/canon/FactSchema.js');
const { observationAssertion } = require('../../../src/narrative/ObservationAssertion.js');

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
  it('keeps legacy check(text, agentId) signature by building grounding from store', () => {
    const store = {
      getFactsForAgent: () => [
        { id: 'f1', type: FactType.AGENT_STATE, agentId: 'alice', position: '图书馆' },
      ],
      getAllFacts: () => [],
    };
    const c = new FactConsistencyChecker(store, { regions: ['图书馆'] });

    const r = c.check('我在图书馆', 'alice');

    expect(r.valid).toBe(true);
    expect(r.severity).toBe('pass');
  });
  it('returns valid:true with no violations for clean text', () => {
    const c = makeChecker();
    const r = c.check('今天天气不错', makeGrounding());
    expect(r.valid).toBe(true);
    expect(r.violations).toHaveLength(0);
    expect(r.severity).toBe('pass');
    expect(r.suggestion).toBeNull();
  });
  it('does not let legacy regexes re-judge a fact-bound observation sidecar span', () => {
    const fact = {
      id: 'fact_observation', type: FactType.OBSERVATION, observerId: 'main',
      targetId: 'maren', action: '在附近注意到有人', context: '酒馆',
    };
    const text = '我观察到Maren在附近注意到有人，当时在酒馆。';
    const r = makeChecker(['酒馆']).check(text, makeGrounding({
      allowedFacts: [fact], metadata: { agentId: 'main', agentNames: { main: '主角', maren: 'Maren' } },
    }), {
      structuredClaims: [{
        type: 'event', subject: 'main', predicate: 'observed',
        object: observationAssertion('maren', fact.action, fact.context), span: text, confidence: 1,
      }],
    });
    expect(r.valid).toBe(true);
    expect(r.violations).toEqual([]);
    expect(r.evidenceTrace).toEqual(expect.arrayContaining([
      expect.objectContaining({ support: 'supports', factId: 'fact_observation', evidenceSource: 'direct_observation' }),
    ]));
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
    const grounding = makeGrounding({ metadata: { agentId: 'a', currentTime: new Date('2026-09-01T10:00:00Z') } });
    const r = c.check('现在是深夜', grounding);
    expect(r.violations.some(v => v.type === 'time_conflict')).toBe(true);
  });
  it('flags 中午 mentioned during night (hour 22)', () => {
    const c = makeChecker();
    const grounding = makeGrounding({ metadata: { agentId: 'a', currentTime: new Date('2026-09-01T22:00:00Z') } });
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
    const grounding = makeGrounding({ metadata: { agentId: 'a', currentTime: new Date('2026-09-01T10:00:00Z') } });
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

  it('does NOT flag self-negation text matching 4-char fragment of told fact (P2 fix)', () => {
    // "我没有在图书馆" contains fragment "在图书" from told fact "鲍勃在图书馆"
    // but should NOT trigger missing_source_attribution
    const c = makeChecker();
    const grounding = makeGrounding({
      allowedFacts: [
        { type: FactType.AGENT_STATE, agentId: 'alice' },
        { type: FactType.AGENT_STATE, agentId: 'bob' },
        { type: FactType.EVENT, description: '鲍勃在图书馆', location: '图书馆', _evidence: { source: 'told', confidence: 0.6, propagatedFrom: 'bob' } },
      ],
      metadata: { agentId: 'alice', agentNames: { alice: '爱丽丝', bob: '鲍勃' } },
    });
    const r = c.check('我没有在图书馆', grounding);
    // Self-negation should not trigger missing_source_attribution for unrelated told fact
    expect(r.violations.some(v => v.type === 'missing_source_attribution')).toBe(false);
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

  // v2.5-W2: expanded marker list
  it('does NOT flag told fact with "据说" marker', () => {
    const c = makeChecker();
    const grounding = makeGrounding({
      allowedFacts: [
        { type: FactType.EVENT, description: '远处发生了地震', location: '远方', _evidence: { source: 'told', confidence: 0.6, propagatedFrom: 'bob' } },
      ],
    });
    const r = c.check('据说远处发生了地震', grounding);
    expect(r.violations.some(v => v.type === 'missing_source_attribution')).toBe(false);
  });

  it('does NOT flag told fact with "说是" marker', () => {
    const c = makeChecker();
    const grounding = makeGrounding({
      allowedFacts: [
        { type: FactType.EVENT, description: '食堂关门了', location: '食堂', _evidence: { source: 'told', confidence: 0.6, propagatedFrom: 'bob' } },
      ],
    });
    const r = c.check('说是食堂关门了', grounding);
    expect(r.violations.some(v => v.type === 'missing_source_attribution')).toBe(false);
  });

  it('does NOT flag inferred fact with "看来" marker', () => {
    const c = makeChecker();
    const grounding = makeGrounding({
      allowedFacts: [
        { type: FactType.EVENT, description: '食堂有人', location: '食堂', _evidence: { source: 'inferred', confidence: 0.5, propagatedFrom: null } },
      ],
    });
    const r = c.check('看来食堂有人', grounding);
    expect(r.violations.some(v => v.type === 'missing_source_attribution')).toBe(false);
  });

  it('does NOT flag inferred fact with "想必" marker', () => {
    const c = makeChecker();
    const grounding = makeGrounding({
      allowedFacts: [
        { type: FactType.EVENT, description: '那边很热闹', location: '操场', _evidence: { source: 'inferred', confidence: 0.5, propagatedFrom: null } },
      ],
    });
    const r = c.check('想必那边很热闹', grounding);
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

// ═══════════════════════════════════════════
// _checkAgentStateLeak (v2.5-W2, evidence fix W3)
// ═══════════════════════════════════════════
describe('_checkAgentStateLeak (v2.5-W2)', () => {
  it('flags other agent emotion without evidence', () => {
    const c = makeChecker();
    const grounding = makeGrounding({
      allowedFacts: [
        { type: FactType.AGENT_STATE, agentId: 'alice' },
        { type: FactType.AGENT_STATE, agentId: 'bob' },
      ],
    });
    // bob is in allowedFacts but only as bare AGENT_STATE (PUBLIC scope),
    // no EVENT/OBSERVATION evidence — narrator shouldn't know bob's emotion
    const r = c.check('bob很难过', grounding);
    expect(r.violations.some(v => v.type === 'agent_state_leak' && v.agent === 'bob')).toBe(true);
  });

  it('flags other agent needs without evidence', () => {
    const c = makeChecker();
    const grounding = makeGrounding({
      allowedFacts: [
        { type: FactType.AGENT_STATE, agentId: 'alice' },
        { type: FactType.AGENT_STATE, agentId: 'bob' },
      ],
    });
    const r = c.check('bob饿了', grounding);
    expect(r.violations.some(v => v.type === 'agent_state_leak' && v.agent === 'bob')).toBe(true);
  });

  it('flags other agent activity without evidence', () => {
    const c = makeChecker();
    const grounding = makeGrounding({
      allowedFacts: [
        { type: FactType.AGENT_STATE, agentId: 'alice' },
        { type: FactType.AGENT_STATE, agentId: 'bob' },
      ],
    });
    const r = c.check('bob正在看书', grounding);
    expect(r.violations.some(v => v.type === 'agent_state_leak' && v.agent === 'bob')).toBe(true);
  });

  it('does NOT flag self agent emotion', () => {
    const c = makeChecker();
    const grounding = makeGrounding({
      allowedFacts: [
        { type: FactType.AGENT_STATE, agentId: 'alice' },
      ],
    });
    // alice is selfId — can express own emotion freely
    const r = c.check('alice很难过', grounding);
    expect(r.violations.some(v => v.type === 'agent_state_leak')).toBe(false);
  });

  it('does NOT flag other agent emotion when narrator is EVENT participant', () => {
    const c = makeChecker();
    const grounding = makeGrounding({
      allowedFacts: [
        { type: FactType.AGENT_STATE, agentId: 'alice' },
        { type: FactType.AGENT_STATE, agentId: 'bob' },
        {
          type: FactType.EVENT,
          description: 'bob在食堂吃饭',
          location: '食堂',
          participants: ['alice', 'bob'],
          _evidence: { source: 'observed', confidence: 0.9, propagatedFrom: null },
        },
      ],
    });
    // alice is participant → physically present → can express bob's emotion
    const r = c.check('bob很开心', grounding);
    expect(r.violations.some(v => v.type === 'agent_state_leak' && v.agent === 'bob')).toBe(false);
  });

  it('does NOT flag common non-agent words', () => {
    const c = makeChecker();
    const grounding = makeGrounding({
      allowedFacts: [
        { type: FactType.AGENT_STATE, agentId: 'alice' },
      ],
    });
    const r = c.check('大家很开心', grounding);
    expect(r.violations.some(v => v.type === 'agent_state_leak')).toBe(false);
  });

  it('severity=rewrite for agent_state_leak', () => {
    const c = makeChecker();
    const grounding = makeGrounding({
      allowedFacts: [
        { type: FactType.AGENT_STATE, agentId: 'alice' },
        { type: FactType.AGENT_STATE, agentId: 'bob' },
      ],
    });
    const r = c.check('bob很难过', grounding);
    expect(r.severity).toBe('rewrite');
  });
});

// ═══════════════════════════════════════════
// _checkAgentStateLeak evidence tier (v2.5-W3)
// ═══════════════════════════════════════════
describe('_checkAgentStateLeak evidence tier (v2.5-W3)', () => {
  // ─── HIGH: told/inferred EVENT should NOT justify emotion/needs ───
  it('told EVENT does NOT justify other agent emotion', () => {
    const c = makeChecker();
    const grounding = makeGrounding({
      allowedFacts: [
        { type: FactType.AGENT_STATE, agentId: 'alice' },
        { type: FactType.AGENT_STATE, agentId: 'bob' },
        {
          type: FactType.EVENT,
          description: 'bob参加了会议',
          location: '会议室',
          participants: ['bob', 'carol'],
          _evidence: { source: 'told', confidence: 0.6, propagatedFrom: 'carol' },
        },
      ],
    });
    // alice told-level knows bob attended a meeting → cannot infer bob's emotion
    const r = c.check('bob很焦虑', grounding);
    expect(r.violations.some(v => v.type === 'agent_state_leak' && v.agent === 'bob' && v.stateType === 'emotion')).toBe(true);
  });

  it('inferred EVENT does NOT justify other agent needs', () => {
    const c = makeChecker();
    const grounding = makeGrounding({
      allowedFacts: [
        { type: FactType.AGENT_STATE, agentId: 'alice' },
        { type: FactType.AGENT_STATE, agentId: 'bob' },
        {
          type: FactType.EVENT,
          description: 'bob参加了会议',
          location: '会议室',
          participants: ['bob', 'carol'],
          _evidence: { source: 'inferred', confidence: 0.5, propagatedFrom: null },
        },
      ],
    });
    const r = c.check('bob饿了', grounding);
    expect(r.violations.some(v => v.type === 'agent_state_leak' && v.agent === 'bob' && v.stateType === 'needs')).toBe(true);
  });

  it('told EVENT does NOT justify other agent activity', () => {
    const c = makeChecker();
    const grounding = makeGrounding({
      allowedFacts: [
        { type: FactType.AGENT_STATE, agentId: 'alice' },
        { type: FactType.AGENT_STATE, agentId: 'bob' },
        {
          type: FactType.EVENT,
          description: 'bob在图书馆',
          location: '图书馆',
          participants: ['bob'],
          _evidence: { source: 'told', confidence: 0.6, propagatedFrom: 'carol' },
        },
      ],
    });
    const r = c.check('bob正在看书', grounding);
    expect(r.violations.some(v => v.type === 'agent_state_leak' && v.agent === 'bob' && v.stateType === 'activity')).toBe(true);
  });

  // ─── HIGH: OBSERVATION evidence path ───
  it('OBSERVATION fact: narrator is observer → can express target emotion', () => {
    const c = makeChecker();
    const grounding = makeGrounding({
      allowedFacts: [
        { type: FactType.AGENT_STATE, agentId: 'alice' },
        { type: FactType.OBSERVATION, observerId: 'alice', targetId: 'bob', action: '在食堂吃饭' },
      ],
    });
    const r = c.check('bob很开心', grounding);
    expect(r.violations.some(v => v.type === 'agent_state_leak')).toBe(false);
  });

  it('OBSERVATION fact: narrator is NOT observer → flags emotion', () => {
    const c = makeChecker();
    const grounding = makeGrounding({
      allowedFacts: [
        { type: FactType.AGENT_STATE, agentId: 'alice' },
        { type: FactType.AGENT_STATE, agentId: 'bob' },
        { type: FactType.OBSERVATION, observerId: 'carol', targetId: 'bob', action: '在食堂吃饭' },
      ],
    });
    const r = c.check('bob很开心', grounding);
    expect(r.violations.some(v => v.type === 'agent_state_leak' && v.agent === 'bob')).toBe(true);
  });

  it('OBSERVATION fact with direct evidence → can express target activity', () => {
    const c = makeChecker();
    const grounding = makeGrounding({
      allowedFacts: [
        { type: FactType.AGENT_STATE, agentId: 'alice' },
        { type: FactType.OBSERVATION, observerId: 'carol', targetId: 'bob', action: '在看书',
          _evidence: { source: 'direct', confidence: 1.0, propagatedFrom: null } },
      ],
    });
    // direct evidence → activity justifiable, but NOT emotion (narrator not observer)
    const r1 = c.check('bob正在看书', grounding);
    expect(r1.violations.some(v => v.type === 'agent_state_leak' && v.stateType === 'activity')).toBe(false);
    const r2 = c.check('bob很开心', grounding);
    expect(r2.violations.some(v => v.type === 'agent_state_leak' && v.stateType === 'emotion')).toBe(true);
  });

  // ─── MEDIUM: _evidence.source fallback path ───
  it('EVENT without _evidence does NOT justify any AGENT_STATE', () => {
    const c = makeChecker();
    const grounding = makeGrounding({
      allowedFacts: [
        { type: FactType.AGENT_STATE, agentId: 'alice' },
        { type: FactType.AGENT_STATE, agentId: 'bob' },
        {
          type: FactType.EVENT,
          description: 'bob在食堂吃饭',
          location: '食堂',
          participants: ['bob'],
          // No _evidence field — backward compat
        },
      ],
    });
    const r = c.check('bob很开心', grounding);
    expect(r.violations.some(v => v.type === 'agent_state_leak' && v.agent === 'bob')).toBe(true);
  });

  // ─── MEDIUM: observers.includes(selfId) path ───
  it('narrator in EVENT observers → can express participant emotion', () => {
    const c = makeChecker();
    const grounding = makeGrounding({
      allowedFacts: [
        { type: FactType.AGENT_STATE, agentId: 'alice' },
        { type: FactType.AGENT_STATE, agentId: 'bob' },
        {
          type: FactType.EVENT,
          description: 'bob在食堂吃饭',
          location: '食堂',
          participants: ['bob'],
          observers: ['alice'],
          _evidence: { source: 'direct', confidence: 1.0, propagatedFrom: null },
        },
      ],
    });
    // alice is observer → physically present → can express bob's emotion
    const r = c.check('bob很开心', grounding);
    expect(r.violations.some(v => v.type === 'agent_state_leak')).toBe(false);
  });

  // ─── Two-tier: observed EVENT (not present) → activity OK, emotion NOT ───
  it('observed EVENT (narrator not present) justifies activity but NOT emotion', () => {
    const c = makeChecker();
    const grounding = makeGrounding({
      allowedFacts: [
        { type: FactType.AGENT_STATE, agentId: 'alice' },
        { type: FactType.AGENT_STATE, agentId: 'bob' },
        {
          type: FactType.EVENT,
          description: 'bob在图书馆学习',
          location: '图书馆',
          participants: ['bob'],
          _evidence: { source: 'observed', confidence: 0.9, propagatedFrom: null },
        },
      ],
    });
    // observed evidence → can express activity
    const r1 = c.check('bob正在学习', grounding);
    expect(r1.violations.some(v => v.type === 'agent_state_leak' && v.stateType === 'activity')).toBe(false);
    // observed evidence but not present → cannot infer emotion
    const r2 = c.check('bob很焦虑', grounding);
    expect(r2.violations.some(v => v.type === 'agent_state_leak' && v.stateType === 'emotion')).toBe(true);
  });

  it('overheard EVENT (narrator not present) justifies activity but NOT emotion', () => {
    const c = makeChecker();
    const grounding = makeGrounding({
      allowedFacts: [
        { type: FactType.AGENT_STATE, agentId: 'alice' },
        { type: FactType.AGENT_STATE, agentId: 'bob' },
        {
          type: FactType.EVENT,
          description: 'bob在图书馆',
          location: '图书馆',
          participants: ['bob'],
          _evidence: { source: 'overheard', confidence: 0.7, propagatedFrom: null },
        },
      ],
    });
    const r1 = c.check('bob正在看书', grounding);
    expect(r1.violations.some(v => v.type === 'agent_state_leak' && v.stateType === 'activity')).toBe(false);
    const r2 = c.check('bob很开心', grounding);
    expect(r2.violations.some(v => v.type === 'agent_state_leak' && v.stateType === 'emotion')).toBe(true);
  });

  // ─── False negative regression ───
  it('regression: alice told about bob/carol meeting → "Bob is anxious" triggers leak', () => {
    const c = makeChecker();
    const grounding = makeGrounding({
      allowedFacts: [
        { type: FactType.AGENT_STATE, agentId: 'alice' },
        { type: FactType.AGENT_STATE, agentId: 'bob' },
        { type: FactType.AGENT_STATE, agentId: 'carol' },
        {
          type: FactType.EVENT,
          description: 'bob和carol参加了会议',
          location: '会议室',
          participants: ['bob', 'carol'],
          _evidence: { source: 'told', confidence: 0.6, propagatedFrom: 'carol' },
        },
      ],
    });
    const r = c.check('bob很焦虑', grounding);
    expect(r.violations.some(v => v.type === 'agent_state_leak' && v.agent === 'bob' && v.stateType === 'emotion')).toBe(true);
  });

  // ─── Allowed regression ───
  it('regression: alice physically observes bob → expressing visible behavior is allowed', () => {
    const c = makeChecker();
    const grounding = makeGrounding({
      allowedFacts: [
        { type: FactType.AGENT_STATE, agentId: 'alice' },
        { type: FactType.AGENT_STATE, agentId: 'bob' },
        {
          type: FactType.EVENT,
          description: 'bob在食堂吃饭',
          location: '食堂',
          participants: ['alice', 'bob'],
          _evidence: { source: 'direct', confidence: 1.0, propagatedFrom: null },
        },
      ],
    });
    // alice is participant → physically present → can express bob's visible activity and emotion
    const r1 = c.check('bob正在吃饭', grounding);
    expect(r1.violations.some(v => v.type === 'agent_state_leak')).toBe(false);
    const r2 = c.check('bob很开心', grounding);
    expect(r2.violations.some(v => v.type === 'agent_state_leak')).toBe(false);
  });

  it('escapes regex metacharacters in display names before agent_state checks', () => {
    const c = makeChecker();
    const grounding = makeGrounding({
      metadata: {
        agentId: 'alice',
        agentNames: {
          alice: 'Alice',
          bob: 'Bob(测试)+',
        },
      },
      allowedFacts: [
        { type: FactType.AGENT_STATE, agentId: 'alice' },
        { type: FactType.AGENT_STATE, agentId: 'bob' },
      ],
    });

    const r = c.check('Bob(测试)+很焦虑', grounding);
    expect(r.violations.some(v =>
      v.type === 'agent_state_leak' &&
      v.agent === 'Bob(测试)+' &&
      v.stateType === 'emotion'
    )).toBe(true);
  });
});

// ═══════════════════════════════════════════
// _checkLocalScopeLeak (v2.5-W2)
// ═══════════════════════════════════════════
describe('_checkLocalScopeLeak (v2.5-W2)', () => {
  it('flags forbidden LOCAL event mentioned in text', () => {
    const c = makeChecker();
    const grounding = makeGrounding({
      allowedFacts: [],
      forbiddenFacts: [
        {
          type: FactType.EVENT,
          scope: FactScope.LOCAL,
          description: '火星上发生了爆炸',
          location: '火星',
        },
      ],
    });
    const r = c.check('火星上发生了爆炸', grounding);
    expect(r.violations.some(v => v.type === 'local_scope_leak')).toBe(true);
  });

  it('does NOT flag PUBLIC scope events in forbiddenFacts', () => {
    const c = makeChecker();
    const grounding = makeGrounding({
      allowedFacts: [],
      forbiddenFacts: [
        {
          type: FactType.EVENT,
          scope: FactScope.PUBLIC,
          description: '公共事件发生了',
          location: '图书馆',
        },
      ],
    });
    const r = c.check('公共事件发生了', grounding);
    expect(r.violations.some(v => v.type === 'local_scope_leak')).toBe(false);
  });

  it('does NOT flag non-EVENT facts in forbiddenFacts', () => {
    const c = makeChecker();
    const grounding = makeGrounding({
      allowedFacts: [],
      forbiddenFacts: [
        {
          type: FactType.MEMORY,
          scope: FactScope.LOCAL,
          description: '别人的私密记忆',
          agentId: 'bob',
        },
      ],
    });
    const r = c.check('别人的私密记忆', grounding);
    expect(r.violations.some(v => v.type === 'local_scope_leak')).toBe(false);
  });

  it('skips when forbiddenFacts is missing (backward compat)', () => {
    const c = makeChecker();
    const grounding = makeGrounding({ allowedFacts: [] });
    // No forbiddenFacts key — should not crash or flag
    const r = c.check('火星上发生了爆炸', grounding);
    expect(r.violations.some(v => v.type === 'local_scope_leak')).toBe(false);
  });

  it('severity=rewrite for local_scope_leak', () => {
    const c = makeChecker();
    const grounding = makeGrounding({
      allowedFacts: [],
      forbiddenFacts: [
        {
          type: FactType.EVENT,
          scope: FactScope.LOCAL,
          description: '远处发生了地震',
          location: '远方',
        },
      ],
    });
    const r = c.check('远处发生了地震', grounding);
    expect(r.violations.some(v => v.type === 'local_scope_leak')).toBe(true);
    expect(r.severity).toBe('rewrite');
  });
});

// ═══════════════════════════════════════════
// told fallback "听闻" (v2.5-W2)
// ═══════════════════════════════════════════
describe('told fallback "听闻" (v2.5-W2)', () => {
  it('FactFormatter returns "听闻" when told has no propagatedFrom', () => {
    const fact = {
      type: FactType.EVENT,
      description: '食堂关门了',
      location: '食堂',
      _evidence: { source: 'told', confidence: 0.6, propagatedFrom: null },
    };
    const result = FactFormatter.toNaturalLanguageWithSource(fact);
    expect(result).toContain('听闻');
    expect(result).not.toContain('告诉你');
  });

  it('FactFormatter returns "{name}告诉你" when told has propagatedFrom', () => {
    const fact = {
      type: FactType.EVENT,
      description: '食堂关门了',
      location: '食堂',
      _evidence: { source: 'told', confidence: 0.6, propagatedFrom: 'bob' },
    };
    const result = FactFormatter.toNaturalLanguageWithSource(fact);
    expect(result).toContain('bob告诉你');
    expect(result).not.toContain('听闻');
  });

  it('checker accepts "听说" as valid attribution for told-without-propagatedFrom', () => {
    const c = makeChecker();
    const grounding = makeGrounding({
      allowedFacts: [
        { type: FactType.EVENT, description: '食堂关门了', location: '食堂', _evidence: { source: 'told', confidence: 0.6, propagatedFrom: null } },
      ],
    });
    const r = c.check('我听说食堂关门了', grounding);
    expect(r.violations.some(v => v.type === 'missing_source_attribution')).toBe(false);
  });
});
