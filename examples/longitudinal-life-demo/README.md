# Longitudinal Life Demo

This demo demonstrates Andy Engine's "persistent life" capability.

## What It Shows

1. **User leaves for 24 hours** — Character continues living in the background
2. **Events happen** — Character interacts with other characters, forms memories
3. **Relationships evolve** — Character's relationships change based on interactions
4. **User returns** — Character responds based on real events that happened

## How to Run

```bash
node examples/longitudinal-life-demo/demo.js
```

## Expected Output

The demo will:
1. Create a world with Alice and Bob
2. Simulate 24 hours of life
3. Show how Alice's state, memories, and relationships evolve
4. Demonstrate that Alice's response is based on real events

## Key Features Demonstrated

### 1. Persistent World
- World continues ticking even when user is away
- Events are recorded in the canon
- Memories are formed and retained

### 2. Character Continuity
- Character's state evolves over time
- Emotions change based on events
- Behavior adapts to circumstances

### 3. Epistemic Boundary
- Character only knows what it experienced
- Character doesn't invent events
- Character's narrative is grounded in reality

### 4. Relationship Evolution
- Relationships change based on interactions
- Conflicts affect relationship strength
- Time apart affects relationship decay

## Technical Details

- **Seed**: `longitudinal-demo` for reproducibility
- **Characters**: Alice (INFP) and Bob (ESTJ)
- **Locations**: Library, Cafeteria, Park
- **Duration**: 24 simulated hours
- **Ticks**: ~18 ticks (5 minutes each)

## Verification Points

After running the demo, verify:
- [ ] World continued ticking
- [ ] Events were recorded
- [ ] Memories were formed
- [ ] Relationship evolved
- [ ] Narrative is based on real events
- [ ] No fabricated events in narrative

## Related Documentation

- [A-Level Roadmap](../../docs/A_LEVEL_ROADMAP.md)
- [Aliveness Roadmap](../../docs/ALIVENESS_ROADMAP_v2_1_v3.md)
- [Public API Contract](../../docs/PUBLIC_API_CONTRACT.md)
