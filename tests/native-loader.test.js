import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import path from 'path';
import fs from 'fs';
import os from 'os';

const NATIVE_PATH = path.resolve(__dirname, '..', 'native');

describe('nativeLoader', () => {
  let originalEnv;

  beforeEach(() => {
    originalEnv = { ...process.env };
  });

  afterEach(() => {
    process.env = originalEnv;
    // Clear require cache for nativeLoader and native wrappers
    for (const key of Object.keys(require.cache)) {
      if (key.includes('nativeLoader') || key.includes('.native.js')) {
        delete require.cache[key];
      }
    }
  });

  describe('getNativeMode()', () => {
    it('unset → disabled', async () => {
      delete process.env.ANDY_USE_NATIVE;
      const { getNativeMode } = await import('../../src/shared/nativeLoader.js');
      expect(getNativeMode()).toBe('disabled');
    });

    it('0 → disabled', async () => {
      process.env.ANDY_USE_NATIVE = '0';
      const { getNativeMode } = await import('../../src/shared/nativeLoader.js');
      expect(getNativeMode()).toBe('disabled');
    });

    it('1 → required', async () => {
      process.env.ANDY_USE_NATIVE = '1';
      const { getNativeMode } = await import('../../src/shared/nativeLoader.js');
      expect(getNativeMode()).toBe('required');
    });

    it('true → required', async () => {
      process.env.ANDY_USE_NATIVE = 'true';
      const { getNativeMode } = await import('../../src/shared/nativeLoader.js');
      expect(getNativeMode()).toBe('required');
    });

    it('optional → optional', async () => {
      process.env.ANDY_USE_NATIVE = 'optional';
      const { getNativeMode } = await import('../../src/shared/nativeLoader.js');
      expect(getNativeMode()).toBe('optional');
    });

    it('custom env object works', async () => {
      const { getNativeMode } = await import('../../src/shared/nativeLoader.js');
      expect(getNativeMode({ ANDY_USE_NATIVE: '1' })).toBe('required');
      expect(getNativeMode({})).toBe('disabled');
    });
  });

  describe('loadNativeModule()', () => {
    it('disabled mode: does not throw, returns available: false', async () => {
      delete process.env.ANDY_USE_NATIVE;
      const { loadNativeModule } = await import('../../src/shared/nativeLoader.js');
      const result = loadNativeModule({ mode: 'disabled' });
      expect(result.available).toBe(false);
      expect(result.native).toBeNull();
      expect(result.mode).toBe('disabled');
      expect(result.error).toBeNull();
    });

    it('required mode with missing path: throws with clear message', async () => {
      const { loadNativeModule } = await import('../../src/shared/nativeLoader.js');
      expect(() => {
        loadNativeModule({ mode: 'required', nativePath: '/tmp/nonexistent-native-binding-xyz' });
      }).toThrow(/native module load failed/);
    });

    it('required mode error contains unset ANDY_USE_NATIVE advice', async () => {
      const { loadNativeModule } = await import('../../src/shared/nativeLoader.js');
      try {
        loadNativeModule({ mode: 'required', nativePath: '/tmp/nonexistent-native-binding-xyz' });
        expect.fail('should have thrown');
      } catch (e) {
        expect(e.message).toContain('unset ANDY_USE_NATIVE');
      }
    });

    it('optional mode with missing path: does not throw, returns available: false', async () => {
      const { loadNativeModule } = await import('../../src/shared/nativeLoader.js');
      const result = loadNativeModule({
        mode: 'optional',
        nativePath: '/tmp/nonexistent-native-binding-xyz',
        silent: true,
      });
      expect(result.available).toBe(false);
      expect(result.native).toBeNull();
      expect(result.mode).toBe('optional');
      expect(result.error).toBeInstanceOf(Error);
    });

    it('optional mode warns to console when not silent', async () => {
      const { loadNativeModule } = await import('../../src/shared/nativeLoader.js');
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      loadNativeModule({
        mode: 'optional',
        nativePath: '/tmp/nonexistent-native-binding-xyz',
        silent: false,
      });
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('native module load failed')
      );
      warnSpy.mockRestore();
    });

    it('successful fake module load', async () => {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'native-test-'));
      const fakeIndex = path.join(tmpDir, 'index.js');
      fs.writeFileSync(fakeIndex, 'module.exports = { fake: true };');

      const { loadNativeModule } = await import('../../src/shared/nativeLoader.js');
      const result = loadNativeModule({ mode: 'required', nativePath: tmpDir });
      expect(result.available).toBe(true);
      expect(result.native.fake).toBe(true);
      expect(result.mode).toBe('required');
      expect(result.error).toBeNull();

      fs.rmSync(tmpDir, { recursive: true, force: true });
    });
  });

  describe('resolveProjectNativePath()', () => {
    it('resolves to project-root/native', async () => {
      const { resolveProjectNativePath } = await import('../../src/shared/nativeLoader.js');
      const resolved = resolveProjectNativePath();
      expect(resolved).toBe(NATIVE_PATH);
    });
  });
});

describe('package boundary: native in npm pack', () => {
  it('package.json.files includes native/', async () => {
    const pkg = JSON.parse(fs.readFileSync(path.resolve(__dirname, '..', 'package.json'), 'utf8'));
    expect(pkg.files).toContain('native/');
  });

  it('npm pack --dry-run includes native/index.js', async () => {
    const { execSync } = await import('child_process');
    const output = execSync('npm pack --dry-run 2>&1', {
      cwd: path.resolve(__dirname, '..'),
      encoding: 'utf8',
    });
    expect(output).toContain('native/index.js');
  });

  it('npm pack --dry-run does not include native/target/', async () => {
    const { execSync } = await import('child_process');
    const output = execSync('npm pack --dry-run 2>&1', {
      cwd: path.resolve(__dirname, '..'),
      encoding: 'utf8',
    });
    expect(output).not.toContain('native/target/');
  });
});
