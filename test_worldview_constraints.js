/**
 * 联调测试脚本 — 验证 Andy 引擎与 Andy Town 的防污染集成
 *
 * 测试目标：
 *   1. 验证 Andy 引擎能从 Andy Town 获取干净的 snapshot
 *   2. 验证叙事输出不含校园词
 *   3. 验证夜间睡眠叙事不会把角色放到广场/街道
 *   4. 验证所有输出路径都经过防污染处理
 *
 * 运行方式：
 *   node test_worldview_constraints.js
 */

const AndyEngine = require('./index');
const { sanitizeText, checkViolations, safeRegion, safeActivity } = require('./core/WorldviewConstraints');
const { NarrativeBuilder } = require('./sdk');

// 校园词列表（用于检测）
const CAMPUS_WORDS = [
  '教室', '教学楼', '实验室', '自习室', '图书馆',
  '校园广场', '操场', '体育馆', '宿舍', '学生宿舍',
  '食堂', '学生食堂', '大学', '学院', '校区',
  '学生', '大学生', '研究生', '老师', '教授',
  '上课', '下课', '自习', '翘课', '逃课',
  '考试', '论文', '作业',
];

/**
 * 检查文本是否包含校园词
 */
function containsCampusWords(text) {
  const found = [];
  for (const word of CAMPUS_WORDS) {
    if (text.includes(word)) {
      found.push(word);
    }
  }
  return found;
}

/**
 * 测试 1: WorldviewConstraints 模块
 */
function testWorldviewConstraints() {
  console.log('\n=== 测试 1: WorldviewConstraints 模块 ===');

  // 测试 sanitizeText
  const testCases = [
    { input: '在教室上课', expected: '在工作区工作' },
    { input: '在图书馆自习', expected: '在阅览室专注做事' },
    { input: '在宿舍躺着', expected: '在住处躺着' },
    { input: '在食堂吃饭', expected: '在餐厅吃饭' },
    { input: '在操场跑步', expected: '在运动场跑步' },
    { input: '学生在上课', expected: '年轻人在工作' },
    { input: '老师在讲课', expected: '前辈在讲课' },
  ];

  let passed = 0;
  let failed = 0;

  for (const { input, expected } of testCases) {
    const result = sanitizeText(input);
    if (result === expected) {
      console.log(`  ✓ "${input}" → "${result}"`);
      passed++;
    } else {
      console.log(`  ✗ "${input}" → "${result}" (期望: "${expected}")`);
      failed++;
    }
  }

  // 测试 checkViolations
  const violationTest = checkViolations('在教室上课，学生在听老师讲课');
  console.log(`  ✓ checkViolations 检测到 ${violationTest.violations.length} 个违规词`);

  console.log(`  结果: ${passed} 通过, ${failed} 失败`);
  return failed === 0;
}

/**
 * 测试 2: Agent.toNarrative() 防污染
 */
function testAgentNarrative() {
  console.log('\n=== 测试 2: Agent.toNarrative() 防污染 ===');

  const engine = new AndyEngine();
  const agent = engine.createCharacter({
    id: 'test1',
    name: '测试角色',
    mbti: 'INFP',
    background: ['一个测试角色'],
    schedule: 'student',
  });

  // 运行几个 tick
  for (let i = 0; i < 5; i++) {
    engine.tick();
  }

  const narrative = agent.toNarrative();
  const violations = containsCampusWords(narrative);

  console.log(`  叙事内容: "${narrative}"`);

  if (violations.length === 0) {
    console.log('  ✓ 叙事不含校园词');
    return true;
  } else {
    console.log(`  ✗ 叙事包含校园词: ${violations.join(', ')}`);
    return false;
  }
}

/**
 * 测试 3: NarrativeBuilder 防污染
 */
function testNarrativeBuilder() {
  console.log('\n=== 测试 3: NarrativeBuilder 防污染 ===');

  const ctx = {
    hour: 14,
    weather: 'sunny',
    season: 'spring',
    currentRegion: '教室',  // 故意传入校园词
    needsState: '需求：饱腹充足，精力饱满。',
    emotionState: '平静的情绪主导着你的心境。',
    personalityAnchor: '你性格内向。',
    health: 100,
  };

  const prompt = NarrativeBuilder.buildSystemPrompt(ctx, { characterName: 'Test' });
  const violations = containsCampusWords(prompt);

  console.log(`  Prompt 包含 "教室": ${prompt.includes('教室')}`);
  console.log(`  Prompt 包含 "工作区": ${prompt.includes('工作区')}`);

  if (violations.length === 0) {
    console.log('  ✓ Prompt 不含校园词');
    return true;
  } else {
    console.log(`  ✗ Prompt 包含校园词: ${violations.join(', ')}`);
    return false;
  }
}

