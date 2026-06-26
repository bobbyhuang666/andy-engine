/**
 * Replay Diff Tool 单元测试 (REPLAY_TRUST_ROADMAP §4)
 *
 * 覆盖：diff 检测（扰动应报 diff）、--accept-intentional 语义、报告格式、_meta 合规检查。
 * 不跑完整 100 tick 回放（慢），用合成 fixture 验证算法与报告逻辑。
 */

import { describe, it, expect } from 'vitest';
const { diffHashes, validateMeta, renderReport } = require('../../scripts/replay-diff.js');

describe('replay-diff: diffHashes', () => {
  it('两序列完全一致 → 0 mismatched', () => {
    const hashes = [
      { tick: 0, hash: 'aaa' },
      { tick: 1, hash: 'bbb' },
    ];
    const diff = diffHashes(hashes, hashes);
    expect(diff.total).toBe(2);
    expect(diff.matched).toBe(2);
    expect(diff.mismatched).toBe(0);
    expect(diff.details).toEqual([]);
  });

  it('某 tick hash 不一致 → 报 diff', () => {
    const golden = [{ tick: 0, hash: 'aaa' }, { tick: 1, hash: 'bbb' }];
    const current = [{ tick: 0, hash: 'aaa' }, { tick: 1, hash: 'XXX' }];
    const diff = diffHashes(golden, current);
    expect(diff.mismatched).toBe(1);
    expect(diff.details[0]).toEqual({ tick: 1, expected: 'bbb', actual: 'XXX' });
  });

  it('长度不一致 → 缺失 tick 报 <missing>', () => {
    const golden = [{ tick: 0, hash: 'aaa' }, { tick: 1, hash: 'bbb' }];
    const current = [{ tick: 0, hash: 'aaa' }];
    const diff = diffHashes(golden, current);
    expect(diff.total).toBe(2);
    expect(diff.mismatched).toBe(1);
    expect(diff.details[0].actual).toBe('<missing>');
  });

  it('空序列 → 0 diff', () => {
    const diff = diffHashes([], []);
    expect(diff.total).toBe(0);
    expect(diff.mismatched).toBe(0);
  });
});

describe('replay-diff: validateMeta', () => {
  it('完整 _meta → valid', () => {
    const fixture = {
      _meta: {
        engineVersion: '2.0.1', schemaVersion: '0.1.0', domainId: 'campus',
        seed: 42, ticks: 100, startTime: '2026-09-01T08:00:00Z',
        nodeVersion: '26', nativeMode: 'disabled', generationCommand: 'npm run golden:regen',
      },
    };
    const check = validateMeta(fixture);
    expect(check.valid).toBe(true);
    expect(check.missing).toEqual([]);
  });

  it('缺 _meta → invalid，报告 _meta 缺失', () => {
    const check = validateMeta({});
    expect(check.valid).toBe(false);
    expect(check.missing).toContain('_meta');
  });

  it('缺部分前提字段 → invalid，报告具体缺失', () => {
    const fixture = {
      _meta: { engineVersion: '2.0.1', seed: 42 }, // 缺 schemaVersion 等
    };
    const check = validateMeta(fixture);
    expect(check.valid).toBe(false);
    expect(check.missing).toContain('schemaVersion');
  });
});

describe('replay-diff: renderReport', () => {
  const metaCheck = { valid: true, missing: [] };

  it('无 diff → 报告含 ✓ 一致', () => {
    const diff = { total: 100, matched: 100, mismatched: 0, details: [] };
    const report = renderReport(diff, metaCheck, false, '/fake/fixture.json');
    expect(report).toContain('matched: 100');
    expect(report).toContain('mismatched: 0');
    expect(report).toContain('✓');
    expect(report).toContain('一致');
  });

  it('有 diff 默认模式 → 报告含判定步骤（修复或 accept-intentional）', () => {
    const diff = {
      total: 2, matched: 1, mismatched: 1,
      details: [{ tick: 1, expected: 'bbb', actual: 'XXX' }],
    };
    const report = renderReport(diff, metaCheck, false, '/fake/fixture.json');
    expect(report).toContain('mismatched: 1');
    expect(report).toContain('tick 1');
    expect(report).toContain('expected (fixture): bbb');
    expect(report).toContain('actual   (current): XXX');
    expect(report).toContain('修复代码');
    expect(report).not.toContain('--accept-intentional: exit code 不 fail');
  });

  it('有 diff + --accept-intentional → 报告含 changelog 义务提示（不豁免）', () => {
    const diff = {
      total: 2, matched: 1, mismatched: 1,
      details: [{ tick: 1, expected: 'bbb', actual: 'XXX' }],
    };
    const report = renderReport(diff, metaCheck, true, '/fake/fixture.json');
    expect(report).toContain('--accept-intentional');
    expect(report).toContain('changelog 义务不豁免');
    expect(report).toContain('golden-corpus-changelog.md');
    expect(report).toContain('golden:regen');
  });

  it('_meta 不合规 → 报告含缺失字段', () => {
    const diff = { total: 0, matched: 0, mismatched: 0, details: [] };
    const metaCheckInvalid = { valid: false, missing: ['_meta', 'schemaVersion'] };
    const report = renderReport(diff, metaCheckInvalid, false, '/fake/fixture.json');
    expect(report).toContain('NO');
    expect(report).toContain('_meta');
    expect(report).toContain('schemaVersion');
  });
});

describe('replay-diff: --accept-intentional 语义（Q3）', () => {
  // Q3: --accept-intentional 仅跳过立即 fail，不跳过 changelog 义务
  // 验证：报告渲染时 acceptIntentional=true 必须含 changelog 提示
  it('acceptIntentional=true 且有 diff → 报告必须含 changelog 提示', () => {
    const diff = { total: 1, matched: 0, mismatched: 1, details: [{ tick: 0, expected: 'a', actual: 'b' }] };
    const report = renderReport(diff, { valid: true, missing: [] }, true, '/fake/fixture.json');
    expect(report).toContain('changelog');
    expect(report).toContain('golden:regen');
  });
});
