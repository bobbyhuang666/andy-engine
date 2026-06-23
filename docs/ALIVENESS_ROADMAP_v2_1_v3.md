# Andy Engine v2.1 / v3 Aliveness Roadmap

## Overview

This document outlines the planned aliveness features for Andy Engine v2.1 and v3. These features are not implemented in v2.0.1, which focuses on post-v2 stabilization.

## v2.1 Goals

### 1. Structured Narrative Input Completion

**Why it matters**: NarrativeBuilder still depends on string parsing for some inputs. Structured input improves reliability and enables future AffectCompiler integration.

**Current state**: 
- AffectFrame structured input seam exists (opt-in)
- nearbyPeople and recentEvents support structured arrays
- Memory tag stripping still uses string parsing

**Proposed phases**:
1. Memory structured input (array of {content, category, timeAgo})
2. ForbiddenTerms regex checker v2 (escape special chars or use replaceAll)
3. Sentinel string elimination (null instead of '附近没有人')

**Required tests**:
- Memory structured input path works
- ForbiddenTerms with regex-special chars
- Sentinel null checks

**Non-goals**:
- Full AffectCompiler implementation
- Changing public getNarrative() signature

**Risks**:
- Memory structured input may require PersonalMemory API changes
- ForbiddenTerms changes may affect domain validation

### 2. Memory Structured Input

**Why it matters**: Memory tag stripping (10 regex patterns) is fragile and must stay in sync with PersonalMemory.toPromptString().

**Current state**: NarrativeBuilder strips [background], [social], [daily_life], [emotion], [thought] tags and time-ago patterns.

**Proposed phases**:
1. Add structured memory array to worldContext alongside memoryContext string
2. NarrativeBuilder formats directly from structured data
3. Keep string path for backward compatibility

**Required tests**:
- Structured memory path works
- Old string path still works
- No public API change

**Non-goals**:
- Changing PersonalMemory storage format
- Breaking existing memory serialization

**Risks**:
- Structured memory may be larger than string representation
- Need to ensure backward compatibility with existing consumers

### 3. ForbiddenTerms Checker v2

**Why it matters**: Current ForbiddenTerms uses unescaped regex from user-configured domain data, which can throw on special characters.

**Current state**: `applyForbiddenTerms()` uses `new RegExp(term, 'g')` without escaping.

**Proposed phases**:
1. Escape regex special chars in terms
2. Or switch to `replaceAll(term, '***')` (literal string replacement)
3. Add tests for regex-special chars

**Required tests**:
- ForbiddenTerms with special chars don't throw
- Replacement still works correctly
- Empty domain works

**Non-goals**:
- Changing domain.forbiddenTerms format
- Adding regex support to domain config

**Risks**:
- Changing replacement method may affect existing domains
- Need to test with campus/tavern presets

### 4. Knowledge Propagation Runtime

**Why it matters**: Currently agents only know what they directly observe. Knowledge propagation enables gossip, inference, and shared understanding.

**Current state**: KnowledgeStore tracks who knows what, but no propagation mechanism exists.

**Proposed phases**:
1. Define propagation rules (gossip, inference, direct observation)
2. Implement per-tick propagation pipeline
3. Add propagation tests
4. Integrate with CanonEventPipeline

**Required tests**:
- Gossip propagation between friends
- Inference from observed events
- No knowledge leaks across boundaries

**Non-goals**:
- Full inference engine
- Cross-domain knowledge sharing

**Risks**:
- Propagation may be computationally expensive
- Need to balance accuracy vs performance

### 5. Grounding Checker v2

**Why it matters**: Current FactConsistencyChecker is regex-based and simple. v2 should use structured validation.

**Current state**: `checkConsistency()` validates LLM output against facts using regex.

**Proposed phases**:
1. Define structured validation rules
2. Implement valence direction check
3. Implement need denial check
4. Implement contradicted emotion check

**Required tests**:
- Valence contradiction detection
- Need denial detection
- Invented emotion detection

**Non-goals**:
- Full NLP extraction from LLM output
- Blocking LLM responses (validation only)

**Risks**:
- Extraction accuracy may be low for Chinese text
- Need to balance false positives vs false negatives

### 6. AffectCompiler Basic Implementation

**Why it matters**: AffectCompiler converts rich internal affect state into structured AffectFrame for LLM consumption.

**Current state**: AffectFrame seam exists (src/shared/AffectFrame.js), but no full compiler.

**Proposed phases**:
1. Implement basic compilation from EmotionVector, NeedsSystem, BehaviorField
2. Add trend detection (slope over last N ticks)
3. Add social energy computation
4. Add stability computation

**Required tests**:
- Basic compilation works
- Trend detection works
- Social energy computation works

**Non-goals**:
- Full commercial AffectCompiler
- Multi-agent affect synchronization
- Personalized expression profiles

**Risks**:
- Trend detection requires history buffer (memory cost)
- Social energy formula needs concrete definition

### 7. Longitudinal Demo Protocol

**Why it matters**: Need standardized way to evaluate "aliveness" over time.

**Current state**: No standardized evaluation protocol.

**Proposed phases**:
1. Define evaluation metrics (character continuity, state awareness, memory consistency)
2. Create evaluation scenarios
3. Implement automated evaluation
4. Document results

**Required tests**:
- Evaluation scenarios run successfully
- Metrics are computed correctly
- Results are reproducible

