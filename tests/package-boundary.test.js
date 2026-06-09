/**
 * Package Boundary Audit
 *
 * 验证 npm pack 清单的正确性。
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync, readdirSync } from 'fs';
import path from 'path';

// 读取 package.json
const pkg = JSON.parse(readFileSync(path.join(process.cwd(), 'package.json'), 'utf-8'));

describe('Package Boundary', () => {
  describe('package.json metadata', () => {
    it('version is 0.2.0', () => {
      expect(pkg.version).toBe('0.2.0');
    });

    it('types points to sdk/types.d.ts', () => {
      expect(pkg.types).toBe('sdk/types.d.ts');
    });

    it('main points to index.js', () => {
      expect(pkg.main).toBe('index.js');
    });

    it('exports are complete', () => {
      expect(pkg.exports['.']).toBe('./index.js');
      expect(pkg.exports['./sdk']).toBe('./sdk/index.js');
      expect(pkg.exports['./domain']).toBe('./domain/index.js');
      expect(pkg.exports['./store']).toBe('./store/index.js');
      expect(pkg.exports['./presets/tavern']).toBe('./presets/tavern/index.js');
      expect(pkg.exports['./presets/campus']).toBe('./presets/campus/index.js');
    });

    it('all exports point to existing files', () => {
      for (const [key, value] of Object.entries(pkg.exports)) {
        const filePath = path.join(process.cwd(), value);
        expect(existsSync(filePath)).toBe(true);
      }
    });
  });

  describe('files whitelist', () => {
    it('files array exists', () => {
      expect(Array.isArray(pkg.files)).toBe(true);
    });

    it('includes required directories', () => {
      const required = ['index.js', 'agent/', 'core/', 'sdk/', 'domain/', 'presets/', 'config/'];
      for (const dir of required) {
        expect(pkg.files).toContain(dir);
      }
    });

    it('includes docs/DOMAIN.md', () => {
      expect(pkg.files).toContain('docs/DOMAIN.md');
    });

    it('does not include test directories', () => {
      expect(pkg.files).not.toContain('tests/');
      expect(pkg.files).not.toContain('experiments/');
      expect(pkg.files).not.toContain('demo/');
    });
  });

  describe('required files exist', () => {
    const requiredFiles = [
      'index.js',
      'sdk/types.d.ts',
      'domain/index.js',
      'domain/validateDomain.js',
      'domain/DomainRegistry.js',
      'presets/campus/index.js',
      'presets/tavern/index.js',
      'docs/DOMAIN.md',
      'README.md',
      'LICENSE',
    ];

    for (const file of requiredFiles) {
      it(`${file} exists`, () => {
        expect(existsSync(path.join(process.cwd(), file))).toBe(true);
      });
    }
  });

  describe('excluded files not in package', () => {
    const excludedFiles = [
      'AGENTS.md',
      'REFACTOR_PLAN.md',
      'tests/',
      'experiments/',
      'demo/',
      'scripts/',
      'test.js',
      'test_soa.js',
      'test_store.js',
    ];

    for (const file of excludedFiles) {
      it(`${file} not in files whitelist`, () => {
        // Check that excluded files are not in the files array
        const isExcluded = !pkg.files.some(f => f === file || f.startsWith(file));
        expect(isExcluded).toBe(true);
      });
    }
  });

  describe('scripts', () => {
    it('test script works', () => {
      expect(pkg.scripts.test).toBe('vitest run');
    });

    it('test:domain script works', () => {
      expect(pkg.scripts['test:domain']).toBeDefined();
    });

    it('no legacy test script', () => {
      expect(pkg.scripts['test:legacy']).toBeUndefined();
    });
  });

  describe('public exports smoke (require)', () => {
    it('require("andy-engine") works', async () => {
      const mod = await import('../index.js');
      expect(mod.default || mod).toBeDefined();
    });

    it('require("andy-engine/sdk") works', async () => {
      const mod = await import('../sdk/index.js');
      expect(mod.Character).toBeDefined();
    });

    it('require("andy-engine/domain") works', async () => {
      const mod = await import('../domain/index.js');
      expect(mod.DomainRegistry).toBeDefined();
      expect(mod.validateDomain).toBeDefined();
    });

    it('require("andy-engine/store") works', async () => {
      const mod = await import('../store/index.js');
      expect(mod.createStore).toBeDefined();
      expect(mod.createMemoryStore).toBeDefined();
    });

    it('require("andy-engine/presets/campus") works', async () => {
      const mod = await import('../presets/campus/index.js');
      expect(mod.id).toBe('campus');
    });

    it('require("andy-engine/presets/tavern") works', async () => {
      const mod = await import('../presets/tavern/index.js');
      expect(mod.id).toBe('tavern');
    });
  });

  describe('JS syntax check', () => {
    it('store/ files have valid syntax', () => {
      const storeDir = path.join(process.cwd(), 'store');
      const files = readdirSync(storeDir).filter(f => f.endsWith('.js'));
      for (const file of files) {
        const filePath = path.join(storeDir, file);
        try {
          require(filePath);
        } catch (e) {
          expect.fail(`${file}: ${e.message}`);
        }
      }
    });
  });
});
