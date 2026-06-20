#!/usr/bin/env node

/**
 * Boundary Check Script
 *
 * Scans the Andy Engine codebase for architecture boundary violations.
 * Adapted to the current repository structure only.
 *
 * Usage: node scripts/check-boundaries.js
 * Exit code 0 = all checks pass, 1 = violations found.
 */

const { readFileSync, readdirSync, statSync } = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

// --- Layer definitions ---

const LAYERS = {
  'core': { dir: 'core', mustNotImport: ['agent/', 'sdk/', 'facts/'] },
  'src/runtime': { dir: 'src/runtime', mustNotImport: ['sdk/', 'agent/Agent.js'] },
  'agent': { dir: 'agent', mustNotImport: ['sdk/', 'facts/'], allowSubdir: true },
  'agent/action': { dir: 'agent/action', mustNotImport: ['sdk/', 'facts/', 'agent/Agent.js'] },
  'src/action': { dir: 'src/action', mustNotImport: ['sdk/', 'facts/', 'agent/Agent.js', 'effects/', 'core/'] },
  'facts': { dir: 'facts', mustNotImport: ['agent/', 'sdk/', 'core/'] },
  'src/canon': { dir: 'src/canon', mustNotImport: ['agent/', 'sdk/', 'core/', 'src/narrative/', 'src/knowledge/'] },
  'src/knowledge': { dir: 'src/knowledge', mustNotImport: ['agent/', 'sdk/', 'core/', 'src/narrative/', 'src/canon/'] },
  'src/narrative': { dir: 'src/narrative', mustNotImport: ['agent/', 'sdk/', 'core/', 'src/canon/WorldFactStore', 'src/canon/CanonEventPipeline'] },
  'domain': { dir: 'domain', mustNotImport: ['agent/', 'sdk/', 'facts/', 'core/', 'narrative/'] },
  'effects': { dir: 'effects', mustNotImport: ['core/', 'agent/', 'sdk/', 'facts/'] },
  'src/effects': { dir: 'src/effects', mustNotImport: ['core/', 'agent/', 'sdk/', 'facts/'] },
};

// Allowed exceptions (file -> target)
const ALLOWED_IMPORTS = [
  { from: 'core/World.js', to: 'social/' },
  { from: 'core/World.js', to: 'facts' },
  { from: 'core/World.js', to: 'src/runtime' },
  { from: 'sdk/NarrativeBuilder.js', to: 'facts/' },
  { from: 'sdk/NarrativeBuilder.js', to: 'domain/' },
];

// --- Extension concepts that must not appear in core/agent/facts ---

const EXTENSION_CONCEPTS = [
  'PlayerAgent',
  'QuestSystem',
  'ItemSystem',
  'AdventureAdapter',
  'StatusBoard',
  'FantasyExtension',
  'cultivation',
  'CultivationRealm',
  'RPG',
];

// --- Deterministic banned APIs for action/facts paths ---

const DETERMINISTIC_BANNED = ['Math.random(', 'Date.now('];

// --- Helpers ---

function getJsFiles(dir, fileList = []) {
  if (!require('fs').existsSync(dir)) return fileList;
  const files = readdirSync(dir);
  for (const file of files) {
    const filePath = path.join(dir, file);
    const stat = statSync(filePath);
    if (stat.isDirectory()) {
      if (!['node_modules', '.git', 'native', 'coverage', 'demo'].includes(file)) {
        getJsFiles(filePath, fileList);
      }
    } else if (file.endsWith('.js')) {
      fileList.push(filePath);
    }
  }
  return fileList;
}

function getRelativePath(filePath) {
  return path.relative(ROOT, filePath).replace(/\\/g, '/');
}

function isException(fromFile, toTarget) {
  const relFrom = getRelativePath(fromFile);
  return ALLOWED_IMPORTS.some(exc =>
    relFrom.endsWith(exc.from) && toTarget.includes(exc.to.replace('.js', ''))
  );
}

function extractRequires(content) {
  const requires = [];
  const regex = /require\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
  let match;
  while ((match = regex.exec(content)) !== null) {
    requires.push(match[1]);
  }
  return requires;
}

function extractImports(content) {
  const imports = [];
  const regex = /from\s+['"]([^'"]+)['"]/g;
  let match;
  while ((match = regex.exec(content)) !== null) {
    imports.push(match[1]);
  }
  return imports;
}

function getDependencys(content) {
  return [...extractRequires(content), ...extractImports(content)];
}

// --- Checks ---

