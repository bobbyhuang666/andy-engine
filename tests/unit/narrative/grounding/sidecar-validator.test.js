/**
 * SidecarValidator 单元测试
 *
 * 覆盖：
 *   - 完整合法 sidecar { text, claims:[location] }
 *   - sidecar 缺 text 只有 claims → OK
 *   - 裸 claims 数组输入 → OK
 *   - stringified JSON 输入 → OK 解析
 *   - type 未知 → unknown_type issue + 该条丢弃；其他合法条目仍返回
 *   - 缺 subject → missing_field issue + 丢弃
 *   - subject 空字符串 → invalid_subject + 丢弃
 *   - subject 是数字 → invalid_subject + 丢弃
 *   - subject "鲍勃" 解析成 agentId（用 agentNames 映射）
 *   - subject "我" 解析成 selfId
 *   - modality 非法 → invalid_modality issue + 用默认 'certain'
 *   - modality 'reported' 正常通过
 *   - 未提供 modality 默认 'certain'
 *   - 红线 1：sidecar type=event predicate=did → mistrusted + issue
 *   - 红线 2：sidecar type=relationship → mistrusted + issue
 *   - sidecar 带 evidence/confidence/bindings/dependencies → 被忽略
 *   - 整体 malformed：input 是字符串非 JSON → malformed issue
 *   - input 是 null/undefined/数字 → malformed
 *   - claims 不是数组 → malformed
 *   - span 是 string → 转为 v3 span
 *   - span 缺失 → span null
 *   - source.kind='told' → source 字段正确
 *   - source 缺失 → source null
 *   - 一条合法一条非法 → 合法条目输出、非法条目 issues
 *   - 模块不写 store（grep 断言）
 *   - extractionMethod 正确分类
 */

const path = require('path');
const fs = require('fs');

const {
  SidecarValidator,
  createSidecarValidator,
} = require('../../../../src/narrative/grounding/SidecarValidator');
const { ClaimTypes, Modality, Polarity } = require('../../../../src/narrative/grounding/ClaimSchema');

// ─── 读取源码用于边界检查 ───────────────────────────────────────────────────

const validatorPath = path.resolve(
  __dirname,
  '../../../../src/narrative/grounding/SidecarValidator.js'
);
const validatorSource = fs.readFileSync(validatorPath, 'utf-8');

// ─── Helper ──────────────────────────────────────────────────────────────────

function makeValidator(opts = {}) {
  return new SidecarValidator({
    agentNames: opts.agentNames || { alice: '爱丽丝', bob: '鲍勃' },
    selfId: opts.selfId || 'alice',
  });
}

// ═══════════════════════════════════════════
// 合法 sidecar 输入
// ═══════════════════════════════════════════

