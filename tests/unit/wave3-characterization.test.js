/**
 * Wave 3a — 前置 characterization tests
 *
 * 目的:锁定当前 campus 默认行为、自定义 domain 行为、存档 round-trip
 * 与 domainRef 校验,作为 Wave 3b/3c/3d 域纯度迁移的回归安全网。
 *
 * 护栏:本文件只锁定【当前实际行为】,不改 src/presets/facade。
 * 若发现当前行为有 bug 或契约与预期不符,据实记录但不修(Wave 3b+ 处理)。
 *
 * 持久化 API 说明(与执行计划伪代码的映射):
 *   AndyEngine(index.js 公共 facade)本身没有 save()/load() 实例/静态方法,
 *   只有 toJSON() / static fromJSON()(后者不校验 domainRef)。
 *   官方推荐持久化路径是 WorldStateAdapter(index.js:466 注释明示):
 *     - toWorldState(engine, worldId)              → 产出 Stable World Envelope(含 domainRef)
 *     - fromWorldState(state, config, AndyEngine)  → 还原引擎并校验 domainRef
 *   domainRef 校验中的 campus 特判(fromWorldState 第 85-87 行、SDK Andy.load /
 *   Character.load)正是 Wave 3d 要泛化的目标,此处先锁定其存在与抛错文本。
 *
 * 组4(域纯度基线)为记录性注释,见文件末尾。
 */

import { describe, it, expect } from 'vitest';
import AndyEngine from '../../index.js';
import { createRequire } from 'node:module';
// CJS require 保证本测试引用的 Schedule 类与 preset 工厂内部 require 的 Schedule 是同一身份
// (ESM import 与 CJS require 在 vitest 下会产生不同的 class 身份,导致 instanceof 失败)
const require = createRequire(import.meta.url);
const Schedule = require('../../src/agent/schedule/Schedule');
const campusSchedules = require('../../presets/campus/schedules');
import { toWorldState, fromWorldState } from '../../store/index.js';
import { validateDomain } from '../../src/domain/validateDomain.js';

/**
 * 最小合法自定义 domain config(id !== 'campus')。
 * 通过 validateDomain,可创建角色、可 tick、可 round-trip。
 * 故意不复用 presets/tavern(已有独立测试覆盖),以验证「任意自定义域」机制。
 */
function makeCustomDomain() {
  return {
    id: 'wave3-test',
    name: 'Wave3 Test World',
    version: '0.1.0',
    regions: ['家', '广场', '工坊'],
    states: {
      '休息': { next: ['工作', '闲逛'], hours: [0, 8] },
      '工作': { next: ['休息', '闲逛'], hours: [8, 17] },
      '闲逛': { next: ['休息', '工作'], hours: [17, 24] },
    },
    stateCenters: {
      '休息': [0.1, 0.1, 0.2, 0.2],
      '工作': [0.9, 0.3, 0.8, 0.4],
      '闲逛': [0.5, 0.8, 0.2, 0.7],
    },
    roleArchetypes: {
      villager: {
        defaultRegion: '家',
        entries: [
          { hour: 8, region: '工坊', state: '工作' },
          { hour: 18, region: '广场', state: '闲逛' },
          { hour: 22, region: '家', state: '休息' },
        ],
      },
    },
    fallback: { defaultRegion: '家', defaultState: '休息', unknownRegion: '家', unknownState: '休息' },
  };
}

// ═══════════════════════════════════════════════════════════════
// 组1:campus 默认行为(向后兼容基线)
// ═══════════════════════════════════════════════════════════════

