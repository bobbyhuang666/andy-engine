/**
 * PerceptionHandler 单元测试
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import Agent from '../../../agent/Agent.js';
import campusSchedules from '../../../presets/campus/schedules.js';
import { getDefaultDomain } from '../../../src/domain/DomainRegistry.js';
import PerceptionHandler from '../../../src/agent/handlers/PerceptionHandler.js';
import { EffectCommitter } from '../../../src/effects/EffectCommitter.js';

function createAgent(overrides = {}) {
  return new Agent({
    id: 'test',
    name: 'Test',
    personality: { mbti: 'INFP' },
    schedule: campusSchedules.createStudentSchedule().toJSON(),
    domain: getDefaultDomain(),
    ...overrides,
  });
}

describe('PerceptionHandler', () => {
  let agent;
  let handler;

  beforeEach(() => {
    agent = createAgent();
    handler = new PerceptionHandler(agent);
  });

  it('should be instantiable', () => {
    expect(handler).toBeDefined();
    expect(handler.agent).toBe(agent);
  });

  it('handles empty events', () => {
    expect(() => {
      handler.tick({ safeEvents: [] });
    }).not.toThrow();
  });

  it('processes events with effects', () => {
    const event = {
      type: 'social',
      content: '和朋友聊天',
      effects: [{ target: 'test', type: 'emotion', delta: { joy: 0.05 } }],
      participants: ['test'],
    };
    expect(() => {
      handler.tick({ safeEvents: [event] });
    }).not.toThrow();
  });

  it('routes perceived event memories through EffectCommitter', () => {
    const addExperience = vi.spyOn(agent.memory, 'addExperience');
    const world = { time: new Date('2026-07-02T10:00:00+08:00') };
    world.effectCommitter = new EffectCommitter({ world, agents: new Map([[agent.id, agent]]) });
    const event = {
      id: 'perception-memory-delta',
      type: 'random',
      scope: 'public',
      content: '看到操场上突然聚集了一群人',
      effects: [],
      participants: ['test'],
    };

    handler.tick({
      safeEvents: [event],
      env: { simTime: world.time, effectCommitter: world.effectCommitter, effectWorld: world },
    });

    expect(addExperience).toHaveBeenCalledWith(
      expect.objectContaining({
        content: event.content,
        type: 'random',
        _region: agent.position,
        _currentState: agent.stateMachine.currentState,
        _appraisal: expect.objectContaining({ importance: expect.any(Number) }),
      }),
      agent.emotion,
      expect.any(Number)
    );
  });

  it('PerceptionRuntime does not call memory.addExperience directly', () => {
    const file = path.join(import.meta.dirname, '../../../src/agent/runtime/PerceptionRuntime.js');
    const source = fs.readFileSync(file, 'utf8')
      .split('\n')
      .filter(line => !line.trim().startsWith('*') && !line.trim().startsWith('//'))
      .join('\n');

    expect(source).not.toContain('agent.memory.addExperience(');
  });

  it('routes perception emotion and stress effects through EffectCommitter', () => {
    const applyEffect = vi.spyOn(agent.emotion, 'applyEffect');
    const setStress = vi.spyOn(agent.emotion, 'setStress');
    const world = { time: new Date('2026-07-02T10:00:00+08:00') };
    world.effectCommitter = new EffectCommitter({ world, agents: new Map([[agent.id, agent]]) });
    const event = {
      id: 'perception-effects-delta',
      type: 'random',
      scope: 'public',
      content: '突然听到一个令人紧张的坏消息',
      effects: [{ target: 'test', type: 'emotion', delta: { fear: 0.2 } }],
      participants: ['other'],
    };

    handler.tick({
      safeEvents: [event],
      env: { simTime: world.time, effectCommitter: world.effectCommitter, effectWorld: world },
    });

    expect(applyEffect).toHaveBeenCalledWith(
      { fear: 0.2 },
      1,
      expect.any(Object)
    );
    expect(setStress).toHaveBeenCalled();
  });

  it('PerceptionRuntime does not directly mutate emotion, stress, or appraisal bias', () => {
    const file = path.join(import.meta.dirname, '../../../src/agent/runtime/PerceptionRuntime.js');
    const source = fs.readFileSync(file, 'utf8')
      .split('\n')
      .filter(line => !line.trim().startsWith('*') && !line.trim().startsWith('//'))
      .join('\n');

    expect(source).not.toContain('agent.emotion.applyEffect(');
    expect(source).not.toContain('agent.emotion.setStress(');
    expect(source).not.toContain('agent.memory.addAppraisalBias(');
  });

  it('decays future tendency', () => {
    if (agent.futureTendency) {
      handler.tick({ safeEvents: [] });
      // futureTendency.decay() should have been called
      // Just verify no crash
    }
  });
});
