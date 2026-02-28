import { Hono } from "hono";
import { websocketRouter } from "./routes/websocket";
import { apiRouter } from "./routes/api";

/**
 * Root Application Router
 * 
 * Defines the core Hono application instance independently from Durable Objects.
 * This file isolates the routing logic from Cloudflare-specific dependencies so 
 * Astro's Vite build process does not crash when importing it during SSR.
 */
export const app = new Hono<{ Bindings: Env }>();

/** Mount REST API Endpoints */
app.route("/api", apiRouter);

/** Mount Agent WebSocket Upgrades */
app.route("/ws", websocketRouter);
