# Andy Engine: 10^9 Agent 架构设计

## 问题规模量化

| 维度 | 数值 |
|------|------|
| Agent 数 | 1,000,000,000 |
| 情绪维度 | 30 (f64) |
| 人均社交边 | ~15 (Dunbar 分层) |
| 总边数 | ~15,000,000,000 |
| 内存需求 | ~400 GB |
| 单 tick 计算量 | ~1,800 GFLOP |
| 社交传染占比 | 75% |

---

## 核心洞察：三个关键解耦

### 1. 个体更新 vs 社交传染

个体更新（时间衰减、昼夜节律、粉噪声、共激活、惯性、需求衰减）是**完全独立**的——每个 agent 只读写自己的状态。这是 embarrassingly parallel，GPU 的完美场景。

社交传染是**图依赖**的——每个 agent 需要读取邻居的情绪状态。15B 边的 SpMV 是瓶颈。

**设计原则**: 将二者解耦到不同的计算阶段，用不同的并行策略。

### 2. 强关系 vs 弱关系

Dunbar 层级天然形成带宽梯度：
- 亲密朋友 (≤5): 高频同步，每次 tick
- 朋友 (≤15): 中频同步，每 2-3 tick
- 认识的人 (≤150): 低频同步，每 10 tick
- 陌生人: 不同步，仅相遇时

**设计原则**: 社交传染按 Dunbar 层级分频执行，总带宽降低 10-50x。

### 3. 空间局部性 vs 全局连通性

物理相遇受空间限制（同区域），但社交关系是全局的（朋友可能在任意区域）。

**设计原则**: 空间相遇用 GPU 空间哈希，远程社交用异步消息传递。

---

## 架构概览

