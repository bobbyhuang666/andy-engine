/**
 * @andy-engine/facts — Type declarations
 *
 * Describes the CommonJS export of require('andy-engine/facts').
 */

type FactType = 'static_env' | 'agent_state' | 'relationship' | 'event' | 'observation' | 'memory' | 'rule' | 'location_meaning' | 'invalidated';
type FactSource = 'engine' | 'observation' | 'inference';
type FactScope = 'public' | 'local' | 'internal';

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
  addFact(fact: WorldFact): WorldFact;
  addFacts(facts: WorldFact[]): WorldFact[];
  getFactById(id: string): WorldFact | null;
  getAllFacts(types?: string[]): WorldFact[];
  getActiveFacts(types?: string[]): WorldFact[];
  getFactsForAgent(agentId: string, options?: { types?: string[]; limit?: number }): WorldFact[];
  getFactsSince(timestamp: Date, types?: string[]): WorldFact[];
  getFactsByType(type: FactType): WorldFact[];
  getPublicFacts(): WorldFact[];
  getEventFacts(limit?: number, since?: Date): WorldFact[];
  updateFact(id: string, updates: Partial<WorldFact>): WorldFact;
  removeFact(id: string): boolean;
  invalidateFact(factId: string, reason: string, supersededBy?: string): WorldFact;
  getFactHistory(factId: string): object | null;
  updateLocationMeaning(location: string, meaning: { type: string; weight: number; reason?: string }): void;
  getLocationMeaning(location: string): WorldFact | null;
  getAllLocationMeanings(): WorldFact[];
  getStats(): object;
  setSimTime(time: Date | string | number): void;
  getSimTime(): Date | null;
  toJSON(): object;
  static fromJSON(data: object): WorldFactStore;
  readonly size: number;
}

declare class FactEmitter {
  constructor(factStore: WorldFactStore, options?: { simTime?: Date });
  emitStaticFacts(domain: any): WorldFact[];
  emitAgentStateFacts(agents: Map<string, any>): WorldFact[];
  emitRelationshipFacts(socialGraph: any): WorldFact[];
  emitEventFacts(event: any): WorldFact[];
  emitObservationFacts(observer: string, event: any): WorldFact[];
  propagateEventKnowledge(eventFact: WorldFact, agents: Map<string, any>): void;
  setSimTime(time: Date): void;
  toJSON(): object;
  fromJSON(data: object): void;
}

declare class FactProvider {
  constructor(worldFactStore: WorldFactStore, knowledgeStore: any);
  getGroundingPackage(agentId: string, options?: object): GroundingPackage | null;
}

declare class FactConsistencyChecker {
  constructor(worldFactStore: WorldFactStore, domain?: any);
  check(llmOutput: string, grounding: object, options?: { structuredClaims?: object; locationAliases?: Record<string, string[]>; verifier?: object; strictness?: 'normal' | 'strict' | 'semantic_review' }): ConsistencyCheckResult;
}

declare class FactFormatter {
  formatFacts(facts: WorldFact[], options?: { maxLength?: number }): string;
}

declare class KnowledgeStore {
  constructor(factStore: WorldFactStore);
  addKnowledge(agentId: string, factId: string, sourceOrEvidence?: string | object): void;
  hasKnowledge(agentId: string, factId: string): boolean;
  getKnownFacts(agentId: string, options?: { type?: string; since?: Date }): WorldFact[];
  getKnownFactIds(agentId: string): Set<string>;
  getSource(agentId: string, factId: string): string | undefined;
  getEvidence(agentId: string, factId: string): object | null;
  addKnowledgeBatch(entries: Array<{ agentId: string; factId: string; evidence?: object }>): void;
  removeKnowledge(agentId: string, factId: string): void;
  purgeEvictedFacts(factIds: Iterable<string>): void;
  purgeInactiveFacts(): number;
  getStats(): object;
  toJSON(): object;
  static fromJSON(data: object, factStore?: WorldFactStore): KnowledgeStore;
}

declare class CanonEventPipeline {
  constructor(worldFactStore: WorldFactStore, knowledgeStore: KnowledgeStore, factEmitter: FactEmitter);
  processEvent(event: any, agents?: Map<string, any>): { fact: object | null; knowledgeUpdates: any[] };
  processEvents(events: any[], agents: Map<string, any>): Array<{ fact: object | null; knowledgeUpdates: any[] }>;
  toJSON(): object;
  static fromJSON(data: object): CanonEventPipeline;
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

// P1-3 fix: `export = { ... }` object literals are invalid in ambient .d.ts
// (TS2714) and made the whole facts module un-importable for strict TS
// consumers, hiding the FactScope.INTERNAL addition. Declare a single
// const carrying the same members and export that identifier instead.
declare const AndyFacts: {
  FactType: typeof FactType;
  FACT_TYPES: typeof FACT_TYPES;
  FactSource: typeof FactSource;
  FACT_SOURCES: typeof FACT_SOURCES;
  FactScope: typeof FactScope;
  FACT_SCOPES: typeof FACT_SCOPES;
  validateFact: typeof validateFact;
  validateTypeFields: typeof validateTypeFields;
  createBaseFact: typeof createBaseFact;
  createStaticEnvFact: typeof createStaticEnvFact;
  createAgentStateFact: typeof createAgentStateFact;
  createRelationshipFact: typeof createRelationshipFact;
  createEventFact: typeof createEventFact;
  createObservationFact: typeof createObservationFact;
  createMemoryFact: typeof createMemoryFact;
  createRuleFact: typeof createRuleFact;
  createLocationMeaningFact: typeof createLocationMeaningFact;
  createInvalidatedFact: typeof createInvalidatedFact;
  WorldFactStore: typeof WorldFactStore;
  FactEmitter: typeof FactEmitter;
  FactFormatter: typeof FactFormatter;
  FactProvider: typeof FactProvider;
  FactConsistencyChecker: typeof FactConsistencyChecker;
  KnowledgeStore: typeof KnowledgeStore;
  CanonEventPipeline: typeof CanonEventPipeline;
};

export = AndyFacts;
