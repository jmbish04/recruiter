/**
 * @file src/tools/index.ts
 * @description Main entry point for MCP tools definitions and registry
 */

import { OpenAPIHono } from '@hono/zod-openapi'
import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import { z } from "zod";

// Extend Zod with OpenAPI if not already done globally
extendZodWithOpenApi(z);

import githubTools, { GITHUB_TOOLS } from './github/index'
import { ORCHESTRATION_TOOLS } from "./orchestration/index";

const toolsApi = new OpenAPIHono<{ Bindings: Env }>()

// Mount GitHub tools
// Note: githubTools (from github/index.ts) already has routes like /files, /prs mounted at root of its sub-app
// We can mount it at /github or root depending on API design.
// Given strict typed routes usually expect specific paths, let's mount at / to preserve existing behavior if any
toolsApi.route('/', githubTools)

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

export { GITHUB_TOOLS, ORCHESTRATION_TOOLS }
export const MCP_TOOLS = [
    ...GITHUB_TOOLS,
    ...ORCHESTRATION_TOOLS
];

export default toolsApi
