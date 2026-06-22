/**
 * World Tooling 测试
 *
 * 覆盖 World Compiler 和 Migration Pipeline 的单元测试。
 */

import { describe, it, expect } from 'vitest';
import AndyEngine from '../index.js';
import { compile } from '../src/store/world/compiler.js';
import { migrateWorldState } from '../src/store/world/migration.js';
import { validateWorldState, CURRENT_SCHEMA_VERSION } from '../src/store/world/validator.js';
import { fromWorldState } from '../src/store/world/WorldStateAdapter.js';

// ═══════════════════════════════════════════
// World Compiler
// ═══════════════════════════════════════════

describe('World Compiler', () => {
  const validSpec = {
    schemaVersion: '0.1.0',
    domainRef: 'campus',
    worldName: '测试校园世界',
    worldId: 'test_world_001',
    characters: [
      {
        id: 'maya',
        name: 'Maya',
        personality: { mbti: 'INFP' },
        background: ['安静的图书馆管理员', '喜欢看星星'],
        schedule: 'student',
        initialPosition: '宿舍',
      },
      {
        id: 'alice',
        name: 'Alice',
        personality: { mbti: 'ENFP' },
        background: ['活泼的社交达人'],
        schedule: 'student',
      },
    ],
    parameters: {
      startTime: '2026-09-01T08:00:00Z',
      weather: 'sunny',
    },
  };

  it('成功编译合法的 World Spec', () => {
    const result = compile(validSpec, null, AndyEngine);

    expect(result.state).not.toBeNull();
    expect(result.errors).toHaveLength(0);
  });

  it('编译输出的 schemaVersion 为最新版本', () => {
    const result = compile(validSpec, null, AndyEngine);

    expect(result.state.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
  });

  it('编译输出的 tickCount 为 0', () => {
    const result = compile(validSpec, null, AndyEngine);

    expect(result.state.worldClock.tickCount).toBe(0);
  });

  it('编译输出通过 validateWorldState 校验', () => {
    const result = compile(validSpec, null, AndyEngine);

    const validation = validateWorldState(result.state);
    expect(validation.valid).toBe(true);
    expect(validation.errors).toHaveLength(0);
  });

  it('编译输出包含正确的 characters', () => {
    const result = compile(validSpec, null, AndyEngine);

    expect(result.state.characters).toHaveLength(2);
    const maya = result.state.characters.find(c => c.id === 'maya');
    expect(maya).toBeDefined();
    expect(maya.name).toBe('Maya');
    expect(typeof maya.position).toBe('string');
  });

  it('编译输出包含 runtimeSnapshot', () => {
    const result = compile(validSpec, null, AndyEngine);

    expect(result.state.runtimeSnapshot).toBeDefined();
    expect(typeof result.state.runtimeSnapshot).toBe('object');
    expect(result.state.runtimeSnapshot.agents).toBeDefined();
  });

  it('编译出的 State 能恢复为引擎并执行 tick', () => {
    const result = compile(validSpec, null, AndyEngine);
    const engine = fromWorldState(result.state, {}, AndyEngine);

    expect(() => {
      engine.tick();
      engine.tick();
      engine.tick();
    }).not.toThrow();
  });

  it('编译出的引擎恢复后角色存在', () => {
    const result = compile(validSpec, null, AndyEngine);
    const engine = fromWorldState(result.state, {}, AndyEngine);

    const maya = engine.getAgent('maya');
    expect(maya).toBeDefined();
    expect(maya.name).toBe('Maya');
  });

  it('拒绝无效的 World Spec', () => {
    const invalidSpec = {
      schemaVersion: '0.1.0',
      // 缺少 domainRef, worldName, characters
    };

    const result = compile(invalidSpec, null, AndyEngine);
    expect(result.state).toBeNull();
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('拒绝 schemaVersion 不匹配的 Spec', () => {
    const invalidSpec = {
      ...validSpec,
      schemaVersion: '99.99.99',
    };

    const result = compile(invalidSpec, null, AndyEngine);
    expect(result.state).toBeNull();
    expect(result.errors.some(e => e.path === 'schemaVersion')).toBe(true);
  });

  it('编译无参数的 Spec 使用默认值', () => {
    const minimalSpec = {
      schemaVersion: '0.1.0',
      domainRef: 'campus',
      worldName: '最小世界',
      characters: [
        { id: 'solo', name: 'Solo', personality: { mbti: 'ISTJ' } },
      ],
    };

    const result = compile(minimalSpec, null, AndyEngine);
    expect(result.state).not.toBeNull();
    expect(result.state.worldClock.tickCount).toBe(0);
  });

  it('拒绝非 campus domain 且未传入 domainConfig 的 Spec', () => {
    const spec = {
      schemaVersion: '0.1.0',
      domainRef: 'tavern',
      worldName: '酒馆世界',
      characters: [
        { id: 'smith', name: '铁匠', personality: { mbti: 'ISTJ' } },
      ],
    };

    const result = compile(spec, null, AndyEngine);
    expect(result.state).toBeNull();
    expect(result.errors.some(e => e.path === 'domainRef' && e.message.includes('必须传入 domainConfig'))).toBe(true);
  });

  it('拒绝 domainConfig.id 与 spec.domainRef 不匹配的编译', () => {
    const spec = {
      schemaVersion: '0.1.0',
      domainRef: 'tavern',
      worldName: '酒馆世界',
      characters: [
        { id: 'smith', name: '铁匠', personality: { mbti: 'ISTJ' } },
      ],
    };
    const fakeDomain = { id: 'campus' };

    const result = compile(spec, fakeDomain, AndyEngine);
    expect(result.state).toBeNull();
    expect(result.errors.some(e => e.path === 'domainRef' && e.message.includes('不匹配'))).toBe(true);
  });
});

// ═══════════════════════════════════════════
// Migration Pipeline
// ═══════════════════════════════════════════

describe('Migration Pipeline', () => {
  // 创建 v0.0.0 格式模拟数据的工厂函数（避免测试间共享可变对象）
  function createV0State() {
    return {
      time: '2026-09-15T14:30:00Z',
      tickCount: 1234,
      environment: {
        weather: 'sunny',
        weatherChangedAt: '2026-09-15T10:00:00Z',
        timeOfDay: 'afternoon',
        season: 'autumn',
      },
      agents: {
        maya: {
          id: 'maya',
          name: 'Maya',
          position: '图书馆',
          personality: {
            mbti: 'INFP',
            ocean: { openness: 0.7, conscientiousness: 0.5, extraversion: 0.3, agreeableness: 0.8, neuroticism: 0.6 },
            emotionBaseline: { joy: 0.15, sadness: -0.05 },
            _driftWindow: { ticks: 0, totalSocialEvents: 0, negativeSocialEvents: 0, totalStressTicks: 0 },
          },
          emotion: {
            current: { joy: 0.25, sadness: -0.1, anger: 0.02 },
            mood: { joy: 0.18, sadness: -0.05 },
            baseline: { joy: 0.15, sadness: -0.05 },
            stress: 2,
            _pinkNoiseState: new Array(16).fill(0),
          },
          stateMachine: { currentState: '在图书馆', stateEnteredAt: '2026-09-15T14:00:00Z', history: [] },
          behaviorField: { B: [0.35, 0.41, 0.20, 0.39], velocity: [0, 0, 0, 0], _prevB: [0.35, 0.41, 0.20, 0.39], _lastLabel: '在图书馆', _tickCount: 1234 },
          memory: [],
          appraisalBiases: [],
          proceduralMemory: { patterns: {} },
          schedule: { entries: [], _todayVariations: {}, _lastVariationDate: '' },
          needs: { needs: { hunger: 0.65, energy: 0.42, social: 0.78, comfort: 0.55, stimulation: 0.33 }, _decayRates: { hunger: 0.08, energy: 0.06, social: 0.04, comfort: 0.03, stimulation: 0.05 }, _recoveryMultipliers: {} },
          emotionRegulation: { _regulationResource: 0.8, _regulationCount: 0, _regulationTickCounter: 0, _reappraisalHistory: [] },
          intrinsicMotivation: { curiosity: 0.3, familiarity: {}, activeGoals: [], completedGoals: [], competence: {}, explorationHistory: [], _ticksSinceGoal: 0, _lastGoalId: '' },
          socialEnergy: 0.65,
          health: 0.92,
          isOnline: true,
        },
        alice: {
          id: 'alice',
          name: 'Alice',
          position: '食堂',
          personality: {
            mbti: 'ENFP',
            ocean: { openness: 0.8, conscientiousness: 0.4, extraversion: 0.7, agreeableness: 0.7, neuroticism: 0.4 },
            emotionBaseline: { joy: 0.2, sadness: -0.03 },
            _driftWindow: { ticks: 0, totalSocialEvents: 0, negativeSocialEvents: 0, totalStressTicks: 0 },
          },
          emotion: {
            current: { joy: 0.3, sadness: -0.05, anger: 0.01 },
            mood: { joy: 0.2, sadness: -0.03 },
            baseline: { joy: 0.2, sadness: -0.03 },
            stress: 1,
            _pinkNoiseState: new Array(16).fill(0),
          },
          stateMachine: { currentState: '在食堂', stateEnteredAt: '2026-09-15T14:00:00Z', history: [] },
          behaviorField: { B: [0.30, 0.55, 0.20, 0.50], velocity: [0, 0, 0, 0], _prevB: [0.30, 0.55, 0.20, 0.50], _lastLabel: '在食堂', _tickCount: 1234 },
          memory: [],
          appraisalBiases: [],
          proceduralMemory: { patterns: {} },
          schedule: { entries: [], _todayVariations: {}, _lastVariationDate: '' },
          needs: { needs: { hunger: 0.5, energy: 0.6, social: 0.8, comfort: 0.7, stimulation: 0.4 }, _decayRates: { hunger: 0.08, energy: 0.06, social: 0.04, comfort: 0.03, stimulation: 0.05 }, _recoveryMultipliers: {} },
          emotionRegulation: { _regulationResource: 0.9, _regulationCount: 0, _regulationTickCounter: 0, _reappraisalHistory: [] },
          intrinsicMotivation: { curiosity: 0.5, familiarity: {}, activeGoals: [], completedGoals: [], competence: {}, explorationHistory: [], _ticksSinceGoal: 0, _lastGoalId: '' },
          socialEnergy: 0.8,
          health: 0.95,
          isOnline: true,
        },
      },
      socialGraph: [
        { agentA: 'maya', agentB: 'alice', type: 'friend', strength: 0.65, lastInteraction: '2026-09-15T12:00:00Z', _hoursSinceLastInteraction: 2.5, interactionCount: 42, _relationalInteractions: 15, impression: { positive: 0.7, negative: 0.1 }, history: [] },
      ],
      events: {
        eventLog: [
          { id: 'evt_1', time: '2026-09-15T14:00:00Z', type: 'social', content: '聊天' },
        ],
      },
    };
  }

  it('v0.0.0 迁移后 schemaVersion 为当前版本', () => {
    const { state } = migrateWorldState(createV0State());

    expect(state.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
  });

  it('v0.0.0 迁移后补齐 worldId', () => {
    const { state } = migrateWorldState(createV0State());

    expect(typeof state.worldId).toBe('string');
    expect(state.worldId.length).toBeGreaterThan(0);
  });

  it('v0.0.0 迁移后通过 validateWorldState 校验', () => {
    const { state } = migrateWorldState(createV0State());

    const result = validateWorldState(state);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('v0.0.0 迁移后 characters 被正确提取', () => {
    const { state } = migrateWorldState(createV0State());

    expect(state.characters).toHaveLength(2);
    const maya = state.characters.find(c => c.id === 'maya');
    expect(maya).toBeDefined();
    expect(maya.name).toBe('Maya');
    expect(maya.position).toBe('图书馆');
  });

  it('v0.0.0 迁移后 relationships 被正确提取', () => {
    const { state } = migrateWorldState(createV0State());

    expect(state.relationships).toHaveLength(1);
    expect(state.relationships[0].from).toBe('maya');
    expect(state.relationships[0].to).toBe('alice');
    expect(state.relationships[0].strength).toBe(0.65);
  });

  it('v0.0.0 迁移后 events 被正确提取', () => {
    const { state } = migrateWorldState(createV0State());

    expect(state.events).toHaveLength(1);
    expect(state.events[0].id).toBe('evt_1');
    expect(state.events[0].type).toBe('social');
  });

  it('v0.0.0 迁移后 runtimeSnapshot 完好无损', () => {
    const { state } = migrateWorldState(createV0State());

    expect(state.runtimeSnapshot).toBeDefined();
    expect(state.runtimeSnapshot.agents).toBeDefined();
    expect(state.runtimeSnapshot.agents.maya).toBeDefined();
    expect(state.runtimeSnapshot.agents.maya.personality).toBeDefined();
    expect(state.runtimeSnapshot.agents.maya.emotion).toBeDefined();
  });

  it('v0.0.0 迁移不修改原对象（non-mutating）', () => {
    const original = createV0State();
    const originalSchemaVersion = original.schemaVersion;
    const originalTime = original.time;
    const originalTickCount = original.tickCount;

    migrateWorldState(original);

    // 原对象不变
    expect(original.schemaVersion).toBe(originalSchemaVersion);
    expect(original.time).toBe(originalTime);
    expect(original.tickCount).toBe(originalTickCount);
  });

  it('v0.0.0 迁移不修改原对象的嵌套引用（non-mutating deep）', () => {
    const original = createV0State();
    const originalEventType = typeof original.events.eventLog[0].time;

    migrateWorldState(original);

    // 原对象的 event.time 保持原来的 string 类型
    expect(typeof original.events.eventLog[0].time).toBe(originalEventType);
    expect(typeof original.events.eventLog[0].time).toBe('string');
  });

  it('v0.0.0 迁移后 runtimeSnapshot.events 指针独立', () => {
    const original = createV0State();
    const { state } = migrateWorldState(original);

    expect(state.runtimeSnapshot.events).not.toBe(original.events);
  });

  it('v0.0.0 迁移后 runtimeSnapshot.agents 指针独立', () => {
    const original = createV0State();
    const { state } = migrateWorldState(original);

    expect(state.runtimeSnapshot.agents).not.toBe(original.agents);
  });

  it('v0.0.0 迁移返回新对象', () => {
    const original = createV0State();
    const { state } = migrateWorldState(original);

    expect(state).not.toBe(original);
  });

  it('已迁移的 v0.1.0 State 不做二次迁移', () => {
    const v1State = {
      schemaVersion: '0.1.0',
      worldId: 'existing_world',
      domainRef: 'campus',
      worldClock: { time: '2026-09-15T14:30:00Z', tickCount: 100 },
      characters: [{ id: 'maya', name: 'Maya', position: '图书馆' }],
      relationships: [],
      events: [],
      runtimeSnapshot: {},
    };

    const { state, migrated } = migrateWorldState(v1State);

    expect(migrated).toBe(false);
    expect(state).toBe(v1State); // 同一引用，不做拷贝
  });

  it('null 输入安全处理', () => {
    const { state, migrated } = migrateWorldState(null);
    expect(migrated).toBe(false);
    expect(state).toBeNull();
  });

  it('迁移后 State 能恢复为引擎并执行 tick', () => {
    const { state } = migrateWorldState(createV0State());

    // 迁移后的 domainRef 为 'campus'（旧版均为 campus domain），无需显式传入 domainConfig
    const engine = fromWorldState(state, {}, AndyEngine);

    expect(() => {
      engine.tick();
    }).not.toThrow();
  });
});
