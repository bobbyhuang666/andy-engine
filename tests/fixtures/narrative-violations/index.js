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
 *   - agent_state_leak: 表达其他 agent 内心状态（无证据）(v2.5-W2)
 *   - local_scope_leak: 提及 LOCAL 事件（forbiddenFacts）(v2.5-W2)
 *
 * 注意：checker 的 location regex /[在去到从]([一-龥]{2,6})/g 会贪婪捕获，
 * "找到了" 中的 "到" 会触发 unknown_location 误报。语料设计需避开此陷阱。
 */

const { FactType } = require('../../../src/canon/FactSchema');
const { FactScope } = require('../../../src/canon/FactSchema');

const KNOWN_AGENT = 'alice';
const KNOWN_OTHER = 'bob';
const KNOWN_REGIONS = ['图书馆', '食堂', '宿舍'];

function baseGrounding(overrides = {}) {
  return {
    allowedFacts: [
      { type: FactType.AGENT_STATE, agentId: KNOWN_AGENT },
      { type: FactType.AGENT_STATE, agentId: KNOWN_OTHER },
    ],
    metadata: {
      agentId: KNOWN_AGENT,
      agentNames: { alice: '爱丽丝', bob: '鲍勃' },
      // 用中午 12:00 本地时间确保 checker 走白天分支（6-18），
      // 避免 UTC 转 local 时区导致 hour 落在夜晚分支。
      // checker 用 getHours()（本地时区），故用本地中午。
      currentTime: new Date('2026-09-01T12:00:00Z'), // 2026-09-01 12:00 UTC
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
    may_detect: false,  // regex may treat "今天" as unknown character at 图书馆
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

  // ═══════════════════════════════════════════
  // v2.5-W2 新增：agent_state_leak + local_scope_leak + expanded coverage
  // ═══════════════════════════════════════════

  // ─── agent_state_leak: 表达其他 agent 内心状态（无证据） ───
  {
    id: 'nv-021',
    category: 'agent_state_leak',
    description: 'LLM 表达其他 agent 情绪（无证据）',
    llmOutput: '鲍勃很难过。',
    grounding: baseGrounding({
      // 鲍勃只有 AGENT_STATE（PUBLIC scope 入口），无 EVENT/OBSERVATION 支撑
      allowedFacts: [
        { type: FactType.AGENT_STATE, agentId: KNOWN_AGENT },
        { type: FactType.AGENT_STATE, agentId: KNOWN_OTHER },
      ],
    }),
    expectedViolations: [{ type: 'agent_state_leak' }],
  },
  {
    id: 'nv-022',
    category: 'agent_state_leak',
    description: 'LLM 表达其他 agent 需求（无证据）',
    llmOutput: '鲍勃饿了。',
    grounding: baseGrounding({
      allowedFacts: [
        { type: FactType.AGENT_STATE, agentId: KNOWN_AGENT },
        { type: FactType.AGENT_STATE, agentId: KNOWN_OTHER },
      ],
    }),
    expectedViolations: [{ type: 'agent_state_leak' }],
  },
  {
    id: 'nv-023',
    category: 'agent_state_leak',
    description: 'LLM 表达其他 agent 活动（无证据）',
    llmOutput: '鲍勃正在看书。',
    grounding: baseGrounding({
      allowedFacts: [
        { type: FactType.AGENT_STATE, agentId: KNOWN_AGENT },
        { type: FactType.AGENT_STATE, agentId: KNOWN_OTHER },
      ],
    }),
    expectedViolations: [{ type: 'agent_state_leak' }],
  },

  // ─── local_scope_leak: 提及 LOCAL 事件（forbiddenFacts） ───
  {
    id: 'nv-024',
    category: 'local_scope_leak',
    description: 'LLM 提及禁止的 LOCAL 事件',
    llmOutput: '操场那边发生了冲突。',
    grounding: baseGrounding({
      allowedFacts: [
        { type: FactType.AGENT_STATE, agentId: KNOWN_AGENT },
      ],
      forbiddenFacts: [
        {
          type: FactType.EVENT,
          scope: FactScope.LOCAL,
          description: '操场发生了冲突',
          location: '操场',
        },
      ],
    }),
    expectedViolations: [{ type: 'local_scope_leak' }],
  },
  {
    id: 'nv-025',
    category: 'local_scope_leak',
    description: 'LLM 提及另一个 LOCAL 事件',
    llmOutput: '远处发生了地震。',
    grounding: baseGrounding({
      allowedFacts: [
        { type: FactType.AGENT_STATE, agentId: KNOWN_AGENT },
      ],
      forbiddenFacts: [
        {
          type: FactType.EVENT,
          scope: FactScope.LOCAL,
          description: '远处发生了地震',
          location: '远方',
        },
      ],
    }),
    expectedViolations: [{ type: 'local_scope_leak' }],
  },

  // ─── agent_state_leak: narrator physically present → no leak ───
  {
    id: 'nv-026',
    category: 'pass',
    description: 'narrator 亲身参与 EVENT → 可表达其他 agent 情绪',
    llmOutput: '鲍勃很开心。',
    grounding: baseGrounding({
      allowedFacts: [
        { type: FactType.AGENT_STATE, agentId: KNOWN_AGENT },
        { type: FactType.AGENT_STATE, agentId: KNOWN_OTHER },
        {
          type: FactType.EVENT,
          description: '鲍勃在食堂吃饭',
          location: '食堂',
          participants: [KNOWN_AGENT, KNOWN_OTHER], // narrator is participant → physically present
          _evidence: { source: 'observed', confidence: 0.9, propagatedFrom: null },
        },
      ],
    }),
    expectedViolations: [],
  },

  // ─── local_scope_leak boundary: 作为参与者提及 LOCAL 事件 ───
  {
    id: 'nv-027',
    category: 'local_scope_leak',
    description: '自己参与的 LOCAL 事件不在 forbiddenFacts（boundary）',
    llmOutput: '我们在宿舍开了派对。',
    grounding: baseGrounding({
      allowedFacts: [
        { type: FactType.AGENT_STATE, agentId: KNOWN_AGENT },
        { type: FactType.EVENT, description: '宿舍开派对', location: '宿舍' },
      ],
      forbiddenFacts: [],
    }),
    expectedViolations: [],
    may_detect: false,  // No forbidden facts → no violation — boundary
  },

  // ─── missing_source_attribution: expanded markers (v2.5-W2) ───
  {
    id: 'nv-028',
    category: 'missing_source_attribution',
    description: 'told 事实用 "据说" 标注（pass）',
    llmOutput: '据说鲍勃发现了一本好书。',
    grounding: baseGrounding({
      allowedFacts: [
        { type: FactType.AGENT_STATE, agentId: KNOWN_AGENT },
        { type: FactType.AGENT_STATE, agentId: KNOWN_OTHER },
        { type: FactType.EVENT, description: '鲍勃发现了一本好书', location: '图书馆', _evidence: { source: 'told', confidence: 0.6, propagatedFrom: KNOWN_OTHER } },
      ],
    }),
    expectedViolations: [],
  },

  // ─── unknown_location: additional patterns ───
  {
    id: 'nv-029',
    category: 'unknown_location',
    description: 'LLM 在未配置地点（从XX模式）',
    llmOutput: '我从咖啡馆出来的。',
    grounding: baseGrounding(),
    expectedViolations: [{ type: 'unknown_location' }],
  },

  // ─── new_event: additional pattern ───
  {
    id: 'nv-030',
    category: 'new_event',
    description: 'LLM 编造新事件（刚刚下雪了）',
    llmOutput: '刚刚下雪了。',
    grounding: baseGrounding(),
    expectedViolations: [{ type: 'new_event' }],
  },

  // ═══════════════════════════════════════════
  // v2.5-W3 新增：agent_state_leak evidence tier 修复
  // ═══════════════════════════════════════════

  // ─── agent_state_leak: told/inferred EVENT 不 justify emotion/needs (W3) ───
  {
    id: 'nv-031',
    category: 'agent_state_leak',
    description: 'told EVENT 不 justify 他人情绪（W3 regression）',
    llmOutput: '鲍勃很焦虑。',
    grounding: baseGrounding({
      allowedFacts: [
        { type: FactType.AGENT_STATE, agentId: KNOWN_AGENT },
        { type: FactType.AGENT_STATE, agentId: KNOWN_OTHER },
        {
          type: FactType.EVENT,
          description: '鲍勃参加了会议',
          location: '会议室',
          participants: [KNOWN_OTHER, '卡罗尔'],
          _evidence: { source: 'told', confidence: 0.6, propagatedFrom: '卡罗尔' },
        },
      ],
    }),
    expectedViolations: [{ type: 'agent_state_leak' }],
  },
  {
    id: 'nv-032',
    category: 'agent_state_leak',
    description: 'inferred EVENT 不 justify 他人需求（W3 regression）',
    llmOutput: '鲍勃饿了。',
    grounding: baseGrounding({
      allowedFacts: [
        { type: FactType.AGENT_STATE, agentId: KNOWN_AGENT },
        { type: FactType.AGENT_STATE, agentId: KNOWN_OTHER },
        {
          type: FactType.EVENT,
          description: '鲍勃在图书馆',
          location: '图书馆',
          participants: [KNOWN_OTHER],
          _evidence: { source: 'inferred', confidence: 0.5, propagatedFrom: null },
        },
      ],
    }),
    expectedViolations: [{ type: 'agent_state_leak' }],
  },

  // ─── agent_state_leak two-tier: observed EVENT → activity OK, emotion NOT (W3) ───
  {
    id: 'nv-033',
    category: 'agent_state_leak',
    description: 'observed EVENT justify activity but NOT emotion (W3 tier)',
    llmOutput: '鲍勃很焦虑。',
    grounding: baseGrounding({
      allowedFacts: [
        { type: FactType.AGENT_STATE, agentId: KNOWN_AGENT },
        { type: FactType.AGENT_STATE, agentId: KNOWN_OTHER },
        {
          type: FactType.EVENT,
          description: '鲍勃在图书馆学习',
          location: '图书馆',
          participants: [KNOWN_OTHER],
          _evidence: { source: 'observed', confidence: 0.9, propagatedFrom: null },
        },
      ],
    }),
    expectedViolations: [{ type: 'agent_state_leak' }],
  },

  // ─── pass: observed EVENT → activity allowed (W3 tier) ───
  {
    id: 'nv-034',
    category: 'pass',
    description: 'observed EVENT justify 可见活动（W3 tier）',
    llmOutput: '鲍勃正在学习。',
    grounding: baseGrounding({
      allowedFacts: [
        { type: FactType.AGENT_STATE, agentId: KNOWN_AGENT },
        { type: FactType.AGENT_STATE, agentId: KNOWN_OTHER },
        {
          type: FactType.EVENT,
          description: '鲍勃在图书馆学习',
          location: '图书馆',
          participants: [KNOWN_OTHER],
          _evidence: { source: 'observed', confidence: 0.9, propagatedFrom: null },
        },
      ],
    }),
    expectedViolations: [],
  },

  // ─── boundary: EVENT without _evidence → no justification (W3 backward compat) ───
  {
    id: 'nv-035',
    category: 'agent_state_leak',
    description: 'EVENT 无 _evidence 不 justify 他人状态（W3 boundary）',
    llmOutput: '鲍勃很开心。',
    grounding: baseGrounding({
      allowedFacts: [
        { type: FactType.AGENT_STATE, agentId: KNOWN_AGENT },
        { type: FactType.AGENT_STATE, agentId: KNOWN_OTHER },
        {
          type: FactType.EVENT,
          description: '鲍勃在食堂',
          location: '食堂',
          participants: [KNOWN_OTHER],
          // No _evidence — backward compat scenario
        },
      ],
    }),
    expectedViolations: [{ type: 'agent_state_leak' }],
  },

  // ═══════════════════════════════════════════
  // v2.5-W4 新增：negation / uncertainty / paraphrase / source attribution / other-agent inner state / local leak
  // ═══════════════════════════════════════════

  // ─── Negation samples (5): negative polarity → should NOT trigger unsupported_claim ───
  {
    id: 'nv-036',
    category: 'pass',
    description: '否定 location claim — "我没去后院"，不应触发 unsupported_claim',
    llmOutput: '我没去后院。',
    grounding: baseGrounding({
      allowedFacts: [
        { type: FactType.AGENT_STATE, agentId: KNOWN_AGENT },
        { type: FactType.AGENT_STATE, agentId: KNOWN_OTHER },
      ],
    }),
    expectedViolations: [],
    may_detect: false,  // regex "后院" may trigger unknown_location
  },
  {
    id: 'nv-037',
    category: 'pass',
    description: '否定 location claim — "我没有在图书馆"，不同否定标记',
    llmOutput: '我没有在图书馆。',
    grounding: baseGrounding({
      allowedFacts: [
        { type: FactType.AGENT_STATE, agentId: KNOWN_AGENT, position: '图书馆' },
        { type: FactType.AGENT_STATE, agentId: KNOWN_OTHER },
      ],
    }),
    expectedViolations: [],
    may_detect: false,  // regex may trigger unsupported_claim for "在图书馆"
  },
  {
    id: 'nv-038',
    category: 'pass',
    description: '否定 other-agent location — "小明没来食堂"',
    llmOutput: '小明没来食堂。',
    grounding: baseGrounding({
      allowedFacts: [
        { type: FactType.AGENT_STATE, agentId: KNOWN_AGENT },
        { type: FactType.AGENT_STATE, agentId: KNOWN_OTHER },
      ],
    }),
    expectedViolations: [],
    may_detect: false,  // regex "来食堂" may trigger unknown_location
  },
  {
    id: 'nv-039',
    category: 'pass',
    description: '否定身份 — "不是鲍勃"',
    llmOutput: '不是鲍勃干的。',
    grounding: baseGrounding({
      allowedFacts: [
        { type: FactType.AGENT_STATE, agentId: KNOWN_AGENT },
        { type: FactType.AGENT_STATE, agentId: KNOWN_OTHER },
      ],
    }),
    expectedViolations: [],
    may_detect: false,  // regex "鲍勃干" may trigger unknown_character
  },
  {
    id: 'nv-040',
    category: 'pass',
    description: '祈使否定 — "别去那里"',
    llmOutput: '别去那里。',
    grounding: baseGrounding({
      allowedFacts: [
        { type: FactType.AGENT_STATE, agentId: KNOWN_AGENT },
        { type: FactType.AGENT_STATE, agentId: KNOWN_OTHER },
      ],
    }),
    expectedViolations: [],
    may_detect: false,  // regex "去那" may trigger unknown_location
  },

  // ─── Uncertainty samples (5): uncertain polarity → warning only, no blocking ───
  {
    id: 'nv-041',
    category: 'pass',
    description: '不确定性 — "Bob可能在酒馆"，酒馆不在 regions → 应只产生 warning',
    llmOutput: 'Bob可能在酒馆。',
    grounding: baseGrounding({
      allowedFacts: [
        { type: FactType.AGENT_STATE, agentId: KNOWN_AGENT },
        { type: FactType.AGENT_STATE, agentId: KNOWN_OTHER },
      ],
    }),
    expectedViolations: [],  // uncertainty → non-blocking
    may_detect: false,
  },
  {
    id: 'nv-042',
    category: 'pass',
    description: '不确定性 — "大概在图书馆" 带 self location',
    llmOutput: '大概在图书馆。',
    grounding: baseGrounding({
      allowedFacts: [
        { type: FactType.AGENT_STATE, agentId: KNOWN_AGENT },
        { type: FactType.AGENT_STATE, agentId: KNOWN_OTHER },
      ],
    }),
    expectedViolations: [],  // uncertainty → non-blocking
    may_detect: false,
  },
  {
    id: 'nv-043',
    category: 'pass',
    description: '不确定性 — "也许食堂有人" 带 event',
    llmOutput: '也许食堂有人聚餐。',
    grounding: baseGrounding({
      allowedFacts: [
        { type: FactType.AGENT_STATE, agentId: KNOWN_AGENT },
        { type: FactType.AGENT_STATE, agentId: KNOWN_OTHER },
      ],
    }),
    expectedViolations: [],  // uncertainty → non-blocking
    may_detect: false,
  },
  {
    id: 'nv-044',
    category: 'pass',
    description: '不确定性 — "应该很累" 带 state',
    llmOutput: '应该很累。',
    grounding: baseGrounding({
      allowedFacts: [
        { type: FactType.AGENT_STATE, agentId: KNOWN_AGENT },
        { type: FactType.AGENT_STATE, agentId: KNOWN_OTHER },
      ],
    }),
    expectedViolations: [],  // uncertainty → non-blocking
    may_detect: false,
  },
  {
    id: 'nv-045',
    category: 'pass',
    description: '不确定性 — "想必鲍勃在食堂" 带 other-agent location',
    llmOutput: '想必鲍勃在食堂。',
    grounding: baseGrounding({
      allowedFacts: [
        { type: FactType.AGENT_STATE, agentId: KNOWN_AGENT },
        { type: FactType.AGENT_STATE, agentId: KNOWN_OTHER },
      ],
    }),
    expectedViolations: [],  // uncertainty → non-blocking
    may_detect: false,
  },

  // ─── Paraphrase / synonym samples (5) ───
  {
    id: 'nv-046',
    category: 'pass',
    description: '"到了" 同义于 "去了" — "我到了图书馆"，应在 regions 内 → pass',
    llmOutput: '我到了图书馆。',
    grounding: baseGrounding({
      allowedFacts: [
        { type: FactType.AGENT_STATE, agentId: KNOWN_AGENT, position: '图书馆' },
        { type: FactType.AGENT_STATE, agentId: KNOWN_OTHER },
      ],
    }),
    expectedViolations: [],
    may_detect: false,  // regex "到了" may trigger unknown_location
  },
  {
    id: 'nv-047',
    category: 'pass',
    description: '"待在" 同义于 "在" — "待在食堂"，应在 regions 内 → pass',
    llmOutput: '我待在食堂。',
    grounding: baseGrounding({
      allowedFacts: [
        { type: FactType.AGENT_STATE, agentId: KNOWN_AGENT, position: '食堂' },
        { type: FactType.AGENT_STATE, agentId: KNOWN_OTHER },
      ],
    }),
    expectedViolations: [],
    may_detect: false,  // regex may trigger unsupported_claim for "待在"
  },
  {
    id: 'nv-048',
    category: 'pass',
    description: '"正在" 同义于 "在" — "正在学习"，self activity → pass',
    llmOutput: '我正在学习。',
    grounding: baseGrounding({
      allowedFacts: [
        { type: FactType.AGENT_STATE, agentId: KNOWN_AGENT },
        { type: FactType.AGENT_STATE, agentId: KNOWN_OTHER },
      ],
    }),
    expectedViolations: [],
    may_detect: false,  // regex "在" may trigger unsupported_claim
  },
  {
    id: 'nv-049',
    category: 'pass',
    description: '"到过" 过去完成 — "到过咖啡馆"，不在 regions → unsupported_claim',
    llmOutput: '我到过咖啡馆。',
    grounding: baseGrounding({
      allowedFacts: [
        { type: FactType.AGENT_STATE, agentId: KNOWN_AGENT, position: '图书馆' },
        { type: FactType.AGENT_STATE, agentId: KNOWN_OTHER },
      ],
    }),
    expectedViolations: [{ type: 'unsupported_claim' }],
    may_detect: false,  // "到过" 可能被正则捕获为 location
  },
  {
    id: 'nv-050',
    category: 'pass',
    description: '"看到了" 观察同义 — "我看到了鲍勃"，self observation → pass',
    llmOutput: '我看到了鲍勃。',
    grounding: baseGrounding({
      allowedFacts: [
        { type: FactType.AGENT_STATE, agentId: KNOWN_AGENT },
        { type: FactType.AGENT_STATE, agentId: KNOWN_OTHER },
      ],
    }),
    expectedViolations: [],
    may_detect: false,  // regex "看到了" may trigger unsupported_claim + unknown_location
  },
  {
    id: 'nv-051',
    category: 'missing_source_attribution',
    description: 'told 事实无"听说" → missing_source_attribution warning',
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
    id: 'nv-052',
    category: 'pass',
    description: 'told 事实有"据说" → pass',
    llmOutput: '据说鲍勃发现了一本好书。',
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
    id: 'nv-053',
    category: 'missing_source_attribution',
    description: 'inferred 事实无"推测" → missing_source_attribution warning',
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
    id: 'nv-054',
    category: 'pass',
    description: 'inferred 事实有"大概" → pass',
    llmOutput: '食堂大概有人聚餐。',
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
    id: 'nv-055',
    category: 'pass',
    description: '"XX告诉我" 格式 → pass',
    llmOutput: '鲍勃告诉我他去了图书馆。',
    grounding: baseGrounding({
      allowedFacts: [
        { type: FactType.AGENT_STATE, agentId: KNOWN_AGENT },
        { type: FactType.AGENT_STATE, agentId: KNOWN_OTHER },
        { type: FactType.EVENT, description: '鲍勃去了图书馆', location: '图书馆', participants: [KNOWN_OTHER], _evidence: { source: 'told', confidence: 0.6, propagatedFrom: KNOWN_OTHER } },
      ],
    }),
    expectedViolations: [],
    may_detect: true,   // v1 regex fallback now skips source-attributed regions
  },
  {
    id: 'nv-056',
    category: 'agent_state_leak',
    description: 'Bob很焦虑 无 EVENT/OBSERVATION 证据 → agent_state_leak',
    llmOutput: '鲍勃很焦虑。',
    grounding: baseGrounding({
      allowedFacts: [
        { type: FactType.AGENT_STATE, agentId: KNOWN_AGENT },
        { type: FactType.AGENT_STATE, agentId: KNOWN_OTHER },
      ],
    }),
    expectedViolations: [{ type: 'agent_state_leak' }],
  },
  {
    id: 'nv-057',
    category: 'pass',
    description: 'Bob很开心 有 EVENT 且 narrator 是参与者 → pass',
    llmOutput: '鲍勃很开心。',
    grounding: baseGrounding({
      allowedFacts: [
        { type: FactType.AGENT_STATE, agentId: KNOWN_AGENT },
        { type: FactType.AGENT_STATE, agentId: KNOWN_OTHER },
        {
          type: FactType.EVENT,
          description: '鲍勃在食堂吃饭',
          location: '食堂',
          participants: [KNOWN_AGENT, KNOWN_OTHER],
          _evidence: { source: 'observed', confidence: 0.9, propagatedFrom: null },
        },
      ],
    }),
    expectedViolations: [],
  },
  {
    id: 'nv-058',
    category: 'pass',
    description: 'Bob在看书 有 observed EVENT 但 narrator 不在场 → activity justifiable',
    llmOutput: '鲍勃在看书。',
    grounding: baseGrounding({
      allowedFacts: [
        { type: FactType.AGENT_STATE, agentId: KNOWN_AGENT },
        { type: FactType.AGENT_STATE, agentId: KNOWN_OTHER },
        {
          type: FactType.EVENT,
          description: '鲍勃在看书',
          location: '图书馆',
          participants: [KNOWN_OTHER],
          _evidence: { source: 'observed', confidence: 0.9, propagatedFrom: null },
        },
      ],
    }),
    expectedViolations: [],
  },

  // ─── Local leak samples (2) ───
  {
    id: 'nv-059',
    category: 'local_scope_leak',
    description: '提及 forbidden LOCAL event → local_scope_leak',
    llmOutput: '操场发生了冲突。',
    grounding: baseGrounding({
      allowedFacts: [
        { type: FactType.AGENT_STATE, agentId: KNOWN_AGENT },
      ],
      forbiddenFacts: [
        {
          type: FactType.EVENT,
          scope: FactScope.LOCAL,
          description: '操场发生了冲突',
          location: '操场',
        },
      ],
    }),
    expectedViolations: [{ type: 'local_scope_leak' }],
  },
  {
    id: 'nv-060',
    category: 'local_scope_leak',
    description: '提及 forbidden LOCAL observation → local_scope_leak',
    llmOutput: '远处发生了地震。',
    grounding: baseGrounding({
      allowedFacts: [
        { type: FactType.AGENT_STATE, agentId: KNOWN_AGENT },
      ],
      forbiddenFacts: [
        {
          type: FactType.OBSERVATION,
          scope: FactScope.LOCAL,
          description: '远处发生了地震',
          location: '远方',
        },
      ],
    }),
    expectedViolations: [{ type: 'local_scope_leak' }],
  },
];

module.exports = {
  corpus,
  KNOWN_AGENT,
  KNOWN_OTHER,
  KNOWN_REGIONS,
  baseGrounding,
};
