/**
 * Reference Host Verifier (W0 / Patch A)
 *
 * Binds the reference-host:verify flow to the current HEAD and proves the
 * fail-closed negative path: a stale --require-commit must produce
 * status=fail. This is the "旧 tarball/错误 commit 必须失败" negative test
 * from RFC §13.
 *
 * The verifier packs the engine, installs it in a clean temp host, and runs
 * the host guard + evaluation suite. We assert the manifest contract rather
 * than re-implementing the flow.
 */

import { describe, it, expect } from 'vitest';
import { spawnSync } from 'child_process';
import { readFileSync } from 'fs';
import path from 'path';

const ROOT = process.cwd();
const VERIFY = path.join(ROOT, 'scripts', 'reference-host-verify.js');

function runVerify(extraArgs = []) {
  const res = spawnSync('node', [VERIFY, ...extraArgs], {
    cwd: ROOT,
    encoding: 'utf-8',
    timeout: 60000,
  });
  // The verifier writes the JSON manifest to stdout (last JSON object).
  const stdout = res.stdout || '';
  const match = stdout.match(/\{[\s\S]*\}/);
  const manifest = match ? JSON.parse(match[0]) : null;
  return { status: res.status, stdout, stderr: res.stderr || '', manifest };
}

function gitHead() {
  const r = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf-8' });
  return r.stdout.trim();
}

describe('reference-host:verify (W0)', () => {
  it('happy path: manifest status=pass and binds to current HEAD', () => {
    const head = gitHead();
    const { status, manifest } = runVerify();

    expect(status).toBe(0);
    expect(manifest).not.toBeNull();
    expect(manifest.schemaVersion).toBe('1.0.0');
    expect(manifest.status).toBe('pass');
    expect(manifest.engineCommit).toBe(head);
    expect(manifest.engineVersion).toBe(
      JSON.parse(readFileSync(path.join(ROOT, 'package.json'), 'utf-8')).version
    );
    expect(manifest.artifactIntegrity).toMatch(/^sha512-/);
    expect(manifest.artifactShasum).toMatch(/^[0-9a-f]{40}$/);
    expect(manifest.hostSuite.failed).toBe(0);
    expect(manifest.hostSuite.passed).toBeGreaterThan(0);
    expect(manifest.hostSuite.guardPassed).toBe(true);
    // errors must be absent on pass (fail-closed: no silent pass)
    expect(manifest.errors).toBeUndefined();
  }, 60000);

  it('negative: stale --require-commit produces status=fail with commit mismatch', () => {
    const stale = '0'.repeat(40);
    const { status, manifest } = runVerify(['--require-commit', stale]);

    expect(status).toBe(1);
    expect(manifest).not.toBeNull();
    expect(manifest.status).toBe('fail');
    expect(Array.isArray(manifest.errors)).toBe(true);
    expect(manifest.errors.some((e) => e.includes('commit mismatch'))).toBe(true);
    // The suite itself still ran fine; the failure is purely the commit binding.
    expect(manifest.engineCommit).toBe(gitHead());
  }, 60000);
});
