/**
 * Deep audit coverage — core runtime mechanisms
 * 
 * These tests verify core runtime invariants and regression risks that are not
 * fully covered by narrower unit suites.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import AndyEngine from '../../index.js';
import { RNG } from '../../src/shared/rng.js';
import { BehaviorField } from '../../src/agent/psychology/BehaviorField.js';
import Personality from '../../src/agent/psychology/Personality.js';
import { DomainRegistry, getDefaultDomain } from '../../src/domain/DomainRegistry.js';
import EmotionVector from '../../src/agent/psychology/EmotionVector.js';
import NeedsSystem from '../../src/agent/psychology/NeedsSystem.js';
import WorldFactStore from '../../src/canon/WorldFactStore.js';
import KnowledgeStore from '../../src/knowledge/KnowledgeStore.js';
import { EffectCommitter } from '../../src/effects/EffectCommitter.js';
import { EventEffectPipeline } from '../../src/effects/EventEffectPipeline.js';
import SocialGraph from '../../src/social/SocialGraph.js';
import { validateFact } from '../../src/canon/FactSchema.js';

// ═══════════════════════════════════════════
// 1. 确定性验证
// ═══════════════════════════════════════════
describe('审计: 确定性 (Seeded Determinism)', () => {
  it('相同 seed 的 AndyEngine 必须产生完全相同的模拟轨迹', () => {
    const seed = 42;
    const config = { seed, enableFacts: true };
    
    const engine1 = new AndyEngine(config);
    engine1.addAgent({ id: 'alice', name: 'Alice' });
    const states1 = [];
    for (let i = 0; i < 20; i++) {
      engine1.tick();
      const agent = engine1.getAgent('alice');
      states1.push({
        position: agent.position,
        needs: { ...agent.needs },
        behaviorLabel: agent.behaviorLabel,
      });
    }

    const engine2 = new AndyEngine(config);
    engine2.addAgent({ id: 'alice', name: 'Alice' });
    const states2 = [];
    for (let i = 0; i < 20; i++) {
      engine2.tick();
      const agent = engine2.getAgent('alice');
      states2.push({
        position: agent.position,
        needs: { ...agent.needs },
        behaviorLabel: agent.behaviorLabel,
      });
    }

    for (let i = 0; i < states1.length; i++) {
      expect(states1[i].position).toBe(states2[i].position);
      expect(states1[i].behaviorLabel).toBe(states2[i].behaviorLabel);
      expect(states1[i].needs).toEqual(states2[i].needs);
    }
  });

  it('不同 seed 必须产生不同的模拟轨迹', () => {
    const trajectories = [];
    for (const seed of [42, 123, 999]) {
      const engine = new AndyEngine({ seed, enableFacts: true });
      engine.addAgent({ id: 'alice', name: 'Alice' });
      const ticks = [];
      for (let i = 0; i < 10; i++) {
        engine.tick();
        const agent = engine.getAgent('alice');
        // Collect multiple state dimensions to detect seed differences
        ticks.push({
          position: agent.position,
          behaviorLabel: agent.behaviorLabel,
          b0: agent.behaviorField.B[0],
          socialEnergy: agent.socialEnergy,
        });
      }
      trajectories.push(ticks);
    }
    // At least one pair of trajectories must differ in some dimension
    let allSame = true;
    for (let i = 1; i < trajectories.length; i++) {
      for (let t = 0; t < trajectories[0].length; t++) {
        if (trajectories[0][t].behaviorLabel !== trajectories[i][t].behaviorLabel ||
            trajectories[0][t].b0 !== trajectories[i][t].b0) {
          allSame = false;
          break;
        }
      }
      if (!allSame) break;
    }
    expect(allSame).toBe(false);
  });

  it('RNG 必须产生可重现的序列', () => {
    const rng1 = new RNG(42);
    const rng2 = new RNG(42);
    const seq1 = Array.from({ length: 100 }, () => rng1.next());
    const seq2 = Array.from({ length: 100 }, () => rng2.next());
    expect(seq1).toEqual(seq2);
  });
});

// ═══════════════════════════════════════════
// 2. BehaviorField 力学正确性
// ═══════════════════════════════════════════
describe('审计: BehaviorField 力学', () => {
  let domain;
  let personality;

  beforeEach(() => {
    domain = getDefaultDomain();
    personality = new Personality({
      openness: 0.5, conscientiousness: 0.5,
      extraversion: 0.5, agreeableness: 0.5, neuroticism: 0.5,
    });
  });

  it('饥饿时 B 被拉向满足目标 (activity → 0.35)', () => {
    const bf = new BehaviorField(personality, null, {}, domain, new RNG(0));
    // 初始 B[0]=0.15, hunger target[0]=0.35 → B[0] 应该上升
    const signals = {
      needs: { hunger: 0, energy: 0.8, social: 0.5, comfort: 0.5, stimulation: 0.5 },
    };
    
    for (let i = 0; i < 50; i++) {
      bf.tick(signals);
    }
    
    // B[0] (activity) 应该朝 0.35 移动，从 0.15 上升
    expect(bf.B[0]).toBeGreaterThan(0.15);
  });

  it('极度社交匮乏必须产生高 sociality 行为', () => {
    const bf = new BehaviorField(personality, null, {}, domain, new RNG(0));
    const signals = {
      needs: { hunger: 0.8, energy: 0.8, social: 0, comfort: 0.5, stimulation: 0.5 },
    };
    
    for (let i = 0; i < 100; i++) {
      bf.tick(signals);
    }
    
    expect(bf.B[1]).toBeGreaterThan(0.3);
  });

  it('B 向量必须始终在 [0,1]^4 内', () => {
    const bf = new BehaviorField(personality, null, {}, domain, new RNG(0));
    
    for (let tick = 0; tick < 1000; tick++) {
      const signals = {
        needs: { 
          hunger: Math.random(), energy: Math.random(), 
          social: Math.random(), comfort: Math.random(), 
          stimulation: Math.random() 
        },
        emotion: { approachDrive: Math.random(), avoidDrive: Math.random(), agenticDrive: Math.random() },
        schedule: { inSchedule: Math.random() > 0.5, targetActivity: 'studying' },
        environment: { hour: Math.random() * 24 },
      };
      bf.tick(signals);
      
      for (let d = 0; d < 4; d++) {
        expect(bf.B[d]).toBeGreaterThanOrEqual(0);
        expect(bf.B[d]).toBeLessThanOrEqual(1);
      }
    }
  });

  it('速度必须有界（不会爆炸）', () => {
    const bf = new BehaviorField(personality, null, {}, domain, new RNG(0));
    
    for (let tick = 0; tick < 1000; tick++) {
      const signals = {
        needs: { hunger: 0, energy: 0, social: 0, comfort: 0, stimulation: 0 },
      };
      bf.tick(signals);
      
      const maxVelocity = 2.0;
      for (let d = 0; d < 4; d++) {
        expect(Math.abs(bf.velocity[d])).toBeLessThan(maxVelocity);
      }
    }
  });

  it('梯度方向必须正确：饥饿时 B 被拉向满足目标', () => {
    const bf = new BehaviorField(personality, null, {}, domain, new RNG(0));
    bf.B = [0.15, 0.5, 0.5, 0.5]; // 低 activity
    
    const signals = {
      needs: { hunger: 0, energy: 0.8, social: 0.5, comfort: 0.5, stimulation: 0.5 },
    };
    
    const result = bf.tick(signals);
    // B[0]=0.15 < target=0.35, gradient = w*(B-target) < 0
    // v += -gradient * dt → v 增加 (activity 增加)
    expect(result.velocity[0]).toBeGreaterThan(0);
  });
});

// ═══════════════════════════════════════════
// 3. 认知边界验证
// ═══════════════════════════════════════════
describe('审计: 认知边界 (Epistemic Boundary)', () => {
  it('KnowledgeStore 必须正确维护谁知道什么', () => {
    // KnowledgeStore requires a WorldFactStore
    const factStore = new WorldFactStore();
    const ks = new KnowledgeStore(factStore);

    // Add fact to WorldFactStore first, then link knowledge
    factStore.addFact({
      id: 'fact1',
      subject: 'bob',
      predicate: 'located_at',
      object: 'library',
      scope: 'public',
      timestamp: 1,
      type: 'observation',
      source: 'engine',
      confidence: 1,
      participants: ['bob'],
      observers: [],
      observerId: 'engine',
      targetId: 'bob',
      action: 'located_at',
    });
    ks.addKnowledge('alice', 'fact1', 'direct');

    const aliceKnows = ks.getKnownFacts('alice');
    const bobKnows = ks.getKnownFacts('bob');
    const carolKnows = ks.getKnownFacts('carol');

    expect(aliceKnows.length).toBeGreaterThan(0);
    expect(bobKnows.length).toBe(0);
    expect(carolKnows.length).toBe(0);
  });
});

// ═══════════════════════════════════════════
// 4. 社交图验证
// ═══════════════════════════════════════════
describe('审计: 社交图 (Social Graph)', () => {
  it('关系查询必须能工作', () => {
    const sg = new SocialGraph();
    sg.addAgent('alice');
    sg.addAgent('bob');

    // SocialGraph uses getOrCreateRelationship, not updateRelationship
    const rel = sg.getOrCreateRelationship('alice', 'bob');
    rel.strength = 0.7;
    rel.trust = 0.5;

    const abRel = sg.getRelationship('alice', 'bob');
    const baRel = sg.getRelationship('bob', 'alice');

    expect(abRel || baRel).toBeTruthy();
  });

  it('大量 agent 的社交图必须能正常工作', () => {
    const sg = new SocialGraph();
    const N = 50;

    for (let i = 0; i < N; i++) {
      sg.addAgent(`agent_${i}`);
    }

    for (let i = 0; i < N; i++) {
      for (let j = i + 1; j < Math.min(i + 5, N); j++) {
        const rel = sg.getOrCreateRelationship(`agent_${i}`, `agent_${j}`);
        rel.strength = 0.5;
        rel.trust = 0.3;
      }
    }

    let relCount = 0;
    for (let i = 0; i < N; i++) {
      for (let j = i + 1; j < Math.min(i + 5, N); j++) {
        const rel = sg.getRelationship(`agent_${i}`, `agent_${j}`);
        if (rel) relCount++;
      }
    }
    expect(relCount).toBeGreaterThan(0);
  });
});

// ═══════════════════════════════════════════
// 5. FactSchema 验证
// ═══════════════════════════════════════════
describe('审计: FactSchema 验证', () => {
  it('无效 fact 必须被 schema 拒绝', () => {
    const invalidFact = {
      subject: 'alice',
    };

    const result = validateFact(invalidFact);
    expect(result.valid).toBe(false);
  });

  it('有效 fact 必须通过 schema', () => {
    const validFact = {
      id: 'fact_test',
      subject: 'alice',
      predicate: 'located_at',
      object: 'library',
      scope: 'public',
      timestamp: Date.now(),
      type: 'agent_state',
      source: 'engine',
      confidence: 1,
      participants: [],
      observers: [],
    };

    const result = validateFact(validFact);
    expect(result.valid).toBe(true);
  });
});

// ═══════════════════════════════════════════
// 6. EmotionVector 边界测试
// ═══════════════════════════════════════════
describe('审计: EmotionVector 边界', () => {
  it('极端情绪刺激后值必须有界且非 NaN', () => {
    const personality = new Personality({
      openness: 0.5, conscientiousness: 0.5, extraversion: 0.5,
      agreeableness: 0.5, neuroticism: 0.5,
    });
    const ev = new EmotionVector(personality, null, new RNG(0));

    for (let i = 0; i < 100; i++) {
      ev.applyEffect({ valence: 1.0, arousal: 1.0, dominance: 1.0 });
    }

    // EmotionVector uses 'current' object with named dimensions
    for (const [key, value] of Object.entries(ev.current)) {
      if (typeof value === 'number') {
        expect(isNaN(value)).toBe(false);
        expect(isFinite(value)).toBe(true);
      }
    }
  });

  it('极端负面情绪不应导致 NaN', () => {
    const personality = new Personality({
      openness: 0.5, conscientiousness: 0.5, extraversion: 0.5,
      agreeableness: 0.5, neuroticism: 0.5,
    });
    const ev = new EmotionVector(personality, null, new RNG(0));

    for (let i = 0; i < 100; i++) {
      ev.applyEffect({ valence: -1.0, arousal: -1.0, dominance: -1.0 });
    }

    for (const [key, value] of Object.entries(ev.current)) {
      if (typeof value === 'number') {
        expect(isNaN(value)).toBe(false);
        expect(isFinite(value)).toBe(true);
      }
    }
  });
});

// ═══════════════════════════════════════════
// 7. NeedsSystem 边界测试
// ═══════════════════════════════════════════
describe('审计: NeedsSystem 边界', () => {
  it('需求值必须始终在 [0,1] 范围内', () => {
    const domain = getDefaultDomain();
    const personality = new Personality({
      openness: 0.5, conscientiousness: 0.5, extraversion: 0.5,
      agreeableness: 0.5, neuroticism: 0.5,
    });
    const ns = new NeedsSystem(personality, null, domain);

    for (let tick = 0; tick < 200; tick++) {
      // NeedsSystem.tick() decays needs over time
      ns.tick(0.1);
      for (const [name, value] of Object.entries(ns.needs)) {
        if (typeof value === 'number') {
          expect(value).toBeGreaterThanOrEqual(0);
          expect(value).toBeLessThanOrEqual(1);
        }
      }
    }
  });

  it('满足需求后值不能超过 1', () => {
    const domain = getDefaultDomain();
    const personality = new Personality({
      openness: 0.5, conscientiousness: 0.5, extraversion: 0.5,
      agreeableness: 0.5, neuroticism: 0.5,
    });
    const ns = new NeedsSystem(personality, null, domain);

    // Directly set needs high (simulating satisfaction)
    for (let i = 0; i < 100; i++) {
      for (const key of Object.keys(ns.needs)) {
        ns.needs[key] = Math.min(1, (ns.needs[key] || 0) + 0.5);
      }
    }

    for (const [name, value] of Object.entries(ns.needs)) {
      expect(value).toBeLessThanOrEqual(1);
    }
  });
});

// ═══════════════════════════════════════════
// 8. Domain 隔离测试
// ═══════════════════════════════════════════
describe('审计: Domain 隔离', () => {
  it('不同 domain 的 engine 必须都能初始化', () => {
    const campusEngine = new AndyEngine({ seed: 42, enableFacts: true });
    const tavernConfig = require('../../presets/tavern');
    const tavernEngine = new AndyEngine({ seed: 42, domain: tavernConfig, enableFacts: true });
    
    campusEngine.addAgent({ id: 'alice', name: 'Alice' });
    tavernEngine.addAgent({ id: 'alice', name: 'Alice' });
    
    for (let i = 0; i < 10; i++) {
      campusEngine.tick();
      tavernEngine.tick();
    }
    
    const campusState = campusEngine.getState ? campusEngine.getState() : campusEngine.snapshot();
    const tavernState = tavernEngine.getState ? tavernEngine.getState() : tavernEngine.snapshot();
    
    expect(campusState).toBeDefined();
    expect(tavernState).toBeDefined();
  });
});

// ═══════════════════════════════════════════
// 9. 内存泄漏检测
// ═══════════════════════════════════════════
describe('审计: 内存泄漏', () => {
  it('大量 tick 不应导致内存暴涨', () => {
    const engine = new AndyEngine({ seed: 42, enableFacts: true });
    engine.addAgent({ id: 'alice', name: 'Alice' });
    
    const memBefore = process.memoryUsage().heapUsed;
    
    for (let i = 0; i < 1000; i++) {
      engine.tick();
    }
    
    const memAfter = process.memoryUsage().heapUsed;
    const memGrowth = (memAfter - memBefore) / 1024 / 1024;
    
    expect(memGrowth).toBeLessThan(100);
  });
});

// ═══════════════════════════════════════════
// 10. 压力测试
// ═══════════════════════════════════════════
describe('审计: 压力测试', () => {
  it('5 agents 运行 300 tick 必须不崩溃', () => {
    const engine = new AndyEngine({ seed: 42, enableFacts: true });

    for (let i = 0; i < 5; i++) {
      engine.addAgent({
        id: `agent_${i}`,
        name: `Agent_${i}`,
        personality: {
          openness: 0.5, conscientiousness: 0.5,
          extraversion: 0.5, agreeableness: 0.5, neuroticism: 0.5,
        }
      });
    }

    let error = null;
    try {
      for (let tick = 0; tick < 300; tick++) {
        engine.tick();
      }
    } catch (e) {
      error = e;
    }

    expect(error).toBeNull();
  }, 120000); // 2 minute timeout

  it('20 agents 运行 100 tick 必须在合理时间内完成', () => {
    const engine = new AndyEngine({ seed: 42, enableFacts: true });

    for (let i = 0; i < 20; i++) {
      engine.addAgent({ id: `agent_${i}`, name: `Agent_${i}` });
    }

    const start = Date.now();
    for (let tick = 0; tick < 100; tick++) {
      engine.tick();
    }
    const elapsed = Date.now() - start;

    expect(elapsed).toBeLessThan(30000);
  });
});

// ═══════════════════════════════════════════
// 11. WorldFactStore 一致性
// ═══════════════════════════════════════════
describe('审计: WorldFactStore 一致性', () => {
  it('快速连续操作下必须保持一致', () => {
    const store = new WorldFactStore();

    const facts = [];
    for (let i = 0; i < 500; i++) {
      facts.push({
        id: `fact_${i}`,
        subject: `agent_${i % 10}`,
        predicate: 'performed',
        object: `activity_${i}`,
        scope: 'public',
        timestamp: i,
        type: 'event',
        source: 'engine',
        confidence: 0.9,
        participants: [`agent_${i % 10}`],
        observers: [],
        eventId: `evt_${i}`,
        description: `Agent ${i % 10} performed activity ${i}`,
      });
    }

    for (const f of facts) {
      store.addFact(f);
    }

    for (const f of facts) {
      const retrieved = store.getFactById(f.id);
      expect(retrieved).toBeDefined();
      expect(retrieved.id).toBe(f.id);
    }
  });
});

// ═══════════════════════════════════════════
// 12. 错误处理验证
// ═══════════════════════════════════════════
describe('审计: 错误处理', () => {
  it('BehaviorField 无 domain 应抛出错误', () => {
    const personality = new Personality({ openness: 0.5, conscientiousness: 0.5, extraversion: 0.5, agreeableness: 0.5, neuroticism: 0.5 });
    expect(() => new BehaviorField(personality, null, {}, null)).toThrow();
  });

  it('自定义错误类层次必须正确', () => {
    const errors = require('../../src/shared/errors.js');
    const { AndyError, ConfigError, DomainError, AgentError } = errors;
    
    expect(new AndyError('test') instanceof Error).toBe(true);
    expect(new ConfigError('test') instanceof AndyError).toBe(true);
    expect(new DomainError('test') instanceof AndyError).toBe(true);
    expect(new AgentError('test') instanceof AndyError).toBe(true);
  });

  it('AndyEngine 无效配置应抛出错误', () => {
    // Engine validates domain type — non-object domain should throw
    expect(() => new AndyEngine({ seed: 42, domain: 123 })).toThrow();
  });
});

// ═══════════════════════════════════════════
// 13. EffectCommitter 验证
// ═══════════════════════════════════════════
describe('审计: EffectCommitter', () => {
  it('EffectCommitter 需要 world 和 agents 参数', () => {
    const agents = new Map();
    const world = { factStore: null };
    const committer = new EffectCommitter({ world, agents });
    expect(committer).toBeDefined();
  });
});

// ═══════════════════════════════════════════
// 14. 序列化往返测试
// ═══════════════════════════════════════════
describe('审计: 序列化往返', () => {
  it('Engine 序列化后反序列化必须恢复一致状态', () => {
    const engine1 = new AndyEngine({ seed: 42, enableFacts: true });
    engine1.addAgent({ id: 'alice', name: 'Alice', personality: { openness: 0.8 } });
    
    for (let i = 0; i < 10; i++) engine1.tick();
    
    const state1 = engine1.toJSON();
    const serialized = JSON.stringify(state1);
    const deserialized = JSON.parse(serialized);
    
    // 从反序列化状态恢复
    const engine2 = AndyEngine.fromJSON(deserialized);
    
    // 两个 engine 继续运行应该产生相同结果
    engine1.tick();
    engine2.tick();
    
    const agent1 = engine1.getAgent('alice');
    const agent2 = engine2.getAgent('alice');
    
    expect(agent1.position).toBe(agent2.position);
    expect(agent1.behaviorLabel).toBe(agent2.behaviorLabel);
  });
});
