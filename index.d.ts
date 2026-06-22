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
  scope: 'public' | 'local';
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
  type: 'unknown_character' | 'unknown_location' | 'unknown_event' | 'time_conflict' | 'new_relationship' | 'new_event' | 'unsupported_claim';
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
  severity: 'pass' | 'reject' | 'rewrite' | 'degrade_to_template';
  suggestion: string | null;
  [key: string]: any;
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
  checkConsistency(llmOutput: string, agentId: string): ConsistencyCheckResult;
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
