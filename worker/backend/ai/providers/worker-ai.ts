/**
 * @module WorkerAI
 * @description Centralized utility module for interacting with Cloudflare Workers AI via the OpenAI SDK and AI Gateway.
 */

import OpenAI from "openai";
import { resolveDefaultAiModel } from "./config";
import { cleanJsonOutput, sanitizeAndFormatResponse } from "@/ai/utils/sanitizer";
import { AIOptions, TextWithToolsResponse, StructuredWithToolsResponse } from "./index";

const REASONING_MODEL = "@cf/openai/gpt-oss-120b";
const STRUCTURING_MODEL = "@cf/meta/llama-4-scout-17b-16e-instruct";

/**
 * Helper to initialize the OpenAI client routed through Cloudflare AI Gateway
 */
async function getAIClient(env: Env) {
  const accountId = env.CLOUDFLARE_ACCOUNT_ID ? await env.CLOUDFLARE_ACCOUNT_ID.get() : "none-found";
  const gatewayId = env.AI_GATEWAY_NAME || "job-hunt";
  
  let gatewayToken = env.AI_GATEWAY_TOKEN ? await env.AI_GATEWAY_TOKEN.get() : "";

  const apiKey = env.CLOUDFLARE_API_TOKEN ? await env.CLOUDFLARE_API_TOKEN.get() : "dummy-key";
  
  return new OpenAI({
    apiKey: apiKey || "dummy-key",
    defaultHeaders: {
      "cf-aig-authorization": `Bearer ${gatewayToken}`
    },
    // Routes requests through AI Gateway's Universal/Compat endpoint
    baseURL: `https://gateway.ai.cloudflare.com/v1/${accountId}/${gatewayId}/compat`,
  });
}

/**
 * Prepends the required prefix for AI gateway universal routing
 */
function formatModelName(model: string): string {
  return model.startsWith("workers-ai/") ? model : `workers-ai/${model}`;
}

export async function verifyApiKey(env: Env): Promise<boolean> {
  try {
    const client = await getAIClient(env);
    await client.chat.completions.create({
      model: formatModelName(STRUCTURING_MODEL),
      messages: [{ role: "user", content: "hi" }],
      max_tokens: 1,
    });
    return true;
  } catch (error) {
    console.error("Workers AI Verification Error:", error);
    return false;
  }
}

export async function generateText(
  env: Env,
  prompt: string,
  systemPrompt?: string,
  options?: AIOptions
): Promise<string> {
  const client = await getAIClient(env);
  const rawModel = options?.model || resolveDefaultAiModel(env, "worker-ai") || REASONING_MODEL;
  const model = formatModelName(rawModel);

  const messages: any[] = [];
  if (systemPrompt) messages.push({ role: "system", content: systemPrompt });
  messages.push({ role: "user", content: prompt });

  // Map our custom effort to OpenAI's native reasoning_effort for supported models
  const isReasoningModel = model.includes("gpt-oss");
  const requestOptions: any = {
    model,
    messages,
  };

  if (isReasoningModel && options?.effort) {
    requestOptions.reasoning_effort = options.effort;
  }

  try {
    const response = await client.chat.completions.create(requestOptions);
    let textResult = response.choices[0]?.message?.content || "";

    if (options?.sanitize) {
      return sanitizeAndFormatResponse(textResult);
    }

    return textResult;
  } catch (error) {
    console.error("Workers AI Text Generation Error:", error);
    throw error;
  }
}

export async function generateStructuredResponse<T = any>(
  env: Env,
  prompt: string,
  schema: object,
  systemPrompt?: string,
  options?: AIOptions
): Promise<T> {
  const client = await getAIClient(env);
  const rawModel = options?.model || STRUCTURING_MODEL;
  const model = formatModelName(rawModel);

  const messages: any[] = [];
  if (systemPrompt) messages.push({ role: "system", content: systemPrompt });
  messages.push({ role: "user", content: prompt });

  try {
    const response = await client.chat.completions.create({
      model,
      messages,
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "structured_output",
          schema: schema as Record<string, unknown>,
          strict: true
        }
      }
    });

    const rawJson = response.choices[0]?.message?.content || "{}";
    return JSON.parse(cleanJsonOutput(rawJson)) as T;
  } catch (error) {
    console.error("Workers AI Structured Error:", error);
    throw error;
  }
}

