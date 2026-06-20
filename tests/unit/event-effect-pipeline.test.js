/**
 * EventEffectPipeline 测试
 */

import { describe, it, expect } from 'vitest';
import { applyActionEffect, computeStateDeltas } from '../../effects/EventEffectPipeline.js';

describe('EventEffectPipeline', () => {
  const mockAgentSnapshot = {
    id: 'agent_001',
    position: 'library',
    needs: { hunger: 0.5, energy: 0.3 },
    emotion: { valence: 0.2, arousal: 0.4 },
  };

  const mockCandidate = {
    id: 'cand_need_consume_hunger',
    type: 'consume',
    source: 'need',
    target: 'food',
    label: '满足 hunger',
  };

  const mockReasonTrace = {
    selectedAction: 'consume',
    scoreBreakdown: { total: 0.8, need: 0.7 },
    keyReasons: ['need-drive'],
    stateDeltas: null,
  };

  describe('applyActionEffect', () => {
    it('生成结构化 event', () => {
      const { event } = applyActionEffect({
        agentSnapshot: mockAgentSnapshot,
        selectedCandidate: mockCandidate,
        reasonTrace: mockReasonTrace,
        simTime: '2026-09-01T14:00:00Z',
      });

      expect(event.type).toBe('action_selected');
      expect(event.time).toBe('2026-09-01T14:00:00Z');
      expect(event.agentId).toBe('agent_001');
      expect(event.action.type).toBe('consume');
      expect(event.action.source).toBe('need');
    });

    it('simTime 支持 Date 对象', () => {
      const { event } = applyActionEffect({
        agentSnapshot: mockAgentSnapshot,
        selectedCandidate: mockCandidate,
        reasonTrace: mockReasonTrace,
        simTime: new Date('2026-09-01T14:00:00Z'),
      });

      expect(event.time).toBe('2026-09-01T14:00:00.000Z');
    });

    it('不使用 Date.now()', () => {
      // 如果 simTime 为 null，event.time 应该是 null 而非 Date.now()
      const { event } = applyActionEffect({
        agentSnapshot: mockAgentSnapshot,
        selectedCandidate: mockCandidate,
        reasonTrace: mockReasonTrace,
        simTime: null,
      });

      expect(event.time).toBeNull();
    });

    it('stateDeltas 写入 reasonTrace', () => {
      const { updatedReasonTrace } = applyActionEffect({
        agentSnapshot: mockAgentSnapshot,
        selectedCandidate: mockCandidate,
        reasonTrace: mockReasonTrace,
        simTime: '2026-09-01T14:00:00Z',
      });

      expect(updatedReasonTrace.stateDeltas).toBeDefined();
      expect(updatedReasonTrace.stateDeltas.need).toBeDefined();
    });

    it('不修改输入参数', () => {
      const originalCandidate = { ...mockCandidate };
      const originalTrace = { ...mockReasonTrace };

      applyActionEffect({
        agentSnapshot: mockAgentSnapshot,
        selectedCandidate: mockCandidate,
        reasonTrace: mockReasonTrace,
        simTime: '2026-09-01T14:00:00Z',
      });

      expect(mockCandidate).toEqual(originalCandidate);
      expect(mockReasonTrace).toEqual(originalTrace);
    });
  });

  describe('computeStateDeltas', () => {
    it('consume 在 Phase 35 中是 no-op delta', () => {
      const deltas = computeStateDeltas(mockCandidate, mockAgentSnapshot);
      expect(deltas.need).toEqual({});
      expect(deltas.emotion).toEqual({});
    });

    it('rest 产生 energy delta', () => {
      const restCandidate = { type: 'rest', source: 'need' };
      const deltas = computeStateDeltas(restCandidate, mockAgentSnapshot);
      expect(deltas.need.energy).toBe(0.4);
    });

    it('explore 在 Phase 35 中是 no-op delta', () => {
      const exploreCandidate = { type: 'explore', source: 'intrinsic' };
      const deltas = computeStateDeltas(exploreCandidate, mockAgentSnapshot);
      expect(deltas.need).toEqual({});
      expect(deltas.emotion).toEqual({});
    });

    it('有 target 时不会在 Phase 35 产生 location delta', () => {
      const deltas = computeStateDeltas(mockCandidate, mockAgentSnapshot);
      expect(deltas.location).toBeNull();
    });

    it('无 target 时 location delta 为 null', () => {
      const noTargetCandidate = { type: 'rest', source: 'need' };
      const deltas = computeStateDeltas(noTargetCandidate, mockAgentSnapshot);
      expect(deltas.location).toBeNull();
    });

    it('observe 产生 memory candidate delta', () => {
      const observeCandidate = { type: 'observe', source: 'behaviorField', target: 'object_1', label: 'observe object' };
      const deltas = computeStateDeltas(observeCandidate, mockAgentSnapshot);
      expect(deltas.memory).toEqual({
        kind: 'candidate',
        type: 'observation',
        target: 'object_1',
        content: 'observe object',
      });
    });

    it('reflect 产生 memory candidate 和微弱 emotion delta', () => {
      const reflectCandidate = { type: 'reflect', source: 'behaviorField', target: '', label: 'reflect' };
      const deltas = computeStateDeltas(reflectCandidate, mockAgentSnapshot);
      expect(deltas.memory.type).toBe('reflection');
      expect(deltas.emotion.calm).toBeGreaterThan(0);
    });
  });

  describe('defensive guard: null selectedCandidate', () => {
    it('selectedCandidate 为 null 时不崩', () => {
      const { event, stateDeltas, updatedReasonTrace } = applyActionEffect({
        agentSnapshot: mockAgentSnapshot,
        selectedCandidate: null,
        reasonTrace: mockReasonTrace,
        simTime: '2026-09-01T14:00:00Z',
      });

      expect(event.type).toBe('action_none');
      expect(event.action).toBeNull();
      expect(stateDeltas.need).toEqual({});
      expect(updatedReasonTrace.stateDeltas).toBeDefined();
    });

    it('selectedCandidate 为 undefined 时不崩', () => {
      const { event } = applyActionEffect({
        agentSnapshot: mockAgentSnapshot,
        selectedCandidate: undefined,
        reasonTrace: null,
        simTime: null,
      });

      expect(event.type).toBe('action_none');
      expect(event.time).toBeNull();
    });
  });
});
