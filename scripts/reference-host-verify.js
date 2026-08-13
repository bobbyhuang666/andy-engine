#!/usr/bin/env node
/**
 * Reference Host Verifier (RFC W0 / Patch A)
 *
 * Proves that an external host can consume the CURRENT HEAD's packed npm
 * artifact — not a stale tarball, not the source tree. This is the
 * authoritative Integration Beta "current artifact" evidence flow.
 *
 * Flow:
 *   1. Record current git commit + engine version.
 *   2. `npm pack --json` the engine into a controlled tarball.
 *   3. Create a clean temp host dir (no node_modules, no lock, no old tgz).
 *   4. Copy reference-host source (src/, test/, scenarios/, package.json)
 *      and rewrite the andy-engine dependency to the fresh tarball path.
 *   5. `npm install` in the temp host.
 *   6. Run no-internal-access guard + evaluation-bundle suite.
 *   7. Emit a machine-readable run manifest (JSON) to stdout.
 *
 * Exit 0 on success, 1 on any failure.
 *
 * Flags:
 *   --require-commit <sha>  Fail if manifest engineCommit !== <sha>.
 *                           Used by CI / negative tests to bind result to HEAD.
 *   --write-manifest <path> Also write the manifest JSON to <path>.
 *
 * Usage: node scripts/reference-host-verify.js [--require-commit <sha>]
 *                                              [--write-manifest <path>]
 */
'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const HOST_SRC = path.join(ROOT, 'reference-host');

// ─── CLI args ────────────────────────────────────────────────────────────

function parseArgs(argv) {
  const args = { requireCommit: null, writeManifest: null };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--require-commit') args.requireCommit = argv[++i];
    else if (argv[i] === '--write-manifest') args.writeManifest = argv[++i];
  }
  return args;
}

// ─── Helpers ─────────────────────────────────────────────────────────────

function run(cmd, args, opts = {}) {
  return spawnSync(cmd, args, {
    cwd: opts.cwd || ROOT,
    encoding: 'utf-8',
    stdio: opts.stdio || 'pipe',
    env: { ...process.env, ...(opts.env || {}) },
  });
}

function gitHead() {
  const r = run('git', ['rev-parse', 'HEAD']);
  if (r.status !== 0) throw new Error('cannot resolve git HEAD: ' + r.stderr);
  return r.stdout.trim();
}

/**
 * Working-tree cleanliness. `npm pack` includes uncommitted changes, so the
 * manifest's `engineCommit` only truly binds the artifact when the tree is
 * clean. Dirty tree + CI → hard fail (the artifact cannot be attributed to
 * engineCommit); dirty tree locally → warn only (pre-commit iteration).
 */
function gitStatusPorcelain() {
  const r = run('git', ['status', '--porcelain']);
  if (r.status !== 0) throw new Error('cannot check git status: ' + r.stderr);
  return r.stdout.trim();
}

function engineVersion() {
  return require(path.join(ROOT, 'package.json')).version;
}

/** Recursively copy a directory, skipping excluded entries. */
function copyDir(src, dst, skip) {
  fs.mkdirSync(dst, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    if (skip.has(entry.name)) continue;
    const s = path.join(src, entry.name);
    const d = path.join(dst, entry.name);
    if (entry.isDirectory()) copyDir(s, d, skip);
    else fs.copyFileSync(s, d);
  }
}

/** Parse evaluation-bundle.test.js "N passed, M failed" summary line. */
function parseSuiteSummary(output) {
  const m = output.match(/(\d+)\s+passed,\s+(\d+)\s+failed/);
  if (!m) return { passed: 0, failed: 1, skipped: 0 };
  return {
    passed: Number(m[1]),
    failed: Number(m[2]),
    skipped: 0,
  };
}

// ─── Main verifier ───────────────────────────────────────────────────────