**Non-goals**:
- Published benchmark
- Comparison with other systems

**Risks**:
- Evaluation may be subjective
- Need to define clear success criteria

## v3 Goals

### 1. StoryArc Runtime

**Why it matters**: Characters need long-horizon narrative arcs, not just tick-by-tick behavior.

**Current state**: StoryArc runtime is paused (RFC exists).

**Proposed phases**:
1. Define StoryArc schema (beginning, middle, end)
2. Implement arc detection from events
3. Implement arc progression
4. Integrate with narrative generation

**Required tests**:
- Arc detection from event sequences
- Arc progression over time
- Narrative reflects current arc

**Non-goals**:
- Full plot generation
- Multi-character coordinated arcs

**Risks**:
- Arc detection may be computationally expensive
- Need to balance arc coherence vs emergent behavior

### 2. WorldObject Integration

**Why it matters**: Characters should interact with objects in the world, not just other characters.

**Current state**: WorldObject is modeled but not integrated into Agent.tick.

**Proposed phases**:
1. Define WorldObject schema
2. Implement object perception
3. Implement object interaction
4. Integrate with action selection

**Required tests**:
- Object perception works
- Object interaction works
- Action selection considers objects

**Non-goals**:
- Full physics simulation
- Object creation/destruction

**Risks**:
- Object interaction may increase action space significantly
- Need to balance complexity vs performance

### 3. Long-Horizon Identity/Growth

**Why it matters**: Characters should grow and change over long periods, not just react to immediate events.

**Current state**: Personality is static (OCEAN values don't change).

**Proposed phases**:
1. Define growth mechanisms (experience-based personality drift)
2. Implement growth pipeline
3. Integrate with narrative generation
4. Add growth tests

**Required tests**:
- Personality drift over time
- Growth reflects experiences
- Narrative reflects growth

**Non-goals**:
- Full personality development theory
- Multi-year growth simulation

**Risks**:
- Growth may lead to unpredictable behavior
- Need to balance stability vs change

### 4. Advanced AffectCompiler

**Why it matters**: Commercial applications need higher-fidelity affect representation.

**Current state**: Basic AffectCompiler planned for v2.1.

**Proposed phases**:
1. Temporal dynamics engine (exponential smoothing, seasonal patterns)
2. Multi-agent affect synchronization (emotional contagion, empathic resonance)
3. Personalized expression profiles (per-character LLM templates)
4. AffectFrame-driven animation/voice parameters

**Required tests**:
- Temporal dynamics work
- Multi-agent synchronization works
- Personalized profiles work

**Non-goals**:
- Real-time biometric integration
- Clinical psychology models

**Risks**:
- Computationally expensive
- May require native acceleration

### 5. Multi-Domain Life Evaluation

**Why it matters**: Need standardized way to evaluate character "aliveness" across different domains.

**Current state**: Only campus and tavern presets exist.

**Proposed phases**:
1. Define evaluation framework
2. Create multiple domain presets
3. Run evaluation across domains
4. Document results

**Required tests**:
- Evaluation runs across domains
- Metrics are comparable
- Results are reproducible

**Non-goals**:
- Published benchmark
- Domain-specific evaluation criteria

**Risks**:
- Evaluation may be subjective
- Need to define clear success criteria

### 6. Native/Prebuilt Performance Expansion

**Why it matters**: Large-scale simulations (100k+ agents) need native performance.

**Current state**: Rust native module exists but binaries are not prebuilt.

**Proposed phases**:
1. Prebuild native binaries for common platforms
2. Optimize hot paths (emotion, social contagion)
3. Add performance benchmarks
4. Document performance characteristics

**Required tests**:
- Prebuilt binaries work on target platforms
- Performance benchmarks pass
- No regression in correctness

**Non-goals**:
- GPU acceleration
- Distributed simulation

**Risks**:
- Prebuilt binaries increase package size
- Need to maintain compatibility across platforms

## Clear Boundaries

### What Andy Engine provides
- Persistent world runtime
- Psychology-driven character simulation
- Domain-agnostic architecture
- Seeded RNG baseline

### What Andy Engine does NOT provide
- Bobby / Andy Town / UI (upper-layer application)
- LLM-created facts without validation
- Full deterministic replay (only seeded baseline)
- Production stability (experimental features may change)

### Core principles
- Engine owns state, LLM owns wording
- No LLM-created facts without validation
- Domain-agnostic core with domain-specific presets
- Backward compatibility within major versions

## Non-Goals (All Phases)

- Implementing Bobby product logic
- Implementing Andy Town UI
- Adding game/romance/companion features
- Adding robot/hardware integration
- Publishing to npm without explicit approval
- Changing Stable World Envelope without migration

## Risks (All Phases)

### Technical risks
- Performance may degrade with complex features
- Memory usage may increase significantly
- Backward compatibility may be difficult to maintain

### Process risks
- Features may be implemented out of order
- Testing may be insufficient
- Documentation may lag behind implementation

### Market risks
- Users may not need all features
- Competition may change requirements
- LLM technology may evolve significantly

## Success Criteria

### v2.1
- All planned features implemented and tested
- No regression in existing functionality
- Documentation complete
- Performance within acceptable bounds

### v3
- Characters feel "alive" over long periods
- Multi-domain evaluation shows consistent quality
- Performance scales to 100k+ agents
- Commercial applications can build on the engine
