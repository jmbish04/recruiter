/**
 * AI SDK Orchestration Module
 * * Provides the BaseAgent class and factory functions to bridge 
 * Cloudflare Durable Objects with the OpenAI Agents SDK via AI Gateway.
 * * Verified: 2026-02-08 | Target: Cloudflare Workers / OpenAI Agents SDK
 */

import { OpenAI } from 'openai';
import { 
  Agent as OpenAIAgent, 
  run, 
  type AgentInputItem, 
  withTrace, 
  RunResult, 
  type AgentOutputType, 
  setDefaultOpenAIClient,
  setOpenAIAPI,
  Runner,
  OpenAIProvider,
  type ModelProvider
} from "@openai/agents";
import { 
  Agent as CFAgent, 
  callable 
} from "agents";
import { getOpenaiApiKey, getGeminiApiKey, getAnthropicApiKey } from "@utils/secrets";
import { 
  getAgentModel, 
  getAiGatewayUrl as getAiGatewayBaseUrl, 
  getCompatModelName,
  type GatewayUseCase,
  resolveDefaultAiProvider,
  resolveDefaultAiModel,
  type SupportedProvider
} from "@/ai/providers/config";
import { z } from "zod";

/**
 * Standard state shape for any agent.
 */
export interface BaseAgentState {
  status: "idle" | "running" | "optimizing" | "paused" | "failed" | "completed" | string;
  history: any[]; 
  lastResult?: any;
}

/**
 * Standard Tool interface for Agents
 */
export interface Tool {
  name: string;
  description: string;
  parameters: z.ZodType<any>;
  execute: (args: any) => Promise<any>;
}

/**
 * Creates a scoped OpenAI client configured for the AI Gateway.
 * Returns the client instance to be injected into run(), avoiding global state race conditions.
 */
import { BudgetTracker } from "@/ai/utils/budget-tracker";
import { Logger } from "@/lib/logger";

/**
 * Creates a scoped OpenAI client configured for the AI Gateway.
 * Returns the client instance to be injected into run(), avoiding global state race conditions.
 */
export async function createGatewayClient(
  env: Env, 
  modelSlug: string, 
  debugTag?: string,
  tracking?: { sessionId?: string; documentId?: string; workflowName?: string }
): Promise<OpenAI> {
  const isNativeOpenAI = modelSlug.startsWith('openai/');
  const useCase: GatewayUseCase = isNativeOpenAI ? 'openai_sdk' : 'openai_agents_sdk';
  
  const baseUrl = await getAiGatewayBaseUrl(env, modelSlug, useCase);
  const budgetTracker = new BudgetTracker(env);

  // 1. HARD STOP: Check budget before creating client
  // If budget exceeded, this throws and halts execution immediately.
  await budgetTracker.checkBudgetStrict();

  /**
   * FIX: Workers AI defaults to a very low max_tokens, truncating long responses.
   * The SDK sees finish_reason: "length" and loops until maxTurns is exceeded.
   * @openai/agents v0.4.6 has no model_settings support, so we inject via fetch wrapper.
   */
  const wrappedFetch: typeof globalThis.fetch = async (input, init) => {
    let bodyObj: any = {};
    
    if (init?.body && typeof init.body === 'string') {
      try {
        bodyObj = JSON.parse(init.body);
        if (!bodyObj.max_tokens) {
          bodyObj.max_tokens = 4096;
        }
        if (bodyObj.temperature === undefined) {
          bodyObj.temperature = 0.1;
        }
        init = { ...init, body: JSON.stringify(bodyObj) };
      } catch(error) {
        const errMsg = error instanceof Error ? error.message : String(error);
        console.log(`[AI-CONFIG] Error parsing request body: ${errMsg}`);
        const logger = new Logger(env, "AI-AGENT-SDK-CONFIG");
        logger.error(`Error parsing request body`, { error });
        await logger.flush();
      }
    }
    
    const response = await globalThis.fetch(input, init);

    // 2. USAGE TRACKING (Fire-and-forget-ish)
    // We clone response to read usage without consuming original stream body if needed, 
    // but typically OpenAI returns usage in the JSON body.
    // For streaming, usage handles are trickier. Assuming non-streaming for Agents SDK default.
    // Actually, Agents SDK uses standard completions, often non-streaming for tools.
    // Let's try to peek at the cloned response.
    const clone = response.clone();
    clone.json().then((data: any) => {
        if (data?.usage) {
            budgetTracker.trackUsage({
                model: modelSlug,
                inputTokens: data.usage.prompt_tokens || 0,
                outputTokens: data.usage.completion_tokens || 0,
                sessionId: tracking?.sessionId,
                documentId: tracking?.documentId,
                workflowName: tracking?.workflowName
            }).catch(e => console.error("[BudgetTracker] Background logging failed", e));
        }
    }).catch(() => { /* ignore json parse errors on clone */ });

    return response;
  };

  // LOGGING: Explicitly stated model usage as requested
  const logger = new Logger(env, "AI-CONFIG");
  const useOpenAI = env.USE_OPENAI_MODELS || false;
  const tag = debugTag ? `[${debugTag}]` : '';
  const logMsg = useOpenAI 
    ? `🟢 USING OPENAI MODELS (Reliability Mode)${tag}` 
    : `🟠 USING WORKER-AI MODELS (Falback/Cost Mode)${tag}`;
  
  logger.info(logMsg, { useOpenAI, debugTag, modelSlug });

  // Get AI Gateway token from Secrets Store
  let apiToken = "";
  try {
    apiToken = await env.AI_GATEWAY_TOKEN.get();
  } catch (e) {
    // empty
  }

  if (!apiToken) {
    try {
      // Fallback to CLOUDFLARE_API_TOKEN if gateway token is missing
      apiToken = await env.CLOUDFLARE_API_TOKEN.get();
      if (apiToken) logger.warn(`⚠️ Using CLOUDFLARE_API_TOKEN as fallback`);
    } catch (e) {
        // empty
    }
  }

  if (!apiToken) {
    logger.error("❌ Missing AI_GATEWAY_TOKEN and CLOUDFLARE_API_TOKEN. Using dummy key to prevent immediate crash.");
    apiToken = "dummy-key-for-sdk-init"; 
  }

  return new OpenAI({ 
    baseURL: baseUrl, 
    apiKey: apiToken,
    dangerouslyAllowBrowser: true,
    fetch: wrappedFetch,
  });
}

