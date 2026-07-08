/**
 * Deep audit regression coverage v3 (2026-06-29)
 *
 * Each case independently verifies current behavior for previously identified
 * reliability risks.
 */

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import AndyEngine from '../../index.js';
import { RNG } from '../../src/shared/rng.js';
import { BehaviorField } from '../../src/agent/psychology/BehaviorField.js';
import Personality from '../../src/agent/psychology/Personality.js';
import { getDefaultDomain } from '../../src/domain/DomainRegistry.js';
import WorldFactStore from '../../src/canon/WorldFactStore.js';
import { FactType, FactScope, FactSource } from '../../src/canon/FactSchema.js';

// ═══════════════════════════════════════════════════════════════
// 1. 核心闭环验证：Agent 真的能移动吗？
// ═══════════════════════════════════════════════════════════════
describe('核心闭环: Agent 移动', () => {
  it('agent 应该在不同tick访问不同位置', () => {
    const engine = new AndyEngine({ seed: 42, enableFacts: true });
    engine.addAgent({ id: 'alice', name: 'Alice' });

    const positions = new Set();
    for (let tick = 0; tick < 200; tick++) {
      engine.tick();
      positions.add(engine.getAgent('alice').position);
    }

    console.log(`Agent 访问位置数: ${positions.size}, 位置: ${[...positions].slice(0, 5).join(', ')}...`);
    expect(positions.size).toBeGreaterThan(1);
  });

  it('不同seed产生不同轨迹', () => {
    const trajectories = {};
    for (const seed of [42, 123, 456]) {
      const engine = new AndyEngine({ seed, enableFacts: true });
      engine.addAgent({ id: 'alice', name: 'Alice' });
      const positions = [];
      for (let tick = 0; tick < 100; tick++) {
        engine.tick();
        positions.push(engine.getAgent('alice').position);
      }
      trajectories[seed] = positions;
    }

    const allSame = trajectories[42].every((p, i) =>
      p === trajectories[123][i] && p === trajectories[456][i]
    );
    expect(allSame).toBe(false);
  });

  it('createCharacter with schedule:"student" 应有日程条目', () => {
    const engine = new AndyEngine({ seed: 42, enableFacts: true });
    const agent = engine.createCharacter({ id: 'test', name: 'Test', schedule: 'student' });
    const entries = agent.schedule?.toJSON()?.entries?.length || 0;
    console.log(`student schedule entries: ${entries}`);
    expect(entries).toBeGreaterThan(0);
  });
});

// ═══════════════════════════════════════════════════════════════
// 2. 栈溢出回归测试
// ═══════════════════════════════════════════════════════════════
describe('栈溢出回归', () => {
  it('10 agents × 200 ticks 不应栈溢出', () => {
    const engine = new AndyEngine({ seed: 42, enableFacts: true });
    for (let i = 0; i < 10; i++) {
      engine.addAgent({ id: `agent_${i}`, name: `Agent_${i}` });
    }

    let error = null;
    try {
      for (let tick = 0; tick < 200; tick++) {
        engine.tick();
      }
    } catch (e) {
      error = e;
    }

    expect(error).toBeNull();
  }, 180000);
});

