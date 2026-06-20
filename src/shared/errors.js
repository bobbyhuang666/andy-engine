/**
 * src/shared/errors — Error Types
 *
 * Shared error types for the engine.
 */

class AndyError extends Error {
  constructor(message, code = 'ANDY_ERROR') {
    super(message);
    this.name = 'AndyError';
    this.code = code;
  }
}

class ConfigError extends AndyError {
  constructor(message) {
    super(message, 'CONFIG_ERROR');
    this.name = 'ConfigError';
  }
}

class DomainError extends AndyError {
  constructor(message) {
    super(message, 'DOMAIN_ERROR');
    this.name = 'DomainError';
  }
}

class AgentError extends AndyError {
  constructor(message) {
    super(message, 'AGENT_ERROR');
    this.name = 'AgentError';
  }
}

module.exports = { AndyError, ConfigError, DomainError, AgentError };
