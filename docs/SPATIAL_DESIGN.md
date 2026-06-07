# 连续坐标空间系统 — 详细设计

> 版本：v0.1 (draft)
> 日期：2026-06-01
> 目标：为 Andy Engine 引入连续 2D 坐标 + 空间哈希网格，替代纯区域标签模型

---

## 1. 问题分析

### 现状

```
JS 侧：
  RegionGrid → Map<string, Set<string>>  （区域标签 → agent 集合）
  交互判断 → 同区域所有 pair，O(k²)
  社交传染 → 同区域 blend

Rust 侧：
  SoaBatchEngine → 只处理情绪/需求，零空间感知
  CsrGraph → 社交传染图，边来自 JS SocialGraph
```

**瓶颈**：
- 区域粒度粗 → 50 人图书馆 = 1225 对交互
- 交互逻辑全在 JS → 单线程顺序执行
- 无距离衰减 → 同区域 = 100% 可交互

### 目标

| 指标 | 当前 | 目标 |
|------|------|------|
| 空间模型 | 离散标签 | 连续 2D + 区域标签（双层） |
| 交互判断 | O(k²)/区域 | O(N·k)，k≈5-9 |
| 交互逻辑 | JS 单线程 | Rust 并行 |
| 100K agent tick | ~100ms (推算) | <40ms |
| 向后兼容 | - | 纯区域模式仍可用 |

---

## 2. 架构总览

```
┌─────────────────────────────────────────────────────┐
│                    JS 侧 (Simulator)                 │
│                                                       │
│  Agent.position = "图书馆"    ← 区域标签（保留）      │
│  Agent.coords   = { x: 120.5, y: 340.2 }  ← 新增    │
│                                                       │
│  tick() {                                             │
│    1. TIME_ADVANCE                                    │
│    2. ENVIRONMENT_SYNC                                │
│    3. AGENT_THINK  (JS, 顺序)                         │
│    4. INTERACTION  → 发送给 Rust SpatialEngine  ◄── 新│
│    5. EVENT_DISPATCH                                  │
│  }                                                    │
└──────────────────────┬──────────────────────────────┘
                       │ N-API binary buffer
                       ▼
┌─────────────────────────────────────────────────────┐
│              Rust 侧 (SpatialEngine)   新增模块       │
│                                                       │
│  SpatialWorld {                                       │
│    positions: Vec<[f32; 2]>,     // N 个 agent 坐标   │
│    regions: Vec<u16>,            // 区域 ID 编码      │
│    velocities: Vec<[f32; 2]>,    // 移动速度          │
│    grid: SpatialHash,            // 空间哈希网格      │
│    region_defs: Vec<RegionDef>,  // 区域几何定义      │
│  }                                                    │
│                                                       │
│  tick_spatial() {                                     │
│    1. 更新位置 (par_iter)                              │
│    2. 重建网格索引 (par_iter)                          │
│    3. 邻居查询 + 距离计算 (par_iter + SIMD)            │
│    4. 交互概率判定                                     │
│    5. 返回交互结果 → JS                               │
│  }                                                    │
└─────────────────────────────────────────────────────┘
```

---

## 3. 数据结构设计

### 3.1 空间哈希网格（核心）

