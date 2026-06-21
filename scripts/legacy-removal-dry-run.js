#!/usr/bin/env node

/**
 * Stage 23: Legacy Removal Dry Run — No-Debt Gate
 *
 * Distinguishes:
 *   - existing removable debt (files that exist and can be deleted)
 *   - already-deleted files (in classification list but not on disk)
 *   - public facade (must remain)
 *   - approved compatibility adapter (must remain for now)
 *   - approved public wrapper (must remain for now)
 *
 * Gate: reports PASS only when all removable-debt counts are zero.
 *
 * Usage: node scripts/legacy-removal-dry-run.js
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

// ─── Classification from PUBLIC_FACADE_AUDIT.md ───

// Public-approved adapters: documented in PUBLIC_API_CONTRACT.md, part of public API surface
const PUBLIC_APPROVED_ADAPTERS = new Set([
  'agent/Agent.js',
]);

const CLASSIFICATIONS = {
  'index.js': 'public-facade',
  // agent/
  'agent/Agent.js': PUBLIC_APPROVED_ADAPTERS.has('agent/Agent.js') ? 'public-approved-adapter' : 'compatibility-adapter',
  'agent/BehaviorField.js': 'deprecated-wrapper',
  'agent/BehaviorLabeler.js': 'deprecated-wrapper',
  'agent/StateMachine.js': 'deprecated-wrapper',
  'agent/EmotionVector.js': 'deprecated-wrapper',
  'agent/EmotionVector.native.js': 'deprecated-wrapper',
  'agent/EmotionRegulation.js': 'deprecated-wrapper',
  'agent/Appraisal.js': 'deprecated-wrapper',
  'agent/NeedsSystem.js': 'deprecated-wrapper',
  'agent/NeedsSystem.native.js': 'deprecated-wrapper',
  'agent/Personality.js': 'deprecated-wrapper',
  'agent/PersonalMemory.js': 'deprecated-wrapper',
  'agent/ProceduralMemory.js': 'deprecated-wrapper',
  'agent/IntrinsicMotivation.js': 'deprecated-wrapper',
  'agent/Schedule.js': 'deprecated-wrapper',
  'agent/FutureTendencyTracker.js': 'deprecated-wrapper',
  'agent/LocationMeaningInfluence.js': 'deprecated-wrapper',
  // agent/action/ — all wrappers deleted in Stage 25
  'agent/action/ActionCandidate.js': 'deprecated-wrapper',
  'agent/action/UtilityScorer.js': 'deprecated-wrapper',
  'agent/action/UtilitySelector.js': 'deprecated-wrapper',
  'agent/action/GoalSystem.js': 'deprecated-wrapper',
  'agent/action/WorldObject.js': 'deprecated-wrapper',
  'agent/action/providers/CandidateProviderManager.js': 'deprecated-wrapper',
  'agent/action/providers/CandidateProvider.js': 'deprecated-wrapper',
  'agent/action/providers/ContinueCandidateProvider.js': 'deprecated-wrapper',
  'agent/action/providers/NeedCandidateProvider.js': 'deprecated-wrapper',
  'agent/action/providers/ScheduleCandidateProvider.js': 'deprecated-wrapper',
  'agent/action/providers/BehaviorFieldCandidateProvider.js': 'deprecated-wrapper',
  'agent/action/providers/ExploreCandidateProvider.js': 'deprecated-wrapper',
  'agent/action/providers/SocializeCandidateProvider.js': 'deprecated-wrapper',
  // core/
  'core/World.js': 'deprecated-wrapper',
  'core/Simulator.js': 'deprecated-wrapper',
  'core/EventDispatcher.js': 'deprecated-wrapper',
  'core/AndyBridge.js': 'deprecated-wrapper',
  'core/AndyTownAdapter.js': 'deprecated-wrapper',
  'core/EmotionEffectClassifier.js': 'deprecated-wrapper',
  'core/EmotionSignalBuffer.js': 'deprecated-wrapper',
  'core/StoryGenerator.js': 'deprecated-wrapper',
  'core/WorldPressure.js': 'deprecated-wrapper',
  // effects/
  'effects/EventEffectPipeline.js': 'deprecated-wrapper',
  // facts/
  'facts/index.js': 'public-facade',
  'facts/WorldFactStore.js': 'deprecated-wrapper',
  'facts/FactSchema.js': 'deprecated-wrapper',
  'facts/CanonEventPipeline.js': 'deprecated-wrapper',
  'facts/KnowledgeStore.js': 'deprecated-wrapper',
  'facts/FactProvider.js': 'deprecated-wrapper',
  'facts/FactConsistencyChecker.js': 'deprecated-wrapper',
  'facts/FactEmitter.js': 'deprecated-wrapper',
  'facts/FactFormatter.js': 'deprecated-wrapper',
  // social/
  'social/SocialGraph.js': 'deprecated-wrapper',
  'social/Relationship.js': 'deprecated-wrapper',
  // spatial/
  'spatial/SpatialEngine.js': 'deprecated-wrapper',
  'spatial/SpatialHash.js': 'deprecated-wrapper',
  'spatial/RegionGrid.js': 'deprecated-wrapper',
  'spatial/WorldMap.js': 'deprecated-wrapper',
  // domain/
  'domain/index.js': 'public-facade',
  'domain/ForbiddenTerms.js': 'deprecated-wrapper',
  // config/
  'config/validate.js': 'deprecated-wrapper',
  // store/
  'store/index.js': 'public-facade',
  'store/SQLiteStore.js': 'deprecated-wrapper',
  'store/SimulationStore.js': 'deprecated-wrapper',
  'store/SnapshotStore.js': 'deprecated-wrapper',
  'store/StoryStore.js': 'deprecated-wrapper',
  'store/MetaStore.js': 'deprecated-wrapper',
  // sdk/
  'sdk/index.js': 'public-facade',
  'sdk/Character.js': 'deprecated-wrapper',
  'sdk/Andy.js': 'deprecated-wrapper',
  'sdk/LLMAdapter.js': 'deprecated-wrapper',
  'sdk/NarrativeBuilder.js': 'deprecated-wrapper',
  'sdk/ConversationLog.js': 'deprecated-wrapper',
  'sdk/AutoTick.js': 'deprecated-wrapper',
  // world/
  'world/WorldStateAdapter.js': 'deprecated-wrapper',
  'world/validator.js': 'deprecated-wrapper',
  'world/compiler.js': 'deprecated-wrapper',
  'world/migration.js': 'deprecated-wrapper',
  // root test scripts
  'test.js': 'removable',
  'test_pipeline.js': 'removable',
  'test_soa.js': 'removable',
  'test_soa_contagion.js': 'removable',
  'test_soa_debug.js': 'removable',
  'test_store.js': 'removable',
};

// ─── package.json exports ───

const EXPORTS = {
  '.': 'index.js',
  './sdk': 'sdk/index.js',
  './domain': 'domain/index.js',
  './domain/validate': 'src/domain/validateDomain.js',
  './domain/registry': 'src/domain/DomainRegistry.js',
  './facts': 'facts/index.js',
  './store': 'store/index.js',
  './config/defaults': 'src/config/defaults.js',
  './presets/campus': 'presets/campus/index.js',
  './presets/tavern': 'presets/tavern/index.js',
};

// Invert: file path → export key
const FILE_TO_EXPORT = {};
for (const [key, file] of Object.entries(EXPORTS)) {
  FILE_TO_EXPORT[file] = key;
}

// ─── Scan for imports ───

function scanImports(dir, pattern) {
  const results = {};
  if (!fs.existsSync(dir)) return results;

  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      const sub = scanImports(fullPath, pattern);
      Object.assign(results, sub);
    } else if (entry.name.endsWith('.js')) {
      const content = fs.readFileSync(fullPath, 'utf8');
      const matches = content.match(pattern);
      if (matches) {
        results[fullPath] = matches;
      }
    }
  }
  return results;
}

// Pattern to match require() or import() for a specific file
function buildImportPattern(oldPath) {
  const dir = path.dirname(oldPath);
  const base = path.basename(oldPath, '.js');
  const escaped = dir.replace(/[.*+?^${}()|[\]\\\/]/g, '\\$&');
  const baseEscaped = base.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // Match any relative path to the file:
  //   require('../dir/base'), require('../../dir/base'), require('./base')
  // The (?:dir/)? makes the directory optional for same-directory imports
  return new RegExp(`(?:require|import)\\(['"](?:\\.\\.?\\/)*(?:${escaped}\\/)?${baseEscaped}(?:\\.js)?['"]\\)`, 'g');
}

// Pattern to match require('./dir') or import('./dir') for index.js files
function buildIndexImportPattern(dirName) {
  return new RegExp(`(?:require|import)\\(['"]\\.\\.?\\/${dirName}(?:\\/index)?['"]\\)`, 'g');
}

function checkFileImportedBy(oldPath, scanDir, rootOnly) {
  const dir = path.dirname(oldPath);
  const base = path.basename(oldPath);

  let pattern;
  if (base === 'index.js') {
    pattern = buildIndexImportPattern(dir);
  } else {
    pattern = buildImportPattern(oldPath);
  }

  const results = scanImports(scanDir, pattern);
  const oldFullPath = path.resolve(ROOT, oldPath);

  return Object.keys(results).filter(importingFile => {
    // If rootOnly, only check files directly in the root directory
    if (rootOnly) {
      const relPath = path.relative(ROOT, importingFile);
      if (relPath.includes(path.sep)) return false; // skip subdirectory files
    }
    const content = fs.readFileSync(importingFile, 'utf8');
    const matches = content.match(pattern);
    if (!matches) return false;

    for (const match of matches) {
      const reqPathMatch = match.match(/['"]([^'"]+)['"]/);
      if (!reqPathMatch) continue;
      const reqPath = reqPathMatch[1];

      // Resolve the require path relative to the importing file
      const resolved = path.resolve(path.dirname(importingFile), reqPath);
      // Add .js if no extension
      const resolvedWithExt = resolved.endsWith('.js') ? resolved : resolved + '.js';

      // Check if this resolves to the old top-level file
      if (resolvedWithExt === oldFullPath) return true;

      // For index.js patterns, also check directory resolution
      if (base === 'index.js') {
        const resolvedDir = path.resolve(path.dirname(importingFile), reqPath);
        const oldDir = path.dirname(oldFullPath);
        if (resolvedDir === oldDir) return true;
      }
    }
    return false;
  });
}

// ─── Main analysis ───

const OLD_TOP_DIRS = [
  'agent', 'core', 'effects', 'facts', 'social', 'spatial',
  'domain', 'config', 'store', 'sdk', 'world',
];

function checkFileImportedByOldDirs(oldPath) {
  const results = [];
  // Check root-level files
  const rootFiles = checkFileImportedBy(oldPath, ROOT, true);
  results.push(...rootFiles);
  // Check old top-level directories
  for (const dir of OLD_TOP_DIRS) {
    const dirPath = path.join(ROOT, dir);
    if (fs.existsSync(dirPath)) {
      const dirResults = checkFileImportedBy(oldPath, dirPath);
      results.push(...dirResults);
    }
  }
  return results;
}

function analyzeFile(oldPath) {
  const classification = CLASSIFICATIONS[oldPath];
  const fullPath = path.join(ROOT, oldPath);
  const exists = fs.existsSync(fullPath);

  const isExported = FILE_TO_EXPORT[oldPath] || false;
  const exportKey = isExported || '-';

  const importedBySrc = checkFileImportedBy(oldPath, path.join(ROOT, 'src'));
  const importedByTests = checkFileImportedBy(oldPath, path.join(ROOT, 'tests'));
  const importedByExamples = checkFileImportedBy(oldPath, path.join(ROOT, 'examples'));
  const importedByDocs = checkFileImportedBy(oldPath, path.join(ROOT, 'docs'));
  // Check imports from old top-level directories (agent/, core/, facts/, etc.)
  // and root-level files (index.js)
  const importedByOldDirs = checkFileImportedByOldDirs(oldPath);

  // Decision logic — only applies to existing files
  let canRemove = false;
  const blockers = [];

  if (!exists) {
    // File already deleted — not a debt candidate
    return {
      oldPath,
      classification,
      exists: false,
      isExported: isExported ? 'yes' : 'no',
      exportKey,
      importedBySrc: 0,
      importedBySrcFiles: [],
      importedByTests: 0,
      importedByTestsFiles: [],
      importedByExamples: 0,
      importedByDocs: 0,
      importedByOldDirs: 0,
      canRemove: false,
      blockers: [],
      status: 'already-removed',
    };
  }

  // File exists — determine if it can be removed
  if (classification === 'public-facade') {
    canRemove = false;
    blockers.push('public-facade: needs breaking release');
  } else if (classification === 'public-approved-adapter') {
    canRemove = false;
    blockers.push('public-approved-adapter: documented in PUBLIC_API_CONTRACT.md');
  } else if (classification === 'compatibility-adapter') {
    if (importedBySrc.length > 0) {
      canRemove = false;
      blockers.push(`imported by src/ (${importedBySrc.length} files)`);
    }
    if (importedByTests.length > 0) {
      canRemove = false;
      blockers.push(`imported by tests/ (${importedByTests.length} files)`);
    }
    if (importedByOldDirs.length > 0) {
      canRemove = false;
      blockers.push(`imported by root-level files (${importedByOldDirs.length} files)`);
    }
    if (isExported) {
      canRemove = false;
      blockers.push(`exported as ${exportKey}`);
    }
    if (blockers.length === 0) {
      canRemove = true;
    }
  } else if (classification === 'standalone-tooling') {
    canRemove = false;
    blockers.push('standalone tooling: must migrate to src/store/');
  } else if (classification === 'deprecated-wrapper') {
    if (isExported) {
      canRemove = false;
      blockers.push(`exported as ${exportKey}`);
    }
    if (importedBySrc.length > 0) {
      canRemove = false;
      blockers.push(`imported by src/ (${importedBySrc.length} files)`);
    }
    if (importedByTests.length > 0) {
      canRemove = false;
      blockers.push(`imported by tests/ (${importedByTests.length} files)`);
    }
    if (importedByOldDirs.length > 0) {
      canRemove = false;
      blockers.push(`imported by root-level files (${importedByOldDirs.length} files)`);
    }
    if (blockers.length === 0) {
      canRemove = true;
    }
  } else if (classification === 'internal-wrapper') {
    if (importedBySrc.length > 0 || importedByTests.length > 0) {
      canRemove = false;
      blockers.push('still imported');
    } else {
      canRemove = true;
    }
  } else if (classification === 'removable') {
    canRemove = true;
  } else {
    canRemove = false;
    blockers.push('unknown classification');
  }

  return {
    oldPath,
    classification,
    exists: true,
    isExported: isExported ? 'yes' : 'no',
    exportKey,
    importedBySrc: importedBySrc.length,
    importedBySrcFiles: importedBySrc.map(f => path.relative(ROOT, f)),
    importedByTests: importedByTests.length,
    importedByTestsFiles: importedByTests.map(f => path.relative(ROOT, f)),
    importedByExamples: importedByExamples.length,
    importedByDocs: importedByDocs.length,
    importedByOldDirs: importedByOldDirs.length,
    canRemove,
    blockers,
    status: canRemove ? 'removable' : 'blocked',
  };
}

// ─── Run ───

console.log('=== Andy Engine: Legacy Removal Dry Run (Stage 23 No-Debt Gate) ===');
console.log(`Date: ${new Date().toISOString()}`);
console.log(`Root: ${ROOT}`);
console.log('');

const results = Object.keys(CLASSIFICATIONS).map(analyzeFile);

// Partition results
const existing = results.filter(r => r.exists);
const alreadyRemoved = results.filter(r => !r.exists);
const existingRemovable = existing.filter(r => r.canRemove);
const existingBlocked = existing.filter(r => !r.canRemove);

// Count standalone-tooling among existing files
const standaloneTooling = existing.filter(r => r.classification === 'standalone-tooling');

// Count unclassified among existing files
const unclassified = existing.filter(r => !CLASSIFICATIONS[r.oldPath]);

// Count public-approved adapters and temporary adapters
const publicApprovedAdapters = existing.filter(r => r.classification === 'public-approved-adapter');
const temporaryAdapters = existing.filter(r => r.classification === 'compatibility-adapter');

// ─── Console output ───

console.log('--- SUMMARY ---');
console.log('');
console.log(`Total classified files: ${results.length}`);
console.log(`  Already removed (not on disk): ${alreadyRemoved.length}`);
console.log(`  Existing files analyzed: ${existing.length}`);
console.log('');
console.log('Existing files by status:');
console.log(`  Can remove now: ${existingRemovable.length}`);
console.log(`  Blocked: ${existingBlocked.length}`);
console.log(`  Public facades (must remain): ${existing.filter(r => r.classification === 'public-facade').length}`);
console.log(`  Public-approved adapters (documented): ${publicApprovedAdapters.length}`);
console.log(`  Temporary adapters (should be migrated): ${temporaryAdapters.length}`);
console.log(`  Standalone tooling outside src: ${standaloneTooling.length}`);
console.log(`  Unclassified old files: ${unclassified.length}`);
console.log('');

// By classification — existing files only
const byClass = {};
for (const r of existing) {
  if (!byClass[r.classification]) byClass[r.classification] = { removable: 0, blocked: 0 };
  if (r.canRemove) byClass[r.classification].removable++;
  else byClass[r.classification].blocked++;
}
console.log('--- BY CLASSIFICATION (existing files only) ---');
for (const [cls, counts] of Object.entries(byClass)) {
  console.log(`  ${cls}: ${counts.removable} removable, ${counts.blocked} blocked`);
}
console.log('');

// Detail table — existing files
console.log('--- DETAIL TABLE (existing files) ---');
console.log('');

const header = [
  'Old File',
  'Classification',
  'Exported?',
  'Imported by src/',
  'Imported by tests/',
  'Imported by root/',
  'Can Remove?',
  'Blockers',
].join(' | ');

console.log(header);
console.log(header.replace(/[^|]/g, '-').replace(/\|/g, '|'));

for (const r of existing) {
  const row = [
    r.oldPath,
    r.classification,
    r.isExported,
    r.importedBySrc > 0 ? `${r.importedBySrc} file(s)` : 'no',
    r.importedByTests > 0 ? `${r.importedByTests} file(s)` : 'no',
    r.importedByOldDirs > 0 ? `${r.importedByOldDirs} file(s)` : 'no',
    r.canRemove ? 'YES' : 'NO',
    r.blockers.length > 0 ? r.blockers.join('; ') : '-',
  ].join(' | ');
  console.log(row);
}

console.log('');

// Already removed files
if (alreadyRemoved.length > 0) {
  console.log('--- ALREADY REMOVED (not on disk) ---');
  console.log('');
  for (const r of alreadyRemoved) {
    console.log(`  ${r.oldPath} [${r.classification}]`);
  }
  console.log('');
}

// Removable existing files
if (existingRemovable.length > 0) {
  console.log('--- EXISTING FILES THAT CAN BE REMOVED NOW ---');
  console.log('');
  for (const r of existingRemovable) {
    console.log(`  ${r.oldPath} [${r.classification}]`);
  }
  console.log('');
}

// Blocked existing files
if (existingBlocked.length > 0) {
  console.log('--- EXISTING FILES BLOCKED FROM REMOVAL ---');
  console.log('');
  for (const r of existingBlocked) {
    console.log(`  ${r.oldPath} [${r.classification}]: ${r.blockers.join('; ')}`);
  }
  console.log('');
}

// ─── Gate check ───

console.log('=== GATE CHECK ===');
console.log('');
console.log(`Existing old files that can be removed now: ${existingRemovable.length}`);
console.log(`Standalone tooling outside src: ${standaloneTooling.length}`);
console.log(`Unclassified old files: ${unclassified.length}`);
console.log(`Public-approved adapters: ${publicApprovedAdapters.length}`);
console.log(`Temporary adapters: ${temporaryAdapters.length}`);
console.log('');

const gatePass = existingRemovable.length === 0
  && standaloneTooling.length === 0
  && unclassified.length === 0
  && temporaryAdapters.length === 0;

if (gatePass) {
  console.log('GATE: PASS — No removable debt remains. All adapters are public-approved.');
} else {
  console.log('GATE: FAIL — Removable debt or temporary adapters still exist.');
  if (existingRemovable.length > 0) {
    console.log(`  FAIL: ${existingRemovable.length} existing file(s) can be removed now`);
  }
  if (standaloneTooling.length > 0) {
    console.log(`  FAIL: ${standaloneTooling.length} standalone tooling file(s) outside src/`);
  }
  if (unclassified.length > 0) {
    console.log(`  FAIL: ${unclassified.length} unclassified old file(s)`);
  }
  if (temporaryAdapters.length > 0) {
    console.log(`  FAIL: ${temporaryAdapters.length} temporary adapter(s) should be migrated or promoted to public-approved`);
    for (const r of temporaryAdapters) {
      console.log(`    - ${r.oldPath}`);
    }
  }
}
console.log('');

// ─── Generate markdown report ───

function generateMarkdown() {
  const lines = [];
  lines.push('# Legacy Removal Report');
  lines.push('');
  lines.push('> Status: no-debt gate (Stage 23).');
  lines.push(`> Date: ${new Date().toISOString().split('T')[0]}.`);
  lines.push('> Purpose: verify zero removable debt remains.');
  lines.push('');
  lines.push('---');
  lines.push('');
  lines.push('## Summary');
  lines.push('');
  lines.push(`| Metric | Count |`);
  lines.push(`|--------|-------|`);
  lines.push(`| Total classified files | ${results.length} |`);
  lines.push(`| Already removed (not on disk) | ${alreadyRemoved.length} |`);
  lines.push(`| Existing files analyzed | ${existing.length} |`);
  lines.push(`| **Can remove now (existing)** | **${existingRemovable.length}** |`);
  lines.push(`| Blocked (existing) | ${existingBlocked.length} |`);
  lines.push(`| Standalone tooling outside src | ${standaloneTooling.length} |`);
  lines.push(`| Unclassified old files | ${unclassified.length} |`);
  lines.push('');
  lines.push('### Gate Check');
  lines.push('');
  lines.push(`| Check | Result |`);
  lines.push(`|-------|--------|`);
  lines.push(`| Existing old files that can be removed now | ${existingRemovable.length} |`);
  lines.push(`| Standalone tooling outside src | ${standaloneTooling.length} |`);
  lines.push(`| Unclassified old files | ${unclassified.length} |`);
  lines.push(`| **Gate** | **${gatePass ? 'PASS' : 'FAIL'}** |`);
  lines.push('');
  lines.push('### By Classification (existing files only)');
  lines.push('');
  lines.push(`| Classification | Removable | Blocked |`);
  lines.push(`|---------------|-----------|---------|`);
  for (const [cls, counts] of Object.entries(byClass)) {
    lines.push(`| ${cls} | ${counts.removable} | ${counts.blocked} |`);
  }
  lines.push('');
  lines.push('---');
  lines.push('');
  lines.push('## Detail Table — Existing Files');
  lines.push('');
  lines.push('| Old File | Classification | Exported? | Imported by src/ | Imported by tests/ | Can Remove? | Blockers |');
  lines.push('|----------|---------------|-----------|-----------------|-------------------|-------------|----------|');
  for (const r of existing) {
    const srcDetail = r.importedBySrc > 0 ? `yes (${r.importedBySrc})` : 'no';
    const testDetail = r.importedByTests > 0 ? `yes (${r.importedByTests})` : 'no';
    const removeStatus = r.canRemove ? '**YES**' : 'NO';
    const blockers = r.blockers.length > 0 ? r.blockers.join('; ') : '-';
    lines.push(`| \`${r.oldPath}\` | ${r.classification} | ${r.isExported} | ${srcDetail} | ${testDetail} | ${removeStatus} | ${blockers} |`);
  }
  lines.push('');
  lines.push('---');
  lines.push('');
  lines.push('## Already Removed Files');
  lines.push('');
  lines.push('These files appear in the classification list but no longer exist on disk.');
  lines.push('');
  lines.push('| Old File | Classification |');
  lines.push('|----------|---------------|');
  for (const r of alreadyRemoved) {
    lines.push(`| \`${r.oldPath}\` | ${r.classification} |`);
  }
  lines.push('');
  lines.push('---');
  lines.push('');
  lines.push('## Import Details (existing blocked files)');
  lines.push('');
  lines.push('### Files imported by src/');
  lines.push('');
  for (const r of existing.filter(r => r.importedBySrc > 0)) {
    lines.push(`**\`${r.oldPath}\`** (${r.classification}):`);
    for (const f of r.importedBySrcFiles) {
      lines.push(`- \`${f}\``);
    }
    lines.push('');
  }
  lines.push('### Files imported by tests/');
  lines.push('');
  for (const r of existing.filter(r => r.importedByTests > 0)) {
    lines.push(`**\`${r.oldPath}\`** (${r.classification}):`);
    for (const f of r.importedByTestsFiles) {
      lines.push(`- \`${f}\``);
    }
    lines.push('');
  }
  lines.push('---');
  lines.push('');
  lines.push('## Rules');
  lines.push('');
  lines.push('1. **public-facade** files cannot be removed without a major breaking release.');
  lines.push('2. **compatibility-adapter** files cannot be removed while src/ or tests/ import them.');
  lines.push('3. **deprecated-wrapper** files can be removed once all imports migrate to `src/`.');
  lines.push('4. **removable** files can be deleted immediately.');
  lines.push('5. **already-removed** files are already deleted and listed for completeness only.');

  return lines.join('\n');
}

const md = generateMarkdown();
const reportPath = path.join(ROOT, 'docs', 'LEGACY_REMOVAL_REPORT.md');
fs.writeFileSync(reportPath, md, 'utf8');
console.log(`Markdown report written to: ${reportPath}`);

// Exit with non-zero if gate fails
process.exit(gatePass ? 0 : 1);
