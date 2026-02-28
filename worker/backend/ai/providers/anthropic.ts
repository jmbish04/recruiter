// Dynamically imported
import { getAiGatewayUrl, resolveDefaultAiModel } from "./config";
import { getAnthropicApiKey } from "@utils/secrets";
import { AIOptions, TextWithToolsResponse, StructuredWithToolsResponse } from "./index";

export async function createAnthropicClient(env: Env) {
  const apiKey = await getAnthropicApiKey(env);
  const aigToken = env.AI_GATEWAY_TOKEN ? await env.AI_GATEWAY_TOKEN.get() : "";

  if (!apiKey) {
    throw new Error("Missing ANTHROPIC_API_KEY in environment variables");
  }

  const { default: Anthropic } = await import("@anthropic-ai/sdk");
  return new Anthropic({
    apiKey: apiKey,
    baseURL: await getAiGatewayUrl(env, "anthropic", "anthropic_sdk"),
    defaultHeaders: aigToken ? { 'cf-aig-authorization': `Bearer ${aigToken}` } : undefined,
  });
}

export async function verifyApiKey(env: Env): Promise<boolean> {
  try {
    const client = await createAnthropicClient(env);
    await client.messages.create({
      model: "claude-3-5-sonnet-latest",
      max_tokens: 1,
      messages: [{ role: "user", content: "hi" }]
    });
    return true;
  } catch (error) {
    console.error("Anthropic Verification Error:", error);
    return false;
  }
}

export async function generateText(
  env: Env,
  prompt: string,
  systemPrompt?: string,
  options?: AIOptions
): Promise<string> {
  const client = await createAnthropicClient(env);
  const model = options?.model || resolveDefaultAiModel(env, "anthropic");

  const response = await client.messages.create({
    model,
    max_tokens: options?.maxTokens || 4096,
    temperature: options?.temperature,
    system: systemPrompt,
    messages: [{ role: "user", content: prompt }]
  });

  return (response.content.find((c: any) => c.type === 'text') as any)?.text || "";
}

export async function generateStructuredResponse<T = any>(
  env: Env,
  prompt: string,
  schema: object,
  systemPrompt?: string,
  options?: AIOptions
): Promise<T> {
  const client = await createAnthropicClient(env);
  const model = options?.model || resolveDefaultAiModel(env, "anthropic");

  const response = await client.messages.create({
    model,
    max_tokens: options?.maxTokens || 4096,
    temperature: options?.temperature,
    system: systemPrompt,
    messages: [{ role: "user", content: prompt }],
    tool_choice: { type: "tool", name: "structured_output" },
    tools: [{
      name: "structured_output",
      description: "Output strictly matching the required JSON schema",
      input_schema: schema as any
    }]
  });

  const toolCall = response.content.find((c: any) => c.type === "tool_use" && c.name === "structured_output");
  if (toolCall && toolCall.type === "tool_use") {
    return toolCall.input as T;
  }
  
  throw new Error("Anthropic failed to return the structured_output tool call");
}

export async function generateTextWithTools(
  env: Env,
  prompt: string,
  tools: any[],
  systemPrompt?: string,
  options?: AIOptions
): Promise<TextWithToolsResponse> {
  const client = await createAnthropicClient(env);
  const model = options?.model || resolveDefaultAiModel(env, "anthropic");

  const anthropicTools = tools.map((t) => ({
    name: t.function.name,
    description: t.function.description || "",
    input_schema: t.function.parameters as any
  }));

  const response = await client.messages.create({
    model,
    max_tokens: options?.maxTokens || 4096,
    temperature: options?.temperature,
    system: systemPrompt,
    messages: [{ role: "user", content: prompt }],
    tools: anthropicTools,
  });

  const text = (response.content.find((c: any) => c.type === "text") as any)?.text || "";
  const toolCalls = response.content
    .filter((c: any) => c.type === "tool_use")
    .map((c: any) => ({
      id: c.id,
      function: {
        name: c.name,
        arguments: JSON.stringify(c.input)
      }
    }));

  return { text, toolCalls };
}

export async function generateStructuredWithTools<T = any>(
  env: Env,
  prompt: string,
  schema: object,
  tools: any[],
  systemPrompt?: string,
  options?: AIOptions
): Promise<StructuredWithToolsResponse<T>> {
  const client = await createAnthropicClient(env);
  const model = options?.model || resolveDefaultAiModel(env, "anthropic");

  const structuredTool = {
    name: "structured_output",
    description: "Provide your final answered data here",
    input_schema: schema as any
  };

  const anthropicTools = [
    ...tools.map(t => ({
      name: t.function.name,
      description: t.function.description || "",
      input_schema: t.function.parameters as any
    })),
    structuredTool
  ];

  const contextualSystemPrompt = systemPrompt 
    ? `${systemPrompt}\nYou must use the 'structured_output' tool to output your final answer.`
    : "You must use the 'structured_output' tool to output your final answer.";

  const response = await client.messages.create({
    model,
    max_tokens: options?.maxTokens || 4096,
    temperature: options?.temperature,
    system: contextualSystemPrompt,
    messages: [{ role: "user", content: prompt }],
    tools: anthropicTools
  });

  const structureCall = response.content.find((c: any) => c.type === "tool_use" && c.name === "structured_output");
  const toolCalls = response.content
    .filter((c: any) => c.type === "tool_use" && c.name !== "structured_output")
    .map((c: any) => ({
      id: c.id,
      function: {
        name: c.name,
        arguments: JSON.stringify(c.input)
      }
    }));

  return {
    data: (structureCall?.type === "tool_use" ? structureCall.input : {}) as T,
    toolCalls
  };
}