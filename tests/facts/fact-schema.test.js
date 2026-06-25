/**
 * FactSchema 模块测试套件
 *
 * 验证：
 *   - 事实类型枚举正确
 *   - 验证器覆盖所有必填字段
 *   - 类型专用工厂生成正确的结构
 *   - 类型专用字段验证
 */

import { describe, it, expect } from 'vitest';
import {
  FactType,
  FACT_TYPES,
  FactSource,
  FACT_SOURCES,
  FactScope,
  FACT_SCOPES,
  validateFact,
  validateTypeFields,
  createBaseFact,
  createStaticEnvFact,
  createAgentStateFact,
  createRelationshipFact,
  createEventFact,
  createObservationFact,
  createMemoryFact,
  createRuleFact,
  createLocationMeaningFact,
  createInvalidatedFact,
} from '../../src/canon/FactSchema.js';

// ═══════════════════════════════════════════
// 枚举
// ═══════════════════════════════════════════

describe('FactType 枚举', () => {
  it('应该包含 9 种类型', () => {
    expect(FACT_TYPES).toHaveLength(9);
  });

  it('每个类型的值应该是 kebab-case 字符串', () => {
    for (const t of FACT_TYPES) {
      expect(typeof t).toBe('string');
      expect(t).toMatch(/^[a-z_]+$/);
    }
  });

  it('FactType 应该是 frozen', () => {
    expect(Object.isFrozen(FactType)).toBe(true);
  });
});

describe('FactSource 枚举', () => {
  it('应该包含 3 种来源', () => {
    expect(FACT_SOURCES).toHaveLength(3);
  });

  it('应该包含 engine, observation, inference', () => {
    expect(FACT_SOURCES).toContain('engine');
    expect(FACT_SOURCES).toContain('observation');
    expect(FACT_SOURCES).toContain('inference');
  });
});

describe('FactScope 枚举', () => {
  it('应该包含 2 种范围', () => {
    expect(FACT_SCOPES).toHaveLength(2);
  });
});

// ═══════════════════════════════════════════
// 验证器 - BaseFact
// ═══════════════════════════════════════════

