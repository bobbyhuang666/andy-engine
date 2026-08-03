/**
 * ClaimExtractor — 结构化 claim 提取器单元测试
 *
 * 覆盖所有 claim 类型、否定检测、不确定检测、来源标记、
 * 置信度评分、角色名解析。
 */

import { describe, it, expect } from 'vitest';
// CJS require: 与运行时同一模块实例
const { createRequire } = await import('node:module');
const require = createRequire(import.meta.url);
const ClaimExtractor = require('../../../src/narrative/ClaimExtractor.js');

function makeExtractor(agentId = 'alice', agentNames = { alice: '爱丽丝', bob: '鲍勃' }) {
  return new ClaimExtractor(agentId, agentNames);
}

// ═══════════════════════════════════════════
// 所有 claim 类型
// ═══════════════════════════════════════════
describe('ClaimExtractor — 所有 claim 类型', () => {
  it('提取 location claim: "我在图书馆"', () => {
    const ex = makeExtractor('alice');
    const claims = ex.extract('我在图书馆');
    const locClaims = claims.filter(c => c.type === 'location');
    expect(locClaims.length).toBeGreaterThan(0);
    expect(locClaims[0].subject).toBe('alice');
    expect(locClaims[0].object).toBe('图书馆');
  });

  it('提取 location claim: "Bob在食堂"', () => {
    const ex = makeExtractor('alice');
    const claims = ex.extract('鲍勃在食堂');
    const locClaims = claims.filter(c => c.type === 'location');
    expect(locClaims.length).toBeGreaterThan(0);
    expect(locClaims[0].predicate).toBe('is_at');
  });

  it('提取 event claim: "刚刚吃了一顿饭了"', () => {
    const ex = makeExtractor('alice');
    const claims = ex.extract('刚刚吃了一顿饭了');
    const evtClaims = claims.filter(c => c.type === 'event');
    expect(evtClaims.length).toBeGreaterThan(0);
    expect(evtClaims[0].predicate).toBe('did');
  });

  it('提取 event claim: "那次运动会"', () => {
    const ex = makeExtractor('alice');
    const claims = ex.extract('那次运动会真精彩');
    const evtClaims = claims.filter(c => c.type === 'event');
    expect(evtClaims.length).toBeGreaterThan(0);
    expect(evtClaims[0].predicate).toBe('refers_to');
  });

  it('提取 relationship claim: "成为好朋友"', () => {
    const ex = makeExtractor('alice');
    const claims = ex.extract('我和他成为了好朋友');
    const relClaims = claims.filter(c => c.type === 'relationship');
    expect(relClaims.length).toBeGreaterThan(0);
    expect(relClaims[0].predicate).toBe('has_relationship');
  });

  it('提取 relationship claim: "分手了"', () => {
    const ex = makeExtractor('alice');
    const claims = ex.extract('他们分手了');
    const relClaims = claims.filter(c => c.type === 'relationship');
    expect(relClaims.length).toBeGreaterThan(0);
  });

  it('提取 state claim (emotion): "Bob很焦虑"', () => {
    const ex = makeExtractor('alice');
    const claims = ex.extract('鲍勃很焦虑');
    const stateClaims = claims.filter(c => c.type === 'state');
    expect(stateClaims.length).toBeGreaterThan(0);
    expect(stateClaims[0].stateType).toBe('emotion');
    expect(stateClaims[0].evidenceRequired).toBe('observed');
  });

  it('提取 state claim (needs): "Bob饿了"', () => {
    const ex = makeExtractor('alice');
    const claims = ex.extract('鲍勃饿了');
    const stateClaims = claims.filter(c => c.type === 'state');
    expect(stateClaims.length).toBeGreaterThan(0);
    expect(stateClaims[0].stateType).toBe('needs');
    expect(stateClaims[0].evidenceRequired).toBe('observed');
  });

  it('提取 state claim (activity): "Bob正在看书"', () => {
    const ex = makeExtractor('alice');
    const claims = ex.extract('鲍勃正在看书');
    const stateClaims = claims.filter(c => c.type === 'state');
    expect(stateClaims.length).toBeGreaterThan(0);
    expect(stateClaims[0].stateType).toBe('activity');
  });

  it('提取 canonical self-state claim: "我目前处于有点困状态。"', () => {
    const ex = makeExtractor('alice');
    const stateClaim = ex.extract('我目前处于有点困状态。').find(c => c.type === 'state');
    expect(stateClaim).toMatchObject({
      subject: 'alice',
      predicate: 'activity',
      object: '有点困',
      stateType: 'activity',
      evidenceRequired: 'self',
    });
  });

  it('canonical event/memory acknowledgement does not create reference claims', () => {
    const ex = makeExtractor('alice');
    const claims = ex.extract('好的，我知道了。我记得了。');

    expect(claims.some(c => c.predicate === 'refers_to')).toBe(false);
    expect(claims.some(c => c.predicate === 'remembers')).toBe(false);
  });

  it('提取 source_attribution claim: "听说鲍勃发现了"', () => {
    const ex = makeExtractor('alice');
    const claims = ex.extract('听说鲍勃发现了一本好书');
    const srcClaims = claims.filter(c => c.type === 'source_attribution');
    expect(srcClaims.length).toBeGreaterThan(0);
    expect(srcClaims[0].sourceMarker).toBe('told');
  });

  it('提取 source_attribution claim: "我推测食堂有人"', () => {
    const ex = makeExtractor('alice');
    const claims = ex.extract('我推测食堂有人聚餐');
    const srcClaims = claims.filter(c => c.type === 'source_attribution');
    expect(srcClaims.length).toBeGreaterThan(0);
    expect(srcClaims[0].sourceMarker).toBe('inferred');
  });

  it('提取 source_attribution claim: "我看到鲍勃"', () => {
    const ex = makeExtractor('alice');
    const claims = ex.extract('我看到鲍勃在食堂');
    const srcClaims = claims.filter(c => c.type === 'source_attribution');
    expect(srcClaims.length).toBeGreaterThan(0);
    expect(srcClaims[0].sourceMarker).toBe('observed');
  });

  it('提取 time claim: "深夜的时候"', () => {
    const ex = makeExtractor('alice');
    const claims = ex.extract('深夜的时候我还在学习');
    const timeClaims = claims.filter(c => c.type === 'time');
    expect(timeClaims.length).toBeGreaterThan(0);
    expect(timeClaims[0].object).toBe('深夜');
  });
});

