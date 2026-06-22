/**
 * UtilityScorer — pure, read-only action candidate scorer
 *
 * Scores candidates across 12 dimensions:
 *   need, emotion, behavior, memory, relationship, habit, goal,
 *   location, world, time, constraint, tendency
 *
 * Design invariants:
 *   - Pure function: no side effects, no state modification
 *   - No Math.random(), no Date.now()
 *   - No domain-specific terms
 *   - Reads only from context snapshots
 */

/**
 * @typedef {Object} ScoringContext
 * @property {Object} agent - agent state snapshot
 * @property {Object} world - world state snapshot
 * @property {Object} behaviorField - BehaviorField snapshot
 * @property {Object} needs - needs snapshot
 * @property {Object} emotion - emotion snapshot
 * @property {Object[]} memories - memories snapshot
 * @property {Object[]} relationships - relationships snapshot
 * @property {Object} goals - goals snapshot
 * @property {Object} worldPressure - world pressure snapshot (legacy)
 * @property {Object} [pressureContext] - PressureContext instance (preferred)
 * @property {Object} [futureTendency] - FutureTendencyTracker instance
 * @property {Object} [locationMeaning] - LocationMeaningInfluence instance
 */

function scoreCandidate(candidate, context) {
  const breakdown = {
    need: 0,
    emotion: 0,
    behavior: 0,
    memory: 0,
    relationship: 0,
    habit: 0,
    goal: 0,
    location: 0,
    world: 0,
    time: 0,
    constraint: 0,
    tendency: 0,
    total: 0,
  };

  breakdown.need = scoreNeed(candidate, context);
  breakdown.emotion = scoreEmotion(candidate, context);
  breakdown.behavior = scoreBehavior(candidate, context);
  breakdown.memory = scoreMemory(candidate, context);
  breakdown.relationship = scoreRelationship(candidate, context);
  breakdown.habit = scoreHabit(candidate, context);
  breakdown.goal = scoreGoal(candidate, context);
  breakdown.location = scoreLocation(candidate, context);
  breakdown.world = scoreWorld(candidate, context);
  breakdown.time = scoreTime(candidate, context);
  breakdown.constraint = scoreConstraint(candidate, context);
  breakdown.tendency = scoreTendency(candidate, context);

  breakdown.total = breakdown.need + breakdown.emotion + breakdown.behavior +
    breakdown.memory + breakdown.relationship + breakdown.habit +
    breakdown.goal + breakdown.location + breakdown.world +
    breakdown.time + breakdown.constraint + breakdown.tendency;

  return breakdown;
}

function scoreCandidates(candidates, context) {
  return candidates.map(candidate => ({
    candidate,
    score: scoreCandidate(candidate, context),
  }));
}

// ═══════════════════════════════════════════
// Dimension scorers (pure, read-only)
// ═══════════════════════════════════════════

function scoreNeed(candidate, context) {
  if (context.pressureContext && context.pressureContext.needs) {
    const needMap = {
      'consume': 'hunger',
      'rest': 'energy',
      'socialize': 'social',
      'explore': 'stimulation',
    };
    const needKey = needMap[candidate.type];
    if (!needKey) return 0;
    const pressure = context.pressureContext.needs[needKey];
    if (pressure === undefined) return 0;
    return Math.max(0, Math.min(1, pressure));
  }

  if (!context.needs) return 0;

  const needMap = {
    'consume': 'hunger',
    'rest': 'energy',
    'socialize': 'social',
    'explore': 'stimulation',
  };

  const needKey = needMap[candidate.type];
  if (!needKey) return 0;

  const current = context.needs[needKey];
  if (current === undefined) return 0;

  return Math.max(0, 1 - current);
}

function scoreEmotion(candidate, context) {
  if (!context.emotion) return 0;

  const valence = context.emotion.valence || 0;
  const arousal = context.emotion.arousal || 0;

  if (candidate.type === 'rest' && valence < -0.1) return Math.abs(valence);
  if (candidate.type === 'explore' && valence > 0.1) return valence;
  if (candidate.type === 'socialize' && arousal > 0.3) return arousal * 0.5;

  return 0;
}

