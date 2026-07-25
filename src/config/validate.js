/**
 * 配置验证器
 *
 * 在引擎初始化时验证配置参数的合理性，防止运行时出现难以追踪的错误。
 * 验证范围：数值范围、类型、必要字段、参数间一致性。
 *
 * 使用方式：
 *   const { validateConfig } = require('./validate');
 *   validateConfig(config); // 抛出 Error 如果配置无效
 */

const { ANDY_DEFAULTS, EMOTION_DIMENSIONS } = require('./defaults');

/**
 * 验证配置参数
 * @param {Object} config - 用户传入的配置（将与 ANDY_DEFAULTS 合并）
 * @throws {Error} 如果配置无效
 */
function validateConfig(config) {
  if (!config || typeof config !== 'object') return;

  const errors = [];

  collectBooleanConfigErrors(config, errors);

  // ─── startTime 类型验证 ───
  if (config.startTime !== undefined) {
    const st = config.startTime;
    if (!(st instanceof Date) && typeof st !== 'number' && typeof st !== 'string') {
      errors.push(`startTime must be a Date, number, or ISO string, got ${typeof st}`);
    }
    if (typeof st === 'string' && isNaN(Date.parse(st))) {
      errors.push(`startTime string is not a valid date: "${st}"`);
    }
  }

  // ─── 情绪系统参数 ───
  if (config.emotion) {
    const e = config.emotion;
    if (e.decayLambda !== undefined) {
      checkRange(e.decayLambda, 0.01, 10, 'emotion.decayLambda', errors);
    }
    if (e.inertia !== undefined) {
      checkRange(e.inertia, 0, 1, 'emotion.inertia', errors);
    }
    if (e.maxDeltaPerTick !== undefined) {
      checkRange(e.maxDeltaPerTick, 0.001, 0.5, 'emotion.maxDeltaPerTick', errors);
    }
    if (e.noiseAmplitude !== undefined) {
      checkRange(e.noiseAmplitude, 0, 0.2, 'emotion.noiseAmplitude', errors);
    }
    if (e.coActivationWeight !== undefined) {
      checkRange(e.coActivationWeight, 0, 1, 'emotion.coActivationWeight', errors);
    }
    if (e.baselineDriftRate !== undefined) {
      checkRange(e.baselineDriftRate, 0, 0.01, 'emotion.baselineDriftRate', errors);
    }
    if (e.circadian) {
      if (e.circadian.positiveAffectPeak !== undefined) {
        checkRange(e.circadian.positiveAffectPeak, 0, 24, 'emotion.circadian.positiveAffectPeak', errors);
      }
      if (e.circadian.negativeAffectPeak !== undefined) {
        checkRange(e.circadian.negativeAffectPeak, 0, 24, 'emotion.circadian.negativeAffectPeak', errors);
      }
      if (e.circadian.positiveAffectAmp !== undefined) {
        checkRange(e.circadian.positiveAffectAmp, 0, 1, 'emotion.circadian.positiveAffectAmp', errors);
      }
      if (e.circadian.negativeAffectAmp !== undefined) {
        checkRange(e.circadian.negativeAffectAmp, 0, 1, 'emotion.circadian.negativeAffectAmp', errors);
      }
    }
  }

  // ─── 社交传染参数 ───
  if (config.contagion) {
    const c = config.contagion;
    if (c.baseSusceptibility !== undefined) {
      checkRange(c.baseSusceptibility, 0, 1, 'contagion.baseSusceptibility', errors);
    }
    if (c.baseExpressiveness !== undefined) {
      checkRange(c.baseExpressiveness, 0, 1, 'contagion.baseExpressiveness', errors);
    }
    if (c.interactionRadius !== undefined) {
      checkRange(c.interactionRadius, 0, 10, 'contagion.interactionRadius', errors);
    }
    if (c.negativityBias !== undefined) {
      checkRange(c.negativityBias, 0.5, 3, 'contagion.negativityBias', errors);
    }
    if (c.baseContagionRate !== undefined) {
      checkRange(c.baseContagionRate, 0, 1, 'contagion.baseContagionRate', errors);
    }
  }

  // ─── 记忆系统参数 ───
  if (config.memory) {
    const m = config.memory;
    if (m.maxMemories !== undefined) {
      checkRange(m.maxMemories, 10, 10000, 'memory.maxMemories', errors);
    }
    if (m.decayRate !== undefined) {
      checkRange(m.decayRate, 0, 5, 'memory.decayRate', errors);
    }
    if (m.retrievalThreshold !== undefined) {
      checkRange(m.retrievalThreshold, -5, 0, 'memory.retrievalThreshold', errors);
    }
    if (m.retrievalNoise !== undefined) {
      checkRange(m.retrievalNoise, 0, 2, 'memory.retrievalNoise', errors);
    }
    if (m.spreadingActivation) {
      if (m.spreadingActivation.W !== undefined) {
        checkRange(m.spreadingActivation.W, 0, 10, 'memory.spreadingActivation.W', errors);
      }
      if (m.spreadingActivation.S !== undefined) {
        checkRange(m.spreadingActivation.S, 0, 10, 'memory.spreadingActivation.S', errors);
      }
    }
    if (m.recallEmotionDelta) {
      for (const [key, value] of Object.entries(m.recallEmotionDelta)) {
        if (key === 'importanceScale' || key === 'ruminationMultiplier') {
          checkRange(value, 0, 10, `memory.recallEmotionDelta.${key}`, errors);
        } else if (value && typeof value === 'object' && !Array.isArray(value)) {
          for (const [dim, delta] of Object.entries(value)) {
            checkRange(delta, -1, 1, `memory.recallEmotionDelta.${key}.${dim}`, errors);
          }
        }
      }
    }
    if (m.maxPresentationsPerMemory !== undefined) {
      checkRange(m.maxPresentationsPerMemory, 1, 500, 'memory.maxPresentationsPerMemory', errors);
    }
    if (m.importanceBoostOnAccess !== undefined) {
      checkRange(m.importanceBoostOnAccess, 0, 1, 'memory.importanceBoostOnAccess', errors);
    }
    if (m.consolidationThreshold !== undefined) {
      checkRange(m.consolidationThreshold, 0, 1, 'memory.consolidationThreshold', errors);
    }
    if (m.pruneThreshold !== undefined) {
      checkRange(m.pruneThreshold, 0, 1, 'memory.pruneThreshold', errors);
    }
    if (m.moodCongruenceWeight !== undefined) {
      checkRange(m.moodCongruenceWeight, 0, 1, 'memory.moodCongruenceWeight', errors);
    }
    if (m.moodCongruenceScale !== undefined) {
      checkRange(m.moodCongruenceScale, 0, 2, 'memory.moodCongruenceScale', errors);
    }
  }

  // ─── 需求系统参数 ───
  if (config.needs) {
    const n = config.needs;
    if (n.decayRate) {
      for (const [need, rate] of Object.entries(n.decayRate)) {
        checkRange(rate, 0, 1, `needs.decayRate.${need}`, errors);
      }
    }
    if (n.threshold) {
      for (const [need, threshold] of Object.entries(n.threshold)) {
        checkRange(threshold, 0.001, 1, `needs.threshold.${need}`, errors);
      }
    }
    if (n.recoveryRate) {
      for (const [need, rate] of Object.entries(n.recoveryRate)) {
        checkRange(rate, 0, 1, `needs.recoveryRate.${need}`, errors);
      }
    }
  }

  // ─── 行为场参数 ───
  if (config.behavior) {
    const b = config.behavior;
    if (b.gamma !== undefined) {
      checkRange(b.gamma, 0, 20, 'behavior.gamma', errors);
    }
    if (b.sigma !== undefined) {
      checkRange(b.sigma, 0, 5, 'behavior.sigma', errors);
    }
    if (b.dt !== undefined) {
      checkRange(b.dt, 0.001, 1, 'behavior.dt', errors);
    }
    if (b.boundaryReflection !== undefined) {
      checkRange(b.boundaryReflection, 0, 1, 'behavior.boundaryReflection', errors);
    }
    if (b.boundaryStrength !== undefined) {
      checkRange(b.boundaryStrength, 0, 20, 'behavior.boundaryStrength', errors);
    }
    if (b.weights) {
      for (const [source, weight] of Object.entries(b.weights)) {
        checkRange(weight, 0, 20, `behavior.weights.${source}`, errors);
      }
    }
  }

  // ─── 社交关系参数 ───
  if (config.relationship) {
    const r = config.relationship;
    if (r.initialStrength !== undefined) {
      checkRange(r.initialStrength, 0, 1, 'relationship.initialStrength', errors);
    }
    if (r.strengthIncrement !== undefined) {
      checkRange(r.strengthIncrement, 0, 0.5, 'relationship.strengthIncrement', errors);
    }
    if (r.strengthDecrement !== undefined) {
      checkRange(r.strengthDecrement, 0, 0.5, 'relationship.strengthDecrement', errors);
    }
    if (r.decayRate !== undefined) {
      checkRange(r.decayRate, 0, 0.1, 'relationship.decayRate', errors);
    }
    if (r.maxStrongTies !== undefined) {
      checkRange(r.maxStrongTies, 1, 20, 'relationship.maxStrongTies', errors);
    }
    if (r.maxMediumTies !== undefined) {
      checkRange(r.maxMediumTies, 1, 150, 'relationship.maxMediumTies', errors);
    }
    if (r.threshold) {
      for (const [tier, threshold] of Object.entries(r.threshold)) {
        checkRange(threshold, 0, 1, `relationship.threshold.${tier}`, errors);
      }
    }
  }

  // ─── 自发动机参数 ───
  if (config.intrinsicMotivation) {
    const im = config.intrinsicMotivation;
    if (im.curiosityDecayRate !== undefined) {
      checkRange(im.curiosityDecayRate, 0, 0.5, 'intrinsicMotivation.curiosityDecayRate', errors);
    }
    if (im.curiosityThreshold !== undefined) {
      checkRange(im.curiosityThreshold, 0, 1, 'intrinsicMotivation.curiosityThreshold', errors);
    }
    if (im.needGateThreshold !== undefined) {
      checkRange(im.needGateThreshold, 0, 1, 'intrinsicMotivation.needGateThreshold', errors);
    }
    if (im.forgettingHours !== undefined) {
      checkRange(im.forgettingHours, 1, 10000, 'intrinsicMotivation.forgettingHours', errors);
    }
    if (im.goalGenerationInterval !== undefined) {
      checkRange(im.goalGenerationInterval, 1, 10000, 'intrinsicMotivation.goalGenerationInterval', errors);
    }
    if (im.maxActiveGoals !== undefined) {
      checkRange(im.maxActiveGoals, 1, 10, 'intrinsicMotivation.maxActiveGoals', errors);
    }
    if (im.goalDeadlineHours !== undefined) {
      checkRange(im.goalDeadlineHours, 1, 10000, 'intrinsicMotivation.goalDeadlineHours', errors);
    }
    if (im.curiositySatisfyOnNovelty !== undefined) {
      checkRange(im.curiositySatisfyOnNovelty, 0, 1, 'intrinsicMotivation.curiositySatisfyOnNovelty', errors);
    }
    if (im.domainRegionMap !== undefined) {
      if (!im.domainRegionMap || typeof im.domainRegionMap !== 'object' || Array.isArray(im.domainRegionMap)) {
        errors.push('intrinsicMotivation.domainRegionMap 必须是对象');
      } else {
        for (const [key, value] of Object.entries(im.domainRegionMap)) {
          if (typeof value !== 'string') {
            errors.push(`intrinsicMotivation.domainRegionMap.${key} 必须是字符串，当前值: ${value}`);
          }
        }
      }
    }
    if (im.explorationStates !== undefined) {
      if (!Array.isArray(im.explorationStates)) {
        errors.push('intrinsicMotivation.explorationStates 必须是数组');
      } else {
        for (const [index, value] of im.explorationStates.entries()) {
          if (typeof value !== 'string') {
            errors.push(`intrinsicMotivation.explorationStates.${index} 必须是字符串，当前值: ${value}`);
          }
        }
      }
    }
  }

  // ─── 心智游移参数 ───
  if (config.mindWander) {
    const mw = config.mindWander;
    if (mw.quietProbability !== undefined) {
      checkRange(mw.quietProbability, 0, 1, 'mindWander.quietProbability', errors);
    }
    if (mw.effects !== undefined) {
      if (!mw.effects || typeof mw.effects !== 'object' || Array.isArray(mw.effects)) {
        errors.push('mindWander.effects 必须是对象');
      } else {
        for (const [thoughtType, deltas] of Object.entries(mw.effects)) {
          if (!deltas || typeof deltas !== 'object' || Array.isArray(deltas)) {
            errors.push(`mindWander.effects.${thoughtType} 必须是对象`);
            continue;
          }
          for (const [dim, delta] of Object.entries(deltas)) {
            checkRange(delta, -1, 1, `mindWander.effects.${thoughtType}.${dim}`, errors);
          }
        }
      }
    }
  }

  // ─── 事件系统参数 ───
  if (config.events) {
    const ev = config.events;
    if (ev.maxEventLogSize !== undefined) {
      checkRange(ev.maxEventLogSize, 1, 100000, 'events.maxEventLogSize', errors);
    }
    if (ev.randomEventProbability !== undefined) {
      checkRange(ev.randomEventProbability, 0, 1, 'events.randomEventProbability', errors);
    }
    if (ev.causalChainMaxLength !== undefined) {
      checkRange(ev.causalChainMaxLength, 1, 50, 'events.causalChainMaxLength', errors);
    }
    if (ev.eventLifespan !== undefined) {
      checkRange(ev.eventLifespan, 1, 525600, 'events.eventLifespan', errors);
    }
  }

  // ─── 天气系统参数 ───
  if (config.weatherConfig) {
    const wc = config.weatherConfig;
    if (wc.transitionProb !== undefined) {
      checkRange(wc.transitionProb, 0, 1, 'weatherConfig.transitionProb', errors);
    }
    if (wc.seasonProbabilities) {
      for (const [season, probs] of Object.entries(wc.seasonProbabilities)) {
        if (!probs || typeof probs !== 'object' || Array.isArray(probs)) {
          errors.push(`weatherConfig.seasonProbabilities.${season} 必须是对象`);
          continue;
        }
        for (const [weather, probability] of Object.entries(probs)) {
          checkRange(probability, 0, 1, `weatherConfig.seasonProbabilities.${season}.${weather}`, errors);
        }
        const sum = Object.values(probs).reduce((a, b) => a + b, 0);
        if (!Number.isFinite(sum) || sum <= 0) {
          errors.push(`weatherConfig.seasonProbabilities.${season}: probabilities must sum to a positive number, got ${sum}`);
        }
      }
    }
  }

  // ─── 连续坐标空间参数 ───
  if (config.spatial !== undefined) {
    const sp = config.spatial;
    if (sp === 'continuous') {
      // 合法：字符串字面量 'continuous'
    } else if (sp && typeof sp === 'object' && !Array.isArray(sp)) {
      // R145-5: 支持对象形状 { mode: 'continuous', worldWidth: 800, ... }
      if (sp.mode !== 'continuous') {
        errors.push(`spatial.mode must be 'continuous', got '${sp.mode}'`);
      }
      if (sp.worldWidth !== undefined) {
        checkRange(sp.worldWidth, 100, 10000, 'spatial.worldWidth', errors);
      }
      if (sp.worldHeight !== undefined) {
        checkRange(sp.worldHeight, 100, 10000, 'spatial.worldHeight', errors);
      }
      if (sp.cellSize !== undefined) {
        checkRange(sp.cellSize, 1, 100, 'spatial.cellSize', errors);
      }
      if (sp.interactionRadius !== undefined) {
        checkRange(sp.interactionRadius, 1, 500, 'spatial.interactionRadius', errors);
      }
    } else {
      errors.push(`spatial must be 'continuous' or { mode: 'continuous', ... }, got ${typeof sp}`);
    }
  }

  // ─── 参数间一致性检查 ───
  if (config.needs && config.needs.threshold && config.needs.recoveryRate) {
    for (const need of Object.keys(config.needs.threshold)) {
      const threshold = config.needs.threshold[need];
      const recovery = config.needs.recoveryRate[need];
      if (threshold !== undefined && recovery !== undefined && recovery < threshold * 0.1) {
        errors.push(`needs: ${need} recovery rate (${recovery}) is very low compared to threshold (${threshold}), agent may never recover this need`);
      }
    }
  }

  if (errors.length > 0) {
    throw new Error(`Andy Engine 配置验证失败:\n${errors.map(e => `  - ${e}`).join('\n')}`);
  }
}