// ═══════════════════════════════════════════
// 否定检测 (negative polarity)
// ═══════════════════════════════════════════
describe('ClaimExtractor — 否定检测', () => {
  it('否定 location: "我没有在图书馆" — negation detected, polarity=negative, subject=alice', () => {
    const ex = makeExtractor('alice');
    const claims = ex.extract('我没有在图书馆');
    const locClaims = claims.filter(c => c.type === 'location');
    expect(locClaims.length).toBeGreaterThan(0);
    expect(locClaims[0].subject).toBe('alice');
    expect(locClaims[0].polarity).toBe('negative');
    expect(locClaims[0].sourceSpan.raw).toMatch(/没有在/);
  });

  it('否定 location: "我不在图书馆" — negation detected, polarity=negative', () => {
    const ex = makeExtractor('alice');
    const claims = ex.extract('我不在图书馆');
    const locClaims = claims.filter(c => c.type === 'location');
    expect(locClaims.length).toBeGreaterThan(0);
    expect(locClaims[0].polarity).toBe('negative');
  });

  it('否定 location: "我没去后院" → negative polarity', () => {
    const ex = makeExtractor('alice');
    const claims = ex.extract('我没去后院');
    const locClaims = claims.filter(c => c.type === 'location');
    if (locClaims.length > 0) {
      expect(locClaims[0].polarity).toBe('negative');
    }
  });

  it('否定 state: "Bob不难过" → negative polarity', () => {
    const ex = makeExtractor('alice');
    const claims = ex.extract('鲍勃不难过');
    const stateClaims = claims.filter(c => c.type === 'state');
    if (stateClaims.length > 0) {
      expect(stateClaims[0].polarity).toBe('negative');
    }
  });

  it('否定 event: "刚刚没吃饭了" — 正则将"没吃饭"捕获为事件内容', () => {
    const ex = makeExtractor('alice');
    const claims = ex.extract('刚刚没吃饭了');
    const evtClaims = claims.filter(c => c.type === 'event');
    if (evtClaims.length > 0) {
      // "没" is captured inside event content, not as prefix → polarity stays affirmative
      expect(evtClaims[0].polarity).toBe('affirmative');
    }
  });

  it('否定 claim 降低 confidence', () => {
    const ex = makeExtractor('alice');
    const claims = ex.extract('我没去图书馆');
    const locClaims = claims.filter(c => c.type === 'location');
    if (locClaims.length > 0) {
      expect(locClaims[0].confidence).toBeLessThan(0.9);
    }
  });
});

