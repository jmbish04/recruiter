import { Hono } from "hono";


/**
 * WebSocket Router
 * 
 * Handles upgrading standard HTTP requests to stateful WebSocket connections
 * targeting specific Cloudflare Durable Object Agents.
 */
export const websocketRouter = new Hono<{ Bindings: Env }>();

/**
 * Connect to Agent
 * 
 * Proxies an external WebSocket request into the internal `routeAgentRequest` SDK method.
 * Maps the standard `/ws/:agentName/:agentId` public path format into the expected 
 * `/agents/` internal routing prefix format required by the Cloudflare Agents SDK.
 * 
 * @example
 * // Connect to a specific singleton ScraperAgent
 * new WebSocket("wss://api.example.com/ws/scraper-agent/singleton")
 */
websocketRouter.get("/:agentName/:agentId", async (c) => {
  try {
    const url = new URL(c.req.url);
    
    // Rewrite public url namespace to the internal SDK router standard: /agents/:name/:id
    // Note: Parameter cases are strictly kebab-case for Cloudflare Agent routing
    const agentName = c.req.param("agentName");
    const agentId = c.req.param("agentId");
    url.pathname = `/agents/${agentName}/${agentId}`;

    const newReq = new Request(url.toString(), c.req.raw);
    const { routeAgentRequest } = await import("agents");
    const res = await routeAgentRequest(newReq, c.env);

    return res || c.text("Agent Not Found", 404);
  } catch (e: any) {
    return c.text(`WS Routing Error: ${e.message}`, 500);
  }
});