describe('validateFact', () => {
  const validFact = {
    id: 'fact_engine_0',
    type: FactType.EVENT,
    timestamp: new Date(),
    source: FactSource.ENGINE,
    confidence: 1.0,
    scope: FactScope.PUBLIC,
    participants: [],
    observers: [],
  };

  it('有效事实应该通过验证', () => {
    const result = validateFact(validFact);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('null 应该失败', () => {
    const result = validateFact(null);
    expect(result.valid).toBe(false);
  });

  it('缺少 id 应该失败', () => {
    const result = validateFact({ ...validFact, id: '' });
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain('id');
  });

  it('无效 type 应该失败', () => {
    const result = validateFact({ ...validFact, type: 'invalid' });
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain('type');
  });

  it('无效 source 应该失败', () => {
    const result = validateFact({ ...validFact, source: 'unknown' });
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain('source');
  });

  it('confidence > 1 应该失败', () => {
    const result = validateFact({ ...validFact, confidence: 1.5 });
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain('confidence');
  });

  it('confidence < 0 应该失败', () => {
    const result = validateFact({ ...validFact, confidence: -0.1 });
    expect(result.valid).toBe(false);
  });

  it('无效 scope 应该失败', () => {
    const result = validateFact({ ...validFact, scope: 'secret' });
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain('scope');
  });

  it('participants 非数组应该失败', () => {
    const result = validateFact({ ...validFact, participants: 'alice' });
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain('participants');
  });

  it('observers 非数组应该失败', () => {
    const result = validateFact({ ...validFact, observers: 'bob' });
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain('observers');
  });

  it('timestamp 为数字应该通过', () => {
    const result = validateFact({ ...validFact, timestamp: Date.now() });
    expect(result.valid).toBe(true);
  });

  it('多个错误应该全部报告', () => {
    const result = validateFact({ id: '', type: 'bad', source: 'bad' });
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThanOrEqual(3);
  });
});

// ═══════════════════════════════════════════
// createBaseFact
// ═══════════════════════════════════════════

describe('createBaseFact', () => {
  it('应该返回默认值', () => {
    const fact = createBaseFact();
    expect(fact.type).toBe(FactType.EVENT);
    expect(fact.source).toBe(FactSource.ENGINE);
    expect(fact.confidence).toBe(1.0);
    expect(fact.scope).toBe(FactScope.PUBLIC);
    expect(fact.participants).toEqual([]);
    expect(fact.observers).toEqual([]);
  });

  it('应该支持覆盖', () => {
    const fact = createBaseFact({ source: 'inference', confidence: 0.5 });
    expect(fact.source).toBe('inference');
    expect(fact.confidence).toBe(0.5);
  });

  it('timestamp 应该是 Date 实例', () => {
    const fact = createBaseFact();
    expect(fact.timestamp).toBeInstanceOf(Date);
  });
});

// ═══════════════════════════════════════════
// 类型专用工厂
// ═══════════════════════════════════════════

describe('createStaticEnvFact', () => {
  it('应该创建正确结构', () => {
    const fact = createStaticEnvFact({ area: '图书馆', object: '书架' });
    expect(fact.type).toBe(FactType.STATIC_ENV);
    expect(fact.area).toBe('图书馆');
    expect(fact.object).toBe('书架');
  });

  it('应该支持 description', () => {
    const fact = createStaticEnvFact({ area: '图书馆', object: '书架', description: '三层木制书架' });
    expect(fact.description).toBe('三层木制书架');
  });
});

describe('createAgentStateFact', () => {
  it('应该创建正确结构', () => {
    const fact = createAgentStateFact({ agentId: 'alice', state: '看书' });
    expect(fact.type).toBe(FactType.AGENT_STATE);
    expect(fact.agentId).toBe('alice');
    expect(fact.state).toBe('看书');
  });

  it('应该支持 region', () => {
    const fact = createAgentStateFact({ agentId: 'alice', state: '看书', region: '图书馆' });
    expect(fact.region).toBe('图书馆');
  });
});

describe('createRelationshipFact', () => {
  it('应该创建正确结构', () => {
    const fact = createRelationshipFact({
      agentA: 'alice', agentB: 'bob', relationType: '朋友', strength: 0.6,
    });
    expect(fact.type).toBe(FactType.RELATIONSHIP);
    expect(fact.agentA).toBe('alice');
    expect(fact.agentB).toBe('bob');
    expect(fact.relationType).toBe('朋友');
    expect(fact.strength).toBe(0.6);
    expect(fact.previousType).toBeNull();
  });
});

describe('createEventFact', () => {
  it('应该创建正确结构', () => {
    const fact = createEventFact({ eventId: 'evt_001', description: '毕业典礼' });
    expect(fact.type).toBe(FactType.EVENT);
    expect(fact.eventId).toBe('evt_001');
    expect(fact.description).toBe('毕业典礼');
  });

  it('应该支持 location', () => {
    const fact = createEventFact({ eventId: 'evt_001', description: '毕业典礼', location: '礼堂' });
    expect(fact.location).toBe('礼堂');
  });
});

describe('createObservationFact', () => {
  it('应该创建正确结构', () => {
    const fact = createObservationFact({
      observerId: 'alice', targetId: 'bob', action: '在跑步',
    });
    expect(fact.type).toBe(FactType.OBSERVATION);
    expect(fact.observerId).toBe('alice');
    expect(fact.targetId).toBe('bob');
    expect(fact.action).toBe('在跑步');
  });
});

describe('createMemoryFact', () => {
  it('应该创建正确结构', () => {
    const fact = createMemoryFact({ agentId: 'alice', content: '今天很开心' });
    expect(fact.type).toBe(FactType.MEMORY);
    expect(fact.agentId).toBe('alice');
    expect(fact.content).toBe('今天很开心');
    expect(fact.importance).toBe(0.5);
    expect(fact.emotionTag).toBe('neutral');
    expect(fact.category).toBe('general');
  });

  it('应该支持自定义字段', () => {
    const fact = createMemoryFact({
      agentId: 'alice', content: '考试通过了', importance: 0.9, emotionTag: 'joy', category: 'achievement',
    });
    expect(fact.importance).toBe(0.9);
    expect(fact.emotionTag).toBe('joy');
    expect(fact.category).toBe('achievement');
  });
});

// ═══════════════════════════════════════════
// validateTypeFields
// ═══════════════════════════════════════════

describe('validateTypeFields', () => {
  it('static_env 缺少 area 应该失败', () => {
    const result = validateTypeFields({ type: FactType.STATIC_ENV, object: '书架' });
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain('area');
  });

  it('static_env 缺少 object 应该失败', () => {
    const result = validateTypeFields({ type: FactType.STATIC_ENV, area: '图书馆' });
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain('object');
  });

  it('agent_state 缺少 agentId 应该失败', () => {
    const result = validateTypeFields({ type: FactType.AGENT_STATE, state: '看书' });
    expect(result.valid).toBe(false);
  });

  it('relationship 缺少 strength 应该失败', () => {
    const result = validateTypeFields({
      type: FactType.RELATIONSHIP, agentA: 'a', agentB: 'b', relationType: '朋友',
    });
    expect(result.valid).toBe(false);
  });

  it('event 缺少 eventId 应该失败', () => {
    const result = validateTypeFields({ type: FactType.EVENT, description: '毕业典礼' });
    expect(result.valid).toBe(false);
  });

  it('observation 缺少 action 应该失败', () => {
    const result = validateTypeFields({
      type: FactType.OBSERVATION, observerId: 'a', targetId: 'b',
    });
    expect(result.valid).toBe(false);
  });

  it('memory 缺少 content 应该失败', () => {
    const result = validateTypeFields({ type: FactType.MEMORY, agentId: 'a' });
    expect(result.valid).toBe(false);
  });

  it('有效类型专用字段应该通过', () => {
    const result = validateTypeFields({
      type: FactType.EVENT, eventId: 'evt_001', description: '毕业典礼',
    });
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });
});

// ═══════════════════════════════════════════
// 补充工厂:Rule / LocationMeaning / Invalidated (Wave 5 batch 7)
// ═══════════════════════════════════════════
describe('createRuleFact', () => {
  it('creates a rule fact with defaults for category/priority/active', () => {
    const fact = createRuleFact({ ruleId: 'r1', description: 'no running' });
    expect(fact.type).toBe(FactType.RULE);
    expect(fact.ruleId).toBe('r1');
    expect(fact.category).toBe('general');
    expect(fact.priority).toBe(0.5);
    expect(fact.active).toBe(true);
  });
  it('accepts explicit category/priority/active', () => {
    const fact = createRuleFact({ ruleId: 'r1', description: 'd', category: 'safety', priority: 0.9, active: false });
    expect(fact.category).toBe('safety');
    expect(fact.priority).toBe(0.9);
    expect(fact.active).toBe(false);
  });
});

describe('createLocationMeaningFact', () => {
  it('creates a location_meaning fact with reason default', () => {
    const fact = createLocationMeaningFact({ location: '图书馆', meaningType: 'work', weight: 0.8 });
    expect(fact.type).toBe(FactType.LOCATION_MEANING);
    expect(fact.location).toBe('图书馆');
    expect(fact.meaningType).toBe('work');
    expect(fact.weight).toBe(0.8);
    expect(fact.reason).toBe('');
  });
  it('accepts explicit reason', () => {
    const fact = createLocationMeaningFact({ location: 'l', meaningType: 'rest', weight: 0.5, reason: 'tired' });
    expect(fact.reason).toBe('tired');
  });
});

describe('createInvalidatedFact', () => {
  it('creates an invalidated fact with supersededBy default null', () => {
    const fact = createInvalidatedFact({ originalFactId: 'f1', reason: 'obsolete' });
    expect(fact.type).toBe(FactType.INVALIDATED);
    expect(fact.originalFactId).toBe('f1');
    expect(fact.reason).toBe('obsolete');
    expect(fact.supersededBy).toBeNull();
  });
  it('accepts explicit supersededBy and confidence default 1.0', () => {
    const fact = createInvalidatedFact({ originalFactId: 'f1', reason: 'r', supersededBy: 'f2' });
    expect(fact.supersededBy).toBe('f2');
    expect(fact.confidence).toBe(1.0);
  });
});

describe('validateTypeFields — rule/location_meaning/invalidated branches', () => {
  it('rule missing ruleId fails', () => {
    const r = validateTypeFields({ type: FactType.RULE, description: 'd' });
    expect(r.valid).toBe(false);
    expect(r.errors.some(e => e.includes('ruleId'))).toBe(true);
  });
  it('rule missing description fails', () => {
    const r = validateTypeFields({ type: FactType.RULE, ruleId: 'r1' });
    expect(r.errors.some(e => e.includes('description'))).toBe(true);
  });
  it('valid rule passes', () => {
    expect(validateTypeFields({ type: FactType.RULE, ruleId: 'r1', description: 'd' }).valid).toBe(true);
  });
  it('location_meaning missing location fails', () => {
    expect(validateTypeFields({ type: FactType.LOCATION_MEANING, meaningType: 'work', weight: 0.5 }).valid).toBe(false);
  });
  it('location_meaning non-number weight fails', () => {
    expect(validateTypeFields({ type: FactType.LOCATION_MEANING, location: 'l', meaningType: 'work', weight: 'high' }).valid).toBe(false);
  });
  it('valid location_meaning passes', () => {
    expect(validateTypeFields({ type: FactType.LOCATION_MEANING, location: 'l', meaningType: 'work', weight: 0.5 }).valid).toBe(true);
  });
  it('invalidated missing originalFactId fails', () => {
    expect(validateTypeFields({ type: FactType.INVALIDATED, reason: 'r' }).valid).toBe(false);
  });
  it('invalidated missing reason fails', () => {
    expect(validateTypeFields({ type: FactType.INVALIDATED, originalFactId: 'f1' }).valid).toBe(false);
  });
  it('valid invalidated passes', () => {
    expect(validateTypeFields({ type: FactType.INVALIDATED, originalFactId: 'f1', reason: 'r' }).valid).toBe(true);
  });
  it('unknown type passes with no type-specific errors', () => {
    expect(validateTypeFields({ type: 'unknown_type' }).valid).toBe(true);
  });
});
