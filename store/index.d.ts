/**
 * @andy-engine/store — Type declarations
 *
 * Describes the CommonJS export of require('andy-engine/store').
 */

interface StoreOptions {
  dbPath: string;
  snapshotInterval?: number;
  storyInterval?: number;
}

interface SnapshotData {
  tick: number;
  virtualTime: number;
  data: Buffer;
  hash?: string;
}

interface WorldState {
  schemaVersion: string;
  worldId: string;
  tickCount: number;
  virtualTime: number;
  environment: {
    weather: string;
    weatherChangedAt: number;
    timeOfDay: string;
    season: string;
  };
  agents: Record<string, any>;
  regions: Record<string, any>;
  socialGraph: any;
  eventLog: any[];
  [key: string]: any;
}

interface WorldSpec {
  schemaVersion: string;
  worldId: string;
  [key: string]: any;
}

declare class Serialization {
  static serializeWorldState(state: WorldState): Buffer;
  static deserializeWorldState(data: Buffer): WorldState;
}

declare const ENVELOPE_VERSION: string;

declare class SaveLoad {
  constructor(store: any);
  saveWorld(engine: any): void;
  loadWorld(engine: any): WorldState | null;
}

declare class SnapshotStore {
  save(tick: number, virtualTime: number, data: Buffer, hash?: string): void;
  loadLatest(): SnapshotData | null;
  loadByTick(tick: number): SnapshotData | null;
  close(): void;
}

declare class MetaStore {
  get(key: string): string | null;
  set(key: string, value: string): void;
  close(): void;
}

declare class SQLiteStore {
  constructor(dbPath: string);
  saveSnapshot(tick: number, virtualTime: number, data: Buffer, hash?: string): void;
  loadLatestSnapshot(): SnapshotData | null;
  loadSnapshotByTick(tick: number): SnapshotData | null;
  saveMeta(key: string, value: string): void;
  loadMeta(key: string): string | null;
  close(): void;
}

declare class MemoryStore {
  constructor();
  saveSnapshot(tick: number, virtualTime: number, data: Buffer, hash?: string): void;
  loadLatestSnapshot(): SnapshotData | null;
  saveMeta(key: string, value: string): void;
  loadMeta(key: string): string | null;
  close(): void;
}

declare class SimulationStore {
  constructor(store: SnapshotStore, metaStore: MetaStore, options?: { snapshotInterval?: number; storyInterval?: number });
  init(callbacks: {
    onSnapshot: () => Buffer;
    onRestore: (data: Buffer) => void;
  }): Promise<void>;
  onTick(result: any, stories: any[]): void;
  shutdown(): Promise<void>;
}

declare class StoryStore {
  save(tick: number, agentId: string, story: string): void;
  loadByAgent(agentId: string): Array<{ tick: number; story: string }>;
  loadLatest(agentId: string, count?: number): Array<{ tick: number; story: string }>;
  close(): void;
}

declare function createStore(options: StoreOptions): SimulationStore;
declare function createMemoryStore(): SimulationStore;
declare function toWorldState(engine: any, worldId?: string): WorldState;
declare function fromWorldState(worldState: WorldState, config?: any, EngineConstructor?: any): any;
declare function validateWorldSpec(spec: WorldSpec): { valid: boolean; errors: string[] };
declare function validateWorldState(state: WorldState): { valid: boolean; errors: string[] };
declare function compile(spec: WorldSpec, domainConfig?: any, EngineConstructor?: any): any;
declare function migrateWorldState(oldState: WorldState): WorldState;

declare const CURRENT_SCHEMA_VERSION: string;

export = {
  Serialization,
  ENVELOPE_VERSION,
  SaveLoad,
  SnapshotStore,
  MetaStore,
  SQLiteStore,
  MemoryStore,
  SimulationStore,
  StoryStore,
  createStore,
  createMemoryStore,
  toWorldState,
  fromWorldState,
  validateWorldSpec,
  validateWorldState,
  CURRENT_SCHEMA_VERSION,
  compile,
  migrateWorldState,
};
