import { describe, it, expect } from 'vitest';
import WorldFactStore from '../../src/canon/WorldFactStore.js';

describe('WorldFactStore simTime', () => {
  it('should set and get simTime', () => {
    const store = new WorldFactStore();
    const time = new Date('2026-06-22T12:00:00Z');
    
    store.setSimTime(time);
    expect(store.getSimTime()).toEqual(time);
  });
  
  it('should accept string time', () => {
    const store = new WorldFactStore();
    const timeStr = '2026-06-22T12:00:00Z';
    
    store.setSimTime(timeStr);
    expect(store.getSimTime()).toEqual(new Date(timeStr));
  });
  
  it('should accept number time', () => {
    const store = new WorldFactStore();
    const timeNum = Date.now();
    
    store.setSimTime(timeNum);
    expect(store.getSimTime()).toEqual(new Date(timeNum));
  });
  
  it('should return null initially', () => {
    const store = new WorldFactStore();
    expect(store.getSimTime()).toBeNull();
  });
  
  it('should use simTime for invalidation timestamp', () => {
    const store = new WorldFactStore();
    const simTime = new Date('2026-06-22T12:00:00Z');
    store.setSimTime(simTime);
    
    // Add a fact first
    const fact = store.addFact({
      type: 'event',
      eventId: 'test-event',
      description: 'Test event',
      timestamp: simTime,
      source: 'engine',
      confidence: 1.0,
      scope: 'public',
      participants: [],
      observers: [],
    });
    
    // Invalidate the fact
    const invalidation = store.invalidateFact(fact.id, 'test reason');
    
    // Check that invalidation uses simTime
    expect(invalidation.timestamp).toEqual(simTime);
  });
  
  it('should use simTime for location meaning timestamp', () => {
    const store = new WorldFactStore();
    const simTime = new Date('2026-06-22T12:00:00Z');
    store.setSimTime(simTime);
    
    // Update location meaning
    store.updateLocationMeaning('test-location', {
      type: 'rest',
      weight: 0.5,
      reason: 'test',
    });
    
    // Get the location meaning fact
    const facts = store.getAllFacts(['location_meaning']);
    expect(facts.length).toBe(1);
    expect(facts[0].timestamp).toEqual(simTime);
  });
  
  it('should fallback to epoch if simTime not set', () => {
    const store = new WorldFactStore();
    const fallbackEpoch = new Date('2024-01-01T00:00:00Z');
    
    // Add a fact without setting simTime
    const fact = store.addFact({
      type: 'event',
      eventId: 'test-event',
      description: 'Test event',
      timestamp: new Date(),
      source: 'engine',
      confidence: 1.0,
      scope: 'public',
      participants: [],
      observers: [],
    });
    
    // Invalidate the fact
    const invalidation = store.invalidateFact(fact.id, 'test reason');
    
    // Check that invalidation uses fallback epoch
    expect(invalidation.timestamp).toEqual(fallbackEpoch);
  });
});
