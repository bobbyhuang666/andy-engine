/**
 * 空间引擎评估实验
 *
 * 4 个实验：
 *   S1: 性能基准 — 不同 agent 数量的 tick 耗时
 *   S2: 交互模式对比 — 区域标签 vs 连续坐标
 *   S3: 关系涌现 — 连续坐标下 10 天模拟
 *   S4: 空间分布 — agent 坐标聚集度分析
 */

const path = require('path');
const fs = require('fs');
const AndyEngine = require(path.join(__dirname, '..', '..', 'index'));

const OUTPUT_DIR = path.join(__dirname, 'output');
if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });

// ═══════════════════════════════════════════
// 工具函数
// ═══════════════════════════════════════════

function makeAgentDefs(count, schedule) {
  const mbtis = ['ENFJ', 'INFP', 'INTP', 'ESFP', 'ISTJ', 'ENTJ', 'ISFJ', 'ENFP', 'INFJ', 'ESTP'];
  const regions = ['图书馆', '食堂', '教学楼', '操场', '宿舍', '咖啡店', '校园广场', '便利店'];
  const defs = [];
  for (let i = 0; i < count; i++) {
    defs.push({
      id: `a${i}`,
      name: `Agent${i}`,
      mbti: mbtis[i % mbtis.length],
      schedule: schedule || (i % 3 === 0 ? 'student' : i % 3 === 1 ? 'worker' : 'freelancer'),
      initialPosition: regions[i % regions.length],
    });
  }
  return defs;
}

// ═══════════════════════════════════════════
// S1: 性能基准
// ═══════════════════════════════════════════

function runS1() {
  console.log('\n═══ S1: 性能基准 ═══\n');

  const sizes = [10, 20, 50, 100, 200];
  const ticks = 100;
  const results = [];

  for (const n of sizes) {
    // 区域模式
    const engineRegion = new AndyEngine({
      startTime: new Date('2025-06-01T10:00:00'),
      weather: 'sunny',
    });
    for (const def of makeAgentDefs(n)) engineRegion.createCharacter(def);

    const t0 = Date.now();
    for (let i = 0; i < ticks; i++) engineRegion.tick();
    const regionMs = Date.now() - t0;

    // 连续坐标模式
    const engineSpatial = new AndyEngine({
      startTime: new Date('2025-06-01T10:00:00'),
      weather: 'sunny',
      spatial: 'continuous',
    });
    for (const def of makeAgentDefs(n)) engineSpatial.createCharacter(def);

    const t1 = Date.now();
    for (let i = 0; i < ticks; i++) engineSpatial.tick();
    const spatialMs = Date.now() - t1;

    const row = {
      agents: n,
      region_ms: regionMs,
      region_per_tick: (regionMs / ticks).toFixed(2),
      spatial_ms: spatialMs,
      spatial_per_tick: (spatialMs / ticks).toFixed(2),
      overhead_pct: (((spatialMs - regionMs) / regionMs) * 100).toFixed(1),
    };
    results.push(row);
    console.log(`  ${n} agents: region=${row.region_per_tick}ms/tick, spatial=${row.spatial_per_tick}ms/tick, overhead=${row.overhead_pct}%`);
  }

  fs.writeFileSync(path.join(OUTPUT_DIR, 's1_performance.json'), JSON.stringify(results, null, 2));
  return results;
}

// ═══════════════════════════════════════════
// S2: 交互模式对比
// ═══════════════════════════════════════════