```rust
// native/src/spatial/hash_grid.rs

/// 空间哈希网格
/// 原理：把 2D 空间切成 cell_size × cell_size 的格子，
///       每个 agent 只需和相邻 9 格内的人算距离
pub struct SpatialHash {
    /// 世界尺寸
    world_width: f32,
    world_height: f32,
    /// 格子尺寸（应 ≥ 2 × interaction_radius）
    cell_size: f32,
    /// 网格列数
    cols: u32,
    /// 网格行数
    rows: u32,
    /// 一维数组存储所有格子，每个格子存 agent 索引
    /// 用 compact vec 避免 Vec<Vec<u32>> 的碎片化
    cells: Vec<u32>,       // 所有 agent 索引连续存放
    cell_offsets: Vec<u32>, // cell_offsets[i] = cells 中第 i 格的起始位置
    cell_counts: Vec<u32>,  // cell_counts[i] = 第 i 格有多少 agent
    /// 排序后的 agent 索引（用于重排 positions 数组）
    sorted_indices: Vec<u32>,
}

impl SpatialHash {
    /// 计算 agent 所在格子 ID
    #[inline]
    fn cell_id(&self, x: f32, y: f32) -> u32 {
        let cx = ((x / self.cell_size) as u32).min(self.cols - 1);
        let cy = ((y / self.cell_size) as u32).min(self.rows - 1);
        cy * self.cols + cx
    }

    /// 重建网格（每 tick 调用）
    /// 时间复杂度：O(N)
    pub fn rebuild(&mut self, positions: &[[f32; 2]]) {
        let n = positions.len();

        // 1. 计数每格人数
        self.cell_counts.fill(0);
        for pos in positions {
            let cid = self.cell_id(pos[0], pos[1]);
            self.cell_counts[cid as usize] += 1;
        }

        // 2. 前缀和 → offsets
        let mut sum = 0u32;
        for i in 0..self.cell_counts.len() {
            self.cell_offsets[i] = sum;
            sum += self.cell_counts[i];
        }
        self.cell_offsets[self.cell_counts.len()] = sum;

        // 3. 填充 cells
        let mut write_pos = self.cell_offsets.clone();
        for (idx, pos) in positions.iter().enumerate() {
            let cid = self.cell_id(pos[0], pos[1]);
            let wp = write_pos[cid as usize] as usize;
            self.cells[wp] = idx as u32;
            write_pos[cid as usize] += 1;
        }
    }

    /// 查询某格及周围 8 格的所有 agent 索引
    /// 返回值通过 closure 消费，避免分配
    #[inline]
    pub fn query_neighbors<F: FnMut(u32)>(&self, cell_id: u32, mut f: F) {
        let cx = cell_id % self.cols;
        let cy = cell_id / self.cols;

        let x_min = cx.saturating_sub(1);
        let x_max = (cx + 1).min(self.cols - 1);
        let y_min = cy.saturating_sub(1);
        let y_max = (cy + 1).min(self.rows - 1);

        for ny in y_min..=y_max {
            for nx in x_min..=x_max {
                let cid = ny * self.cols + nx;
                let start = self.cell_offsets[cid as usize] as usize;
                let end = self.cell_offsets[cid as usize + 1] as usize;
                for &agent_idx in &self.cells[start..end] {
                    f(agent_idx);
                }
            }
        }
    }
}
```

**内存占用**（50K agent）：
- `cells`: 50K × 4 = 200KB
- `cell_offsets`: 10K × 4 = 40KB（假设 100×100 网格）
- `cell_counts`: 10K × 4 = 40KB
- **合计 ~280KB**，可忽略

### 3.2 区域几何定义

```rust
// native/src/spatial/region.rs

/// 区域类型
#[derive(Clone, Debug)]
pub enum RegionShape {
    /// 矩形区域：图书馆、宿舍楼
    Rect { x: f32, y: f32, w: f32, h: f32 },
    /// 圆形区域：广场、喷泉
    Circle { cx: f32, cy: f32, radius: f32 },
    /// 多边形：不规则建筑
    Polygon { points: Vec<[f32; 2]> },
}

/// 区域定义
#[derive(Clone, Debug)]
pub struct RegionDef {
    pub id: u16,               // 数字 ID（JS 侧字符串 → u16 映射）
    pub name: String,          // "图书馆"
    pub shape: RegionShape,
    pub capacity: Option<u32>, // 可选：区域容量上限
    pub indoor: bool,          // 室内/室外（影响天气感知）
}

/// 世界地图
pub struct WorldMap {
    pub width: f32,            // 世界宽度（米）
    pub height: f32,           // 世界高度（米）
    pub regions: Vec<RegionDef>,
    /// 区域名称 → ID 映射
    pub name_to_id: HashMap<String, u16>,
    /// 区域间路径距离（非欧几里得，走道路）
    pub path_distances: Vec<f32>, // N_regions × N_regions
}
```