// ===================================
// SDK Legacy/Compat Utilities
// ===================================

export async function createRunner(
  env: Env,
  provider?: SupportedProvider,
  model?: string,
): Promise<Runner> {
  const resolvedProvider = provider || resolveDefaultAiProvider(env);
  const resolvedModel = model || resolveDefaultAiModel(env, resolvedProvider);
  
  // Reuse createGatewayClient logic for token/url resolution
  // but we need standard OpenAIProvider for Runner
  
  // Get AI Gateway Token
  let aigToken = "";
  try { aigToken = await env.AI_GATEWAY_TOKEN.get(); } catch (e) { /* ignore */ }

  // Resolve Real API Key based on provider
  let apiKey = "";
  if (resolvedProvider === 'openai') {
      apiKey = await getOpenaiApiKey(env) || "";
  } else if (resolvedProvider === 'google-ai-studio' || resolvedProvider === 'gemini') {
      apiKey = await getGeminiApiKey(env) || "";
  } else if (resolvedProvider === 'anthropic') {
      apiKey = await getAnthropicApiKey(env) || "";
  }

  // Fallback if no real key found
  if (!apiKey) {
      try { apiKey = await env.CLOUDFLARE_API_TOKEN.get(); } catch (e) { /* ignore */ }
  }
  if (!apiKey) apiKey = "dummy-key";

  // Get URL
  const baseURL = await getAiGatewayBaseUrl(env, resolvedProvider, 'openai_agents_sdk');

  // Custom fetch wrapper to inject gateway headers and defaults
  const wrappedFetch: typeof globalThis.fetch = async (input, init) => {
    let newInit = init ? { ...init } : {};
    
    // Inject Gateway Auth Header
    if (aigToken) {
        newInit.headers = {
            ...(newInit.headers || {}),
            'cf-aig-authorization': `Bearer ${aigToken}`
        };
    }

    // OpenAI Agents SDK has no built-in max_tokens config for Runner, so we inject safely
    if (newInit.body && typeof newInit.body === 'string') {
        try {
            const bodyObj = JSON.parse(newInit.body);
            if (!bodyObj.max_tokens) bodyObj.max_tokens = 4096;
            if (bodyObj.temperature === undefined) bodyObj.temperature = 0.1;
            newInit.body = JSON.stringify(bodyObj);
        } catch(e) {
            /* ignore parsing errors */
        }
    }

    return globalThis.fetch(input, newInit);
  };

  const client = new OpenAI({ 
    baseURL, 
    apiKey,
    dangerouslyAllowBrowser: true,
    fetch: wrappedFetch,
  });

  const modelProvider: ModelProvider = new OpenAIProvider({
    openAIClient: client,  // Use the pre-configured custom client instead of letting it build one
  });

  return new Runner({
    modelProvider,
    model: resolvedModel,
  });
}

