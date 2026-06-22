/**
 * AndyEngine — Root type declarations
 *
 * Describes the CommonJS export of `require('andy-engine')`.
 */

declare class AndyEngine {
  constructor(config?: object, savedState?: object | null);

  createCharacter(config: object): object;
  addAgent(config: object): object;
  addAgents(configs: object[]): object[];
  getAgent(agentId: string): object | undefined;
  getAllAgents(): object[];
  getNarrative(agentId: string, options?: object): string;
  getWorldContext(agentId: string): object | null;
  getGroundingPackage(agentId: string, options?: object): object | null;
  checkConsistency(llmOutput: string, agentId: string): object;
  tick(): object;
  runTicks(count: number): object[];
  advanceTo(targetTime: Date, maxTicks?: number): object[];
  snapshot(): object;
  getStats(): object;
  onTick(callback: (tickResult: object) => void): void;
  setWeather(weather: string): void;
  getSocialGraph(): object;
  toJSON(): object;

  static fromJSON(data: object, config?: object): AndyEngine;
}

export = AndyEngine;
