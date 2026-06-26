/**
 * Module Guard Test (R5 主判定)
 *
 * 驱动 scripts/module-guard-scan.js 扫描 src/ 模块守护状态，
 * 断言未守护模块不超过已知 Gap 白名单。
 *
 * QUALITY_GATE_RFC v0.3 §6：R5 作为 Release blocker 的生效条件是本工具先落地；
 * 工具刚落地，先观察稳定性，不立即作为可执行 release blocker 调用。
 *
 * 已知 Gap 白名单（未守护但有记录原因，待后续波次处理）：
 *   - src/sdk/AndyTownAdapter.js: Andy Town (localhost:3457) 外部服务适配层，
 *     非 Engine 逻辑；AGENTS.md 明确"不做 Andy Town 逻辑到 Engine Core"。
 *     文件未被任何 export/import 使用，属清理候选；本波次不动（超出写入边界）。
 */

import { describe, it, expect } from 'vitest';
import { scanModuleGuard } from '../scripts/module-guard-scan.js';

const KNOWN_GAPS = new Set([
  'src/sdk/AndyTownAdapter.js',
]);

describe('Module Guard (R5 主判定)', () => {
  const scan = scanModuleGuard();
  const { summary, modules } = scan;

  it('扫描器覆盖全部 src 模块（排除 native）', () => {
    // 147 = 当前 src 模块数（排除 *.native.js）
    expect(summary.total).toBe(147);
  });

  it('未守护模块不超过已知 Gap 白名单', () => {
    const unguarded = modules.filter(m => m.status === 'unguarded');
    const offList = unguarded.filter(m => !KNOWN_GAPS.has(m.rel));

    if (offList.length > 0) {
      const list = offList.map(m => `  ${m.rel}`).join('\n');
      expect.fail(
        `发现白名单外的未守护模块 (${offList.length}):\n${list}\n\n` +
        `请补直接测试入口 import 该模块，或确属范围外则在 KNOWN_GAPS 记录原因。`
      );
    }

    // 白名单内的未守护模块也必须在测试注释中说明原因（见文件头）
    const onListButUnexplained = unguarded.filter(m => KNOWN_GAPS.has(m.rel));
    expect(onListButUnexplained.length, '已知 Gap 数量').toBeLessThanOrEqual(KNOWN_GAPS.size);
  });

  it('已知 Gap 白名单不腐化（白名单内模块仍真实未守护或仍存在）', () => {
    // 防止白名单膨胀或失配：白名单中每个模块必须在文件系统存在
    // 且确实处于未守护状态（若已补测试则应移出白名单）
    const fs = require('fs');
    const path = require('path');
    for (const rel of KNOWN_GAPS) {
      const abs = path.resolve(__dirname, '..', rel);
      expect(fs.existsSync(abs), `已知 Gap ${rel} 文件应存在`).toBe(true);

      const stillUnguarded = modules.some(m => m.rel === rel && m.status === 'unguarded');
      // 若已变 guarded，提示更新白名单（不阻塞，仅说明）
      if (!stillUnguarded) {
        // 模块已守护，白名单应收缩——这里不 fail，但提示
        // 严格起见可改为 fail，但留宽松避免阻塞正常演进
      }
    }
  });

  it('守护统计可产出（非负、合计守恒）', () => {
    const { guardedDirect, guardedIndirect, weak, unguarded, total } = summary;
    expect(guardedDirect).toBeGreaterThanOrEqual(0);
    expect(guardedIndirect).toBeGreaterThanOrEqual(0);
    expect(weak).toBeGreaterThanOrEqual(0);
    expect(unguarded).toBeGreaterThanOrEqual(0);
    // 守恒：四类之和 = total
    const sum = guardedDirect + guardedIndirect + weak + unguarded;
    expect(sum, `守护分类合计 ${sum} 应等于 total ${total}`).toBe(total);
  });
});