### 3.3 空间世界（整合）

```rust
// native/src/spatial/world.rs

pub struct SpatialWorld {
    // ── 位置数据 (SoA, f32) ──
    pub positions: Vec<[f32; 2]>,   // [x, y] per agent
    pub regions: Vec<u16>,          // 区域 ID per agent
    pub speeds: Vec<f32>,           // 移动速度 (m/s)

    // ── 空间索引 ──
    pub grid: SpatialHash,
    pub world_map: WorldMap,

    // ── 交互结果缓冲区 ──
    pub interactions: Vec<InteractionPair>,

    // ── 配置 ──
    pub config: SpatialConfig,
}

#[derive(Clone, Debug)]
pub struct InteractionPair {
    pub agent_a: u32,
    pub agent_b: u32,
    pub distance: f32,
    pub probability: f32,
    pub in_same_region: bool,
}

#[derive(Clone, Debug)]
pub struct SpatialConfig {
    pub interaction_radius: f32,    // 交互半径（米），默认 5.0
    pub cell_size: f32,             // 格子尺寸，默认 10.0
    pub base_prob: f32,             // 基础交互概率，默认 0.3
    pub distance_decay: f32,        // 距离衰减系数，默认 0.2
    pub max_interactions_per_tick: u32, // 每 agent 每 tick 最大交互数，默认 5
}
```

---

## 4. 交互流程（Rust 侧）

```rust
// native/src/spatial/encounter.rs

impl SpatialWorld {
    /// 每 tick 调用：计算所有交互对
    pub fn tick_encounters(&mut self) {
        let n = self.positions.len();

        // ── Phase 1: 重建网格 ──
        self.grid.rebuild(&self.positions);

        // ── Phase 2: 并行邻居查询 + 距离计算 ──
        // 用 rayon 并行，每个 agent 独立查询自己的邻居
        let interaction_lists: Vec<SmallVec<[InteractionPair; 8]>> =
            (0..n).into_par_iter().map(|i| {
                let mut local = SmallVec::new();
                let pos_i = self.positions[i];
                let region_i = self.regions[i];
                let cell_id = self.grid.cell_id(pos_i[0], pos_i[1]);

                self.grid.query_neighbors(cell_id, |j| {
                    if j as usize <= i { return; } // 避免重复对

                    let pos_j = self.positions[j as usize];
                    let dx = pos_i[0] - pos_j[0];
                    let dy = pos_i[1] - pos_j[1];
                    let dist_sq = dx * dx + dy * dy;

                    if dist_sq <= self.config.interaction_radius.powi(2) {
                        let dist = dist_sq.sqrt();
                        let in_same_region = region_i == self.regions[j as usize];

                        // 交互概率 = base + distance_factor
                        let dist_factor = 1.0 - (dist / self.config.interaction_radius);
                        let prob = (self.config.base_prob
                            + dist_factor * self.config.distance_decay)
                            .min(1.0);

                        local.push(InteractionPair {
                            agent_a: i as u32,
                            agent_b: j,
                            distance: dist,
                            probability: prob,
                            in_same_region,
                        });
                    }
                });

                // 限制每个 agent 的交互数
                if local.len() > self.config.max_interactions_per_tick as usize {
                    local.sort_by(|a, b| {
                        a.distance.partial_cmp(&b.distance).unwrap()
                    });
                    local.truncate(self.config.max_interactions_per_tick as usize);
                }

                local
            }).collect();

        // ── Phase 3: 合并结果 ──
        self.interactions.clear();
        for list in interaction_lists {
            for pair in list {
                self.interactions.push(pair);
            }
        }
    }
}
```

**关键设计决策**：

| 决策 | 选择 | 原因 |
|------|------|------|
| 距离计算 | Euclidean sqrt | 50K agent 下 SIMD sqrt 约 1ms |
| 概率公式 | `base + (1 - d/r) * decay` | 近处高概率，远处低概率，线性衰减 |
| 交互上限 | 每 agent 最多 5 个/tick | 防止社交蝴蝶，符合 Dunbar 原理 |
| 排序策略 | 按距离升序取前 5 | 优先和最近的人交互 |
| SmallVec | 栈上预分配 8 个 | 避免 heap alloc，绝大多数 agent < 8 邻居 |

