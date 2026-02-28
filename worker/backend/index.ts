import { app } from "./app";
import { ScraperAgent } from "@/ai/agents/ScraperAgent";
import { EvaluatorAgent } from "@/ai/agents/EvaluatorAgent";
import { WriterAgent } from "@/ai/agents/WriterAgent";

// -----------------------------------------------------------------------------
// Agent Exports
// -----------------------------------------------------------------------------
// Mandatory DO exports required by Cloudflare for the SQLite Agent bindings
export { ScraperAgent, EvaluatorAgent, WriterAgent };

// -----------------------------------------------------------------------------
// Cloudflare Worker Default Export
// -----------------------------------------------------------------------------
export default {
  /**
   * Primary HTTP Request Handler
   * 
   * Orchestrates the standard fetch lifecycle. Intercepts native API requests
   * first. If a route matches an agent binding, it terminates here. 
   * Otherwise, the request is passed through to Hono for REST capabilities.
   */
  async fetch(request: Request, env: Env, ctx: ExecutionContext) {
    // 1. Intercept native WebSocket routing via the `routeAgentRequest` utility
    //    from the "agents" SDK for autonomous durable object connection handshakes.
    const { routeAgentRequest } = await import("agents");
    const agentResponse = await routeAgentRequest(request, env);
    if (agentResponse) return agentResponse;
    
    // 2. Fall back to the structured Hono router for all standard `/api` calls.
    return app.fetch(request, env, ctx);
  }
};