function runS2() {
  console.log('\n═══ S2: 交互模式对比 ═══\n');

  const N = 20;
  const TICKS = 288; // 1 天

  // 区域模式
  const engineR = new AndyEngine({
    startTime: new Date('2025-06-01T10:00:00'),
    weather: 'sunny',
  });
  for (const def of makeAgentDefs(N)) engineR.createCharacter(def);

  // 连续坐标模式
  const engineS = new AndyEngine({
    startTime: new Date('2025-06-01T10:00:00'),
    weather: 'sunny',
    spatial: 'continuous',
  });
  for (const def of makeAgentDefs(N)) engineS.createCharacter(def);

  const regionEncounters = [];
  const spatialEncounters = [];

  for (let t = 0; t < TICKS; t++) {
    const rR = engineR.tick();
    const rS = engineS.tick();
    regionEncounters.push(rR.phase.interaction?.eventCount || 0);
    spatialEncounters.push(rS.phase.interaction?.eventCount || 0);
  }

  const sum = arr => arr.reduce((a, b) => a + b, 0);
  const avg = arr => (sum(arr) / arr.length).toFixed(1);

  // 统计交互事件的配对分布
  const regionRels = new Map();
  for (const [id] of engineR.world.agents) {
    for (const rel of engineR.world.socialGraph.getRelationships(id)) {
      const key = [id, rel.partner].sort().join('-');
      regionRels.set(key, rel);
    }
  }

  const spatialRels = new Map();
  for (const [id] of engineS.world.agents) {
    for (const rel of engineS.world.socialGraph.getRelationships(id)) {
      const key = [id, rel.partner].sort().join('-');
      spatialRels.set(key, rel);
    }
  }

  // 关系强度分布
  function strengthDistribution(relMap) {
    const dist = { stranger: 0, acquaintance: 0, friend: 0, close_friend: 0 };
    for (const [, rel] of relMap) {
      dist[rel.type] = (dist[rel.type] || 0) + 1;
    }
    return dist;
  }

  const result = {
    config: { agents: N, ticks: TICKS, sim_days: 1 },
    region: {
      total_encounters: sum(regionEncounters),
      avg_per_tick: avg(regionEncounters),
      relationships: regionRels.size,
      distribution: strengthDistribution(regionRels),
    },
    spatial: {
      total_encounters: sum(spatialEncounters),
      avg_per_tick: avg(spatialEncounters),
      relationships: spatialRels.size,
      distribution: strengthDistribution(spatialRels),
    },
  };

  console.log('  区域模式:');
  console.log(`    总交互: ${result.region.total_encounters}, 每tick: ${result.region.avg_per_tick}`);
  console.log(`    关系数: ${result.region.relationships}, 分布:`, result.region.distribution);
  console.log('  连续坐标:');
  console.log(`    总交互: ${result.spatial.total_encounters}, 每tick: ${result.spatial.avg_per_tick}`);
  console.log(`    关系数: ${result.spatial.relationships}, 分布:`, result.spatial.distribution);

  fs.writeFileSync(path.join(OUTPUT_DIR, 's2_interaction_comparison.json'), JSON.stringify(result, null, 2));
  return result;
}

// ═══════════════════════════════════════════
// S3: 关系涌现（连续坐标，10 天）
// ═══════════════════════════════════════════

