/**
 * Domain Contract 测试
 *
 * 验证 domain 校验规则和错误提示。
 */

import { describe, it, expect } from 'vitest';
import { validateDomain } from '../src/domain/validateDomain.js';
import { DomainRegistry } from '../src/domain/DomainRegistry.js';
import tavernDomain from '../presets/tavern/index.js';
import campusDomain from '../presets/campus/index.js';

// 极简有效 domain
const minimalDomain = {
  id: 'minimal',
  name: 'Minimal',
  version: '1.0.0',
  regions: ['广场', '小屋'],
  states: {
    '休息': { next: ['闲逛'], hours: [0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23], category: 'rest' },
    '闲逛': { next: ['休息'], hours: [0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23], category: 'social' },
  },
  stateCenters: {
    '休息': [0.1, 0.1, 0.1, 0.1],
    '闲逛': [0.5, 0.5, 0.5, 0.5],
  },
};

describe('validateDomain', () => {
  describe('valid domains', () => {
    it('tavern domain passes', () => {
      const result = validateDomain(tavernDomain);
      expect(result.valid).toBe(true);
      expect(result.errors.length).toBe(0);
    });

    it('campus domain passes', () => {
      const result = validateDomain(campusDomain);
      expect(result.valid).toBe(true);
      expect(result.errors.length).toBe(0);
    });

    it('minimal domain passes', () => {
      const result = validateDomain(minimalDomain);
      expect(result.valid).toBe(true);
      expect(result.errors.length).toBe(0);
    });
  });

  describe('required fields', () => {
    it('missing id fails', () => {
      const result = validateDomain({ name: 'Test', regions: ['r1'], states: { s1: { next: [], hours: [] } }, stateCenters: { s1: [0,0,0,0] } });
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.path === 'id')).toBe(true);
    });

    it('missing name fails', () => {
      const result = validateDomain({ id: 'test', regions: ['r1'], states: { s1: { next: [], hours: [] } }, stateCenters: { s1: [0,0,0,0] } });
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.path === 'name')).toBe(true);
    });

    it('missing regions fails', () => {
      const result = validateDomain({ id: 'test', name: 'Test', states: { s1: { next: [], hours: [] } }, stateCenters: { s1: [0,0,0,0] } });
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.path === 'regions')).toBe(true);
    });

    it('empty regions fails', () => {
      const result = validateDomain({ id: 'test', name: 'Test', regions: [], states: { s1: { next: [], hours: [] } }, stateCenters: { s1: [0,0,0,0] } });
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.path === 'regions')).toBe(true);
    });

    it('missing states fails', () => {
      const result = validateDomain({ id: 'test', name: 'Test', regions: ['r1'], stateCenters: { s1: [0,0,0,0] } });
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.path === 'states')).toBe(true);
    });

    it('empty states fails', () => {
      const result = validateDomain({ id: 'test', name: 'Test', regions: ['r1'], states: {}, stateCenters: { s1: [0,0,0,0] } });
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.path === 'states')).toBe(true);
    });
  });

  describe('stateCenters validation', () => {
    it('invalid dimension count fails', () => {
      const domain = { ...minimalDomain, stateCenters: { '休息': [0,0,0], '闲逛': [0,0,0,0] } };
      const result = validateDomain(domain);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.path === 'stateCenters.休息')).toBe(true);
    });

    it('out of range dimension fails', () => {
      const domain = { ...minimalDomain, stateCenters: { '休息': [0,0,0,1.5], '闲逛': [0,0,0,0] } };
      const result = validateDomain(domain);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.path === 'stateCenters.休息')).toBe(true);
    });
  });

  describe('reference consistency', () => {
    it('adjacency unknown region fails', () => {
      const domain = { ...minimalDomain, adjacency: [['广场', '不存在', 1]] };
      const result = validateDomain(domain);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.path.includes('adjacency'))).toBe(true);
    });

    it('state.next unknown state fails', () => {
      const domain = {
        ...minimalDomain,
        states: { '休息': { next: ['不存在'], hours: [] }, '闲逛': { next: ['休息'], hours: [] } },
      };
      const result = validateDomain(domain);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.path.includes('states.休息.next'))).toBe(true);
    });

    it('needSatisfactionMap unknown state fails', () => {
      const domain = {
        ...minimalDomain,
        needSatisfactionMap: { hunger: { states: ['不存在'], regions: [] } },
      };
      const result = validateDomain(domain);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.path.includes('needSatisfactionMap'))).toBe(true);
    });

    it('needSatisfactionMap unknown region fails', () => {
      const domain = {
        ...minimalDomain,
        needSatisfactionMap: { hunger: { states: [], regions: ['不存在'] } },
      };
      const result = validateDomain(domain);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.path.includes('needSatisfactionMap'))).toBe(true);
    });

    it('needDriveStates unknown state fails', () => {
      const domain = {
        ...minimalDomain,
        needDriveStates: { hunger: ['不存在'] },
      };
      const result = validateDomain(domain);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.path.includes('needDriveStates'))).toBe(true);
    });

    it('eventTemplates.regionEvents unknown region warns', () => {
      const domain = {
        ...minimalDomain,
        eventTemplates: { regionEvents: { '不存在': [{ content: 'test', delta: {} }] } },
      };
      const result = validateDomain(domain);
      expect(result.warnings.some(w => w.path.includes('eventTemplates'))).toBe(true);
    });

    it('roleArchetypes unknown region fails', () => {
      const domain = {
        ...minimalDomain,
        roleArchetypes: { worker: { entries: [{ region: '不存在', activity: 'work' }] } },
      };
      const result = validateDomain(domain);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.path.includes('roleArchetypes'))).toBe(true);
    });
  });

  describe('fallback validation', () => {
    it('invalid defaultRegion fails', () => {
      const domain = { ...minimalDomain, fallback: { defaultRegion: '不存在' } };
      const result = validateDomain(domain);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.path === 'fallback.defaultRegion')).toBe(true);
    });

    it('invalid defaultState fails', () => {
      const domain = { ...minimalDomain, fallback: { defaultState: '不存在' } };
      const result = validateDomain(domain);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.path === 'fallback.defaultState')).toBe(true);
    });
  });

  describe('forbiddenTerms validation', () => {
    it('wrong type fails', () => {
      const domain = { ...minimalDomain, forbiddenTerms: 'not-array' };
      const result = validateDomain(domain);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.path === 'forbiddenTerms')).toBe(true);
    });

    it('non-string items fail', () => {
      const domain = { ...minimalDomain, forbiddenTerms: [123] };
      const result = validateDomain(domain);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.path === 'forbiddenTerms[0]')).toBe(true);
    });
  });

  describe('strict mode', () => {
    it('warnings become errors in strict mode', () => {
      // 创建一个有 warning 但无 error 的 domain
      const domain = {
        ...minimalDomain,
        regionCoords: { '不存在的区域': { shape: 'rect', x: 0, y: 0, w: 10, h: 10 } },
      };
      const normal = validateDomain(domain, { strict: false });
      const strict = validateDomain(domain, { strict: true });
      expect(normal.warnings.length).toBeGreaterThan(0);
      expect(strict.errors.length).toBeGreaterThan(normal.errors.length);
    });
  });

  describe('throwOnError', () => {
    it('throws when throwOnError=true and invalid', () => {
      expect(() => {
        validateDomain({ id: 'test' }, { throwOnError: true });
      }).toThrow();
    });
  });
});

