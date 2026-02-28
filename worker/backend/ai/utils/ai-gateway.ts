

export type AIGatewayProvider = "compat" | "worker-ai" | "google-ai-studio" | "openai";

interface GatewayOptions {
    provider: AIGatewayProvider;
    /**
     * Optional: If provided, appends the standard path for this provider's chat/generation endpoint.
     * - OpenAI: adds "/chat/completions"
     * - Google: adds "/{apiVersion}/models/{modelName}:generateContent"
     */
    modelName?: string;
    /**
     * Optional: API Version for the provider.
     * - Google Defaults: "v1" (can be set to "v1beta")
     * - OpenAI Defaults: N/A (usually handled by SDK or implied in path)
     */
    apiVersion?: string;
}

/**
 * Constructs the URL for Cloudflare AI Gateway.
 * * Usage:
 * 1. Base URL (for SDKs): getAIGatewayUrl(env, { provider: 'openai' })
 * 2. Full URL (for fetch): getAIGatewayUrl(env, { provider: 'google-ai-studio', modelName: 'gemini-1.5-pro', apiVersion: 'v1beta' })
 */
export async function getAIGatewayUrl(
    env: Env,
    options: GatewayOptions
): Promise<string> {
    let accountId: string = '';
    let gatewayName: string = '';
    // Check if CLOUDFLARE_ACCOUNT_ID is available
    try{
      accountId = typeof env.CLOUDFLARE_ACCOUNT_ID === 'object' && 'get' in env.CLOUDFLARE_ACCOUNT_ID
          ? await env.CLOUDFLARE_ACCOUNT_ID.get()
          : String(env.CLOUDFLARE_ACCOUNT_ID);
    }catch(e){
      throw new Error(`Missing CLOUDFLARE_ACCOUNT_ID in environment variables; ${JSON.stringify(e)}`);
    }

    // Check if AI_GATEWAY_NAME is available
    try{
      gatewayName = env.AI_GATEWAY_NAME;
    }catch(e){
      throw new Error(`Missing AI_GATEWAY_NAME in environment variables; ${JSON.stringify(e)}`);
    }

    let baseUrl = await env.AI.gateway(gatewayName).getUrl(options.provider);
    
    // Strip trailing slashes to prevent double-slashes when SDKs append paths
    baseUrl = baseUrl.replace(/\/+$/, "");

    // If no specific model/endpoint is requested, return the base SDK url
    if (!options.modelName) {
        return baseUrl;
    }

    // Append provider-specific suffixes for direct REST usage
    switch (options.provider) {
        case "openai":
            return `${baseUrl}/chat/completions`;

        case "google-ai-studio": {
            // Default to v1beta for Gemini 2.5 Flash and newer models.
            const version = options.apiVersion || "v1beta";
            
            // Google REST API format: .../{version}/models/{model}:generateContent
            return `${baseUrl}/${version}/models/${options.modelName}:generateContent`;
        }

        default:
            return baseUrl;
    }
}



const GATEWAY_PROVIDER_ALIASES: Record<string, string> = {
  "worker-ai": "workers-ai",
  "workers-ai": "workers-ai",
  openai: "openai",
  gemini: "google-ai-studio",
  google: "google-ai-studio",
  "google-ai-studio": "google-ai-studio",
  anthropic: "anthropic",
};

export function normalizeAiGatewayProvider(provider: string): string {
  const normalized = provider.toLowerCase().trim();
  return GATEWAY_PROVIDER_ALIASES[normalized] || normalized;
}

export async function getAiGatewayUrl(env: Env, provider: string, options?: { openaiCompat?: boolean }): Promise<string> {
  try {
    const normalizedProvider = normalizeAiGatewayProvider(provider);
    const gateway = env.AI.gateway(env.AI_GATEWAY_NAME);
    let baseUrl = await gateway.getUrl(normalizedProvider);
    
    baseUrl = baseUrl.replace(/\/+$/, "");

    // Workers AI requires /v1 suffix for OpenAI-format requests (chat completions).
    // When openaiCompat is true and provider is workers-ai, append /v1.
    if (options?.openaiCompat && normalizedProvider === 'workers-ai') {
      return `${baseUrl}/v1`;
    }

    return baseUrl;
  } catch (error: any) {
    console.error(`Failed to resolve AI Gateway URL for provider: ${provider}`, error);
    throw new Error(`Could not fetch gateway URL: ${error.message}`);
  }
}

/**
 * Returns the AI Gateway URL with /compat appended for Workers AI.
 * Use this when sending OpenAI-format requests (e.g. via OpenAI Agents SDK).
 */
export async function getAiGatewayUrlForOpenAI(env: Env, provider: string): Promise<string> {
  return getAiGatewayUrl(env, provider, { openaiCompat: true });
}

// Backward-compatible alias used by existing callsites.
export async function getAiBaseUrl(env: Env, provider: string): Promise<string> {
  return getAiGatewayUrl(env, provider);
}