```
┌─────────────────────────────────────────────────────────────┐
│                    Global Tick Coordinator                   │
│              (BSP: Bulk Synchronous Parallel)                │
├──────────────┬──────────────┬──────────────┬─────────────────┤
│  Phase 1     │  Phase 2     │  Phase 3     │  Phase 4        │
│  Individual  │  Local       │  Remote      │  Relationship   │
│  Update      │  Contagion   │  Contagion   │  Evolution      │
│  (GPU)       │  (GPU)       │  (GPU/CPU)   │  (GPU)          │
│  每 tick      │  每 tick      │  每 N tick    │  每 M tick       │
│  O(N×D)      │  O(N×k_l×D)  │  O(N×k_r×D)  │  O(E)           │
│  450 GFLOP   │  ~200 GFLOP  │  ~100 GFLOP  │  ~50 GFLOP      │
└──────────────┴──────────────┴──────────────┴─────────────────┘
     ↓               ↓               ↓               ↓
┌─────────────────────────────────────────────────────────────┐
│                  GPU Memory (SoA Layout)                     │
│                                                             │
│  ┌─────────────┐ ┌─────────┐ ┌──────────┐ ┌──────────────┐ │
│  │ emotions[N×30]│ │needs[N×5]│ │state[N]  │ │ graph (CSR)  │ │
│  │ mood[N×30]   │ │decay[N×5]│ │stress[N] │ │ col_idx[E]   │ │
│  │ baseline[N×30]│ │         │ │position[N]│ │ values[E]    │ │
│  │ pink[N×16]   │ │         │ │          │ │              │ │
│  └─────────────┘ └─────────┘ └──────────┘ └──────────────┘ │
│                                                             │
│  ┌──────────────────────────────────────────────────────┐   │
│  │ ping-pong buffers (double buffering)                  │   │
│  │ 当前读 A, 写 B → 下一 tick 读 B, 写 A                │   │
│  └──────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

---

## Phase 1: 个体更新 (Embarrassingly Parallel)

### GPU Kernel 设计

每个 thread 处理 1 个 agent，30 维情绪向量在寄存器/共享内存中完成全部计算。

```wgsl
// WebGPU / Metal Compute Shader 伪代码
@compute @workgroup_size(256)
fn agent_update(@builtin(global_invocation_id) gid: vec3<u32>) {
    let i = gid.x;
    if (i >= num_agents) { return; }

    // 加载 30 维情绪到寄存器 (240 bytes per thread)
    var current: array<f64, 30>;
    var mood: array<f64, 30>;
    var baseline: array<f64, 30>;
    for (var d = 0u; d < 30u; d++) {
        current[d] = emotions_current[i * 30 + d];
        mood[d] = emotions_mood[i * 30 + d];
        baseline[d] = emotions_baseline[i * 30 + d];
    }

    // Step 1: 时间衰减 (30× exp + multiply)
    let lambda = behavior[i].emotion_decay_rate;
    for (var d = 0u; d < 30u; d++) {
        let excess = current[d] - mood[d];
        let eff_lambda = select(
            select(lambda, lambda * 0.7, excess < 0.0 && IS_NEGATIVE[d]),
            lambda * 1.2, excess > 0.0 && IS_POSITIVE[d]
        );
        let factor = exp(-eff_lambda * hours_elapsed);
        current[d] = mood[d] + excess * factor;
    }

    // Step 2-6: 昼夜节律 + 粉噪声 + 共激活 + 对立抑制 + 惯性
    // ... (全部在寄存器中完成)

    // 写回
    for (var d = 0u; d < 30u; d++) {
        emotions_out[i * 30 + d] = current[d];
    }
}
```

### 性能预估

- 256 threads/workgroup, 每个 agent ~450 FLOP
- A100: 1B agents ÷ (256 × 108 SM) × 450 FLOP ÷ 9.7 TFLOPS ≈ **45 ms**
- H100: ≈ **6 ms**
- 带宽限制: 240 GB × 3 (read/write/ping-pong) ÷ 2 TB/s = **360 ms** (需要优化数据布局)

**关键优化**: f32 替代 f64（情绪精度不需要 64 位），内存减半、带宽减半、SIMD 吞吐翻倍。

---

## Phase 2: 局部社交传染 (Spatial Locality)

### 原理

同一区域的 agent 更可能相遇和相互影响。利用空间局部性：

1. 将世界划分为 grid cells（如 100m × 100m）
2. 每个 cell 内的 agent 使用共享内存交换情绪状态
3. 邻居 cell 通过全局内存交换

### GPU Kernel: Spatial Contagion

```wgsl
@compute @workgroup_size(256)
fn local_contagion(@builtin(global_invocation_id) gid: vec3<u32>) {
    let i = gid.x;
    let cell = agent_cell[i];

    // 共享内存加载当前 cell 所有 agent 的情绪快照
    // (限制每 cell ≤ 256 agents，超出的分批)
    var shared_emotions: array<array<f64, 30>, 256>;
    // ... cooperative load ...

    // 对 cell 内的邻居应用传染
    for (var n = 0u; n < cell_size; n++) {
        if (n == local_idx) { continue; }
        let weight = spatial_weight(local_pos, neighbor_pos);
        for (var d = 0u; d < 30u; d++) {
            let diff = shared_emotions[n][d] - current[d];
            if (abs(diff) > 0.05) {
                current[d] += diff * weight * susceptibility * 0.3;
            }
        }
    }
}
```

### 性能

- 受 cell 内 agent 密度限制，每 tick 处理 ~10-50 个邻居
- 总计算量: 1B × 30 × 30 × 30 ≈ **270 GFLOP**
- 不需要访问全局社交图——纯空间结构

---

## Phase 3: 远程社交传染 (Graph-Dependent, Hierarchical)

### 核心难题

远程传染需要遍历社交图的边。15B 边的 SpMV 在多 GPU 间的通信是瓶颈。

### 方案 A: Dunbar 分频传染

```
Tick N:     亲密朋友 (≤5 edges/agent)     → 5B edges × 30 dims = 150 GFLOP
Tick N+1:   不执行远程传染（冷却）
Tick N+2:   朋友 (≤10 edges/agent)        → 10B edges × 30 dims = 300 GFLOP
Tick N+3~9: 不执行远程传染
Tick N+10:  认识的人 (≤135 edges/agent)    → 135B edges × 30 dims ≈ 4 TFLOP
```

每个 tick 的传染计算量降低到原来的 **1/5 ~ 1/50**。

### 方案 B: 图粗化 (Graph Coarsening)

将社交图分层压缩：
1. L0: 原始图 (1B nodes, 15B edges)
2. L1: 超级节点 (100M nodes) — 每 10 个相似 agent 聚合
3. L2: (10M nodes) — 每 10 个超级节点聚合

传染在粗化图上执行，然后解聚合回原始 agent：
- L2 传染: 10M × 100 edges × 30 dims = 30 GFLOP (可忽略)
- L1 传染: 100M × 50 edges × 30 dims = 150 GFLOP
- L0 修正: 只对高情绪差异的边做精细传染

### 方案 C: 异步消息传递 (最实用)

```
┌──────────┐     ┌──────────┐     ┌──────────┐
│  GPU 0   │     │  GPU 1   │     │  GPU 2   │
│ Region A │ ←→  │ Region B │ ←→  │ Region C │
│ 333M     │     │ 333M     │     │ 333M     │
│ agents   │     │ agents   │     │ agents   │
└──────────┘     └──────────┘     └──────────┘
      ↕                ↕                ↕
