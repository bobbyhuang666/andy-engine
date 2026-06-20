/**
 * Source-Scan 测试
 *
 * 扫描 runtime 文件中的 campus-only 字符串，
 * 确保 core runtime 不直接依赖 campus 语义。
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'fs';
import path from 'path';

// campus-only 字符串列表
const CAMPUS_TERMS = [
  '宿舍', '教学楼', '图书馆', '食堂', '操场', '校园广场',
  '教室', '自习室', '网吧', '办公室',
  '学生', '老师', '教授', '上课', '自习', '翘课', '逃课',
  '考试', '作业', '学分', '绩点',
  '便利店', '打工地点', '咖啡店',
];

// banned API 列表（custom-domain runtime 不应使用）
const BANNED_APIS = [
  'sanitizeText',
  'safeRegion',
  'safeActivity',
];

// deterministic runtime 检查：agent/action/** 中不允许 Math.random( 或 Date.now(
const DETERMINISTIC_BANNED = ['Math.random(', 'Date.now('];

// 允许出现 campus terms 的路径
const ALLOWED_PATHS = [
  'presets/campus/',
  'tests/',
  'docs/',
  'README.md',
  'AGENTS.md',
];

// 允许使用 banned API 的路径
const BANNED_API_ALLOWED_PATHS = [
  'tests/',
  'presets/',
];

function isAllowed(filePath, allowedPaths) {
  const normalized = filePath.replace(/\\/g, '/');
  return allowedPaths.some(allowed => normalized.includes(allowed));
}

function getJsFiles(dir, fileList = []) {
  const files = readdirSync(dir);

  for (const file of files) {
    const filePath = path.join(dir, file);
    const stat = statSync(filePath);

    if (stat.isDirectory()) {
      if (!['node_modules', '.git', 'native'].includes(file)) {
        getJsFiles(filePath, fileList);
      }
    } else if (file.endsWith('.js')) {
      fileList.push(filePath);
    }
  }

  return fileList;
}

function scanFileForCampusTerms(filePath) {
  const content = readFileSync(filePath, 'utf-8');
  const violations = [];

  for (const term of CAMPUS_TERMS) {
    // 扫描文件全文，只要出现 term 就报告
    const regex = new RegExp(term, 'g');
    const matches = content.match(regex);
    if (matches) {
      violations.push({ term, count: matches.length });
    }
  }

  return violations;
}

function scanFileForBannedAPIs(filePath) {
  const content = readFileSync(filePath, 'utf-8');
  const violations = [];

  for (const api of BANNED_APIS) {
    // 检查函数调用
    const regex = new RegExp(`\\b${api}\\s*\\(`, 'g');
    const matches = content.match(regex);
    if (matches) {
      violations.push({ api, count: matches.length });
    }
  }

  return violations;
}

function scanFileForDeterministicAPIs(filePath) {
  const content = readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');
  const violations = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    // 跳过注释行
    if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) continue;

    for (const banned of DETERMINISTIC_BANNED) {
      if (line.includes(banned)) {
        violations.push({ api: banned, line: i + 1 });
      }
    }
  }

  return violations;
}

describe('Source-Scan: runtime 不依赖 campus-only strings', () => {
  const runtimeDirs = [
    'core',
    'agent',
    'sdk',
    'spatial',
    'facts',
  ];

  it('runtime 文件中不应有 campus-only 字符串', () => {
    const violations = [];
    const rootDir = process.cwd();

    // 检查 index.js
    const indexPath = path.join(rootDir, 'index.js');
    if (!isAllowed('index.js', ALLOWED_PATHS)) {
      const indexViolations = scanFileForCampusTerms(indexPath);
      if (indexViolations.length > 0) {
        violations.push({ file: 'index.js', violations: indexViolations });
      }
    }

    // 检查 runtime 目录
    for (const dir of runtimeDirs) {
      const files = getJsFiles(path.join(rootDir, dir));

      for (const file of files) {
        const relativePath = path.relative(rootDir, file);
        if (isAllowed(relativePath, ALLOWED_PATHS)) continue;

        const fileViolations = scanFileForCampusTerms(file);
        if (fileViolations.length > 0) {
          violations.push({ file: relativePath, violations: fileViolations });
        }
      }
    }

    if (violations.length > 0) {
      const msg = violations.map(({ file, violations }) => {
        const terms = violations.map(v => `${v.term}(${v.count})`).join(', ');
        return `  ${file}: ${terms}`;
      }).join('\n');

      expect.fail(`以下 runtime 文件包含 campus-only 字符串:\n${msg}\n\n请迁移到 presets/campus 或使用 domain 配置。`);
    }
  });

  it('runtime 文件不应使用 campus replacement API（sanitizeText/safeRegion/safeActivity）', () => {
    const violations = [];
    const rootDir = process.cwd();

    // 检查 index.js
    const indexPath = path.join(rootDir, 'index.js');
    if (!isAllowed('index.js', BANNED_API_ALLOWED_PATHS)) {
      const indexViolations = scanFileForBannedAPIs(indexPath);
      if (indexViolations.length > 0) {
        violations.push({ file: 'index.js', violations: indexViolations });
      }
    }

    // 检查 runtime 目录
    for (const dir of runtimeDirs) {
      const files = getJsFiles(path.join(rootDir, dir));

      for (const file of files) {
        const relativePath = path.relative(rootDir, file);
        if (isAllowed(relativePath, BANNED_API_ALLOWED_PATHS)) continue;

        const fileViolations = scanFileForBannedAPIs(file);
        if (fileViolations.length > 0) {
          violations.push({ file: relativePath, violations: fileViolations });
        }
      }
    }

    if (violations.length > 0) {
      const msg = violations.map(({ file, violations }) => {
        const apis = violations.map(v => `${v.api}(${v.count})`).join(', ');
        return `  ${file}: ${apis}`;
      }).join('\n');

      expect.fail(`以下 runtime 文件使用了 campus replacement API:\n${msg}\n\n请改用 applyForbiddenTerms(text, domain)。`);
    }
  });

  it('agent/action/** 不应使用 Math.random() 或 Date.now()', () => {
    const violations = [];
    const rootDir = process.cwd();
    const actionDir = path.join(rootDir, 'agent', 'action');

    const files = getJsFiles(actionDir);
    for (const file of files) {
      const relativePath = path.relative(rootDir, file);
      const fileViolations = scanFileForDeterministicAPIs(file);
      if (fileViolations.length > 0) {
        violations.push({ file: relativePath, violations: fileViolations });
      }
    }

    if (violations.length > 0) {
      const msg = violations.map(({ file, violations }) => {
        const details = violations.map(v => `${v.api} at line ${v.line}`).join(', ');
        return `  ${file}: ${details}`;
      }).join('\n');

      expect.fail(`agent/action/** 包含非确定性 API:\n${msg}\n\n请使用 seeded RNG 或传入 simTime。`);
    }
  });

  it('facts/** 不应使用 Date.now() 作为 runtime fallback', () => {
    const violations = [];
    const rootDir = process.cwd();
    const factsDir = path.join(rootDir, 'facts');

    const files = getJsFiles(factsDir);
    for (const file of files) {
      const relativePath = path.relative(rootDir, file);
      const fileViolations = scanFileForDeterministicAPIs(file);
      if (fileViolations.length > 0) {
        violations.push({ file: relativePath, violations: fileViolations });
      }
    }

    if (violations.length > 0) {
      const msg = violations.map(({ file, violations }) => {
        const details = violations.map(v => `${v.api} at line ${v.line}`).join(', ');
        return `  ${file}: ${details}`;
      }).join('\n');

      expect.fail(`facts/** 包含非确定性 API:\n${msg}\n\n请使用 simTime 或 fixed epoch fallback。`);
    }
  });

  it('config/defaults.js 是 core runtime defaults，不允许 campus-only terms', () => {
    const rootDir = process.cwd();
    const defaultsPath = path.join(rootDir, 'config', 'defaults.js');
    const violations = scanFileForCampusTerms(defaultsPath);

    if (violations.length > 0) {
      const terms = violations.map(v => `${v.term}(${v.count})`).join(', ');
      expect.fail(
        `config/defaults.js 包含 campus-only 字符串: ${terms}\n` +
        'config/defaults.js 是 core runtime defaults，不允许 campus-specific 术语。请使用中性描述。'
      );
    }
  });

  it('config/defaults.js 的 spatial 只能包含 generic continuous params，不允许 campus-specific keys', () => {
    const { ANDY_DEFAULTS } = require('../config/defaults.js');
    const spatial = ANDY_DEFAULTS.spatial;

    const FORBIDDEN_KEYS = ['regions', 'adjacency', 'regionCoords'];
    const found = FORBIDDEN_KEYS.filter(key => key in spatial);

    if (found.length > 0) {
      expect.fail(
        `config/defaults.js spatial 包含 campus-specific keys: ${found.join(', ')}。\n` +
        '这些 key 已迁移到 presets/campus，不应出现在全局 defaults 中。'
      );
    }
  });

  it('agent/action/UtilitySelector.js 不应有 Math.random fallback', () => {
    const rootDir = process.cwd();
    const selectorPath = path.join(rootDir, 'agent', 'action', 'UtilitySelector.js');
    const content = readFileSync(selectorPath, 'utf-8');

    // 不应包含 Math.random 作为 fallback
    expect(content).not.toMatch(/Math\.random\s*\(\s*\)/);
  });
});
