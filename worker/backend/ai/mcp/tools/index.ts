/**
 * @file src/tools/index.ts
 * @description Main entry point for MCP tools definitions and registry
 */

import { OpenAPIHono } from '@hono/zod-openapi'
import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import { z } from "zod";

// Extend Zod with OpenAPI if not already done globally
extendZodWithOpenApi(z);

import { ORCHESTRATION_TOOLS } from "./orchestration/index";

const toolsApi = new OpenAPIHono<{ Bindings: Env }>()

/**
 * MCP Tool Definition
 */
export interface MCPTool {
    name: string;
    description: string;
    inputSchema: z.ZodTypeAny; // Zod schema for validation
    examples?: Array<{
        input: Record<string, any>;
        output: Record<string, any>;
    }>;
    category: string;
    tags?: string[];
}

export { ORCHESTRATION_TOOLS }
export const MCP_TOOLS = [
    ...ORCHESTRATION_TOOLS
];

export default toolsApi
