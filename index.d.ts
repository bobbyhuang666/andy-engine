/**
 * AndyEngine — Root type declarations
 *
 * Describes the CommonJS export of `require('andy-engine')`.
 */

interface AndyEngineConfig {
  startTime?: Date;
  weather?: string;
  domain?: DomainConfig;
  seed?: number | string;
  rng?: object;
  enableFacts?: boolean;
  spatial?: 'continuous';
  tickMinutes?: number;
  actionSelection?: {
    enabled?: boolean;
    mode?: 'shadow' | 'event' | 'dryRunEffects' | 'active';
    temperature?: number;
    providers?: Record<string, { enabled?: boolean; weight?: number }>;
  };
  [key: string]: any;
}

interface AgentConfig {
  id: string;
  name: string;
  mbti?: string;
  personality?: {
    mbti?: string;
    ocean?: {
      openness?: number;
      conscientiousness?: number;
      extraversion?: number;
      agreeableness?: number;
      neuroticism?: number;
    };
    [key: string]: any;
  };
  background?: string[];
  seedMemories?: Array<{
    content: string;
    importance?: number;
    emotionTag?: string;
    category?: string;
  }>;
  schedule?: string | object;
  initialPosition?: string;
  initialState?: string;
  state?: string;
  position?: string;
  [key: string]: any;
}

interface TickResult {
  time: string;
  tickNumber: number;
  phase: {
    timeAdvance: { minutesElapsed: number; newTime: string };
    environmentSync: { weather: string; timeOfDay: string; season: string };
    agentThink: { agentCount: number; results: Record<string, any> };
    interaction: { eventCount: number };
    eventDispatch: { eventCount: number };
    canonEventPipeline?: { processed: number; knowledgeUpdates: number; memoryUpdates: number; locationMeaningUpdates: number };
    encounterEffects?: { applied: number };
    factEmission?: Record<string, any>;
  };
  durationMs: number;
  [key: string]: any;
}

interface WorldContext {
  time: string;
  hour: number;
  dayOfWeek: number;
  weather: string;
  timeOfDay: string;
  season: string;
  currentRegion: string;
  personalityAnchor: string;
  agentStatus: object;
  recentEvents: string;
  lastAppraisal: string;
  nearbyPeople: string;
  emotionState: string;
  needsState: string;
  emotionRegulation: string;
  memoryContext: string;
  health: number;
  [key: string]: any;
}

interface DomainConfig {
  id: string;
  name: string;
  description?: string;
  states: Record<string, any>;
  stateCenters?: Record<string, number[]>;
  regions: string[];
  adjacency: Array<[string, string, number?]>;
  eventTemplates?: Record<string, any>;
  narrativeTemplates?: Record<string, any>;
  needSatisfactionMap?: Record<string, any>;
  needRegionConfig?: Record<string, any>;
  roleArchetypes?: Record<string, any>;
  forbiddenTerms?: string[];
  fallback?: {
    defaultRegion?: string;
    defaultState?: string;
    [key: string]: any;
  };
  [key: string]: any;
}

interface WorldFact {
  id: string;
  type: 'static_env' | 'agent_state' | 'relationship' | 'event' | 'observation' | 'memory' | 'rule' | 'location_meaning' | 'invalidated';
  timestamp: Date | number;
  source: 'engine' | 'observation' | 'inference';
  confidence: number;
  scope: 'public' | 'local' | 'internal';
  participants: string[];
  observers: string[];
  [key: string]: any;
}

interface CanonEvent {
  id: string;
  type: string;
  timestamp: Date | number;
  participants: string[];
  observers?: string[];
  eventId?: string;
  description?: string;
  location?: string;
  [key: string]: any;
}

interface GroundingPackage {
  allowedFacts: WorldFact[];
  inferredFacts: WorldFact[];
  forbiddenFacts: WorldFact[];
  metadata: {
    agentId: string;
    currentTime: Date | null;
    factCount: {
      allowed: number;
      inferred: number;
      forbidden: number;
    };
  };
  locationMeaning?: string;
  behaviorTendency?: string;
  [key: string]: any;
}

interface ConsistencyViolation {
  type: 'unknown_character' | 'unknown_location' | 'unknown_event' | 'time_conflict' | 'new_relationship' | 'new_event' | 'unsupported_claim' | 'agent_state_leak' | 'local_scope_leak' | 'missing_source_attribution';
  message: string;
  name?: string;
  location?: string;
  event?: string;
  agent?: string;
  [key: string]: any;
}

