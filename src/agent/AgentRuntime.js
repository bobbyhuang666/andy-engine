/**
 * AgentRuntime - Agent 内部运行时协调器
 *
 * Phase 8: 将 Agent.tick() 的 16 步管线分解为可测试的 handler 模块。
 * AgentRuntime 是 Agent 的内部实现细节，不改变公共 API。
 *
 * Tick 顺序（完全保持原样）：
 *   1.  感知事件 + futureTendency 衰减
 *   2.  情绪调节（Gross 过程模型）
 *   3.  需求演化
 *   4.  自发动机演化 + 情绪效果
 *   5.  日程检查 + 位置决策
 *   6.  构建行为信号
 *   7.  行为场动力学（朗之万）
 *   8.  需求→情绪耦合
 *   9.  健康系统更新
 *   10. 情绪演化
 *   11. 情绪调节资源恢复
 *   12. 记忆衰减
 *   13. 社交能量更新
 *   14. 程序性记忆
 *   15. 定期反思 + 人格漂移
 *   16. 心智游移
 *   17. Shadow Action Selection
 */

const PerceptionHandler = require('./handlers/PerceptionHandler');
const ScheduleHandler = require('./handlers/ScheduleHandler');
const NeedsEmotionCoupler = require('./handlers/NeedsEmotionCoupler');
const HealthHandler = require('./handlers/HealthHandler');
const SocialHandler = require('./handlers/SocialHandler');
const MindWanderHandler = require('./handlers/MindWanderHandler');
const ReflectionHandler = require('./handlers/ReflectionHandler');
const ActionSelectionHandler = require('./handlers/ActionSelectionHandler');

class AgentRuntime {
  /**
   * @param {import('../../agent/Agent')} agent - Agent 实例引用
   */
  constructor(agent) {
    this.agent = agent;
    this.handlers = {
      perception: new PerceptionHandler(agent),
      schedule: new ScheduleHandler(agent),
      needsEmotion: new NeedsEmotionCoupler(agent),
      health: new HealthHandler(agent),
      social: new SocialHandler(agent),
      mindWander: new MindWanderHandler(agent),
      reflection: new ReflectionHandler(agent),
      actionSelection: new ActionSelectionHandler(agent),
    };
  }