┌──────────────────────────────────────────────┐
│         NVLink / InfiniBand 交换层           │
│    仅传输边界 agent 的情绪快照 (~1-5% 的 N)   │
└──────────────────────────────────────────────┘
```

每个 GPU 持有 1/3 的 agent 和完整的子图。
跨 GPU 的边只占总边数的 ~5-15%（使用 METIS 图分区最小化切割边）。
只需传输边界 agent 的情绪快照，每 tick 约 30M × 30 × 8B ≈ **7.2 GB**。

---

## Phase 4: 关系演化 (Sparse, Low Frequency)

关系强度变化比情绪慢得多（半衰期 ~2.4 天）。可以每 12-60 tick 执行一次。

使用 CSR (Compressed Sparse Row) 格式存储社交图：

```
row_ptr:  [0, 5, 12, 15, ...]     // agent i 的边起止位置
col_idx:  [42, 103, 256, ...]      // 邻居 agent 索引
strength: [0.35, 0.62, 0.18, ...]  // 关系强度 (f32 足够)
```

15B edges × (4 + 4) bytes = 120 GB，分布在多 GPU 上。

---

## 关键技术创新点

### 1. 情绪 f32 压缩

原始设计用 f64（64 位浮点），但情绪值域 [-1, 1]，精度 10^-4 就够了。
f32 (32 位) 将内存减半、带宽减半、SIMD 吞吐翻倍。

```
f64: 240 GB → f32: 120 GB（单个情绪状态）
```

### 2. 自适应 Tick 频率

不是所有 agent 都需要每个 tick 更新：
- 活跃 agent（正在交互/移动）：每 tick 更新
- 空闲 agent（睡觉/等待）：每 3-5 tick 更新一次
- 深度休眠：每 10+ tick 更新

用 bitflag 标记活跃状态，GPU kernel 跳过非活跃 agent：
```wgsl
if ((flags[i] & ACTIVE_BIT) == 0u) { return; }
```

在 1B agent 中，任意时刻只有 ~10-20% 是活跃的，计算量降低 5-10x。

### 3. 情绪稀疏表示

大部分情绪维度在任意时刻接近 0（baseline）。只存储和计算 |value| > ε 的维度：

```
传统 SoA:  agent_0: [0.02, 0.01, 0.85, 0.03, ...]  → 30 个 f32
稀疏表示:  agent_0: [(2, 0.85), (14, 0.42)]         → 2 个 (u8, f32)
```

~80% 的维度接近 baseline，稀疏表示减少 3-5x 计算量。

### 4. 层级时间步 (Multi-rate Integration)

不同子系统有不同的时间常数：

| 子系统 | 时间常数 | 更新频率 |
|--------|---------|---------|
| 情绪瞬时 (current) | 分钟 | 每 tick |
| 情绪余韵 (mood) | 小时 | 每 3 tick |
| 基线 (baseline) | 天 | 每 60 tick |
| 关系强度 | 天 | 每 12 tick |
| 人格 | 月 | 每 1000 tick |

这将基线更新和关系演化的计算频率降低 10-60x。

---

## 硬件路线图

### 阶段 1: 单节点多 GPU (10^6 - 10^7 agents)

```
1× DGX A100 (8× A100 80GB)
├── 总内存: 640 GB（可装 10^7 agents + 社交图）
├── NVLink 600 GB/s 互连
├── 单 tick: ~10 ms (10^7 agents)
└── 编程模型: CUDA + NCCL
```

### 阶段 2: 多节点 GPU 集群 (10^8 - 10^9 agents)

```
4-8× DGX H100 (32-64× H100 80GB)
├── 总内存: 2.5-5 TB
├── InfiniBand 400 Gb/s 互连
├── 图分区: METIS / KaHIP
├── 单 tick: ~30-50 ms (10^9 agents)
└── 编程模型: CUDA + NCCL + 自定义 BSP runtime
```

### 阶段 3: 超大规模 (10^10+ agents)

```
分布式异构集群
├── GPU 节点: 情绪计算 + 局部传染
├── CPU 节点: 远程传染 (稀疏 SpMV)
├── 存储层: 社交图持久化 (RocksDB / FoundationDB)
├── 通信: gRPC + RDMA
└── 一致性: BSP + 异步关系更新
```

---

## 编程模型: BSP (Bulk Synchronous Parallel)

```
Superstep 1: [所有 GPU 并行] 个体情绪/需求更新
    barrier (NVLink sync)
Superstep 2: [所有 GPU 并行] 局部空间传染
    barrier
Superstep 3: [所有 GPU 并行] 交换边界情绪快照
    barrier
Superstep 4: [所有 GPU 并行] 远程社交传染
    barrier
Superstep 5: [条件执行] 关系演化 / 基线漂移
```

BSP 天然匹配 tick 模型——每个 superstep 对应一个计算阶段，barrier 保证数据一致性。

---

## 实施路线

### Phase A (当前 → 3 个月): Metal Compute 验证

1. 在 M2 Ultra 上用 Metal Performance Shaders 验证 10^5 agents
2. 实现 SoA f32 情绪向量
3. 实现 GPU Phase 1 (个体更新) kernel
4. 基准测试: GPU vs CPU batch

### Phase B (3-6 个月): 多 GPU + 社交图

1. CUDA 移植 (A100/H100)
2. CSR 社交图 + 稀疏 SpMV 传染
3. METIS 图分区
4. NCCL 跨 GPU 通信
5. 目标: 10^7 agents @ 10ms/tick

### Phase C (6-12 个月): 分布式

1. BSP runtime 实现
2. 远程传染 + 异步关系更新
3. 自适应 tick 频率
4. 目标: 10^9 agents @ 50ms/tick

### Phase D (12+ 个月): 优化

1. 情绪稀疏表示
2. 图粗化多分辨率传染
3. 层级时间步
4. 目标: 10^9 agents @ 10ms/tick
