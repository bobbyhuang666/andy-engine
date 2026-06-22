import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import path from 'path';

describe('Type Safety Smoke', () => {
  it('index.d.ts exists and is parseable', () => {
    const dtsPath = path.resolve(process.cwd(), 'index.d.ts');
    expect(existsSync(dtsPath)).toBe(true);
    const content = readFileSync(dtsPath, 'utf-8');
    expect(content.length).toBeGreaterThan(0);
  });

  it('index.d.ts exports AndyEngine class', () => {
    const dtsPath = path.resolve(process.cwd(), 'index.d.ts');
    const content = readFileSync(dtsPath, 'utf-8');
    expect(content).toContain('declare class AndyEngine');
    expect(content).toContain('export = AndyEngine');
  });

  it('index.d.ts defines expected interfaces', () => {
    const dtsPath = path.resolve(process.cwd(), 'index.d.ts');
    const content = readFileSync(dtsPath, 'utf-8');
    const expectedInterfaces = [
      'AndyEngineConfig',
      'AgentConfig',
      'TickResult',
      'WorldContext',
      'DomainConfig',
      'GroundingPackage',
      'ConsistencyCheckResult',
      'CanonEvent',
      'WorldFact',
      'AgentSnapshot',
      'WorldSnapshot',
    ];
    for (const iface of expectedInterfaces) {
      expect(content).toContain(`interface ${iface}`);
    }
  });

  it('index.d.ts defines key AndyEngine methods', () => {
    const dtsPath = path.resolve(process.cwd(), 'index.d.ts');
    const content = readFileSync(dtsPath, 'utf-8');
    const expectedMethods = [
      'createCharacter',
      'getNarrative',
      'getWorldContext',
      'getGroundingPackage',
      'checkConsistency',
      'tick',
      'snapshot',
      'advanceTo',
    ];
    for (const method of expectedMethods) {
      expect(content).toContain(method);
    }
  });

  it('tsconfig.json exists and is valid JSON', () => {
    const tsconfigPath = path.resolve(process.cwd(), 'tsconfig.json');
    expect(existsSync(tsconfigPath)).toBe(true);
    const content = readFileSync(tsconfigPath, 'utf-8');
    const config = JSON.parse(content);
    expect(config.compilerOptions.allowJs).toBe(true);
    expect(config.compilerOptions.noEmit).toBe(true);
    expect(config.compilerOptions.checkJs).toBe(false);
    expect(config.compilerOptions.target).toBe('ES2022');
    expect(config.compilerOptions.module).toBe('commonjs');
  });
});