interface ConsistencyCheckResult {
  valid: boolean;
  violations: ConsistencyViolation[];
  severity: 'pass' | 'reject' | 'rewrite' | 'degrade_to_template' | 'warning';
  suggestion: string | null;
  /** v3 sidecar: evidence trace for each claim (source/support/reason) */
  evidenceTrace?: EvidenceTraceEntry[];
  /** v3 sidecar: coreference resolution notes */
  coreferenceNotes?: CoreferenceNote[];
  /** v3 sidecar: semantic verifier decisions */
  verifierDecisions?: VerifierDecision[];
  /** checker implementation version (compat) */
  checkerVersion?: 'v2-structured';
  /** v3 semantic alpha grounding version (additive) */
  groundingVersion?: 'v3-semantic-alpha';
  [key: string]: any;
}

/** v3 sidecar entry: per-claim evidence binding */
interface EvidenceTraceEntry {
  claim: string;
  source: string;
  support: string;
  reason: string;
  [key: string]: any;
}

/** v3 sidecar entry: coreference resolution note */
interface CoreferenceNote {
  pronoun: string;
  resolvedTo: string;
  confidence: number;
  [key: string]: any;
}

/** v3 sidecar entry: verifier decision */
interface VerifierDecision {
  claim: string;
  verdict: string;
  reason: string;
  [key: string]: any;
}

/** v3 sidecar options passed to checkConsistency / FactConsistencyChecker.check */
interface ConsistencyCheckOptions {
  /** structured claim sidecar for v3 evidence-bound path */
  structuredClaims?: object;
  /** location alias map (alias → canonical) for diagnostic trace */
  locationAliases?: Record<string, string[]>;
  /** optional semantic verifier adapter */
  verifier?: object;
  /** strictness level */
  strictness?: 'normal' | 'strict' | 'semantic_review';
}

interface AgentSnapshot {
  id: string;
  name: string;
  position: string;
  state: string;
  personality: object;
  emotion: object;
  needs: object;
  behavior: {
    B: [number, number, number, number];
    label: string;
    speed: number;
  };
  memory: object;
  schedule: object;
  [key: string]: any;
}

// ═══════════════════════════════════════════
// Action / Effect types (beta.1)
// ═══════════════════════════════════════════

interface ActionCandidate {
  type: string;
  target?: string;
  source?: string;
  label?: string;
  score?: number;
  [key: string]: any;
}

/**
 * Full audit trail of an action selection decision.
 * Pure data, no live references.
 */
interface ReasonTrace {
  agentId: string;
  candidate: ActionCandidate | null;
  scoreBreakdown: Record<string, number>;
  keyReasons: string[];
  pressureContext: Record<string, any> | null;
  rngInfo: {
    rngStateBefore: number | null;
    randomDraw: number | null;
    rngStateAfter: number | null;
  };
  temperature: number;
  candidateAlternatives: ActionCandidate[];
  stateDeltas: Record<string, any> | null;
  readonly selectedAction: string | null;
  readonly selectedCandidate: ActionCandidate | null;
  readonly rngStateBefore: number | null;
  readonly randomDraw: number | null;
  readonly rngStateAfter: number | null;
  toJSON(): Record<string, any>;
}

/**
 * Wraps a chosen ActionCandidate with selection metadata.
 * Immutable after construction.
 */
interface SelectedAction {
  candidate: ActionCandidate;
  score: Record<string, number>;
  temperature: number;
  alternatives: ActionCandidate[];
  reasonTrace: ReasonTrace;
  readonly type: string;
  readonly target: string | undefined;
  readonly source: string | undefined;
  readonly label: string | undefined;
  toJSON(): Record<string, any>;
}

interface StateDelta {
  type: 'need' | 'emotion' | 'memory' | 'relationship' | 'locationMeaning' | 'futureTendency' | 'position';
  target?: string;
  agentId?: string;
  timestamp?: number | Date;
  [key: string]: any;
  toJSON(): object;
}

/**
 * Typed container for effect pipeline output.
 */
interface EffectResult {
  event: Record<string, any>;
  deltas: StateDelta[];
  reasonTrace: Record<string, any>;
  readonly hasChanges: boolean;
  readonly memoryDeltas: StateDelta[];
  readonly relationshipDeltas: StateDelta[];
  readonly needDeltas: StateDelta[];
  readonly emotionDeltas: StateDelta[];
  readonly locationMeaningDeltas: StateDelta[];
  readonly futureTendencyDeltas: StateDelta[];
  toLegacyFormat(): { event: Record<string, any>; stateDeltas: Record<string, any>; updatedReasonTrace: Record<string, any> };
}

