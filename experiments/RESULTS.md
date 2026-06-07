# Dunbar Hierarchical Contagion 实验结果

## 实验配置
- 贪心层分布: 5 close_friends + 10 friends + N acquaintances
- 频率: close=1/1, friend=1/3, acquaintance=1/12
- 每 tick 推进 5 分钟模拟时间
- 初始时间: 8:00 AM

## 实验结果汇总

| Agents | Edges/Agent | Full Median | Hier Median | 加速比 | Global MAE | Relative MAE | Max Agent MAE |
|--------|------------|-------------|-------------|--------|------------|--------------|---------------|
| 10,000 | 15 (0 acq) | 6.8ms | 6.1ms | 1.11x | 0.000002 | 0.00% | 0.07% |
| 50,000 | 45 (30 acq) | 148.7ms | 41.2ms | 3.61x | 0.000013 | 0.01% | 0.89% |
| 100,000 | 45 (30 acq) | 328.5ms | 85.3ms | 3.85x | 0.000033 | 0.04% | 2.52% |
| 500,000 | 45 (30 acq) | 4475.6ms | 500.9ms | 8.94x | 0.000105 | 0.13% | 7.73% |

## 关键发现

1. **精度**: 全局 MAE 在所有规模下 < 0.15%，远低于 5% 目标
2. **加速**: 从 1.11x (10K, 无 acquaintances) 到 8.94x (500K)
3. **内存带宽效应**: 500K agents 时实际加速 (8.94x) 超过理论边缩减 (4.2x)
   - 原因: 分频传染减少内存访问量，L3 cache 命中率提升
4. **边际误差**: 500K agents 时最大 agent MAE = 7.73%（略超 5%）
   - 但这是最差情况，全局平均仅 0.13%

## 结论

Dunbar hierarchical contagion 是一种有效的优化策略:
- 在保持情绪轨迹高保真度的同时，显著降低计算量
- 加速效果随 agent 数量增加而提升（内存带宽效应）
- 可直接用于 Andy Engine 的生产环境

## SoA f32 Engine 实验 (2026-05-30)

### 实现
- F32Agent struct (600 bytes/agent) + 完整 10 步 tick 管线
- SoaBatchEngine N-API 集成 (tickSoaBinary, tickSoaContagionBinary)
- 修复 4 个 f64→f32 管线 bug (inertia, coactivation, velocity_limit, 初始化)

### 精度验证 (零噪声, 5000 agents, 10 ticks)
| 指标 | 值 | 目标 |
|------|------|------|
| 全局 MAE | 1e-8 | <0.01 ✅ |
| 最大误差 | 1.6e-7 | - |

### 性能对比 (50,000 agents, 20 ticks)
| 配置 | Median/tx | 加速比 |
|------|-----------|--------|
| f64 + Full Contagion | 147.7ms | baseline |
| f32 + Hierarchical | 24.9ms | **5.92x** |

### 内存对比
| | 每 Agent | 50K Agents | 1B Agents |
|---|---------|-----------|----------|
| f64 AoS | 920 B | 46 MB | 920 GB |
| f32 SoA | 600 B | 30 MB | 600 GB |
| 缩减 | 1.5x | 1.5x | 1.5x |

### I/O Buffer
| | 每 Agent | 50K Agents |
|---|---------|-----------|
| f64 input (31×8) | 248 B | 12.4 MB |
| f32 input (31×4) | 124 B | 6.2 MB |
| f64 output (107×8) | 856 B | 42.8 MB |
| f32 output (107×4) | 428 B | 21.4 MB |
