export const ANDY_DEFAULTS: Record<string, any>;
export const DEFAULT_DOMAIN_ID: string;
export const EMOTION_DIMENSIONS: string[];
export const CO_ACTIVATION: Record<string, Record<string, number>>;
export const EMOTION_OPPOSITES: Record<string, string>;
export const SEMANTIC_EVENT_CATEGORIES: Record<string, any>;

export function personalityToBehavior(ocean?: {
  openness?: number;
  conscientiousness?: number;
  extraversion?: number;
  agreeableness?: number;
  neuroticism?: number;
}): Record<string, number>;
