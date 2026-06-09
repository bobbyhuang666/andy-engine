/**
 * validateDomain — Domain 配置校验
 *
 * 校验 domain 配置的完整性和引用一致性。
 *
 * @param {Object} domain - domain 配置对象
 * @returns {{ valid: boolean, errors: string[], warnings: string[] }}
 */
function validateDomain(domain) {
  const errors = [];
  const warnings = [];

  if (!domain || typeof domain !== 'object') {
    return { valid: false, errors: ['domain 必须是一个对象'], warnings: [] };
  }

  // ─── 基础字段 ───
  if (!domain.id) errors.push('缺少 domain.id');
  if (!domain.name) warnings.push('缺少 domain.name');

  // ─── 区域 ───
  if (!Array.isArray(domain.regions) || domain.regions.length === 0) {
    errors.push('domain.regions 必须是非空数组');
  }

  // ─── 状态 ───
  if (!domain.states || typeof domain.states !== 'object') {
    errors.push('domain.states 必须是对象');
  }

  if (!domain.stateCenters || typeof domain.stateCenters !== 'object') {
    errors.push('domain.stateCenters 必须是对象');
  }

  // ─── 引用一致性检查 ───
  if (domain.states && domain.stateCenters) {
    const stateNames = Object.keys(domain.states);
    const centerNames = Object.keys(domain.stateCenters);

    // 检查 states 中的每个状态是否都有对应的 center
    for (const state of stateNames) {
      if (!domain.stateCenters[state]) {
        warnings.push(`状态 "${state}" 在 states 中定义但没有对应的 stateCenters`);
      }
    }

    // 检查 stateCenters 中的每个状态是否都在 states 中定义
    for (const center of centerNames) {
      if (!domain.states[center]) {
        warnings.push(`stateCenters 中的 "${center}" 没有在 states 中定义`);
      }
    }
  }

  // ─── 需求满足映射 ───
  if (domain.needSatisfactionMap) {
    const regionSet = new Set(domain.regions || []);
    const stateSet = new Set(Object.keys(domain.states || {}));

    for (const [need, mapping] of Object.entries(domain.needSatisfactionMap)) {
      if (mapping.states) {
        for (const state of mapping.states) {
          if (!stateSet.has(state)) {
            warnings.push(`needSatisfactionMap.${need}.states 引用了不存在的状态 "${state}"`);
          }
        }
      }
      if (mapping.regions) {
        for (const region of mapping.regions) {
          if (!regionSet.has(region)) {
            warnings.push(`needSatisfactionMap.${need}.regions 引用了不存在的区域 "${region}"`);
          }
        }
      }
    }
  }

  // ─── 事件模板 ───
  if (domain.eventTemplates && domain.eventTemplates.regionEvents) {
    const regionSet = new Set(domain.regions || []);
    for (const region of Object.keys(domain.eventTemplates.regionEvents)) {
      if (!regionSet.has(region)) {
        warnings.push(`eventTemplates.regionEvents 引用了不存在的区域 "${region}"`);
      }
    }
  }

  // ─── Fallback ───
  if (domain.fallback) {
    const regionSet = new Set(domain.regions || []);
    const stateSet = new Set(Object.keys(domain.states || {}));

    if (domain.fallback.defaultRegion && !regionSet.has(domain.fallback.defaultRegion)) {
      errors.push(`fallback.defaultRegion "${domain.fallback.defaultRegion}" 不在 regions 中`);
    }
    if (domain.fallback.defaultState && !stateSet.has(domain.fallback.defaultState)) {
      errors.push(`fallback.defaultState "${domain.fallback.defaultState}" 不在 states 中`);
    }
    if (domain.fallback.unknownRegion && !regionSet.has(domain.fallback.unknownRegion)) {
      errors.push(`fallback.unknownRegion "${domain.fallback.unknownRegion}" 不在 regions 中`);
    }
    if (domain.fallback.unknownState && !stateSet.has(domain.fallback.unknownState)) {
      errors.push(`fallback.unknownState "${domain.fallback.unknownState}" 不在 states 中`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

module.exports = { validateDomain };
