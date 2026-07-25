/**
 * validateWorldSpec / validateWorldState — Stable World Envelope 校验器
 *
 * 只校验 Stable World Envelope（公共 Schema），不校验 runtimeSnapshot 内部细节。
 *
 * 设计原则：
 *   - 公共契约最小化：只校验跨版本稳定的字段
 *   - 运行时状态不透明：runtimeSnapshot 只做 typeof 校验
 *   - 确定性校验：不依赖 LLM 或外部服务
 *   - 强版本校验：schemaVersion 必须精确匹配当前版本
 */

const CURRENT_SCHEMA_VERSION = '0.1.0';

/**
 * 校验 World Spec（用户世界蓝图）
 *
 * @param {Object} spec - World Spec 对象
 * @returns {{ valid: boolean, errors: Array<{path: string, message: string}> }}
 */
function validateWorldSpec(spec) {
  const errors = [];

  if (!spec || typeof spec !== 'object') {
    return { valid: false, errors: [{ path: '', message: 'spec 必须是一个对象' }] };
  }

  // schemaVersion — 强校验：必须精确匹配当前版本
  if (typeof spec.schemaVersion !== 'string' || spec.schemaVersion.length === 0) {
    errors.push({ path: 'schemaVersion', message: '必须是非空字符串' });
  } else if (spec.schemaVersion !== CURRENT_SCHEMA_VERSION) {
    errors.push({ path: 'schemaVersion', message: `版本不匹配：期望 "${CURRENT_SCHEMA_VERSION}"，实际 "${spec.schemaVersion}"` });
  }

  // domainRef
  if (typeof spec.domainRef !== 'string' || spec.domainRef.length === 0) {
    errors.push({ path: 'domainRef', message: '必须是非空字符串' });
  }

  // worldName
  if (typeof spec.worldName !== 'string' || spec.worldName.length === 0) {
    errors.push({ path: 'worldName', message: '必须是非空字符串' });
  }

  // characters
  if (!Array.isArray(spec.characters) || spec.characters.length === 0) {
    errors.push({ path: 'characters', message: '必须是非空数组' });
  } else {
    const seenIds = new Set();
    for (let i = 0; i < spec.characters.length; i++) {
      const char = spec.characters[i];
      const prefix = `characters[${i}]`;

      if (!char || typeof char !== 'object') {
        errors.push({ path: prefix, message: '必须是对象' });
        continue;
      }

      // id
      if (typeof char.id !== 'string' || char.id.length === 0) {
        errors.push({ path: `${prefix}.id`, message: '必须是非空字符串' });
      } else if (seenIds.has(char.id)) {
        errors.push({ path: `${prefix}.id`, message: `id "${char.id}" 重复` });
      } else {
        seenIds.add(char.id);
      }

      // name
      if (typeof char.name !== 'string' || char.name.length === 0) {
        errors.push({ path: `${prefix}.name`, message: '必须是非空字符串' });
      }
    }
  }

  return { valid: errors.length === 0, errors };
}

/**
 * 校验 World State（运行后状态）
 *
 * 只校验 Stable World Envelope（公共 Schema），不校验 runtimeSnapshot 内部细节。
 *
 * @param {Object} state - World State 对象
 * @returns {{ valid: boolean, errors: Array<{path: string, message: string}> }}
 */
