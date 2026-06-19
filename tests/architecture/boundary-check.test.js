/**
 * Architecture Boundary Regression Tests
 *
 * Narrow tests that enforce the boundary rules documented in
 * docs/ARCHITECTURE_BOUNDARIES.md.
 *
 * These tests prevent upper-layer concepts from entering core,
 * ensure deterministic paths remain deterministic, and verify
 * that LLM/presentation cannot own world truth.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync, existsSync } from 'fs';
import path from 'path';

const ROOT = process.cwd();

// --- Helpers ---

function getJsFiles(dir, fileList = []) {
  if (!existsSync(dir)) return fileList;
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

function rel(filePath) {
  return path.relative(ROOT, filePath).replace(/\\/g, '/');
}

function extractDeps(content) {
  const deps = [];
  const reqRegex = /require\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
  const importRegex = /from\s+['"]([^'"]+)['"]/g;
  let match;
  while ((match = reqRegex.exec(content)) !== null) deps.push(match[1]);
  while ((match = importRegex.exec(content)) !== null) deps.push(match[1]);
  return deps;
}

function resolveImport(fromFile, dep) {
  if (!dep.startsWith('.')) return null;
  const resolved = path.resolve(path.dirname(fromFile), dep);
  return rel(resolved);
}

// --- Allowed exceptions ---
const ALLOWED = [
  { from: 'core/World.js', to: 'social/' },
  { from: 'core/World.js', to: 'facts' },
  { from: 'sdk/NarrativeBuilder.js', to: 'facts/' },
  { from: 'sdk/NarrativeBuilder.js', to: 'domain/' },
];

function isAllowed(relFrom, resolvedRel) {
  return ALLOWED.some(exc =>
    relFrom.endsWith(exc.from) && resolvedRel.includes(exc.to.replace('.js', ''))
  );
}

// --- Tests ---

describe('Architecture: core/ must not import upper layers', () => {
  it('core/ must not import agent/', () => {
    const violations = [];
    const files = getJsFiles(path.join(ROOT, 'core'));
    for (const file of files) {
      const relFile = rel(file);
      const content = readFileSync(file, 'utf-8');
      const deps = extractDeps(content);
      for (const dep of deps) {
        const resolved = resolveImport(file, dep);
        if (resolved && resolved.includes('agent/') && !isAllowed(relFile, resolved)) {
          violations.push(`${relFile} -> ${dep}`);
        }
      }
    }
    expect(violations).toEqual([]);
  });

  it('core/ must not import sdk/', () => {
    const violations = [];
    const files = getJsFiles(path.join(ROOT, 'core'));
    for (const file of files) {
      const relFile = rel(file);
      const content = readFileSync(file, 'utf-8');
      const deps = extractDeps(content);
      for (const dep of deps) {
        const resolved = resolveImport(file, dep);
        if (resolved && resolved.includes('sdk/') && !isAllowed(relFile, resolved)) {
          violations.push(`${relFile} -> ${dep}`);
        }
      }
    }
    expect(violations).toEqual([]);
  });

  it('core/ must not import facts/', () => {
    const violations = [];
    const files = getJsFiles(path.join(ROOT, 'core'));
    for (const file of files) {
      const relFile = rel(file);
      const content = readFileSync(file, 'utf-8');
      const deps = extractDeps(content);
      for (const dep of deps) {
        const resolved = resolveImport(file, dep);
        if (resolved && (resolved === 'facts' || resolved.startsWith('facts/')) && !isAllowed(relFile, resolved)) {
          violations.push(`${relFile} -> ${dep}`);
        }
      }
    }
    expect(violations).toEqual([]);
  });
});

describe('Architecture: agent/ must not import upper layers', () => {
  it('agent/ must not import sdk/', () => {
    const violations = [];
    const files = getJsFiles(path.join(ROOT, 'agent'));
    for (const file of files) {
      const relFile = rel(file);
      const content = readFileSync(file, 'utf-8');
      const deps = extractDeps(content);
      for (const dep of deps) {
        const resolved = resolveImport(file, dep);
        if (resolved && resolved.includes('sdk/') && !isAllowed(relFile, resolved)) {
          violations.push(`${relFile} -> ${dep}`);
        }
      }
    }
    expect(violations).toEqual([]);
  });

  it('agent/ must not import facts/', () => {
    const violations = [];
    const files = getJsFiles(path.join(ROOT, 'agent'));
    for (const file of files) {
      const relFile = rel(file);
      const content = readFileSync(file, 'utf-8');
      const deps = extractDeps(content);
      for (const dep of deps) {
        const resolved = resolveImport(file, dep);
        if (resolved && (resolved === 'facts' || resolved.startsWith('facts/')) && !isAllowed(relFile, resolved)) {
          violations.push(`${relFile} -> ${dep}`);
        }
      }
    }
    expect(violations).toEqual([]);
  });
});

describe('Architecture: facts/ must not import upper layers', () => {
  it('facts/ must not import agent/', () => {
    const violations = [];
    const files = getJsFiles(path.join(ROOT, 'facts'));
    for (const file of files) {
      const relFile = rel(file);
      const content = readFileSync(file, 'utf-8');
      const deps = extractDeps(content);
      for (const dep of deps) {
        const resolved = resolveImport(file, dep);
        if (resolved && resolved.includes('agent/') && !isAllowed(relFile, resolved)) {
          violations.push(`${relFile} -> ${dep}`);
        }
      }
    }
    expect(violations).toEqual([]);
  });

  it('facts/ must not import sdk/', () => {
    const violations = [];
    const files = getJsFiles(path.join(ROOT, 'facts'));
    for (const file of files) {
      const relFile = rel(file);
      const content = readFileSync(file, 'utf-8');
      const deps = extractDeps(content);
      for (const dep of deps) {
        const resolved = resolveImport(file, dep);
        if (resolved && resolved.includes('sdk/') && !isAllowed(relFile, resolved)) {
          violations.push(`${relFile} -> ${dep}`);
        }
      }
    }
    expect(violations).toEqual([]);
  });

  it('facts/ must not import core/', () => {
    const violations = [];
    const files = getJsFiles(path.join(ROOT, 'facts'));
    for (const file of files) {
      const relFile = rel(file);
      const content = readFileSync(file, 'utf-8');
      const deps = extractDeps(content);
      for (const dep of deps) {
        const resolved = resolveImport(file, dep);
        if (resolved && resolved.includes('core/') && !isAllowed(relFile, resolved)) {
          violations.push(`${relFile} -> ${dep}`);
        }
      }
    }
    expect(violations).toEqual([]);
  });
});

describe('Architecture: domain/ must not import upper layers', () => {
  const FORBIDDEN = ['agent/', 'sdk/', 'facts/', 'core/'];

  for (const forbidden of FORBIDDEN) {
    it(`domain/ must not import ${forbidden}`, () => {
      const violations = [];
      const files = getJsFiles(path.join(ROOT, 'domain'));
      for (const file of files) {
        const relFile = rel(file);
        const content = readFileSync(file, 'utf-8');
        const deps = extractDeps(content);
        for (const dep of deps) {
          const resolved = resolveImport(file, dep);
          if (resolved && resolved.startsWith(forbidden.replace('/', ''))) {
            violations.push(`${relFile} -> ${dep}`);
          }
        }
      }
      expect(violations).toEqual([]);
    });
  }
});

describe('Architecture: effects/ must not import upper layers', () => {
  const FORBIDDEN = ['core/', 'agent/', 'sdk/', 'facts/'];

  for (const forbidden of FORBIDDEN) {
    it(`effects/ must not import ${forbidden}`, () => {
      const violations = [];
      const files = getJsFiles(path.join(ROOT, 'effects'));
      for (const file of files) {
        const relFile = rel(file);
        const content = readFileSync(file, 'utf-8');
        const deps = extractDeps(content);
        for (const dep of deps) {
          const resolved = resolveImport(file, dep);
          if (resolved && resolved.startsWith(forbidden.replace('/', ''))) {
            violations.push(`${relFile} -> ${dep}`);
          }
        }
      }
      expect(violations).toEqual([]);
    });
  }
});

describe('Architecture: no extension concepts in core/agent/facts', () => {
  const EXTENSION_CONCEPTS = [
    'PlayerAgent', 'QuestSystem', 'ItemSystem',
    'AdventureAdapter', 'StatusBoard', 'FantasyExtension',
    'CultivationRealm',
  ];

  for (const concept of EXTENSION_CONCEPTS) {
    it(`no "${concept}" in core/agent/facts/config/domain`, () => {
      const dirs = ['core', 'agent', 'facts', 'config', 'domain'];
      const violations = [];
      for (const dir of dirs) {
        const files = getJsFiles(path.join(ROOT, dir));
        for (const file of files) {
          const content = readFileSync(file, 'utf-8');
          const regex = new RegExp(`\\b${concept}\\b`, 'g');
          if (regex.test(content)) {
            violations.push(rel(file));
          }
        }
      }
      expect(violations).toEqual([]);
    });
  }
});

describe('Architecture: deterministic paths have no Date.now()/Math.random()', () => {
  const DETERMINISTIC_DIRS = ['agent/action', 'facts'];
  const BANNED = ['Math.random(', 'Date.now('];

  for (const dir of DETERMINISTIC_DIRS) {
    it(`${dir}/ has no Math.random() or Date.now()`, () => {
      const violations = [];
      const files = getJsFiles(path.join(ROOT, dir));
      for (const file of files) {
        const content = readFileSync(file, 'utf-8');
        const lines = content.split('\n');
        for (let i = 0; i < lines.length; i++) {
          const trimmed = lines[i].trim();
          if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) continue;
          for (const banned of BANNED) {
            if (lines[i].includes(banned)) {
              violations.push(`${rel(file)}:${i + 1}: ${banned}`);
            }
          }
        }
      }
      expect(violations).toEqual([]);
    });
  }
});

describe('Architecture: NarrativeBuilder cannot own world truth', () => {
  it('NarrativeBuilder does not import agent internals', () => {
    const nbPath = path.join(ROOT, 'sdk', 'NarrativeBuilder.js');
    if (!existsSync(nbPath)) return;
    const content = readFileSync(nbPath, 'utf-8');
    const hasAgentImport = /require\s*\(\s*['"]\.\.\/agent\//.test(content);
    expect(hasAgentImport).toBe(false);
  });

  it('NarrativeBuilder does not use Date.now() or Math.random()', () => {
    const nbPath = path.join(ROOT, 'sdk', 'NarrativeBuilder.js');
    if (!existsSync(nbPath)) return;
    const content = readFileSync(nbPath, 'utf-8');
    expect(content).not.toMatch(/Date\.now\s*\(\s*\)/);
    expect(content).not.toMatch(/Math\.random\s*\(\s*\)/);
  });
});

describe('Architecture: SDK must not directly mutate agent memory', () => {
  const SDK_MEMORY_BANNED = ['.memory.addExperience(', 'agent.memory.addExperience('];

  it('sdk/ files do not call agent.memory.addExperience directly', () => {
    const violations = [];
    const files = getJsFiles(path.join(ROOT, 'sdk'));
    for (const file of files) {
      const content = readFileSync(file, 'utf-8');
      const lines = content.split('\n');
      for (let i = 0; i < lines.length; i++) {
        const trimmed = lines[i].trim();
        if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) continue;
        for (const banned of SDK_MEMORY_BANNED) {
          if (lines[i].includes(banned)) {
            violations.push(`${rel(file)}:${i + 1}: ${banned}`);
          }
        }
      }
    }
    expect(violations).toEqual([]);
  });
});

describe('Architecture: only core/World.js may import facts/', () => {
  it('core/World.js is the only core file that imports facts/', () => {
    const factsImporters = [];
    const files = getJsFiles(path.join(ROOT, 'core'));
    for (const file of files) {
      const relFile = rel(file);
      const content = readFileSync(file, 'utf-8');
      const deps = extractDeps(content);
      for (const dep of deps) {
        const resolved = resolveImport(file, dep);
        if (resolved && (resolved === 'facts' || resolved.startsWith('facts/'))) {
          factsImporters.push(relFile);
        }
      }
    }
    expect(factsImporters).toEqual(['core/World.js']);
  });

  it('require("../facts") resolves to facts/ directory', () => {
    const worldPath = path.join(ROOT, 'core', 'World.js');
    const content = readFileSync(worldPath, 'utf-8');
    const hasFactsRequire = /require\s*\(\s*['"]\.\.\/facts['"]\s*\)/.test(content);
    expect(hasFactsRequire).toBe(true);
  });
});

describe('Architecture: boundary docs and script exist', () => {
  it('docs/ARCHITECTURE_BOUNDARIES.md exists', () => {
    expect(existsSync(path.join(ROOT, 'docs', 'ARCHITECTURE_BOUNDARIES.md'))).toBe(true);
  });

  it('docs/KNOWN_BOUNDARY_VIOLATIONS.md exists', () => {
    expect(existsSync(path.join(ROOT, 'docs', 'KNOWN_BOUNDARY_VIOLATIONS.md'))).toBe(true);
  });

  it('scripts/check-boundaries.js exists', () => {
    expect(existsSync(path.join(ROOT, 'scripts', 'check-boundaries.js'))).toBe(true);
  });
});

describe('Architecture: no-seed fallback is documented as intentional', () => {
  it('RNG_AUDIT.md documents non-seeded fallback as intentional backward compatibility', () => {
    const auditPath = path.join(ROOT, 'docs', 'RNG_AUDIT.md');
    if (!existsSync(auditPath)) return;
    const content = readFileSync(auditPath, 'utf-8');
    expect(content).toMatch(/intentional/i);
    expect(content).toMatch(/backward.compat/i);
  });

  it('KNOWN_BOUNDARY_VIOLATIONS.md documents Math.random fallback as accepted exception', () => {
    const violationsPath = path.join(ROOT, 'docs', 'KNOWN_BOUNDARY_VIOLATIONS.md');
    if (!existsSync(violationsPath)) return;
    const content = readFileSync(violationsPath, 'utf-8');
    expect(content).toMatch(/Math\.random.*fallback/i);
    expect(content).toMatch(/intentional/i);
  });
});