---

## 5. 位置更新（移动模型）

```rust
// native/src/spatial/movement.rs

impl SpatialWorld {
    /// 从 Schedule 目标驱动移动
    /// JS 侧设置 target_region → Rust 计算实际移动路径
    pub fn update_positions(&mut self, targets: &[MoveTarget]) {
        self.positions.par_iter_mut().enumerate().for_each(|(i, pos)| {
            let target = &targets[i];
            if !target.active { return; }

            let target_pos = self.world_map.region_center(target.target_region);
            let dx = target_pos[0] - pos[0];
            let dy = target_pos[1] - pos[1];
            let dist = (dx * dx + dy * dy).sqrt();

            if dist < 1.0 {
                // 到达目标
                *pos = target_pos;
            } else {
                // 向目标移动
                let speed = self.speeds[i];
                let step = speed.min(dist);
                pos[0] += (dx / dist) * step;
                pos[1] += (dy / dist) * step;
            }
        });

        // 更新区域归属（检查每个 agent 落在哪个区域）
        self.regions.par_iter_mut().enumerate().for_each(|(i, region)| {
            *region = self.world_map.point_in_region(self.positions[i]);
        });
    }
}

pub struct MoveTarget {
    pub active: bool,
    pub target_region: u16,
}
```

**移动速度参考**：
- 步行：1.4 m/s（校园场景）
- 骑车：5.0 m/s
- 5 分钟 tick → 步行移动 420m → 足以覆盖整个校园地图

**地图尺寸建议**：
- 校园场景：500m × 500m（25 公顷）
- 城市场景：2km × 2km
- 格子尺寸 = 10m → 校园 2500 格，城市 40000 格

---

## 6. JS ↔ Rust 接口设计

### 6.1 初始化（JS → Rust）

```javascript
// 新增 SpatialEngine 的 N-API 接口
const spatial = new SpatialEngine({
  worldWidth: 500,
  worldHeight: 500,
  cellSize: 10,
  interactionRadius: 5,
  maxInteractionsPerTick: 5,
  regions: [
    { id: 0, name: '宿舍', shape: 'rect', x: 0, y: 0, w: 80, h: 60 },
    { id: 1, name: '图书馆', shape: 'rect', x: 150, y: 100, w: 100, h: 80 },
    { id: 2, name: '食堂', shape: 'rect', x: 300, y: 200, w: 60, h: 50 },
    // ...
  ],
});
```

### 6.2 每 Tick 数据流

```
JS tick:
  1. AgentThink → 确定每个 agent 的 target_region
  2. 打包数据 → Rust:
     - positions: Float32Array[N * 2]  (当前坐标)
     - targets: Uint16Array[N]          (目标区域 ID)
     - strengths: Float32Array[N*N] 或 CSR 格式 (关系强度)
  3. Rust tick_spatial():
     - update_positions(targets)
     - rebuild grid
     - compute encounters
     - return: Uint32Array[M * 2] (交互对) + Float32Array[M] (距离)
  4. JS 接收交互结果 → EventDispatcher 处理
```

### 6.3 二进制缓冲区格式

```
输入缓冲区 (JS → Rust):
┌──────────────────────────────────────────┐
│ header: [N: u32, version: u16, flags: u16] │ 8 bytes
├──────────────────────────────────────────┤
│ positions: [f32; N*2]                     │ N * 8 bytes
├──────────────────────────────────────────┤
│ targets: [u16; N]                         │ N * 2 bytes
├──────────────────────────────────────────┤
│ strengths_csr: [offsets, neighbors, vals] │ variable
└──────────────────────────────────────────┘

输出缓冲区 (Rust → JS):
┌──────────────────────────────────────────┐
│ header: [M: u32, ...]                     │ 8 bytes
├──────────────────────────────────────────┤
│ pairs: [(a: u32, b: u32, dist: f32)]     │ M * 12 bytes
├──────────────────────────────────────────┤
│ region_changes: [(id: u32, new_region: u16)] │ C * 6 bytes
└──────────────────────────────────────────┘
```