export async function generateTextWithTools(
  env: Env,
  prompt: string,
  tools: any[],
  systemPrompt?: string,
  options?: AIOptions
): Promise<TextWithToolsResponse> {
  const client = await getAIClient(env);
  const rawModel = options?.model || STRUCTURING_MODEL;
  const model = formatModelName(rawModel);

  const messages: any[] = [];
  if (systemPrompt) messages.push({ role: "system", content: systemPrompt });
  messages.push({ role: "user", content: prompt });

  try {
    const response = await client.chat.completions.create({
      model,
      messages,
      tools: tools as any // assumes tools are already in OpenAI format
    });

    const message = response.choices[0]?.message;
    const text = message?.content || "";
    
    const toolCalls = (message?.tool_calls || []).map((tc: any) => ({
      id: tc.id || `call_${Math.random().toString(36).substr(2, 9)}`,
      function: {
        name: tc.function.name,
        arguments: tc.function.arguments
      }
    }));

    return { text, toolCalls };
  } catch (error) {
    console.error("Workers AI Tools Error:", error);
    throw error;
  }
}

export async function generateStructuredWithTools<T = any>(
  env: Env,
  prompt: string,
  schema: object,
  tools: any[],
  systemPrompt?: string,
  options?: AIOptions
): Promise<StructuredWithToolsResponse<T>> {
  const client = await getAIClient(env);
  const rawModel = options?.model || STRUCTURING_MODEL;
  const model = formatModelName(rawModel);

  const messages: any[] = [];
  if (systemPrompt) messages.push({ role: "system", content: systemPrompt });
  messages.push({ role: "user", content: prompt });

  try {
    const response = await client.chat.completions.create({
      model,
      messages,
      tools: tools as any,
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "structured_output",
          schema: schema as Record<string, unknown>,
          strict: true
        }
      }
    });

    const message = response.choices[0]?.message;
    const rawJson = message?.content || "{}";
    const data = JSON.parse(cleanJsonOutput(rawJson)) as T;
    
    const toolCalls = (message?.tool_calls || []).map((tc: any) => ({
      id: tc.id || `call_${crypto.randomUUID()}`,
      function: {
        name: tc.function.name,
        arguments: tc.function.arguments
      }
    }));

    return { data, toolCalls };
  } catch (error) {
    console.error("Workers AI Structured Tools Error:", error);
    throw error;
  }
}

export async function generateEmbedding(
  env: Env,
  text: string,
  model?: string
): Promise<number[]> {
  const rawModel = model || env.DEFAULT_MODEL_EMBEDDING;
  if (!rawModel) {
    throw new Error("DEFAULT_MODEL_EMBEDDING is not set in environment variables.");
  }

  // If the model explicitly requests an OpenAI preset, route through the AI Gateway Compat endpoint
  if (rawModel.startsWith("openai/")) {
    const client = await getAIClient(env);
    const model = formatModelName(rawModel);
    try {
      const response = await client.embeddings.create({
        model,
        input: text
      });
      return response.data[0].embedding;
    } catch (error: any) {
      console.error(`Workers AI OpenAI Embedding Error (${model}):`, error);
      throw error;
    }
  }

  // Otherwise, use the standard Cloudflare Workers AI execution
  try {
    const response = await env.AI.run(rawModel as any, { text: [text] });
    return (response as any).data[0];
  } catch (error) {
    console.error(`Workers AI Native Embedding Error (${rawModel}):`, error);
    throw error;
  }
}

export async function generateEmbeddings(env: Env, text: string | string[]): Promise<number[][]> {
  const rawModel = env.DEFAULT_MODEL_EMBEDDING;
  if (!rawModel) {
    throw new Error("DEFAULT_MODEL_EMBEDDING is not set in environment variables.");
  }

  const inputArray = Array.isArray(text) ? text : [text];

  if (rawModel.startsWith("openai/")) {
    const client = await getAIClient(env);
    const model = formatModelName(rawModel);
    try {
      const response = await client.embeddings.create({
        model,
        input: inputArray
      });
      return response.data.map(d => d.embedding);
    } catch (error: any) {
      console.error(`Workers AI OpenAI Embeddings Error (${model}):`, error);
      throw error;
    }
  }

  try {
    const response = await env.AI.run(rawModel as any, { text: inputArray });
    return (response as any).data;
  } catch (error) {
    console.error(`Workers AI Native Embeddings Error (${rawModel}):`, error);
    throw error;
  }
}