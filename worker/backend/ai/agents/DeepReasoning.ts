/**
 * @module DeepReasoningAgent
 * @description Cloudflare Durable Object Agent responsible for handling complex, 
 * deep-reasoning AI tasks using structured JSON schema outputs and multimodal model routing.
 * @version 1.0.0
 */

import { callable } from "agents";
import { resolveDefaultAiModel, resolveDefaultAiProvider, type SupportedProvider } from "@/ai/providers/config";
import { BaseAgentState } from "@/ai/agent-sdk";
import { BaseAgent } from "@/ai/agents/BaseAgent";
import { Logger } from "@logging";

/**
 * @interface DeepReasoningInput
 * @description Defines the expected JSON payload for deep reasoning requests.
 */
interface DeepReasoningInput {
  /** The core instruction or query for the AI to reason about. */
  prompt: string;
  /** The JSON schema defining the exact structure the AI must return. */
  schema: object;
  /** Optional override for the AI provider (e.g., "openai", "worker-ai"). */
  provider?: SupportedProvider;
  /** Optional parameters to tune the depth and verbosity of the reasoning process. */
  reasoningParams?: {
    effort?: "low" | "medium" | "high";
    summary?: "auto" | "concise" | "detailed";
  };
}

/**
 * @class DeepReasoningAgent
 * @extends BaseAgent<Env, BaseAgentState>
 * @description Maintains execution context and routing logic for deep reasoning inference.
 * Intercepts POST requests, resolves the appropriate AI provider/model, and enforces 
 * strict JSON schema compliance on the output.
 */
export class DeepReasoningAgent extends BaseAgent<BaseAgentState> {


  /**
   * @constructor
   * @param {DurableObjectState} state - The Durable Object state injected by Cloudflare.
   * @param {Env} env - Global environment bindings.
   */
  constructor(state: DurableObjectState, env: Env) {
    super(state, env);
    (this as any).logger = new Logger(env, "DeepReasoningAgent");
  }

  /**
   * @method fetch
   * @description Overrides the default CFAgent fetch to prevent strict Zod validation on /run.
   */
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (request.method === "POST" && url.pathname === "/run") {
      // Clone request so onRequest can read body. We bypass CFAgent's /run entirely because it expects { input: string }
      return this.onRequest(request.clone() as unknown as Request);
    }
    return super.fetch(request);
  }

  /**
   * @method healthProbe
   * @description A callable RPC endpoint to verify the agent's active status and timestamp.
   * @returns {Object} JSON object containing status, agent name, and current ISO timestamp.
   */
  @callable()
  healthProbe() {
    return {
      status: "ok",
      agent: "DeepReasoningAgent",
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * @method onRequest
   * @description The primary fetch handler for the Agent. Routes GET requests to the health probe
   * and POST requests to the generative reasoning workflow.
   * @param {Request} request - The incoming HTTP Request.
   * @returns {Promise<Response>} HTTP Response containing the structured AI output or an error.
   */
  async onRequest(request: Request): Promise<Response> {
    const url = new URL(request.url);
    
    // Route for health checks
    if (request.method === "GET" && url.pathname === "/health-probe") {
      return Response.json(this.healthProbe());
    }

    if (request.method !== "POST") {
      return new Response("Method not allowed", { status: 405 });
    }

    try {
      const payload = (await request.json()) as any;
      const defaultProvider = resolveDefaultAiProvider(this.env);
      
      // Support both `prompt` and `input` interchangeably to avoid strict SDK validation errors
      const promptText = payload.prompt || payload.input;
      const schemaObj = payload.schema || {};
      const provider = payload.provider || defaultProvider;
      
      // DEBUG: Verify environment keys are accessible for AI Gateway/Provider routing
      const hasAiGateway = !!(await this.env.AI_GATEWAY_TOKEN?.get?.() ?? this.env.AI_GATEWAY_TOKEN);
      const hasCfToken = !!(await this.env.CLOUDFLARE_API_TOKEN?.get?.() ?? this.env.CLOUDFLARE_API_TOKEN);
      const hasOpenAi = !!(await this.env.OPENAI_API_KEY?.get?.() ?? this.env.OPENAI_API_KEY); 
      

      
      if (!promptText) {
        return new Response("Missing prompt/input", { status: 400 });
      }

      this.logger.info("Executing deep reasoning", { promptLength: promptText.length, provider });

      const model = resolveDefaultAiModel(this.env, provider);

      const result = await this.runStructuredResponseWithModel({
        name: "DeepReasoningAgent",
        instructions: "You are a deep technical reasoning assistant. Return only output that matches the requested JSON schema.",
        prompt: promptText,
        schema: schemaObj as any,
        provider: provider as any,
        model: model
      });
      
      return Response.json(result ?? {});
    } catch (error: any) {
      this.logger.error("Deep reasoning failed", { error: error.message, stack: error.stack });
      return new Response(`Error: ${error.message}`, { status: 500 });
    }
  }
}