/**
 * 验证 Agent 配置
 * @param {Object} agentConfig - Agent 配置
 * @throws {Error} 如果配置无效
 */
function validateAgentConfig(agentConfig) {
  const errors = [];

  if (!agentConfig.id || typeof agentConfig.id !== 'string') {
    errors.push('Agent 必须有字符串类型的 id');
  }

  if (!agentConfig.name || typeof agentConfig.name !== 'string') {
    errors.push('Agent 必须有字符串类型的 name');
  }

  if (agentConfig.personality) {
    const p = agentConfig.personality;
    if (p.mbti && typeof p.mbti === 'string') {
      const validMBTI = [
        'INTJ', 'INTP', 'ENTJ', 'ENTP',
        'INFJ', 'INFP', 'ENFJ', 'ENFP',
        'ISTJ', 'ISFJ', 'ESTJ', 'ESFJ',
        'ISTP', 'ISFP', 'ESTP', 'ESFP',
      ];
      if (!validMBTI.includes(p.mbti.toUpperCase())) {
        errors.push(`无效的 MBTI 类型: ${p.mbti}，有效值: ${validMBTI.join(', ')}`);
      }
    }
    if (p.ocean) {
      for (const [trait, value] of Object.entries(p.ocean)) {
        // R111-NAN-2: typeof NaN === 'number' is true, and NaN < 0 / NaN > 1 are both false,
        // so NaN would bypass the original range check. Number.isFinite catches NaN/Infinity.
        if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 1) {
          errors.push(`personality.ocean.${trait} 必须是 0-1 之间的有限数字，当前值: ${value}`);
        }
      }
    }
  }

  if (errors.length > 0) {
    throw new Error(`Agent 配置验证失败:\n${errors.map(e => `  - ${e}`).join('\n')}`);
  }
}

// ─── 辅助函数 ───

function checkRange(value, min, max, path, errors) {
  if (typeof value !== 'number' || isNaN(value)) {
    errors.push(`${path} 必须是数字，当前值: ${value}`);
  } else if (value < min || value > max) {
    errors.push(`${path} 必须在 ${min}-${max} 之间，当前值: ${value}`);
  }
}

function collectBooleanConfigErrors(config, errors) {
  checkBoolean(config.enableFacts, 'enableFacts', errors);
  checkBoolean(config.atomicTicks, 'atomicTicks', errors);

  const actionSelection = config.actionSelection;
  if (!actionSelection || typeof actionSelection !== 'object' || Array.isArray(actionSelection)) {
    return;
  }

  checkBoolean(actionSelection.enabled, 'actionSelection.enabled', errors);
  checkBoolean(actionSelection.recordTraces, 'actionSelection.recordTraces', errors);
}

function checkBoolean(value, path, errors) {
  if (value !== undefined && typeof value !== 'boolean') {
    errors.push(`${path} must be a boolean, got ${value === null ? 'null' : typeof value}`);
  }
}

module.exports = { validateConfig, validateAgentConfig, collectBooleanConfigErrors };
