/**
 * @andy-engine/facts — Type declarations
 *
 * Describes the CommonJS export of require('andy-engine/facts').
 */

type FactType = 'static_env' | 'agent_state' | 'relationship' | 'event' | 'observation' | 'memory' | 'rule' | 'location_meaning' | 'invalidated';
type FactSource = 'engine' | 'observation' | 'inference';
type FactScope = 'public' | 'local';

interface WorldFact {
  id: string;
  type: FactType;
  timestamp: Date | number;
  source: FactSource;
  confidence: number;
  scope: FactScope;
  participants: string[];
  observers: string[];
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
  severity: 'pass' | 'reject' | 'rewrite' | 'degrade_to_template';
  suggestion: string | null;
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

declare class WorldFactStore {
  constructor();
  addFact(fact: WorldFact): void;
  getFact(id: string): WorldFact | undefined;
  getFactsByType(type: FactType): WorldFact[];
  getFactsByAgent(agentId: string): WorldFact[];
  getPublicFacts(): WorldFact[];
  removeFact(id: string): boolean;
  factCount: number;
}

declare class FactEmitter {
  emitStaticFacts(domain: any): WorldFact[];
  emitAgentStateFacts(agent: any): WorldFact[];
  emitRelationshipFacts(socialGraph: any): WorldFact[];
  emitEventFacts(event: any): WorldFact[];
  emitObservationFacts(observer: string, event: any): WorldFact[];
}

declare class FactProvider {
  constructor(worldFactStore: WorldFactStore, knowledgeStore: any);
  getGroundingPackage(agentId: string, options?: object): GroundingPackage | null;
}

declare class FactConsistencyChecker {
  constructor(worldFactStore: WorldFactStore, domain?: any);
  check(llmOutput: string, agentId: string): ConsistencyCheckResult;
}

declare class FactFormatter {
  formatFacts(facts: WorldFact[], options?: { maxLength?: number }): string;
}

declare class KnowledgeStore {
  constructor();
  addKnowledge(agentId: string, factId: string, evidence: { type: string; source: string }): void;
  getKnowledge(agentId: string): Array<{ factId: string; evidence: Array<{ type: string; source: string }> }>;
  knowsAbout(agentId: string, factId: string): boolean;
}

declare class CanonEventPipeline {
  constructor(worldFactStore: WorldFactStore, knowledgeStore: KnowledgeStore);
  processEvent(event: any): { factsCreated: number; knowledgeUpdates: number };
}

// Fact enums
declare const FactType: Record<string, FactType>;
declare const FACT_TYPES: Record<string, FactType>;
declare const FactSource: Record<string, FactSource>;
declare const FACT_SOURCES: Record<string, FactSource>;
declare const FactScope: Record<string, FactScope>;
declare const FACT_SCOPES: Record<string, FactScope>;

// Validation functions
declare function validateFact(fact: Partial<WorldFact>): { valid: boolean; errors: string[] };
declare function validateTypeFields(type: FactType, fact: Partial<WorldFact>): { valid: boolean; errors: string[] };

// Factory functions
declare function createBaseFact(params: Partial<WorldFact>): WorldFact;
declare function createStaticEnvFact(params: Partial<WorldFact>): WorldFact;
declare function createAgentStateFact(params: Partial<WorldFact>): WorldFact;
declare function createRelationshipFact(params: Partial<WorldFact>): WorldFact;
declare function createEventFact(params: Partial<WorldFact>): WorldFact;
declare function createObservationFact(params: Partial<WorldFact>): WorldFact;
declare function createMemoryFact(params: Partial<WorldFact>): WorldFact;
declare function createRuleFact(params: Partial<WorldFact>): WorldFact;
declare function createLocationMeaningFact(params: Partial<WorldFact>): WorldFact;
declare function createInvalidatedFact(params: Partial<WorldFact>): WorldFact;

export = {
  FactType,
  FACT_TYPES,
  FactSource,
  FACT_SOURCES,
  FactScope,
  FACT_SCOPES,
  validateFact,
  validateTypeFields,
  createBaseFact,
  createStaticEnvFact,
  createAgentStateFact,
  createRelationshipFact,
  createEventFact,
  createObservationFact,
  createMemoryFact,
  createRuleFact,
  createLocationMeaningFact,
  createInvalidatedFact,
  WorldFactStore,
  FactEmitter,
  FactFormatter,
  FactProvider,
  FactConsistencyChecker,
  KnowledgeStore,
  CanonEventPipeline,
};
