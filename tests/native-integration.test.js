import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';

const factoryPath = path.resolve(__dirname, '../src/agent/lifecycle/AgentSubsystemFactory.js');
const factorySource = fs.readFileSync(factoryPath, 'utf8');

describe('Native integration: AgentSubsystemFactory uses .native wrappers', () => {
  it('factory source always requires EmotionVector.native', () => {
    // Should NOT contain the old conditional pattern
    expect(factorySource).not.toMatch(/ANDY_USE_NATIVE.*EmotionVector/);
    // Should require the .native wrapper
    expect(factorySource).toContain("require('../psychology/EmotionVector.native')");
  });

  it('factory source always requires NeedsSystem.native', () => {
    expect(factorySource).not.toMatch(/ANDY_USE_NATIVE.*NeedsSystem/);
    expect(factorySource).toContain("require('../psychology/NeedsSystem.native')");
  });

  it('factory does NOT require plain EmotionVector or NeedsSystem', () => {
    // Ensure no direct require of the non-.native versions
    expect(factorySource).not.toContain("require('../psychology/EmotionVector')");
    expect(factorySource).not.toContain("require('../psychology/NeedsSystem')");
  });
});

describe('Native integration: .native wrappers delegate to nativeLoader', () => {
  it('EmotionVector.native.js uses loadNativeModule', () => {
    const src = fs.readFileSync(
      path.resolve(__dirname, '../src/agent/psychology/EmotionVector.native.js'),
      'utf8',
    );
    expect(src).toContain("require('../../shared/nativeLoader')");
    expect(src).toContain('loadNativeModule');
  });

  it('NeedsSystem.native.js uses loadNativeModule', () => {
    const src = fs.readFileSync(
      path.resolve(__dirname, '../src/agent/psychology/NeedsSystem.native.js'),
      'utf8',
    );
    expect(src).toContain("require('../../shared/nativeLoader')");
    expect(src).toContain('loadNativeModule');
  });
});

describe('Native integration: runtime behavior via nativeLoader', () => {
  it('unset ANDY_USE_NATIVE: nativeLoader returns disabled', async () => {
    delete process.env.ANDY_USE_NATIVE;
    const { getNativeMode, NATIVE_MODE } = await import('../src/shared/nativeLoader.js');
    expect(getNativeMode()).toBe(NATIVE_MODE.DISABLED);
  });

  it('ANDY_USE_NATIVE=true: nativeLoader returns required', async () => {
    process.env.ANDY_USE_NATIVE = 'true';
    const { getNativeMode, NATIVE_MODE } = await import('../src/shared/nativeLoader.js');
    expect(getNativeMode()).toBe(NATIVE_MODE.REQUIRED);
    delete process.env.ANDY_USE_NATIVE;
  });

  it('ANDY_USE_NATIVE=1: nativeLoader returns required', async () => {
    process.env.ANDY_USE_NATIVE = '1';
    const { getNativeMode, NATIVE_MODE } = await import('../src/shared/nativeLoader.js');
    expect(getNativeMode()).toBe(NATIVE_MODE.REQUIRED);
    delete process.env.ANDY_USE_NATIVE;
  });

  it('ANDY_USE_NATIVE=optional: nativeLoader returns optional', async () => {
    process.env.ANDY_USE_NATIVE = 'optional';
    const { getNativeMode, NATIVE_MODE } = await import('../src/shared/nativeLoader.js');
    expect(getNativeMode()).toBe(NATIVE_MODE.OPTIONAL);
    delete process.env.ANDY_USE_NATIVE;
  });
});

describe('Native integration: native/index.js error message', () => {
  it('does not reference native/README.md', () => {
    const src = fs.readFileSync(
      path.resolve(__dirname, '../native/index.js'),
      'utf8',
    );
    expect(src).not.toContain('README.md');
  });

  it('contains helpful build instructions', () => {
    const src = fs.readFileSync(
      path.resolve(__dirname, '../native/index.js'),
      'utf8',
    );
    expect(src).toContain('Build the native module under native/');
  });
});

describe('Native integration: AndyEngine warn-once for optional mode', () => {
  let originalEnv;

  beforeEach(() => {
    originalEnv = { ...process.env };
    for (const key of Object.keys(require.cache)) {
      if (
        key.includes('nativeLoader') ||
        key.includes('.native.js') ||
        key.includes('AgentSubsystemFactory') ||
        key.includes('agent/Agent.js') ||
        key.endsWith('/index.js')
      ) {
        delete require.cache[key];
      }
    }
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('ANDY_USE_NATIVE=optional: warns exactly once for new AndyEngine()', async () => {
    process.env.ANDY_USE_NATIVE = 'optional';
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { default: AndyEngine } = await import('../index.js');
    const engine = new AndyEngine();
    engine.addAgent({ id: 'test', name: 'Test' });
    engine.tick();
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('falling back to JS'),
    );
    warnSpy.mockRestore();
  });

  it('ANDY_USE_NATIVE=true: throws if no binding', () => {
    process.env.ANDY_USE_NATIVE = 'true';
    expect(() => require('../index.js')).toThrow(/native/i);
  });

  it('ANDY_USE_NATIVE=1: throws if no binding', () => {
    process.env.ANDY_USE_NATIVE = '1';
    expect(() => require('../index.js')).toThrow(/native/i);
  });

  it('unset ANDY_USE_NATIVE: no warning, works normally', async () => {
    delete process.env.ANDY_USE_NATIVE;
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { default: AndyEngine } = await import('../index.js');
    const engine = new AndyEngine();
    engine.addAgent({ id: 'test', name: 'Test' });
    engine.tick();
    expect(warnSpy).not.toHaveBeenCalled();
    warnSpy.mockRestore();
  });
});