declare class EffectCommitter {
  constructor(options: { world?: any; agents?: Map<string, any> });
  commit(result: EffectResult): { applied: any[]; skipped: any[]; errors: any[] };
}

declare class NeedDelta {
  type: string;
  target: string;
  agentId: string;
  changes: Record<string, number>;
  constructor(agentId: string, changes: Record<string, number>);
  toJSON(): object;
}

declare class EmotionDelta {
  type: string;
  target: string;
  agentId: string;
  changes: Record<string, number>;
  multiplier: number;
  appraisalModifiers: object | null;
  stress: number | null;
  constructor(agentId: string, changes: Record<string, number>, options?: { multiplier?: number; appraisalModifiers?: object; stress?: number });
  toJSON(): object;
}

declare class MemoryDelta {
  type: string;
  target: string;
  agentId: string;
  kind: string;
  memoryType: string;
  target_: string | null;
  content: string;
  constructor(agentId: string, payload: { kind?: string; type?: string; target?: string | null; content?: string; event?: object; category?: string; importance?: number; emotionTag?: string; bias?: object });
  toJSON(): object;
}

declare class RelationshipDelta {
  type: string;
  target: string;
  agentId: string;
  targetAgentId: string;
  interactionType: string;
  valence: number;
  content: string;
  constructor(agentId: string, payload: { targetAgentId: string; interactionType?: string; valence?: number; content?: string });
  toJSON(): object;
}

declare class LocationMeaningDelta {
  type: string;
  target: string;
  agentId: string | null;
  location: string;
  meaningType: string;
  weight: number;
  reason: string;
  from: string | null;
  to: string | null;
  constructor(agentId: string | null, payload: { location: string; meaningType: string; weight?: number; reason?: string; from?: string | null; to?: string | null });
  toJSON(): object;
}

declare class FutureTendencyDelta {
  type: string;
  target: string;
  agentId: string;
  location: string;
  delta: number[];
  importance: number;
  constructor(agentId: string, payload: { location: string; delta?: number[]; importance?: number });
  toJSON(): object;
}

declare class PositionDelta {
  type: string;
  target: string;
  agentId: string;
  to: string;
  from: string | null;
  reason: string;
  constructor(agentId: string, payload: { to: string; from?: string; reason?: string });
  toJSON(): object;
}

/**
 * @experimental Structured affect snapshot.
 * Derived from agent psychology subsystems (EmotionVector, NeedsSystem, BehaviorField).
 * Shape may change in future versions as AffectCompiler evolves.
 */
interface AffectFrame {
  emotions: Array<{ dimension: string; intensity: number }>;
  valence: number;
  arousal: number;
  needs: Array<{ need: string; urgency: number }>;
  behavior: { activity: number; sociality: number; focus: number; expressiveness: number };
  behaviorSpeed: number;
  stability: number;
  _meta: { version: string };
  [key: string]: any;
}

interface WorldSnapshot {
  time: string;
  tickCount: number;
  environment: {
    weather: string;
    weatherChangedAt: Date;
    timeOfDay: string;
    season: string;
  };
  agents: Record<string, AgentSnapshot>;
  regions: object;
  socialGraph: object;
  recentEvents: object[];
  [key: string]: any;
}

declare class AndyEngine {
  constructor(config?: AndyEngineConfig, savedState?: object | null);

  createCharacter(config: AgentConfig): object;
  addAgent(config: AgentConfig): object;
  addAgents(configs: AgentConfig[]): object[];
  getAgent(agentId: string): object | undefined;
  getAllAgents(): AgentSnapshot[];
  getNarrative(agentId: string, options?: { userText?: string; relationship?: number }): string;
  getWorldContext(agentId: string): WorldContext | null;
  getGroundingPackage(agentId: string, options?: object): GroundingPackage | null;
  checkConsistency(llmOutput: string, agentId: string, options?: ConsistencyCheckOptions): ConsistencyCheckResult;
  tick(): TickResult;
  runTicks(count: number): TickResult[];
  advanceTo(targetTime: Date, maxTicks?: number): TickResult[] & { _completed: boolean; _ticksUsed: number };
  snapshot(): WorldSnapshot;
  getStats(): object;
  onTick(callback: (tickResult: TickResult) => void): void;
  setWeather(weather: string): void;
  getSocialGraph(): object;
  toJSON(): object;

  static fromJSON(data: object, config?: AndyEngineConfig): AndyEngine;
}

export = AndyEngine;
