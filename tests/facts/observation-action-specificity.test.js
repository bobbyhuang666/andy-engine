/**
 * FactEmitter OBSERVATION action specificity tests
 *
 * R8.3: 陌生人相遇的交互事件 content 是泛化模板（"在附近注意到有人"），
 * 直接成为 OBSERVATION fact 的 action 后信息量不足、语义冗余
 * （"观察到 Maren 在附近注意到有人"）。emitObservationFacts 应改用
 * 被观察目标当前的具体动作/状态（domain-driven，不硬编码世界词）。
 *
 * 验证目标：
 *   - 泛化模板 content → action 反映被观察目标当前状态 + 观察地点
 *   - 具体 content（如"一起聊了会天"）→ 保留原 content
 *   - action 含具体状态词、length > 6、语义不冗余"注意到...注意到"
 *   - 不传 agents/domain 时回退到原 content（向后兼容）
 *   - engine.tick() 产生的 OBSERVATION fact action 非泛化模板
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { WorldFactStore, FactEmitter } from '../../facts/index.js';
import { FactType } from '../../src/canon/FactSchema.js';
import tavern from '../../presets/tavern/index.js';
import campus from '../../presets/campus/index.js';

const TEST_START = new Date('2026-09-01T08:00:00Z');
const englishDomain = {
  narrativeTemplates: {
    observationAction: {
      genericTemplates: ['noticed someone nearby'],
      stateMap: { resting: 'resting', working: 'working' },
      withRegionTemplate: '{state} at {region}',
      template: '{state}',
    },
  },
};

function makeAgentStub(state, opts = {}) {
  return {
    id: opts.id || 'target',
    stateMachine: { currentState: state },
    position: opts.position || '酒馆',
  };
}

function makeEvent(content, region, agentA = 'alice', agentB = 'bob') {
  return {
    type: 'social',
    scope: 'local',
    location: region,
    participants: [agentA, agentB],
    content,
    time: TEST_START,
    effects: [],
  };
}

describe('FactEmitter.emitObservationFacts — action specificity', () => {
  let factStore;
  let emitter;

  beforeEach(() => {
    factStore = new WorldFactStore();
    emitter = new FactEmitter(factStore, {});
    emitter.setSimTime(TEST_START);
  });

  it('泛化模板 content 被替换为被观察目标的具体动作 + 地点', () => {
    const agents = new Map([
      ['alice', makeAgentStub('工作', { id: 'alice' })],
      ['bob', makeAgentStub('休息', { id: 'bob' })],
    ]);
    const events = [makeEvent('在附近注意到有人', '酒馆')];

    const facts = emitter.emitObservationFacts(events, agents, tavern);

    expect(facts).toHaveLength(2);
    // alice 观察 bob（state=休息）→ "正在酒馆里休息"
    const aliceObs = facts.find((f) => f.observerId === 'alice');
    expect(aliceObs.targetId).toBe('bob');
    expect(aliceObs.action).toBe('正在酒馆里休息');
    // bob 观察 alice（state=工作）→ "正在酒馆里工作"
    const bobObs = facts.find((f) => f.observerId === 'bob');
    expect(bobObs.targetId).toBe('alice');
    expect(bobObs.action).toBe('正在酒馆里工作');
  });

  it('action 含具体状态词、length > 6、语义不冗余"注意到...注意到"', () => {
    const agents = new Map([
      ['alice', makeAgentStub('聊天', { id: 'alice' })],
      ['bob', makeAgentStub('喝酒', { id: 'bob' })],
    ]);
    const events = [makeEvent('在附近注意到有人，没什么特别的', '酒馆')];

    const facts = emitter.emitObservationFacts(events, agents, tavern);

    for (const f of facts) {
      expect(f.action.length).toBeGreaterThan(6);
      // 非泛化模板
      expect(f.action).not.toContain('在附近注意到有人');
      // 语义不冗余"注意到"
      expect(f.action).not.toContain('注意到');
    }
  });

  it('具体交互 content（如"一起聊了会天"）保留原 content', () => {
    const agents = new Map([
      ['alice', makeAgentStub('聊天', { id: 'alice' })],
      ['bob', makeAgentStub('聊天', { id: 'bob' })],
    ]);
    const events = [makeEvent('一起聊了会天，气氛很愉快', '酒馆')];

    const facts = emitter.emitObservationFacts(events, agents, tavern);

    // 具体 content 保留——不被状态替换
    for (const f of facts) {
      expect(f.action).toBe('一起聊了会天，气氛很愉快');
    }
  });

  it('不传 agents/domain 时回退到原 content（向后兼容）', () => {
    const events = [makeEvent('在附近注意到有人', '酒馆')];

    // 完全不传 agents/domain（旧调用方）
    const factsOld = emitter.emitObservationFacts(events);
    for (const f of factsOld) expect(f.action).toBe('在附近注意到有人');

    // 只传 agents（无 domain）
    const agents = new Map([['alice', makeAgentStub('休息', { id: 'alice' })], ['bob', makeAgentStub('工作', { id: 'bob' })]]);
    factStore = new WorldFactStore();
    emitter = new FactEmitter(factStore, {});
    emitter.setSimTime(TEST_START);
    const factsNoDomain = emitter.emitObservationFacts(events, agents, null);
    for (const f of factsNoDomain) expect(f.action).toBe('在附近注意到有人');
  });

  it('campus preset 状态名经 statePositionMap 映射为完整动作短语', () => {
    const agents = new Map([
      ['alice', makeAgentStub('在图书馆', { id: 'alice', position: '图书馆' })],
      ['bob', makeAgentStub('在上课', { id: 'bob', position: '教学楼' })],
    ]);
    const events = [{
      type: 'social', scope: 'local', location: '图书馆',
      participants: ['alice', 'bob'], content: '在附近注意到有人', time: TEST_START, effects: [],
    }];

    const facts = emitter.emitObservationFacts(events, agents, campus);

    const aliceObs = facts.find((f) => f.observerId === 'alice');
    // bob state="在上课" → statePositionMap["在上课"]="在教室上课" → "正在教室上课"
    expect(aliceObs.action).toBe('正在教室上课');
    const bobObs = facts.find((f) => f.observerId === 'bob');
    // alice state="在图书馆" → statePositionMap["在图书馆"]="在图书馆" → "正在图书馆"
    expect(bobObs.action).toBe('正在图书馆');
  });

  it('custom English domain owns generic recognition and rendering', () => {
    const agents = new Map([
      ['alice', makeAgentStub('working', { id: 'alice' })],
      ['bob', makeAgentStub('resting', { id: 'bob' })],
    ]);
    const events = [makeEvent('noticed someone nearby', 'square')];

    const facts = emitter.emitObservationFacts(events, agents, englishDomain);

    expect(facts.find((f) => f.observerId === 'alice').action).toBe('resting at square');
    expect(facts.find((f) => f.observerId === 'bob').action).toBe('working at square');
  });

  it('incomplete observation config conservatively preserves interaction content', () => {
    const agents = new Map([
      ['alice', makeAgentStub('resting', { id: 'alice' })],
      ['bob', makeAgentStub('working', { id: 'bob' })],
    ]);
    const event = makeEvent('noticed someone nearby', 'square');

    const facts = emitter.emitObservationFacts([event], agents, {
      narrativeTemplates: {
        observationAction: { genericTemplates: ['noticed someone nearby'] },
      },
    });

    for (const fact of facts) expect(fact.action).toBe(event.content);
  });

  it('被观察目标无 currentState 时回退到泛化模板', () => {
    // 两个目标都无 currentState → 双向都回退泛化模板
    const agents = new Map([
      ['alice', { id: 'alice', stateMachine: { currentState: null } }],
      ['bob', { id: 'bob', stateMachine: { currentState: null } }],
    ]);
    const events = [makeEvent('在附近注意到有人', '酒馆')];

    const facts = emitter.emitObservationFacts(events, agents, tavern);

    for (const f of facts) {
      expect(f.action).toBe('在附近注意到有人');
    }
  });

  it('OBSERVATION fact 仍带正确的 observerId/targetId/context', () => {
    const agents = new Map([
      ['alice', makeAgentStub('工作', { id: 'alice' })],
      ['bob', makeAgentStub('休息', { id: 'bob' })],
    ]);
    const events = [makeEvent('在附近注意到有人', '酒馆')];

    const facts = emitter.emitObservationFacts(events, agents, tavern);

    for (const f of facts) {
      expect(f.type).toBe(FactType.OBSERVATION);
      expect(f.observerId).toBeDefined();
      expect(f.targetId).toBeDefined();
      expect(f.observerId).not.toBe(f.targetId);
      expect(f.context).toBe('酒馆');
      expect(f.scope).toBe('local');
      expect(f.participants).toContain(f.observerId);
      expect(f.observers).toContain(f.observerId);
    }
  });
});

describe('FactEmitter.emitObservationFacts — engine integration', () => {
  it('engine.tick() 产生的 OBSERVATION fact action 非泛化模板', () => {
    // 用 tavern preset + 两角色，tick 直到出现 OBSERVATION fact。
    const AndyEngine = require('../../index.js').default || require('../../index.js');
    const engine = new AndyEngine({
      domain: tavern,
      seed: 'obs-action-spec',
      enableFacts: true,
      startTime: TEST_START,
    });
    engine.createCharacter({ id: 'ulfberht', name: 'Ulfberht', mbti: 'ISTJ', schedule: 'blacksmith', domain: tavern });
    engine.createCharacter({ id: 'maren', name: 'Maren', mbti: 'INFP', schedule: 'bard', domain: tavern });

    let obsFact = null;
    for (let t = 1; t <= 30; t++) {
      try { engine.tick(); } catch (e) { /* ignore */ }
      const g = engine.getGroundingPackage('ulfberht');
      const obs = ((g && g.allowedFacts) || []).find(
        (f) => f && f.type === 'observation' && f.observerId === 'ulfberht' && f.targetId && f.action
      );
      if (obs) { obsFact = obs; break; }
    }

    expect(obsFact).not.toBeNull();
    // 关键断言：action 非泛化模板、含具体状态词、length>6
    expect(obsFact.action).not.toBe('在附近注意到有人');
    expect(obsFact.action).not.toBe('在附近注意到有人，没什么特别的');
    expect(obsFact.action).not.toContain('注意到');
    expect(obsFact.action.length).toBeGreaterThan(6);
  });
});
