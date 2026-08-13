/**
 * Canon hot retention & eviction receipt tests (RFC W6 / Patch F Phase A)
 *
 * Covers:
 *   - 2001 EventFacts → evict 401, retain 1600 (80% of cap 2000)
 *   - eviction receipt has type/count/oldestMs/newestMs/reason
 *   - getStats().retention exposes cap, current, totalEvicted per type
 *   - getStats().retention.lastEvictionReceipt after eviction
 *   - no eviction → lastEvictionReceipt is null, totalEvicted 0
 *   - receipts bounded (last 100)
 *
 * Hermetic: no DB, no network.
 */

import { describe, it, expect, beforeEach } from 'vitest';
const { createRequire } = await import('node:module');
const require = createRequire(import.meta.url);
const WorldFactStore = require('../../src/canon/WorldFactStore.js');
const { FactType } = require('../../src/canon/FactSchema.js');

function makeEventFact(id, timestamp) {
  return {
    id, type: FactType.EVENT, source: 'engine',
    eventId: `evt_${id}`, timestamp, scope: 'public',
    description: `event ${id}`, confidence: 1.0,
    participants: [], observers: [],
  };
}

describe('Canon hot retention — eviction receipt (RFC W6 / Patch F)', () => {
  let store;
  beforeEach(() => { store = new WorldFactStore(); });

  it('2001 EventFacts → evict 401, retain 1600 (80% of cap 2000)', () => {
    for (let i = 0; i < 2001; i++) {
      store.addFact(makeEventFact(`f_${i}`, new Date(2026, 0, 1 + i)));
    }
    const eventCount = store._byType.get(FactType.EVENT).size;
    expect(eventCount).toBe(1600);
  });

  it('eviction receipt has type, count, oldestMs, newestMs, reason', () => {
    for (let i = 0; i < 2001; i++) {
      store.addFact(makeEventFact(`f_${i}`, new Date(2026, 0, 1 + i)));
    }
    const receipt = store._evictionReceipts[store._evictionReceipts.length - 1];
    expect(receipt).toBeDefined();
    expect(receipt.type).toBe(FactType.EVENT);
    expect(receipt.count).toBe(401);
    expect(receipt.reason).toBe('capacity_overflow');
    expect(typeof receipt.oldestMs).toBe('number');
    expect(typeof receipt.newestMs).toBe('number');
    expect(receipt.oldestMs).toBeLessThanOrEqual(receipt.newestMs);
  });

  it('getStats().retention exposes cap, current, totalEvicted per type', () => {
    for (let i = 0; i < 2001; i++) {
      store.addFact(makeEventFact(`f_${i}`, new Date(2026, 0, 1 + i)));
    }
    const stats = store.getStats();
    expect(stats.retention).toBeDefined();
    expect(stats.retention[FactType.EVENT].cap).toBe(2000);
    expect(stats.retention[FactType.EVENT].current).toBe(1600);
    expect(stats.retention[FactType.EVENT].totalEvicted).toBe(401);
    // A type with no eviction
    expect(stats.retention[FactType.INTENTION].cap).toBe(500);
    expect(stats.retention[FactType.INTENTION].totalEvicted).toBe(0);
  });

  it('getStats().retention.lastEvictionReceipt is the last receipt', () => {
    for (let i = 0; i < 2001; i++) {
      store.addFact(makeEventFact(`f_${i}`, new Date(2026, 0, 1 + i)));
    }
    const stats = store.getStats();
    expect(stats.retention.lastEvictionReceipt).toBeDefined();
    expect(stats.retention.lastEvictionReceipt.count).toBe(401);
    expect(stats.retention.totalEvictionEvents).toBeGreaterThan(0);
  });

  it('no eviction → lastEvictionReceipt is null, totalEvicted 0', () => {
    store.addFact(makeEventFact('f_1', new Date(2026, 0, 1)));
    const stats = store.getStats();
    expect(stats.retention.lastEvictionReceipt).toBeNull();
    expect(stats.retention[FactType.EVENT].totalEvicted).toBe(0);
    expect(stats.retention.totalEvictionEvents).toBe(0);
  });

  it('receipts are bounded to last 100 (no unbounded memory)', () => {
    // Trigger many evictions by repeatedly overflowing the cap.
    // addFact triggers eviction each time cap is exceeded.
    for (let round = 0; round < 120; round++) {
      // Add enough to trigger at least one eviction per round.
      for (let i = 0; i < 500; i++) {
        store.addFact(makeEventFact(
          `f_${round}_${i}`,
          new Date(2026, 0, 1 + round * 500 + i),
        ));
      }
    }
    expect(store._evictionReceipts.length).toBeLessThanOrEqual(100);
  });

  it('oldestMs/newestMs correctly track the evicted range (not the retained range)', () => {
    // Add facts with known timestamps.
    const baseMs = new Date('2026-01-01T00:00:00Z').getTime();
    for (let i = 0; i < 2001; i++) {
      store.addFact(makeEventFact(`f_${i}`, new Date(baseMs + i * 1000)));
    }
    const receipt = store._evictionReceipts[store._evictionReceipts.length - 1];
    // The 401 oldest facts (i=0..400) are evicted.
    // oldestMs should be baseMs (i=0), newestMs should be baseMs + 400*1000.
    expect(receipt.oldestMs).toBe(baseMs);
    expect(receipt.newestMs).toBe(baseMs + 400 * 1000);
  });
});