---

## 7. 向后兼容策略

### 7.1 三种运行模式

```javascript
// 模式 1: 纯区域（现有行为，零改动）
const engine = new AndyEngine({ spatial: 'region' });

// 模式 2: 连续坐标 + 区域标签（推荐）
const engine = new AndyEngine({ spatial: 'continuous' });

// 模式 3: 连续坐标，无区域概念（纯模拟）
const engine = new AndyEngine({ spatial: 'coordinate-only' });
```

### 7.2 区域 → 坐标映射

```javascript
// 当 spatial='continuous' 时，Schedule 仍然输出 region 字符串
// 系统自动将 region 映射到该区域内的随机坐标
function regionToCoords(regionDef) {
  // 矩形区域内随机点
  return {
    x: regionDef.x + Math.random() * regionDef.w,
    y: regionDef.y + Math.random() * regionDef.h,
  };
}
```

### 7.3 API 不变性

```javascript
// 以下 API 行为不变：
agent.position        // 仍然是区域字符串 "图书馆"
agent.stateMachine    // 仍然正常工作
engine.getNarrative() // 仍然正常工作
engine.getWorldContext() // 仍然正常工作

// 新增：
agent.coords          // { x, y } 连续坐标（可选使用）
engine.getNearbyAgents(agentId, radius) // 距离查询
```

---

## 8. 性能基准预估

### 8.1 Rust SpatialEngine 性能

基于 Apple M1 (16GB), Rust + Rayon:

| 操作 | 1K agent | 10K | 50K | 100K |
|------|----------|-----|-----|------|
| 网格重建 | 0.02ms | 0.2ms | 0.8ms | 1.6ms |
| 邻居查询+距离 | 0.1ms | 0.8ms | 4ms | 8ms |
| 交互判定 | 0.05ms | 0.3ms | 1.5ms | 3ms |
| 位置更新 | 0.02ms | 0.15ms | 0.6ms | 1.2ms |
| **合计** | **0.2ms** | **1.5ms** | **7ms** | **14ms** |

### 8.2 与当前系统对比

| 组件 | 当前 (JS) | 新方案 (Rust) | 加速比 |
|------|-----------|--------------|--------|
| 交互判断 | ~15ms (100K 估算) | ~7ms | 2× |
| 社交传染 | ~5ms (Rust CsrGraph) | ~5ms (不变) | 1× |
| 位置更新 | ~8ms (JS Schedule) | ~0.6ms | 13× |
| **总空间相关** | **~28ms** | **~13ms** | **2.2×** |

### 8.3 总 Tick 时间预估

| 规模 | 当前 (JS+Rust) | 新方案 | 变化 |
|------|---------------|--------|------|
| 1K | ~4ms | ~3ms | -25% |
| 10K | ~15ms | ~12ms | -20% |
| 50K | ~35ms (推算) | ~31ms | -11% |
| 100K | ~80ms (推算) | ~55ms | **-31%** |

规模越大收益越大，因为 O(N²) → O(N·k) 的差距随 N 增大而增大。

---

## 9. 实现路线图

### Phase 1: Rust 空间哈希网格（1-2 周）

```
文件：native/src/spatial/
├── mod.rs           # 模块导出
├── hash_grid.rs     # SpatialHash 核心
├── region.rs        # RegionDef, WorldMap
├── world.rs         # SpatialWorld 整合
├── encounter.rs     # 交互计算
└── napi.rs          # N-API 桥接

依赖：rayon (已有), smallvec (新增)
测试：单元测试 + 50K agent 基准测试
```

**验收标准**：
- [ ] SpatialHash rebuild: 50K < 1ms
- [ ] 邻居查询: 50K < 5ms
- [ ] 单元测试: 100% 通过
- [ ] 基准测试: 对比 JS RegionGrid

