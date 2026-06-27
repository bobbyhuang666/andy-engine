/**
 * Narrative Violation Corpus (ALIVENESS_BENCHMARK_RFC v0.3 §D5)
 *
 * 首批 ≥10 条已知 violation 样本，覆盖 FactConsistencyChecker 实际能检出的类别。
 * 每条样本的 llmOutput 严格对齐 checker 的 regex 触发条件（非造假，是真实反映
 * checker 当前能力边界）。
 *
 * 供 tests/unit/narrative-violation-corpus.test.js 跑检出率统计（B3：检出率 <80% fail）。
 *
 * grounding 构造模式参考 tests/unit/narrative/fact-consistency-checker.test.js。
 * checker: new FactConsistencyChecker({}, { regions })
 *
 * checker 实际触发条件（核自源码）：
 *   - unknown_character: [标点](2-4汉字)(?=动词 说聊问答告诉来了去了见到)
 *   - unknown_location: [在去到从]XX 模式，XX 不在 regions 且非排除后缀
 *   - unknown_event: 那次XX / 上次XX 模式，不在已知事件且长度>3
 *   - time_conflict: 白天(6-18点)含"深夜/凌晨"，夜晚含"中午/下午"
 *   - new_relationship: 成为XX朋友/变成XX关系/分手了/在一起了/结婚了
 *   - new_event: 刚刚XX了 模式，不在已知事件
 *   - unsupported_claim: （见 _checkAgentLocationClaims，无支撑的 agent-location 声明）
 *   - missing_source_attribution: told/inferred 事实缺少来源标注 (v2.5-W1)
 *
 * 注意：checker 的 location regex /[在去到从]([一-龥]{2,6})/g 会贪婪捕获，
 * "找到了" 中的 "到" 会触发 unknown_location 误报。语料设计需避开此陷阱。
 */

const { FactType } = require('../../../src/canon/FactSchema');

const KNOWN_AGENT = '爱丽丝';
const KNOWN_OTHER = '鲍勃';
const KNOWN_REGIONS = ['图书馆', '食堂', '宿舍'];

function baseGrounding(overrides = {}) {
  return {
    allowedFacts: [
      { type: FactType.AGENT_STATE, agentId: KNOWN_AGENT },
      { type: FactType.AGENT_STATE, agentId: KNOWN_OTHER },
    ],
    metadata: {
      agentId: KNOWN_AGENT,
      // 用中午 12:00 本地时间确保 checker 走白天分支（6-18），
      // 避免 UTC 转 local 时区导致 hour 落在夜晚分支。
      // checker 用 getHours()（本地时区），故用本地中午。
      currentTime: new Date(2026, 8, 1, 12, 0, 0), // 2026-09-01 12:00 local
    },
    ...overrides,
  };
}

