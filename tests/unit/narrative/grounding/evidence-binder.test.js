/**
 * EvidenceBinder 单元测试
 *
 * 覆盖：
 *   - self location 命中 / 未命中
 *   - other-agent location 命中（EVENT participants/observers）
 *   - propagatedFrom 不被当作在场证据（红线测试）
 *   - OBSERVATION fact observer→context 命中
 *   - relationship pair 未命中 → unsupported
 *   - state claim self → supports
 *   - state claim 非 self 无直接知识 → unsupported
 *   - source_attribution / time claim → supports
 *   - subject 容错：string 和 {kind, id, raw}
 *   - 模块不写入 store（grep 断言无 .addFact( / .set( 写操作）
 */

const fs = require('fs');
const path = require('path');
const { EvidenceBinder, SUPPORT } = require('../../../../src/narrative/grounding/EvidenceBinder');

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeEventFact(opts) {
  return {
    type: 'event',
    eventId: opts.eventId || `evt_${Math.random().toString(36).slice(2)}`,
    description: opts.description || '',
    location: opts.location || '',
    participants: opts.participants || [],
    observers: opts.observers || [],
    _evidence: opts._evidence || null,
  };
}

function makeObservationFact(opts) {
  return {
    type: 'observation',
    observerId: opts.observerId || '',
    targetId: opts.targetId || '',
    action: opts.action || '',
    context: opts.context || '',
    _evidence: opts._evidence || null,
  };
}

function makeAgentStateFact(opts) {
  return {
    type: 'agent_state',
    agentId: opts.agentId || '',
    position: opts.position || '',
    region: opts.region || '',
  };
}

function makeRelationshipFact(agentA, agentB, relationType) {
  return {
    type: 'relationship',
    agentA,
    agentB,
    relationType,
  };
}

function makeMemoryFact(agentId, content) {
  return {
    type: 'memory',
    agentId,
    content,
    importance: 0.5,
    emotionTag: 'neutral',
    category: 'event',
  };
}

