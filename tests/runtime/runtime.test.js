/**
 * Phase 9: Runtime Orchestration Split 测试套件
 *
 * 测试：
 *   - WorldClock
 *   - RuntimeConfig
 *   - RuntimeContext
 *   - AndyWorld.step()
 *   - 向后兼容性（core/World.js + core/Simulator.js）
 */

import { describe, it, expect, beforeEach } from 'vitest';
import WorldClock from '../../src/runtime/WorldClock.js';
import RuntimeConfig from '../../src/runtime/RuntimeConfig.js';
import RuntimeContext from '../../src/runtime/RuntimeContext.js';
import AndyWorld from '../../src/runtime/AndyWorld.js';
import { ANDY_DEFAULTS } from '../../src/config/defaults.js';
import { getDefaultDomain } from '../../src/domain/DomainRegistry.js';

const campusDomain = getDefaultDomain();

// ─── WorldClock ───

describe('WorldClock', () => {
  it('默认使用当前时间', () => {
    const clock = new WorldClock();
    expect(clock.time).toBeInstanceOf(Date);
    expect(clock.tickCount).toBe(0);
  });

  it('接受自定义 startTime', () => {
    const start = new Date('2024-06-15T10:00:00');
    const clock = new WorldClock(start);
    expect(clock.time.toISOString()).toBe(start.toISOString());
  });

  it('advance() 推进指定分钟数并递增 tickCount', () => {
    const clock = new WorldClock(new Date('2024-06-15T10:00:00Z'));
    const result = clock.advance(5);
    expect(result.getMinutes()).toBe(5);
    expect(clock.tickCount).toBe(1);
    clock.advance(10);
    expect(clock.time.getMinutes()).toBe(15);
    expect(clock.tickCount).toBe(2);
  });

  it('advance() 默认推进 5 分钟', () => {
    const clock = new WorldClock(new Date('2024-06-15T10:00:00Z'));
    clock.advance();
    expect(clock.time.getMinutes()).toBe(5);
  });

  it('hour getter 返回当前小时', () => {
    const clock = new WorldClock(new Date('2024-06-15T14:30:00Z'));
    expect(clock.hour).toBe(14);
  });

  it('dayOfWeek getter 返回星期几', () => {
    // 2024-06-15 是星期六 (6)
    const clock = new WorldClock(new Date('2024-06-15T10:00:00Z'));
    expect(clock.dayOfWeek).toBe(6);
  });

  it('toISOString() 返回 ISO 字符串', () => {
    const start = new Date('2024-06-15T10:00:00Z');
    const clock = new WorldClock(start);
    expect(clock.toISOString()).toBe(start.toISOString());
  });

  it('toJSON/fromJSON 往返序列化', () => {
    const clock = new WorldClock(new Date('2024-06-15T10:00:00Z'));
    clock.advance(5);
    clock.advance(5);
    const json = clock.toJSON();
    const restored = WorldClock.fromJSON(json);
    expect(restored.time.toISOString()).toBe(clock.time.toISOString());
    expect(restored.tickCount).toBe(2);
  });

  it('fromJSON repairs invalid tickCount values', () => {
    for (const tickCount of [Infinity, -1, 1.5, '7']) {
      const restored = WorldClock.fromJSON({ time: '2024-06-15T10:00:00Z', tickCount });
      expect(restored.tickCount).toBe(0);
    }
  });
});

// ─── RuntimeConfig ───