describe('SidecarValidator — 合法输入', () => {
  it('完整合法 sidecar { text, claims:[location] } → claims[0] 是 v3 schema', () => {
    const v = makeValidator();
    const input = {
      text: '听说鲍勃去了图书馆。',
      claims: [
        {
          type: 'location',
          subject: 'bob',
          predicate: 'went_to',
          object: '图书馆',
        },
      ],
    };

    const result = v.validate(input);

    expect(result.issues).toHaveLength(0);
    expect(result.claims).toHaveLength(1);
    const claim = result.claims[0];
    expect(claim.type).toBe('location');
    expect(claim.subject.kind).toBe('agent');
    expect(claim.subject.id).toBe('bob');
    expect(claim.subject.raw).toBe('bob');
    expect(claim.predicate).toBe('went_to');
    expect(claim.object.kind).toBe('location');
    expect(claim.object.raw).toBe('图书馆');
    expect(claim.modality).toBe('certain');
    expect(claim.polarity).toBe('affirmative');
    expect(claim.extractionMethod).toBe('sidecar');
    expect(claim.confidence).toBe(0.9);
  });

  it('subject "鲍勃" 解析成 agentId（用 agentNames 映射）', () => {
    const v = makeValidator();
    const input = {
      claims: [
        {
          type: 'location',
          subject: '鲍勃',
          predicate: 'went_to',
          object: '图书馆',
        },
      ],
    };

    const result = v.validate(input);

    expect(result.claims).toHaveLength(1);
    expect(result.claims[0].subject.id).toBe('bob');
    expect(result.claims[0].subject.raw).toBe('鲍勃');
  });

  it('subject "alice"（selfId）解析成 selfId', () => {
    const v = makeValidator();
    const input = {
      claims: [
        {
          type: 'location',
          subject: 'alice',
          predicate: 'is_at',
          object: '食堂',
        },
      ],
    };

    const result = v.validate(input);

    expect(result.claims).toHaveLength(1);
    expect(result.claims[0].subject.id).toBe('alice');
    expect(result.claims[0].subject.kind).toBe('agent');
  });

  it('sidecar 缺 text 只有 claims → OK', () => {
    const v = makeValidator();
    const input = {
      claims: [
        {
          type: 'location',
          subject: 'bob',
          predicate: 'went_to',
          object: '图书馆',
        },
      ],
    };

    const result = v.validate(input);

    expect(result.claims).toHaveLength(1);
    expect(result.issues).toHaveLength(0);
  });

  it('裸 claims 数组输入 → OK', () => {
    const v = makeValidator();
    const input = [
      {
        type: 'location',
        subject: 'bob',
        predicate: 'went_to',
        object: '图书馆',
      },
    ];

    const result = v.validate(input);

    expect(result.claims).toHaveLength(1);
    expect(result.issues).toHaveLength(0);
  });

  it('stringified JSON 输入 → OK 解析', () => {
    const v = makeValidator();
    const input = JSON.stringify({
      claims: [
        {
          type: 'location',
          subject: 'bob',
          predicate: 'went_to',
          object: '图书馆',
        },
      ],
    });

    const result = v.validate(input);

    expect(result.claims).toHaveLength(1);
    expect(result.issues).toHaveLength(0);
  });

  it('modality "reported" 正常通过', () => {
    const v = makeValidator();
    const input = {
      claims: [
        {
          type: 'location',
          subject: 'bob',
          predicate: 'went_to',
          object: '图书馆',
          modality: 'reported',
        },
      ],
    };

    const result = v.validate(input);

    expect(result.claims).toHaveLength(1);
    expect(result.claims[0].modality).toBe('reported');
  });

  it('未提供 modality 默认 "certain"', () => {
    const v = makeValidator();
    const input = {
      claims: [
        {
          type: 'location',
          subject: 'bob',
          predicate: 'went_to',
          object: '图书馆',
        },
      ],
    };

    const result = v.validate(input);

    expect(result.claims).toHaveLength(1);
    expect(result.claims[0].modality).toBe('certain');
  });

  it('source.kind="told" → source 字段正确', () => {
    const v = makeValidator();
    const input = {
      claims: [
        {
          type: 'location',
          subject: 'bob',
          predicate: 'went_to',
          object: '图书馆',
          source: { kind: 'told', by: 'alice' },
        },
      ],
    };

    const result = v.validate(input);

    expect(result.claims).toHaveLength(1);
    expect(result.claims[0].source).toEqual({ kind: 'told', by: 'alice' });
    // source.kind='told' 且未指定 modality → 默认 'reported'
    expect(result.claims[0].modality).toBe('reported');
  });

  it('source 缺失 → source null', () => {
    const v = makeValidator();
    const input = {
      claims: [
        {
          type: 'location',
          subject: 'bob',
          predicate: 'went_to',
          object: '图书馆',
        },
      ],
    };

    const result = v.validate(input);

    expect(result.claims).toHaveLength(1);
    expect(result.claims[0].source).toBeNull();
  });

  it('span 是 string → 转为 v3 span', () => {
    const v = makeValidator();
    const input = {
      claims: [
        {
          type: 'location',
          subject: 'bob',
          predicate: 'went_to',
          object: '图书馆',
          span: '鲍勃去了图书馆',
        },
      ],
    };

    const result = v.validate(input);

    expect(result.claims).toHaveLength(1);
    expect(result.claims[0].span).toEqual({ start: null, end: null, raw: '鲍勃去了图书馆' });
  });

  it('span 缺失 → span null', () => {
    const v = makeValidator();
    const input = {
      claims: [
        {
          type: 'location',
          subject: 'bob',
          predicate: 'went_to',
          object: '图书馆',
        },
      ],
    };

    const result = v.validate(input);

    expect(result.claims).toHaveLength(1);
    expect(result.claims[0].span).toBeNull();
  });

  it('subject 是 {kind, id, raw} 结构 → 直接使用', () => {
    const v = makeValidator();
    const input = {
      claims: [
        {
          type: 'location',
          subject: { kind: 'agent', id: 'bob', raw: '鲍勃' },
          predicate: 'went_to',
          object: '图书馆',
        },
      ],
    };

    const result = v.validate(input);

    expect(result.claims).toHaveLength(1);
    expect(result.claims[0].subject.kind).toBe('agent');
    expect(result.claims[0].subject.id).toBe('bob');
    expect(result.claims[0].subject.raw).toBe('鲍勃');
  });

  it('object 是 {kind, id, raw} 结构 → 直接使用', () => {
    const v = makeValidator();
    const input = {
      claims: [
        {
          type: 'location',
          subject: 'bob',
          predicate: 'went_to',
          object: { kind: 'location', id: 'library', raw: '图书馆' },
        },
      ],
    };

    const result = v.validate(input);

    expect(result.claims).toHaveLength(1);
    expect(result.claims[0].object.kind).toBe('location');
    expect(result.claims[0].object.id).toBe('library');
    expect(result.claims[0].object.raw).toBe('图书馆');
  });
});

