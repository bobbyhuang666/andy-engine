/**
 * AndyEngine — Root type declarations
 *
 * Describes the CommonJS export of `require('andy-engine')`.
 */

interface AndyEngineConfig {
  startTime?: Date;
  weather?: string;
  seed?: number | string;
  spatial?: 'continuous';
  enableFacts?: boolean;
  actionSelection?: {
    enabled?: boolean;
    mode?: 'shadow' | 'event' | 'dryRunEffects' | 'active';
  };
  tickMinutes?: number;
  [key: string]: any;
}

interface AgentConfig {
  id: string;
  name: string;
  personality?: {
    mbti?: string;
    ocean?: Record<string, number>;
  };
  state?: string;
  position?: string;
  [key: string]: any;
}

interface TickResult {
  time: string;
  tickNumber: number;
  phase: Record<string, any>;
  [key: string]: any;
}

interface WorldContext {
  agentId: string;
  time: string;
  weather: string;
  timeOfDay: string;
  season: string;
  region: string;
  nearbyPeople: Array<{ id: string; name: string; state: string }>;
  recentEvents: Array<{ type: string; content: string; time: string }>;
  [key: string]: any;
}

interface DomainConfig {
  id: string;
  name: string;
  states: Record<string, any>;
  regions: string[];
  adjacency: Array<[string, string, number?]>;
  [key: string]: any;
}

interface GroundingPackage {
  agentId: string;
  allowedFacts: string[];
  forbiddenFacts: string[];
  inferredFacts: string[];
  memorySummary: string;
  [key: string]: any;
}

interface ConsistencyCheckResult {
  consistent: boolean;
  violations: Array<{ type: string; detail: string }>;
  [key: string]: any;
}

declare class AndyEngine {
  constructor(config?: AndyEngineConfig);

  createCharacter(config: AgentConfig): object;
  addAgent(config: AgentConfig): object;
  addAgents(configs: AgentConfig[]): object[];
  getAgent(agentId: string): object | undefined;
  getAllAgents(): Map<string, object>;
  getNarrative(agentId: string, options?: object): object;
  getWorldContext(agentId: string): WorldContext;
  getGroundingPackage(agentId: string, options?: object): GroundingPackage;
  checkConsistency(llmOutput: string, agentId: string): ConsistencyCheckResult;
  tick(): TickResult;
  runTicks(count: number): TickResult[];
  advanceTo(targetTime: Date, maxTicks?: number): TickResult[];
  snapshot(): object;
  getStats(): object;
  onTick(callback: (tickResult: TickResult) => void): void;
  setWeather(weather: string): void;
  getSocialGraph(): object;
  toJSON(): object;

  static fromJSON(data: object, config?: AndyEngineConfig): AndyEngine;
}

export = AndyEngine;
