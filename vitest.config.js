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
      ],
      thresholds: {
        statements: 80,   // 语句覆盖率 80%
        branches: 70,     // 分支覆盖率 70%
        functions: 85,    // 函数覆盖率 85%
        lines: 80,        // 行覆盖率 80%
      },
    },
  },
});