function runS3() {
  console.log('\n═══ S3: 关系涌现（连续坐标，10 天） ═══\n');

  const N = 20;
  const TICKS = 2880; // 10 天

  const engine = new AndyEngine({
    startTime: new Date('2025-06-01T08:00:00'),
    weather: 'sunny',
    spatial: 'continuous',
  });
  for (const def of makeAgentDefs(N)) engine.createCharacter(def);

  const snapshots = [];
  const t0 = Date.now();

  for (let t = 0; t < TICKS; t++) {
    engine.tick();

    // 每天快照
    if ((t + 1) % 288 === 0) {
      const day = (t + 1) / 288;
      const rels = { stranger: 0, acquaintance: 0, friend: 0, close_friend: 0 };
      let totalStrength = 0;
      let relCount = 0;

      for (const [id] of engine.world.agents) {
        for (const rel of engine.world.socialGraph.getRelationships(id)) {
          rels[rel.type]++;
          totalStrength += rel.strength;
          relCount++;
        }
      }

      // 交互对统计
      const spatial = engine.world.spatial;
      let encounterPairs = 0;
      if (spatial) {
        const encs = spatial.getEncounters();
        encounterPairs = encs.length;
      }

      snapshots.push({
        day,
        relationships: { ...rels, total_pairs: relCount / 2 },
        avg_strength: relCount > 0 ? (totalStrength / relCount).toFixed(4) : 0,
        encounter_pairs_snapshot: encounterPairs,
      });

      console.log(`  Day ${day}: closeFriend=${rels.close_friend/2}, friend=${rels.friend/2}, acquaintance=${rels.acquaintance/2}, stranger=${rels.stranger/2}`);
    }
  }

  const elapsed = Date.now() - t0;

  // 情绪传染
  const agents = [...engine.world.agents.values()];
  const valences = agents.map(a => a.emotion.getValence());
  const meanV = valences.reduce((a, b) => a + b, 0) / valences.length;

  // 最强关系
  let maxS = 0, maxP = '';
  for (const [id] of engine.world.agents) {
    for (const rel of engine.world.socialGraph.getRelationships(id)) {
      if (rel.strength > maxS) { maxS = rel.strength; maxP = `${id} ↔ ${rel.partner}`; }
    }
  }

  // 空间统计
  const spatial = engine.world.spatial;
  let gridStats = null;
  if (spatial) {
    gridStats = spatial.getStats();
  }

  const result = {
    config: { agents: N, ticks: TICKS, sim_days: 10, mode: 'continuous' },
    snapshots,
    emotion: { mean_valence: meanV.toFixed(4) },
    top_pair: { pair: maxP, strength: maxS.toFixed(4) },
    performance: { elapsed_ms: elapsed, ms_per_tick: (elapsed / TICKS).toFixed(1) },
    spatial_stats: gridStats,
  };

  console.log(`\n  耗时: ${elapsed}ms (${(elapsed/TICKS).toFixed(1)}ms/tick)`);
  console.log(`  最强关系: ${maxP} = ${maxS.toFixed(4)}`);
  console.log(`  平均效价: ${meanV.toFixed(4)}`);

  fs.writeFileSync(path.join(OUTPUT_DIR, 's3_emergence_spatial.json'), JSON.stringify(result, null, 2));
  return result;
}

// ═══════════════════════════════════════════
// S4: 空间分布分析
// ═══════════════════════════════════════════

function runS4() {
  console.log('\n═══ S4: 空间分布分析 ═══\n');

  const N = 50;
  const engine = new AndyEngine({
    startTime: new Date('2025-06-01T12:00:00'),
    weather: 'sunny',
    spatial: 'continuous',
  });
  for (const def of makeAgentDefs(N)) engine.createCharacter(def);

  // 运行 288 tick 让 agent 移动
  for (let i = 0; i < 288; i++) engine.tick();

  const spatial = engine.world.spatial;

  // 1. 坐标分布
  const coords = [];
  for (const [id] of engine.world.agents) {
    const c = spatial.getCoords(id);
    coords.push({ id, x: c.x, y: c.y, region: engine.getAgent(id).position });
  }

  // 2. 区域密度
  const regionDensity = {};
  for (const c of coords) {
    if (!regionDensity[c.region]) regionDensity[c.region] = 0;
    regionDensity[c.region]++;
  }

  // 3. 平均最近邻距离（聚集度指标）
  let totalNN = 0;
  let nnCount = 0;
  for (let i = 0; i < coords.length; i++) {
    let minDist = Infinity;
    for (let j = 0; j < coords.length; j++) {
      if (i === j) continue;
      const dx = coords[i].x - coords[j].x;
      const dy = coords[i].y - coords[j].y;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d < minDist) minDist = d;
    }
    if (minDist < Infinity) {
      totalNN += minDist;
      nnCount++;
    }
  }
  const avgNearestNeighbor = nnCount > 0 ? (totalNN / nnCount).toFixed(1) : 'N/A';

  // 4. 交互半径内的配对数
  const radii = [5, 10, 15, 20, 30, 50];
  const pairsAtRadius = {};
  for (const r of radii) {
    let count = 0;
    for (let i = 0; i < coords.length; i++) {
      for (let j = i + 1; j < coords.length; j++) {
        const dx = coords[i].x - coords[j].x;
        const dy = coords[i].y - coords[j].y;
        if (dx * dx + dy * dy <= r * r) count++;
      }
    }
    pairsAtRadius[r] = count;
  }

  const result = {
    config: { agents: N, ticks: 288, world: '500x500' },
    region_density: regionDensity,
    avg_nearest_neighbor_m: avgNearestNeighbor,
    pairs_within_radius: pairsAtRadius,
    sample_positions: coords.slice(0, 10).map(c => ({
      id: c.id, x: c.x.toFixed(1), y: c.y.toFixed(1), region: c.region,
    })),
  };

  console.log('  区域密度:');
  for (const [r, n] of Object.entries(regionDensity).sort((a, b) => b[1] - a[1])) {
    console.log(`    ${r}: ${n} 人`);
  }
  console.log(`\n  平均最近邻距离: ${avgNearestNeighbor}m`);
  console.log('  不同半径内的配对数:');
  for (const [r, c] of Object.entries(pairsAtRadius)) {
    console.log(`    r=${r}m: ${c} 对 (共 ${N*(N-1)/2} 可能)`);
  }

  fs.writeFileSync(path.join(OUTPUT_DIR, 's4_spatial_distribution.json'), JSON.stringify(result, null, 2));
  return result;
}