describe('RuntimeConfig', () => {
  it('使用默认值', () => {
    const config = new RuntimeConfig();
    expect(config.tickMinutes).toBe(ANDY_DEFAULTS.tick.intervalMinutes);
    expect(config.enableFacts).toBe(false);
    expect(config.weather).toBe('sunny');
  });

  it('允许覆盖 tickMinutes', () => {
    const config = new RuntimeConfig({ tickMinutes: 10 });
    expect(config.tickMinutes).toBe(10);
  });

  it('允许启用 facts', () => {
    const config = new RuntimeConfig({ enableFacts: true });
    expect(config.enableFacts).toBe(true);
  });

  it('合并 actionSelection 配置', () => {
    const config = new RuntimeConfig({
      actionSelection: { enabled: true, temperature: 0.8 },
    });
    expect(config.actionSelection.enabled).toBe(true);
    expect(config.actionSelection.temperature).toBe(0.8);
  });

  it('保留 _defaults 引用', () => {
    const config = new RuntimeConfig();
    expect(config._defaults.tick.intervalMinutes).toBe(ANDY_DEFAULTS.tick.intervalMinutes);
  });
});

// ─── RuntimeContext ───

describe('RuntimeContext', () => {
  let world;

  beforeEach(() => {
    world = new AndyWorld({ startTime: new Date('2024-06-15T10:00:00Z') }, null, campusDomain);
  });

  it('聚合 world/clock/config/domain/rng', () => {
    const context = new RuntimeContext({
      world,
      clock: world.clock,
      config: world.runtimeConfig,
      domain: world.domain,
      rng: world.rng,
    });
    expect(context.world).toBe(world);
    expect(context.clock).toBe(world.clock);
    expect(context.config).toBe(world.runtimeConfig);
    expect(context.domain).toBe(world.domain);
    // world 恒持 RNG（unseeded 自动种子），context.rng 即 world.rng
    expect(context.rng).toBe(world.rng);
  });

  it('simTime 代理 clock.time', () => {
    const context = new RuntimeContext({
      world,
      clock: world.clock,
      config: world.runtimeConfig,
      domain: world.domain,
      rng: null,
    });
    expect(context.simTime).toBe(world.clock.time);
  });

  it('agents 代理 world.getAllAgents()', () => {
    const context = new RuntimeContext({
      world,
      clock: world.clock,
      config: world.runtimeConfig,
      domain: world.domain,
      rng: null,
    });
    expect(context.agents).toEqual([]);
  });

  it('buildAgentEnv() 构建正确的环境参数', () => {
    const context = new RuntimeContext({
      world,
      clock: world.clock,
      config: world.runtimeConfig,
      domain: world.domain,
      rng: null,
    });
    const env = context.buildAgentEnv(5);
    expect(env.hour).toBe(10);
    expect(env.dayOfWeek).toBe(6);
    expect(env.weather).toBe('sunny');
    expect(env.minutesElapsed).toBe(5);
    expect(env.simTime).toBeInstanceOf(Date);
    expect(env._world).toBeUndefined();
    expect(env.effectCommitter).toBe(world.effectCommitter);
    expect(env.effectWorld).toBe(world);
  });
});

// ─── AndyWorld (runtime) ───