function scoreBehavior(candidate, context) {
  if (!context.behaviorField) return 0;

  const B = context.behaviorField.B;
  if (!B || B.length < 4) return 0;

  const [activity, sociality, focus, expressiveness] = B;

  const idealMap = {
    'rest':       { activity: 0.1, sociality: 0.2, focus: 0.1, expressiveness: 0.2 },
    'work':       { activity: 0.8, sociality: 0.3, focus: 0.8, expressiveness: 0.3 },
    'socialize':  { activity: 0.5, sociality: 0.8, focus: 0.3, expressiveness: 0.8 },
    'explore':    { activity: 0.7, sociality: 0.4, focus: 0.4, expressiveness: 0.6 },
    'continue':   { activity, sociality, focus, expressiveness },
    'move':       { activity: 0.6, sociality: 0.3, focus: 0.3, expressiveness: 0.3 },
    'consume':    { activity: 0.3, sociality: 0.4, focus: 0.2, expressiveness: 0.4 },
    'observe':    { activity: 0.2, sociality: 0.2, focus: 0.6, expressiveness: 0.2 },
    'reflect':    { activity: 0.1, sociality: 0.1, focus: 0.7, expressiveness: 0.1 },
  };

  const ideal = idealMap[candidate.type];
  if (!ideal) return 0;

  const dist = Math.sqrt(
    (activity - ideal.activity) ** 2 +
    (sociality - ideal.sociality) ** 2 +
    (focus - ideal.focus) ** 2 +
    (expressiveness - ideal.expressiveness) ** 2
  );

  return Math.max(0, 1 - dist / 2);
}

function scoreMemory(candidate, context) {
  if (context.pressureContext && context.pressureContext.memory) {
    const memPressure = context.pressureContext.memory;
    return Math.max(-0.5, Math.min(0.5, (memPressure.positive - memPressure.negative) * 0.3));
  }

  if (!context.memories || context.memories.length === 0) return 0;

  let totalScore = 0;

  for (const mem of context.memories) {
    if (!mem) continue;

    const relevance = computeMemoryRelevance(mem, candidate);
    if (relevance <= 0) continue;

    const importance = typeof mem.importance === 'number' ? mem.importance : 0.5;
    const activation = typeof mem.activation === 'number' ? mem.activation : 0.5;
    const valence = typeof mem.valence === 'number' ? mem.valence : 0;

    const direction = valence >= 0 ? 1 : -1;
    const magnitude = importance * activation * relevance;

    totalScore += direction * magnitude;
  }

  return Math.max(-0.5, Math.min(0.5, totalScore));
}

function computeMemoryRelevance(mem, candidate) {
  if (mem.actionType && mem.actionType === candidate.type) return 1;
  if (mem.target && candidate.target && mem.target === candidate.target) return 0.8;

  if (Array.isArray(mem.associations)) {
    if (mem.associations.includes(candidate.type) || mem.associations.includes(candidate.target)) {
      return 0.6;
    }
  }

  if (Array.isArray(mem.tags)) {
    if (mem.tags.includes(candidate.type) || mem.tags.includes(candidate.target)) {
      return 0.6;
    }
  }

  if (mem.semanticCategory && candidate.metadata?.semanticCategory &&
      mem.semanticCategory === candidate.metadata.semanticCategory) {
    return 0.4;
  }

  return 0;
}

function scoreRelationship(candidate, context) {
  if (context.pressureContext && context.pressureContext.relationship) {
    const relPressure = context.pressureContext.relationship;
    if (candidate.type === 'socialize') {
      return relPressure.isolation * 0.4 - relPressure.conflict * 0.3;
    }
    return -relPressure.total * 0.1;
  }

  return 0;
}

const CANDIDATE_TYPE_VECTORS = {
  continue: [0, 0, 0, 0],
  rest:     [-0.5, -0.2, -0.1, -0.2],
  work:     [0.5, 0, 0.6, 0],
  socialize: [0, 0.6, 0, 0.5],
  explore:  [0.4, 0, 0.3, 0],
  move:     [0.3, 0, 0, 0],
  observe:  [0, 0, 0.4, 0],
  reflect:  [-0.2, 0, 0.5, -0.1],
  consume:  [0, 0.2, 0, 0.2],
};

const QUIET_TYPES = new Set(['rest', 'observe', 'reflect']);
const ACTIVE_TYPES = new Set(['work', 'explore', 'move']);

function scoreHabit(candidate, context) {
  return 0;
}

