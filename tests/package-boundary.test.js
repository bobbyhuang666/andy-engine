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
    it('version is 2.0.0-alpha.1', () => {
      expect(pkg.version).toBe('2.0.0-alpha.1');
    });

    it('types points to index.d.ts', () => {
      expect(pkg.types).toBe('index.d.ts');
    });

    it('main points to index.js', () => {
      expect(pkg.main).toBe('index.js');
    });

    it('exports are complete', () => {
      expect(pkg.exports['.'].require).toBe('./index.js');
      expect(pkg.exports['./sdk']).toBe('./sdk/index.js');
      expect(pkg.exports['./domain']).toBe('./domain/index.js');
      expect(pkg.exports['./domain/validate']).toBe('./src/domain/validateDomain.js');
      expect(pkg.exports['./domain/registry']).toBe('./src/domain/DomainRegistry.js');
      expect(pkg.exports['./facts']).toBe('./facts/index.js');
      expect(pkg.exports['./store']).toBe('./store/index.js');
      expect(pkg.exports['./config/defaults']).toBe('./src/config/defaults.js');
      expect(pkg.exports['./presets/tavern']).toBe('./presets/tavern/index.js');
      expect(pkg.exports['./presets/campus']).toBe('./presets/campus/index.js');
    });

    it('all exports point to existing files', () => {
      for (const [key, value] of Object.entries(pkg.exports)) {
        const entry = typeof value === 'string' ? value : (value.require || value.types);
        const filePath = path.join(process.cwd(), entry);
        expect(existsSync(filePath)).toBe(true);
      }
    });
  });

  describe('files whitelist', () => {
    it('files array exists', () => {
      expect(Array.isArray(pkg.files)).toBe(true);
    });

    it('includes required public and canonical directories', () => {
      const required = ['index.js', 'agent/', 'sdk/', 'domain/', 'facts/', 'store/', 'presets/', 'src/'];
      for (const dir of required) {
        expect(pkg.files).toContain(dir);
      }
    });

    it('does not include retired top-level implementation directories', () => {
      const retired = ['core/', 'effects/', 'social/', 'spatial/', 'config/'];
      for (const dir of retired) {
        expect(pkg.files).not.toContain(dir);
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
      'index.d.ts',
      'sdk/types.d.ts',
      'domain/index.js',
      'src/domain/validateDomain.js',
      'src/domain/DomainRegistry.js',
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

    it('require("andy-engine/domain/validate") works', async () => {
      const mod = await import('../src/domain/validateDomain.js');
      expect(mod.validateDomain).toBeDefined();
    });

    it('require("andy-engine/domain/registry") works', async () => {
      const mod = await import('../src/domain/DomainRegistry.js');
      expect(mod.DomainRegistry).toBeDefined();
    });

    it('require("andy-engine/facts") works', async () => {
      const mod = await import('../facts/index.js');
      expect(mod.WorldFactStore).toBeDefined();
      expect(mod.FactProvider).toBeDefined();
    });

    it('require("andy-engine/store") works', async () => {
      const mod = await import('../store/index.js');
      expect(mod.createStore).toBeDefined();
      expect(mod.createMemoryStore).toBeDefined();
    });

    it('require("andy-engine/config/defaults") works', async () => {
      const mod = await import('../src/config/defaults.js');
      expect(mod.ANDY_DEFAULTS).toBeDefined();
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

  // ═══════════════════════════════════════════
  // Phase 3: Public/Private Contract Split
  // ═══════════════════════════════════════════

  describe('internal modules not exported', () => {
    const exportKeys = Object.keys(pkg.exports);

    it('core/ modules are not in package exports', () => {
      const coreModules = [
        'core/Simulator', 'core/World', 'core/EventDispatcher',
        'core/RNG', 'core/WorldPressure', 'core/EmotionEffectClassifier',
        'core/EmotionSignalBuffer', 'core/AndyBridge', 'core/AndyTownAdapter',
        'core/StoryGenerator',
      ];
      for (const mod of coreModules) {
        const hasExport = exportKeys.some(k => k.includes(mod));
        expect(hasExport, `${mod} should not be in exports`).toBe(false);
      }
    });

    it('agent/ modules are not in package exports', () => {
      const agentModules = [
        'agent/Agent', 'agent/BehaviorField', 'agent/BehaviorLabeler',
        'agent/StateMachine', 'agent/EmotionVector', 'agent/NeedsSystem',
        'agent/PersonalMemory', 'agent/Personality', 'agent/Appraisal',
        'agent/EmotionRegulation', 'agent/IntrinsicMotivation',
        'agent/ProceduralMemory', 'agent/Schedule', 'agent/FutureTendencyTracker',
        'agent/LocationMeaningInfluence',
      ];
      for (const mod of agentModules) {
        const hasExport = exportKeys.some(k => k.includes(mod));
        expect(hasExport, `${mod} should not be in exports`).toBe(false);
      }
    });

    it('effects/ modules are not in package exports', () => {
      const hasEffectExport = exportKeys.some(k => k.includes('effects/'));
      expect(hasEffectExport).toBe(false);
    });

    it('social/ modules are not in package exports', () => {
      const hasSocialExport = exportKeys.some(k => k.includes('social/'));
      expect(hasSocialExport).toBe(false);
    });

    it('spatial/ modules are not in package exports', () => {
      const hasSpatialExport = exportKeys.some(k => k.includes('spatial/'));
      expect(hasSpatialExport).toBe(false);
    });
  });

  describe('compatibility wrappers retired', () => {
    it('core/EventEffectPipeline.js wrapper has been removed', () => {
      const wrapperPath = path.join(process.cwd(), 'core/EventEffectPipeline.js');
      expect(existsSync(wrapperPath)).toBe(false);
    });

    it('core/RNG.js wrapper has been removed', () => {
      const wrapperPath = path.join(process.cwd(), 'core/RNG.js');
      expect(existsSync(wrapperPath)).toBe(false);
    });

    it('core/WorldviewConstraints.js wrapper has been removed', () => {
      const wrapperPath = path.join(process.cwd(), 'core/WorldviewConstraints.js');
      expect(existsSync(wrapperPath)).toBe(false);
    });

    it('effects/EventEffectPipeline.js wrapper has been removed', () => {
      const wrapperPath = path.join(process.cwd(), 'effects', 'EventEffectPipeline.js');
      expect(existsSync(wrapperPath)).toBe(false);
    });

    it('src/effects/EventEffectPipeline.js is the canonical implementation', () => {
      const canonicalPath = path.join(process.cwd(), 'src', 'effects', 'EventEffectPipeline.js');
      expect(existsSync(canonicalPath)).toBe(true);
      const content = readFileSync(canonicalPath, 'utf-8');
      const lineCount = content.split('\n').filter(l => l.trim().length > 0).length;
      expect(lineCount).toBeGreaterThan(10);
    });

    it('src/shared/rng.js is the canonical RNG implementation', () => {
      const canonicalPath = path.join(process.cwd(), 'src', 'shared', 'rng.js');
      expect(existsSync(canonicalPath)).toBe(true);
    });

    it('src/domain/ForbiddenTerms.js is the canonical ForbiddenTerms implementation', () => {
      const canonicalPath = path.join(process.cwd(), 'src', 'domain', 'ForbiddenTerms.js');
      expect(existsSync(canonicalPath)).toBe(true);
    });
  });

  describe('SDK boundary', () => {
    const sdkDir = path.join(process.cwd(), 'sdk');
    const sdkFiles = readdirSync(sdkDir).filter(f => f.endsWith('.js') && f !== 'types.d.ts');

    function getImports(filePath) {
      const content = readFileSync(filePath, 'utf-8');
      const requires = content.match(/require\(['"]([^'"]+)['"]\)/g) || [];
      return requires.map(r => {
        const match = r.match(/require\(['"]([^'"]+)['"]\)/);
        return match ? match[1] : '';
      });
    }

    // After Phase 11 migration, old sdk/ files are thin re-export wrappers.
    // Only check the canonical src/sdk/ files for boundary violations.
    const srcSdkDir = path.join(process.cwd(), 'src', 'sdk');
    const srcSdkFiles = existsSync(srcSdkDir)
      ? readdirSync(srcSdkDir).filter(f => f.endsWith('.js') && f !== 'types.d.ts' && f !== 'index.js' && f !== 'AndyEngine.js')
      : [];

    function getSrcSdkImports(file) {
      const filePath = path.join(srcSdkDir, file);
      return getImports(filePath);
    }

    it('src/sdk/ does not import core/ directly', () => {
      for (const file of srcSdkFiles) {
        const imports = getSrcSdkImports(file);
        const coreImports = imports.filter(i => i.includes('/core/') && !i.includes('/src/'));
        expect(
          coreImports,
          `${file} should not import core/ modules, found: ${coreImports.join(', ')}`
        ).toEqual([]);
      }
    });

    it('src/sdk/ does not import agent/ directly', () => {
      for (const file of srcSdkFiles) {
        const imports = getSrcSdkImports(file);
        const agentImports = imports.filter(i => i.includes('/agent/'));
        expect(
          agentImports,
          `${file} should not import agent/ modules, found: ${agentImports.join(', ')}`
        ).toEqual([]);
      }
    });

    it('src/sdk/ does not import effects/ directly', () => {
      for (const file of srcSdkFiles) {
        const imports = getSrcSdkImports(file);
        const effectImports = imports.filter(i => i.includes('/effects/'));
        expect(
          effectImports,
          `${file} should not import effects/ modules, found: ${effectImports.join(', ')}`
        ).toEqual([]);
      }
    });

    it('src/sdk/ does not import social/ directly', () => {
      for (const file of srcSdkFiles) {
        const imports = getSrcSdkImports(file);
        const socialImports = imports.filter(i => i.includes('/social/') && !i.includes('/src/social/'));
        expect(
          socialImports,
          `${file} should not import social/ modules, found: ${socialImports.join(', ')}`
        ).toEqual([]);
      }
    });

    it('src/sdk/ does not import spatial/ directly', () => {
      for (const file of srcSdkFiles) {
        const imports = getSrcSdkImports(file);
        const spatialImports = imports.filter(i => i.includes('/spatial/') && !i.includes('/src/spatial/'));
        expect(
          spatialImports,
          `${file} should not import spatial/ modules, found: ${spatialImports.join(', ')}`
        ).toEqual([]);
      }
    });

    it('src/sdk/ NarrativeBuilder allowed imports are domain/, facts/, and narrative/', () => {
      const nbPath = path.join(srcSdkDir, 'NarrativeBuilder.js');
      if (!existsSync(nbPath)) return;
      const imports = getImports(nbPath);
      const internalImports = imports.filter(i => i.startsWith('../'));
      const disallowed = internalImports.filter(
        i => !i.startsWith('../domain/') && !i.startsWith('../../facts') && !i.startsWith('../narrative/')
      );
      expect(
        disallowed,
        `NarrativeBuilder has disallowed imports: ${disallowed.join(', ')}`
      ).toEqual([]);
    });

    it('src/sdk/ Character and Andy only import index.js (AndyEngine) as engine seam', () => {
      const engineSeamFiles = ['Character.js', 'Andy.js'];
      for (const file of engineSeamFiles) {
        const filePath = path.join(srcSdkDir, file);
        if (!existsSync(filePath)) continue;
        const imports = getImports(filePath);
        const internalImports = imports.filter(i => i.startsWith('../../'));
        const disallowed = internalImports.filter(i => i !== '../../index.js' && i !== '../../index');
        expect(
          disallowed,
          `${file} should only import ../../index.js as engine seam, found: ${disallowed.join(', ')}`
        ).toEqual([]);
      }
    });
  });
});