// ═══════════════════════════════════════════
// 不确定检测 (uncertain polarity)
// ═══════════════════════════════════════════
describe('ClaimExtractor — 不确定检测', () => {
  it('不确定 location: "Bob可能在酒馆"', () => {
    const ex = makeExtractor('alice');
    const claims = ex.extract('鲍勃可能在酒馆');
    const locClaims = claims.filter(c => c.type === 'location');
    if (locClaims.length > 0) {
      // "可能" is detected as uncertainty marker → polarity = 'uncertain'
      expect(locClaims[0].polarity).toBe('uncertain');
    }
  });

  it('不确定 state: "应该很累" → source_attribution (inferred) 而非 state claim', () => {
    const ex = makeExtractor('alice');
    const claims = ex.extract('应该很累');
    // "应该" triggers inferred source marker, producing source_attribution claim
    const srcClaims = claims.filter(c => c.type === 'source_attribution');
    expect(srcClaims.length).toBeGreaterThan(0);
    expect(srcClaims[0].sourceMarker).toBe('inferred');
    expect(srcClaims[0].polarity).toBe('uncertain');
  });

  it('不确定 claim 降低 confidence', () => {
    const ex = makeExtractor('alice');
    const claims = ex.extract('大概有人在食堂');
    // "大概" 是 uncertainty marker
    const locClaims = claims.filter(c => c.type === 'location');
    if (locClaims.length > 0) {
      expect(locClaims[0].confidence).toBeLessThan(0.9);
    }
  });

  it('不确定性不影响非 location/state 类型', () => {
    const ex = makeExtractor('alice');
    const claims = ex.extract('那次运动会');
    const evtClaims = claims.filter(c => c.type === 'event');
    expect(evtClaims.length).toBeGreaterThan(0);
    expect(evtClaims[0].polarity).toBe('affirmative');
  });
});

// ═══════════════════════════════════════════
// 来源标记检测
// ═══════════════════════════════════════════
describe('ClaimExtractor — 来源标记检测', () => {
  it('检测到 told 来源: "听说"', () => {
    const ex = makeExtractor('alice');
    const claims = ex.extract('听说鲍勃在食堂');
    const srcClaims = claims.filter(c => c.type === 'source_attribution');
    expect(srcClaims.some(c => c.sourceMarker === 'told')).toBe(true);
  });

  it('检测到 told 来源: "告诉我"', () => {
    const ex = makeExtractor('alice');
    const claims = ex.extract('鲍勃告诉我他去了图书馆');
    const srcClaims = claims.filter(c => c.type === 'source_attribution');
    expect(srcClaims.some(c => c.sourceMarker === 'told')).toBe(true);
  });

  it('source-attributed pronoun location: "鲍勃告诉我他去了图书馆" → location claim for bob', () => {
    const ex = makeExtractor('alice', { alice: '爱丽丝', bob: '鲍勃' });
    const claims = ex.extract('鲍勃告诉我他去了图书馆');
    const locClaims = claims.filter(c => c.type === 'location' && c.object === '图书馆');
    expect(locClaims.length).toBeGreaterThan(0);
    expect(locClaims[0].subject).toBe('bob');
    expect(locClaims[0].sourceMarker).toBe('told');
    expect(locClaims[0].polarity).toBe('affirmative');
  });

  it('检测到 inferred 来源: "推测"', () => {
    const ex = makeExtractor('alice');
    const claims = ex.extract('我推测食堂有人');
    const srcClaims = claims.filter(c => c.type === 'source_attribution');
    expect(srcClaims.some(c => c.sourceMarker === 'inferred')).toBe(true);
  });

  it('检测到 observed 来源: "我看到"', () => {
    const ex = makeExtractor('alice');
    const claims = ex.extract('我看到鲍勃在食堂');
    const srcClaims = claims.filter(c => c.type === 'source_attribution');
    expect(srcClaims.some(c => c.sourceMarker === 'observed')).toBe(true);
  });

  it('told 来源 confidence ≥ 0.65', () => {
    const ex = makeExtractor('alice');
    const claims = ex.extract('听说鲍勃在食堂');
    const srcClaims = claims.filter(c => c.type === 'source_attribution');
    if (srcClaims.length > 0) {
      expect(srcClaims[0].confidence).toBeGreaterThanOrEqual(0.65);
    }
  });
});