// ═══════════════════════════════════════════
// 主流程
// ═══════════════════════════════════════════

async function main() {
  console.log('╔════════════════════════════════════════╗');
  console.log('║   空间引擎评估实验                     ║');
  console.log('╚════════════════════════════════════════╝');

  const s1 = runS1();
  const s2 = runS2();
  const s3 = runS3();
  const s4 = runS4();

  // 总结
  console.log('\n╔════════════════════════════════════════╗');
  console.log('║   实验总结                             ║');
  console.log('╚════════════════════════════════════════╝\n');

  console.log('S1 性能基准:');
  for (const r of s1) {
    console.log(`  ${String(r.agents).padStart(4)} agent: region=${r.region_per_tick}ms, spatial=${r.spatial_per_tick}ms (${r.overhead_pct}%)`);
  }

  console.log('\nS2 交互对比 (20 agent, 1 天):');
  console.log(`  区域: ${s2.region.total_encounters} 次交互, ${s2.region.relationships} 对关系`);
  console.log(`  连续: ${s2.spatial.total_encounters} 次交互, ${s2.spatial.relationships} 对关系`);

  console.log('\nS3 涌现 (20 agent, 10 天, 连续坐标):');
  console.log(`  最强: ${s3.top_pair.pair} = ${s3.top_pair.strength}`);
  console.log(`  性能: ${s3.performance.ms_per_tick}ms/tick`);

  console.log('\nS4 空间分布 (50 agent, 1 天):');
  console.log(`  平均最近邻: ${s4.avg_nearest_neighbor_m}m`);
  console.log(`  10m 内配对: ${s4.pairs_within_radius[10]}/${50*49/2}`);

  // 保存总汇总
  const summary = {
    s1_performance: s1,
    s2_interaction: { region: s2.region, spatial: s2.spatial },
    s3_emergence: { top_pair: s3.top_pair, performance: s3.performance },
    s4_distribution: { avg_nn: s4.avg_nearest_neighbor_m, pairs_10m: s4.pairs_within_radius[10] },
  };
  fs.writeFileSync(path.join(OUTPUT_DIR, 'summary.json'), JSON.stringify(summary, null, 2));
  console.log(`\n结果已保存至: ${OUTPUT_DIR}/`);
}

main().catch(err => {
  console.error('实验失败:', err);
  process.exit(1);
});
