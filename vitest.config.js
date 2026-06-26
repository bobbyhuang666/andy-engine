import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,        // 无需 import describe/it/expect
    environment: 'node',  // Node.js 环境
    include: ['tests/**/*.test.js', 'test_vitest.js'],  // 测试文件匹配
    exclude: ['node_modules/', 'test.js'],  // 排除旧测试

    // 超时设置
    testTimeout: 10000,   // 单个测试 10s
    hookTimeout: 10000,   // hooks 10s

    // ESM 配置（兼容 CommonJS 模块）
    deps: {
      inline: [/\.js$/],  // 内联所有 JS 依赖
    },

    // 覆盖率配置
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/',
        'tests/fixtures/',
        '*.config.js',
        // native binding 包装层:在无编译 binding 的环境下整块不可达(走 require 纯 JS fallback),
        // 属环境条件 dead code,排除出分母。若 native binding 可用,需在 binding 环境单独跑覆盖。
        'src/agent/psychology/*.native.js',
      ],
      // thresholds 已移除 (W1, QUALITY_GATE_RFC v0.3 §2 方案 c):
      // Foundation Alpha 阶段 coverage 仅作 trend metric,不作 release/merge blocker。
      // 趋势数据写入 docs/quality/coverage-trend.md; 3pp 回归 warning 见 RFC §2。
    },
  },
});
