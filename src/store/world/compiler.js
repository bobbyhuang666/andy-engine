/**
 * World Compiler — 创作期工具链
 *
 * 将 World Spec 编译为初始 World State。
 *
 * 设计原则：
 *   - 确定性数据转换器（结构映射确定性，worldId 使用临时随机种子生成）
 *   - 仅通过 AndyEngine 公共 API 实例化，不硬编码 runtimeSnapshot 内部结构
 *   - 输出符合 v0.1.0 Stable Envelope 的 World State
 */

const { validateWorldSpec, validateWorldState, CURRENT_SCHEMA_VERSION } = require('./validator');
const { toWorldState } = require('./WorldStateAdapter');

/**
 * 将 World Spec 编译为初始 World State
 *
 * @param {Object} spec - World Spec 对象
 * @param {Object} [domainConfig] - Domain Config 对象（可选，但非 campus 时必须传入）
 * @returns {{ state: Object|null, errors: Array<{path: string, message: string}> }}
 */
function compile(spec, domainConfig = null) {
  // Step 1: 校验 World Spec
  const specResult = validateWorldSpec(spec);
  if (!specResult.valid) {
    return { state: null, errors: specResult.errors };
  }

  // Step 2: domainRef 强一致性校验
  const errors = [];
  if (spec.domainRef !== 'campus' && !domainConfig) {
    errors.push({ path: 'domainRef', message: `非 campus domain "${spec.domainRef}" 必须传入 domainConfig` });
    return { state: null, errors };
  }
  if (domainConfig && domainConfig.id !== spec.domainRef) {
    errors.push({ path: 'domainRef', message: `domainConfig.id "${domainConfig.id}" 与 spec.domainRef "${spec.domainRef}" 不匹配` });
    return { state: null, errors };
  }

  // Step 3: 实例化空白引擎
  const AndyEngine = require('../../../index');
  const engineConfig = {
    startTime: spec.parameters && spec.parameters.startTime
      ? new Date(spec.parameters.startTime)
      : new Date(),
    weather: (spec.parameters && spec.parameters.weather) || 'sunny',
  };
  if (domainConfig) {
    engineConfig.domain = domainConfig;
  }

  const engine = new AndyEngine(engineConfig);

  // Step 4: 通过公共 API 创建角色
  if (Array.isArray(spec.characters)) {
    for (const charSpec of spec.characters) {
      const createConfig = {
        id: charSpec.id,
        name: charSpec.name,
      };

      // 适配 personality
      if (charSpec.personality) {
        if (charSpec.personality.mbti) {
          createConfig.mbti = charSpec.personality.mbti;
        } else if (charSpec.personality.ocean) {
          createConfig.personality = { ocean: charSpec.personality.ocean };
        }
      }

      // 适配 background 作为种子记忆
      if (Array.isArray(charSpec.background)) {
        createConfig.background = charSpec.background;
      }

      // 适配 schedule
      if (charSpec.schedule) {
        createConfig.schedule = charSpec.schedule;
      }

      // 适配 initialPosition
      if (charSpec.initialPosition) {
        createConfig.initialPosition = charSpec.initialPosition;
      }

      // 适配 initialState
      if (charSpec.initialState) {
        createConfig.initialState = charSpec.initialState;
      }

      engine.createCharacter(createConfig);
    }
  }

  // Step 5: 生成世界 ID（临时随机种子，非确定性）
  const worldId = spec.worldId || `world_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  // Step 6: 通过 Adapter 生成 World State
  const state = toWorldState(engine, worldId);

  // Step 7: 校验输出
  const stateResult = validateWorldState(state);
  if (!stateResult.valid) {
    return { state: null, errors: stateResult.errors };
  }

  return { state, errors: [] };
}

module.exports = {
  compile,
};
