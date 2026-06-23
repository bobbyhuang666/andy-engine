# Aliveness Metrics v0.1

## Overview

This document defines 5 basic metrics for evaluating character "aliveness" in Andy Engine.

These metrics are not academic benchmarks. They are practical indicators that help verify
the core value proposition: characters that feel alive because they have real experiences.

## Metrics

### 1. Continuity Score

**Definition**: Can the character reference real past events?

**Measurement**:
- Run N ticks with events
- Query character narrative
- Check if narrative references specific past events
- Score = (events referenced) / (events that occurred)

**Target**: > 0.5

**Example**:
```
Events occurred: [ate dinner, went to park, met Bob]
Narrative: "I went to the park today and saw Bob"
Score: 2/3 = 0.67
```

### 2. Causality Score

**Definition**: Is the current state caused by past events?

**Measurement**:
- Track state changes over time
- Verify state changes correlate with events
- Score = (state changes with causal events) / (total state changes)

**Target**: > 0.7

**Example**:
```
State changes: [hunger decreased, mood improved]
Causal events: [ate dinner, met friend]
Score: 2/2 = 1.0
```

### 3. Epistemic Boundary Score

**Definition**: Does the character only know what it should know?

**Measurement**:
- Create two characters in different locations
- Verify each character's narrative only includes its own experiences
- Score = (correct boundaries) / (total boundary checks)

**Target**: > 0.9

**Example**:
```
Alice in library, Bob in cafeteria
Alice narrative: mentions library events only
Bob narrative: mentions cafeteria events only
Score: 2/2 = 1.0
```

### 4. Affect Expression Score

**Definition**: Do internal emotion changes translate to observable expression differences?

**Measurement**:
- Change character's emotion state
- Verify narrative/behavior changes accordingly
- Score = (expression changes matching emotion) / (total emotion changes)

**Target**: > 0.6

**Example**:
```
Emotion change: sadness increased
Narrative change: mentions feeling down
Score: 1/1 = 1.0
```

### 5. Non-Fabrication Score

**Definition**: Does the narrative avoid inventing events that didn't happen?

**Measurement**:
- Run N ticks
- Compare narrative events with actual canon events
- Score = 1 - (fabricated events) / (total narrative events)

**Target**: > 0.95

**Example**:
```
Narrative events: [ate dinner, went to park]
Canon events: [ate dinner, went to park]
Fabricated events: 0
Score: 1 - 0/2 = 1.0
```

## Implementation

### Smoke Test

A minimal smoke test verifies each metric with a simple fixture:

```javascript
// tests/e2e/aliveness-metrics-smoke.test.js
describe('Aliveness Metrics Smoke', () => {
  it('should compute continuity score', () => {
    // Setup world with events
    // Query narrative
    // Verify references to past events
  });
  
  it('should compute causality score', () => {
    // Track state changes
    // Verify correlation with events
  });
  
  it('should compute epistemic boundary score', () => {
    // Create two characters
    // Verify boundary maintenance
  });
  
  it('should compute affect expression score', () => {
    // Change emotion
    // Verify expression change
  });
  
  it('should compute non-fabrication score', () => {
    // Compare narrative with canon
    // Verify no fabrication
  });
});
```

### Dashboard (Future)

Future versions may include a dashboard that computes these metrics in real-time.

## Limitations

1. **Not academic benchmarks** — These are practical indicators, not rigorous measures
2. **Small-scale only** — Designed for 2-5 characters, not large populations
3. **Manual verification** — Some metrics require human judgment
4. **Domain-specific** — Metrics may need tuning for different domains

## Success Criteria

For v2.2, the success criteria is:

- All 5 metrics can be computed
- Smoke tests pass
- Metrics show non-zero scores for basic scenarios
- No metric shows 0% (complete failure)

## Future Work

- v2.3: Automated metric computation
- v3: Metric dashboard
- v3: Metric-based A/B testing
