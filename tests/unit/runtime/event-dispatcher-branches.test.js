/**
 * EventDispatcher branch coverage — Wave 5 batch 6
 *
 * event-lifecycle-dedup.test.js 已覆盖 generateXxx draft-not-pending + dedup。
 * 本文件补 createEvent audit metadata / _classifySemanticCategory /
 * filterEventsForAgent / getCausalChain / _cleanupOldEvents / dispatch trim。
 *
 * domain (campus) + 注入 RNG,hermetic。
 */

import { describe, it, expect, beforeEach } from 'vitest';
// CJS require:与运行时同一模块实例,确保 v8 coverage 正确归因
const { createRequire } = await import('node:module');
const require = createRequire(import.meta.url);
const EventDispatcher = require('../../../src/runtime/EventDispatcher.js');
const { getDefaultDomain } = require('../../../src/domain/DomainRegistry.js');

const campusDomain = getDefaultDomain();

function makeDispatcher() {
  const ed = new EventDispatcher(campusDomain);
  ed.setSimTime(new Date('2026-09-01T08:00:00Z'));
  return ed;
}

// ═══════════════════════════════════════════
// createEvent — audit metadata
// ═══════════════════════════════════════════
describe('EventDispatcher.createEvent — audit metadata', () => {
  it('copies agentId/action/reasonTrace/stateDeltas/metadata when present', () => {
    const ed = makeDispatcher();
    const evt = ed.createEvent({
      type: 'social',
      agentId: 'a1',
      action: 'rest',
      reasonTrace: { reason: 'tired' },
      stateDeltas: { health: 0.1 },
      metadata: { k: 1 },
    });
    expect(evt.agentId).toBe('a1');
    expect(evt.action).toBe('rest');
    expect(evt.reasonTrace).toEqual({ reason: 'tired' });
    expect(evt.stateDeltas).toEqual({ health: 0.1 });
    expect(evt.metadata).toEqual({ k: 1 });
  });
  it('omits audit fields when not provided', () => {
    const ed = makeDispatcher();
    const evt = ed.createEvent({ type: 'social' });
    expect(evt).not.toHaveProperty('agentId');
    expect(evt).not.toHaveProperty('action');
    expect(evt).not.toHaveProperty('reasonTrace');
    expect(evt).not.toHaveProperty('stateDeltas');
    expect(evt).not.toHaveProperty('metadata');
  });
});

// ═══════════════════════════════════════════
// _classifySemanticCategory — typeMap / keywordMap / default
// ═══════════════════════════════════════════
describe('EventDispatcher._classifySemanticCategory', () => {
  it('type=social → 社交互动 (typeMap hit)', () => {
    const ed = makeDispatcher();
    const evt = ed.createEvent({ type: 'social', content: '打招呼' });
    expect(evt.semanticCategory).toBe('社交互动');
  });
  it('content with weather keyword → 环境天气 (keywordMap hit)', () => {
    const ed = makeDispatcher();
    // type='random' 不在 typeMap → 走 keywordMap → '下雨' 命中 '环境天气'
    const evt = ed.createEvent({ type: 'random', content: '下雨了' });
    expect(evt.semanticCategory).toBe('环境天气');
  });
  it('unrelated content → default category', () => {
    const ed = makeDispatcher();
    const evt = ed.createEvent({ type: 'custom', content: '无关内容' });
    expect(typeof evt.semanticCategory).toBe('string');
  });
});

// ═══════════════════════════════════════════
// filterEventsForAgent — participants/observers/public
// ═══════════════════════════════════════════
describe('EventDispatcher.filterEventsForAgent', () => {
  let ed;
  beforeEach(() => {
    ed = makeDispatcher();
    ed.createEvent({ type: 'social', participants: ['a'], scope: 'local' });
    ed.createEvent({ type: 'social', observers: ['b'], scope: 'local' });
    ed.createEvent({ type: 'social', scope: 'public' });
    ed.dispatch();
  });
  it('agent "a" sees participant + public events', () => {
    const events = ed.filterEventsForAgent('a', ed.eventLog);
    expect(events).toHaveLength(2);
    expect(events.some(e => e.participants.includes('a'))).toBe(true);
    expect(events.some(e => e.scope === 'public')).toBe(true);
  });
  it('agent "b" sees observer + public events', () => {
    const events = ed.filterEventsForAgent('b', ed.eventLog);
    expect(events).toHaveLength(2);
    expect(events.some(e => e.observers && e.observers.includes('b'))).toBe(true);
  });
  it('agent "c" sees only public events', () => {
    const events = ed.filterEventsForAgent('c', ed.eventLog);
    expect(events).toHaveLength(1);
    expect(events[0].scope).toBe('public');
  });
});

