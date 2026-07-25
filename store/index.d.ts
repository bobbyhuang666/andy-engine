/**
 * @andy-engine/store — Type declarations
 *
 * Describes the CommonJS export of require('andy-engine/store').
 */

type BinaryData = Uint8Array;

interface ValidationError {
  path: string;
  message: string;
}

interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
}

interface StoreOptions {
  type?: 'auto' | 'sqlite' | 'memory';
  dbPath?: string;
  snapshotInterval?: number;
  storyInterval?: number;
  storyFlushInterval?: number;
  maxStoryBuffer?: number;
  snapshotKeepCount?: number;
  storyDecayInterval?: number;
}

interface SnapshotData {
  tick: number;
  virtualTime: number;
  data: BinaryData;
  hash?: string;
}

interface WorldState {
  schemaVersion: string;
  worldId: string;
  domainRef: string;
  worldClock: { time: string; tickCount: number };
  characters: Array<{ id: string; name: string; position?: string }>;
  relationships: any[];
  events: any[];
  runtimeSnapshot: Record<string, unknown>;
  [key: string]: any;
}

interface WorldSpec {
  schemaVersion: string;
  worldId: string;
  [key: string]: any;
}

declare class Serialization {
  static serialize(world: any): object;
  static deserialize(envelope: object, config?: any): object;
  static getVersion(): string;
}

declare const ENVELOPE_VERSION: string;

declare class SaveLoad {
  constructor(store: any);
  save(world: any, metadata?: any): any;
  load(snapshotId: string, config?: any): any;
  listSnapshots(): any[];
  /** @deprecated Use save(world, metadata). */
  saveWorld(engine: any, metadata?: any): any;
  /** @deprecated Use load(snapshotId, config). */
  loadWorld(snapshotId: string, config?: any): any;
}

declare class SnapshotStore {
  saveSnapshot(tick: number, virtualTime: number, data: BinaryData, meta?: any): void | Promise<void>;
  loadLatest(): SnapshotData | null;
  loadAt(tick: number): SnapshotData | null;
  prune(keepCount?: number): number;
  list(limit?: number): Array<Omit<SnapshotData, 'data'> & { createdAt?: number; dataSize?: number }>;
  close(): void | Promise<void>;
}

declare class MetaStore {
  get(key: string): string | null;
  set(key: string, value: string): void;
  setMany(entries: Record<string, any>): void;
  getAll(): Record<string, string>;
  delete(key: string): void;
  close(): void | Promise<void>;
}

declare class SQLiteStore {
  constructor(dbPath?: string);
  saveStories(stories: any[]): number;
  getRecent(agentId: string, hours?: number, limit?: number, now?: number): any[];
  getByEmotion(agentId: string, emotionTag: string, hours?: number, limit?: number, now?: number): any[];
  decay(decayFactor?: number, minImportance?: number, maxAgeDays?: number, now?: number): { decayed: number; deleted: number };
  stats(agentId: string, now?: number): { total: number; recentDay: number; recentWeek: number };
  saveSnapshot(tick: number, virtualTime: number, data: BinaryData, meta?: any): void;
  loadLatest(): SnapshotData | null;
  loadAt(tick: number): SnapshotData | null;
  prune(keepCount?: number): number;
  list(limit?: number): Array<Omit<SnapshotData, 'data'> & { createdAt?: number; dataSize?: number }>;
  get(key: string): string | null;
  set(key: string, value: string): void;
  setMany(entries: Record<string, any>): void;
  getAll(): Record<string, string>;
  delete(key: string): void;
  transaction<T>(fn: () => T): T;
  /** @deprecated Use loadLatest(). */
  loadLatestSnapshot(): SnapshotData | null;
  /** @deprecated Use loadAt(tick). */
  loadSnapshotByTick(tick: number): SnapshotData | null;
  /** @deprecated Use set(key, value). */
  saveMeta(key: string, value: string): void;
  /** @deprecated Use get(key). */
  loadMeta(key: string): string | null;
  close(): void;
}

