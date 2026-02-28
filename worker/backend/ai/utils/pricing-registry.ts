import { z } from 'zod';

// ============================================================================
// 1. CONFIGURATION & GUARDRAILS
// ============================================================================

/**
 * SAFETY MECHANISM:
 * If a model's base input or output cost exceeds these thresholds (per 1M tokens),
 * the system will throw a hard error.
 * * Adjust these values based on your risk tolerance.
 */
export const BUDGET_LIMITS = {
  maxInputPricePerM: 10.00,  // Throw if input > $10/M (Blocks: o1, Opus 4.x Long Context)
  maxOutputPricePerM: 30.00, // Throw if output > $30/M (Blocks: o1, Opus 4.x Long Context)
  allowlist: ['gpt-4o', 'gemini-3-pro-preview'], // Exceptions that are allowed even if expensive
};

// ============================================================================
// 2. SCHEMAS
// ============================================================================

export const ModelPricingSchema = z.object({
  id: z.string(),
  provider: z.enum(['anthropic', 'google', 'openai', 'cloudflare']),
  name: z.string(),
  
  // Base Pricing (Standard / <= 200k context)
  input: z.number().describe('Cost per 1M input tokens'),
  output: z.number().describe('Cost per 1M output tokens'),
  
  // Advanced Tiers (Long Context > 200k)
  input_long: z.number().optional().describe('Cost per 1M input tokens if context > 200k'),
  output_long: z.number().optional().describe('Cost per 1M output tokens if context > 200k'),
  
  // Caching
  cache_read: z.number().optional().default(0),
  cache_write_5m: z.number().optional().describe('Anthropic 5m cache write'),
  cache_write_1h: z.number().optional().describe('Anthropic 1h cache write'),
  
  // Special Features
  is_preview: z.boolean().optional().default(false),
});

export type ModelPricing = z.infer<typeof ModelPricingSchema>;

// ============================================================================
// 3. COMPREHENSIVE PRICING CATALOG
// ============================================================================

export const PRICING_CATALOG: Record<string, ModelPricing> = {
  // --- ANTHROPIC: OPUS SERIES ---
  'claude-opus-4.6': {
    id: 'claude-opus-4.6', provider: 'anthropic', name: 'Claude Opus 4.6',
    input: 5.00, output: 25.00,
    input_long: 10.00, output_long: 37.50, // >200k tier
    cache_write_5m: 6.25, cache_write_1h: 10.00, cache_read: 0.50,
    is_preview: false
  },
  'claude-opus-4.5': {
    id: 'claude-opus-4.5', provider: 'anthropic', name: 'Claude Opus 4.5',
    input: 5.00, output: 25.00,
    cache_write_5m: 6.25, cache_write_1h: 10.00, cache_read: 0.50,
    is_preview: false
  },
  'claude-opus-4.1': { // Legacy expensive
    id: 'claude-opus-4.1', provider: 'anthropic', name: 'Claude Opus 4.1',
    input: 15.00, output: 75.00,
    cache_write_5m: 18.75, cache_write_1h: 30.00, cache_read: 1.50,
    is_preview: false
  },

  // --- ANTHROPIC: SONNET SERIES ---
  'claude-sonnet-4.5': {
    id: 'claude-sonnet-4.5', provider: 'anthropic', name: 'Claude Sonnet 4.5',
    input: 3.00, output: 15.00,
    input_long: 6.00, output_long: 22.50,
    cache_write_5m: 3.75, cache_write_1h: 6.00, cache_read: 0.30,
    is_preview: false
  },
  'claude-sonnet-3.7': { // Deprecated
    id: 'claude-sonnet-3.7', provider: 'anthropic', name: 'Claude Sonnet 3.7',
    input: 3.00, output: 15.00,
    cache_write_5m: 3.75, cache_write_1h: 6.00, cache_read: 0.30,
    is_preview: false
  },

  // --- ANTHROPIC: HAIKU SERIES ---
  'claude-haiku-4.5': {
    id: 'claude-haiku-4.5', provider: 'anthropic', name: 'Claude Haiku 4.5',
    input: 1.00, output: 5.00,
    cache_write_5m: 1.25, cache_write_1h: 2.00, cache_read: 0.10,
    is_preview: false
  },
  'claude-haiku-3.5': {
    id: 'claude-haiku-3.5', provider: 'anthropic', name: 'Claude Haiku 3.5',
    input: 0.80, output: 4.00,
    cache_write_5m: 1.00, cache_write_1h: 1.60, cache_read: 0.08,
    is_preview: false
  },

  // --- GOOGLE: GEMINI 3 SERIES ---
  'gemini-3-pro-preview': {
    id: 'gemini-3-pro-preview', provider: 'google', name: 'Gemini 3 Pro Preview',
    input: 2.00, output: 12.00,
    input_long: 4.00, output_long: 18.00,
    cache_read: 0.20, is_preview: true
  },
  'gemini-3-flash-preview': {
    id: 'gemini-3-flash-preview', provider: 'google', name: 'Gemini 3 Flash Preview',
    input: 0.50, output: 3.00,
    cache_read: 0.05, is_preview: true
  },

  // --- GOOGLE: GEMINI 2.5 SERIES ---
  'gemini-2.5-pro': {
    id: 'gemini-2.5-pro', provider: 'google', name: 'Gemini 2.5 Pro',
    input: 1.25, output: 10.00,
    input_long: 2.50, output_long: 15.00,
    cache_read: 0.125, is_preview: false
  },
  'gemini-2.5-flash': {
    id: 'gemini-2.5-flash', provider: 'google', name: 'Gemini 2.5 Flash',
    input: 0.30, output: 2.50,
    cache_read: 0.03, is_preview: false
  },
  'gemini-2.5-flash-lite': {
    id: 'gemini-2.5-flash-lite', provider: 'google', name: 'Gemini 2.5 Flash-Lite',
    input: 0.10, output: 0.40,
    cache_read: 0.01, is_preview: false
  },

  // --- OPENAI SERIES ---
  'o1': {
    id: 'o1', provider: 'openai', name: 'o1 (Reasoning)',
    input: 15.00, output: 60.00,
    cache_read: 7.50, is_preview: false
  },
  'o1-mini': {
    id: 'o1-mini', provider: 'openai', name: 'o1-mini',
    input: 1.10, output: 4.40,
    cache_read: 0.55, is_preview: false
  },
  'gpt-4o': {
    id: 'gpt-4o', provider: 'openai', name: 'GPT-4o',
    input: 2.50, output: 10.00,
    cache_read: 1.25, is_preview: false
  },
  'gpt-4o-mini': {
    id: 'gpt-4o-mini', provider: 'openai', name: 'GPT-4o Mini',
    input: 0.15, output: 0.60,
    cache_read: 0.075, is_preview: false
  },

  // --- CLOUDFLARE WORKERS AI ---
  '@cf/meta/llama-3.3-70b-instruct-fp8-fast': {
    id: '@cf/meta/llama-3.3-70b-instruct-fp8-fast', provider: 'cloudflare', name: 'Llama 3.3 70B',
    input: 0.30, output: 0.60, // Estimated Neuron pricing
    cache_read: 0, is_preview: false
  },
  '@cf/meta/llama-3.1-8b-instruct': {
    id: '@cf/meta/llama-3.1-8b-instruct', provider: 'cloudflare', name: 'Llama 3.1 8B',
    input: 0.06, output: 0.06, // Estimated Neuron pricing
    cache_read: 0, is_preview: false
  }
};

