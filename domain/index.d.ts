/**
 * @andy-engine/domain — Type declarations
 *
 * Describes the CommonJS export of require('andy-engine/domain').
 */

export interface DomainConfig {
  id: string;
  name: string;
  description?: string;
  version?: string;
  states: Record<string, {
    next: string[];
    hours?: number[];
    category?: string;
    [key: string]: any;
  }>;
  stateCenters?: Record<string, [number, number, number, number]>;
  regions: string[];
  adjacency?: Array<[string, string, number?]>;
  regionCoords?: Record<string, any>;
  placeTypes?: Record<string, any>;
  placeMapping?: Record<string, any>;
  labelTimePenalties?: Record<string, any>;
  activityTargets?: Record<string, any>;
  eventTemplates?: Record<string, any>;
  narrativeTemplates?: Record<string, any>;
  memoryTemplates?: Record<string, any>;
  needSatisfactionMap?: Record<string, any>;
  needDriveStates?: Record<string, any>;
  needRegionConfig?: Record<string, any>;
  locationMeaningTypes?: Record<string, any>;
  eventConsequenceRules?: Record<string, any>;
  appraisalConfig?: Record<string, any>;
  intrinsicMotivationConfig?: Record<string, any>;
  skipBehavior?: Record<string, any>;
  roleArchetypes?: Record<string, any>;
  scheduleFactories?: Record<string, any> | null;
  timeRules?: Record<string, any>;
  socialInteractions?: Record<string, any>;
  emotionRegulationConfig?: Record<string, any>;
  semanticProfile?: Record<string, any>;
  forbiddenTerms?: string[];
  fallback?: {
    defaultRegion?: string;
    defaultState?: string;
    unknownState?: string;
    unknownRegion?: string;
    [key: string]: any;
  };
  [key: string]: any;
}

export interface DomainValidationResult {
  valid: boolean;
  errors: Array<{ path: string; message: string }>;
  warnings: Array<{ path: string; message: string }>;
}

export interface DomainRegistryOptions {
  validate?: boolean;
  strict?: boolean;
}

export declare class DomainRegistry {
  constructor(domain: DomainConfig, options?: DomainRegistryOptions);
  readonly id: string;
  readonly name: string;
  readonly version: string;
  readonly regions: string[];
  readonly adjacency: Array<[string, string, number?]>;
  readonly regionCoords: Record<string, any>;
  readonly placeTypes: Record<string, any>;
  readonly placeMapping: Record<string, any>;
  readonly states: Record<string, any>;
  readonly stateCenters: Record<string, [number, number, number, number]>;
  readonly labelTimePenalties: Record<string, any>;
  readonly activityTargets: Record<string, any>;
  readonly needSatisfactionMap: Record<string, any>;
  readonly needDriveStates: Record<string, any>;
  readonly needRegionConfig: Record<string, any>;
  readonly locationMeaningTypes: Record<string, any>;
  readonly eventConsequenceRules: Record<string, any>;
  readonly eventTemplates: Record<string, any>;
  readonly memoryTemplates: Record<string, any>;
  readonly appraisalConfig: Record<string, any>;
  readonly intrinsicMotivationConfig: Record<string, any>;
  readonly skipBehavior: Record<string, any>;
  readonly roleArchetypes: Record<string, any>;
  readonly scheduleFactories: Record<string, any> | null;
  readonly narrativeTemplates: Record<string, any>;
  readonly timeRules: Record<string, any>;
  readonly fallback: {
    defaultRegion?: string | null;
    defaultState?: string | null;
    unknownState?: string | null;
    unknownRegion?: string | null;
    [key: string]: any;
  };
  readonly socialInteractions: Record<string, any>;
  readonly emotionRegulationConfig: Record<string, any>;
  readonly semanticProfile: Record<string, any> | undefined;
  readonly forbiddenTerms: string[];
  getRegions(): string[];
  getRegionSet(): Set<string>;
  hasRegion(region: string): boolean;
  getStateNames(): string[];
  getStateVectors(): Array<[number, number, number, number]>;
  hasState(state: string): boolean;
  getStateCenter(state: string): [number, number, number, number] | null;
  getEventTemplates(type: string): Record<string, any> | any[];
  getFallbackRegion(): string | null;
  getFallbackState(): string | null;
  getSemanticProfile(): Record<string, any>;
  mergeSemanticProfile(defaults?: Record<string, any>): Record<string, any>;
  getForbiddenTerms(): string[];
}

export declare function getDefaultDomain(): DomainRegistry;
export declare function validateDomain(domain: DomainConfig, opts?: { strict?: boolean; throwOnError?: boolean }): DomainValidationResult;
export declare function applyForbiddenTerms(text: string, domain: DomainConfig): string;
