import { resolveDefaultAiProvider, SupportedProvider } from "./config";
import * as openai from "./openai";
import * as gemini from "./gemini";
import * as anthropic from "./anthropic";
import * as workerAi from "./worker-ai";

export interface AIOptions {
  model?: string;
  temperature?: number;
  maxTokens?: number;
  sanitize?: boolean;
  effort?: "low" | "medium" | "high";
}

export interface ToolCall {
  id: string;
  function: {
    name: string;
    arguments: string;
  };
}

export interface TextWithToolsResponse {
  text: string;
  toolCalls: ToolCall[];
}

export interface StructuredWithToolsResponse<T> {
  data: T;
  toolCalls: ToolCall[];
}

/**
 * Core Routing Functions
 */

export async function verifyApiKey(env: Env, providerOverride?: SupportedProvider): Promise<boolean> {
  const provider = providerOverride || resolveDefaultAiProvider(env);
  switch (provider) {
    case 'openai': return openai.verifyApiKey(env);
    case 'gemini': return gemini.verifyApiKey(env);
    case 'anthropic': return anthropic.verifyApiKey(env);
    default: return workerAi.verifyApiKey(env);
  }
}

export async function generateText(
  env: Env,
  prompt: string,
  systemPrompt?: string,
  options?: AIOptions,
  providerOverride?: SupportedProvider
): Promise<string> {
  const provider = providerOverride || resolveDefaultAiProvider(env);
  switch (provider) {
    case 'openai': return openai.generateText(env, prompt, systemPrompt, options);
    case 'gemini': return gemini.generateText(env, prompt, systemPrompt, options);
    case 'anthropic': return anthropic.generateText(env, prompt, systemPrompt, options);
    default: return workerAi.generateText(env, prompt, systemPrompt, options);
  }
}

export async function generateStructuredResponse<T = any>(
  env: Env,
  prompt: string,
  schema: object,
  systemPrompt?: string,
  options?: AIOptions,
  providerOverride?: SupportedProvider
): Promise<T> {
  const provider = providerOverride || resolveDefaultAiProvider(env);
  switch (provider) {
    case 'openai': return openai.generateStructuredResponse<T>(env, prompt, schema, systemPrompt, options);
    case 'gemini': return gemini.generateStructuredResponse<T>(env, prompt, schema, systemPrompt, options);
    case 'anthropic': return anthropic.generateStructuredResponse<T>(env, prompt, schema, systemPrompt, options);
    default: return workerAi.generateStructuredResponse<T>(env, prompt, schema, systemPrompt, options);
  }
}

export async function generateTextWithTools(
  env: Env,
  prompt: string,
  tools: any[],
  systemPrompt?: string,
  options?: AIOptions,
  providerOverride?: SupportedProvider
): Promise<TextWithToolsResponse> {
  const provider = providerOverride || resolveDefaultAiProvider(env);
  switch (provider) {
    case 'openai': return openai.generateTextWithTools(env, prompt, tools, systemPrompt, options);
    case 'gemini': return gemini.generateTextWithTools(env, prompt, tools, systemPrompt, options);
    case 'anthropic': return anthropic.generateTextWithTools(env, prompt, tools, systemPrompt, options);
    default: return workerAi.generateTextWithTools(env, prompt, tools, systemPrompt, options);
  }
}

export async function generateStructuredWithTools<T = any>(
  env: Env,
  prompt: string,
  schema: object,
  tools: any[],
  systemPrompt?: string,
  options?: AIOptions,
  providerOverride?: SupportedProvider
): Promise<StructuredWithToolsResponse<T>> {
  const provider = providerOverride || resolveDefaultAiProvider(env);
  switch (provider) {
    case 'openai': return openai.generateStructuredWithTools<T>(env, prompt, schema, tools, systemPrompt, options);
    case 'gemini': return gemini.generateStructuredWithTools<T>(env, prompt, schema, tools, systemPrompt, options);
    case 'anthropic': return anthropic.generateStructuredWithTools<T>(env, prompt, schema, tools, systemPrompt, options);
    default: return workerAi.generateStructuredWithTools<T>(env, prompt, schema, tools, systemPrompt, options);
  }
}

export async function generateEmbedding(
  env: Env,
  text: string
): Promise<number[]> {
  return workerAi.generateEmbedding(env, text);
}

export async function generateEmbeddings(
  env: Env,
  text: string | string[]
): Promise<number[][]> {
  return workerAi.generateEmbeddings(env, text);
}

/**
 * Universal MCP & Context Helper Methods
 */

export async function rewriteQuestionForMCP(
  env: Env,
  question: string,
  context?: {
    bindings?: string[];
    libraries?: string[];
    tags?: string[];
    codeSnippets?: Array<{ file_path: string; code: string; relation: string }>;
  }
): Promise<string> {
  const systemPrompt = "You are a technical documentation assistant. Rewrite the user question to be clear, comprehensive, and optimized for querying Cloudflare documentation.";
  let prompt = `Original Question: ${question}\n\n`;

  if (context) {
    if (context.bindings?.length) prompt += `Bindings: ${context.bindings.join(", ")}\n`;
    if (context.libraries?.length) prompt += `Libraries: ${context.libraries.join(", ")}\n`;
    if (context.tags?.length) prompt += `Tags: ${context.tags.join(", ")}\n`;
    if (context.codeSnippets?.length) {
      prompt += `\nCode Context:\n${context.codeSnippets.map(s => `File: ${s.file_path} (${s.relation})\n${s.code.substring(0, 500)}...`).join("\n\n")}`;
    }
  }

  const schema = {
    type: "object",
    properties: {
      rewritten_question: { type: "string", description: "The technical, search-optimized question." }
    },
    required: ["rewritten_question"],
    additionalProperties: false
  };

  const result = await generateStructuredResponse<{ rewritten_question: string }>(env, prompt, schema, systemPrompt);
  return result.rewritten_question;
}

export async function analyzeResponseAndGenerateFollowUps(
  env: Env,
  originalQuestion: string,
  mcpResponse: any
): Promise<{ analysis: string; followUpQuestions: string[] }> {
  const systemPrompt = "You are a technical documentation analyst. Analyze responses from documentation and identify gaps.";
  const prompt = `Original Question: ${originalQuestion}\n\nDocumentation Response: ${JSON.stringify(mcpResponse, null, 2)}`;

  const schema = {
    type: "object",
    properties: {
      analysis: { type: "string", description: "Analysis of whether the response answers the question." },
      followUpQuestions: { type: "array", items: { type: "string" }, description: "2-3 specific follow-up questions." }
    },
    required: ["analysis", "followUpQuestions"],
    additionalProperties: false
  };

  return await generateStructuredResponse<{ analysis: string; followUpQuestions: string[] }>(env, prompt, schema, systemPrompt);
}