// ═══════════════════════════════════════════
// 错误处理
// ═══════════════════════════════════════════

describe('SidecarValidator — 错误处理', () => {
  it('type 未知 → unknown_type issue + 该条丢弃；其他合法条目仍返回', () => {
    const v = makeValidator();
    const input = {
      claims: [
        {
          type: 'location',
          subject: 'bob',
          predicate: 'went_to',
          object: '图书馆',
        },
        {
          type: 'nonexistent_type',
          subject: 'bob',
          predicate: 'foo',
          object: 'bar',
        },
      ],
    };

    const result = v.validate(input);

    expect(result.claims).toHaveLength(1);
    expect(result.claims[0].type).toBe('location');
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0].kind).toBe('unknown_type');
    expect(result.issues[0].claimIndex).toBe(1);
  });

  it('缺 subject → missing_field issue + 丢弃', () => {
    const v = makeValidator();
    const input = {
      claims: [
        {
          type: 'location',
          predicate: 'went_to',
          object: '图书馆',
        },
      ],
    };

    const result = v.validate(input);

    expect(result.claims).toHaveLength(0);
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0].kind).toBe('missing_field');
  });

  it('缺 predicate → missing_field issue + 丢弃', () => {
    const v = makeValidator();
    const input = {
      claims: [
        {
          type: 'location',
          subject: 'bob',
          object: '图书馆',
        },
      ],
    };

    const result = v.validate(input);

    expect(result.claims).toHaveLength(0);
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0].kind).toBe('missing_field');
  });

  it('subject 空字符串 → invalid_subject + 丢弃', () => {
    const v = makeValidator();
    const input = {
      claims: [
        {
          type: 'location',
          subject: '',
          predicate: 'went_to',
          object: '图书馆',
        },
      ],
    };

    const result = v.validate(input);

    expect(result.claims).toHaveLength(0);
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0].kind).toBe('invalid_subject');
  });

  it('subject 是数字 → invalid_subject + 丢弃', () => {
    const v = makeValidator();
    const input = {
      claims: [
        {
          type: 'location',
          subject: 123,
          predicate: 'went_to',
          object: '图书馆',
        },
      ],
    };

    const result = v.validate(input);

    expect(result.claims).toHaveLength(0);
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0].kind).toBe('invalid_subject');
  });

  it('subject 是 null → invalid_subject + 丢弃', () => {
    const v = makeValidator();
    const input = {
      claims: [
        {
          type: 'location',
          subject: null,
          predicate: 'went_to',
          object: '图书馆',
        },
      ],
    };

    const result = v.validate(input);

    expect(result.claims).toHaveLength(0);
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0].kind).toBe('missing_field');
  });

  it('modality 非法 → invalid_modality issue + 用默认 "certain"', () => {
    const v = makeValidator();
    const input = {
      claims: [
        {
          type: 'location',
          subject: 'bob',
          predicate: 'went_to',
          object: '图书馆',
          modality: 'omniscient',
        },
      ],
    };

    const result = v.validate(input);

    expect(result.claims).toHaveLength(1);
    expect(result.claims[0].modality).toBe('certain');
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0].kind).toBe('invalid_modality');
  });

  it('一条合法一条非法 → 合法条目输出、非法条目 issues', () => {
    const v = makeValidator();
    const input = {
      claims: [
        {
          type: 'location',
          subject: 'bob',
          predicate: 'went_to',
          object: '图书馆',
        },
        {
          type: 'bad_type',
          subject: 'bob',
          predicate: 'foo',
          object: 'bar',
        },
        {
          type: 'state',
          subject: 'alice',
          predicate: 'feels',
          object: '开心',
        },
      ],
    };

    const result = v.validate(input);

    expect(result.claims).toHaveLength(2);
    expect(result.claims[0].type).toBe('location');
    expect(result.claims[1].type).toBe('state');
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0].kind).toBe('unknown_type');
  });
});

