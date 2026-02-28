/**
 * @file backend/src/lib/model-config.ts
 * @description Cost-optimized model configuration for all agents
 * @owner AI Infrastructure Team
 */

/**
 * Agent Model Configuration
 * Maps each agent to the most cost-effective model based on their requirements
 * 
 * Cost Optimization Strategy:
 * - Cloudflare Workers AI: FREE (best for high-volume, simple tasks)
 * - Haiku 3.5: $0.80/$4.00 per 1M tokens (best for fast, lightweight tasks)
 * - GPT-4o-mini: $0.15/$0.60 per 1M tokens (best balance of cost/quality)
 * - Sonnet 4.5: $3.00/$15.00 per 1M tokens (complex reasoning)
 * - GPT-4o: $2.50/$10.00 per 1M tokens (high-quality general purpose)
 */

export type AgentName =
  | 'ResearchAgent'
  | 'OwnerAgent'
  | 'PlannerAgent'
  | 'RepoAgent'
  | 'GeminiAgent'
  | 'DeepReasoningAgent'
  | 'Supervisor'
  | 'OrchestratorAgent'
  | 'DataProcessor'
  | 'Sandbox'
  | 'JulesFeedbackAgent';

export interface ModelConfig {
  model: string;
  provider: 'cloudflare' | 'openai' | 'anthropic' | 'google';
  costTier: 'free' | 'ultra-low' | 'low' | 'medium' | 'high';
  description: string;
}

/**
 * Cost-optimized model assignments for each agent
 */
export const AGENT_MODEL_CONFIG: Record<AgentName, ModelConfig> = {
  // FREE TIER - Cloudflare Workers AI (Best for high-volume, simple tasks)
  'Sandbox': {
    model: '@cf/meta/llama-3.1-8b-instruct-fast',
    provider: 'cloudflare',
    costTier: 'free',
    description: 'Fast code execution analysis - high volume, simple tasks'
  },
  'DataProcessor': {
    model: '@cf/meta/llama-3.1-8b-instruct-fast',
    provider: 'cloudflare',
    costTier: 'free',
    description: 'Data transformation and processing - high volume'
  },

  // ULTRA-LOW COST - GPT-4o-mini ($0.15/$0.60 per 1M)
  'PlannerAgent': {
    model: 'gpt-4o-mini',
    provider: 'openai',
    costTier: 'ultra-low',
    description: 'Planning and task breakdown - good quality, very low cost'
  },
  'RepoAgent': {
    model: 'gpt-4o-mini',
    provider: 'openai',
    costTier: 'ultra-low',
    description: 'Repository analysis - frequent calls, good quality needed'
  },

  // LOW COST - Haiku 3.5 ($0.80/$4.00 per 1M)
  'OwnerAgent': {
    model: 'claude-haiku-3.5',
    provider: 'anthropic',
    costTier: 'low',
    description: 'Fast responses for user interactions'
  },
  'Supervisor': {
    model: 'claude-haiku-3.5',
    provider: 'anthropic',
    costTier: 'low',
    description: 'Workflow coordination - fast, lightweight'
  },

  // MEDIUM COST - Sonnet 4.5 ($3.00/$15.00 per 1M) or GPT-4o ($2.50/$10.00 per 1M)
  'ResearchAgent': {
    model: 'gpt-4o',
    provider: 'openai',
    costTier: 'medium',
    description: 'Research orchestration - needs good reasoning'
  },
  'GeminiAgent': {
    model: 'gpt-4o',
    provider: 'openai',
    costTier: 'medium',
    description: 'General AI tasks - balanced cost/quality'
  },
  'OrchestratorAgent': {
    model: 'claude-sonnet-4.5',
    provider: 'anthropic',
    costTier: 'medium',
    description: 'Complex orchestration - needs strong reasoning'
  },

  // HIGH COST - Only for critical reasoning tasks
  'DeepReasoningAgent': {
    model: 'claude-sonnet-4.5',
    provider: 'anthropic',
    costTier: 'medium', // Not 'high' - Sonnet is still reasonable
    description: 'Deep analysis - complex reasoning required'
  },
  'JulesFeedbackAgent': {
    model: 'claude-sonnet-4.5',
    provider: 'anthropic',
    costTier: 'medium',
    description: 'Advanced routing and deep technical reasoning for PR creation'
  },
};

/**
 * Get the configured model for a specific agent
 * @param agentName - Name of the agent
 * @returns Model configuration for the agent
 */
export function getAgentModel(agentName: AgentName): ModelConfig {
  const config = AGENT_MODEL_CONFIG[agentName];
  if (!config) {
    throw new Error(`No model configuration found for agent: ${agentName}`);
  }
  return config;
}

/**
 * Get just the model string for an agent (convenience function)
 * @param agentName - Name of the agent
 * @returns Model string (e.g., 'gpt-4o', 'claude-haiku-3.5')
 */
export function getAgentModelName(agentName: AgentName): string {
  return getAgentModel(agentName).model;
}

/**
 * Get all agents using a specific cost tier
 * @param tier - Cost tier to filter by
 * @returns Array of agent names using that tier
 */
export function getAgentsByCostTier(tier: ModelConfig['costTier']): AgentName[] {
  return Object.entries(AGENT_MODEL_CONFIG)
    .filter(([_, config]) => config.costTier === tier)
    .map(([name, _]) => name as AgentName);
}

/**
 * Calculate estimated cost for a conversation
 * @param agentName - Name of the agent
 * @param inputTokens - Number of input tokens
 * @param outputTokens - Number of output tokens
 * @returns Estimated cost in USD
 */
export function estimateAgentCost(
  agentName: AgentName,
  inputTokens: number,
  outputTokens: number
): number {
  const config = getAgentModel(agentName);
  
  // Cloudflare Workers AI is free
  if (config.provider === 'cloudflare') {
    return 0;
  }

  // Simplified pricing (would need to import PRICING_CATALOG for exact pricing)
  const pricing: Record<string, { input: number; output: number }> = {
    'gpt-4o-mini': { input: 0.15, output: 0.60 },
    'gpt-4o': { input: 2.50, output: 10.00 },
    'claude-haiku-3.5': { input: 0.80, output: 4.00 },
    'claude-sonnet-4.5': { input: 3.00, output: 15.00 },
  };

  const modelPricing = pricing[config.model];
  if (!modelPricing) {
    return 0; // Unknown model, return 0
  }

  const inputCost = (inputTokens / 1_000_000) * modelPricing.input;
  const outputCost = (outputTokens / 1_000_000) * modelPricing.output;

  return inputCost + outputCost;
}