describe('Wave 3a · 组1 campus 默认行为(向后兼容基线)', () => {
  it('1. new AndyEngine() 无 domain 参数时 engine.domain.id === "campus"', () => {
    const engine = new AndyEngine();
    expect(engine.domain.id).toBe('campus');
  });

  it('2. 默认引擎创建 campus 角色 + tick 多轮不抛错', () => {
    const engine = new AndyEngine();
    const agent = engine.createCharacter({
      id: 'stu1',
      name: '测试学生',
      mbti: 'INFP',
      background: ['一个测试学生'],
      schedule: 'student', // campus role/schedule
    });

    expect(() => {
      for (let i = 0; i < 15; i++) engine.tick();
    }).not.toThrow();

    expect(engine.getAllAgents().length).toBe(1);
    expect(engine.getAgent('stu1')).toBeDefined();
    expect(engine.domain.id).toBe('campus');
  });

  it('3. campus schedule 工厂产出可用 Schedule 实例(toJSON 有效、有 entries、fromJSON 可还原)', () => {
    const factories = [
      ['student', campusSchedules.createStudentSchedule()],
      ['worker', campusSchedules.createWorkerSchedule()],
      ['freelancer', campusSchedules.createFreelancerSchedule()],
      ['home', campusSchedules.createHomeSchedule()],
    ];

    for (const [label, schedule] of factories) {
      expect(schedule).toBeInstanceOf(Schedule);
      const json = schedule.toJSON();
      // toJSON 产出可序列化结构
      expect(json).toBeInstanceOf(Object);
      expect(Array.isArray(json.entries)).toBe(true);
      expect(json.entries.length).toBeGreaterThan(0);
      // fromJSON 可还原为 Schedule 实例(round-trip 成立)
      const restored = Schedule.fromJSON(json);
      expect(restored).toBeInstanceOf(Schedule);
      // 还原后 entries 数量一致
      expect(restored.toJSON().entries.length).toBe(json.entries.length);
    }
  });

  it('4. campus 存档 round-trip:domainRef 一致、引擎状态可恢复、agent 可重建', () => {
    const engine = new AndyEngine();
    engine.createCharacter({
      id: 'stu2',
      name: '存档学生',
      mbti: 'ENFJ',
      background: ['会存档的学生'],
    });
    for (let i = 0; i < 10; i++) engine.tick();

    const state = toWorldState(engine, 'world-campus');
    expect(state.domainRef).toBe('campus');

    const restored = fromWorldState(state, {}, AndyEngine);
    expect(restored.domain.id).toBe('campus');
    // agent 重建
    expect(restored.getAllAgents().length).toBe(1);
    const agent = restored.getAgent('stu2');
    expect(agent).toBeDefined();
    expect(agent.name).toBe('存档学生');
    // 引擎状态可继续推进(不抛错)
    expect(() => restored.tick()).not.toThrow();
  });
});

// ═══════════════════════════════════════════════════════════════
// 组2:自定义 domain 行为
// ═══════════════════════════════════════════════════════════════

describe('Wave 3a · 组2 自定义 domain 行为', () => {
  it('5. 最小合法自定义 domain config 经 validateDomain 通过,且 engine.domain.id === 自定义 id(不 fallback 到 campus)', () => {
    const customDomain = makeCustomDomain();

    // 先确认 config 本身合法
    const result = validateDomain(customDomain, { strict: false, throwOnError: false });
    expect(result.valid).toBe(true);

    const engine = new AndyEngine({ domain: customDomain });
    expect(engine.domain.id).toBe('wave3-test');
    expect(engine.domain.id).not.toBe('campus');
  });

  it('6. 自定义 domain 下创建角色 + tick 不抛错(不 fallback 到 campus)', () => {
    const engine = new AndyEngine({ domain: makeCustomDomain() });
    const agent = engine.createCharacter({
      id: 'vil1',
      name: '村民',
      mbti: 'ISTJ',
      background: ['一个村民'],
      schedule: 'villager', // 走 domain.roleArchetypes,非 campus preset
    });

    // 角色落在自定义域的默认区域(非 campus 区域)
    expect(agent.position).toBe('家');
    expect(engine.domain.id).toBe('wave3-test');

    expect(() => {
      for (let i = 0; i < 15; i++) engine.tick();
    }).not.toThrow();

    expect(engine.getAllAgents().length).toBe(1);
  });
});

// ═══════════════════════════════════════════════════════════════
// 组3:存档 round-trip 与 domainRef 校验(锁定 Wave 3d 要泛化的特判)
// ═══════════════════════════════════════════════════════════════

