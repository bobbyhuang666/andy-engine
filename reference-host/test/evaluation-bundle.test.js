#!/usr/bin/env node
/**
 * Evaluation Bundle Test
 *
 * Verifies that createEvaluationBundle() produces a conformant bundle
 * that follows the blinding rules and contract schema.
 *
 * This test uses the packed tarball's public exports only.
 * Run: node reference-host/test/evaluation-bundle.test.js
 */

'use strict';

const path = require('path');
const fs = require('fs');

const AndyEngine = require('andy-engine');
const { createEvaluationBundle, validateBundle, contentHash } = require('../src/evaluation-bundle');

let passed = 0;
let failed = 0;

function check(name, fn) {
  try {
    fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (e) {
    console.log(`  ✗ ${name}: ${e.message}`);
    failed++;
  }
}

// ─── Basic bundle creation ───

check('createEvaluationBundle returns a bundle object', () => {
  const engine = new AndyEngine({ seed: 42 });
  engine.createCharacter({ id: 'alice', name: 'Alice', mbti: 'INFP' });
  const tickResults = engine.runTicks(3);

  const bundle = createEvaluationBundle({
    engine,
    worldId: 'test-basic',
    tickRange: { start: 1, end: 3 },
    tickResults,
    seed: 42,
  });

  if (!bundle || typeof bundle !== 'object') throw new Error('not an object');
  if (!bundle.bundleId) throw new Error('missing bundleId');
  if (bundle.worldId !== 'test-basic') throw new Error('wrong worldId');
});

check('bundle has required top-level fields', () => {
  const engine = new AndyEngine({ seed: 7 });
  engine.createCharacter({ id: 'bob', name: 'Bob', mbti: 'ESTJ' });
  const tickResults = engine.runTicks(2);

  const bundle = createEvaluationBundle({
    engine,
    worldId: 'test-fields',
    tickRange: { start: 1, end: 2 },
    tickResults,
    seed: 7,
  });

  const required = ['bundleId', 'worldId', 'tickRange', 'createdAt',
    'engineVersion', 'characters', 'evidenceChain', 'blindedOutputs', 'metadata'];
  for (const field of required) {
    if (!(field in bundle)) throw new Error(`missing field: ${field}`);
  }
});

check('bundle metadata has correct schema version', () => {
  const engine = new AndyEngine({ seed: 1 });
  engine.createCharacter({ id: 'a', name: 'A', mbti: 'INFP' });
  const tickResults = engine.runTicks(1);

  const bundle = createEvaluationBundle({
    engine,
    worldId: 'test-meta',
    tickRange: { start: 1, end: 1 },
    tickResults,
    seed: 1,
  });

  if (bundle.metadata.bundleSchemaVersion !== '1.0.0') {
    throw new Error(`wrong schema version: ${bundle.metadata.bundleSchemaVersion}`);
  }
});

check('bundle characters are from snapshot (not live handles)', () => {
  const engine = new AndyEngine({ seed: 42 });
  engine.createCharacter({ id: 'alice', name: 'Alice', mbti: 'INFP' });
  engine.tick();

  const bundle = createEvaluationBundle({
    engine,
    worldId: 'test-chars',
    tickRange: { start: 1, end: 1 },
    tickResults: [engine.tick()],
    seed: 42,
  });

  if (!Array.isArray(bundle.characters)) throw new Error('characters is not an array');
  if (bundle.characters.length < 1) throw new Error('no characters in bundle');

  const alice = bundle.characters.find(c => c.id === 'alice');
  if (!alice) throw new Error('alice not found in characters');
  if (alice.name !== 'Alice') throw new Error('wrong name');
  // Character entries should only have id, name, position
  const keys = Object.keys(alice).sort();
  if (keys.join(',') !== 'id,name,position') {
    throw new Error(`character has extra fields: ${keys}`);
  }
});

// ─── Evidence chain ───

check('evidence chain has one entry per tick result', () => {
  const engine = new AndyEngine({ seed: 42 });
  engine.createCharacter({ id: 'a', name: 'A', mbti: 'INFP' });
  const tickResults = engine.runTicks(5);

  const bundle = createEvaluationBundle({
    engine,
    worldId: 'test-chain',
    tickRange: { start: 1, end: 5 },
    tickResults,
    seed: 42,
  });

  if (bundle.evidenceChain.length !== 5) {
    throw new Error(`expected 5 entries, got ${bundle.evidenceChain.length}`);
  }
});

check('evidence chain entries have tickNumber and time', () => {
  const engine = new AndyEngine({ seed: 99 });
  engine.createCharacter({ id: 'a', name: 'A', mbti: 'INFP' });
  const tickResults = engine.runTicks(2);

  const bundle = createEvaluationBundle({
    engine,
    worldId: 'test-chain-fields',
    tickRange: { start: 1, end: 2 },
    tickResults,
    seed: 99,
  });

  for (const entry of bundle.evidenceChain) {
    if (typeof entry.tickNumber !== 'number') throw new Error('missing tickNumber');
    if (typeof entry.time !== 'string') throw new Error('missing time');
    if (typeof entry.snapshotHash !== 'string') throw new Error('missing snapshotHash');
  }
});

check('evidence chain includes effectSummary from A1', () => {
  const engine = new AndyEngine({ seed: 42 });
  engine.createCharacter({ id: 'a', name: 'A', mbti: 'INFP' });
  engine.createCharacter({ id: 'b', name: 'B', mbti: 'ESTJ' });
  const tickResults = engine.runTicks(3);

  const bundle = createEvaluationBundle({
    engine,
    worldId: 'test-a1',
    tickRange: { start: 1, end: 3 },
    tickResults,
    seed: 42,
  });

  // At least one tick should have effectSummary
  const withEffectSummary = bundle.evidenceChain.filter(e => e.effectSummary);
  if (withEffectSummary.length === 0) {
    throw new Error('no evidence chain entries have effectSummary');
  }

  for (const entry of withEffectSummary) {
    if (!entry.effectSummary.counts) throw new Error('effectSummary missing counts');
    if (typeof entry.effectSummary.counts.applied !== 'number') {
      throw new Error('effectSummary.counts.applied is not a number');
    }
  }
});

// ─── Blinding verification ───

check('bundle does not contain raw fact arrays (allowedFacts, inferredFacts, forbiddenFacts)', () => {
  const engine = new AndyEngine({ seed: 42, enableFacts: true });
  engine.createCharacter({ id: 'a', name: 'A', mbti: 'INFP' });
  const tickResults = engine.runTicks(2);

  const bundle = createEvaluationBundle({
    engine,
    worldId: 'test-blinding',
    tickRange: { start: 1, end: 2 },
    tickResults,
    seed: 42,
  });

  const serialized = JSON.stringify(bundle);
  const forbiddenPatterns = [
    /"allowedFacts"\s*:\s*\[/,
    /"inferredFacts"\s*:\s*\[/,
    /"forbiddenFacts"\s*:\s*\[/,
  ];
  for (const pattern of forbiddenPatterns) {
    if (pattern.test(serialized)) {
      throw new Error(`blinding violation: ${pattern.source} found in bundle`);
    }
  }
});

check('bundle does not contain full snapshot data', () => {
  const engine = new AndyEngine({ seed: 42 });
  engine.createCharacter({ id: 'a', name: 'A', mbti: 'INFP' });
  const snap = engine.snapshot();
  const tickResults = engine.runTicks(1);

  const bundle = createEvaluationBundle({
    engine,
    worldId: 'test-no-snapshot',
    tickRange: { start: 1, end: 1 },
    tickResults,
    snapshots: [{ tickNumber: 1, snapshot: snap }],
    seed: 42,
  });

  // Should have snapshotHash, not the raw snapshot
  const firstEntry = bundle.evidenceChain[0];
  if (!firstEntry.snapshotHash || firstEntry.snapshotHash === 'no_snapshot_captured') {
    throw new Error('snapshot hash should be populated when snapshot provided');
  }
  // The hash should be a SHA-256 hex string (64 chars)
  if (firstEntry.snapshotHash.length !== 64) {
    throw new Error(`snapshotHash should be 64 chars, got ${firstEntry.snapshotHash.length}`);
  }

  // The raw snapshot should NOT appear in the bundle
  const serialized = JSON.stringify(bundle);
  if (serialized.includes('"socialGraph"') && serialized.includes('"weatherChangedAt"')) {
    throw new Error('full snapshot data leaked into bundle');
  }
});

// ─── Validate bundle ───

check('validateBundle returns valid for a well-formed bundle', () => {
  const engine = new AndyEngine({ seed: 42 });
  engine.createCharacter({ id: 'a', name: 'A', mbti: 'INFP' });
  const tickResults = engine.runTicks(2);

  const bundle = createEvaluationBundle({
    engine,
    worldId: 'test-validate',
    tickRange: { start: 1, end: 2 },
    tickResults,
    seed: 42,
  });

  const result = validateBundle(bundle);
  if (!result.valid) {
    throw new Error(`bundle invalid: ${result.errors.join(', ')}`);
  }
});

check('validateBundle catches missing required fields', () => {
  const result = validateBundle({ bundleId: 'test' });
  if (result.valid) throw new Error('should be invalid');
  if (result.errors.length === 0) throw new Error('should have errors');
});

// ─── Content hash determinism ───

check('contentHash is deterministic', () => {
  const value = { a: 1, b: 'test', c: [1, 2, 3] };
  const hash1 = contentHash(value);
  const hash2 = contentHash(value);
  if (hash1 !== hash2) throw new Error('hashes differ for same input');
  if (hash1.length !== 64) throw new Error('hash should be 64 chars (SHA-256 hex)');
});

// ─── Error handling ───

check('createEvaluationBundle throws for missing params', () => {
  try {
    createEvaluationBundle({});
    throw new Error('should have thrown');
  } catch (e) {
    if (!e.message.includes('requires')) throw e;
  }
});

// ─── Summary ───

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
