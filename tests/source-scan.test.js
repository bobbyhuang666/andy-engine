/**
 * Source-Scan 测试
 *
 * 扫描 runtime 文件中的 campus-only 字符串，
 * 确保 core runtime 不直接依赖 campus 语义。
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync, existsSync } from 'fs';
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

// deterministic runtime 检查：src/action/** 中不允许 Math.random( 或 Date.now(
const DETERMINISTIC_BANNED = ['Math.random(', 'Date.now('];

// 允许出现 campus terms 的路径
const ALLOWED_PATHS = [
  'presets/campus/',
  'src/config/defaults.js',
  'src/domain/DomainRegistry.js',
  'src/narrative/FactConsistencyChecker.js',
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
  const files = existsSync(dir) ? readdirSync(dir) : [];

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
  const lines = content.split('\n')
    .filter(line => {
      const trimmed = line.trim();
      return !(trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*'));
    });
  const source = lines.join('\n');
  const violations = [];

  for (const term of CAMPUS_TERMS) {
    // 扫描文件全文，只要出现 term 就报告
    const regex = new RegExp(term, 'g');
    const matches = source.match(regex);
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
    'src/runtime',
    'src/agent',
    'src/action',
    'src/effects',
    'src/pressure',
    'src/domain',
    'src/config',
    'src/sdk',
    'src/store',
    'src/canon',
    'src/knowledge',
    'src/narrative',
    'src/social',
    'src/spatial',
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

  it('src/action/** 不应使用 Math.random() 或 Date.now()', () => {
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

      expect.fail(`src/action/** 包含非确定性 API:\n${msg}\n\n请使用 seeded RNG 或传入 simTime。`);
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

  it('src/config/defaults.js 是 core runtime defaults，不允许 campus-only terms', () => {
    const rootDir = process.cwd();
    const defaultsPath = path.join(rootDir, 'src', 'config', 'defaults.js');
    const violations = scanFileForCampusTerms(defaultsPath);

    if (violations.length > 0) {
      const terms = violations.map(v => `${v.term}(${v.count})`).join(', ');
      expect.fail(
        `src/config/defaults.js 包含 campus-only 字符串: ${terms}\n` +
        'src/config/defaults.js 是 core runtime defaults，不允许 campus-specific 术语。请使用中性描述。'
      );
    }
  });

  it('src/config/defaults.js 的 spatial 只能包含 generic continuous params，不允许 campus-specific keys', () => {
    const { ANDY_DEFAULTS } = require('../src/config/defaults.js');
    const spatial = ANDY_DEFAULTS.spatial;

    const FORBIDDEN_KEYS = ['regions', 'adjacency', 'regionCoords'];
    const found = FORBIDDEN_KEYS.filter(key => key in spatial);

    if (found.length > 0) {
      expect.fail(
        `src/config/defaults.js spatial 包含 campus-specific keys: ${found.join(', ')}。\n` +
        '这些 key 已迁移到 presets/campus，不应出现在全局 defaults 中。'
      );
    }
  });

  it('src/action/UtilitySelector.js 不应有 Math.random fallback', () => {
    const rootDir = process.cwd();
    const selectorPath = path.join(rootDir, 'src', 'action', 'UtilitySelector.js');
    const content = readFileSync(selectorPath, 'utf-8');

    // 不应包含 Math.random 作为 fallback
    expect(content).not.toMatch(/Math\.random\s*\(\s*\)/);
  });

  // ─── A5.3: Semantic Profile Boundary Scan ───

  function stripComments(content) {
    return content
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/[^\n]*/g, '');
  }

  function extractChineseStrings(line) {
    const results = [];
    const patterns = [
      /'([^'\\]*(?:\\.[^'\\]*)*[\u4e00-\u9fff][^'\\]*(?:\\.[^'\\]*)*)'/g,
      /"([^"\\]*(?:\\.[^"\\]*)*[\u4e00-\u9fff][^"\\]*(?:\\.[^"\\]*)*)"/g,
      /`([^`\\]*(?:\\.[^`\\]*)*[\u4e00-\u9fff][^`\\]*(?:\\.[^`\\]*)*)`/g,
    ];
    for (const pattern of patterns) {
      let match;
      while ((match = pattern.exec(line)) !== null) {
        if (match[1].includes('${')) continue;
        results.push(match[1]);
      }
    }
    return results;
  }

  function hasFallbackPattern(line) {
    const orIdx = line.lastIndexOf('||');
    if (orIdx === -1) return false;
    const afterOr = line.slice(orIdx + 2);
    return /[\u4e00-\u9fff]/.test(afterOr);
  }

  function isInFallbackArray(lines, lineIdx) {
    for (let i = lineIdx - 1; i >= Math.max(0, lineIdx - 10); i--) {
      if (/[\u4e00-\u9fff]/.test(lines[i])) continue;
      if (lines[i].includes('||') && lines[i].includes('[')) return true;
      if (lines[i].includes('||') && /[\u4e00-\u9fff]/.test(lines[i])) return true;
      if (lines[i].trim() === '' || lines[i].trim().startsWith('//')) continue;
      break;
    }
    return false;
  }

  const SEMANTIC_PROFILE_EXCEPTIONS = {
    'src/agent/psychology/EmotionVector.js': [
      '开心', '难过', '生气', '害怕', '惊讶', '厌恶', '觉得好笑',
      '敬畏', '满足', '渴望', '尴尬', '内疚', '恐惧', '感兴趣',
      '喜欢/爱', '紧张', '自豪', '如释重负', '满意', '羞耻', '同情',
      '得意', '无聊', '平静', '困惑', '兴奋', '沮丧/烦躁', '感激',
      '希望', '孤独', '不开心', '不满足', '不安', '低落', '失望', '不满意',
      '极度', '非常', '很', '挺', '比较', '有点', '略微',
      '心情不错', '心情还行', '心情一般', '有点低落', '心情不太好',
      '你的内心比较平静', '压力很大', '有点压力', '精力充沛', '有些疲倦',
    ],
    'src/agent/psychology/Personality.js': [
      '你性格外向，喜欢社交，话比较多', '你性格内向，不太主动说话，更喜欢独处',
      '你的社交倾向适中，既不特别外向也不特别内向',
      '你容易焦虑和想太多，情绪波动较大', '你情绪稳定，不太容易焦虑',
      '你的情绪稳定性一般，偶尔会有些焦虑',
      '你待人友善温和，乐于助人', '你说话直接，不太在意别人的感受',
      '你的人际态度取决于具体情况，有时温和有时直接',
      '你思维开放，对新事物充满好奇', '你偏好熟悉的事物，不太喜欢变化',
      '你对新事物持开放但审慎的态度',
      '你做事有条理，计划性强', '你在需要时能有条理地做事，但也会灵活应变',
      '你比较随性，不太喜欢被计划束缚',
      '你说话偏简短，不喜欢长篇大论', '遇到不顺心的事你会表现出不安或犹豫',
      '你说话热情，喜欢用感叹和鼓励的语气',
    ],
    'src/agent/psychology/EmotionRegulation.js': [
      '调节能力充足', '调节能力一般', '调节能力不足', '调节资源枯竭',
      '善于重评价', '善于转移注意力', '善于控制表达', '擅长', '情绪调节：',
    ],
    'src/agent/runtime/MindWanderRuntime.js': [
      '想起了', '的事：', '心里不太舒服', '嘴角不自觉上扬',
      '脑子里乱乱的，总觉得有什么事没做完',
      '想着等下做什么好呢', '今天天气不错，心情也挺好的',
      '希望这样的日子能多一些', '突然想到了一个有趣的想法',
      '秒前', '分钟前', '小时前', '天前', '周前', '刚刚',
    ],
    'src/agent/memory/PersonalMemory.js': [
      '日常琐事', '刚刚', '小时前', '天前', '周前',
      '记忆：没有什么特别的印象。',
    ],
    'src/agent/lifecycle/AgentSubsystemFactory.js': [
      '住处',
    ],
    'src/agent/psychology/NeedsSystem.js': [
      '饱腹', '精力', '社交', '舒适', '兴趣',
    ],
    'src/agent/psychology/NeedsSystem.native.js': [
      '饱腹', '精力', '社交', '舒适', '兴趣',
    ],
    'src/agent/psychology/EmotionVector.native.js': [
      '开心', '难过', '生气', '害怕', '惊讶', '厌恶', '觉得好笑',
      '敬畏', '满足', '渴望', '尴尬', '内疚', '恐惧', '感兴趣',
      '喜欢/爱', '紧张', '自豪', '如释重负', '满意', '羞耻', '同情',
      '得意', '无聊', '平静', '困惑', '兴奋', '沮丧/烦躁', '感激',
      '希望', '孤独', '不开心', '不满足', '不安', '低落', '失望', '不满意',
      '极度', '非常', '很', '挺', '比较', '有点', '略微',
      '心情不错', '心情还行', '心情一般', '有点低落', '心情不太好',
      '你的内心比较平静', '你的内心处于矛盾之中——', '的暖意', '的阴影', '在拉锯',
      '同时还夹杂着', '压力很大', '有点压力', '精力充沛', '有些疲倦',
      '整体心情', '略好', '略差',
    ],
    'src/runtime/EventDispatcher.js': [
      '天气变化: ',
    ],
    'src/agent/facade/AgentNarrative.js': [
      '心情不太好', '有点孤独', '有点烦', '有点焦虑', '好无聊', '有点烦躁',
      '有点不安', '心情还不错', '挺满足的', '有点兴奋', '挺平静的', '有点期待',
      '刚才', '不久前', '活动程度', '社交倾向', '专注度', '表达欲',
      '在上升', '在下降',
    ],
    'src/agent/facade/InteractionFacade.js': [
      '聊了天', '互相帮助', '发生了冲突', '擦肩而过',
    ],
    'src/agent/psychology/BehaviorLabeler.js': [
      '有点心不在焉', '想找人说话', '不太想动',
    ],
    'src/agent/psychology/LocationMeaningInfluence.js': [
      '普通',
    ],
  };

  function scanFileForSemanticProfileViolations(filePath, rootDir) {
    const relativePath = path.relative(rootDir, filePath);
    const rawContent = readFileSync(filePath, 'utf-8');
    const content = stripComments(rawContent);
    const lines = content.split('\n');
    const violations = [];
    const exceptions = SEMANTIC_PROFILE_EXCEPTIONS[relativePath] || [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const chineseStrings = extractChineseStrings(line);

      for (const str of chineseStrings) {
        if (hasFallbackPattern(line)) continue;
        if (isInFallbackArray(lines, i)) continue;
        if (exceptions.some(ex => str.includes(ex) || ex.includes(str))) continue;
        violations.push({ line: i + 1, string: str.slice(0, 30) });
      }
    }

    return violations;
  }

  it('src/runtime/ 和 src/agent/ 中的 Chinese string literals 应通过 semanticProfile 获取（A5.3）', () => {
    const violations = [];
    const rootDir = process.cwd();
    const scanDirs = ['src/runtime', 'src/agent'];

    for (const dir of scanDirs) {
      const fullDir = path.join(rootDir, dir);
      const files = getJsFiles(fullDir);

      for (const file of files) {
        const relativePath = path.relative(rootDir, file);
        if (relativePath.includes('.native.js')) continue;
        if (relativePath.includes('__tests__/')) continue;

        const fileViolations = scanFileForSemanticProfileViolations(file, rootDir);
        if (fileViolations.length > 0) {
          violations.push({ file: relativePath, violations: fileViolations });
        }
      }
    }

    if (violations.length > 0) {
      const msg = violations.map(({ file, violations: v }) => {
        const details = v.map(x => `L${x.line}:"${x.string}"`).join(', ');
        return `  ${file}: ${details}`;
      }).join('\n');

      expect.fail(
        `以下 src/runtime|agent 文件包含 Chinese string literals（非 fallback 模式）:\n${msg}\n\n` +
        '请通过 domain.semanticProfile 获取，或将例外添加到 SEMANTIC_PROFILE_EXCEPTIONS 和 docs/DOMAIN_COMPATIBILITY_EXCEPTIONS.md'
      );
    }
  });

  // ─── Phase E: Chinese Fallback Template Detection ───

  const CHINESE_FALLBACK_ALLOWED_FILES = [
    'src/agent/facade/AgentNarrative.js',
    'src/agent/runtime/MindWanderRuntime.js',
    'src/runtime/EventDispatcher.js',
    'src/agent/psychology/Appraisal.js',
    'src/agent/psychology/BehaviorLabeler.js',
    'src/agent/psychology/EmotionRegulation.js',
    'src/agent/psychology/EmotionVector.js',
    'src/agent/psychology/IntrinsicMotivation.js',
  ];

  function scanFileForChineseFallback(filePath) {
    const content = readFileSync(filePath, 'utf-8');
    const lines = content.split('\n');
    const violations = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();
      if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) continue;

      // Match: ... || '中文...' or ... || "中文..." or ... || `中文...`
      const fallbackRegex = /\|\|\s*['"`]([^'"`]*[\u4e00-\u9fff][^'"`]*)['"`]/g;
      let match;
      while ((match = fallbackRegex.exec(line)) !== null) {
        violations.push({ line: i + 1, value: match[1].slice(0, 30) });
      }

      // Match: || ['中文', ...] array fallback
      const arrayFallbackRegex = /\|\|\s*\[([^\]]*[\u4e00-\u9fff][^\]]*)\]/g;
      while ((match = arrayFallbackRegex.exec(line)) !== null) {
        violations.push({ line: i + 1, value: `[${match[1].slice(0, 40)}]` });
      }

      // Match: { name: '中文', ... } object fallback
      const objectFallbackRegex = /\|\s*\{\s*name:\s*['"`]([\u4e00-\u9fff]+)['"`]/g;
      while ((match = objectFallbackRegex.exec(line)) !== null) {
        violations.push({ line: i + 1, value: `{ name: '${match[1]}' }` });
      }

      // Match: ternary false branch with Chinese array: ... : ['中文', ...]
      const ternaryArrayRegex = /:\s*\[([^\]]*[\u4e00-\u9fff][^\]]*)\]/g;
      while ((match = ternaryArrayRegex.exec(line)) !== null) {
        violations.push({ line: i + 1, value: `:[${match[1].slice(0, 40)}]` });
      }
    }

    return violations;
  }

  it('src/runtime/ 和 src/agent/ 不应包含中文 fallback 模板（Phase E）', () => {
    const violations = [];
    const rootDir = process.cwd();
    const scanDirs = ['src/runtime', 'src/agent'];

    for (const dir of scanDirs) {
      const fullDir = path.join(rootDir, dir);
      const files = getJsFiles(fullDir);

      for (const file of files) {
        const relativePath = path.relative(rootDir, file);
        if (relativePath.includes('.native.js')) continue;
        if (relativePath.includes('__tests__/')) continue;
        if (CHINESE_FALLBACK_ALLOWED_FILES.includes(relativePath)) continue;

        const fileViolations = scanFileForChineseFallback(file);
        if (fileViolations.length > 0) {
          violations.push({ file: relativePath, violations: fileViolations });
        }
      }
    }

    if (violations.length > 0) {
      const msg = violations.map(({ file, violations: v }) => {
        const details = v.map(x => `L${x.line}:"${x.value}"`).join(', ');
        return `  ${file}: ${details}`;
      }).join('\n');

      expect.fail(
        `以下 src/runtime|agent 文件包含中文 fallback 模板:\n${msg}\n\n` +
        '核心运行时应通过 domain.semanticProfile 获取文本，不应硬编码中文 fallback。\n' +
        '例外文件请添加到 CHINESE_FALLBACK_ALLOWED_FILES 或 docs/DOMAIN_COMPATIBILITY_EXCEPTIONS.md'
      );
    }
  });

  it('src/ 中不应有新增的 bobby 字符串（允许的 deprecated alias 除外，见 docs/DOMAIN_COMPATIBILITY_EXCEPTIONS.md）', () => {
    const rootDir = process.cwd();
    const srcDir = path.join(rootDir, 'src');

    // 允许的文件：只有这些文件可以包含 bobby（deprecated alias）
    const BOBBY_ALLOWED_FILES = [
      'src/store/SimulationStore.js',  // getStoriesForBobby deprecated alias
      'src/sdk/AndyBridge.js',         // getStoriesForBobby/getBobbyEmotion deprecated aliases
    ];

    const files = getJsFiles(srcDir);
    const violations = [];

    for (const file of files) {
      const relativePath = path.relative(rootDir, file);
      if (BOBBY_ALLOWED_FILES.includes(relativePath)) continue;

      const content = readFileSync(file, 'utf-8');
      const matches = content.match(/bobby/gi);
      if (matches) {
        violations.push({ file: relativePath, count: matches.length });
      }
    }

    if (violations.length > 0) {
      const msg = violations.map(v => `  ${v.file}: ${v.count} occurrences`).join('\n');
      expect.fail(
        `src/ 中发现非预期的 bobby 字符串:\n${msg}\n\n` +
        'bobby 只允许在 deprecated alias 中出现。请参考 docs/DOMAIN_COMPATIBILITY_EXCEPTIONS.md'
      );
    }
  });
});