// ============================================================================
// 4. LOGIC
// ============================================================================

export class ExpensiveModelError extends Error {
  constructor(modelId: string, price: number, threshold: number, type: 'input' | 'output') {
    super(
      `🚨 COST GUARDRAIL TRIGGERED: Model '${modelId}' costs $${price}/M for ${type}, which exceeds your safety limit of $${threshold}/M.`
    );
    this.name = 'ExpensiveModelError';
  }
}

export interface CostCalculationParams {
  modelId: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
  /** Anthropic Only: '5m' or '1h' cache lifetime */
  anthropicCacheType?: '5m' | '1h';
}

/**
 * Validates a model against budget limits.
 * @throws ExpensiveModelError if limits are exceeded.
 */
export function guardCheck(modelId: string, model: ModelPricing, isLongContext: boolean) {
  // 1. Skip if allowlisted
  if (BUDGET_LIMITS.allowlist.includes(modelId)) return;

  // 2. Determine active rates
  const currentInputPrice = isLongContext && model.input_long ? model.input_long : model.input;
  const currentOutputPrice = isLongContext && model.output_long ? model.output_long : model.output;

  // 3. Check Input
  if (currentInputPrice > BUDGET_LIMITS.maxInputPricePerM) {
    throw new ExpensiveModelError(modelId, currentInputPrice, BUDGET_LIMITS.maxInputPricePerM, 'input');
  }

  // 4. Check Output
  if (currentOutputPrice > BUDGET_LIMITS.maxOutputPricePerM) {
    throw new ExpensiveModelError(modelId, currentOutputPrice, BUDGET_LIMITS.maxOutputPricePerM, 'output');
  }
}

/**
 * Calculates cost and verifies guardrails.
 */
export function calculateAndVerifyCost(params: CostCalculationParams) {
  const model = PRICING_CATALOG[params.modelId];
  
  if (!model) {
    console.warn(`[Pricing] Unknown model '${params.modelId}'. Skipping guardrails.`);
    return { total: 0, currency: 'USD' };
  }

  // Determine if we are in "Long Context" territory (Gemini/Anthropic logic)
  const isLongContext = params.inputTokens > 200_000;

  // 🚨 THROW if too expensive
  guardCheck(params.modelId, model, isLongContext);

  // --- CALCULATION ---
  const inputRate = (isLongContext && model.input_long) ? model.input_long : model.input;
  const outputRate = (isLongContext && model.output_long) ? model.output_long : model.output;

  const inputCost = (params.inputTokens / 1_000_000) * inputRate;
  const outputCost = (params.outputTokens / 1_000_000) * outputRate;

  let cacheCost = 0;

  // Cache Reads
  if (params.cacheReadTokens) {
    let readRate = model.cache_read || 0;
    // Gemini 2.5 Pro doubles cache read cost in long context
    if (model.provider === 'google' && isLongContext) readRate *= 2; 
    cacheCost += (params.cacheReadTokens / 1_000_000) * readRate;
  }

  // Cache Writes (Anthropic Specific)
  if (params.cacheWriteTokens && model.provider === 'anthropic') {
    const writeRate = params.anthropicCacheType === '1h' 
      ? (model.cache_write_1h || 0) 
      : (model.cache_write_5m || 0);
    cacheCost += (params.cacheWriteTokens / 1_000_000) * writeRate;
  }

  return {
    total: inputCost + outputCost + cacheCost,
    currency: 'USD',
    breakdown: {
      input: inputCost,
      output: outputCost,
      cache: cacheCost
    }
  };
}