function validateWorldState(state) {
  const errors = [];

  if (!state || typeof state !== 'object') {
    return { valid: false, errors: [{ path: '', message: 'state 必须是一个对象' }] };
  }

  // schemaVersion — 强校验：必须精确匹配当前版本
  if (typeof state.schemaVersion !== 'string' || state.schemaVersion.length === 0) {
    errors.push({ path: 'schemaVersion', message: '必须是非空字符串' });
  } else if (state.schemaVersion !== CURRENT_SCHEMA_VERSION) {
    errors.push({ path: 'schemaVersion', message: `版本不匹配：期望 "${CURRENT_SCHEMA_VERSION}"，实际 "${state.schemaVersion}"` });
  }

  // worldId
  if (typeof state.worldId !== 'string' || state.worldId.length === 0) {
    errors.push({ path: 'worldId', message: '必须是非空字符串' });
  }

  // domainRef
  if (typeof state.domainRef !== 'string' || state.domainRef.length === 0) {
    errors.push({ path: 'domainRef', message: '必须是非空字符串' });
  }

  // worldClock
  if (!state.worldClock || typeof state.worldClock !== 'object') {
    errors.push({ path: 'worldClock', message: '必须是对象' });
  } else {
    // time
    if (typeof state.worldClock.time !== 'string' || state.worldClock.time.length === 0) {
      errors.push({ path: 'worldClock.time', message: '必须是非空字符串（ISO 8601）' });
    } else {
      const time = new Date(state.worldClock.time);
      if (isNaN(time.getTime())) {
        errors.push({ path: 'worldClock.time', message: '必须是有效的 ISO 8601 日期字符串' });
      }
    }

    // tickCount
    if (typeof state.worldClock.tickCount !== 'number' || state.worldClock.tickCount < 0 || !Number.isInteger(state.worldClock.tickCount)) {
      errors.push({ path: 'worldClock.tickCount', message: '必须是非负整数' });
    }
  }

  // characters
  if (!Array.isArray(state.characters)) {
    errors.push({ path: 'characters', message: '必须是数组' });
  } else {
    const seenIds = new Set();
    for (let i = 0; i < state.characters.length; i++) {
      const char = state.characters[i];
      const prefix = `characters[${i}]`;

      if (!char || typeof char !== 'object') {
        errors.push({ path: prefix, message: '必须是对象' });
        continue;
      }

      // id
      if (typeof char.id !== 'string' || char.id.length === 0) {
        errors.push({ path: `${prefix}.id`, message: '必须是非空字符串' });
      } else if (seenIds.has(char.id)) {
        errors.push({ path: `${prefix}.id`, message: `id "${char.id}" 重复` });
      } else {
        seenIds.add(char.id);
      }

      // name
      if (typeof char.name !== 'string' || char.name.length === 0) {
        errors.push({ path: `${prefix}.name`, message: '必须是非空字符串' });
      }
    }
  }

  // relationships — 强制必填
  if (!Array.isArray(state.relationships)) {
    errors.push({ path: 'relationships', message: '必须是数组' });
  } else {
    const characterIds = new Set();
    if (Array.isArray(state.characters)) {
      for (const char of state.characters) {
        if (char && typeof char.id === 'string') {
          characterIds.add(char.id);
        }
      }
    }

    for (let i = 0; i < state.relationships.length; i++) {
      const rel = state.relationships[i];
      const prefix = `relationships[${i}]`;

      if (!rel || typeof rel !== 'object') {
        errors.push({ path: prefix, message: '必须是对象' });
        continue;
      }

      // from
      if (typeof rel.from !== 'string' || rel.from.length === 0) {
        errors.push({ path: `${prefix}.from`, message: '必须是非空字符串' });
      } else if (!characterIds.has(rel.from)) {
        errors.push({ path: `${prefix}.from`, message: `引用了不存在的角色 "${rel.from}"` });
      }

      // to
      if (typeof rel.to !== 'string' || rel.to.length === 0) {
        errors.push({ path: `${prefix}.to`, message: '必须是非空字符串' });
      } else if (!characterIds.has(rel.to)) {
        errors.push({ path: `${prefix}.to`, message: `引用了不存在的角色 "${rel.to}"` });
      }

      // type
      if (rel.type !== undefined) {
        if (typeof rel.type !== 'string') {
          errors.push({ path: `${prefix}.type`, message: '必须是字符串' });
        }
      }

      // strength
      if (rel.strength !== undefined) {
        // R138: typeof NaN === 'number' is true, and NaN < 0 / NaN > 1 are both false,
        // so NaN would bypass the original range check. Number.isFinite catches NaN/Infinity.
        if (typeof rel.strength !== 'number' || !Number.isFinite(rel.strength) || rel.strength < 0 || rel.strength > 1) {
          errors.push({ path: `${prefix}.strength`, message: '必须是 0-1 之间的数字' });
        }
      }
    }
  }

  // events — 强制必填
  if (!Array.isArray(state.events)) {
    errors.push({ path: 'events', message: '必须是数组' });
  } else {
      for (let i = 0; i < state.events.length; i++) {
        const evt = state.events[i];
        const prefix = `events[${i}]`;

        if (!evt || typeof evt !== 'object') {
          errors.push({ path: prefix, message: '必须是对象' });
          continue;
        }

        // id
        if (typeof evt.id !== 'string' || evt.id.length === 0) {
          errors.push({ path: `${prefix}.id`, message: '必须是非空字符串' });
        }

        // time
        if (typeof evt.time !== 'string' || evt.time.length === 0) {
          errors.push({ path: `${prefix}.time`, message: '必须是非空字符串（ISO 8601）' });
        } else {
          const time = new Date(evt.time);
          if (isNaN(time.getTime())) {
            errors.push({ path: `${prefix}.time`, message: '必须是有效的 ISO 8601 日期字符串' });
          }
        }

        // type
        if (typeof evt.type !== 'string' || evt.type.length === 0) {
          errors.push({ path: `${prefix}.type`, message: '必须是非空字符串' });
        }
      }
    }

  // runtimeSnapshot — required opaque payload.
  // The envelope layer deliberately does not validate every runtime field, but
  // allowing an absent payload lets restore construct a fresh empty world and
  // turns corruption into silent data loss.
  if (!state.runtimeSnapshot || typeof state.runtimeSnapshot !== 'object' || Array.isArray(state.runtimeSnapshot)) {
    errors.push({ path: 'runtimeSnapshot', message: '必须是对象（Opaque Payload）' });
  } else if (!state.runtimeSnapshot.agents || typeof state.runtimeSnapshot.agents !== 'object' || Array.isArray(state.runtimeSnapshot.agents)) {
    // `agents` is the minimum structural witness that this is an AndyWorld
    // snapshot rather than an arbitrary object. Do not inspect agent internals
    // here: they remain owned by the runtime restore path.
    errors.push({ path: 'runtimeSnapshot.agents', message: '必须是对象' });
  }

  return { valid: errors.length === 0, errors };
}

module.exports = {
  validateWorldSpec,
  validateWorldState,
  CURRENT_SCHEMA_VERSION,
};