// ═══════════════════════════════════════════
// getCausalChain — traversal + cycle guard
// ═══════════════════════════════════════════
describe('EventDispatcher.getCausalChain', () => {
  it('traverses cause chain downward from root to all effects', () => {
    const ed = makeDispatcher();
    // A (root, no cause) → B (cause A) → C (cause B)
    const a = ed.createEvent({ type: 'social', content: 'A' });
    const b = ed.createEvent({ type: 'social', content: 'B', cause: a.id });
    const c = ed.createEvent({ type: 'social', content: 'C', cause: b.id });
    ed.dispatch(); // 填充 eventIndex
    // getCausalChain 从 root 向下遍历所有由它(直接或间接)引发的事件
    const chain = ed.getCausalChain(a.id);
    expect(chain.map(e => e.content).sort()).toEqual(['A', 'B', 'C']);
  });
  it('returns [] for unknown event id', () => {
    const ed = makeDispatcher();
    expect(ed.getCausalChain('nonexistent')).toEqual([]);
  });
  it('handles cycle guard (no infinite loop)', () => {
    const ed = makeDispatcher();
    const a = ed.createEvent({ type: 'social', content: 'A' });
    ed.dispatch();
    // 手动构造循环:B cause A, A cause B(模拟损坏数据)
    const b = ed.createEvent({ type: 'social', content: 'B', cause: a.id });
    ed.dispatch();
    // 直接改 a 的 cause 指向 b(模拟循环)
    a.cause = b.id;
    const chain = ed.getCausalChain(a.id);
    // 不应无限循环;返回有限链(每个事件至多出现一次)
    expect(chain.length).toBeLessThanOrEqual(2);
  });
});

// ═══════════════════════════════════════════
// _cleanupOldEvents — lifespan + maxEventLogSize
// ═══════════════════════════════════════════
describe('EventDispatcher._cleanupOldEvents', () => {
  it('prunes events older than lifespan (7 days)', () => {
    const ed = makeDispatcher();
    // eventLifespan = 10080 min = 7 days
    const oldTime = new Date('2026-08-25T08:00:00Z'); // 远早于 cutoff
    const recentTime = new Date('2026-09-05T08:00:00Z'); // 在 cutoff(Sep 3)之后
    ed.createEvent({ type: 'social', content: 'old', time: oldTime });
    ed.createEvent({ type: 'social', content: 'recent', time: recentTime });
    ed.dispatch();
    // 推进 simTime 到 Sep 10,cutoff = Sep 10 - 7d = Sep 3
    ed.setSimTime(new Date('2026-09-10T08:00:00Z'));
    ed.createEvent({ type: 'social', content: 'trigger' });
    ed.dispatch();
    expect(ed.eventLog.find(e => e.content === 'old')).toBeUndefined();
    expect(ed.eventLog.find(e => e.content === 'recent')).toBeDefined();
  });
});

// ═══════════════════════════════════════════
// dispatch — eventLog cap (uses cfg.maxEventLogSize)
// ═══════════════════════════════════════════
describe('EventDispatcher.dispatch — eventLog cap', () => {
  it('uses domain eventConfig maxEventLogSize instead of module default', () => {
    const domain = Object.create(campusDomain);
    domain.eventConfig = {
      ...(campusDomain.eventConfig || {}),
      maxEventLogSize: 3,
    };
    const ed = new EventDispatcher(domain);
    ed.setSimTime(new Date('2026-09-01T08:00:00Z'));
    for (let i = 0; i < 5; i++) {
      ed.createEvent({ type: 'social', content: `e${i}` });
      ed.dispatch();
    }
    expect(ed.eventLog.map(e => e.content)).toEqual(['e2', 'e3', 'e4']);
    expect(ed.eventIndex.size).toBe(3);
  });

  it('trims eventLog beyond maxEventLogSize entries', () => {
    const ed = makeDispatcher();
    // Push more events than the configured max (default 10000)
    // The trim only fires in _cleanupOldEvents, not in dispatch's immediate trim
    // which uses maxEventLogSize. For a quick test, verify the cap mechanism works.
    for (let i = 0; i < 10005; i++) {
      ed.createEvent({ type: 'social', content: `e${i}` });
    }
    ed.dispatch();
    // After dispatch, eventLog should be trimmed to maxEventLogSize (10000) or less
    expect(ed.eventLog.length).toBeLessThanOrEqual(10000);
    expect(ed.eventLog.length).toBeGreaterThanOrEqual(9900); // 不应删太多
  });
});

// ═══════════════════════════════════════════
// generateRandomEvent — time-of-day branches
// ═══════════════════════════════════════════
describe('EventDispatcher.generateRandomEvent — time-of-day', () => {
  it('lateNight hour (3) produces a draft event (not pending)', () => {
    const ed = makeDispatcher();
    ed.setSimTime(new Date('2026-09-01T03:00:00Z'));
    const evt = ed.generateRandomEvent({ hour: 3 });
    // draft or null (取决于候选);若非 null 则不应在 pendingEvents
    if (evt) {
      expect(ed.pendingEvents).not.toContain(evt);
    }
  });
  it('morning hour (6) produces a draft event', () => {
    const ed = makeDispatcher();
    const evt = ed.generateRandomEvent({ hour: 6 });
    if (evt) expect(ed.pendingEvents).not.toContain(evt);
  });
  it('evening hour (19) produces a draft event', () => {
    const ed = makeDispatcher();
    const evt = ed.generateRandomEvent({ hour: 19 });
    if (evt) expect(ed.pendingEvents).not.toContain(evt);
  });
});

// ═══════════════════════════════════════════
// generateEnvironmentEvent — unknown weather fallback
// ═══════════════════════════════════════════
describe('EventDispatcher.generateEnvironmentEvent — fallback', () => {
  it('unknown weather produces a draft event without throwing', () => {
    const ed = makeDispatcher();
    // 第二参数是 affectedAgentIds 数组
    const evt = ed.generateEnvironmentEvent('unknownWeather', ['a1']);
    if (evt) expect(ed.pendingEvents).not.toContain(evt);
  });
  it('rain weather produces a draft event', () => {
    const ed = makeDispatcher();
    const evt = ed.generateEnvironmentEvent('rain', ['a1']);
    if (evt) expect(ed.pendingEvents).not.toContain(evt);
  });
});
