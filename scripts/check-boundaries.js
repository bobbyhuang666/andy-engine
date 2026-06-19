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
  'agent': { dir: 'agent', mustNotImport: ['sdk/', 'facts/'], allowSubdir: true },
  'agent/action': { dir: 'agent/action', mustNotImport: ['sdk/', 'facts/', 'agent/Agent.js'] },
  'facts': { dir: 'facts', mustNotImport: ['agent/', 'sdk/', 'core/'] },
  'domain': { dir: 'domain', mustNotImport: ['agent/', 'sdk/', 'facts/', 'core/'] },
  'effects': { dir: 'effects', mustNotImport: ['core/', 'agent/', 'sdk/', 'facts/'] },
};

// Allowed exceptions (file -> target)
const ALLOWED_IMPORTS = [
  { from: 'core/World.js', to: 'social/' },
  { from: 'core/World.js', to: 'facts' },
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
  const coreDirs = ['core', 'agent', 'facts', 'config', 'domain'];

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
  const dirs = ['agent/action', 'facts'];

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
