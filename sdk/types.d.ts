/**
 * @andy-engine/sdk — 让 AI 角色拥有灵魂
 */

// ═══════════════════════════════════════════
// Character
// ═══════════════════════════════════════════

export interface CharacterConfig {
  /** 角色名 */
  name: string;
  /** 角色 ID（默认自动生成） */
  id?: string;
  /** MBTI 类型，如 'INFP' */
  personality?: string;
  /** 直接指定大五人格 */
  ocean?: {
    openness?: number;
    conscientiousness?: number;
    extraversion?: number;
    agreeableness?: number;
    neuroticism?: number;
  };
  /** 背景故事 */
  backstory?: string[];
  /** 日程预设或配置 */
  schedule?: string | object;
  /** 初始位置 */
  initialPosition?: string;
  /** LLM 配置 */
  llm?: LLMConfig | LLMFunction;
  /** 场景描述 */
  scenario?: string;
  /** 共享的 AndyEngine 实例（多角色场景） */
  engine?: object;
  /** 模拟开始时间 */
  startTime?: Date;
  /** 初始天气 */
  weather?: string;
  /** 最大保留消息数 */
  maxMessages?: number;
  /** 自动 tick 配置 */
  autoTick?: AutoTickConfig;
}

export interface CharacterContext {
  /** 完整的 system prompt */
  systemPrompt: string;
  /** 角色当前叙事 */
  narrative: string;
  /** 世界上下文数据 */
  worldContext: WorldContext;
  /** 对话历史 */
  conversationHistory: Array<{ role: string; content: string }>;
}

export interface WorldContext {
  time: string;
  hour: number;
  dayOfWeek: number;
  weather: string;
  timeOfDay: string;
  season: string;
  currentRegion: string;
  personalityAnchor: string;
  agentStatus: object;
  recentEvents: string;
  lastAppraisal: string;
  nearbyPeople: string;
  emotionState: string;
  needsState: string;
  emotionRegulation: string;
  memoryContext: string;
  health: number;
}

export class Character {
  id: string;
  name: string;
  backstory: string[];
  scenario: string;

  constructor(config: CharacterConfig);

  /**
   * 与角色对话
   * @param message - 用户消息
   * @param options - 可选配置
   * @returns 角色回复
   */
  chat(message: string, options?: { llm?: LLMConfig }): Promise<string>;

  /**
   * 流式对话（逐 token 产出）
   * @param message - 用户消息
   * @param options - 可选配置
   * @returns 逐 token 产出的异步迭代器
   */
  chatStream(message: string, options?: { llm?: LLMConfig }): AsyncGenerator<string>;

  /**
   * 获取角色当前状态
   */
  getContext(options?: { userText?: string }): CharacterContext;

  /**
   * 获取对话历史
   */
  getConversation(): ConversationLog;

  /**
   * 保存角色完整状态
   */
  save(): object;

  /**
   * 从保存的状态恢复角色
   */
  static load(state: object, llmConfig?: LLMConfig): Character;
}

// ═══════════════════════════════════════════
// Andy (多角色引擎)
// ═══════════════════════════════════════════

export interface AndyConfig {
  /** 默认 LLM 配置 */
  llm?: LLMConfig;
  /** 模拟开始时间 */
  startTime?: Date;
  /** 初始天气 */
  weather?: string;
}

export class Andy {
  constructor(config?: AndyConfig);

  /** 添加角色 */
  addCharacter(config: CharacterConfig): Character;

  /** 获取角色 */
  getCharacter(id: string): Character | undefined;

  /** 与指定角色对话 */
  chat(characterId: string, message: string, options?: object): Promise<string>;

  /** 推进一个模拟 tick */
  tick(): object;

  /** 推进多个 tick */
  runTicks(count: number): object[];

  /** 获取所有角色状态 */
  getStates(): Record<string, WorldContext & { name: string }>;

  /** 获取社交图谱 */
  getSocialGraph(): object;

  /** 获取引擎统计 */
  getStats(): object;

  /** 保存完整世界状态 */
  save(): object;

  /** 从保存的状态恢复 */
  static load(state: object): Andy;
}

// ═══════════════════════════════════════════
// LLM Adapter
// ═══════════════════════════════════════════

export type LLMFunction = (messages: Array<{ role: string; content: string }>) => Promise<string>;

export interface LLMConfig {
  /** 'openai' | 'anthropic' | 'openai-compatible' */
  provider?: string;
  /** API key */
  apiKey?: string;
  /** 模型名 */
  model?: string;
  /** 自定义 base URL */
  baseUrl?: string;
  /** 最大输出 token */
  maxTokens?: number;
  /** 温度 */
  temperature?: number;
  /** 最大重试次数 */
  maxRetries?: number;
  /** 自定义 LLM 函数 */
  llm?: LLMFunction;
}

export class LLMAdapter {
  constructor(config: LLMConfig | LLMFunction);
  chat(messages: Array<{ role: string; content: string }>): Promise<string>;
  chatStream(messages: Array<{ role: string; content: string }>): AsyncGenerator<string>;
}

// ═══════════════════════════════════════════
// NarrativeBuilder
// ═══════════════════════════════════════════

export class NarrativeBuilder {
  static buildSystemPrompt(
    worldContext: WorldContext | null,
    options: {
      characterName?: string;
      backstory?: string[];
      scenario?: string;
      conversationHistory?: string | null;
    }
  ): string;
}

// ═══════════════════════════════════════════
// AutoTick
// ═══════════════════════════════════════════

export interface AutoTickConfig {
  tickIntervalMinutes?: number;
  maxCatchupTicks?: number;
  chatTickMin?: number;
  chatTickMax?: number;
}

export class AutoTick {
  constructor(options?: AutoTickConfig);
  advance(engine: object): number;
  reset(): void;
}

// ═══════════════════════════════════════════
// ConversationLog
// ═══════════════════════════════════════════

export class ConversationLog {
  messages: Array<{ role: string; content: string; timestamp: number }>;
  turnCount: number;
  length: number;

  constructor(options?: { characterName?: string; maxMessages?: number; maxTokens?: number });
  addUserMessage(text: string): void;
  addAssistantMessage(text: string): void;
  toMessages(): Array<{ role: string; content: string }>;
  getSummary(): string;
  clear(): void;
  toJSON(): object;
  static fromJSON(data: object): ConversationLog;
}

// ═══════════════════════════════════════════
// 快速创建
// ═══════════════════════════════════════════

/** 快速创建角色 */
export function create(config: CharacterConfig): Character;

/** 引擎核心（高级用户） */
export const AndyEngine: any;
