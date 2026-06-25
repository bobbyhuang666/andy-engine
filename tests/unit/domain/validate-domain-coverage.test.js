/**
 * validateDomain.js branch coverage — Wave 5 batch 4
 *
 * domain-contract.test.js 已覆盖 valid domain + 主要引用一致性错误。
 * 本文件补各字段的类型/结构负分支(stateCenters/adjacency/states/eventTemplates/
 * roleArchetypes/fallback/semanticProfile 的非对象/非数组/缺字段分支)。
 *
 * 纯函数:无 DB / 无 LLM。基于 minimalDomain spread-override。
 */

import { describe, it, expect } from 'vitest';
import { validateDomain } from '../../../src/domain/validateDomain.js';

const minimalDomain = {
  id: 'minimal',
  name: 'Minimal',
  version: '1.0.0',
  regions: ['广场', '小屋'],
  states: {
    '休息': { next: ['闲逛'], hours: [0, 1, 2, 3], category: 'rest' },
    '闲逛': { next: ['休息'], hours: [4, 5, 6, 7], category: 'social' },
  },
  stateCenters: {
    '休息': [0.1, 0.1, 0.1, 0.1],
    '闲逛': [0.5, 0.5, 0.5, 0.5],
  },
};

function validate(cfg, opts) {
  return validateDomain(cfg, opts);
}

// ═══════════════════════════════════════════
// 输入守卫
// ═══════════════════════════════════════════
describe('validateDomain — input guard', () => {
  it('null domain returns single error and early-exits', () => {
    const r = validate(null);
    expect(r.errors.some(e => e.message.includes('domain 必须是一个对象'))).toBe(true);
    expect(r.errors).toHaveLength(1);
  });
  it('non-object domain returns single error', () => {
    expect(validate('x').errors).toHaveLength(1);
    expect(validate(42).errors).toHaveLength(1);
  });
});

// ═══════════════════════════════════════════
// stateCenters
// ═══════════════════════════════════════════
describe('validateDomain — stateCenters branches', () => {
  it('missing/non-object stateCenters errors', () => {
    expect(validate({ ...minimalDomain, stateCenters: null }).errors.some(e => e.path === 'stateCenters')).toBe(true);
  });
  it('state in states but missing from stateCenters warns (not error)', () => {
    const cfg = { ...minimalDomain, states: { ...minimalDomain.states, extra: { next: ['休息'], hours: [0], category: 'rest' } } };
    const r = validate(cfg);
    expect(r.warnings.some(w => w.path === 'stateCenters.extra')).toBe(true);
    expect(r.valid).toBe(true);
  });
  it('stateCenters entry not in states warns', () => {
    const cfg = { ...minimalDomain, stateCenters: { ...minimalDomain.stateCenters, 孤儿: [0, 0, 0, 0] } };
    const r = validate(cfg);
    expect(r.warnings.some(w => w.path === 'stateCenters.孤儿')).toBe(true);
  });
});

// ═══════════════════════════════════════════
// adjacency
// ═══════════════════════════════════════════
describe('validateDomain — adjacency branches', () => {
  it('non-array adjacency errors', () => {
    expect(validate({ ...minimalDomain, adjacency: 'x' }).errors.some(e => e.path === 'adjacency')).toBe(true);
  });
  it('negative distance warns (not error)', () => {
    const r = validate({ ...minimalDomain, adjacency: [['广场', '小屋', -1]] });
    expect(r.warnings.some(w => w.path === 'adjacency[0][2]')).toBe(true);
    expect(r.valid).toBe(true);
  });
});

// ═══════════════════════════════════════════
// regionCoords
// ═══════════════════════════════════════════
describe('validateDomain — regionCoords branches', () => {
  it('non-object regionCoords errors', () => {
    expect(validate({ ...minimalDomain, regionCoords: 'x' }).errors.some(e => e.path === 'regionCoords')).toBe(true);
  });
});

