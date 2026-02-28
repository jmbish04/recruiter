import { OpenAPIHono } from "@hono/zod-openapi";
import { apiReference } from "@scalar/hono-api-reference";
import { companiesRouter } from "../api/companies";
import { materialsRouter } from "../api/materials";
import { createRoute, z } from "@hono/zod-openapi";

/**
 * Primary API Router (OpenAPI v3.1.0 compliant)
 * 
 * Aggregates all REST API sub-routers and health checks for the 
 * monolith application. Automatically generates OpenAPI specs.
 */
export const apiRouter = new OpenAPIHono<{ Bindings: Env }>();

// -----------------------------------------------------------------------------
// OpenAPI 3.1.0 Documentation Endpoints
// -----------------------------------------------------------------------------
apiRouter.doc31("/openapi.json", {
  openapi: "3.1.0",
  info: {
    version: "1.0.0",
    title: "Head Hunter API",
    description: "Agentic Job Scraping and Evaluation System",
  },
});

apiRouter.get(
  "/swagger",
  apiReference({
    pageTitle: "Head Hunter API Docs",
    theme: "kepler",
    // @ts-ignore - The spec property might be typed differently in the generic Configuration wrapper
    spec: {
      url: "/api/openapi.json",
    },
  })
);

// -----------------------------------------------------------------------------
// Core Routes
// -----------------------------------------------------------------------------

apiRouter.openapi(
  createRoute({
    method: "get",
    path: "/health",
    operationId: "getHealthService",
    description: "Standard Liveness Probe. Verifies the monolithic worker process is actively receiving traffic.",
    responses: {
      200: {
        description: "Service is healthy",
        content: {
          "application/json": {
            schema: z.object({
              status: z.string(),
              service: z.string(),
            }),
          },
        },
      },
    },
  }),
  (c) => c.json({ status: "ok", service: "head-hunter-api" })
);

/**
 * /api/companies Router
 */
apiRouter.route("/companies", companiesRouter);

/**
 * /api/materials Router
 */
apiRouter.route("/materials", materialsRouter);
