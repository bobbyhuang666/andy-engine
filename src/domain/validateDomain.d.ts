import type { DomainConfig, DomainValidationResult } from '../../domain';

export function validateDomain(
  domain: DomainConfig,
  opts?: { strict?: boolean; throwOnError?: boolean }
): DomainValidationResult;
