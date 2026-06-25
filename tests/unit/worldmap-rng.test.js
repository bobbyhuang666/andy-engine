import { readFileSync } from 'fs';
import { createRequire } from 'module';
import { WorldMap } from '../../src/spatial/WorldMap.js';
import { RNG } from '../../src/shared/rng.js';

describe('WorldMap RNG determinism', () => {
  const regions = [
    { name: 'plaza', shape: 'rect', x: 0, y: 0, w: 200, h: 200 },
    { name: 'garden', shape: 'circle', cx: 400, cy: 400, radius: 80 },
  ];

  it('same seed → regionToCoords() produces identical results across 100 calls', () => {
    const results = [];
    for (let i = 0; i < 2; i++) {
      const rng = new RNG(42);
      const map = new WorldMap({ width: 500, height: 500, regions, rng });
      const run = [];
      for (let j = 0; j < 100; j++) {
        run.push(map.regionToCoords('unknown_region'));
      }
      results.push(run);
    }
    for (let j = 0; j < 100; j++) {
      expect(results[0][j].x).toBe(results[1][j].x);
      expect(results[0][j].y).toBe(results[1][j].y);
    }
  });

  it('same seed → randomPoint() rect produces identical results across 100 calls', () => {
    const results = [];
    for (let i = 0; i < 2; i++) {
      const rng = new RNG(123);
      const map = new WorldMap({ width: 500, height: 500, regions, rng });
      const run = [];
      for (let j = 0; j < 100; j++) {
        run.push(map.regionToCoords('plaza'));
      }
      results.push(run);
    }
    for (let j = 0; j < 100; j++) {
      expect(results[0][j].x).toBe(results[1][j].x);
      expect(results[0][j].y).toBe(results[1][j].y);
    }
  });

  it('same seed → randomPoint() circle produces identical results across 100 calls', () => {
    const results = [];
    for (let i = 0; i < 2; i++) {
      const rng = new RNG(999);
      const map = new WorldMap({ width: 500, height: 500, regions, rng });
      const run = [];
      for (let j = 0; j < 100; j++) {
        run.push(map.regionToCoords('garden'));
      }
      results.push(run);
    }
    for (let j = 0; j < 100; j++) {
      expect(results[0][j].x).toBe(results[1][j].x);
      expect(results[0][j].y).toBe(results[1][j].y);
    }
  });

  it('no seed → ctor auto-seeds RNG(0) without crashing', () => {
    const map = new WorldMap({ width: 500, height: 500, regions });
    expect(() => {
      for (let j = 0; j < 50; j++) {
        map.regionToCoords('plaza');
        map.regionToCoords('garden');
        map.regionToCoords('unknown');
      }
    }).not.toThrow();
  });

  it('source scan: no Math.random() remains in WorldMap (rng injected per RFC)', () => {
    const require = createRequire(import.meta.url);
    const src = readFileSync(require.resolve('../../src/spatial/WorldMap.js'), 'utf8');
    const allRandom = src.match(/Math\.random\(\)/g) || [];
    // RFC RNG_STRICTNESS Wave 2：核心模拟路径 Math.random 归零，rng 由 ctor 注入
    expect(allRandom.length).toBe(0);
  });
});