describe('DomainRegistry', () => {
  it('valid custom domain creates registry', () => {
    const registry = new DomainRegistry(tavernDomain);
    expect(registry.id).toBe('tavern');
    expect(registry.hasRegion('小屋')).toBe(true);
    expect(registry.hasState('喝酒')).toBe(true);
  });

  it('invalid domain throws', () => {
    expect(() => {
      new DomainRegistry({ id: 'bad' });
    }).toThrow();
  });

  it('default campus registry works', () => {
    const campusDomain = require('../presets/campus');
    const registry = new DomainRegistry(campusDomain, { validate: false });
    expect(registry.id).toBe('campus');
    expect(registry.hasRegion('宿舍')).toBe(true);
    expect(registry.hasState('在上课')).toBe(true);
  });

  it('getFallbackRegion returns valid region', () => {
    const registry = new DomainRegistry(tavernDomain);
    expect(tavernDomain.regions).toContain(registry.getFallbackRegion());
  });

  it('getFallbackState returns valid state', () => {
    const registry = new DomainRegistry(tavernDomain);
    expect(Object.keys(tavernDomain.states)).toContain(registry.getFallbackState());
  });

  it('getStateCenter returns 4D vector', () => {
    const registry = new DomainRegistry(tavernDomain);
    const center = registry.getStateCenter('喝酒');
    expect(center).toBeDefined();
    expect(center.length).toBe(4);
  });
});

describe('Public API exports', () => {
  it('require("andy-engine/domain") works', async () => {
    const mod = await import('../domain/index.js');
    expect(mod.DomainRegistry).toBeDefined();
    expect(mod.validateDomain).toBeDefined();
    expect(mod.getDefaultDomain).toBeDefined();
  });

  it('require("andy-engine/domain/validate") works', async () => {
    const mod = await import('../src/domain/validateDomain.js');
    expect(mod.validateDomain).toBeDefined();
  });

  it('require("andy-engine/domain/registry") works', async () => {
    const mod = await import('../src/domain/DomainRegistry.js');
    expect(mod.DomainRegistry).toBeDefined();
  });

  it('require("andy-engine/presets/tavern") works', async () => {
    const mod = await import('../presets/tavern/index.js');
    expect(mod.id).toBe('tavern');
  });
});
