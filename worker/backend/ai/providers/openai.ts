// Dynamically imported
import { getAiGatewayUrl, resolveDefaultAiModel } from "./config";
import { getAIGatewayUrl as getRawGatewayUrl } from "../utils/ai-gateway";
import { getOpenaiApiKey } from "@utils/secrets";
import { cleanJsonOutput } from "@/ai/utils/sanitizer";
import { AIOptions, TextWithToolsResponse, StructuredWithToolsResponse } from "./index";

export async function createOpenAIClient(env: Env) {
  // @ts-ignore
  const aigToken = typeof env.AI_GATEWAY_TOKEN === 'object' && env.AI_GATEWAY_TOKEN?.get ? await env.AI_GATEWAY_TOKEN.get() : env.AI_GATEWAY_TOKEN as string;

  // "Key in Request + Authenticated Gateway" pattern:
  // - apiKey: REAL OpenAI key (SDK sends as Authorization: Bearer)
  // - cf-aig-authorization: gateway token (for gateway auth/logging)
  const apiKey = await getOpenaiApiKey(env);

  if (!apiKey) {
    throw new Error("Missing OPENAI_API_KEY — required for SDK auth");
  }

  const OpenAIModule = await import("openai");
  const OpenAIClass = OpenAIModule.default || Object.values(OpenAIModule).find((m: any) => m && m.name === 'OpenAI') || OpenAIModule;
  const baseURL = await getAiGatewayUrl(env, "openai");

  return new (OpenAIClass as any)({
    apiKey: apiKey,
    baseURL,
    defaultHeaders: aigToken ? { 'cf-aig-authorization': `Bearer ${aigToken}` } : undefined,
  });
}

export async function verifyApiKey(env: Env): Promise<boolean> {
  try {
    const client = await createOpenAIClient(env);
    await client.models.list();
    return true;
  } catch (error) {
    console.error("OpenAI Verification Error:", error);
    return false;
  }
}

export async function generateText(
  env: Env,
  prompt: string,
  systemPrompt?: string,
  options?: AIOptions
): Promise<string> {
  const client = await createOpenAIClient(env);
  const model = options?.model || resolveDefaultAiModel(env, "openai");

  const messages: any[] = [];
  if (systemPrompt) messages.push({ role: "system", content: systemPrompt });
  messages.push({ role: "user", content: prompt });

  const response = await client.chat.completions.create({
    model,
    messages,
    temperature: options?.temperature,
    max_tokens: options?.maxTokens,
  });

  return response.choices[0]?.message?.content || "";
}

export async function generateStructuredResponse<T = any>(
  env: Env,
  prompt: string,
  schema: object,
  systemPrompt?: string,
  options?: AIOptions
): Promise<T> {
  const client = await createOpenAIClient(env);
  const model = options?.model || resolveDefaultAiModel(env, "openai");

  const messages: any[] = [];
  if (systemPrompt) messages.push({ role: "system", content: systemPrompt });
  messages.push({ role: "user", content: prompt });

  const response = await client.chat.completions.create({
    model,
    messages,
    temperature: options?.temperature,
    max_tokens: options?.maxTokens,
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "structured_output",
        schema: schema as any,
        strict: true
      }
    }
  });

  return JSON.parse(cleanJsonOutput(response.choices[0]?.message?.content || "{}")) as T;
}

export async function generateTextWithTools(
  env: Env,
  prompt: string,
  tools: any[],
  systemPrompt?: string,
  options?: AIOptions
): Promise<TextWithToolsResponse> {
  const client = await createOpenAIClient(env);
  const model = options?.model || resolveDefaultAiModel(env, "openai");

  const messages: any[] = [];
  if (systemPrompt) messages.push({ role: "system", content: systemPrompt });
  messages.push({ role: "user", content: prompt });

  const response = await client.chat.completions.create({
    model,
    messages,
    tools,
    temperature: options?.temperature,
    max_tokens: options?.maxTokens,
  });

  const msg = response.choices[0]?.message;
  return {
    text: msg?.content || "",
    toolCalls: msg?.tool_calls?.map((tc: any) => ({
      id: tc.id,
      function: { name: tc.function?.name, arguments: tc.function?.arguments }
    })) || []
  };
}

export async function generateStructuredWithTools<T = any>(
  env: Env,
  prompt: string,
  schema: object,
  tools: any[],
  systemPrompt?: string,
  options?: AIOptions
): Promise<StructuredWithToolsResponse<T>> {
  const client = await createOpenAIClient(env);
  const model = options?.model || resolveDefaultAiModel(env, "openai");

  const messages: any[] = [];
  if (systemPrompt) messages.push({ role: "system", content: systemPrompt });
  messages.push({ role: "user", content: prompt });

  const response = await client.chat.completions.create({
    model,
    messages,
    tools,
    temperature: options?.temperature,
    max_tokens: options?.maxTokens,
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "structured_output",
        schema: schema as any,
        strict: true
      }
    }
  });

  const msg = response.choices[0]?.message;
  return {
    data: JSON.parse(cleanJsonOutput(msg?.content || "{}")) as T,
    toolCalls: msg?.tool_calls?.map((tc: any) => ({
      id: tc.id,
      function: { name: tc.function?.name, arguments: tc.function?.arguments }
    })) || []
  };
}