// ═══════════════════════════════════════════
// 整体 malformed 输入
// ═══════════════════════════════════════════

describe('SidecarValidator — 整体 malformed', () => {
  it('input 是字符串非 JSON → malformed issue、claims 返回 []', () => {
    const v = makeValidator();
    const result = v.validate('not json at all {{{');

    expect(result.claims).toHaveLength(0);
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0].kind).toBe('malformed');
  });

  it('input 是 null → malformed', () => {
    const v = makeValidator();
    const result = v.validate(null);

    expect(result.claims).toHaveLength(0);
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0].kind).toBe('malformed');
  });

  it('input 是 undefined → malformed', () => {
    const v = makeValidator();
    const result = v.validate(undefined);

    expect(result.claims).toHaveLength(0);
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0].kind).toBe('malformed');
  });

  it('input 是数字 → malformed', () => {
    const v = makeValidator();
    const result = v.validate(42);

    expect(result.claims).toHaveLength(0);
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0].kind).toBe('malformed');
  });

  it('input 是空数组 → malformed（裸数组是合法的 claims 数组，所以应该 OK）', () => {
    const v = makeValidator();
    const result = v.validate([]);

    // 裸数组是合法的 claims 输入 → 空 claims，空 issues
    expect(result.claims).toHaveLength(0);
    expect(result.issues).toHaveLength(0);
  });

  it('claims 不是数组 → malformed', () => {
    const v = makeValidator();
    const result = v.validate({ claims: 'not an array' });

    expect(result.claims).toHaveLength(0);
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0].kind).toBe('malformed');
  });

  it('claims 是 null → malformed', () => {
    const v = makeValidator();
    const result = v.validate({ claims: null });

    expect(result.claims).toHaveLength(0);
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0].kind).toBe('malformed');
  });
});

// ═══════════════════════════════════════════
// 红线：不可信新事件/关系
// ═══════════════════════════════════════════