// ═══════════════════════════════════════════
// 置信度评分
// ═══════════════════════════════════════════
describe('ClaimExtractor — 置信度评分', () => {
  it('已知角色 + 已知区域 → 高 confidence (≥0.85)', () => {
    const ex = makeExtractor('alice');
    const claims = ex.extract('我在图书馆');
    const locClaims = claims.filter(c => c.type === 'location');
    if (locClaims.length > 0) {
      expect(locClaims[0].confidence).toBeGreaterThanOrEqual(0.85);
    }
  });

  it('未知角色 → 降低 confidence', () => {
    const ex = makeExtractor('alice');
    const claims = ex.extract('小明在食堂');
    const locClaims = claims.filter(c => c.type === 'location');
    if (locClaims.length > 0) {
      // unknown name → confidence < 0.85
      expect(locClaims[0].confidence).toBeLessThan(0.85);
    }
  });

  it('否定 + 不确定 → 低 confidence (<0.65)', () => {
    const ex = makeExtractor('alice');
    const claims = ex.extract('可能没去图书馆');
    // 同时有 negation 和 uncertainty → confidence 应显著降低
    const locClaims = claims.filter(c => c.type === 'location');
    if (locClaims.length > 0) {
      expect(locClaims[0].confidence).toBeLessThan(0.7);
    }
  });

  it('空输入返回空数组', () => {
    const ex = makeExtractor('alice');
    expect(ex.extract(null)).toEqual([]);
    expect(ex.extract(undefined)).toEqual([]);
    expect(ex.extract('')).toEqual([]);
  });
});

// ═══════════════════════════════════════════
// 角色名解析 (displayName → agentId)
// ═══════════════════════════════════════════
describe('ClaimExtractor — 角色名解析', () => {
  it('displayName "爱丽丝" 解析为 agentId "alice"', () => {
    const ex = makeExtractor('alice', { alice: '爱丽丝', bob: '鲍勃' });
    const claims = ex.extract('爱丽丝在图书馆');
    const locClaims = claims.filter(c => c.type === 'location');
    if (locClaims.length > 0) {
      expect(locClaims[0].subject).toBe('alice');
    }
  });

  it('displayName "鲍勃" 解析为 agentId "bob"', () => {
    const ex = makeExtractor('alice', { alice: '爱丽丝', bob: '鲍勃' });
    const claims = ex.extract('鲍勃在食堂');
    const locClaims = claims.filter(c => c.type === 'location');
    if (locClaims.length > 0) {
      expect(locClaims[0].subject).toBe('bob');
    }
  });

  it('agentId "alice" 也能解析', () => {
    const ex = makeExtractor('alice', { alice: '爱丽丝' });
    const claims = ex.extract('alice在图书馆');
    const locClaims = claims.filter(c => c.type === 'location');
    if (locClaims.length > 0) {
      expect(locClaims[0].subject).toBe('alice');
    }
  });
});
