# AffectCompiler Contract

## Overview

AffectCompiler converts internal psychological state into structured expression constraints (AffectFrame).

**Status**: Basic implementation (v0.2)

## Architecture

```
EmotionVector / Needs / BehaviorField / SocialGraph / Memory
        ↓
AffectCompiler.compile()
        ↓
AffectFrame (expression constraints)
        ↓
Narrative / LLM (wording only)
```

## Core Principles

1. **Engine owns state**: AffectCompiler reads from internal subsystems
2. **Engine owns affect policy**: Expression constraints are computed, not inferred
3. **LLM owns wording only**: LLM receives constraints, not raw psychology
4. **No raw emotion leak**: 30D emotion vector does not enter LLM prompt

## AffectFrame Fields

| Field | Type | Range | Description |
|-------|------|-------|-------------|
| version | string | - | Schema version |
| valenceBand | string | negative/neutral/positive | Emotional valence band |
| arousalBand | string | low/medium/high | Arousal level band |
| interpersonalPosture | string | open/guarded/attached/avoidant/guarded_closeness | Interpersonal stance |
| warmth | number | [0,1] | Warmth level |
| directness | number | [0,1] | Directness level |
| initiative | number | [0,1] | Initiative level |
| defensiveness | number | [0,1] | Defensiveness level |
| emotionalExplicitness | number | [0,1] | Emotional explicitness |
| stability | number | [0,1] | Emotional stability |
| visibleMicroBehaviors | string[] | - | Observable micro behaviors |
| forbiddenExpressionModes | string[] | - | Forbidden expression modes |
| sourceSignals | object | - | Debug trace (not for LLM) |

## Usage

```javascript
const { compile } = require('andy-engine/src/agent/psychology/AffectCompiler');

const affectFrame = compile({
  emotion: agent.emotion,
  needs: agent.needs,
  behaviorField: agent.behaviorField,
  socialGraph: agent.socialGraph,
  memory: agent.memory,
});
```

## Integration Points

- **AgentNarrative.js**: Compiles AffectFrame from agent state
- **NarrativeBuilder.js**: Uses AffectFrame for expression constraints
- **AndyEngineHelpers.js**: Passes AffectFrame to worldContext
- **getGroundingPackage()**: Returns AffectFrame in grounding package

## Non-Goals

- ❌ Full commercial AffectCompiler
- ❌ LLM determining psychology
- ❌ Modifying EmotionVector internals
- ❌ Natural language emotion summary

## Version History

- v0.1-seam: Basic AffectFrame (shape only)
- v0.2-basic: AffectCompiler with expression constraints