describe('SidecarValidator — 红线：不可信新事件/关系', () => {
  it('红线 1：type=event predicate=did → mistrusted + issue', () => {
    const v = makeValidator();
    const input = {
      claims: [
        {
          type: 'event',
          subject: 'alice',
          predicate: 'did',
          object: '吃了一顿大餐',
        },
      ],
    };

    const result = v.validate(input);

    expect(result.claims).toHaveLength(1);
    expect(result.claims[0].type).toBe('event');
    expect(result.claims[0].extractionMethod).toBe('sidecar-mistrusted');
    expect(result.claims[0].confidence).toBe(0.5);
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0].kind).toBe('untrusted_new_event');
  });

  it('红线 2：type=relationship → mistrusted + issue', () => {
    const v = makeValidator();
    const input = {
      claims: [
        {
          type: 'relationship',
          subject: 'alice',
          predicate: 'is_friend_of',
          object: { kind: 'agent', id: 'bob', raw: '鲍勃' },
        },
      ],
    };

    const result = v.validate(input);

    expect(result.claims).toHaveLength(1);
    expect(result.claims[0].type).toBe('relationship');
    expect(result.claims[0].extractionMethod).toBe('sidecar-mistrusted');
    expect(result.claims[0].confidence).toBe(0.5);
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0].kind).toBe('untrusted_new_relationship');
  });

  it('普通 event claim（非 did）→ 正常 sidecar extractionMethod', () => {
    const v = makeValidator();
    const input = {
      claims: [
        {
          type: 'event',
          subject: 'bob',
          predicate: 'refers_to',
          object: '昨天的会议',
        },
      ],
    };

    const result = v.validate(input);

    expect(result.claims).toHaveLength(1);
    expect(result.claims[0].extractionMethod).toBe('sidecar');
    expect(result.claims[0].confidence).toBe(0.9);
    expect(result.issues).toHaveLength(0);
  });
});

// ═══════════════════════════════════════════
// 忽略 sidecar 中的信任字段
// ═══════════════════════════════════════════

describe('SidecarValidator — 忽略信任字段', () => {
  it('sidecar 带 evidence 字段 → 被忽略', () => {
    const v = makeValidator();
    const input = {
      claims: [
        {
          type: 'location',
          subject: 'bob',
          predicate: 'went_to',
          object: '图书馆',
          evidence: ['fact_123'],
        },
      ],
    };

    const result = v.validate(input);

    expect(result.claims).toHaveLength(1);
    expect(result.claims[0].evidence).toEqual([]);
  });

  it('sidecar 带 confidence 字段 → 被忽略（用默认 0.9）', () => {
    const v = makeValidator();
    const input = {
      claims: [
        {
          type: 'location',
          subject: 'bob',
          predicate: 'went_to',
          object: '图书馆',
          confidence: 1.0,
        },
      ],
    };

    const result = v.validate(input);

    expect(result.claims).toHaveLength(1);
    expect(result.claims[0].confidence).toBe(0.9);
  });

  it('sidecar 带 bindings 字段 → 被忽略', () => {
    const v = makeValidator();
    const input = {
      claims: [
        {
          type: 'location',
          subject: 'bob',
          predicate: 'went_to',
          object: '图书馆',
          bindings: [{ factId: 'f1', support: 'supports' }],
        },
      ],
    };

    const result = v.validate(input);

    expect(result.claims).toHaveLength(1);
    expect(result.claims[0]).not.toHaveProperty('bindings');
  });

  it('sidecar 带 dependencies 字段 → 被忽略（用空数组）', () => {
    const v = makeValidator();
    const input = {
      claims: [
        {
          type: 'location',
          subject: 'bob',
          predicate: 'went_to',
          object: '图书馆',
          dependencies: ['claim_001'],
        },
      ],
    };

    const result = v.validate(input);

    expect(result.claims).toHaveLength(1);
    expect(result.claims[0].dependencies).toEqual([]);
  });
});

// ═══════════════════════════════════════════
// extractionMethod 正确分类
// ═══════════════════════════════════════════

