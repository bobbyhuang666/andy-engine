/**
 * @andy-engine/domain — Type declarations
 *
 * Describes the CommonJS export of require('andy-engine/domain').
 */

interface DomainConfig {
  id: string;
  name: string;
  description?: string;
  version?: string;
  states: Record<string, {
    next: string[];
    hours: number[];
    category: string;
  }>;
  stateCenters?: Record<string, [number, number, number, number]>;
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
    unknownState?: string;
    unknownRegion?: string;
    [key: string]: any;
  };
  [key: string]: any;
}

interface DomainValidationResult {
  valid: boolean;
  errors: Array<{ path: string; message: string }>;
  warnings: Array<{ path: string; message: string }>;
}

declare class DomainRegistry {
  constructor(domain: DomainConfig);
  readonly id: string;
  readonly name: string;
  readonly regions: string[];
  readonly states: string[];
  hasRegion(region: string): boolean;
  hasState(state: string): boolean;
  getRegionNames(): string[];
  getStateNames(): string[];
  getAdjacentRegions(region: string): string[];
  getStateDefinition(stateName: string): Record<string, any> | undefined;
  getStateCenter(stateName: string): [number, number, number, number] | undefined;
  getDomainConfig(): DomainConfig;
}

declare function getDefaultDomain(): DomainConfig;
declare function validateDomain(domain: DomainConfig, opts?: { strict?: boolean }): DomainValidationResult;
declare function applyForbiddenTerms(text: string, domain: DomainConfig): string;

export = {
  DomainRegistry,
  getDefaultDomain,
  validateDomain,
  applyForbiddenTerms,
};
