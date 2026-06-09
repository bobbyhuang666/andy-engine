/**
 * validateDomain — Domain 配置校验
 *
 * 校验 domain 配置的完整性和引用一致性。
 *
 * @param {Object} domain - domain 配置对象
 * @param {Object} [options] - 校验选项
 * @param {boolean} [options.strict=false] - 严格模式（warnings 升级为 errors）
 * @param {boolean} [options.throwOnError=false] - 出错时抛出异常
 * @returns {{ valid: boolean, errors: Array<{path: string, message: string}>, warnings: Array<{path: string, message: string}> }}
 */
function validateDomain(domain, options = {}) {
  const { strict = false, throwOnError = false } = options;
  const errors = [];
  const warnings = [];

  const addError = (path, message) => errors.push({ path, message });
  const addWarning = (path, message) => {
    if (strict) {
      errors.push({ path, message: `[strict] ${message}` });
    } else {
      warnings.push({ path, message });
    }
  };

  // ─── 基础类型检查 ───
  if (!domain || typeof domain !== 'object') {
    addError('', 'domain 必须是一个对象');
    return _result(errors, warnings, throwOnError);
  }

  // ─── 必需字段 ───
  if (typeof domain.id !== 'string' || domain.id.length === 0) {
    addError('id', 'domain.id 必须是非空字符串');
  }
  if (typeof domain.name !== 'string' || domain.name.length === 0) {
    addError('name', 'domain.name 必须是非空字符串');
  }
  if (typeof domain.version !== 'string' || domain.version.length === 0) {
    addError('version', 'domain.version 必须是非空字符串');
  }

  // ─── 区域 ───
  if (!Array.isArray(domain.regions) || domain.regions.length === 0) {
    addError('regions', 'domain.regions 必须是非空数组');
  }
  const regionSet = new Set(domain.regions || []);

  // ─── 状态 ───
  if (!domain.states || typeof domain.states !== 'object' || Object.keys(domain.states).length === 0) {
    addError('states', 'domain.states 必须是非空对象');
  }
  const stateSet = new Set(Object.keys(domain.states || {}));

  // ─── stateCenters ───
  if (!domain.stateCenters || typeof domain.stateCenters !== 'object') {
    addError('stateCenters', 'domain.stateCenters 必须是对象');
  } else {
    // 检查每个 stateCenter 是 4 维 number array
    for (const [state, center] of Object.entries(domain.stateCenters)) {
      if (!Array.isArray(center) || center.length !== 4) {
        addError(`stateCenters.${state}`, '必须是 4 维数组');
      } else if (!center.every(v => typeof v === 'number' && v >= 0 && v <= 1)) {
        addError(`stateCenters.${state}`, '每个维度必须是 0-1 之间的数字');
      }
    }

    // 检查 stateCenters 覆盖所有 states
    for (const state of stateSet) {
      if (!domain.stateCenters[state]) {
        addWarning(`stateCenters.${state}`, `状态 "${state}" 在 states 中定义但没有对应的 stateCenters`);
      }
    }

    // 检查 stateCenters 中的状态都在 states 中定义
    for (const center of Object.keys(domain.stateCenters)) {
      if (!stateSet.has(center)) {
        addWarning(`stateCenters.${center}`, `stateCenters 中的 "${center}" 没有在 states 中定义`);
      }
    }
  }

  // ─── adjacency ───
  if (domain.adjacency) {
    if (!Array.isArray(domain.adjacency)) {
      addError('adjacency', 'domain.adjacency 必须是数组');
    } else {
      for (let i = 0; i < domain.adjacency.length; i++) {
        const [r1, r2, dist] = domain.adjacency[i];
        if (!regionSet.has(r1)) {
          addError(`adjacency[${i}][0]`, `引用了不存在的区域 "${r1}"`);
        }
        if (!regionSet.has(r2)) {
          addError(`adjacency[${i}][1]`, `引用了不存在的区域 "${r2}"`);
        }
        if (typeof dist !== 'number' || dist < 0) {
          addWarning(`adjacency[${i}][2]`, `距离应该是非负数字`);
        }
      }
    }
  }

  // ─── regionCoords ───
  if (domain.regionCoords) {
    if (typeof domain.regionCoords !== 'object') {
      addError('regionCoords', 'domain.regionCoords 必须是对象');
    } else {
      for (const region of Object.keys(domain.regionCoords)) {
        if (!regionSet.has(region)) {
          addWarning(`regionCoords.${region}`, `引用了不存在的区域 "${region}"`);
        }
      }
    }
  }

  // ─── states 引用检查 ───
  if (domain.states) {
    for (const [state, def] of Object.entries(domain.states)) {
      if (!def || typeof def !== 'object') {
        addError(`states.${state}`, '状态定义必须是对象');
        continue;
      }
      if (!Array.isArray(def.next)) {
        addError(`states.${state}.next`, 'next 必须是数组');
      } else {
        for (const next of def.next) {
          if (!stateSet.has(next)) {
            addError(`states.${state}.next`, `引用了不存在的状态 "${next}"`);
          }
        }
      }
      if (def.hours !== undefined) {
        if (!Array.isArray(def.hours)) {
          addWarning(`states.${state}.hours`, 'hours 应该是数组');
        }
      }
      if (def.category !== undefined && typeof def.category !== 'string') {
        addWarning(`states.${state}.category`, 'category 应该是字符串');
      }
    }
  }

  // ─── needSatisfactionMap ───
  if (domain.needSatisfactionMap) {
    if (typeof domain.needSatisfactionMap !== 'object') {
      addError('needSatisfactionMap', '必须是对象');
    } else {
      for (const [need, mapping] of Object.entries(domain.needSatisfactionMap)) {
        if (mapping.states) {
          for (const state of mapping.states) {
            if (!stateSet.has(state)) {
              addError(`needSatisfactionMap.${need}.states`, `引用了不存在的状态 "${state}"`);
            }
          }
        }
        if (mapping.regions) {
          for (const region of mapping.regions) {
            if (!regionSet.has(region)) {
              addError(`needSatisfactionMap.${need}.regions`, `引用了不存在的区域 "${region}"`);
            }
          }
        }
      }
    }
  }

  // ─── needDriveStates ───
  if (domain.needDriveStates) {
    if (typeof domain.needDriveStates !== 'object') {
      addError('needDriveStates', '必须是对象');
    } else {
      for (const [need, states] of Object.entries(domain.needDriveStates)) {
        if (!Array.isArray(states)) {
          addError(`needDriveStates.${need}`, '必须是数组');
        } else {
          for (const state of states) {
            if (!stateSet.has(state)) {
              addError(`needDriveStates.${need}`, `引用了不存在的状态 "${state}"`);
            }
          }
        }
      }
    }
  }

  // ─── eventTemplates ───
  if (domain.eventTemplates) {
    if (typeof domain.eventTemplates !== 'object') {
      addError('eventTemplates', '必须是对象');
    } else {
      // regionEvents
      if (domain.eventTemplates.regionEvents) {
        for (const region of Object.keys(domain.eventTemplates.regionEvents)) {
          if (!regionSet.has(region)) {
            addWarning(`eventTemplates.regionEvents.${region}`, `引用了不存在的区域 "${region}"`);
          }
          const events = domain.eventTemplates.regionEvents[region];
          if (!Array.isArray(events)) {
            addError(`eventTemplates.regionEvents.${region}`, '必须是数组');
          } else {
            for (let i = 0; i < events.length; i++) {
              if (!events[i].content) {
                addWarning(`eventTemplates.regionEvents.${region}[${i}]`, '事件缺少 content');
              }
            }
          }
        }
      }

      // genericEvents
      if (domain.eventTemplates.genericEvents) {
        if (!Array.isArray(domain.eventTemplates.genericEvents)) {
          addError('eventTemplates.genericEvents', '必须是数组');
        } else {
          for (let i = 0; i < domain.eventTemplates.genericEvents.length; i++) {
            if (!domain.eventTemplates.genericEvents[i].content) {
              addWarning(`eventTemplates.genericEvents[${i}]`, '事件缺少 content');
            }
          }
        }
      }

      // timeEvents / weatherEvents
      for (const key of ['timeEvents', 'weatherEvents']) {
        if (domain.eventTemplates[key]) {
          if (typeof domain.eventTemplates[key] !== 'object') {
            addError(`eventTemplates.${key}`, '必须是对象');
          } else {
            for (const [k, events] of Object.entries(domain.eventTemplates[key])) {
              if (!Array.isArray(events)) {
                addError(`eventTemplates.${key}.${k}`, '必须是数组');
              }
            }
          }
        }
      }
    }
  }

  // ─── roleArchetypes ───
  if (domain.roleArchetypes) {
    if (typeof domain.roleArchetypes !== 'object') {
      addError('roleArchetypes', '必须是对象');
    } else {
      for (const [name, archetype] of Object.entries(domain.roleArchetypes)) {
        if (!archetype || typeof archetype !== 'object') {
          addError(`roleArchetypes.${name}`, '必须是对象');
          continue;
        }
        if (archetype.entries && Array.isArray(archetype.entries)) {
          for (let i = 0; i < archetype.entries.length; i++) {
            const entry = archetype.entries[i];
            if (entry.region && !regionSet.has(entry.region)) {
              addError(`roleArchetypes.${name}.entries[${i}].region`, `引用了不存在的区域 "${entry.region}"`);
            }
          }
        }
      }
    }
  }

  // ─── fallback ───
  if (domain.fallback) {
    if (typeof domain.fallback !== 'object') {
      addError('fallback', '必须是对象');
    } else {
      if (domain.fallback.defaultRegion && !regionSet.has(domain.fallback.defaultRegion)) {
        addError('fallback.defaultRegion', `"${domain.fallback.defaultRegion}" 不在 regions 中`);
      }
      if (domain.fallback.defaultState && !stateSet.has(domain.fallback.defaultState)) {
        addError('fallback.defaultState', `"${domain.fallback.defaultState}" 不在 states 中`);
      }
      if (domain.fallback.unknownRegion && !regionSet.has(domain.fallback.unknownRegion)) {
        addError('fallback.unknownRegion', `"${domain.fallback.unknownRegion}" 不在 regions 中`);
      }
      if (domain.fallback.unknownState && !stateSet.has(domain.fallback.unknownState)) {
        addError('fallback.unknownState', `"${domain.fallback.unknownState}" 不在 states 中`);
      }
    }
  }

  // ─── forbiddenTerms ───
  if (domain.forbiddenTerms !== undefined) {
    if (!Array.isArray(domain.forbiddenTerms)) {
      addError('forbiddenTerms', '必须是字符串数组');
    } else {
      for (let i = 0; i < domain.forbiddenTerms.length; i++) {
        if (typeof domain.forbiddenTerms[i] !== 'string') {
          addError(`forbiddenTerms[${i}]`, '必须是字符串');
        }
      }
    }
  }

  return _result(errors, warnings, throwOnError);
}

function _result(errors, warnings, throwOnError) {
  const valid = errors.length === 0;
  if (throwOnError && !valid) {
    throw new Error(`Invalid domain config:\n${errors.map(e => `  ${e.path}: ${e.message}`).join('\n')}`);
  }
  return { valid, errors, warnings };
}

module.exports = { validateDomain };