export async function runTextAgent(options: {
  env: Env;
  provider?: SupportedProvider;
  model?: string;
  name: string;
  instructions: string;
  input: string;
}): Promise<string> {
  const provider = options.provider || resolveDefaultAiProvider(options.env);
  const model = options.model || resolveDefaultAiModel(options.env, provider);
  const runner = await createRunner(options.env, provider, model);
  const agent = new OpenAIAgent({
    name: options.name,
    instructions: options.instructions,
    model: getCompatModelName(model), // Ensure compat prefix
  });

  const result = await runner.run(agent, options.input);
  return String(result.finalOutput ?? "");
}

// ===================================
// Base Classes & Exports
// ===================================

/**
 * The Mother Base Class (Forensic Agent Core).
 * Wraps Cloudflare Durable Object lifecycle with OpenAI Agent capabilities.
 */
export abstract class BaseAgent<
  TEnv extends Cloudflare.Env = Cloudflare.Env,
  State extends BaseAgentState = BaseAgentState
> extends CFAgent<TEnv, State> {
  
  initialState: State = {
    status: "idle",
    history: []
  } as unknown as State;

  private _logger?: Logger;

  protected get logger(): Logger {
    return this._logger ?? new Logger(this.env as unknown as Env, this.constructor.name);
  }

  protected set logger(value: Logger) {
    this._logger = value;
  }

  protected setStatus(status: State["status"]) {
    if (this.state.status !== status) {
       this.logger.info(`Status changed: ${this.state.status} -> ${status}`);
    }
    this.setState({
      ...this.state,
      status
    });
  }

  /**
   * CORE METHOD: Runs an OpenAI Agent within the Cloudflare context.
   * Dynamically syncs the Gateway before execution and prefixes model names.
   */

  protected async runAgent(
    agent: OpenAIAgent,
    input: string | AgentInputItem[],
    context?: string,
    maxTurns: number = 3
  ): Promise<RunResult<any, any>> {
    const traceTitle = `Run ${agent.name}`;
    
    // Extract sessionId from state if available
    // We assume state.history might contain session context or we can add it to BaseAgentState
    // Fallback to 'unknown-session' if not present in state (requiring subclasses to populate it if needed)
    const sessionId = (this.state as any).sessionId || 'unknown-session';

    return await withTrace(traceTitle, async () => {
      // 1. Prepare Input
      let inputItems: AgentInputItem[] = typeof input === 'string' 
        ? [{ role: "user", content: input }] 
        : input;

      if (context) {
        inputItems = [{ role: "system", content: context }, ...inputItems];
      }

      this.logger.info(`🤖 Executing ${agent.name} (maxTurns=${maxTurns})...`, { 
        inputLength: JSON.stringify(input).length 
      });
      
      try {
        // 2. Resolve model and sync Gateway
        const rawModel = typeof agent.model === 'string' ? agent.model : getAgentModel('default', this.env);
        
        // CRITICAL FIX: Ensure the model name uses the workers-ai/ prefix for compat endpoints
        const compatModel = getCompatModelName(rawModel);
        
        // Update agent instance to use compat name for the OpenAI API call
        (agent as any).model = compatModel;

        const client = await createGatewayClient(this.env as unknown as Env, rawModel, agent.name, {
            sessionId: sessionId,
            workflowName: this.constructor.name
        });
        
        // 3. Execute with turn limit
        // @ts-ignore - 'client' option exists in runtime but might be missing in strict types
        const result = await run(agent, inputItems, { maxTurns, client });
        return result;
      } catch (error: any) {
        this.logger.error(`💥 Execution Error: ${error.message}`, { error });
        this.setStatus("failed");
        throw error;
      }
    });
  }

  /**
   * PATTERN: Evaluator-Optimizer Loop.
   */
  protected async runOptimizationLoop(
    input: string,
    config: {
      generator: OpenAIAgent;
      evaluator: OpenAIAgent;
      maxAttempts?: number;
    }
  ): Promise<string> {
    const { generator, evaluator, maxAttempts = 3 } = config;
    let attempts = 0;
    let currentInput: AgentInputItem[] = [{ role: "user", content: input }];

    this.setStatus("optimizing");

    while (attempts < maxAttempts) {
      const genResult = await this.runAgent(generator, currentInput);
      const content = genResult.finalOutput;
      
      if (!content) throw new Error("Generator produced no output");

      const evalResult = await this.runAgent(evaluator, [
        { role: "user", content: `Original Request: ${input}\n\nGenerated Content: ${content}` }
      ]);
      
      const judgment = evalResult.finalOutput as any;
      const passed = judgment?.score === "pass" || judgment?.status === "approved";

      this.setState({
        ...this.state,
        history: [
          ...this.state.history,
          { attempt: attempts + 1, content, feedback: judgment?.feedback, passed }
        ]
      });

      if (passed) {
        this.setStatus("completed");
        return content as string;
      }

      console.log(`[${this.constructor.name}] ↺ Loop ${attempts + 1} failed. Feedback: ${judgment?.feedback}`);
      this.logger.warn(`↺ Loop ${attempts + 1} failed`, { feedback: judgment?.feedback });
      
      currentInput = [
        ...genResult.history,
        { role: "user", content: `Feedback: ${judgment?.feedback}. Please improve your previous response.` }
      ];
      attempts++;
    }

    this.setStatus("failed");
    return "Max optimization attempts reached.";
  }
}

