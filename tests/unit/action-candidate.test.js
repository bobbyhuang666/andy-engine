/**
 * ActionCandidate 测试套件
 */

import { describe, it, expect } from 'vitest';
import {
  ACTION_TYPES,
  CANDIDATE_SOURCES,
  makeCandidateId,
  ActionCandidate,
} from '../../src/action/ActionCandidate.js';

function createCandidate(opts) {
  return new ActionCandidate(opts).toJSON();
}

describe('ActionCandidate', () => {
  describe('makeCandidateId', () => {
    it('相同参数产生相同 ID', () => {
      const id1 = makeCandidateId('need', 'consume', 'hunger');
      const id2 = makeCandidateId('need', 'consume', 'hunger');
      expect(id1).toBe(id2);
    });

    it('不同参数产生不同 ID', () => {
      const id1 = makeCandidateId('need', 'consume', 'hunger');
      const id2 = makeCandidateId('need', 'consume', 'social');
      expect(id1).not.toBe(id2);
    });

    it('ID 格式为 cand_source_type_target', () => {
      const id = makeCandidateId('schedule', 'work', 'office');
      expect(id).toBe('cand_schedule_work_office');
    });

    it('无 target 时也能工作', () => {
      const id = makeCandidateId('behaviorField', 'continue');
      expect(id).toBe('cand_behaviorField_continue_');
    });

    it('不使用 Date.now() 或 Math.random()', () => {
      // 连续调用应产生相同结果
      const id1 = makeCandidateId('test', 'rest');
      const id2 = makeCandidateId('test', 'rest');
      expect(id1).toBe(id2);
    });
  });

  describe('createCandidate', () => {
    it('创建有效候选', () => {
      const cand = createCandidate({
        type: 'rest',
        source: 'behaviorField',
        target: 'dorm',
        label: '回宿舍休息',
      });

      expect(cand.type).toBe('rest');
      expect(cand.source).toBe('behaviorField');
      expect(cand.target).toBe('dorm');
      expect(cand.label).toBe('回宿舍休息');
      expect(cand.id).toBeDefined();
    });

    it('无效 type 抛出错误', () => {
      expect(() => createCandidate({ type: 'fly', source: 'need' })).toThrow('Invalid action type');
    });

    it('无效 source 抛出错误', () => {
      expect(() => createCandidate({ type: 'rest', source: 'magic' })).toThrow('Invalid candidate source');
    });

    it('无 label 时自动生成', () => {
      const cand = createCandidate({ type: 'explore', source: 'intrinsic', target: 'forest' });
      expect(cand.label).toContain('explore');
      expect(cand.label).toContain('forest');
    });

    it('返回纯 JSON 对象', () => {
      const cand = createCandidate({ type: 'rest', source: 'need' });
      const json = JSON.stringify(cand);
      const parsed = JSON.parse(json);
      expect(parsed.type).toBe('rest');
    });

    it('修改输入 metadata 不影响 candidate', () => {
      const meta = { key: 'value', nested: { a: 1 } };
      const cons = { timeRange: [9, 18] };
      const cand = createCandidate({ type: 'rest', source: 'need', metadata: meta, constraints: cons });
      meta.key = 'changed';
      meta.nested.a = 999;
      cons.timeRange = [0, 0];
      expect(cand.metadata.key).toBe('value');
      expect(cand.metadata.nested.a).toBe(1);
      expect(cand.constraints.timeRange).toEqual([9, 18]);
    });
  });

  describe('常量', () => {
    it('ACTION_TYPES 包含所有允许的类型', () => {
      expect(ACTION_TYPES).toContain('continue');
      expect(ACTION_TYPES).toContain('move');
      expect(ACTION_TYPES).toContain('rest');
      expect(ACTION_TYPES).toContain('work');
      expect(ACTION_TYPES).toContain('socialize');
      expect(ACTION_TYPES).toContain('explore');
      expect(ACTION_TYPES).toContain('consume');
      expect(ACTION_TYPES).toContain('observe');
      expect(ACTION_TYPES).toContain('reflect');
    });

    it('CANDIDATE_SOURCES 包含所有允许的来源', () => {
      expect(CANDIDATE_SOURCES).toContain('behaviorField');
      expect(CANDIDATE_SOURCES).toContain('need');
      expect(CANDIDATE_SOURCES).toContain('schedule');
      expect(CANDIDATE_SOURCES).toContain('memory');
      expect(CANDIDATE_SOURCES).toContain('relationship');
      expect(CANDIDATE_SOURCES).toContain('habit');
      expect(CANDIDATE_SOURCES).toContain('goal');
      expect(CANDIDATE_SOURCES).toContain('worldPressure');
      expect(CANDIDATE_SOURCES).toContain('object');
      expect(CANDIDATE_SOURCES).toContain('intrinsic');
    });
  });
});