  /**
   * 执行完整的 tick 管线
   *
   * 完全复制 Agent.tick() 的 16 步顺序，使用 handler 分解。
   * 每个 handler 都是对 Agent 原始方法的委托调用，不改变任何语义。
   *
   * @param {Object} env - 环境状态
   * @param {Object[]} perceivedEvents - 可感知事件
   * @param {Object|null} contagionInputs - 社交传染输入
   * @returns {Object} Agent 动作结果
   */
  tick(env, perceivedEvents = [], contagionInputs = null) {
    const agent = this.agent;
    const result = {
      stateChanged: false,
      regionChanged: false,
      newEvents: [],
      emotionSnapshot: null,
    };

    if (!agent.isOnline) return result;

    // R8 fix: throw on null env instead of silently returning empty result.
    // A null env means the tick context is broken — silently skipping would
    // freeze the agent (no needs decay, no emotion update, no memory evolution)
    // with no indication of the error.
    if (!env || typeof env !== 'object') {
      throw new Error(`AgentRuntime.tick(): agent "${agent.id}" received invalid env (null or non-object). This indicates a bug in the tick context builder.`);
    }

    // R33 P0 fix: validate minutesElapsed is a finite number.
    // Previous guard (env.minutesElapsed || 5) handled 0/NaN/null but NOT
    // truthy non-numbers (strings, objects). NaN from "5"/60 silently
    // poisons all downstream consumers (needs, emotion, memory, etc.).
    const rawMinutes = env.minutesElapsed;
    const minutesElapsed = typeof rawMinutes === 'number' && Number.isFinite(rawMinutes) && rawMinutes >= 0
      ? rawMinutes : 5;
    // Finite guard on hoursElapsed: prevents NaN cascade from corrupted env data.
    // hoursElapsed = 0 means no time passes, the safe default.
    const rawHours = minutesElapsed / 60;
    const hoursElapsed = (Number.isFinite(rawHours) && rawHours > 0) ? rawHours : 0;

    // 注入模拟时间
    if (env.simTime) {
      agent.memory.setSimTime(env.simTime);
      agent.proceduralMemory.setSimTime(env.simTime);
    }

    const safeEvents = Array.isArray(perceivedEvents) ? perceivedEvents : [];

    // 构建共享 context 对象（传递给所有 handler）
    const context = {
      env,
      hoursElapsed,
      safeEvents,
      result,
      needsDrive: null,
      imResult: null,
    };

    // ─── 1. 感知事件 + futureTendency 衰减 ───
    this.handlers.perception.tick(context);

    // ─── 2. 情绪调节（Gross 过程模型）───
    const regulationResult = agent.emotionRegulation.tryRegulate(agent, safeEvents, env);
    if (regulationResult) {
      result.newEvents.push({
        type: 'regulation',
        strategy: regulationResult.strategy,
        time: env.simTime?.toISOString(),
      });
    }

    // ─── 3. 需求演化 ───
    agent.needs.tickWithBehavior(hoursElapsed, agent.behaviorField.B);

    // ─── 4. 自发动机演化 + 情绪效果 ───
    const imResult = agent.intrinsicMotivation.tick({
      position: agent.position,
      state: agent.stateMachine.currentState,
      hour: env.hour,
      hoursElapsed,
      simTime: env.simTime,
      needsState: agent.needs.needs,
    });
    context.imResult = imResult;

    if (imResult.emotionEffects) {
      const committer = env?.effectCommitter || null;
      if (committer && typeof committer.commit === 'function') {
        committer.commit({
          deltas: [{
            type: 'emotion',
            target: 'agent',
            agentId: agent.id,
            changes: imResult.emotionEffects,
            multiplier: 1,
            appraisalModifiers: null,
            stress: null,
          }],
        });
      } else {
        agent.emotion.applyEffect(imResult.emotionEffects);
      }
    }

    // ─── 5. 日程检查 + 位置决策 ───
    context.needsDrive = agent.needs.getDrive();
    this.handlers.schedule.tick(context);

    // ─── 6-7. 行为信号构建 + 行为场动力学 ───
    const prevLabel = agent.behaviorField.label;
    agent.behaviorField.setCurrentRegion(agent.position);
    const behaviorSignals = agent.buildBehaviorSignals(env);
    const behaviorResult = agent.behaviorField.tick(behaviorSignals);
    result.behaviorField = behaviorResult;

    // 标签变化 → 状态转移事件
    if (behaviorResult.label !== prevLabel) {
      result.stateChanged = true;
      result.newEvents.push({
        type: 'state_change',
        from: prevLabel,
        to: behaviorResult.label,
        time: env.simTime?.toISOString(),
      });
      agent.stateMachine.stateEnteredAt = env.simTime || new Date(0); // deterministic sentinel
      agent.stateMachine.history.push({
        from: prevLabel,
        to: behaviorResult.label,
        at: (env.simTime || new Date(0)).toISOString(),
      });
      if (agent.stateMachine.history.length > 20) {
        agent.stateMachine.history = agent.stateMachine.history.slice(-20);
      }
    }

    // ─── 8. 需求→情绪耦合 ───
    this.handlers.needsEmotion.tick();

    // ─── 9. 健康系统更新 ───
    this.handlers.health.tick(context);

    // ─── 10. 情绪演化 ───
    // R34 P2 fix: validate env.hour. If NaN/undefined, _circadianModulation
    // computes NaN which propagates through emotion tick. _clamp() repairs at
    // end of tick, but one tick of garbage computations is still wasteful.
    const hourOfDay = typeof env.hour === 'number' && Number.isFinite(env.hour) ? env.hour : 12;
    agent.emotion.tick(hoursElapsed, hourOfDay, contagionInputs);

    // ─── 11. 情绪调节资源恢复 ───
    agent.emotionRegulation.tick(hoursElapsed, agent.stateMachine.currentState, agent.domain);

    // ─── 12. 记忆衰减 ───
    agent.memory.tick(hoursElapsed);

    // ─── 13. 社交能量更新 ───
    this.handlers.social.tick(context);

    // ─── 14. 程序性记忆 ───
    agent.proceduralMemory.recordAction({
      hour: hourOfDay,
      dayOfWeek: env.dayOfWeek,
      position: agent.position,
      state: agent.stateMachine.currentState,
      valence: agent.emotion.getValence(),
      region: agent.position,
    });
    agent.proceduralMemory.tick(hoursElapsed);

    // 意外事件打破习惯
    if (safeEvents.length > 0) {
      for (const event of safeEvents) {
        if (event.type === 'random' || event.type === 'causal') {
          agent.proceduralMemory.disrupt(0.3);
          break;
        }
      }
    }

    // ─── 15. 定期反思 + 人格漂移 ───
    this.handlers.reflection.tick(context);

    // ─── 16. 心智游移 ───
    this.handlers.mindWander.tick(context);

    // ─── 17. Shadow Action Selection ───
    this.handlers.actionSelection.tick(context);

    // ─── 情绪快照 ───
    result.emotionSnapshot = {
      valence: agent.emotion.getValence(),
      arousal: agent.emotion.getArousal(),
      dominant: agent.emotion.getDominant(3),
      promptString: agent.emotion.toPromptString(),
    };

    return result;
  }
}

module.exports = AgentRuntime;