function checkLayerImports() {
  const violations = [];

  for (const [layerName, layerDef] of Object.entries(LAYERS)) {
    const dir = path.join(ROOT, layerDef.dir);
    const files = getJsFiles(dir);

    for (const file of files) {
      const relFile = getRelativePath(file);
      const content = readFileSync(file, 'utf-8');
      const deps = getDependencys(content);

      for (const dep of deps) {
        // Only check relative imports
        if (!dep.startsWith('.') && !dep.startsWith('/')) continue;

        const resolved = path.resolve(path.dirname(file), dep);
        const relResolved = getRelativePath(resolved);

        for (const forbidden of layerDef.mustNotImport) {
          const forbiddenDir = forbidden.endsWith('/') ? forbidden.slice(0, -1) : forbidden;
          const targetHits = relResolved === forbiddenDir || relResolved.startsWith(forbiddenDir + '/');
          const selfHits = relFile.startsWith(forbiddenDir + '/') || relFile === forbiddenDir;
          if (targetHits || selfHits) {
            if (!isException(file, dep)) {
              violations.push({
                file: relFile,
                imports: dep,
                reason: `layer [${layerName}] must not import [${forbidden}]`,
              });
            }
          }
        }
      }
    }
  }

  return violations;
}

function checkExtensionConcepts() {
  const violations = [];
  const coreDirs = ['core', 'agent', 'facts', 'config', 'domain', 'src/canon', 'src/knowledge', 'src/narrative', 'src/runtime'];

  for (const dir of coreDirs) {
    const fullDir = path.join(ROOT, dir);
    const files = getJsFiles(fullDir);

    for (const file of files) {
      const relFile = getRelativePath(file);
      const content = readFileSync(file, 'utf-8');

      for (const concept of EXTENSION_CONCEPTS) {
        const regex = new RegExp(`\\b${concept}\\b`, 'g');
        const matches = content.match(regex);
        if (matches) {
          violations.push({
            file: relFile,
            concept,
            count: matches.length,
          });
        }
      }
    }
  }

  return violations;
}

function checkDeterministicPaths() {
  const violations = [];
  const dirs = ['agent/action', 'facts', 'src/canon', 'src/knowledge', 'src/action'];

  for (const dir of dirs) {
    const fullDir = path.join(ROOT, dir);
    const files = getJsFiles(fullDir);

    for (const file of files) {
      const relFile = getRelativePath(file);
      const content = readFileSync(file, 'utf-8');
      const lines = content.split('\n');

      for (let i = 0; i < lines.length; i++) {
        const trimmed = lines[i].trim();
        if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) continue;

        for (const banned of DETERMINISTIC_BANNED) {
          if (lines[i].includes(banned)) {
            violations.push({
              file: relFile,
              api: banned,
              line: i + 1,
            });
          }
        }
      }
    }
  }

  return violations;
}

function checkNarrativeBuilderBoundary() {
  const violations = [];
  const nbPath = path.join(ROOT, 'sdk', 'NarrativeBuilder.js');

  if (!require('fs').existsSync(nbPath)) return violations;

  const content = readFileSync(nbPath, 'utf-8');

  // NarrativeBuilder must not import Agent directly
  if (content.includes("require('../agent/") || content.includes("require('./agent")) {
    violations.push({
      file: 'sdk/NarrativeBuilder.js',
      reason: 'NarrativeBuilder must not import agent internals',
    });
  }

  // NarrativeBuilder must not use Date.now() or Math.random()
  const lines = content.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) continue;
    if (lines[i].includes('Date.now()') || lines[i].includes('Math.random()')) {
      violations.push({
        file: 'sdk/NarrativeBuilder.js',
        api: lines[i].includes('Date.now') ? 'Date.now()' : 'Math.random()',
        line: i + 1,
      });
    }
  }

  return violations;
}

function checkWorldFactAuthority() {
  const violations = [];
  const dirs = ['core', 'agent', 'agent/action', 'sdk'];

  for (const dir of dirs) {
    const fullDir = path.join(ROOT, dir);
    const files = getJsFiles(fullDir);

    for (const file of files) {
      const relFile = getRelativePath(file);
      const content = readFileSync(file, 'utf-8');

      // Check for direct WorldFactStore mutation patterns
      if (content.includes('.addFact(') || content.includes('.invalidateFact(')) {
        // Only facts/ modules may call these
        if (!relFile.startsWith('facts/') && !relFile.startsWith('tests/')) {
          violations.push({
            file: relFile,
            reason: 'direct world fact mutation outside facts/ layer',
          });
        }
      }
    }
  }

  return violations;
}

// --- SDK Direct Memory Mutation Check ---

const SDK_MEMORY_BANNED = ['.memory.addExperience(', 'agent.memory.addExperience('];

