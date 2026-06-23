import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import path from 'path';

const ROOT = process.cwd();

describe('Agent.js Facade Contract', () => {
  it('Agent.js does not import EventEffectPipeline internals', () => {
    const content = readFileSync(path.join(ROOT, 'agent', 'Agent.js'), 'utf-8');
    expect(content).not.toContain("require('../src/effects/EventEffectPipeline')");
  });

  it('Agent.js does not import memory internals', () => {
    const content = readFileSync(path.join(ROOT, 'agent', 'Agent.js'), 'utf-8');
    expect(content).not.toContain("require('../src/agent/memory/PersonalMemory')");
  });

  it('Agent.js does not have legacy private methods', () => {
    const content = readFileSync(path.join(ROOT, 'agent', 'Agent.js'), 'utf-8');
    expect(content).not.toContain('_perceiveEvents');
    expect(content).not.toContain('_applyNeedsToEmotion');
    expect(content).not.toContain('_runShadowActionSelection');
  });

  it('Agent.js delegates to AgentRuntime', () => {
    const content = readFileSync(path.join(ROOT, 'agent', 'Agent.js'), 'utf-8');
    expect(content).toContain('AgentRuntime');
    expect(content).toContain('this.runtime.tick');
  });

  it('Agent.js has proper facade documentation', () => {
    const content = readFileSync(path.join(ROOT, 'agent', 'Agent.js'), 'utf-8');
    expect(content).toContain('Public Compatibility Facade');
    expect(content).toContain('Canonical implementation');
  });
});