/**
 * 测试 4: 夜间睡眠叙事
 */
function testNighttimeSleep() {
  console.log('\n=== 测试 4: 夜间睡眠叙事 ===');

  const engine = new AndyEngine({
    startTime: new Date('2025-06-01T02:00:00'),  // 凌晨 2 点
  });

  const agent = engine.createCharacter({
    id: 'test2',
    name: '夜猫子',
    mbti: 'INFP',
    background: ['一个夜猫子'],
    schedule: 'student',
  });

  // 运行 tick
  engine.tick();

  const narrative = agent.toNarrative();
  const violations = containsCampusWords(narrative);

  console.log(`  凌晨叙事: "${narrative}"`);

  // 检查是否在广场/街道睡觉
  const badSleepPlaces = ['广场', '街道', '路上'];
  const hasBadSleepPlace = badSleepPlaces.some(place => narrative.includes(place));

  if (violations.length === 0 && !hasBadSleepPlace) {
    console.log('  ✓ 夜间叙事不含校园词，不在广场/街道睡觉');
    return true;
  } else {
    if (violations.length > 0) {
      console.log(`  ✗ 叙事包含校园词: ${violations.join(', ')}`);
    }
    if (hasBadSleepPlace) {
      console.log('  ✗ 叙事中角色在广场/街道睡觉');
    }
    return false;
  }
}

/**
 * 测试 5: 多次 tick 稳定性
 */
function testStability() {
  console.log('\n=== 测试 5: 多次 tick 稳定性 ===');

  const engine = new AndyEngine();
  const agent = engine.createCharacter({
    id: 'test3',
    name: '稳定测试',
    mbti: 'ESTJ',
    background: ['一个稳定测试角色'],
    schedule: 'worker',
  });

  let campusWordCount = 0;

  for (let i = 0; i < 50; i++) {
    engine.tick();
    const narrative = agent.toNarrative();
    const violations = containsCampusWords(narrative);
    if (violations.length > 0) {
      campusWordCount++;
      console.log(`  ✗ Tick ${i + 1} 发现校园词: ${violations.join(', ')}`);
    }
  }

  if (campusWordCount === 0) {
    console.log('  ✓ 50 次 tick 均未发现校园词');
    return true;
  } else {
    console.log(`  ✗ ${campusWordCount}/50 次 tick 发现校园词`);
    return false;
  }
}

/**
 * 主测试函数
 */
async function main() {
  console.log('Andy Engine 防污染联调测试');
  console.log('========================');

  const results = [
    { name: 'WorldviewConstraints 模块', passed: testWorldviewConstraints() },
    { name: 'Agent.toNarrative() 防污染', passed: testAgentNarrative() },
    { name: 'NarrativeBuilder 防污染', passed: testNarrativeBuilder() },
    { name: '夜间睡眠叙事', passed: testNighttimeSleep() },
    { name: '多次 tick 稳定性', passed: testStability() },
  ];

  console.log('\n=== 测试总结 ===');
  let allPassed = true;
  for (const { name, passed } of results) {
    console.log(`  ${passed ? '✓' : '✗'} ${name}`);
    if (!passed) allPassed = false;
  }

  console.log(`\n${allPassed ? '✓ 所有测试通过' : '✗ 部分测试失败'}`);

  // 测试与 Andy Town 的连接
  console.log('\n=== Andy Town 连接测试 ===');
  try {
    const { getAndyTownAdapter } = require('./core/AndyTownAdapter');
    const adapter = getAndyTownAdapter();
    const status = adapter.getConnectionStatus();
    console.log(`  连接状态: ${status.connected ? '已连接' : '未连接'}`);
    if (status.lastError) {
      console.log(`  最后错误: ${status.lastError}`);
    }

    // 尝试获取 snapshot
    const snapshot = await adapter.getSnapshot();
    if (snapshot) {
      console.log('  ✓ 成功获取 Andy Town snapshot');
      console.log(`  角色数量: ${Object.keys(snapshot.agents || {}).length}`);
    } else {
      console.log('  ⚠ 无法获取 Andy Town snapshot（Andy Town 可能未运行）');
    }
  } catch (error) {
    console.log(`  ⚠ Andy Town 连接测试跳过: ${error.message}`);
  }

  process.exit(allPassed ? 0 : 1);
}

main().catch(console.error);