function checkSdkMemoryMutation() {
  const violations = [];
  const sdkDir = path.join(ROOT, 'sdk');
  const files = getJsFiles(sdkDir);

  for (const file of files) {
    const relFile = getRelativePath(file);
    const content = readFileSync(file, 'utf-8');
    const lines = content.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const trimmed = lines[i].trim();
      if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) continue;

      for (const banned of SDK_MEMORY_BANNED) {
        if (lines[i].includes(banned)) {
          violations.push({
            file: relFile,
            pattern: banned,
            line: i + 1,
          });
        }
      }
    }
  }

  return violations;
}

// --- Action → Effects Committer Boundary Check ---

function checkActionEffectsBoundary() {
  const violations = [];
  const actionDir = path.join(ROOT, 'agent', 'action');
  const files = getJsFiles(actionDir);

  for (const file of files) {
    const relFile = getRelativePath(file);
    const content = readFileSync(file, 'utf-8');
    const deps = getDependencys(content);

    for (const dep of deps) {
      if (!dep.startsWith('.') && !dep.startsWith('/')) continue;

      const resolved = path.resolve(path.dirname(file), dep);
      const relResolved = getRelativePath(resolved);

      if (relResolved.startsWith('effects/') || relResolved === 'effects') {
        violations.push({
          file: relFile,
          imports: dep,
          reason: 'action layer must not import effects/committer modules',
        });
      }
    }
  }

  return violations;
}

// --- Canon/Knowledge/Narrative Boundary Check ---

function checkCanonKnowledgeNarrativeBoundary() {
  const violations = [];

  // canon must not import narrative
  const canonDir = path.join(ROOT, 'src', 'canon');
  const canonFiles = getJsFiles(canonDir);
  for (const file of canonFiles) {
    const relFile = getRelativePath(file);
    const content = readFileSync(file, 'utf-8');
    const deps = getDependencys(content);
    for (const dep of deps) {
      if (!dep.startsWith('.') && !dep.startsWith('/')) continue;
      const resolved = path.resolve(path.dirname(file), dep);
      const relResolved = getRelativePath(resolved);
      if (relResolved.startsWith('src/narrative/') || relResolved === 'src/narrative') {
        violations.push({
          file: relFile,
          imports: dep,
          reason: 'canon must not import narrative',
        });
      }
    }
  }

  // knowledge must not import narrative
  const knowledgeDir = path.join(ROOT, 'src', 'knowledge');
  const knowledgeFiles = getJsFiles(knowledgeDir);
  for (const file of knowledgeFiles) {
    const relFile = getRelativePath(file);
    const content = readFileSync(file, 'utf-8');
    const deps = getDependencys(content);
    for (const dep of deps) {
      if (!dep.startsWith('.') && !dep.startsWith('/')) continue;
      const resolved = path.resolve(path.dirname(file), dep);
      const relResolved = getRelativePath(resolved);
      if (relResolved.startsWith('src/narrative/') || relResolved === 'src/narrative') {
        violations.push({
          file: relFile,
          imports: dep,
          reason: 'knowledge must not import narrative',
        });
      }
    }
  }

  // narrative must not import canon write APIs (WorldFactStore, CanonEventPipeline)
  const narrativeDir = path.join(ROOT, 'src', 'narrative');
  const narrativeFiles = getJsFiles(narrativeDir);
  const canonWriteAPIs = ['WorldFactStore', 'CanonEventPipeline'];
  for (const file of narrativeFiles) {
    const relFile = getRelativePath(file);
    const content = readFileSync(file, 'utf-8');
    const deps = getDependencys(content);
    for (const dep of deps) {
      if (!dep.startsWith('.') && !dep.startsWith('/')) continue;
      const resolved = path.resolve(path.dirname(file), dep);
      const relResolved = getRelativePath(resolved);
      for (const api of canonWriteAPIs) {
        if (relResolved.includes(api)) {
          violations.push({
            file: relFile,
            imports: dep,
            reason: `narrative must not import canon write API: ${api}`,
          });
        }
      }
    }
  }

  return violations;
}

// --- SDK Direct Data Mutation Check ---

const SDK_DATA_MUTATION_PATTERNS = [
  '.relationship.',
  '.facts.',
  '.knowledge.',
];

function checkSdkDataMutation() {
  const violations = [];
  const sdkDir = path.join(ROOT, 'sdk');
  const files = getJsFiles(sdkDir);

  const writeVerbs = ['set', 'add', 'remove', 'delete', 'update', 'clear', 'push', 'put'];

  for (const file of files) {
    const relFile = getRelativePath(file);
    const content = readFileSync(file, 'utf-8');
    const lines = content.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const trimmed = lines[i].trim();
      if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) continue;

      for (const pattern of SDK_DATA_MUTATION_PATTERNS) {
        if (!lines[i].includes(pattern)) continue;
        // Check if followed by a write verb (e.g. .relationship.set, .facts.add)
        for (const verb of writeVerbs) {
          if (lines[i].includes(pattern + verb)) {
            violations.push({
              file: relFile,
              pattern: pattern + verb,
              line: i + 1,
            });
          }
        }
      }
    }
  }

  return violations;
}