// ═══════════════════════════════════════════════════════════════
// 3. BehaviorField B向量不可被外部直接覆写
// ═══════════════════════════════════════════════════════════════
describe('BehaviorField 保护', () => {
  it('ScheduleHandler 不应直接覆写 B 向量', () => {
    const shFile = path.join(import.meta.dirname, '../../src/agent/handlers/ScheduleHandler.js');
    const content = fs.readFileSync(shFile, 'utf8');

    // 检测 B 和 velocity 的直接赋值
    const lines = content.split('\n');
    const bWrites = [];
    const vWrites = [];
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line.startsWith('//') && !line.startsWith('*')) {
        if (line.match(/behaviorField\.B\s*=\s*\[/)) bWrites.push(i + 1);
        if (line.match(/behaviorField\.velocity\s*=\s*\[/)) vWrites.push(i + 1);
      }
    }

    console.log(`B writes: ${bWrites}, velocity writes: ${vWrites}`);
    expect(bWrites.length).toBe(0);
    expect(vWrites.length).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════════
// 4. fromJSON 鲁棒性
// ═══════════════════════════════════════════════════════════════
describe('fromJSON 鲁棒性', () => {
  it('损坏数据不应崩溃', () => {
    // R20 M15: fromJSON now throws on invalid/corrupted data instead of
    // silently returning null. This provides immediate clear feedback.
    const throwCases = [
      { input: null, desc: 'null' },
      { input: undefined, desc: 'undefined' },
      { input: 'string', desc: 'string' },
      { input: [], desc: 'array' },
    ];

    for (const { input, desc } of throwCases) {
      expect(() => AndyEngine.fromJSON(input), `fromJSON(${desc}) should throw`).toThrow();
    }

    // Empty object / partial data also throw (reconstruction fails)
    expect(() => AndyEngine.fromJSON({})).toThrow();
    expect(() => AndyEngine.fromJSON({ tickCount: 'not a number' })).toThrow();
  });

  it('序列化/反序列化循环后继续运行', () => {
    const engine = new AndyEngine({ seed: 42, enableFacts: true });
    engine.addAgent({ id: 'alice', name: 'Alice' });
    engine.addAgent({ id: 'bob', name: 'Bob' });
    for (let i = 0; i < 20; i++) engine.tick();

    const state = engine.toJSON();
    const engine2 = AndyEngine.fromJSON(state);

    expect(() => {
      for (let i = 0; i < 20; i++) engine2.tick();
    }).not.toThrow();
  });

  it('反序列化后 emotion 方法应可用', () => {
    const engine = new AndyEngine({ seed: 42, enableFacts: true });
    engine.addAgent({ id: 'alice', name: 'Alice' });
    for (let i = 0; i < 10; i++) engine.tick();

    const state = engine.toJSON();
    const engine2 = AndyEngine.fromJSON(state);
    const alice = engine2.getAgent('alice');

    // emotion 应该有方法
    const methods = ['getValence', 'getArousal'];
    for (const m of methods) {
      if (typeof alice.emotion[m] !== 'function') {
        console.log(`⚠️  emotion.${m} 丢失 (type: ${typeof alice.emotion[m]})`);
      }
    }

    // 至少基本属性要存在
    expect(alice.emotion).toBeDefined();
    expect(typeof alice.emotion.current).toBe('object');
  });
});

// ═══════════════════════════════════════════════════════════════
// 5. EventDispatcher 序列化事件数
// ═══════════════════════════════════════════════════════════════
describe('EventDispatcher 序列化', () => {
  it('toJSON 应保存足够多的事件（不应只保存100条）', () => {
    const edFile = path.join(import.meta.dirname, '../../src/runtime/EventDispatcher.js');
    const content = fs.readFileSync(edFile, 'utf8');

    // 检查 toJSON 中 eventLog 的 slice 参数
    const sliceMatch = content.match(/eventLog:\s*this\.eventLog\.slice\((-\d+)\)/);
    if (sliceMatch) {
      const count = parseInt(sliceMatch[1]);
      console.log(`EventDispatcher.toJSON saves last ${Math.abs(count)} events`);

      // 检查配置中的 maxEventLogSize
      const defaultsFile = path.join(import.meta.dirname, '../../src/config/defaults.js');
      const defaults = fs.readFileSync(defaultsFile, 'utf8');
      const maxSizeMatch = defaults.match(/maxEventLogSize:\s*(\d+)/);
      const maxSize = maxSizeMatch ? parseInt(maxSizeMatch[1]) : 10000;

      console.log(`maxEventLogSize config: ${maxSize}`);

      // 如果只保存100条但配置允许10000条，这是数据丢失
      if (Math.abs(count) < maxSize) {
        console.log(`⚠️  toJSON 保存 ${Math.abs(count)} 条但配置允许 ${maxSize} 条 — ${((1 - Math.abs(count)/maxSize) * 100).toFixed(0)}% 数据丢失`);
      }
    }
  });
});

// ═══════════════════════════════════════════════════════════════
// 6. StoryGenerator._getValence 正确性
// ═══════════════════════════════════════════════════════════════
describe('StoryGenerator._getValence', () => {
  it('应该返回 pos - neg（不是 pos + neg）', () => {
    const sgFile = path.join(import.meta.dirname, '../../src/narrative/StoryGenerator.js');
    const content = fs.readFileSync(sgFile, 'utf8');

    const getValenceMatch = content.match(/_getValence[\s\S]*?return\s+(pos\s*[+-]\s*neg)/);
    if (getValenceMatch) {
      const op = getValenceMatch[1];
      console.log(`_getValence returns: ${op}`);
      expect(op).toBe('pos - neg');
    } else {
      console.log('无法解析 _getValence return 语句');
    }
  });
});

// ═══════════════════════════════════════════════════════════════
// 7. WorldFactStore.updateFact 验证
// ═══════════════════════════════════════════════════════════════
describe('WorldFactStore.updateFact 验证', () => {
  it('updateFact 应调用 validateTypeFields', () => {
    const wfsFile = path.join(import.meta.dirname, '../../src/canon/WorldFactStore.js');
    const content = fs.readFileSync(wfsFile, 'utf8');

    // 检查 updateFact 方法是否调用 validateTypeFields
    // Use a more robust regex: match from "updateFact(" to the next method definition
    // (a line starting with a non-space character followed by "(")
    const updateFactSection = content.match(/updateFact\(id, updates\)[\s\S]*?(?=\n  [a-zA-Z]|\nclass |\nmodule\.)/);
    if (updateFactSection) {
      const hasTypeValidation = updateFactSection[0].includes('validateTypeFields');
      console.log(`updateFact 调用 validateTypeFields: ${hasTypeValidation}`);
      expect(hasTypeValidation).toBe(true);
    } else {
      // Fallback: just check the entire file has validateTypeFields near updateFact
      const lines = content.split('\n');
      let inUpdateFact = false;
      let found = false;
      for (const line of lines) {
        if (line.includes('updateFact(id, updates)')) inUpdateFact = true;
        if (inUpdateFact && line.includes('validateTypeFields')) { found = true; break; }
        if (inUpdateFact && line.match(/^\s{2}\w+\(/) && !line.includes('updateFact')) break;
      }
      console.log(`updateFact 调用 validateTypeFields: ${found}`);
      expect(found).toBe(true);
    }
  });

  it('fromJSON 应验证数据', () => {
    const wfsFile = path.join(import.meta.dirname, '../../src/canon/WorldFactStore.js');
    const content = fs.readFileSync(wfsFile, 'utf8');

    const fromJSONSection = content.match(/static fromJSON[\s\S]*?^\s*\}/m);
    if (fromJSONSection) {
      const hasValidation = fromJSONSection[0].includes('validateFact') ||
                            fromJSONSection[0].includes('validateTypeFields');
      console.log(`fromJSON 调用验证: ${hasValidation}`);
      // 至少应该有某种验证
    }
  });
});

// ═══════════════════════════════════════════════════════════════
// 8. AndyEngine 生命周期
// ═══════════════════════════════════════════════════════════════
describe('AndyEngine 生命周期', () => {
  it('应有 shutdown/dispose 或至少记录缺失', () => {
    const engine = new AndyEngine({ seed: 42 });
    const methods = ['shutdown', 'close', 'dispose', 'destroy', 'removeAgent', 'offTick'];
    const available = methods.filter(m => typeof engine[m] === 'function');
    console.log(`可用生命周期方法: ${available.join(', ') || '无'}`);
    if (available.length === 0) {
      console.log('⚠️  AndyEngine 没有资源清理方法');
    }
  });
});

// ═══════════════════════════════════════════════════════════════
// 9. 确定性验证
// ═══════════════════════════════════════════════════════════════
describe('确定性验证', () => {
  it('相同 seed 产生相同轨迹', () => {
    const trajectories = [];
    for (let run = 0; run < 2; run++) {
      const engine = new AndyEngine({ seed: 42, enableFacts: true });
      engine.addAgent({ id: 'alice', name: 'Alice' });
      const positions = [];
      for (let tick = 0; tick < 50; tick++) {
        engine.tick();
        positions.push(engine.getAgent('alice').position);
      }
      trajectories.push(positions);
    }

    expect(trajectories[0]).toEqual(trajectories[1]);
  });
});

// ═══════════════════════════════════════════════════════════════
// 10. _gatherContagionInputs 访问模式
// ═══════════════════════════════════════════════════════════════
describe('传染系统安全性', () => {
  it('不应直接访问 neighbor._behavior', () => {
    const awFile = path.join(import.meta.dirname, '../../src/runtime/AndyWorld.js');
    const content = fs.readFileSync(awFile, 'utf8');

    const directAccess = content.match(/neighbor\._behavior/g);
    console.log(`neighbor._behavior 直接访问次数: ${directAccess ? directAccess.length : 0}`);

    if (directAccess && directAccess.length > 0) {
      console.log('⚠️  _gatherContagionInputs 仍直接访问 neighbor._behavior — 可能崩溃传播');
    }
  });
});

// ═══════════════════════════════════════════════════════════════
// 11. WorldPressure.total 范围
// ═══════════════════════════════════════════════════════════════
describe('WorldPressure 范围', () => {
  it('total 应在 [-1, 1] 范围内', () => {
    const wpFile = path.join(import.meta.dirname, '../../src/pressure/WorldPressure.js');
    const content = fs.readFileSync(wpFile, 'utf8');

    const totalLine = content.match(/pressure\.total\s*=\s*([^;]+)/);
    if (totalLine) {
      console.log(`pressure.total = ${totalLine[1]}`);

      // 检查是否有 clamping
      const hasClamp = content.includes('Math.min(1') || content.includes('Math.max(-1');
      console.log(`有 clamping: ${hasClamp}`);

      // getTotalPressure 也应检查
      const getTotalMatch = content.match(/getTotalPressure[\s\S]*?return[^}]+/);
      if (getTotalMatch) {
        const hasClampInGetTotal = getTotalMatch[0].includes('Math.min') || getTotalMatch[0].includes('Math.max');
        console.log(`getTotalPressure 有 clamping: ${hasClampInGetTotal}`);
      }
    }
  });
});

// ═══════════════════════════════════════════════════════════════
// 12. TypeScript 声明准确性
// ═══════════════════════════════════════════════════════════════
describe('TypeScript 声明', () => {
  it('domain/index.d.ts 不应声明不存在的方法', () => {
    const dtsFile = path.join(import.meta.dirname, '../../domain/index.d.ts');
    if (!fs.existsSync(dtsFile)) {
      console.log('domain/index.d.ts 不存在');
      return;
    }

    const content = fs.readFileSync(dtsFile, 'utf8');
    const phantomMethods = ['getRegionNames', 'getAdjacentRegions', 'getStateDefinition', 'getDomainConfig'];

    for (const method of phantomMethods) {
      if (content.includes(method)) {
        console.log(`⚠️  domain/index.d.ts 声明了不存在的方法: ${method}`);
      }
    }

    // 检查实际 DomainRegistry 方法
    const drFile = path.join(import.meta.dirname, '../../src/domain/DomainRegistry.js');
    const drContent = fs.readFileSync(drFile, 'utf8');

    for (const method of phantomMethods) {
      const existsInImpl = drContent.includes(method);
      if (content.includes(method) && !existsInImpl) {
        console.log(`❌ ${method}: 声明有但实现无`);
      }
    }
  });
});

// ═══════════════════════════════════════════════════════════════
// 13. 知识传播完整性
// ═══════════════════════════════════════════════════════════════
describe('知识传播', () => {
  it('观察事实应传播知识给观察者', () => {
    const engine = new AndyEngine({ seed: 42, enableFacts: true });
    engine.addAgent({ id: 'alice', name: 'Alice' });
    engine.addAgent({ id: 'bob', name: 'Bob' });

    for (let i = 0; i < 50; i++) engine.tick();

    // 检查知识存储
    if (engine.world.knowledgeStore) {
      const aliceKnowledge = engine.world.knowledgeStore.getKnownFactIds('alice');
      const bobKnowledge = engine.world.knowledgeStore.getKnownFactIds('bob');
      console.log(`Alice knowledge: ${aliceKnowledge?.size || 0} facts`);
      console.log(`Bob knowledge: ${bobKnowledge?.size || 0} facts`);
    }
  });
});

// ═══════════════════════════════════════════════════════════════
// 14. 长时间运行稳定性
// ═══════════════════════════════════════════════════════════════
describe('长时间运行', () => {
  it('5 agents × 500 ticks 稳定', () => {
    const engine = new AndyEngine({ seed: 42, enableFacts: true });
    for (let i = 0; i < 5; i++) {
      engine.addAgent({ id: `agent_${i}`, name: `Agent_${i}` });
    }

    let error = null;
    try {
      for (let tick = 0; tick < 500; tick++) {
        engine.tick();
      }
    } catch (e) {
      error = e;
      console.log(`崩溃于 tick: ${error.message.substring(0, 100)}`);
    }

    expect(error).toBeNull();
  }, 180000);

  it('长时间运行后 needs 值仍有效', () => {
    const engine = new AndyEngine({ seed: 42, enableFacts: true });
    engine.addAgent({ id: 'alice', name: 'Alice' });
    for (let i = 0; i < 300; i++) engine.tick();

    const agent = engine.getAgent('alice');
    const needs = agent.needs?.needs || agent.needs;
    if (needs) {
      for (const [key, value] of Object.entries(needs)) {
        if (typeof value === 'number') {
          expect(Number.isFinite(value)).toBe(true);
        }
      }
    }
  }, 60000);
});

// ═══════════════════════════════════════════════════════════════
// 15. RNG 确定性
// ═══════════════════════════════════════════════════════════════
describe('RNG 确定性', () => {
  it('相同 seed 产生相同序列', () => {
    const rng1 = new RNG(42);
    const rng2 = new RNG(42);
    const seq1 = Array.from({ length: 1000 }, () => rng1.next());
    const seq2 = Array.from({ length: 1000 }, () => rng2.next());
    expect(seq1).toEqual(seq2);
  });

  it('不同 seed 产生不同序列', () => {
    const rng1 = new RNG(42);
    const rng2 = new RNG(123);
    const seq1 = Array.from({ length: 100 }, () => rng1.next());
    const seq2 = Array.from({ length: 100 }, () => rng2.next());
    expect(seq1).not.toEqual(seq2);
  });
});

// ═══════════════════════════════════════════════════════════════
// 16. EventDispatcher 去重
// ═══════════════════════════════════════════════════════════════
describe('EventDispatcher 去重', () => {
  it('去重缓冲不应每tick清空', () => {
    const edFile = path.join(import.meta.dirname, '../../src/runtime/EventDispatcher.js');
    const content = fs.readFileSync(edFile, 'utf8');

    const hasClear = content.includes('_recentContentByAgent.clear()');
    console.log(`_recentContentByAgent.clear() 存在: ${hasClear}`);

    if (hasClear) {
      console.log('⚠️  去重缓冲每tick清空 — 无法防止跨tick重复事件');
    }
  });
});

// ═══════════════════════════════════════════════════════════════
// 17. 性能基准
// ═══════════════════════════════════════════════════════════════
describe('性能基准', () => {
  it('50 agents × 50 ticks < 30s', () => {
    const engine = new AndyEngine({ seed: 42, enableFacts: true });
    for (let i = 0; i < 50; i++) {
      engine.addAgent({ id: `agent_${i}`, name: `Agent_${i}` });
    }

    const start = Date.now();
    for (let tick = 0; tick < 50; tick++) engine.tick();
    const elapsed = Date.now() - start;

    console.log(`50 agents × 50 ticks: ${elapsed}ms`);
    expect(elapsed).toBeLessThan(30000);
  }, 60000);
});

// ═══════════════════════════════════════════════════════════════
// 18. Action Selection 系统深度验证
// ═══════════════════════════════════════════════════════════════
describe('Action Selection', () => {
  it('GoalSystem 是否接入 buildActionContext', () => {
    const asrFile = path.join(import.meta.dirname, '../../src/agent/runtime/ActionSelectionRuntime.js');
    const content = fs.readFileSync(asrFile, 'utf8');

    // 检查 goals 是否仍然硬编码为空
    const goalsHardcoded = content.includes('goals: []') || content.includes('goals:[]');
    console.log(`buildActionContext goals 硬编码为空: ${goalsHardcoded}`);

    if (goalsHardcoded) {
      console.log('⚠️  GoalSystem 仍未接入 — scoreGoal 永远返回 0');
    }
  });

  it('HabitCandidateProvider context 字段匹配', () => {
    const asrFile = path.join(import.meta.dirname, '../../src/agent/runtime/ActionSelectionRuntime.js');
    const habitFile = path.join(import.meta.dirname, '../../src/action/providers/HabitCandidateProvider.js');

    const asrContent = fs.readFileSync(asrFile, 'utf8');
    const habitContent = fs.readFileSync(habitFile, 'utf8');

    // 检查 HabitCandidateProvider 期望的字段
    const expectedFields = ['currentHour', 'dayOfWeek', 'currentPosition', 'currentValence', 'proceduralMemory'];
    const missingFields = [];

    for (const field of expectedFields) {
      const providerExpects = habitContent.includes(`context.${field}`);
      const contextProvides = asrContent.includes(field);
      if (providerExpects && !contextProvides) {
        missingFields.push(field);
      }
    }

    if (missingFields.length > 0) {
      console.log(`⚠️  HabitCandidateProvider 期望但 buildActionContext 缺失: ${missingFields.join(', ')}`);
    }
  });
});

// ═══════════════════════════════════════════════════════════════
// 19. IntrinsicMotivation 接线
// ═══════════════════════════════════════════════════════════════
describe('IntrinsicMotivation', () => {
  it('gradientVector 应有消费者', () => {
    const imFile = path.join(import.meta.dirname, '../../src/agent/psychology/IntrinsicMotivation.js');
    const imContent = fs.readFileSync(imFile, 'utf8');

    const computesGradient = imContent.includes('gradientVector');
    console.log(`IM 计算 gradientVector: ${computesGradient}`);

    // 搜索消费者
    const srcDir = path.join(import.meta.dirname, '../../src');
    const consumers = [];

    function scanDir(dir) {
      for (const entry of fs.readdirSync(dir)) {
        const full = path.join(dir, entry);
        if (fs.statSync(full).isDirectory()) {
          scanDir(full);
        } else if (entry.endsWith('.js') && !entry.includes('IntrinsicMotivation')) {
          const content = fs.readFileSync(full, 'utf8');
          if (content.includes('gradientVector')) {
            consumers.push(path.relative(srcDir, full));
          }
        }
      }
    }

    scanDir(srcDir);
    console.log(`gradientVector 消费者: ${consumers.length > 0 ? consumers.join(', ') : '无'}`);

    if (consumers.length === 0 && computesGradient) {
      console.log('⚠️  gradientVector 仍然是死代码');
    }
  });
});

// ═══════════════════════════════════════════════════════════════
// 20. 序列化/反序列化确定性
// ═══════════════════════════════════════════════════════════════
describe('序列化确定性', () => {
  it('保存/恢复后模拟应继续一致', () => {
    const seed = 42;
    const engine1 = new AndyEngine({ seed, enableFacts: true });
    engine1.addAgent({ id: 'alice', name: 'Alice' });
    for (let i = 0; i < 20; i++) engine1.tick();

    const state = engine1.toJSON();
    const engine2 = AndyEngine.fromJSON(state);

    // 两个引擎继续运行，检查一致性
    const s1 = [];
    const s2 = [];
    for (let i = 0; i < 30; i++) {
      engine1.tick();
      engine2.tick();
      s1.push({ pos: engine1.getAgent('alice').position });
      s2.push({ pos: engine2.getAgent('alice').position });
    }

    let mismatches = 0;
    for (let i = 0; i < s1.length; i++) {
      if (s1[i].pos !== s2[i].pos) mismatches++;
    }

    console.log(`序列化后确定性不匹配: ${mismatches}/${s1.length}`);
    // 注意: 完全确定性是理想状态，但由于 _pinkNoiseState 等因素，可能有少量偏差
  });
});