function verify(args) {
  const errors = [];
  const commit = gitHead();
  const version = engineVersion();

  // Working-tree cleanliness: npm pack includes uncommitted changes, so a
  // dirty tree weakens the engineCommit↔artifact binding. Fail hard in CI
  // (checkout is expected clean); warn locally for pre-commit iteration.
  const workingTreeDirty = gitStatusPorcelain().length > 0;
  const isCI = process.env.CI === 'true' || process.env.GITHUB_ACTIONS === 'true';
  if (workingTreeDirty && isCI) {
    errors.push(
      'working tree is dirty in CI: packed artifact includes uncommitted ' +
      'changes, so engineCommit does not bind the artifact. Commit or stash first.'
    );
  }
  if (workingTreeDirty && !isCI) {
    console.error('[reference-host-verify] warning: working tree is dirty — ' +
      'the packed artifact includes uncommitted changes; engineCommit binding is advisory only.');
  }

  // 1. Pack the engine into a tarball.
  const packResult = run('npm', ['pack', '--json'], { stdio: ['pipe', 'pipe', 'pipe'] });
  if (packResult.status !== 0) {
    throw new Error('npm pack failed: ' + packResult.stderr);
  }
  let packInfo;
  try {
    packInfo = JSON.parse(packResult.stdout)[0];
  } catch (e) {
    throw new Error('cannot parse npm pack output: ' + e.message);
  }
  const tarballPath = path.join(ROOT, packInfo.filename);
  if (!fs.existsSync(tarballPath)) {
    throw new Error(`packed tarball not found: ${tarballPath}`);
  }

  // 2. Create a clean temp host.
  const tmpHost = fs.mkdtempSync(path.join(os.tmpdir(), 'andy-ref-host-'));
  try {
    // Copy reference-host source — exclude node_modules, lock, artifacts, tgz.
    copyDir(HOST_SRC, tmpHost, new Set([
      'node_modules', 'package-lock.json', 'artifacts',
      'andy-engine-2.0.1.tgz', '.DS_Store',
    ]));

    // Rewrite package.json: point andy-engine at the fresh tarball.
    const hostPkg = JSON.parse(fs.readFileSync(path.join(tmpHost, 'package.json'), 'utf-8'));
    hostPkg.dependencies = { 'andy-engine': `file:${tarballPath}` };
    fs.writeFileSync(
      path.join(tmpHost, 'package.json'),
      JSON.stringify(hostPkg, null, 2) + '\n',
    );

    // 3. Install in the temp host.
    const installResult = run('npm', ['install', '--no-audit', '--no-fund'], {
      cwd: tmpHost,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    if (installResult.status !== 0) {
      throw new Error('temp host npm install failed:\n' + installResult.stderr);
    }

    // 4. Verify the host resolves andy-engine to the packed tarball (not source).
    //    The engine's `exports` field forbids `require('andy-engine/package.json')`,
    //    so read the installed copy's package.json via fs and check the resolved
    //    main entry lives inside the temp host's node_modules (not the source tree).
    const installedPkgPath = path.join(tmpHost, 'node_modules', 'andy-engine', 'package.json');
    let resolvedVersion = null;
    let resolvesToArtifact = false;
    if (fs.existsSync(installedPkgPath)) {
      resolvedVersion = JSON.parse(fs.readFileSync(installedPkgPath, 'utf-8')).version;
      const resolveResult = run('node', ['-e', "console.log(require.resolve('andy-engine'))"], {
        cwd: tmpHost,
      });
      // os.tmpdir() may be a symlinked path (e.g. /var → /private/var on macOS);
      // compare against the realpath to match Node's resolved path.
      const tmpHostReal = fs.realpathSync(tmpHost);
      resolvesToArtifact = resolveResult.status === 0 &&
        resolveResult.stdout.trim().startsWith(path.join(tmpHostReal, 'node_modules'));
    }
    if (resolvedVersion !== version) {
      errors.push(
        `host installed andy-engine@${resolvedVersion}, expected ${version} ` +
        '(artifact is not the current HEAD pack)'
      );
    }
    if (!resolvesToArtifact) {
      errors.push('host does not resolve andy-engine to the installed artifact in node_modules');
    }

    // 5. Run no-internal-access guard.
    const guardResult = run('node', ['test/no-internal-access.js'], {
      cwd: tmpHost,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    if (guardResult.status !== 0) {
      errors.push('no-internal-access guard failed:\n' + guardResult.stdout + guardResult.stderr);
    }

    // 6. Run evaluation-bundle suite.
    const suiteResult = run('node', ['test/evaluation-bundle.test.js'], {
      cwd: tmpHost,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    const suite = parseSuiteSummary(suiteResult.stdout);
    if (suiteResult.status !== 0 || suite.failed > 0) {
      errors.push(`evaluation-bundle suite failed: ${suite.passed} passed, ${suite.failed} failed\n` + suiteResult.stdout);
    }

    // 7. Emit manifest.
    const manifest = {
      schemaVersion: '1.0.0',
      engineCommit: commit,
      engineVersion: version,
      workingTreeDirty,
      artifactIntegrity: packInfo.integrity || null,
      artifactShasum: packInfo.shasum || null,
      artifactFile: packInfo.filename,
      nodeVersion: process.version,
      hostSuite: {
        passed: suite.passed,
        failed: suite.failed,
        skipped: suite.skipped,
        guardPassed: guardResult.status === 0,
      },
      generatedAt: new Date().toISOString(),
    };

    // 8. Bind to expected commit (CI / negative test).
    if (args.requireCommit && manifest.engineCommit !== args.requireCommit) {
      errors.push(
        `commit mismatch: manifest ${manifest.engineCommit} !== required ${args.requireCommit}`
      );
    }

    const ok = errors.length === 0;
    manifest.status = ok ? 'pass' : 'fail';
    manifest.errors = ok ? undefined : errors;

    if (args.writeManifest) {
      fs.writeFileSync(args.writeManifest, JSON.stringify(manifest, null, 2) + '\n');
    }
    process.stdout.write(JSON.stringify(manifest, null, 2) + '\n');

    if (!ok) {
      process.exitCode = 1;
    }
  } finally {
    // Best-effort cleanup of the temp host + tarball.
    try { fs.rmSync(tmpHost, { recursive: true, force: true }); } catch (_) {}
    try { fs.rmSync(tarballPath, { force: true }); } catch (_) {}
  }
}

verify(parseArgs(process.argv.slice(2)));