// ═══════════════════════════════════════════
// states def branches
// ═══════════════════════════════════════════
describe('validateDomain — states def branches', () => {
  it('non-object state def errors and continues', () => {
    const cfg = { ...minimalDomain, states: { 休息: null, 闲逛: minimalDomain.states.闲逛 } };
    const r = validate(cfg);
    expect(r.errors.some(e => e.path === 'states.休息')).toBe(true);
  });
  it('non-array def.next errors', () => {
    expect(validate({ ...minimalDomain, states: { 休息: { next: 'x', hours: [0], category: 'rest' } } })
      .errors.some(e => e.path === 'states.休息.next')).toBe(true);
  });
  it('non-array def.hours warns', () => {
    const r = validate({ ...minimalDomain, states: { 休息: { next: ['闲逛'], hours: 'x', category: 'rest' } } });
    expect(r.warnings.some(w => w.path === 'states.休息.hours')).toBe(true);
  });
  it('non-string def.category warns', () => {
    const r = validate({ ...minimalDomain, states: { 休息: { next: ['闲逛'], hours: [0], category: 123 } } });
    expect(r.warnings.some(w => w.path === 'states.休息.category')).toBe(true);
  });
});

// ═══════════════════════════════════════════
// needSatisfactionMap / needDriveStates
// ═══════════════════════════════════════════
describe('validateDomain — need maps branches', () => {
  it('non-object needSatisfactionMap errors', () => {
    // 字符串 truthy 且 typeof !== 'object' → 触发错误(数组 typeof 是 object 不触发)
    expect(validate({ ...minimalDomain, needSatisfactionMap: 'x' }).errors.some(e => e.path === 'needSatisfactionMap')).toBe(true);
  });
  it('non-object needDriveStates errors', () => {
    expect(validate({ ...minimalDomain, needDriveStates: 'x' }).errors.some(e => e.path === 'needDriveStates')).toBe(true);
  });
  it('non-array needDriveStates entry errors', () => {
    expect(validate({ ...minimalDomain, needDriveStates: { hunger: 'x' } }).errors.some(e => e.path === 'needDriveStates.hunger')).toBe(true);
  });
});

// ═══════════════════════════════════════════
// eventTemplates
// ═══════════════════════════════════════════
describe('validateDomain — eventTemplates branches', () => {
  it('non-object eventTemplates errors', () => {
    expect(validate({ ...minimalDomain, eventTemplates: 'x' }).errors.some(e => e.path === 'eventTemplates')).toBe(true);
  });
  it('regionEvents non-array events errors', () => {
    expect(validate({ ...minimalDomain, eventTemplates: { regionEvents: { 广场: {} } } })
      .errors.some(e => e.path.includes('regionEvents.广场'))).toBe(true);
  });
  it('regionEvents event missing content warns', () => {
    const r = validate({ ...minimalDomain, eventTemplates: { regionEvents: { 广场: [{}] } } });
    expect(r.warnings.some(w => w.path.includes('regionEvents.广场'))).toBe(true);
  });
  it('genericEvents non-array errors', () => {
    expect(validate({ ...minimalDomain, eventTemplates: { genericEvents: 'x' } })
      .errors.some(e => e.path === 'eventTemplates.genericEvents')).toBe(true);
  });
  it('genericEvents missing content warns', () => {
    const r = validate({ ...minimalDomain, eventTemplates: { genericEvents: [{}] } });
    expect(r.warnings.some(w => w.path.includes('genericEvents'))).toBe(true);
  });
  it('timeEvents non-object errors', () => {
    expect(validate({ ...minimalDomain, eventTemplates: { timeEvents: 'x' } })
      .errors.some(e => e.path === 'eventTemplates.timeEvents')).toBe(true);
  });
  it('timeEvents entry non-array errors', () => {
    expect(validate({ ...minimalDomain, eventTemplates: { timeEvents: { day: 'x' } } })
      .errors.some(e => e.path === 'eventTemplates.timeEvents.day')).toBe(true);
  });
});

