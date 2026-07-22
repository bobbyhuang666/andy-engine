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
      'AgentHandle',
      'WorldSnapshot',
    ];
    for (const iface of expectedInterfaces) {
      expect(content).toContain(`interface ${iface}`);
    }
  });

  it('getAllAgents returns an array, not a Map', () => {
    const dtsPath = path.resolve(process.cwd(), 'index.d.ts');
    const content = readFileSync(dtsPath, 'utf-8');
    expect(content).toContain('getAllAgents(): AgentHandle[]');
    expect(content).not.toMatch(/getAllAgents\(\):\s*Map</);
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

  it('P1-3: index.d.ts exposes FactScope.INTERNAL (3-value union, not 2-value)', () => {
    const dtsPath = path.resolve(process.cwd(), 'index.d.ts');
    const content = readFileSync(dtsPath, 'utf-8');
    // Must contain all three scopes, and must NOT be the legacy 2-value form.
    expect(content).toMatch(/'public' \| 'local' \| 'internal'/);
    expect(content).not.toMatch(/'public' \| 'local';/);
  });

  it('P1-3: facts/index.d.ts exposes FactScope.INTERNAL', () => {
    const dtsPath = path.resolve(process.cwd(), 'facts/index.d.ts');
    expect(existsSync(dtsPath)).toBe(true);
    const content = readFileSync(dtsPath, 'utf-8');
    expect(content).toMatch(/'public' \| 'local' \| 'internal'/);
    expect(content).toContain('FactScope');
  });

  it('R52: store/index.d.ts is importable by strict consumers without Node globals', () => {
    const dtsPath = path.resolve(process.cwd(), 'store/index.d.ts');
    expect(existsSync(dtsPath)).toBe(true);
    const content = readFileSync(dtsPath, 'utf-8');
    expect(content).toContain('declare const AndyStore');
    expect(content).toContain('export = AndyStore');
    expect(content).not.toMatch(/export =\s*\{/);
    expect(content).not.toMatch(/\bBuffer\b/);
  });

  it('R55: store/index.d.ts exposes runtime-backed store method names', () => {
    const dtsPath = path.resolve(process.cwd(), 'store/index.d.ts');
    const content = readFileSync(dtsPath, 'utf-8');
    expect(content).toContain('loadLatest(): SnapshotData | null');
    expect(content).toContain('loadAt(tick: number): SnapshotData | null');
    expect(content).toContain('get(key: string): string | null');
    expect(content).toContain('set(key: string, value: string): void');
    expect(content).toContain('createStore(options?: StoreOptions): SimulationStore');
    expect(content).toContain('createMemoryStore(): SQLiteStore | MemoryStore');
    expect(content).toContain('save(world: any, metadata?: any): any');
    expect(content).toContain('load(snapshotId: string, config?: any): any');
    expect(content).toContain('listSnapshots(): any[]');
  });
});