// --- Main ---

function main() {
  let totalViolations = 0;

  console.log('=== Andy Engine Boundary Check ===\n');

  // 1. Layer import violations
  const layerViolations = checkLayerImports();
  if (layerViolations.length > 0) {
    console.log('❌ Layer import violations:');
    for (const v of layerViolations) {
      console.log(`  ${v.file}: imports ${v.imports} — ${v.reason}`);
    }
    totalViolations += layerViolations.length;
  } else {
    console.log('✓ Layer imports: clean');
  }

  // 2. Extension concept violations
  const extViolations = checkExtensionConcepts();
  if (extViolations.length > 0) {
    console.log('❌ Extension concept violations in core/agent/facts:');
    for (const v of extViolations) {
      console.log(`  ${v.file}: "${v.concept}" (${v.count} occurrences)`);
    }
    totalViolations += extViolations.length;
  } else {
    console.log('✓ Extension concepts: clean');
  }

  // 3. Deterministic path violations
  const detViolations = checkDeterministicPaths();
  if (detViolations.length > 0) {
    console.log('❌ Deterministic path violations:');
    for (const v of detViolations) {
      console.log(`  ${v.file}:${v.line}: ${v.api}`);
    }
    totalViolations += detViolations.length;
  } else {
    console.log('✓ Deterministic paths: clean');
  }

  // 4. NarrativeBuilder boundary
  const nbViolations = checkNarrativeBuilderBoundary();
  if (nbViolations.length > 0) {
    console.log('❌ NarrativeBuilder boundary violations:');
    for (const v of nbViolations) {
      console.log(`  ${v.file}:${v.line || ''}: ${v.reason || v.api}`);
    }
    totalViolations += nbViolations.length;
  } else {
    console.log('✓ NarrativeBuilder boundary: clean');
  }

  // 5. World fact authority
  const factViolations = checkWorldFactAuthority();
  if (factViolations.length > 0) {
    console.log('❌ World fact authority violations:');
    for (const v of factViolations) {
      console.log(`  ${v.file}: ${v.reason}`);
    }
    totalViolations += factViolations.length;
  } else {
    console.log('✓ World fact authority: clean');
  }

  // 6. SDK direct memory mutation
  const sdkMemViolations = checkSdkMemoryMutation();
  if (sdkMemViolations.length > 0) {
    console.log('❌ SDK direct memory mutation violations:');
    for (const v of sdkMemViolations) {
      console.log(`  ${v.file}:${v.line}: ${v.pattern}`);
    }
    totalViolations += sdkMemViolations.length;
  } else {
    console.log('✓ SDK memory mutation: clean (uses Agent public seam)');
  }

  // 7. Action → effects boundary
  const actionFxViolations = checkActionEffectsBoundary();
  if (actionFxViolations.length > 0) {
    console.log('❌ Action → effects boundary violations:');
    for (const v of actionFxViolations) {
      console.log(`  ${v.file}: imports ${v.imports} — ${v.reason}`);
    }
    totalViolations += actionFxViolations.length;
  } else {
    console.log('✓ Action → effects boundary: clean');
  }

  // 8. SDK direct data mutation (relationship/facts/knowledge)
  const sdkDataViolations = checkSdkDataMutation();
  if (sdkDataViolations.length > 0) {
    console.log('❌ SDK direct data mutation violations:');
    for (const v of sdkDataViolations) {
      console.log(`  ${v.file}:${v.line}: ${v.pattern}`);
    }
    totalViolations += sdkDataViolations.length;
  } else {
    console.log('✓ SDK data mutation: clean (relationship/facts/knowledge)');
  }

  // 9. Canon/knowledge/narrative boundary
  const cknViolations = checkCanonKnowledgeNarrativeBoundary();
  if (cknViolations.length > 0) {
    console.log('❌ Canon/knowledge/narrative boundary violations:');
    for (const v of cknViolations) {
      console.log(`  ${v.file}: ${v.reason}`);
    }
    totalViolations += cknViolations.length;
  } else {
    console.log('✓ Canon/knowledge/narrative boundary: clean');
  }

  console.log('');
  if (totalViolations > 0) {
    console.log(`FAILED: ${totalViolations} violation(s) found.`);
    process.exit(1);
  } else {
    console.log('All boundary checks passed.');
    process.exit(0);
  }
}

main();
