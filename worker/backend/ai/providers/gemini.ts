// Dynamically imported
import { getAiGatewayUrl, resolveDefaultAiModel } from "./config";
import { getAIGatewayUrl as getRawGatewayUrl } from "../utils/ai-gateway";
import { cleanJsonOutput } from "@/ai/utils/sanitizer";
import { AIOptions, TextWithToolsResponse, StructuredWithToolsResponse } from "./index";

export async function createGeminiClient(env: Env, model: string) {
  // @ts-ignore
  const aigToken = typeof env.AI_GATEWAY_TOKEN === 'object' && env.AI_GATEWAY_TOKEN?.get ? await env.AI_GATEWAY_TOKEN.get() : env.AI_GATEWAY_TOKEN as string;

  if (!aigToken || !env.CLOUDFLARE_ACCOUNT_ID) {
    throw new Error("Missing AI_GATEWAY_TOKEN and CLOUDFLARE_ACCOUNT_ID required for BYOK configuration");
  }

  const { GoogleGenAI } = await import("@google/genai");
  const baseUrl = await getRawGatewayUrl(env, { provider: "google-ai-studio" });

  const originalFetch = globalThis.fetch;
  
  // Intercept the fetch call to strip dummy keys and inject the Gateway Authorization
  const wrappedFetch = async (url: any, init: any) => {
    const newInit = { ...init };
    if (newInit.headers) {
      const headers = new Headers(newInit.headers);
      
      // Strip the SDK-enforced dummy key so it doesn't override the Gateway's BYOK injection
      headers.delete("x-goog-api-key");
      
      // Apply the AI Gateway token for Gateway auth
      if (aigToken && !headers.has("cf-aig-authorization")) {
          headers.set("cf-aig-authorization", `Bearer ${aigToken}`);
      }
      
      const headerObj: Record<string, string> = {};
      headers.forEach((value, key) => {
          headerObj[key] = value;
      });
      newInit.headers = headerObj;
    }

    let finalUrl = String(url);
    try {
        const u = new URL(finalUrl);
        // Strip the query parameter ?key= if the SDK appended the dummy key
        if (u.searchParams.has("key")) {
            u.searchParams.delete("key");
            finalUrl = u.toString();
        }
    } catch (e) { /* ignore url parsing errors */ }

    return await originalFetch(finalUrl, newInit);
  };
  
  // Monkey-patch temporarily for this instance creation
  globalThis.fetch = wrappedFetch as unknown as typeof fetch;

  try {
    const client = new GoogleGenAI({
      // Pass a dummy key to bypass SDK validation. 
      // The real key is stored in Cloudflare AI Gateway (BYOK)
      apiKey: "cf-aig-byok-dummy-key",
      httpOptions: {
        baseUrl,
      },
    });
    
    return client;
  } finally {
     // We leave fetch patched currently as the client resolves requests asynchronously later
  }
}

export async function verifyApiKey(env: Env): Promise<boolean> {
  try {
    const testModel = "gemini-2.5-flash";
    const client = await createGeminiClient(env, testModel);
    await client.models.get({ model: testModel });
    return true;
  } catch (error) {
    console.error("Gemini BYOK Verification Error:", error);
    return false;
  }
}

export async function generateText(
  env: Env,
  prompt: string,
  systemPrompt?: string,
  options?: AIOptions
): Promise<string> {
  const model = options?.model || resolveDefaultAiModel(env, "gemini");
  const client = await createGeminiClient(env, model);

  const response = await client.models.generateContent({
    model,
    config: {
      systemInstruction: systemPrompt,
      temperature: options?.temperature,
      maxOutputTokens: options?.maxTokens,
    },
    contents: [{ role: "user", parts: [{ text: prompt }] }]
  });

  return response.text || "";
}

export async function generateStructuredResponse<T = any>(
  env: Env,
  prompt: string,
  schema: object,
  systemPrompt?: string,
  options?: AIOptions
): Promise<T> {
  const model = options?.model || resolveDefaultAiModel(env, "gemini");
  const client = await createGeminiClient(env, model);

  const response = await client.models.generateContent({
    model,
    config: {
      systemInstruction: systemPrompt,
      temperature: options?.temperature,
      maxOutputTokens: options?.maxTokens,
      responseMimeType: "application/json",
      responseSchema: schema as any,
    },
    contents: [{ role: "user", parts: [{ text: prompt }] }]
  });

  return JSON.parse(cleanJsonOutput(response.text || "{}")) as T;
}

export async function generateTextWithTools(
  env: Env,
  prompt: string,
  tools: any[],
  systemPrompt?: string,
  options?: AIOptions
): Promise<TextWithToolsResponse> {
  const model = options?.model || resolveDefaultAiModel(env, "gemini");
  const client = await createGeminiClient(env, model);

  const functionDeclarations = tools.map((t) => t.function);

  const response = await client.models.generateContent({
    model,
    config: {
      systemInstruction: systemPrompt,
      temperature: options?.temperature,
      maxOutputTokens: options?.maxTokens,
      tools: [{ functionDeclarations }] as any,
    },
    contents: [{ role: "user", parts: [{ text: prompt }] }]
  });

  const toolCalls = response.functionCalls?.map((call, index) => ({
    id: `call_${index}`, 
    function: {
      name: call.name || "unknown",
      arguments: JSON.stringify(call.args || {})
    }
  })) || [];

  return {
    text: response.text || "",
    toolCalls,
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
  const model = options?.model || resolveDefaultAiModel(env, "gemini");
  const client = await createGeminiClient(env, model);

  const functionDeclarations = tools.map((t) => t.function);

  const response = await client.models.generateContent({
    model,
    config: {
      systemInstruction: systemPrompt,
      temperature: options?.temperature,
      maxOutputTokens: options?.maxTokens,
      tools: [{ functionDeclarations }] as any,
      responseMimeType: "application/json",
      responseSchema: schema as any,
    },
    contents: [{ role: "user", parts: [{ text: prompt }] }]
  });

  const toolCalls = response.functionCalls?.map((call, index) => ({
    id: `call_${index}`,
    function: {
      name: call.name || "unknown",
      arguments: JSON.stringify(call.args || {})
    }
  })) || [];

  return {
    data: JSON.parse(cleanJsonOutput(response.text || "{}")) as T,
    toolCalls,
  };
}