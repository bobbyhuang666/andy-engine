/**
 * Agent Runtime & Lifecycle Containment Tests (Stage 3 + Stage 4)
 *
 * Verifies that Agent.js delegation to extracted modules preserves behavior,
 * and that lifecycle modules handle constructor/restore/wiring correctly.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import path from 'path';

const ROOT = process.cwd();

describe('Agent Containment: Agent.js delegation', () => {
  it('Agent.js delegates tick to AgentRuntime', () => {
    const content = readFileSync(path.join(ROOT, 'agent', 'Agent.js'), 'utf-8');
    expect(content).toContain('return this.runtime.tick(env, perceivedEvents, contagionInputs)');
  });

  it('Agent.js keeps _buildActionContext as a single runtime delegator', () => {
    const content = readFileSync(path.join(ROOT, 'agent', 'Agent.js'), 'utf-8');
    const matches = content.match(/\n  _buildActionContext\(env\)/g) || [];
    expect(matches).toHaveLength(1);
    expect(content).toContain('return _buildActionContextImpl(this, env)');
  });

  it('Agent.js delegates _runShadowActionSelection to ActionSelectionRuntime', () => {
    const content = readFileSync(path.join(ROOT, 'agent', 'Agent.js'), 'utf-8');
    expect(content).toContain('return runShadowActionSelection(this, env)');
  });

  it('Agent.js delegates _perceiveEvents to PerceptionRuntime', () => {
    const content = readFileSync(path.join(ROOT, 'agent', 'Agent.js'), 'utf-8');
    expect(content).toContain('perceiveEvents(this, events)');
  });

  it('Agent.js delegates _checkSchedule to ScheduleHandler', () => {
    const content = readFileSync(path.join(ROOT, 'agent', 'Agent.js'), 'utf-8');
    expect(content).toContain('return ScheduleHandler.checkSchedule(this,');
  });

  it('Agent.js delegates _reflect to ReflectionRuntime', () => {
    const content = readFileSync(path.join(ROOT, 'agent', 'Agent.js'), 'utf-8');
    expect(content).toContain('reflect(this)');
  });

  it('Agent.js delegates _mindWander to MindWanderRuntime', () => {
    const content = readFileSync(path.join(ROOT, 'agent', 'Agent.js'), 'utf-8');
    expect(content).toContain('return mindWander(this)');
  });

  it('Agent.js delegates toJSON to AgentSerializer', () => {
    const content = readFileSync(path.join(ROOT, 'agent', 'Agent.js'), 'utf-8');
    expect(content).toContain('return _toJSONImpl(this)');
  });

  it('Agent.js delegates toNarrative to AgentNarrative facade', () => {
    const content = readFileSync(path.join(ROOT, 'agent', 'Agent.js'), 'utf-8');
    expect(content).toContain('return _toNarrativeImpl(this, externalState)');
  });

  it('Agent.js delegates interact to InteractionFacade', () => {
    const content = readFileSync(path.join(ROOT, 'agent', 'Agent.js'), 'utf-8');
    expect(content).toContain('return _interactImpl(this, other, interactionType)');
  });

  it('Agent.js delegates recordExternalExperience to ExternalExperience facade', () => {
    const content = readFileSync(path.join(ROOT, 'agent', 'Agent.js'), 'utf-8');
    expect(content).toContain('return _recordExternalExperienceImpl(this, event, options)');
  });
});

describe('Agent Containment: lifecycle delegation', () => {
  it('Agent.js constructor uses createSubsystems for fresh creation', () => {
    const content = readFileSync(path.join(ROOT, 'agent', 'Agent.js'), 'utf-8');
    expect(content).toContain('createSubsystems(');
  });

  it('Agent.js constructor uses restoreSubsystems for saved state', () => {
    const content = readFileSync(path.join(ROOT, 'agent', 'Agent.js'), 'utf-8');
    expect(content).toContain('restoreSubsystems(');
  });

  it('Agent.js constructor uses wireAll for subsystem wiring', () => {
    const content = readFileSync(path.join(ROOT, 'agent', 'Agent.js'), 'utf-8');
    expect(content).toContain('wireAll(');
  });

  it('Agent.js no longer directly imports psychology/memory/schedule constructors', () => {
    const content = readFileSync(path.join(ROOT, 'agent', 'Agent.js'), 'utf-8');
    // Should not directly import these — factory handles them
    expect(content).not.toMatch(/require\(['"].*psychology\/Personality/);
    expect(content).not.toMatch(/require\(['"].*psychology\/EmotionVector/);
    expect(content).not.toMatch(/require\(['"].*psychology\/StateMachine/);
    expect(content).not.toMatch(/require\(['"].*memory\/PersonalMemory/);
    expect(content).not.toMatch(/require\(['"].*schedule\/Schedule/);
    expect(content).not.toMatch(/require\(['"].*memory\/ProceduralMemory/);
    expect(content).not.toMatch(/require\(['"].*psychology\/NeedsSystem/);
    expect(content).not.toMatch(/require\(['"].*psychology\/EmotionRegulation/);
    expect(content).not.toMatch(/require\(['"].*psychology\/IntrinsicMotivation/);
    expect(content).not.toMatch(/require\(['"].*psychology\/BehaviorField/);
    expect(content).not.toMatch(/require\(['"].*psychology\/LocationMeaningInfluence/);
    expect(content).not.toMatch(/require\(['"].*psychology\/FutureTendencyTracker/);
  });
});

describe('Agent Containment: module existence', () => {
  const expectedModules = [
    'src/agent/lifecycle/AgentDefaults.js',
    'src/agent/lifecycle/AgentSubsystemFactory.js',
    'src/agent/lifecycle/AgentWiring.js',
    'src/agent/runtime/ActionSelectionRuntime.js',
    'src/agent/runtime/PerceptionRuntime.js',
    'src/agent/runtime/PhysiologyRuntime.js',
    'src/agent/runtime/ReflectionRuntime.js',
    'src/agent/runtime/MindWanderRuntime.js',
    'src/agent/facade/AgentNarrative.js',
    'src/agent/facade/ExternalExperience.js',
    'src/agent/facade/InteractionFacade.js',
    'src/agent/facade/AgentSerializer.js',
  ];

  for (const mod of expectedModules) {
    it(`${mod} exists`, () => {
      expect(existsSync(path.join(ROOT, mod))).toBe(true);
    });
  }
});

describe('Agent Containment: Agent.js size', () => {
  it('Agent.js is under 350 lines (was 1807 in Stage 2, 477 in Stage 3)', () => {
    const content = readFileSync(path.join(ROOT, 'agent', 'Agent.js'), 'utf-8');
    const lineCount = content.split('\n').length;
    expect(lineCount).toBeLessThan(350);
  });
});

describe('Agent Containment: constructor behavior preserved', () => {
  it('fresh Agent has expected subsystem instances', () => {
    const Agent = require('../agent/Agent.js');
    const agent = new Agent({
      id: 'test-fresh',
      name: 'Test',
      personality: { mbti: 'ISFJ' },
      schedule: {},
    });
    expect(agent.id).toBe('test-fresh');
    expect(agent.personality).toBeDefined();
    expect(agent.emotion).toBeDefined();
    expect(agent.stateMachine).toBeDefined();
    expect(agent.memory).toBeDefined();
    expect(agent.needs).toBeDefined();
    expect(agent.behaviorField).toBeDefined();
    expect(agent.schedule).toBeDefined();
    expect(agent.health).toBe(1.0);
    expect(agent.socialEnergy).toBe(0.7);
    expect(agent.isOnline).toBe(true);
    expect(agent.runtime).toBeDefined();
    expect(agent.futureTendency).toBeDefined();
  });

  it('fresh Agent with initialState applies behaviorField center', () => {
    const Agent = require('../agent/Agent.js');
    const agent = new Agent({
      id: 'test-init-state',
      name: 'Test',
      personality: { mbti: 'ENFP' },
      schedule: {},
      initialState: '在休息',
    });
    // behaviorField should have been centered
    expect(agent.behaviorField.label).toBeDefined();
  });

  it('fresh Agent with domain uses domain fallback region', () => {
    const Agent = require('../agent/Agent.js');
    // Use a real preset domain to avoid missing property errors
    const { getDefaultDomain } = require('../src/domain/DomainRegistry');
    const domain = getDefaultDomain();
    const agent = new Agent({
      id: 'test-domain',
      name: 'Test',
      personality: { mbti: 'ISTP' },
      schedule: {},
      domain,
    });
    expect(agent.position).toBeDefined();
    expect(typeof agent.position).toBe('string');
  });
});

describe('Agent Containment: serialize → restore → tick smoke', () => {
  it('roundtrip: create → tick → toJSON → new Agent(savedState) → tick', () => {
    const Agent = require('../agent/Agent.js');

    // 1. Create and tick
    const agent1 = new Agent({
      id: 'roundtrip-test',
      name: 'Roundtrip',
      personality: { mbti: 'ENFJ' },
      schedule: {},
    });
    for (let i = 0; i < 5; i++) {
      agent1.tick({ hour: 10 + i, dayOfWeek: 1, minutesElapsed: 5, simTime: new Date() });
    }

    // 2. Serialize
    const json = agent1.toJSON();
    expect(json.id).toBe('roundtrip-test');
    expect(json.personality).toBeDefined();
    expect(json.emotion).toBeDefined();

    // 3. Restore from saved state
    const agent2 = new Agent({
      id: 'roundtrip-test',
      name: 'Roundtrip',
      schedule: {},
    }, json);

    // 4. Verify subsystems restored
    expect(agent2.id).toBe('roundtrip-test');
    expect(agent2.health).toBe(agent1.health);
    expect(agent2.position).toBe(agent1.position);
    expect(agent2.isOnline).toBe(agent1.isOnline);

    // 5. Tick the restored agent
    const result = agent2.tick({ hour: 15, dayOfWeek: 1, minutesElapsed: 5, simTime: new Date() });
    expect(result).toBeDefined();
    expect(result.stateChanged).toBeDefined();
    expect(result.emotionSnapshot).toBeDefined();
  });

  it('roundtrip preserves actionTraceHistory', () => {
    const Agent = require('../agent/Agent.js');

    const agent1 = new Agent({
      id: 'trace-test',
      name: 'Trace',
      personality: { mbti: 'INTP' },
      schedule: {},
    });
    agent1._actionTraceHistory = [{ test: true }];
    const json = agent1.toJSON();
    expect(json._actionTraceHistory).toEqual([{ test: true }]);

    const agent2 = new Agent({
      id: 'trace-test',
      name: 'Trace',
      schedule: {},
    }, json);
    expect(agent2._actionTraceHistory).toEqual([{ test: true }]);
  });

  it('restored agent toJSON matches original shape', () => {
    const Agent = require('../agent/Agent.js');

    const agent1 = new Agent({
      id: 'shape-test',
      name: 'Shape',
      personality: { mbti: 'ESFP' },
      schedule: {},
    });
    agent1.tick({ hour: 10, dayOfWeek: 1, minutesElapsed: 5, simTime: new Date() });
    const json1 = agent1.toJSON();

    const agent2 = new Agent({ id: 'shape-test', name: 'Shape', schedule: {} }, json1);
    const json2 = agent2.toJSON();

    // Both should have same keys
    expect(Object.keys(json2).sort()).toEqual(Object.keys(json1).sort());
    expect(json2.id).toBe(json1.id);
    expect(json2.position).toBe(json1.position);
    expect(json2.health).toBe(json1.health);
    expect(json2.socialEnergy).toBe(json1.socialEnergy);
    expect(json2.isOnline).toBe(json1.isOnline);
  });

  it('restore path uses saved schedule when config.schedule is omitted', () => {
    const Agent = require('../agent/Agent.js');

    const schedule = {
      entries: [{
        startHour: 9,
        endHour: 10,
        region: '图书馆',
        activity: '阅读',
        days: [1],
        probability: 1,
        noise: 0,
      }],
    };
    const agent1 = new Agent({
      id: 'schedule-restore-test',
      name: 'ScheduleRestore',
      personality: { mbti: 'ISTJ' },
      schedule,
    });
    const json = agent1.toJSON();

    const agent2 = new Agent({
      id: 'schedule-restore-test',
      name: 'ScheduleRestore',
    }, json);

    expect(agent2.schedule.entries).toHaveLength(1);
    expect(agent2.schedule.entries[0].region).toBe('图书馆');
    expect(agent2.schedule.getCurrentActivity(9.5, 1, '2026-06-21').region).toBe('图书馆');
  });
});

describe('Agent Containment: runtime behavior preserved', () => {
  it('Agent tick returns correct shape', () => {
    const Agent = require('../agent/Agent.js');
    const agent = new Agent({
      id: 'tick-shape',
      name: 'Test',
      personality: { mbti: 'ISFJ' },
      schedule: {},
    });
    const result = agent.tick({ hour: 10, dayOfWeek: 1, minutesElapsed: 5, simTime: new Date() });
    expect(result).toBeDefined();
    expect(typeof result.stateChanged).toBe('boolean');
    expect(typeof result.regionChanged).toBe('boolean');
    expect(Array.isArray(result.newEvents)).toBe(true);
    expect(result.emotionSnapshot).toBeDefined();
    expect(typeof result.emotionSnapshot.valence).toBe('number');
    expect(typeof result.emotionSnapshot.arousal).toBe('number');
  });

  it('Agent buildBehaviorSignals returns correct shape', () => {
    const Agent = require('../agent/Agent.js');
    const agent = new Agent({
      id: 'signals-test',
      name: 'Test',
      personality: { mbti: 'ENTP' },
      schedule: {},
    });
    const signals = agent.buildBehaviorSignals({ hour: 10, dayOfWeek: 1, weather: 'sunny' });
    expect(signals.emotion).toBeDefined();
    expect(signals.needs).toBeDefined();
    expect(signals.schedule).toBeDefined();
    expect(signals.environment).toBeDefined();
    expect(typeof signals.health).toBe('number');
    expect(typeof signals.socialEnergy).toBe('number');
  });

  it('Agent getStatus returns correct shape', () => {
    const Agent = require('../agent/Agent.js');
    const agent = new Agent({
      id: 'status-test',
      name: 'Test',
      personality: { mbti: 'ISTJ' },
      schedule: {},
    });
    const status = agent.getStatus();
    expect(status.id).toBe('status-test');
    expect(status.name).toBe('Test');
    expect(typeof status.position).toBe('string');
    expect(typeof status.isOnline).toBe('boolean');
  });

  it('Agent toNarrative returns string', () => {
    const Agent = require('../agent/Agent.js');
    const agent = new Agent({
      id: 'narrative-test',
      name: 'Test',
      personality: { mbti: 'INFJ' },
      schedule: {},
    });
    agent.tick({ hour: 14, dayOfWeek: 3, minutesElapsed: 5, simTime: new Date() });
    const narrative = agent.toNarrative();
    expect(typeof narrative).toBe('string');
  });

  it('Agent recordExternalExperience works', () => {
    const Agent = require('../agent/Agent.js');
    const agent = new Agent({
      id: 'exp-test',
      name: 'Test',
      personality: { mbti: 'INTJ' },
      schedule: {},
    });
    const mem = agent.recordExternalExperience({ content: 'had lunch with friend' });
    expect(mem === null || typeof mem === 'object').toBe(true);
  });

  it('Agent interact works', () => {
    const Agent = require('../agent/Agent.js');
    const agent1 = new Agent({
      id: 'interact-a',
      name: 'Alice',
      personality: { mbti: 'ENFP' },
      schedule: {},
    });
    const agent2 = new Agent({
      id: 'interact-b',
      name: 'Bob',
      personality: { mbti: 'ISTJ' },
      schedule: {},
    });
    const result = agent1.interact(agent2, 'talk');
    expect(result).toBeDefined();
    expect(result.type).toBe('talk');
    expect(typeof result.valence).toBe('number');
  });
});