describe('Wave 3a · 组3 存档 round-trip 与 domainRef 校验', () => {
  it('7. campus 存档:toWorldState → fromWorldState(state, {}, AndyEngine) 成功,domainRef === "campus"', () => {
    const engine = new AndyEngine();
    engine.createCharacter({ id: 'c1', name: '学生', mbti: 'INFP', background: ['x'] });
    for (let i = 0; i < 5; i++) engine.tick();

    const state = toWorldState(engine, 'w-campus');
    expect(state.domainRef).toBe('campus');

    // campus 存档无 config.domain 仍可加载(campus 是免校验特权域 —— Wave 3d 将泛化此特判)
    const restored = fromWorldState(state, {}, AndyEngine);
    expect(restored.domain.id).toBe('campus');
    expect(restored.getAllAgents().length).toBe(1);
  });

  it('8. 自定义 domain 存档:toWorldState → fromWorldState(state, {domain}, AndyEngine) 成功,domainRef === 自定义 id', () => {
    const customDomain = makeCustomDomain();
    const engine = new AndyEngine({ domain: customDomain });
    engine.createCharacter({ id: 'v1', name: '村民', mbti: 'ISTJ', background: ['x'] });
    for (let i = 0; i < 5; i++) engine.tick();

    const state = toWorldState(engine, 'w-custom');
    expect(state.domainRef).toBe('wave3-test');

    const restored = fromWorldState(state, { domain: customDomain }, AndyEngine);
    expect(restored.domain.id).toBe('wave3-test');
    expect(restored.getAllAgents().length).toBe(1);
    expect(restored.getAgent('v1')).toBeDefined();
  });

  it('9. domainRef 不匹配:config.domain.id !== state.domainRef 时 fromWorldState 抛错(锁定错误行为)', () => {
    const customDomain = makeCustomDomain();
    const engine = new AndyEngine({ domain: customDomain });
    engine.createCharacter({ id: 'v2', name: '村民', mbti: 'ISTJ', background: ['x'] });
    const state = toWorldState(engine, 'w-mismatch');

    // 传入了 domain 但 id 与存档 domainRef 不一致
    expect(() => {
      fromWorldState(state, { domain: { id: 'other-domain' } }, AndyEngine);
    }).toThrow(/domainRef 不匹配|domain 不匹配/);
  });

  it('10. 非 campus domainRef 但未传 config.domain 时 fromWorldState 抛错(锁定现有 campus 特判行为)', () => {
    const customDomain = makeCustomDomain();
    const engine = new AndyEngine({ domain: customDomain });
    engine.createCharacter({ id: 'v3', name: '村民', mbti: 'ISTJ', background: ['x'] });
    const state = toWorldState(engine, 'w-nocfg');

    // 非 campus 存档、未提供 domain config → 当前行为是抛错(Wave 3d 将泛化此特判)
    expect(() => {
      fromWorldState(state, {}, AndyEngine);
    }).toThrow(/非 campus domain|必须.*config\.domain|domain 配置/);
  });
});

// ═══════════════════════════════════════════════════════════════
// 组4:domain purity 基线(记录性注释,为 Wave 3b/3c 验证做准备)
// ═══════════════════════════════════════════════════════════════
//
// 按执行计划要求,本组不写成会失败的测试,改为记录现状,供 Wave 3b/3c 翻转后核对。
//
// 已知 domain purity leak(2026-06-25 实测,grep 锁定行号):
//
//   [leak-1] src/domain/DomainRegistry.js:10
//     `const campusDomain = require('../../presets/campus');`
//     构造器 `this.domain = domainConfig || campusDomain;`
//     → DomainRegistry 在无 config 时硬编码回退到 campus preset(非纯机制)。
//     Wave 3b 目标:移除此 require,默认域改由入口层(index.js)注入。
//
//   [leak-2] src/agent/schedule/Schedule.js:183  ✓ Wave 3c 已修复
//     `Schedule._campusSchedulesCache = require('../../../presets/campus/schedules');`
//     以及 4 个 deprecated 静态工厂 createStudent/Worker/Freelancer/HomeSchedule。
//     → Schedule 类耦合 campus schedules preset。
//     Wave 3c 目标:工厂迁出到 presets/campus/schedules.js,core 不再 require preset。
//     【已修复 2026-06-25】工厂已迁出 Schedule.js;工厂引用源改为本测试顶部 campusSchedules。
//
//   [leak-3] index.js:157 `else if (this.domain.id === 'campus')`
//     createCharacter 在 schedule 名未命中 roleArchetypes 时,仅 campus domain
//     fallback 到 Schedule.resolvePreset(旧 campus 工厂);自定义域使用空 schedule。
//     【Wave 3c】resolvePreset 不再处理字符串;campus 名解析改由 preset 模块 + 入口层处理(本组1/2 测试经 roleArchetypes,未受影响)。
//     → campus 专属 fallback 分支。Wave 3c 处理 schedule 迁出时一并收敛。
//
//   [leak-4] src/store/world/WorldStateAdapter.js:85-87、
//            src/store/world/compiler.js:31-32、src/store/world/migration.js:127
//     `domainRef !== 'campus'` 字面量特判(campus 免校验特权域)。
//     → Wave 3d 目标:泛化为基于注册表/config 的通用校验。
//
// 现状锁定(非断言,仅记录):上述 leak 当前均存在且被组1-3 的行为测试隐式覆盖。
// Wave 3b/3c/3d 完成后,应新增 grep 断言验证这些 require/特判已清零;
// 在那之前,这里不放置会失败的测试,避免 Wave 3a 红着交付。

