/**
 * Architecture Boundary Regression Tests
 *
 * Narrow tests that enforce the boundary rules documented in
 * docs/archive/CLEAN_ARCHITECTURE_FINAL_AUDIT.md and related active docs.
 *
 * These tests prevent upper-layer concepts from entering core,
 * ensure deterministic paths remain deterministic, and verify
 * that LLM/presentation cannot own world truth.
 */

import { describe, it, expect } from 'vitest';
import { execFileSync } from 'child_process';
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

describe('Architecture: src/effects/ must not import upper layers', () => {
  const FORBIDDEN = ['core/', 'agent/', 'sdk/', 'facts/'];

  for (const forbidden of FORBIDDEN) {
    it(`src/effects/ must not import ${forbidden}`, () => {
      const violations = [];
      const files = getJsFiles(path.join(ROOT, 'src', 'effects'));
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
  const DETERMINISTIC_DIRS = ['src/action', 'facts'];
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

describe('Architecture: no core/ file may import facts/', () => {
  it('no core/ file imports facts/', () => {
    const factsImporters = [];
    const coreDir = path.join(ROOT, 'core');
    if (existsSync(coreDir)) {
      const files = getJsFiles(coreDir);
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
    }
    expect(factsImporters).toEqual([]);
  });

  it('src/runtime/AndyWorld.js is the canonical implementation', () => {
    const worldPath = path.join(ROOT, 'src', 'runtime', 'AndyWorld.js');
    expect(existsSync(worldPath)).toBe(true);
  });
});

describe('Architecture: boundary docs and script exist', () => {
  it('docs/archive/CLEAN_ARCHITECTURE_FINAL_AUDIT.md exists', () => {
    expect(existsSync(path.join(ROOT, 'docs', 'archive', 'CLEAN_ARCHITECTURE_FINAL_AUDIT.md'))).toBe(true);
  });

  it('docs/archive/LEGACY_REMOVAL_REPORT.md exists', () => {
    expect(existsSync(path.join(ROOT, 'docs', 'archive', 'LEGACY_REMOVAL_REPORT.md'))).toBe(true);
  });

  it('scripts/check-boundaries.js exists', () => {
    expect(existsSync(path.join(ROOT, 'scripts', 'check-boundaries.js'))).toBe(true);
  });

  it('check-boundaries locks classified direct emotion write exceptions', () => {
    const output = execFileSync('node', ['scripts/check-boundaries.js'], {
      cwd: ROOT,
      encoding: 'utf-8',
    });
    expect(output).toContain('Direct emotion writes: classified exceptions only');
  });

  it('check-boundaries locks classified direct memory experience write exceptions', () => {
    const output = execFileSync('node', ['scripts/check-boundaries.js'], {
      cwd: ROOT,
      encoding: 'utf-8',
    });
    expect(output).toContain('Direct memory experience writes: classified exceptions only');
  });

  it('check-boundaries locks classified direct position write exceptions', () => {
    const output = execFileSync('node', ['scripts/check-boundaries.js'], {
      cwd: ROOT,
      encoding: 'utf-8',
    });
    expect(output).toContain('Direct position writes: classified exceptions only');
  });

  it('check-boundaries locks classified direct relationship interaction write exceptions', () => {
    const output = execFileSync('node', ['scripts/check-boundaries.js'], {
      cwd: ROOT,
      encoding: 'utf-8',
    });
    expect(output).toContain('Direct relationship interaction writes: classified exceptions only');
  });

  it('check-boundaries locks classified direct needs write exceptions', () => {
    const output = execFileSync('node', ['scripts/check-boundaries.js'], {
      cwd: ROOT,
      encoding: 'utf-8',
    });
    expect(output).toContain('Direct needs writes: classified exceptions only');
  });

  it('check-boundaries locks fact/knowledge write authority owners', () => {
    const output = execFileSync('node', ['scripts/check-boundaries.js'], {
      cwd: ROOT,
      encoding: 'utf-8',
    });
    expect(output).toContain('Fact/knowledge write authority: clean (canon/knowledge owners only)');
  });

  it('check-boundaries locks SDK relationship/facts/knowledge mutation boundary', () => {
    const output = execFileSync('node', ['scripts/check-boundaries.js'], {
      cwd: ROOT,
      encoding: 'utf-8',
    });
    expect(output).toContain('SDK data mutation: clean (relationship/facts/knowledge)');
  });

  it('check-boundaries locks action providers as read-only candidate sources', () => {
    const output = execFileSync('node', ['scripts/check-boundaries.js'], {
      cwd: ROOT,
      encoding: 'utf-8',
    });
    expect(output).toContain('Action providers: read-only candidate sources');
  });

  it('check-boundaries locks narrative/LLM world-write boundary', () => {
    const output = execFileSync('node', ['scripts/check-boundaries.js'], {
      cwd: ROOT,
      encoding: 'utf-8',
    });
    expect(output).toContain('Narrative/LLM world writes: clean');
  });

  it('check-boundaries locks core Date.now/Math.random exceptions', () => {
    const output = execFileSync('node', ['scripts/check-boundaries.js'], {
      cwd: ROOT,
      encoding: 'utf-8',
    });
    expect(output).toContain('Core runtime Date.now/Math.random: classified exceptions only');
  });

  it('check-boundaries locks core UTC time accessor exceptions', () => {
    const output = execFileSync('node', ['scripts/check-boundaries.js'], {
      cwd: ROOT,
      encoding: 'utf-8',
    });
    expect(output).toContain('Core runtime UTC accessors: classified exceptions only');
  });
});

describe('Architecture: no-seed fallback is documented as intentional', () => {
  it('RNG_STRICTNESS_RFC.md documents Math.random fallback as current alpha boundary', () => {
    const violationsPath = path.join(ROOT, 'docs', 'rfc', 'RNG_STRICTNESS_RFC.md');
    const content = readFileSync(violationsPath, 'utf-8');
    expect(content).toMatch(/Math\.random/i);
    expect(content).toMatch(/fallback/i);
    expect(content).toMatch(/backward.compat/i);
    expect(content).toMatch(/v2 Stable Target/i);
  });
});

describe('Architecture: agent/action is retired from canonical action checks', () => {
  it('src/action is the canonical action implementation directory', () => {
    expect(existsSync(path.join(ROOT, 'src', 'action'))).toBe(true);
  });
});

describe('Architecture: src/action/ must not import upper layers', () => {
  const FORBIDDEN = ['sdk/', 'facts/', 'agent/Agent', 'effects/', 'core/'];

  for (const forbidden of FORBIDDEN) {
    it(`src/action/ must not import ${forbidden}`, () => {
      const violations = [];
      const files = getJsFiles(path.join(ROOT, 'src', 'action'));
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

describe('Architecture: src/action/ has no Math.random() or Date.now()', () => {
  it('src/action/ deterministic paths are clean', () => {
    const violations = [];
    const files = getJsFiles(path.join(ROOT, 'src', 'action'));
    for (const file of files) {
      const relFile = rel(file);
      const content = readFileSync(file, 'utf-8');
      const lines = content.split('\n');
      for (let i = 0; i < lines.length; i++) {
        const trimmed = lines[i].trim();
        if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) continue;
        for (const banned of ['Math.random(', 'Date.now(']) {
          if (lines[i].includes(banned)) {
            violations.push(`${relFile}:${i + 1}: ${banned}`);
          }
        }
      }
    }
    expect(violations).toEqual([]);
  });
});

describe('Architecture: SDK must not directly mutate relationship/facts/knowledge', () => {
  const SDK_BANNED = ['.relationship.', '.facts.', '.knowledge.'];
  const WRITE_PATTERNS = [' += ', ' -= ', ' = ', '.add', '.remove', '.delete', '.update', '.clear', '.push', '.put'];

  it('sdk/ files do not directly write to relationship/facts/knowledge', () => {
    const violations = [];
    const files = getJsFiles(path.join(ROOT, 'sdk'));
    for (const file of files) {
      const relFile = rel(file);
      const content = readFileSync(file, 'utf-8');
      const lines = content.split('\n');
      for (let i = 0; i < lines.length; i++) {
        const trimmed = lines[i].trim();
        if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) continue;
        for (const banned of SDK_BANNED) {
          for (const pattern of WRITE_PATTERNS) {
            if (lines[i].includes(banned) && lines[i].includes(pattern)) {
              violations.push(`${relFile}:${i + 1}: ${banned}${pattern.trim()}`);
            }
          }
        }
      }
    }
    expect(violations).toEqual([]);
  });
});

describe('Architecture: module map exists', () => {
  it('docs/PUBLIC_API_CONTRACT.md exists', () => {
    expect(existsSync(path.join(ROOT, 'docs', 'PUBLIC_API_CONTRACT.md'))).toBe(true);
  });
});

describe('Architecture: canon/ must not import narrative/ or knowledge/', () => {
  it('src/canon/ must not import src/narrative/', () => {
    const violations = [];
    const files = getJsFiles(path.join(ROOT, 'src', 'canon'));
    for (const file of files) {
      const relFile = rel(file);
      const content = readFileSync(file, 'utf-8');
      const deps = extractDeps(content);
      for (const dep of deps) {
        const resolved = resolveImport(file, dep);
        if (resolved && (resolved.includes('src/narrative') || resolved.includes('narrative/'))) {
          violations.push(`${relFile} -> ${dep}`);
        }
      }
    }
    expect(violations).toEqual([]);
  });

  it('src/canon/ must not import src/knowledge/', () => {
    const violations = [];
    const files = getJsFiles(path.join(ROOT, 'src', 'canon'));
    for (const file of files) {
      const relFile = rel(file);
      const content = readFileSync(file, 'utf-8');
      const deps = extractDeps(content);
      for (const dep of deps) {
        const resolved = resolveImport(file, dep);
        if (resolved && (resolved.includes('src/knowledge') || resolved.includes('knowledge/'))) {
          violations.push(`${relFile} -> ${dep}`);
        }
      }
    }
    expect(violations).toEqual([]);
  });
});

describe('Architecture: knowledge/ must not import narrative/', () => {
  it('src/knowledge/ must not import src/narrative/', () => {
    const violations = [];
    const files = getJsFiles(path.join(ROOT, 'src', 'knowledge'));
    for (const file of files) {
      const relFile = rel(file);
      const content = readFileSync(file, 'utf-8');
      const deps = extractDeps(content);
      for (const dep of deps) {
        const resolved = resolveImport(file, dep);
        if (resolved && (resolved.includes('src/narrative') || resolved.includes('narrative/'))) {
          violations.push(`${relFile} -> ${dep}`);
        }
      }
    }
    expect(violations).toEqual([]);
  });
});

describe('Architecture: narrative/ must not import canon write APIs', () => {
  it('src/narrative/ files do not import WorldFactStore or CanonEventPipeline', () => {
    const violations = [];
    const canonWriteAPIs = ['WorldFactStore', 'CanonEventPipeline'];
    const files = getJsFiles(path.join(ROOT, 'src', 'narrative'));
    for (const file of files) {
      const relFile = rel(file);
      const content = readFileSync(file, 'utf-8');
      const deps = extractDeps(content);
      for (const dep of deps) {
        if (!dep.startsWith('.')) continue;
        const resolved = resolveImport(file, dep);
        if (resolved) {
          for (const api of canonWriteAPIs) {
            if (resolved.includes(api)) {
              violations.push(`${relFile} -> ${dep}`);
            }
          }
        }
      }
    }
    expect(violations).toEqual([]);
  });
});

describe('Architecture: facts/ compatibility wrapper re-exports from src/', () => {
  it('facts/index.js imports from src/canon, src/knowledge, src/narrative', () => {
    const factsIndexPath = path.join(ROOT, 'facts', 'index.js');
    const content = readFileSync(factsIndexPath, 'utf-8');
    expect(content).toMatch(/require\(['"]\.\.\/src\/canon/);
    expect(content).toMatch(/require\(['"]\.\.\/src\/knowledge/);
    expect(content).toMatch(/require\(['"]\.\.\/src\/narrative/);
  });

  it('old facts/ imports still resolve all symbols', () => {
    const symbols = [
      'WorldFactStore', 'FactEmitter', 'FactFormatter',
      'FactProvider', 'FactConsistencyChecker', 'KnowledgeStore',
      'CanonEventPipeline', 'FactType', 'FACT_TYPES',
      'validateFact', 'createEventFact',
    ];
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const facts = require('../../facts/index.js');
    for (const sym of symbols) {
      expect(facts[sym]).toBeDefined();
    }
  });
});

describe('Stage 20: src/ must not import old top-level public facades', () => {
  const OLD_WRAPPERS = [
    'facts', 'agent', 'core', 'sdk', 'store', 'social', 'spatial', 'domain', 'config', 'effects', 'world',
  ];

  it('src/ files do not import old top-level wrappers (except via src/ paths)', () => {
    const violations = [];
    const srcDir = path.join(ROOT, 'src');
    const files = getJsFiles(srcDir);

    for (const file of files) {
      const relFile = rel(file);
      const content = readFileSync(file, 'utf-8');
      const deps = extractDeps(content);

      for (const dep of deps) {
        if (!dep.startsWith('.')) continue;
        const resolved = resolveImport(file, dep);
        if (!resolved) continue;

        for (const wrapper of OLD_WRAPPERS) {
          if (resolved === wrapper || resolved.startsWith(wrapper + '/')) {
            if (!resolved.startsWith('src/')) {
              violations.push(`${relFile} -> ${dep} (resolves to ${resolved})`);
            }
          }
        }
      }
    }
    expect(violations).toEqual([]);
  });
});

describe('Stage 20: index.js uses canonical imports', () => {
  it('index.js does not import ./core/ or ./facts/ or other old top-level wrappers', () => {
    const indexPath = path.join(ROOT, 'index.js');
    const content = readFileSync(indexPath, 'utf-8');
    const deps = extractDeps(content);

    const FORBIDDEN = ['./core/', './facts/', './sdk/', './store/', './social/', './spatial/', './domain/', './effects/', './world/'];
    const violations = [];

    for (const dep of deps) {
      for (const forbidden of FORBIDDEN) {
        if (dep.startsWith(forbidden) || dep === forbidden.replace(/\/$/, '')) {
          violations.push(dep);
        }
      }
    }
    expect(violations).toEqual([]);
  });
});

describe('Architecture: src/ must not require root index.js', () => {
  const ALLOWED_EXCEPTIONS = ['src/sdk/AndyEngine.js'];

  it('src/ files do not require root index.js (except thin re-exports)', () => {
    const violations = [];
    const srcDir = path.join(ROOT, 'src');
    const files = getJsFiles(srcDir);

    for (const file of files) {
      const relFile = rel(file);
      const content = readFileSync(file, 'utf-8');

      if (/require\(['"]\.\.\/(\.\.\/)*index['"]\)/.test(content)) {
        if (ALLOWED_EXCEPTIONS.includes(relFile)) continue;
        violations.push(`${relFile}: src/ must not require root index.js`);
      }
    }
    expect(violations).toEqual([]);
  });

  it('src/ files do not dynamically require root index.js via path.resolve/path.join', () => {
    const violations = [];
    const srcDir = path.join(ROOT, 'src');
    const files = getJsFiles(srcDir);
    const dynamicIndexPattern = /require\s*\(\s*(path\.resolve|path\.join)\s*\([^)]*['"]index['"]\s*\)/;

    for (const file of files) {
      const relFile = rel(file);
      const content = readFileSync(file, 'utf-8');

      if (dynamicIndexPattern.test(content)) {
        violations.push(`${relFile}: src/ must not dynamically require root index.js`);
      }
    }
    expect(violations).toEqual([]);
  });
});
