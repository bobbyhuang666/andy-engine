# Need Target Contract Audit

## Summary

Two target systems exist:
- `NeedsSystem.NEED_GRADIENT_TARGETS` — gradient targets for need deprivation
- `BehaviorField.NEED_TARGETS` — optimal behavior positions for need satisfaction

## Analysis

### NeedsSystem.NEED_GRADIENT_TARGETS

```javascript
const NEED_GRADIENT_TARGETS = {
  hunger:      [0.35, 0.45, 0.20, 0.40],
  energy:      [0.08, 0.04, 0.05, 0.03],
  social:      [0.35, 0.85, 0.25, 0.80],
  comfort:     [0.15, 0.15, 0.20, 0.12],
  stimulation: [0.45, 0.35, 0.40, 0.40],
};
```

**Usage**: `NeedsSystem._computeNeedGradient()` at line 291
**Purpose**: When a need is depleted, this target defines where the behavior field should move toward

### BehaviorField.NEED_TARGETS

```javascript
const NEED_TARGETS = {
  hunger:      [0.35, 0.55, 0.08, 0.45],  // 吃饭：中活跃, 中高社交(餐厅有人), 极低专注, 中表达
  energy:      [0.08, 0.04, 0.02, 0.03],  // 休息：全面降低
  social:      [0.35, 0.85, 0.25, 0.80],  // 社交：高社交, 高表达
  comfort:     [0.15, 0.15, 0.20, 0.12],  // 舒适：低活跃, 安静
  stimulation: [0.45, 0.35, 0.40, 0.40],  // 刺激：中活跃, 寻求兴趣
};
```

**Usage**: `BehaviorField._computeNeedGradient()` at line 339
**Purpose**: When a need is active, this target defines the optimal behavior position

## Comparison

| Need | NeedsSystem | BehaviorField | Same? |
|------|-------------|---------------|-------|
| hunger | [0.35, 0.45, 0.20, 0.40] | [0.35, 0.55, 0.08, 0.45] | **No** |
| energy | [0.08, 0.04, 0.05, 0.03] | [0.08, 0.04, 0.02, 0.03] | **No** |
| social | [0.35, 0.85, 0.25, 0.80] | [0.35, 0.85, 0.25, 0.80] | **Yes** |
| comfort | [0.15, 0.15, 0.20, 0.12] | [0.15, 0.15, 0.20, 0.12] | **Yes** |
| stimulation | [0.45, 0.35, 0.40, 0.40] | [0.45, 0.35, 0.40, 0.40] | **Yes** |

## Conclusion

**Different concepts, same dimension space.**

- `NEED_GRADIENT_TARGETS` = where to move when need is **depleted** (gradient direction)
- `NEED_TARGETS` = where to be when need is **satisfied** (optimal position)

The differences are intentional:
- **hunger**: When depleted, move toward [0.35, 0.45, 0.20, 0.40]; when satisfied, be at [0.35, 0.55, 0.08, 0.45]
- **energy**: When depleted, move toward [0.08, 0.04, 0.05, 0.03]; when satisfied, be at [0.08, 0.04, 0.02, 0.03]

## Recommendation

**Do NOT unify.** These are different concepts.

**Rename for clarity:**

1. `NeedsSystem.NEED_GRADIENT_TARGETS` → `NeedsSystem.NEED_DEPRIVATION_GRADIENT_TARGETS`
2. `BehaviorField.NEED_TARGETS` → `BehaviorField.NEED_SATISFACTION_TARGETS`

**Add documentation:**

```javascript
/**
 * Need Deprivation Gradient Targets
 * 
 * When a need is depleted (e.g., hunger < 0.3), this target defines
 * the direction the behavior field should move toward.
 * 
 * Format: [activity, sociality, focus, expressiveness]
 */
const NEED_DEPRIVATION_GRADIENT_TARGETS = { ... };

/**
 * Need Satisfaction Targets
 * 
 * When a need is being satisfied (e.g., eating), this target defines
 * the optimal behavior position.
 * 
 * Format: [activity, sociality, focus, expressiveness]
 */
const NEED_SATISFACTION_TARGETS = { ... };
```

## Implementation Plan

1. Rename `NEED_GRADIENT_TARGETS` to `NEED_DEPRIVATION_GRADIENT_TARGETS` in NeedsSystem.js
2. Rename `NEED_TARGETS` to `NEED_SATISFACTION_TARGETS` in BehaviorField.js
3. Add JSDoc documentation to both
4. Update all references
5. Add tests to verify naming consistency
6. Update docs/current/NEED_TARGET_CONTRACT.md

## Risks

- Low risk: Renaming only, no behavior change
- Need to update all references to avoid breaking imports
