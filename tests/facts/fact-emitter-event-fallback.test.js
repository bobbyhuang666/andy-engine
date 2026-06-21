/**
 * FactEmitter Event Fallback Tests
 *
 * Tests for the legacy emitEventFacts / propagateEventKnowledge methods.
 * These methods are @deprecated — new code must use CanonEventPipeline.
 * This file exists to verify fallback behavior only.
 */

import { describe, it, expect } from 'vitest';
import AndyEngine from '../../index.js';

describe('FactEmitter Event Fallback (legacy)', () => {
  it('FactEmitter 对缺失 id 的事件使用可重复 fallback id', () => {
    const engineA = new AndyEngine({ enableFacts: true, seed: 'facts', startTime: new Date('2026-01-01T00:00:00Z') });
    const engineB = new AndyEngine({ enableFacts: true, seed: 'facts', startTime: new Date('2026-01-01T00:00:00Z') });

    engineA.world.factEmitter.setSimTime(engineA.world.time);
    engineB.world.factEmitter.setSimTime(engineB.world.time);

    const [factA] = engineA.world.factEmitter.emitEventFacts([{ type: 'custom', content: '测试事件' }]);
    const [factB] = engineB.world.factEmitter.emitEventFacts([{ type: 'custom', content: '测试事件' }]);

    expect(factA.eventId).toBe(factB.eventId);
    expect(factA.eventId).toContain('2026-01-01T00:00:00.000Z');
  });
});
