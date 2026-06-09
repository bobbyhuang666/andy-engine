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

// 允许出现 campus terms 的路径
const ALLOWED_PATHS = [
  'presets/campus/',
  'tests/',
  'docs/',
  'README.md',
  'AGENTS.md',
  'core/WorldviewConstraints.js', // transitional
  'config/defaults.js', // campus legacy spatial config
  'agent/Schedule.js', // campus legacy schedule presets
];

// 允许使用 banned API 的路径
const BANNED_API_ALLOWED_PATHS = [
  'core/WorldviewConstraints.js', // 定义处
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

describe('Source-Scan: runtime 不依赖 campus-only strings', () => {
  const runtimeDirs = [
    'core',
    'agent',
    'sdk',
    'spatial',
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
});