declare class MemoryStore {
  constructor();
  saveStories(stories: any[]): number;
  getRecent(agentId: string, hours?: number, limit?: number, now?: number): any[];
  getByEmotion(agentId: string, emotionTag: string, hours?: number, limit?: number, now?: number): any[];
  decay(decayFactor?: number, minImportance?: number, maxAgeDays?: number, now?: number): { decayed: number; deleted: number };
  stats(agentId: string, now?: number): { total: number; recentDay: number; recentWeek: number };
  saveSnapshot(tick: number, virtualTime: number, data: BinaryData, meta?: any): void;
  loadLatest(): SnapshotData | null;
  loadAt(tick: number): SnapshotData | null;
  prune(keepCount?: number): number;
  list(limit?: number): Array<Omit<SnapshotData, 'data'> & { createdAt?: number; dataSize?: number }>;
  get(key: string): string | null;
  set(key: string, value: string): void;
  setMany(entries: Record<string, any>): void;
  getAll(): Record<string, string>;
  delete(key: string): void;
  transaction<T>(fn: () => T): T;
  /** @deprecated Use loadLatest(). */
  loadLatestSnapshot(): SnapshotData | null;
  /** @deprecated Use loadAt(tick). */
  loadSnapshotByTick(tick: number): SnapshotData | null;
  /** @deprecated Use set(key, value). */
  saveMeta(key: string, value: string): void;
  /** @deprecated Use get(key). */
  loadMeta(key: string): string | null;
  close(): void;
}

declare class SimulationStore {
  constructor(options?: StoreOptions & { storeType?: 'auto' | 'sqlite' | 'memory' });
  init(callbacks?: {
    onSnapshot?: () => BinaryData;
    onRestore?: (data: BinaryData) => void | Promise<void>;
  }): Promise<{
    requestedStoreType: 'auto' | 'memory' | 'sqlite';
    actualStoreType: 'memory' | 'sqlite';
    degraded: boolean;
    restoredTick: number;
    restoredTime: Date | null;
    hasSnapshot: boolean;
    restoreFailed: boolean;
    error: null | { code: string; message: string };
  }>;
  onTick(result: any, stories: any[]): void;
  getStoriesForAgent(agentId?: string, hours?: number, limit?: number): any[];
  getStoriesForBobby(agentId?: string, hours?: number, limit?: number): any[];
  getStoriesByEmotion(agentId: string, emotionTag: string, hours?: number, limit?: number): any[];
  getStats(agentId: string): { total: number; recentDay: number; recentWeek: number };
  getMeta(key: string): string | null;
  setMeta(key: string, value: string): void;
  shutdown(): Promise<void>;
}

declare class StoryStore {
  saveStories(stories: any[]): Promise<number>;
  getRecent(agentId: string, hours?: number, limit?: number, now?: number): Promise<any[]>;
  getByEmotion(agentId: string, emotionTag: string, hours?: number, limit?: number, now?: number): Promise<any[]>;
  decay(decayFactor?: number, minImportance?: number, maxAgeDays?: number, now?: number): Promise<{ decayed: number; deleted: number }>;
  stats(agentId: string, now?: number): Promise<{ total: number; recentDay: number; recentWeek: number }>;
  close(): Promise<void>;
}

declare function createStore(options?: StoreOptions): SimulationStore;
declare function createMemoryStore(): SQLiteStore | MemoryStore;
declare function toWorldState(engine: any, worldId: string): WorldState;
declare function fromWorldState(worldState: WorldState, config?: any, EngineConstructor?: any): any;
declare function validateWorldSpec(spec: WorldSpec): ValidationResult;
declare function validateWorldState(state: WorldState): ValidationResult;
declare function compile(spec: WorldSpec, domainConfig?: any, EngineConstructor?: any): any;
declare function migrateWorldState(oldState: WorldState): { state: WorldState; migrated: boolean };

declare const CURRENT_SCHEMA_VERSION: string;

declare const AndyStore: {
  Serialization: typeof Serialization;
  ENVELOPE_VERSION: typeof ENVELOPE_VERSION;
  SaveLoad: typeof SaveLoad;
  SnapshotStore: typeof SnapshotStore;
  MetaStore: typeof MetaStore;
  SQLiteStore: typeof SQLiteStore;
  MemoryStore: typeof MemoryStore;
  SimulationStore: typeof SimulationStore;
  StoryStore: typeof StoryStore;
  createStore: typeof createStore;
  createMemoryStore: typeof createMemoryStore;
  toWorldState: typeof toWorldState;
  fromWorldState: typeof fromWorldState;
  validateWorldSpec: typeof validateWorldSpec;
  validateWorldState: typeof validateWorldState;
  CURRENT_SCHEMA_VERSION: typeof CURRENT_SCHEMA_VERSION;
  compile: typeof compile;
  migrateWorldState: typeof migrateWorldState;
};

export = AndyStore;
