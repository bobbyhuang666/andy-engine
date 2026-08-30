/**
 * Critical phase failure → degraded tick (DEEP_AUDIT_2026-08-13 P0)
 *
 * External audit found that a failing EventDispatcher.dispatch() or
 * CanonEventPipeline.processEvents() left the tick `status: 'committed'`,
 * so atomicTicks rollback (which keys on degraded/aborted) never triggered
 * and onTick callbacks published a partially-applied tick as committed.
 *
 * This test injects failures into both critical phases and asserts the tick
 * now degrades (default engine faults; atomicTicks engine rolls back).
 */
import { describe, it, expect, beforeEach } from 'vitest';
import AndyEngine from '../../index.js';

describe('Critical phase failure degrades the tick (P0)', () => {
  describe('EventDispatcher.dispatch failure', () => {
    it('default engine: tick degrades to `degraded` (not committed)', () => {
      const engine = new AndyEngine({ seed: 'dispatch-fail-default' });
      engine.createCharacter({ id: 'alice', name: 'Alice', mbti: 'INFP' });
      engine.world.eventDispatcher.dispatch = () => {
        throw new Error('injected dispatch failure');
      };

      const result = engine.tick();
      expect(result.status).toBe('degraded');
      expect(result.errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ phase: 'eventDispatch', message: 'injected dispatch failure' }),
        ])
      );
      // A degraded default engine faults and cannot advance further.
      expect(engine.getStats()).toMatchObject({ faulted: true });
    });

    it('atomicTicks engine: tick rolls back to pre-tick state', () => {
      const engine = new AndyEngine({ seed: 'dispatch-fail-atomic', atomicTicks: true });
      engine.createCharacter({ id: 'alice', name: 'Alice', mbti: 'INFP' });
      const beforeTime = engine.world.clock.time.toISOString();
      const beforeTick = engine.world.clock.tickCount;
      let callbackCount = 0;
      engine.onTick(() => { callbackCount++; });

      engine.world.eventDispatcher.dispatch = () => {
        throw new Error('injected dispatch failure');
      };

      const result = engine.tick();
      expect(['aborted', 'degraded']).toContain(result.status);
      // World authority (clock + tick count) restored to pre-tick state.
      expect(engine.world.clock.time.toISOString()).toBe(beforeTime);
      expect(engine.world.clock.tickCount).toBe(beforeTick);
      // A partially-applied tick must not be published as committed.
      expect(callbackCount).toBe(0);
    });
  });

  describe('CanonEventPipeline.processEvents failure', () => {
    beforeEach(() => {
      // canon pipeline only exists when enableFacts is true.
    });

    it('default engine: tick degrades to `degraded` (not committed)', () => {
      const engine = new AndyEngine({ seed: 'canon-fail-default', enableFacts: true });
      engine.createCharacter({ id: 'alice', name: 'Alice', mbti: 'INFP' });
      // Force at least one dispatched event so the canon phase runs.
      engine.world.eventDispatcher.createEvent({
        type: 'random', scope: 'public', participants: ['alice'],
        content: 'trigger', time: engine.world.clock.time,
      });
      engine.world.canonEventPipeline.processEvents = () => {
        throw new Error('injected canon failure');
      };

      const result = engine.tick();
      expect(result.status).toBe('degraded');
      expect(result.errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ phase: 'canonEventPipeline', message: 'injected canon failure' }),
        ])
      );
    });

    it('atomicTicks engine: tick rolls back to pre-tick state', () => {
      const engine = new AndyEngine({ seed: 'canon-fail-atomic', enableFacts: true, atomicTicks: true });
      engine.createCharacter({ id: 'alice', name: 'Alice', mbti: 'INFP' });
      // Poison the canon pipeline BEFORE snapshotting so the injected event's
      // _nextId bump is part of the pre-tick baseline. We trigger canon via the
      // agent's own tick-generated events (no manual createEvent needed).
      engine.world.canonEventPipeline.processEvents = () => {
        throw new Error('injected canon failure');
      };
      const beforeTime = engine.world.clock.time.toISOString();
      const beforeTick = engine.world.clock.tickCount;
      let callbackCount = 0;
      engine.onTick(() => { callbackCount++; });

      const result = engine.tick();
      expect(['aborted', 'degraded']).toContain(result.status);
      expect(engine.world.clock.time.toISOString()).toBe(beforeTime);
      expect(engine.world.clock.tickCount).toBe(beforeTick);
      expect(callbackCount).toBe(0);
    });
  });
});
