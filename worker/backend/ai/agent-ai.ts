import { Agent, OpenAIProvider, Runner, type ModelProvider } from "@openai/agents";
import { getAiGatewayUrlForOpenAI } from "@/ai/utils/ai-gateway";

export type SupportedProvider =
  | "worker-ai"
  | "workers-ai"
  | "openai"
  | "gemini"
  | "google-ai-studio"
  | "anthropic";

export const DEFAULT_AI_PROVIDER: SupportedProvider = "worker-ai";
export const DEFAULT_WORKERS_AI_MODEL = "@cf/meta/llama-3.3-70b-instruct-fp8-fast";

const PROVIDER_TO_GATEWAY: Record<SupportedProvider, string> = {
  "worker-ai": "workers-ai",
  "workers-ai": "workers-ai",
  openai: "openai",
  gemini: "google-ai-studio",
  "google-ai-studio": "google-ai-studio",
  anthropic: "anthropic",
};

function normalizeProvider(provider?: string): SupportedProvider {
  if (!provider) {
    return DEFAULT_AI_PROVIDER;
  }

  const normalized = provider.toLowerCase().trim();
  if (normalized === "worker-ai" || normalized === "workers-ai") {
    return "worker-ai";
  }
  if (normalized === "openai") {
    return "openai";
  }
  if (normalized === "gemini" || normalized === "google" || normalized === "google-ai-studio") {
    return "gemini";
  }
  if (normalized === "anthropic") {
    return "anthropic";
  }

  return DEFAULT_AI_PROVIDER;
}

export function resolveDefaultAiProvider(env: Partial<Env>): SupportedProvider {
  const configured =
    (env as Partial<Env> & { AI_DEFAULT_PROVIDER?: string; AI_PROVIDER?: string }).AI_DEFAULT_PROVIDER ||
    (env as Partial<Env> & { AI_DEFAULT_PROVIDER?: string; AI_PROVIDER?: string }).AI_PROVIDER;
  return normalizeProvider(configured);
}

export function resolveDefaultAiModel(env: Partial<Env>, provider?: SupportedProvider): string {
  const model =
    (env as Partial<Env> & { AI_DEFAULT_MODEL?: string; WORKERS_AI_MODEL?: string }).AI_DEFAULT_MODEL ||
    (env as Partial<Env> & { AI_DEFAULT_MODEL?: string; WORKERS_AI_MODEL?: string }).WORKERS_AI_MODEL;
  if (model && model.trim()) {
    return model.trim();
  }

  const effectiveProvider = provider || resolveDefaultAiProvider(env);
  if (effectiveProvider === "worker-ai" || effectiveProvider === "workers-ai") {
    return DEFAULT_WORKERS_AI_MODEL;
  }

  // Keep a stable default even for other providers unless explicitly overridden.
  return DEFAULT_WORKERS_AI_MODEL;
}

async function resolveGatewayApiKey(env: Env): Promise<string> {
  const apiKey = await env.AI_GATEWAY_TOKEN.get();
  if (!apiKey) {
    throw new Error("AI_GATEWAY_TOKEN is required for OpenAI Agents SDK calls.");
  }
  return apiKey;
}

export async function getAiGatewayUrl(
  env: Env,
  provider: SupportedProvider,
): Promise<string> {
  const gatewayProvider = PROVIDER_TO_GATEWAY[provider];
  return getAiGatewayUrlForOpenAI(env, gatewayProvider);
}

export async function getAiBaseUrl(
  env: Env,
  provider: SupportedProvider,
): Promise<string> {
  return getAiGatewayUrlForOpenAI(env, provider);
}

export async function createRunner(
  env: Env,
  provider?: SupportedProvider,
  model?: string,
): Promise<Runner> {
  const resolvedProvider = provider || resolveDefaultAiProvider(env);
  const resolvedModel = model || resolveDefaultAiModel(env, resolvedProvider);
  const baseURL = await getAiBaseUrl(env, resolvedProvider);
  const apiKey = await resolveGatewayApiKey(env);

  const modelProvider: ModelProvider = new OpenAIProvider({
    apiKey,
    baseURL,
  });

  return new Runner({
    modelProvider,
    model: resolvedModel,
  });
}

interface AgentRunnerOptions {
  env: Env;
  provider?: SupportedProvider;
  model?: string;
  name: string;
  instructions: string;
  input: string;
}

async function prepareAgentAndRunner(options: AgentRunnerOptions) {
  const provider = options.provider || resolveDefaultAiProvider(options.env);
  const model = options.model || resolveDefaultAiModel(options.env, provider);
  const runner = await createRunner(options.env, provider, model);
  const agent = new Agent({
    name: options.name,
    instructions: options.instructions,
    model,
  });
  return { runner, agent };
}

export async function runTextAgent(options: AgentRunnerOptions): Promise<string> {
  const { runner, agent } = await prepareAgentAndRunner(options);
  const result = await runner.run(agent, options.input);
  return String(result.finalOutput ?? "");
}

export async function streamTextAgent(options: AgentRunnerOptions) {
  const { runner, agent } = await prepareAgentAndRunner(options);
  return runner.run(agent, options.input, { stream: true });
}