/**
 * Interface for standalone Gateway Agents.
 */
export interface GatewayAgentInterface<Output extends AgentOutputType> {
  agent: OpenAIAgent<unknown, Output>;
  run(input: string, context?: string): Promise<{ data: any }>;
}

/**
 * Factory: Creates a standalone agent with built-in auto-fallback.
 */
export async function createGatewayAgent<Output extends AgentOutputType = any>(
  env: Cloudflare.Env, 
  model: string, 
  systemPrompt: string, 
  outputSchema?: Output,
  tracking?: { sessionId?: string; documentId?: string; workflowName?: string }
): Promise<GatewayAgentInterface<Output>> {

  // Initialize the agent — model will be overridden to compat name before run
  const agent = new OpenAIAgent({
    name: "GatewayAgent",
    model: model,
    instructions: systemPrompt,
    outputType: outputSchema || ("text" as any),
  });

  return {
    agent,
    run: async (input: string, context?: string) => {
      const inputItems: AgentInputItem[] = context 
        ? [{ role: "system", content: context }, { role: "user", content: input }]
        : [{ role: "user", content: input }];

      // 1. Create scoped client (injects wrappedFetch with max_tokens:4096 + temperature:0.1)
      const client = await createGatewayClient(env as unknown as Env, model, "GatewayAgent", tracking);

      // 2. Fix compat model name — @cf/ models need workers-ai/ prefix for /compat endpoint
      const compatModel = getCompatModelName(model);
      (agent as any).model = compatModel;

      try {
        // @ts-ignore - client injection
        const result = await run(agent, inputItems, { client });
        return { data: result.finalOutput };
      } catch (error: any) {
        const logger = new Logger(env as unknown as Env, "GatewayAgent");
        logger.warn(`Primary failed (${compatModel})`, { error });
        logger.warn(`Switching to Fallback.`);

        // Fallback: same gateway sync pattern
        const fallbackModel = getAgentModel('fallback', env as unknown as Env);
        const fallbackClient = await createGatewayClient(env as unknown as Env, fallbackModel, "GatewayAgent-Fallback", tracking);

        const fallbackCompatModel = getCompatModelName(fallbackModel);
        const fallbackAgent = new OpenAIAgent({
            name: "GatewayAgent-Fallback",
            model: fallbackCompatModel,
            instructions: systemPrompt,
            outputType: outputSchema || ("text" as any),
        });

        // @ts-ignore - client injection
        const result = await run(fallbackAgent, inputItems, { client: fallbackClient });
        return { data: result.finalOutput };
      }
    }
  };
}


export { OpenAIAgent, OpenAIAgent as Agent, callable, withTrace, z };