function scoreGoal(candidate, context) {
  if (!context.goals) return 0;

  const goals = Array.isArray(context.goals) ? context.goals : context.goals.active;
  if (!goals || goals.length === 0) return 0;

  let totalScore = 0;

  for (const goal of goals) {
    if (!goal || goal.status !== 'active') continue;

    const relevance = computeGoalRelevance(goal, candidate);
    if (relevance <= 0) continue;

    const priority = typeof goal.priority === 'number' ? goal.priority : 0.5;
    const weight = typeof goal.weight === 'number' ? goal.weight : 1.0;

    totalScore += priority * weight * relevance;
  }

  return Math.max(-0.5, Math.min(0.5, totalScore));
}

function computeGoalRelevance(goal, candidate) {
  if (goal.actionType && goal.actionType === candidate.type) return 1;
  if (goal.target && candidate.target && goal.target === candidate.target) return 0.8;

  if (goal.metadata?.semanticCategory && candidate.metadata?.semanticCategory &&
      goal.metadata.semanticCategory === candidate.metadata.semanticCategory) {
    return 0.6;
  }

  return 0;
}

function scoreTendency(candidate, context) {
  if (!context.futureTendency || !context.agent || !context.agent.position) return 0;

  const tendency = context.futureTendency.getTendencyGradient(context.agent.position);
  if (!tendency || tendency.every(d => d === 0)) return 0;

  const typeVector = CANDIDATE_TYPE_VECTORS[candidate.type];
  if (!typeVector) return 0;

  let alignment = 0;
  for (let d = 0; d < 4; d++) {
    alignment += tendency[d] * typeVector[d];
  }

  return Math.max(-0.3, Math.min(0.3, alignment * 0.5));
}

function scoreLocation(candidate, context) {
  if (!context.agent) return 0;

  let score = 0;

  if (candidate.target && candidate.target === context.agent.position) {
    score += 0.1;
  } else if (candidate.target) {
    score += 0.5;
  }

  if (context.locationMeaning && candidate.target) {
    const meaningGradient = context.locationMeaning.computeGradient(
      candidate.target,
      context.behaviorField ? context.behaviorField.B : [0.5, 0.5, 0.5, 0.5]
    );
    if (meaningGradient && meaningGradient.some(d => d !== 0)) {
      const typeVector = CANDIDATE_TYPE_VECTORS[candidate.type];
      if (typeVector) {
        let alignment = 0;
        for (let d = 0; d < 4; d++) {
          alignment += meaningGradient[d] * typeVector[d];
        }
        score += Math.max(-0.3, Math.min(0.3, alignment * 0.3));
      }
    }
  }

  if (context.pressureContext && context.pressureContext.location) {
    const locPressure = context.pressureContext.location.total || 0;
    if (candidate.type === 'move') {
      score += locPressure * 0.3;
    } else if (candidate.type === 'rest') {
      score -= locPressure * 0.1;
    }
  }

  return Math.max(-0.5, Math.min(0.5, score));
}

function scoreWorld(candidate, context) {
  let pressure = 0;
  if (context.pressureContext && context.pressureContext.world) {
    pressure = context.pressureContext.world.total || 0;
  } else if (context.worldPressure) {
    pressure = context.worldPressure.total || 0;
  }

  if (pressure === 0) return 0;

  const quietTypes = QUIET_TYPES;
  const activeTypes = ACTIVE_TYPES;

  let score = 0;
  if (quietTypes.has(candidate.type)) {
    score = pressure * 0.3;
  } else if (activeTypes.has(candidate.type)) {
    score = -pressure * 0.2;
  }

  return Math.max(-0.5, Math.min(0.5, score));
}

function scoreTime(candidate, context) {
  if (!context.world) return 0;

  const hour = context.world.time ? new Date(context.world.time).getUTCHours() : 12;

  if (hour >= 23 || hour < 6) {
    if (candidate.type === 'rest') return 0.8;
    if (candidate.type === 'work') return -0.3;
  }

  if (hour >= 9 && hour < 18) {
    if (candidate.type === 'work') return 0.5;
    if (candidate.type === 'explore') return 0.3;
  }

  return 0;
}

function scoreConstraint(candidate, context) {
  if (candidate.constraints) {
    if (candidate.constraints.timeRange && context.world) {
      const hour = new Date(context.world.time).getUTCHours();
      const [min, max] = candidate.constraints.timeRange;
      if (hour < min || hour >= max) return -1;
    }
  }

  return 0;
}

module.exports = {
  scoreCandidate,
  scoreCandidates,
};