### Phase 2: JS 侧集成（1 周）

```
修改文件：
- spatial/RegionGrid.js → 增加 coords 字段
- core/Simulator.js → 交互阶段委托给 Rust
- agent/Agent.js → 增加 coords 属性
- agent/Schedule.js → region → coords 映射

新增文件：
- spatial/WorldMap.js → 区域几何定义
- spatial/SpatialBridge.js → JS↔Rust 桥接
```

**验收标准**：
- [ ] `spatial: 'region'` 模式行为完全不变
- [ ] `spatial: 'continuous'` 模式可运行
- [ ] 1508 测试全通过
- [ ] Exp5 涌现实验结果可复现

### Phase 3: 区域几何 + 路径规划（2 周）

```
- 世界地图编辑器（JSON 配置）
- 区域形状定义（矩形/圆形/多边形）
- 路径距离矩阵（非欧几里得，走道路）
- 移动动画插值（视觉层）
```

### Phase 4: 优化 + GPU 就绪（持续）

```
- SIMD 距离计算（std::simd）
- 网格 bucket sort 优化
- GPU compute shader 原型（wgpu）
- 空间查询 API 开放（getNearbyAgents）
```

---

## 10. API 平台设计（远期）

### 10.1 开放 API

```javascript
// 创建世界
const world = await andy.createWorld({
  name: '我的虚拟校园',
  map: { width: 1000, height: 1000 },
  regions: [
    { name: '教学楼', shape: 'rect', x: 100, y: 100, w: 200, h: 150 },
    { name: '食堂', shape: 'circle', cx: 500, cy: 500, radius: 50 },
  ],
});

// 添加角色
const alice = await world.addAgent({
  name: 'Alice',
  personality: { mbti: 'ENFP', ocean: { E: 0.8, ... } },
  schedule: 'student',
  position: { x: 150, y: 150 },  // 教学楼内
});

// 每 tick 推进
const result = await world.tick();

// 查询附近的人
const nearby = await world.queryNearby(alice.id, { radius: 10 });
// → [{ id: 'bob', distance: 3.2, relationship: 'acquaintance' }, ...]

// 获取世界快照（用于渲染）
const snapshot = await world.getSnapshot();
// → { agents: [{ id, x, y, state, emotion, ... }], time, weather }
```

### 10.2 实时渲染输出

```javascript
// WebSocket 推送（每 tick）
world.on('tick', (snapshot) => {
  broadcastToClients({
    type: 'world_update',
    time: snapshot.time,
    agents: snapshot.agents.map(a => ({
      id: a.id,
      x: a.x,
      y: a.y,
      state: a.state,
      emotion: a.emotion.dominant, // top 3
    })),
  });
});
```

---

## 11. 风险评估

| 风险 | 概率 | 影响 | 缓解 |
|------|------|------|------|
| N-API 二进制序列化 bug | 高 | 中 | 充分单元测试 + fuzz |
| 连续坐标导致涌现行为改变 | 中 | 高 | Exp5 结果对比验证 |
| 地图设计影响交互分布 | 高 | 中 | 提供默认地图 + 调参工具 |
| Rust 编译环境缺失（M1 无 Cargo） | 已知 | 低 | CI/CD 自动编译 |
| 交互上限破坏 Dunbar 层级 | 低 | 中 | max_interactions 与 Dunbar 对齐 |

---

## 12. 决策清单

| 决策 | 需要确定 | 影响 |
|------|---------|------|
| 地图尺寸 | 500m vs 1000m vs 自定义 | 格子数量、密度 |
| 交互半径 | 3m vs 5m vs 10m | 交互频率 |
| 格子尺寸 | 10m vs 20m | 查询效率 |
| 每 tick 最大交互 | 3 vs 5 vs 10 | 社交强度 |
| 距离衰减函数 | 线性 vs 指数 vs 阶梯 | 远距离交互概率 |
| 是否保留区域标签 | 保留 vs 纯坐标 | 向后兼容性 |
