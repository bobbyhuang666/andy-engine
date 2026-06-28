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
        checkRange(threshold, 0, 1, `needs.threshold.${need}`, errors);
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
    if (r.decayRate !== undefined) {
      checkRange(r.decayRate, 0, 0.1, 'relationship.decayRate', errors);
    }
    if (r.maxStrongTies !== undefined) {
      checkRange(r.maxStrongTies, 1, 20, 'relationship.maxStrongTies', errors);
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
    if (im.maxActiveGoals !== undefined) {
      checkRange(im.maxActiveGoals, 1, 10, 'intrinsicMotivation.maxActiveGoals', errors);
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
        if (typeof value !== 'number' || value < 0 || value > 1) {
          errors.push(`personality.ocean.${trait} 必须是 0-1 之间的数字，当前值: ${value}`);
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

module.exports = { validateConfig, validateAgentConfig };
