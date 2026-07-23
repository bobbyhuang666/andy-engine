#!/usr/bin/env node
/**
 * No-Internal-Access Guard
 *
 * Static scan that verifies reference-host/ source files do NOT access
 * engine internals. Also includes negative test fixtures that SHOULD
 * be detected as violations — these prove the guard can catch the same
 * patterns found in the old longitudinal demo.
 *
 * Forbidden patterns (from IB_NO_INTERNAL_ACCESS_SCAN.md):
 * - engine.world
 * - engine.world.regions
 * - engine.world.regions.place()
 * - engine.world.socialGraph
 * - engine.world.eventDispatcher
 * - engine.world.clock (use engine.getStats() instead)
 * - Relative imports into src/
 * - Direct access to internal constructors
 * - Direct mutation of agent.memory, agent.relationship, agent.position,
 *   agent.emotion, agent.needs
 */

'use strict';

const fs = require('fs');
const path = require('path');

const HOST_SRC = path.join(__dirname, '..', 'src');
const HOST_SCENARIOS = path.join(__dirname, '..', 'scenarios');

// ─── Forbidden patterns ─────────────────────────────────────────────────

const FORBIDDEN_PATTERNS = [
  // Direct engine.world access
  { regex: /engine\.world\b/g, label: 'engine.world access' },
  { regex: /engine\.world\.regions/g, label: 'engine.world.regions access' },
  { regex: /\.regions\.place\s*\(/g, label: 'regions.place() call' },
  { regex: /engine\.world\.socialGraph/g, label: 'engine.world.socialGraph access' },
  { regex: /engine\.world\.eventDispatcher/g, label: 'engine.world.eventDispatcher access' },
  { regex: /engine\.world\.clock/g, label: 'engine.world.clock access' },

  // Relative imports into src/
  { regex: /require\s*\(\s*['"][.\/]*src\//g, label: 'relative import into src/' },

  // Internal constructor access
  { regex: /new\s+AndyWorld\s*\(/g, label: 'direct AndyWorld construction' },
  { regex: /new\s+EffectCommitter\s*\(/g, label: 'direct EffectCommitter construction' },
  { regex: /new\s+Agent\s*\(/g, label: 'direct Agent construction (use engine.createCharacter)' },

  // Direct state mutation
  { regex: /agent\.memory\.addExperience\s*\(/g, label: 'direct memory.addExperience() call' },
  { regex: /agent\.position\s*=/g, label: 'direct position assignment' },
  { regex: /agent\.emotion\.applyEffect\s*\(/g, label: 'direct emotion.applyEffect() call' },
  { regex: /\.needs\.needs\s*\[/g, label: 'direct needs mutation' },

  // Snapshot diff disguised as commit receipt
  { regex: /snapshotDiff|snapshot_diff/g, label: 'snapshot diff as commit receipt' },
];

// ─── Negative fixtures ──────────────────────────────────────────────────
// These are strings that the longitudinal demo uses, which our guard
// MUST detect as violations. They prove the guard catches known violations.

const NEGATIVE_FIXTURES = [
  {
    label: 'longitudinal-demo: engine.world.regions.place()',
    code: "engine.world.regions.place('alice', '图书馆');",
    expectedViolations: ['engine.world access', 'engine.world.regions access', 'regions.place() call'],
  },
  {
    label: 'longitudinal-demo: engine.world.socialGraph',
    code: "const socialGraph = engine.world.socialGraph;",
    expectedViolations: ['engine.world access', 'engine.world.socialGraph access'],
  },
  {
    label: 'longitudinal-demo: engine.world.clock',
    code: "engine.world.clock.tickCount",
    expectedViolations: ['engine.world access', 'engine.world.clock access'],
  },
  {
    label: 'longitudinal-demo: engine.world.eventDispatcher',
    code: "engine.world.eventDispatcher.eventLog.length",
    expectedViolations: ['engine.world access', 'engine.world.eventDispatcher access'],
  },
  {
    label: 'direct-agent-mutation: agent.memory.addExperience()',
    code: "agent.memory.addExperience({ content: 'test' });",
    expectedViolations: ['direct memory.addExperience() call'],
  },
  {
    label: 'direct-agent-mutation: agent.position =',
    code: "agent.position = '广场';",
    expectedViolations: ['direct position assignment'],
  },
  {
    label: 'internal-constructor: new Agent()',
    code: "const agent = new Agent({ id: 'test' });",
    expectedViolations: ['direct Agent construction (use engine.createCharacter)'],
  },
];

// ─── Scanner ────────────────────────────────────────────────────────────

function scanFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const violations = [];

  for (const pattern of FORBIDDEN_PATTERNS) {
    pattern.regex.lastIndex = 0;
    const lines = content.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const trimmed = lines[i].trim();
      if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) continue;

      pattern.regex.lastIndex = 0;
      if (pattern.regex.test(lines[i])) {
        violations.push({
          file: path.relative(process.cwd(), filePath),
          line: i + 1,
          pattern: pattern.label,
          code: trimmed.substring(0, 80),
        });
      }
    }
  }

  return violations;
}

function scanDirectory(dir) {
  const violations = [];
  if (!fs.existsSync(dir)) return violations;

  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      violations.push(...scanDirectory(fullPath));
    } else if (entry.name.endsWith('.js')) {
      violations.push(...scanFile(fullPath));
    }
  }
  return violations;
}

// ─── Negative fixture validation ────────────────────────────────────────

function validateNegativeFixtures() {
  let fixturePass = 0;
  let fixtureFail = 0;

  for (const fixture of NEGATIVE_FIXTURES) {
    const detected = [];
    for (const pattern of FORBIDDEN_PATTERNS) {
      pattern.regex.lastIndex = 0;
      if (pattern.regex.test(fixture.code)) {
        detected.push(pattern.label);
      }
    }

    const allExpected = fixture.expectedViolations.every(ev => detected.includes(ev));
    if (allExpected) {
      fixturePass++;
    } else {
      fixtureFail++;
      console.log(`  ✗ Fixture "${fixture.label}": expected [${fixture.expectedViolations.join(', ')}], detected [${detected.join(', ')}]`);
    }
  }

  return { fixturePass, fixtureFail };
}

// ─── Main ───────────────────────────────────────────────────────────────

function main() {
  console.log('=== No-Internal-Access Guard ===\n');

  let totalViolations = 0;

  // 1. Scan reference-host source files
  console.log('1. Scanning reference-host/src/ ...');
  const srcViolations = scanDirectory(HOST_SRC);
  if (srcViolations.length > 0) {
    console.log('  ❌ Violations found:');
    for (const v of srcViolations) {
      console.log(`    ${v.file}:${v.line}: ${v.pattern} — ${v.code}`);
    }
    totalViolations += srcViolations.length;
  } else {
    console.log('  ✓ No violations in src/');
  }

  // 2. Scan reference-host/scenarios/
  console.log('2. Scanning reference-host/scenarios/ ...');
  const scenarioViolations = scanDirectory(HOST_SCENARIOS);
  if (scenarioViolations.length > 0) {
    console.log('  ❌ Violations found:');
    for (const v of scenarioViolations) {
      console.log(`    ${v.file}:${v.line}: ${v.pattern} — ${v.code}`);
    }
    totalViolations += scenarioViolations.length;
  } else {
    console.log('  ✓ No violations in scenarios/');
  }

  // 3. Validate negative fixtures (MUST detect known violations)
  console.log('3. Validating negative fixtures (must detect old-demo violations) ...');
  const { fixturePass, fixtureFail } = validateNegativeFixtures();
  console.log(`  ${fixturePass}/${fixturePass + fixtureFail} negative fixtures detected correctly`);
  if (fixtureFail > 0) {
    totalViolations += fixtureFail;
  }

  console.log('');
  if (totalViolations > 0) {
    console.log(`FAILED: ${totalViolations} violation(s) found.`);
    process.exit(1);
  } else {
    console.log('All no-internal-access checks passed.');
    process.exit(0);
  }
}

main();