describe('AndyWorld (runtime)', () => {
  describe('构造函数', () => {
    it('初始化时钟', () => {
      const world = new AndyWorld({ startTime: new Date('2024-06-15T10:00:00Z') }, null, campusDomain);
      expect(world.clock.advance).toBeDefined();
      expect(world.clock.time.getUTCHours()).toBe(10);
      expect(world.clock.tickCount).toBe(0);
    });

    it('初始化环境', () => {
      const world = new AndyWorld({
        startTime: new Date('2024-06-15T10:00:00Z'),
        weather: 'rain',
      }, null, campusDomain);
      expect(world.environment.weather).toBe('rain');
      expect(world.environment.timeOfDay).toBe('morning');
    });

    it('初始化空 Agent 集合', () => {
      const world = new AndyWorld({}, null, campusDomain);
      expect(world.agents.size).toBe(0);
    });

    it('初始化社交图谱和事件分发器', () => {
      const world = new AndyWorld({}, null, campusDomain);
      expect(world.socialGraph).toBeDefined();
      expect(world.eventDispatcher).toBeDefined();
    });

    it('time/tickCount 兼容性属性代理到 clock', () => {
      const world = new AndyWorld({ startTime: new Date('2024-06-15T10:00:00') }, null, campusDomain);
      expect(world.time).toBe(world.clock.time);
      expect(world.tickCount).toBe(0);
      world.time = new Date('2024-06-15T12:00:00');
      expect(world.clock.time.getHours()).toBe(12);
    });
  });

  describe('step()', () => {
    let world;

    beforeEach(() => {
      world = new AndyWorld({
        startTime: new Date('2024-06-15T10:00:00Z'),
        seed: 42,
      }, null, campusDomain);
    });

    it('推进时钟', () => {
      world.step();
      expect(world.clock.tickCount).toBe(1);
      expect(world.clock.time.getMinutes()).toBe(5);
    });

    it('返回结果包含提交后的 time、startedAt 和 phase', () => {
      const startedAt = world.clock.toISOString();
      const result = world.step();
      expect(result.time).toBeDefined();
      expect(result.startedAt).toBe(startedAt);
      expect(result.committedAt).toBe(world.clock.toISOString());
      expect(result.time).toBe(result.committedAt);
      expect(result.time).toBe(world.clock.toISOString());
      expect(result.status).toBe('committed');
      expect(result.phase).toBeDefined();
      expect(result.phase.timeAdvance).toBeDefined();
      expect(result.phase.environmentSync).toBeDefined();
      expect(result.phase.agentThink).toBeDefined();
      expect(result.phase.interaction).toBeDefined();
      expect(result.phase.eventDispatch).toBeDefined();
    });

    it('多个 tick 累积时间', () => {
      world.step();
      world.step();
      world.step();
      expect(world.clock.tickCount).toBe(3);
      expect(world.clock.time.getMinutes()).toBe(15);
    });

    it('更新环境 timeOfDay', () => {
      // 10:00 是 morning
      expect(world.environment.timeOfDay).toBe('morning');
      // 推进到 14:00
      world = new AndyWorld({
        startTime: new Date('2024-06-15T13:55:00Z'),
      }, null, campusDomain);
      world.step(); // 14:00
      expect(world.environment.timeOfDay).toBe('afternoon');
    });

    it('durationMs 性能统计', () => {
      const result = world.step();
      expect(result.durationMs).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Agent 管理', () => {
    it('addAgent 注册 Agent', () => {
      const world = new AndyWorld({}, null, campusDomain);
      const mockAgent = {
        id: 'test',
        position: '校园广场',
        setSocialGraph: null,
      };
      world.addAgent(mockAgent);
      expect(world.agents.size).toBe(1);
      expect(world.getAgent('test')).toBe(mockAgent);
    });

    it('getAllAgents 返回所有 Agent', () => {
      const world = new AndyWorld({}, null, campusDomain);
      world.addAgent({ id: 'a', position: 'p1', setSocialGraph: null });
      world.addAgent({ id: 'b', position: 'p2', setSocialGraph: null });
      expect(world.getAllAgents().length).toBe(2);
    });
  });

  describe('事件调度', () => {
    it('scheduleEvent 添加延迟事件', () => {
      const world = new AndyWorld({ startTime: new Date('2024-06-15T10:00:00') }, null, campusDomain);
      world.scheduleEvent({ type: 'test_event' }, 60000);
      expect(world._scheduledEvents.length).toBe(1);
    });
  });

  describe('回调', () => {
    it('onTick 注册回调，在 step() 中执行', () => {
      const world = new AndyWorld({ startTime: new Date('2024-06-15T10:00:00') }, null, campusDomain);
      let called = false;
      world.onTick(() => { called = true; });
      world.step();
      expect(called).toBe(true);
    });
  });

  describe('getStats()', () => {
    it('返回统计信息', () => {
      const world = new AndyWorld({ startTime: new Date('2024-06-15T10:00:00') }, null, campusDomain);
      world.step();
      const stats = world.getStats();
      expect(stats.tickCount).toBe(1);
      expect(stats.agentCount).toBe(0);
      expect(stats.eventCount).toBeGreaterThanOrEqual(0);
      expect(stats.lastTickMs).toBeGreaterThanOrEqual(0);
    });
  });

  describe('快照 & 序列化', () => {
    it('snapshot() 返回世界快照', () => {
      const world = new AndyWorld({ startTime: new Date('2024-06-15T10:00:00') }, null, campusDomain);
      const snap = world.snapshot();
      expect(snap.time).toBeDefined();
      expect(snap.tickCount).toBe(0);
      expect(snap.environment).toBeDefined();
      expect(snap.agents).toBeDefined();
    });

    it('toJSON() 包含 time/tickCount/environment', () => {
      const world = new AndyWorld({ startTime: new Date('2024-06-15T10:00:00') }, null, campusDomain);
      const json = world.toJSON();
      expect(json.time).toBeDefined();
      expect(json.tickCount).toBe(0);
      expect(json.environment.weather).toBe('sunny');
    });
  });
});

// ─── 向后兼容性 ───

describe('向后兼容性', () => {
  it('AndyWorld 导出正常', async () => {
    const CoreAndyWorld = await import('../../src/runtime/AndyWorld.js');
    expect(CoreAndyWorld.default).toBeDefined();
    // 应该是同一个类
    const world = new CoreAndyWorld.default({ startTime: new Date('2024-06-15T10:00:00') }, null, campusDomain);
    expect(world.clock).toBeDefined();
    expect(world.step).toBeDefined();
  });

  it('AndyWorld.step() returns tick result', async () => {
    const CoreAndyWorld = (await import('../../src/runtime/AndyWorld.js')).default;
    const world = new CoreAndyWorld({
      startTime: new Date('2024-06-15T10:00:00'),
      seed: 42,
    }, null, campusDomain);
    const result = world.step();
    expect(result.tickNumber).toBe(1);
    expect(world.clock.tickCount).toBe(1);
  });

  it('AndyWorld.getStats() returns stats', async () => {
    const CoreAndyWorld = (await import('../../src/runtime/AndyWorld.js')).default;
    const world = new CoreAndyWorld({ startTime: new Date('2024-06-15T10:00:00') }, null, campusDomain);
    world.step();
    const stats = world.getStats();
    expect(stats.tickCount).toBe(1);
  });

  it('AndyWorld.scheduleEvent works', async () => {
    const CoreAndyWorld = (await import('../../src/runtime/AndyWorld.js')).default;
    const world = new CoreAndyWorld({ startTime: new Date('2024-06-15T10:00:00') }, null, campusDomain);
    world.scheduleEvent({ type: 'test' }, 60000);
    expect(world._scheduledEvents.length).toBe(1);
  });

  it('AndyWorld.onTick works', async () => {
    const CoreAndyWorld = (await import('../../src/runtime/AndyWorld.js')).default;
    const world = new CoreAndyWorld({ startTime: new Date('2024-06-15T10:00:00') }, null, campusDomain);
    let called = false;
    world.onTick(() => { called = true; });
    world.step();
    expect(called).toBe(true);
  });

  it('AndyEngine 入口仍然工作', async () => {
    const AndyEngine = (await import('../../index.js')).default;
    const engine = new AndyEngine({
      startTime: new Date('2024-06-15T10:00:00'),
      seed: 42,
    });
    expect(engine.world).toBeDefined();
    expect(engine.world.clock).toBeDefined();
    expect(engine.world.step).toBeDefined();
    // tick 直接委托给 world.step()
    const result = engine.tick();
    expect(result.tickNumber).toBe(1);
  });

  it('AndyEngine 多 tick 累积', async () => {
    const AndyEngine = (await import('../../index.js')).default;
    const engine = new AndyEngine({
      startTime: new Date('2024-06-15T10:00:00'),
      seed: 42,
    });
    engine.tick();
    engine.tick();
    engine.tick();
    expect(engine.world.tickCount).toBe(3);
    expect(engine.world.time.getMinutes()).toBe(15);
  });
});