function makeClaim(opts) {
  return {
    id: opts.id || `claim_${Math.random().toString(36).slice(2, 6)}`,
    type: opts.type || 'location',
    subject: opts.subject != null ? opts.subject : null,
    predicate: opts.predicate || null,
    object: opts.object || null,
    polarity: opts.polarity || 'affirmative',
    confidence: opts.confidence || 0.8,
    stateType: opts.stateType || null,
  };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('EvidenceBinder', () => {
  const selfId = 'alice';
  const bobId = 'bob';
  const charlieId = 'charlie';

  describe('self location', () => {
    test('命中 → emits the supporting fact id', () => {
      const binder = new EvidenceBinder({ selfId });
      const allowedFacts = [
        { ...makeAgentStateFact({ agentId: selfId, position: '图书馆' }), id: 'fact_self_location' },
      ];
      const claims = [makeClaim({ type: 'location', subject: selfId, object: '图书馆' })];

      const result = binder.bind(claims, allowedFacts);

      expect(result.bindings[0].support).toBe(SUPPORT.SUPPORTS);
      expect(result.bindings[0].factId).toBe('fact_self_location');
    });

    test('命中 → supports', () => {
      const binder = new EvidenceBinder({ selfId });
      const allowedFacts = [
        makeAgentStateFact({ agentId: selfId, position: '图书馆' }),
      ];
      const claims = [makeClaim({ type: 'location', subject: selfId, object: '图书馆' })];

      const result = binder.bind(claims, allowedFacts);

      expect(result.bindings.length).toBe(1);
      expect(result.bindings[0].support).toBe(SUPPORT.SUPPORTS);
      expect(result.bindings[0].reason).toContain('selfAgentStateLocations');
    });

    test('未命中 → unsupported', () => {
      const binder = new EvidenceBinder({ selfId });
      const allowedFacts = [
        makeAgentStateFact({ agentId: selfId, position: '食堂' }),
      ];
      const claims = [makeClaim({ type: 'location', subject: selfId, object: '图书馆' })];

      const result = binder.bind(claims, allowedFacts);

      expect(result.bindings.length).toBe(1);
      expect(result.bindings[0].support).toBe(SUPPORT.UNSUPPORTED);
      expect(result.bindings[0].reason).toContain('selfAgentStateLocations');
    });
  });

  describe('other-agent location (EVENT participants/observers)', () => {
    test('EVENT participants 命中 → emits the supporting event fact id', () => {
      const binder = new EvidenceBinder({ selfId });
      const allowedFacts = [
        { ...makeEventFact({ location: '图书馆', participants: [bobId] }), id: 'fact_bob_library' },
      ];
      const claims = [makeClaim({ type: 'location', subject: bobId, object: '图书馆' })];

      const result = binder.bind(claims, allowedFacts);

      expect(result.bindings[0].support).toBe(SUPPORT.SUPPORTS);
      expect(result.bindings[0].factId).toBe('fact_bob_library');
    });

    test('EVENT participants 命中 → supports', () => {
      const binder = new EvidenceBinder({ selfId });
      const allowedFacts = [
        makeEventFact({
          description: '鲍勃在图书馆学习',
          location: '图书馆',
          participants: [bobId],
        }),
      ];
      const claims = [makeClaim({ type: 'location', subject: bobId, object: '图书馆' })];

      const result = binder.bind(claims, allowedFacts);

      expect(result.bindings.length).toBe(1);
      expect(result.bindings[0].support).toBe(SUPPORT.SUPPORTS);
      expect(result.bindings[0].reason).toContain('agentKnownLocations');
    });

    test('EVENT observers 命中 → supports', () => {
      const binder = new EvidenceBinder({ selfId });
      const allowedFacts = [
        makeEventFact({
          description: '食堂聚餐',
          location: '食堂',
          participants: [bobId],
          observers: [charlieId],
        }),
      ];
      const claims = [makeClaim({ type: 'location', subject: charlieId, object: '食堂' })];

      const result = binder.bind(claims, allowedFacts);

      expect(result.bindings.length).toBe(1);
      expect(result.bindings[0].support).toBe(SUPPORT.SUPPORTS);
    });

    test('未命中 → unsupported', () => {
      const binder = new EvidenceBinder({ selfId });
      const allowedFacts = [
        makeEventFact({
          description: '鲍勃在食堂',
          location: '食堂',
          participants: [bobId],
        }),
      ];
      const claims = [makeClaim({ type: 'location', subject: bobId, object: '图书馆' })];

      const result = binder.bind(claims, allowedFacts);

      expect(result.bindings.length).toBe(1);
      expect(result.bindings[0].support).toBe(SUPPORT.UNSUPPORTED);
    });
  });

  describe('propagatedFrom 红线测试', () => {
    test('propagatedFrom 不被当作在场证据 → unsupported', () => {
      // 构造 EVENT fact：_evidence.propagatedFrom 含 agentX，但 participants/observers 不含 agentX
      // claim 表达 agentX 在该 fact.location
      const binder = new EvidenceBinder({ selfId });
      const allowedFacts = [
        makeEventFact({
          description: '鲍勃在图书馆学习',
          location: '图书馆',
          participants: [selfId], // 只有 selfId 在 participants
          observers: [],
          _evidence: {
            source: 'told',
            confidence: 0.6,
            propagatedFrom: bobId, // propagatedFrom 含 bobId
          },
        }),
      ];
      // claim 说 bob 在图书馆 — 但 bob 不在 participants/observers
      const claims = [makeClaim({ type: 'location', subject: bobId, object: '图书馆' })];

      const result = binder.bind(claims, allowedFacts);

      expect(result.bindings.length).toBe(1);
      expect(result.bindings[0].support).toBe(SUPPORT.UNSUPPORTED);
      expect(result.bindings[0].reason).toContain('agentKnownLocations');
    });
  });

  describe('OBSERVATION fact observer→context', () => {
    test('observer 在 context 位置 → supports', () => {
      const binder = new EvidenceBinder({ selfId });
      const allowedFacts = [
        makeObservationFact({
          observerId: bobId,
          targetId: selfId,
          action: '看到',
          context: '图书馆',
        }),
      ];
      const claims = [makeClaim({ type: 'location', subject: bobId, object: '图书馆' })];

      const result = binder.bind(claims, allowedFacts);

      expect(result.bindings.length).toBe(1);
      expect(result.bindings[0].support).toBe(SUPPORT.SUPPORTS);
    });

    test('observer 未在 context 位置 → unsupported', () => {
      const binder = new EvidenceBinder({ selfId });
      const allowedFacts = [
        makeObservationFact({
          observerId: bobId,
          targetId: selfId,
          action: '看到',
          context: '图书馆',
        }),
      ];
      const claims = [makeClaim({ type: 'location', subject: bobId, object: '食堂' })];

      const result = binder.bind(claims, allowedFacts);

      expect(result.bindings.length).toBe(1);
      expect(result.bindings[0].support).toBe(SUPPORT.UNSUPPORTED);
    });
  });

  describe('relationship claim', () => {
    test('pair 未命中 → unsupported', () => {
      const binder = new EvidenceBinder({ selfId });
      const allowedFacts = [];
      const claims = [
        makeClaim({
          type: 'relationship',
          subject: selfId,
          object: { kind: 'agent', id: bobId, raw: '鲍勃' },
        }),
      ];

      const result = binder.bind(claims, allowedFacts);

      expect(result.bindings.length).toBe(1);
      expect(result.bindings[0].support).toBe(SUPPORT.UNSUPPORTED);
    });

    test('已知关系 + negative polarity → contradicts', () => {
      const binder = new EvidenceBinder({ selfId });
      const allowedFacts = [
        makeRelationshipFact(selfId, bobId, 'friend'),
      ];
      const claims = [
        makeClaim({
          type: 'relationship',
          id: 'rel_001',
          subject: selfId,
          object: { kind: 'agent', id: bobId, raw: '鲍勃' },
          polarity: 'negative',
        }),
      ];

      const result = binder.bind(claims, allowedFacts);

      expect(result.bindings.length).toBe(1);
      expect(result.bindings[0].support).toBe(SUPPORT.CONTRADICTS);
    });

    test('已知关系 + affirmative polarity → unsupported (LLM 不能造关系变化)', () => {
      const binder = new EvidenceBinder({ selfId });
      const allowedFacts = [
        makeRelationshipFact(selfId, bobId, 'friend'),
      ];
      const claims = [
        makeClaim({
          type: 'relationship',
          id: 'rel_002',
          subject: selfId,
          object: { kind: 'agent', id: bobId, raw: '鲍勃' },
          polarity: 'affirmative',
        }),
      ];

      const result = binder.bind(claims, allowedFacts);

      expect(result.bindings.length).toBe(1);
      expect(result.bindings[0].support).toBe(SUPPORT.UNSUPPORTED);
    });

    test('R8.5: is_relation reference to existing relationship → supports + factId', () => {
      const binder = new EvidenceBinder({ selfId });
      const allowedFacts = [
        { id: 'fact_rel_1', type: 'relationship', agentA: selfId, agentB: bobId, relationType: 'friend' },
      ];
      const claims = [
        makeClaim({
          type: 'relationship',
          id: 'rel_ref_001',
          subject: selfId,
          predicate: 'is_relation',
          object: { kind: 'agent', id: bobId, raw: '鲍勃' },
          polarity: 'affirmative',
        }),
      ];

      const result = binder.bind(claims, allowedFacts);

      expect(result.bindings.length).toBe(1);
      expect(result.bindings[0].support).toBe(SUPPORT.SUPPORTS);
      expect(result.bindings[0].evidenceSource).toBe('known_relationships');
      expect(result.bindings[0].factId).toBe('fact_rel_1');
    });

    test('R8.5: is_relation reference to non-existent relationship → unsupported', () => {
      const binder = new EvidenceBinder({ selfId });
      const allowedFacts = [];
      const claims = [
        makeClaim({
          type: 'relationship',
          id: 'rel_ref_002',
          subject: selfId,
          predicate: 'is_relation',
          object: { kind: 'agent', id: bobId, raw: '鲍勃' },
          polarity: 'affirmative',
        }),
      ];

      const result = binder.bind(claims, allowedFacts);

      expect(result.bindings.length).toBe(1);
      expect(result.bindings[0].support).toBe(SUPPORT.UNSUPPORTED);
      expect(result.bindings[0].factId).toBeFalsy();
    });
  });

  describe('state claim', () => {
    test('self state → supports', () => {
      const binder = new EvidenceBinder({ selfId });
      const allowedFacts = [];
      const claims = [makeClaim({ type: 'state', subject: selfId, object: '开心' })];

      const result = binder.bind(claims, allowedFacts);

      expect(result.bindings.length).toBe(1);
      expect(result.bindings[0].support).toBe(SUPPORT.SUPPORTS);
      expect(result.bindings[0].reason).toContain('self-knowledge');
    });

    test('非 self 无直接知识 → unsupported', () => {
      const binder = new EvidenceBinder({ selfId });
      const allowedFacts = [];
      const claims = [makeClaim({ type: 'state', subject: bobId, object: '难过' })];

      const result = binder.bind(claims, allowedFacts);

      expect(result.bindings.length).toBe(1);
      expect(result.bindings[0].support).toBe(SUPPORT.UNSUPPORTED);
      expect(result.bindings[0].reason).toContain('agent_state_leak');
    });

    test('非 self 有直接知识 → supports', () => {
      const binder = new EvidenceBinder({ selfId });
      const allowedFacts = [
        makeEventFact({
          description: '鲍勃在图书馆',
          location: '图书馆',
          participants: [bobId],
        }),
      ];
      const claims = [makeClaim({ type: 'state', subject: bobId, object: '难过' })];

      const result = binder.bind(claims, allowedFacts);

      expect(result.bindings.length).toBe(1);
      expect(result.bindings[0].support).toBe(SUPPORT.SUPPORTS);
    });
  });

  describe('source_attribution claim', () => {
    test('source_attribution → supports reason 标注', () => {
      const binder = new EvidenceBinder({ selfId });
      const allowedFacts = [];
      const claims = [
        makeClaim({
          type: 'source_attribution',
          subject: selfId,
          object: '听说鲍勃在图书馆',
        }),
      ];

      const result = binder.bind(claims, allowedFacts);

      expect(result.bindings.length).toBe(1);
      expect(result.bindings[0].support).toBe(SUPPORT.SUPPORTS);
      expect(result.bindings[0].reason).toBe('source marker self-attested');
    });
  });

  describe('R8.6 memory claim', () => {
    test('self memory content match → supports + factId', () => {
      const binder = new EvidenceBinder({ selfId });
      const allowedFacts = [
        { ...makeMemoryFact(selfId, '今天的麦酒特别好喝'), id: 'fact_mem_1' },
      ];
      const claims = [
        makeClaim({
          type: 'memory',
          id: 'mem_001',
          subject: selfId,
          predicate: 'remembers',
          object: '今天的麦酒特别好喝',
        }),
      ];

      const result = binder.bind(claims, allowedFacts);

      expect(result.bindings.length).toBe(1);
      expect(result.bindings[0].support).toBe(SUPPORT.SUPPORTS);
      expect(result.bindings[0].evidenceSource).toBe('known_memories');
      expect(result.bindings[0].factId).toBe('fact_mem_1');
    });

    test('self memory content fragment match → supports', () => {
      const binder = new EvidenceBinder({ selfId });
      const allowedFacts = [
        { ...makeMemoryFact(selfId, '有人在远处吹笛子'), id: 'fact_mem_2' },
      ];
      const claims = [
        makeClaim({
          type: 'memory',
          id: 'mem_002',
          subject: selfId,
          predicate: 'remembers',
          object: '有人在远处吹笛子', // exact match
        }),
      ];

      const result = binder.bind(claims, allowedFacts);

      expect(result.bindings[0].support).toBe(SUPPORT.SUPPORTS);
      expect(result.bindings[0].factId).toBe('fact_mem_2');
    });

    test('self memory no match → unsupported', () => {
      const binder = new EvidenceBinder({ selfId });
      const allowedFacts = [
        { ...makeMemoryFact(selfId, '今天的麦酒特别好喝'), id: 'fact_mem_1' },
      ];
      const claims = [
        makeClaim({
          type: 'memory',
          id: 'mem_003',
          subject: selfId,
          predicate: 'remembers',
          object: '完全不相关的内容',
        }),
      ];

      const result = binder.bind(claims, allowedFacts);

      expect(result.bindings[0].support).toBe(SUPPORT.UNSUPPORTED);
      expect(result.bindings[0].factId).toBeFalsy();
    });

    test('other-agent memory → unsupported (forbidden)', () => {
      const binder = new EvidenceBinder({ selfId });
      const allowedFacts = []; // bob's memory is not in selfId's allowedFacts
      const claims = [
        makeClaim({
          type: 'memory',
          id: 'mem_004',
          subject: bobId, // not self
          predicate: 'remembers',
          object: 'something',
        }),
      ];

      const result = binder.bind(claims, allowedFacts);

      expect(result.bindings[0].support).toBe(SUPPORT.UNSUPPORTED);
      expect(result.bindings[0].reason).toContain('not the speaker');
    });
  });

  describe('time claim', () => {
    test('time → supports reason 标注', () => {
      const binder = new EvidenceBinder({ selfId });
      const allowedFacts = [];
      const claims = [makeClaim({ type: 'time', object: '深夜' })];

      const result = binder.bind(claims, allowedFacts);

      expect(result.bindings.length).toBe(1);
      expect(result.bindings[0].support).toBe(SUPPORT.SUPPORTS);
      expect(result.bindings[0].reason).toBe('time marker no fact needed');
    });
  });

  describe('event claim', () => {
    test('predicate did（新事件）→ unsupported', () => {
      const binder = new EvidenceBinder({ selfId });
      const allowedFacts = [];
      const claims = [
        makeClaim({
          type: 'event',
          predicate: 'did',
          object: '吃了一顿大餐',
        }),
      ];

      const result = binder.bind(claims, allowedFacts);

      expect(result.bindings.length).toBe(1);
      expect(result.bindings[0].support).toBe(SUPPORT.UNSUPPORTED);
    });

    test('predicate refers_to 命中 → supports', () => {
      const binder = new EvidenceBinder({ selfId });
      const allowedFacts = [
        makeEventFact({ description: '鲍勃在图书馆学习', location: '图书馆' }),
      ];
      const claims = [
        makeClaim({
          type: 'event',
          predicate: 'refers_to',
          object: '图书馆学习',
        }),
      ];

      const result = binder.bind(claims, allowedFacts);

      expect(result.bindings.length).toBe(1);
      expect(result.bindings[0].support).toBe(SUPPORT.SUPPORTS);
    });

    test('predicate refers_to 未命中 → unsupported', () => {
      const binder = new EvidenceBinder({ selfId });
      const allowedFacts = [
        makeEventFact({ description: '鲍勃在图书馆学习', location: '图书馆' }),
      ];
      const claims = [
        makeClaim({
          type: 'event',
          predicate: 'refers_to',
          object: '操场打架',
        }),
      ];

      const result = binder.bind(claims, allowedFacts);

      expect(result.bindings.length).toBe(1);
      expect(result.bindings[0].support).toBe(SUPPORT.UNSUPPORTED);
    });
  });

  describe('subject 容错', () => {
    test('string subject → 正常工作', () => {
      const binder = new EvidenceBinder({ selfId });
      const allowedFacts = [
        makeEventFact({
          description: '鲍勃在图书馆',
          location: '图书馆',
          participants: [bobId],
        }),
      ];
      // subject 是 string
      const claims = [makeClaim({ type: 'location', subject: bobId, object: '图书馆' })];

      const result = binder.bind(claims, allowedFacts);

      expect(result.bindings.length).toBe(1);
      expect(result.bindings[0].support).toBe(SUPPORT.SUPPORTS);
    });

    test('{kind, id, raw} subject → 正常工作', () => {
      const binder = new EvidenceBinder({ selfId });
      const allowedFacts = [
        makeEventFact({
          description: '鲍勃在图书馆',
          location: '图书馆',
          participants: [bobId],
        }),
      ];
      // subject 是 v3 结构化对象
      const claims = [
        makeClaim({
          type: 'location',
          subject: { kind: 'agent', id: bobId, raw: '鲍勃' },
          object: '图书馆',
        }),
      ];

      const result = binder.bind(claims, allowedFacts);

      expect(result.bindings.length).toBe(1);
      expect(result.bindings[0].support).toBe(SUPPORT.SUPPORTS);
    });

    test('{kind, id, raw} location object → 正常工作', () => {
      const binder = new EvidenceBinder({ selfId });
      const allowedFacts = [
        makeEventFact({
          description: '鲍勃在图书馆',
          location: '图书馆',
          participants: [bobId],
        }),
      ];
      const claims = [
        makeClaim({
          type: 'location',
          subject: { kind: 'agent', id: bobId, raw: '鲍勃' },
          object: { kind: 'location', id: 'library', raw: '图书馆' },
        }),
      ];

      const result = binder.bind(claims, allowedFacts);

      expect(result.bindings.length).toBe(1);
      expect(result.bindings[0].support).toBe(SUPPORT.SUPPORTS);
    });

    test('{kind, id, raw} event object does not throw and matches raw text', () => {
      const binder = new EvidenceBinder({ selfId });
      const allowedFacts = [
        makeEventFact({
          description: '鲍勃在图书馆学习',
          location: '图书馆',
          participants: [bobId],
        }),
      ];
      const claims = [
        makeClaim({
          type: 'event',
          subject: { kind: 'agent', id: bobId, raw: '鲍勃' },
          predicate: 'refers_to',
          object: { kind: 'event', id: 'evt1', raw: '图书馆学习' },
        }),
      ];

      const result = binder.bind(claims, allowedFacts);

      expect(result.bindings.length).toBe(1);
      expect(result.bindings[0].support).toBe(SUPPORT.SUPPORTS);
    });

    test('string subject for relationship', () => {
      const binder = new EvidenceBinder({ selfId });
      const allowedFacts = [
        makeRelationshipFact(selfId, bobId, 'friend'),
      ];
      const claims = [
        makeClaim({
          type: 'relationship',
          subject: selfId,
          object: bobId, // string object — 无法提取第二个 agent
        }),
      ];

      const result = binder.bind(claims, allowedFacts);

      expect(result.bindings.length).toBe(1);
      expect(result.bindings[0].support).toBe(SUPPORT.UNSUPPORTED);
      expect(result.bindings[0].reason).toContain('cannot determine both agents');
    });

    test('{kind, id, raw} object for relationship → 正常解析', () => {
      const binder = new EvidenceBinder({ selfId });
      const allowedFacts = [
        makeRelationshipFact(selfId, bobId, 'friend'),
      ];
      const claims = [
        makeClaim({
          type: 'relationship',
          subject: selfId,
          object: { kind: 'agent', id: bobId, raw: '鲍勃' },
        }),
      ];

      const result = binder.bind(claims, allowedFacts);

      expect(result.bindings.length).toBe(1);
      expect(result.bindings[0].support).toBe(SUPPORT.UNSUPPORTED);
      expect(result.bindings[0].reason).toContain('already exists');
    });
  });

  describe('index 导出', () => {
    test('bind 返回 index 对象供调试', () => {
      const binder = new EvidenceBinder({ selfId });
      const allowedFacts = [
        makeAgentStateFact({ agentId: selfId, position: '图书馆' }),
        makeEventFact({
          description: '鲍勃在食堂',
          location: '食堂',
          participants: [bobId],
        }),
      ];
      const claims = [makeClaim({ type: 'location', subject: selfId, object: '图书馆' })];

      const result = binder.bind(claims, allowedFacts);

      expect(result.index).toBeDefined();
      expect(result.index.selfAgentStateLocations).toBeInstanceOf(Map);
      expect(result.index.agentKnownLocations).toBeInstanceOf(Map);
      expect(result.index.knownEventDescriptions).toBeInstanceOf(Map);
    });
  });

  describe('null / invalid facts 跳过', () => {
    test('null fact 被跳过', () => {
      const binder = new EvidenceBinder({ selfId });
      const allowedFacts = [null, makeAgentStateFact({ agentId: selfId, position: '图书馆' })];
      const claims = [makeClaim({ type: 'location', subject: selfId, object: '图书馆' })];

      const result = binder.bind(claims, allowedFacts);

      expect(result.bindings.length).toBe(1);
      expect(result.bindings[0].support).toBe(SUPPORT.SUPPORTS);
    });

    test('invalidated fact 被跳过', () => {
      const binder = new EvidenceBinder({ selfId });
      const allowedFacts = [
        { ...makeAgentStateFact({ agentId: selfId, position: '图书馆' }), _invalidated: true },
      ];
      const claims = [makeClaim({ type: 'location', subject: selfId, object: '图书馆' })];

      const result = binder.bind(claims, allowedFacts);

      expect(result.bindings.length).toBe(1);
      expect(result.bindings[0].support).toBe(SUPPORT.UNSUPPORTED);
    });
  });

  describe('forbiddenFacts 透传', () => {
    test('forbiddenFacts 出现在 index 中', () => {
      const forbidden = [
        { type: 'event', description: '操场冲突', scope: 'local' },
      ];
      const binder = new EvidenceBinder({ selfId, forbiddenFacts: forbidden });
      const allowedFacts = [];
      const claims = [makeClaim({ type: 'location', subject: selfId, object: '操场' })];

      const result = binder.bind(claims, allowedFacts);

      expect(result.index.forbiddenFacts).toEqual(forbidden);
    });
  });

  describe('模块不写入 store', () => {
    test('EvidenceBinder.js 不包含 .addFact( / .set( 写操作', () => {
      const modulePath = path.resolve(__dirname, '../../../../src/narrative/grounding/EvidenceBinder.js');
      const content = fs.readFileSync(modulePath, 'utf-8');

      // Map.set 是允许的（内部索引），但 .addFact( 绝对不允许
      const addFactMatches = content.match(/\.addFact\s*\(/g);
      expect(addFactMatches).toBeNull();

      // .set( 在 Map 上是允许的（索引构建），但 .set( 用于 store 写入的模式不应出现
      // 这里检查是否有类似 store.set( 或 knowledgeStore.set( 的写入
      const storeSetMatches = content.match(/\b(store|factStore|knowledgeStore)\.set\s*\(/g);
      expect(storeSetMatches).toBeNull();
    });
  });
});