// ═══════════════════════════════════════════
// roleArchetypes
// ═══════════════════════════════════════════
describe('validateDomain — roleArchetypes branches', () => {
  it('non-object roleArchetypes errors', () => {
    expect(validate({ ...minimalDomain, roleArchetypes: 'x' }).errors.some(e => e.path === 'roleArchetypes')).toBe(true);
  });
  it('non-object archetype errors', () => {
    expect(validate({ ...minimalDomain, roleArchetypes: { x: null } }).errors.some(e => e.path === 'roleArchetypes.x')).toBe(true);
  });
});

// ═══════════════════════════════════════════
// fallback
// ═══════════════════════════════════════════
describe('validateDomain — fallback branches', () => {
  it('non-object fallback errors', () => {
    expect(validate({ ...minimalDomain, fallback: 'x' }).errors.some(e => e.path === 'fallback')).toBe(true);
  });
  it('unknownRegion referencing nonexistent region errors', () => {
    expect(validate({ ...minimalDomain, fallback: { unknownRegion: '不存在', unknownState: '不存在' } })
      .errors.some(e => e.path === 'fallback.unknownRegion')).toBe(true);
  });
  it('unknownState referencing nonexistent state errors', () => {
    expect(validate({ ...minimalDomain, fallback: { unknownState: '不存在' } })
      .errors.some(e => e.path === 'fallback.unknownState')).toBe(true);
  });
});

// ═══════════════════════════════════════════
// semanticProfile
// ═══════════════════════════════════════════
describe('validateDomain — semanticProfile branches', () => {
  it('non-object semanticProfile errors', () => {
    expect(validate({ ...minimalDomain, semanticProfile: 'x' }).errors.some(e => e.path === 'semanticProfile')).toBe(true);
  });
  it('non-string language errors', () => {
    expect(validate({ ...minimalDomain, semanticProfile: { language: 123 } }).errors.some(e => e.path === 'semanticProfile.language')).toBe(true);
  });
  it('non-object mindWander errors', () => {
    expect(validate({ ...minimalDomain, semanticProfile: { mindWander: 'x' } }).errors.some(e => e.path === 'semanticProfile.mindWander')).toBe(true);
  });
  it('non-object narrativeModifiers errors', () => {
    expect(validate({ ...minimalDomain, semanticProfile: { narrativeModifiers: 'x' } }).errors.some(e => e.path === 'semanticProfile.narrativeModifiers')).toBe(true);
  });
  it('non-object emotionKeywords errors', () => {
    expect(validate({ ...minimalDomain, semanticProfile: { emotionKeywords: 'x' } }).errors.some(e => e.path === 'semanticProfile.emotionKeywords')).toBe(true);
  });
  it('non-object emotionRegulationKeywords errors', () => {
    expect(validate({ ...minimalDomain, semanticProfile: { emotionRegulationKeywords: 'x' } }).errors.some(e => e.path === 'semanticProfile.emotionRegulationKeywords')).toBe(true);
  });
  it('non-object defaultSemanticCategories errors', () => {
    expect(validate({ ...minimalDomain, semanticProfile: { defaultSemanticCategories: 'x' } }).errors.some(e => e.path === 'semanticProfile.defaultSemanticCategories')).toBe(true);
  });
});

// ═══════════════════════════════════════════
// strict mode
// ═══════════════════════════════════════════
describe('validateDomain — strict mode escalation', () => {
  it('strict escalates stateCenters-state-missing warning to error', () => {
    const cfg = { ...minimalDomain, states: { ...minimalDomain.states, extra: { next: ['休息'], hours: [0], category: 'rest' } } };
    const r = validate(cfg, { strict: true });
    expect(r.errors.some(e => e.path === 'stateCenters.extra')).toBe(true);
    expect(r.valid).toBe(false);
  });
});