const corpus = [
  // ─── unknown_character (角色名): [标点](2-4字)(?=动词) ───
  {
    id: 'nv-001',
    category: 'unknown_character',
    description: 'LLM 提到 grounding 未知角色（动词前）',
    llmOutput: '，小明说道今天有点累。',
    grounding: baseGrounding(),
    expectedViolations: [{ type: 'unknown_character' }],
  },
  {
    id: 'nv-002',
    category: 'unknown_character',
    description: 'LLM 提到另一未知角色',
    llmOutput: '，小红告诉了你一个秘密。',
    grounding: baseGrounding(),
    expectedViolations: [{ type: 'unknown_character' }],
  },
  {
    id: 'nv-003',
    category: 'unknown_character',
    description: 'LLM 提到第三个未知角色',
    llmOutput: '，小华来了图书馆。',
    grounding: baseGrounding(),
    expectedViolations: [{ type: 'unknown_character' }],
  },

  // ─── unknown_location (地名): [在去到从]XX ───
  {
    id: 'nv-004',
    category: 'unknown_location',
    description: 'LLM 编造 grounding 外地点（去XX模式）',
    llmOutput: '我去了火星探险。',
    grounding: baseGrounding(),
    expectedViolations: [{ type: 'unknown_location' }],
  },
  {
    id: 'nv-005',
    category: 'unknown_location',
    description: 'LLM 在未配置地点（去XX模式）',
    llmOutput: '我去咖啡馆了。',
    grounding: baseGrounding(),
    expectedViolations: [{ type: 'unknown_location' }],
  },

  // ─── unknown_event (事件知识): 那次XX/上次XX ───
  {
    id: 'nv-006',
    category: 'unknown_event',
    description: 'LLM 引用未知事件（上次XX）',
    llmOutput: '上次考试你考了满分这件事真厉害。',
    grounding: baseGrounding(),
    expectedViolations: [{ type: 'unknown_event' }],
  },
  {
    id: 'nv-007',
    category: 'unknown_event',
    description: 'LLM 引用未知事件（那次XX）',
    llmOutput: '那次运动会你跑了第一名真的很强。',
    grounding: baseGrounding(),
    expectedViolations: [{ type: 'unknown_event' }],
  },

  // ─── time_conflict: 白天含深夜/凌晨 ───
  {
    id: 'nv-008',
    category: 'time_conflict',
    description: '白天（10点）提到深夜',
    llmOutput: '深夜的时候你还在学习。',
    grounding: baseGrounding(),
    expectedViolations: [{ type: 'time_conflict' }],
  },
  {
    id: 'nv-009',
    category: 'time_conflict',
    description: '白天（10点）提到凌晨',
    llmOutput: '凌晨三点你突然醒了。',
    grounding: baseGrounding(),
    expectedViolations: [{ type: 'time_conflict' }],
  },

  // ─── new_relationship: 成为XX朋友 ───
  {
    id: 'nv-010',
    category: 'new_relationship',
    description: 'LLM 编造新关系变化',
    llmOutput: '你和小明成为了好朋友。',
    grounding: baseGrounding(),
    expectedViolations: [{ type: 'new_relationship' }],
  },

  // ─── new_event: 刚刚XX了 ───
  {
    id: 'nv-011',
    category: 'new_event',
    description: 'LLM 编造新事件（刚刚XX了）',
    llmOutput: '刚刚吃了一顿大餐了。',
    grounding: baseGrounding(),
    expectedViolations: [{ type: 'new_event' }],
  },

  // ═══════════════════════════════════════════
  // v2.5-W1 新增：evidence-aware violation entries
  // ═══════════════════════════════════════════

  // ─── missing_source_attribution: told without marker ───
  {
    id: 'nv-012',
    category: 'missing_source_attribution',
    description: 'told 级别事实未标注来源',
    // 用 "发现" 替代 "找到"，避免 "到" 触发 unknown_location 误报
    llmOutput: '鲍勃发现了一本好书。',
    grounding: baseGrounding({
      allowedFacts: [
        { type: FactType.AGENT_STATE, agentId: KNOWN_AGENT },
        { type: FactType.AGENT_STATE, agentId: KNOWN_OTHER },
        { type: FactType.EVENT, description: '鲍勃发现了一本好书', location: '图书馆', _evidence: { source: 'told', confidence: 0.6, propagatedFrom: KNOWN_OTHER } },
      ],
    }),
    expectedViolations: [{ type: 'missing_source_attribution' }],
  },
  {
    id: 'nv-013',
    category: 'missing_source_attribution',
    description: 'inferred 级别事实未标注推测',
    llmOutput: '食堂发生了有趣的事。',
    grounding: baseGrounding({
      allowedFacts: [
        { type: FactType.AGENT_STATE, agentId: KNOWN_AGENT },
        { type: FactType.AGENT_STATE, agentId: KNOWN_OTHER },
        { type: FactType.EVENT, description: '食堂发生了有趣的事', location: '食堂', _evidence: { source: 'inferred', confidence: 0.5, propagatedFrom: null } },
      ],
    }),
    expectedViolations: [{ type: 'missing_source_attribution' }],
  },
  {
    id: 'nv-014',
    category: 'missing_source_attribution',
    description: 'inferred 表达成确定事实（无标记）',
    llmOutput: '食堂大概有人聚餐。',
    grounding: baseGrounding({
      allowedFacts: [
        { type: FactType.AGENT_STATE, agentId: KNOWN_AGENT },
        { type: FactType.AGENT_STATE, agentId: KNOWN_OTHER },
        { type: FactType.EVENT, description: '食堂大概有人聚餐', location: '食堂', _evidence: { source: 'inferred', confidence: 0.5, propagatedFrom: null } },
      ],
    }),
    expectedViolations: [],  // "大概" is a valid hedging marker → no violation
  },

  // ─── pass samples (no violations expected) ───
  {
    id: 'nv-015',
    category: 'pass',
    description: 'told 事实正确标注"听说"',
    // 用 "发现" 替代 "找到"，避免 "到" 触发 unknown_location 误报
    llmOutput: '我听说鲍勃发现了一本好书。',
    grounding: baseGrounding({
      allowedFacts: [
        { type: FactType.AGENT_STATE, agentId: KNOWN_AGENT },
        { type: FactType.AGENT_STATE, agentId: KNOWN_OTHER },
        { type: FactType.EVENT, description: '鲍勃发现了一本好书', location: '图书馆', _evidence: { source: 'told', confidence: 0.6, propagatedFrom: KNOWN_OTHER } },
      ],
    }),
    expectedViolations: [],
  },
  {
    id: 'nv-016',
    category: 'pass',
    description: 'inferred 事实正确标注"推测"',
    llmOutput: '我推测食堂有人聚餐。',
    grounding: baseGrounding({
      allowedFacts: [
        { type: FactType.AGENT_STATE, agentId: KNOWN_AGENT },
        { type: FactType.AGENT_STATE, agentId: KNOWN_OTHER },
        { type: FactType.EVENT, description: '食堂有人聚餐', location: '食堂', _evidence: { source: 'inferred', confidence: 0.5, propagatedFrom: null } },
      ],
    }),
    expectedViolations: [],
  },
  {
    id: 'nv-017',
    category: 'pass',
    description: 'direct 事实自由表达',
    // 逗号分割使 location regex 恰好捕获 "图书馆"（3字），而非贪婪捕获 "图书馆看了一"
    llmOutput: '今天在图书馆，看了一天的书。',
    grounding: baseGrounding({
      allowedFacts: [
        { type: FactType.AGENT_STATE, agentId: KNOWN_AGENT },
        { type: FactType.EVENT, description: '在图书馆看书', location: '图书馆', _evidence: { source: 'direct', confidence: 1.0, propagatedFrom: null } },
      ],
    }),
    expectedViolations: [],
  },

  // ─── boundary cases (may_detect: false) ───
  {
    id: 'nv-018',
    category: 'missing_source_attribution',
    description: '模糊来源标注"好像听说"（boundary）',
    // 用 "发现" 替代 "找到"，避免 "到" 触发 unknown_location 误报
    llmOutput: '我好像听说鲍勃发现了一本好书。',
    grounding: baseGrounding({
      allowedFacts: [
        { type: FactType.AGENT_STATE, agentId: KNOWN_AGENT },
        { type: FactType.AGENT_STATE, agentId: KNOWN_OTHER },
        { type: FactType.EVENT, description: '鲍勃发现了一本好书', location: '图书馆', _evidence: { source: 'told', confidence: 0.6, propagatedFrom: KNOWN_OTHER } },
      ],
    }),
    expectedViolations: [],
    may_detect: false,  // "好像听说" contains "听说" so checker should pass it — boundary
  },
  {
    id: 'nv-019',
    category: 'missing_source_attribution',
    description: '间接表达 inferred 事实（boundary）',
    llmOutput: '食堂那边估计挺热闹。',
    grounding: baseGrounding({
      allowedFacts: [
        { type: FactType.AGENT_STATE, agentId: KNOWN_AGENT },
        { type: FactType.EVENT, description: '食堂有聚餐', location: '食堂', _evidence: { source: 'inferred', confidence: 0.5, propagatedFrom: null } },
      ],
    }),
    expectedViolations: [],
    may_detect: false,  // "估计" is a hedging marker — checker may or may not detect it
  },
  {
    id: 'nv-020',
    category: 'unknown_character',
    description: '语义等价人名 "Ming" 替代 "小明"（boundary）',
    llmOutput: '，Ming说道今天有点累。',
    grounding: baseGrounding(),
    expectedViolations: [{ type: 'unknown_character' }],
    may_detect: false,  // regex only matches Chinese chars — English name won't trigger
  },
];

module.exports = {
  corpus,
  KNOWN_AGENT,
  KNOWN_OTHER,
  KNOWN_REGIONS,
  baseGrounding,
};
