/**
 * MemoryCandidateProvider 测试套件
 */

import { describe, it, expect } from 'vitest';
import { MemoryCandidateProvider, MAX_MEMORY_CANDIDATES } from '../../src/action/providers/MemoryCandidateProvider.js';
import { CandidateProviderManager } from '../../src/action/providers/CandidateProviderManager.js';
import campusDomain from '../../presets/campus/index.js';
import tavernDomain from '../../presets/tavern/index.js';
import { getDefaultDomain } from '../../src/domain/DomainRegistry.js';

function makeMemory(overrides = {}) {
  return {
    id: 'mem_test_0',
    content: 'test memory',
    category: 'general',
    emotionTag: 'neutral',
    importance: 0.8,
    timestamp: new Date(),
    lastAccessed: new Date(),
    presentations: [new Date()],
    accessCount: 1,
    associations: [],
    semanticCategory: 'study',
    ...overrides,
  };
}

function makeContext(overrides = {}) {
  return {
    memories: [],
    domain: getDefaultDomain(),
    ...overrides,
  };
}

describe('MemoryCandidateProvider', () => {
  it('无 memories 时返回空', () => {
    const provider = new MemoryCandidateProvider();
    expect(provider.generate(makeContext())).toEqual([]);
    expect(provider.generate(makeContext({ memories: null }))).toEqual([]);
  });

  it('空 memories 数组返回空', () => {
    const provider = new MemoryCandidateProvider();
    expect(provider.generate(makeContext({ memories: [] }))).toEqual([]);
  });

  it('高激活记忆生成候选', () => {
    const provider = new MemoryCandidateProvider();
    const ctx = makeContext({
      memories: [
        makeMemory({ semanticCategory: 'study', importance: 0.9 }),
      ],
    });
    const result = provider.generate(ctx);

    expect(result.length).toBe(1);
    expect(result[0].type).toBe('work');
    expect(result[0].source).toBe('memory');
    expect(result[0].target).toBe('study');
    expect(result[0].metadata.reasonTrace).toContain('memory-influence');
  });

  it('campus domain 使用 campus 语义分类', () => {
    const provider = new MemoryCandidateProvider();
    const ctx = makeContext({
      memories: [
        makeMemory({ semanticCategory: '在上课', importance: 0.8 }),
        makeMemory({ semanticCategory: '在食堂', importance: 0.7 }),
      ],
      domain: campusDomain,
    });
    const result = provider.generate(ctx);

    expect(result.length).toBe(2);
    expect(result[0].type).toBe('work');
    expect(result[1].type).toBe('consume');
  });

  it('tavern domain 使用 tavern 语义分类，无 campus 词汇', () => {
    const provider = new MemoryCandidateProvider();
    const ctx = makeContext({
      memories: [
        makeMemory({ semanticCategory: '社交', importance: 0.8 }),
        makeMemory({ semanticCategory: '工作', importance: 0.7 }),
      ],
      domain: tavernDomain,
    });
    const result = provider.generate(ctx);

    expect(result.length).toBe(2);
    expect(result[0].type).toBe('socialize');
    expect(result[1].type).toBe('work');
    for (const cand of result) {
      expect(cand.metadata.reasonTrace).not.toContain('campus');
    }
  });

  it('最多生成 2 个候选', () => {
    const provider = new MemoryCandidateProvider();
    const ctx = makeContext({
      memories: [
        makeMemory({ id: 'm1', semanticCategory: 'study', importance: 0.9 }),
        makeMemory({ id: 'm2', semanticCategory: 'social', importance: 0.8 }),
        makeMemory({ id: 'm3', semanticCategory: 'eat', importance: 0.7 }),
        makeMemory({ id: 'm4', semanticCategory: 'rest', importance: 0.6 }),
      ],
    });
    const result = provider.generate(ctx);

    expect(result.length).toBe(MAX_MEMORY_CANDIDATES);
    expect(MAX_MEMORY_CANDIDATES).toBe(2);
  });

  it('无语义分类的记忆被跳过', () => {
    const provider = new MemoryCandidateProvider();
    const ctx = makeContext({
      memories: [
        makeMemory({ semanticCategory: null, importance: 0.9 }),
        makeMemory({ semanticCategory: 'study', importance: 0.8 }),
      ],
    });
    const result = provider.generate(ctx);

    expect(result.length).toBe(1);
    expect(result[0].type).toBe('work');
  });

  it('未知语义分类被跳过', () => {
    const provider = new MemoryCandidateProvider();
    const ctx = makeContext({
      memories: [
        makeMemory({ semanticCategory: '未知分类', importance: 0.9 }),
      ],
    });
    const result = provider.generate(ctx);

    expect(result.length).toBe(0);
  });

  it('priority 基于 importance', () => {
    const provider = new MemoryCandidateProvider();
    const ctx = makeContext({
      memories: [
        makeMemory({ semanticCategory: 'study', importance: 0.5 }),
      ],
    });
    const result = provider.generate(ctx);

    expect(result.length).toBe(1);
    expect(result[0].priority).toBeCloseTo(0.4, 5);
  });

  it('priority 上限为 1.0', () => {
    const provider = new MemoryCandidateProvider();
    const ctx = makeContext({
      memories: [
        makeMemory({ semanticCategory: 'study', importance: 1.0 }),
      ],
    });
    const result = provider.generate(ctx);

    expect(result.length).toBe(1);
    expect(result[0].priority).toBeLessThanOrEqual(1.0);
  });

  it('输出纯 JSON 可序列化', () => {
    const provider = new MemoryCandidateProvider();
    const ctx = makeContext({
      memories: [
        makeMemory({ semanticCategory: 'study', importance: 0.8 }),
      ],
    });
    const result = provider.generate(ctx);
    const json = JSON.stringify(result);
    const parsed = JSON.parse(json);

    expect(parsed.length).toBe(result.length);
    expect(parsed[0].type).toBe('work');
    expect(parsed[0].source).toBe('memory');
  });

  it('不修改 context（只读）', () => {
    const provider = new MemoryCandidateProvider();
    const memories = [
      makeMemory({ semanticCategory: 'study', importance: 0.8 }),
    ];
    const ctx = makeContext({ memories });
    const ctxCopy = JSON.parse(JSON.stringify(ctx));

    provider.generate(ctx);

    expect(ctx.memories.length).toBe(ctxCopy.memories.length);
    expect(ctx.memories[0].id).toBe(ctxCopy.memories[0].id);
    expect(ctx.memories[0].importance).toBe(ctxCopy.memories[0].importance);
  });

  it('CandidateProviderManager 包含 MemoryCandidateProvider', () => {
    const manager = new CandidateProviderManager();
    const memoryProvider = manager.providers.find(p => p.name === 'MemoryCandidateProvider');

    expect(memoryProvider).toBeDefined();
    expect(memoryProvider.name).toBe('MemoryCandidateProvider');
  });

  it('所有动作类型都在 ACTION_TYPES 中', () => {
    const provider = new MemoryCandidateProvider();
    const ctx = makeContext({
      memories: [
        makeMemory({ id: 'm1', semanticCategory: 'study', importance: 0.9 }),
        makeMemory({ id: 'm2', semanticCategory: 'social', importance: 0.8 }),
        makeMemory({ id: 'm3', semanticCategory: 'eat', importance: 0.7 }),
        makeMemory({ id: 'm4', semanticCategory: 'rest', importance: 0.6 }),
        makeMemory({ id: 'm5', semanticCategory: 'explore', importance: 0.5 }),
      ],
    });
    const result = provider.generate(ctx);

    const validTypes = ['continue', 'move', 'rest', 'work', 'socialize', 'explore', 'consume', 'observe', 'reflect'];
    for (const cand of result) {
      expect(validTypes).toContain(cand.type);
    }
  });
});
