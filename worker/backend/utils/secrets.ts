export async function getOpenaiApiKey(env: any) { 
  return await env.OPENAI_API_KEY.get(); 
}
export async function getGeminiApiKey(env: any) { 
  return await env.GEMINI_API_KEY.get(); 
}
export async function getAnthropicApiKey(env: any) { 
  return await env.ANTHROPIC_API_KEY.get(); 
}