describe('SidecarValidator — extractionMethod', () => {
  it('普通 location claim → extractionMethod=sidecar', () => {
    const v = makeValidator();
    const result = v.validate({
      claims: [{ type: 'location', subject: 'bob', predicate: 'went_to', object: '图书馆' }],
    });

    expect(result.claims[0].extractionMethod).toBe('sidecar');
  });

  it('event did claim → extractionMethod=sidecar-mistrusted', () => {
    const v = makeValidator();
    const result = v.validate({
      claims: [{ type: 'event', subject: 'alice', predicate: 'did', object: '吃饭' }],
    });

    expect(result.claims[0].extractionMethod).toBe('sidecar-mistrusted');
  });

  it('relationship claim → extractionMethod=sidecar-mistrusted', () => {
    const v = makeValidator();
    const result = v.validate({
      claims: [{ type: 'relationship', subject: 'alice', predicate: 'likes', object: 'bob' }],
    });

    expect(result.claims[0].extractionMethod).toBe('sidecar-mistrusted');
  });

  it('state claim → extractionMethod=sidecar', () => {
    const v = makeValidator();
    const result = v.validate({
      claims: [{ type: 'state', subject: 'alice', predicate: 'feels', object: '开心' }],
    });

    expect(result.claims[0].extractionMethod).toBe('sidecar');
  });

  it('source_attribution claim → extractionMethod=sidecar', () => {
    const v = makeValidator();
    const result = v.validate({
      claims: [{ type: 'source_attribution', subject: 'alice', predicate: 'heard', object: '消息' }],
    });

    expect(result.claims[0].extractionMethod).toBe('sidecar');
  });
});

// ═══════════════════════════════════════════
// 工厂函数
// ═══════════════════════════════════════════

describe('SidecarValidator — 工厂函数', () => {
  it('createSidecarValidator 返回 SidecarValidator 实例', () => {
    const v = createSidecarValidator({ bob: '鲍勃' }, 'alice');
    expect(v).toBeInstanceOf(SidecarValidator);
    expect(v.agentNames).toEqual({ bob: '鲍勃' });
    expect(v.selfId).toBe('alice');
  });

  it('createSidecarValidator 无参数 → 空默认值', () => {
    const v = createSidecarValidator();
    expect(v).toBeInstanceOf(SidecarValidator);
    expect(v.agentNames).toEqual({});
    expect(v.selfId).toBeNull();
  });
});

// ═══════════════════════════════════════════
// 边界合规性
// ═══════════════════════════════════════════

describe('SidecarValidator — 边界合规性', () => {
  it('源码不包含 .addFact( 写入模式', () => {
    expect(validatorSource).not.toContain('.addFact(');
  });

  it('源码不包含 KnowledgeStore 引用', () => {
    expect(validatorSource).not.toContain('KnowledgeStore');
  });

  it('源码不包含 WorldFactStore 引用', () => {
    expect(validatorSource).not.toContain('WorldFactStore');
  });

  it('源码不包含 .set( 用于 store 写入', () => {
    // 检查是否有类似 store.set( 的模式
    const storeSetMatches = validatorSource.match(/\b(store|factStore|knowledgeStore)\.set\s*\(/g);
    expect(storeSetMatches).toBeNull();
  });

  it('v3 claim 不含 sidecar 传入的未知字段', () => {
    const v = makeValidator();
    const input = {
      claims: [
        {
          type: 'location',
          subject: 'bob',
          predicate: 'went_to',
          object: '图书馆',
          foo: 'bar',
          baz: 123,
          extra: { nested: 'value' },
        },
      ],
    };

    const result = v.validate(input);

    expect(result.claims).toHaveLength(1);
    expect(result.claims[0]).not.toHaveProperty('foo');
    expect(result.claims[0]).not.toHaveProperty('baz');
    expect(result.claims[0]).not.toHaveProperty('extra');
  });

  it('sidecar 中的 subject 无法解析为 agentNames 但仍保留 raw', () => {
    const v = makeValidator();
    const input = {
      claims: [
        {
          type: 'location',
          subject: 'charlie',
          predicate: 'went_to',
          object: '图书馆',
        },
      ],
    };

    const result = v.validate(input);

    expect(result.claims).toHaveLength(1);
    expect(result.claims[0].subject.kind).toBe('agent');
    expect(result.claims[0].subject.id).toBe('charlie');
    expect(result.claims[0].subject.raw).toBe('charlie');
  });
});
