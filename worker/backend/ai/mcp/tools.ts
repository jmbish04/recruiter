/**
 * @file src/mcp/tools.ts
 * @description Model Context Protocol (MCP) tools listing and execution
 * @owner AI-Builder
 */

import { z } from "zod";
import * as S from "@/schemas/apiSchemas";
import { DEFAULT_GITHUB_OWNER } from "@github-utils";

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

/**
 * Registry of all available MCP tools
 */
export const MCP_TOOLS: MCPTool[] = [
  {
    name: "searchRepositories",
    description: "Search for GitHub repositories using advanced query syntax",
    category: "GitHub Search",
    tags: ["github", "search", "repositories"],
    inputSchema: S.SearchRepositoriesRequest,
    examples: [
      {
        input: {
          q: "language:typescript stars:>100",
          sort: "stars",
          order: "desc",
          per_page: 10,
        },
        output: {
          success: true,
          total_count: 1234,
          items: [],
        },
      },
    ],
  },
  {
    name: "upsertFile",
    description: "Create or update a file in a GitHub repository",
    category: "GitHub Files",
    tags: ["github", "files", "write"],
    inputSchema: S.UpsertFileRequest,
    examples: [
      {
        input: {
          owner: "octocat",
          repo: "hello-world",
          path: "README.md",
          content: "# Hello World\n\nThis is a test.",
          message: "Update README",
        },
        output: {
          success: true,
          content: {
            name: "README.md",
            path: "README.md",
            sha: "abc123",
          },
        },
      },
    ],
  },
  {
    name: "createIssue",
    description: "Create a new issue in a GitHub repository",
    category: "GitHub Issues",
    tags: ["github", "issues", "create"],
    inputSchema: S.CreateIssueRequest,
    examples: [
      {
        input: {
          owner: "octocat",
          repo: "hello-world",
          title: "Bug: Application crashes",
          body: "The application crashes when...",
          labels: ["bug"],
        },
        output: {
          success: true,
          issue: {
            number: 42,
            title: "Bug: Application crashes",
            state: "open",
          },
        },
      },
    ],
  },
  {
    name: "createPullRequest",
    description: "Create a new pull request in a GitHub repository",
    category: "GitHub Pull Requests",
    tags: ["github", "pull-requests", "create"],
    inputSchema: S.CreatePullRequestRequest,
    examples: [
      {
        input: {
          owner: "octocat",
          repo: "hello-world",
          title: "feat: Add new feature",
          head: "feature-branch",
          base: "main",
        },
        output: {
          success: true,
          pull_request: {
            number: 42,
            title: "feat: Add new feature",
            state: "open",
          },
        },
      },
    ],
  },
  {
    name: "createSession",
    description: "Create a new agent session for GitHub search and analysis",
    category: "Agent Orchestration",
    tags: ["agents", "sessions", "orchestration"],
    inputSchema: S.CreateSessionRequest,
    examples: [
      {
        input: {
          projectId: "my-project",
          searchTerms: ["cloudflare workers", "durable objects"],
          options: {
            maxResults: 100,
          },
        },
        output: {
          success: true,
          session: {
            id: "550e8400-e29b-41d4-a716-446655440000",
            status: "active",
          },
        },
      },
    ],
  },
  {
    name: "getSessionStatus",
    description: "Get the status of an agent session",
    category: "Agent Orchestration",
    tags: ["agents", "sessions", "status"],
    inputSchema: z.object({
      sessionId: z.string().uuid().describe("Session ID (UUID)"),
    }),
    examples: [
      {
        input: {
          sessionId: "550e8400-e29b-41d4-a716-446655440000",
        },
        output: {
          success: true,
          session: {
            id: "550e8400-e29b-41d4-a716-446655440000",
            status: "completed",
          },
        },
      },
    ],
  },
  {
    name: "listRepoTree",
    description: "List repository contents with a tree-style representation",
    category: "GitHub Files",
    tags: ["github", "files", "tree"],
    inputSchema: z.object({
      owner: z.string().default(DEFAULT_GITHUB_OWNER).describe("Repository owner"),
      repo: z.string().describe("Repository name"),
      path: z.string().optional().describe("Path in repository (optional)"),
      branch: z.string().optional().describe("Branch name (optional)"),
    }),
  },
];

/**
 * Serialize MCP tools for JSON output (converting Zod schemas to JSON Schema)
 */
export async function serializeTools(): Promise<Array<{
  name: string;
  description: string;
  inputSchema: any;
  examples?: Array<{ input: Record<string, any>; output: Record<string, any> }>;
  category: string;
  tags?: string[];
}>> {
  const { zodToJsonSchema } = await import("zod-to-json-schema");
  return MCP_TOOLS.map(tool => ({
    ...tool,
    inputSchema: zodToJsonSchema(tool.inputSchema as any, {
      target: "jsonSchema7",
      $refStrategy: "none",
    }) as any,
  }));
}

/**
 * Get all MCP tools grouped by category
 */
export function getToolsByCategory(): Record<string, MCPTool[]> {
  const grouped: Record<string, MCPTool[]> = {};

  for (const tool of MCP_TOOLS) {
    if (!grouped[tool.category]) {
      grouped[tool.category] = [];
    }
    grouped[tool.category].push(tool);
  }

  return grouped;
}

/**
 * Get a specific tool by name
 */
export function getTool(name: string): MCPTool | undefined {
  return MCP_TOOLS.find(tool => tool.name === name);
}

/**
 * Search tools by tag
 */
export function searchToolsByTag(tag: string): MCPTool[] {
  return MCP_TOOLS.filter(tool => tool.tags?.includes(tag));
}

/**
 * Get tool statistics
 */
export function getToolStats() {
  const categories = new Set<string>();
  const tags = new Set<string>();

  for (const tool of MCP_TOOLS) {
    categories.add(tool.category);
    if (tool.tags) {
      for (const tag of tool.tags) {
        tags.add(tag);
      }
    }
  }

  return {
    totalTools: MCP_TOOLS.length,
    categories: Array.from(categories),
    categoryCount: categories.size,
    tags: Array.from(tags),
    tagCount: tags.size,
  };
}

/**
 * Execute request and response body schemas
 */
export const MCPExecuteRequest = z.object({
  tool: z.string().min(1).describe("Tool name to execute"),
  params: z.record(z.string(), z.any()).describe("Tool parameters"),
}).openapi({
  example: {
    tool: "searchRepositories",
    params: {
      q: "language:typescript",
      per_page: 10,
    },
  },
});

export const MCPExecuteResponse = z.object({
  success: z.literal(true),
  tool: z.string(),
  result: z.any(),
  executedAt: z.string(),
  durationMs: z.number().optional(),
}).openapi({
  example: {
    success: true,
    tool: "searchRepositories",
    result: {
      total_count: 100,
      items: [],
    },
    executedAt: "2024-01-01T00:00:00Z",
    durationMs: 123,
  },
});

export const MCPToolsListResponse = z.object({
  success: z.literal(true),
  tools: z.array(z.any()),
  stats: z.object({
    totalTools: z.number().int(),
    categories: z.array(z.string()),
    categoryCount: z.number().int(),
  }),
}).openapi({
  example: {
    success: true,
    tools: [],
    stats: {
      totalTools: 7,
      categories: ["GitHub Search", "GitHub Files", "GitHub Issues"],
      categoryCount: 3,
    },
  },
});

export type TMCPExecuteRequest = z.infer<typeof MCPExecuteRequest>;
export type TMCPExecuteResponse = z.infer<typeof MCPExecuteResponse>;
export type TMCPToolsListResponse = z.infer<typeof MCPToolsListResponse>;

/**
 * Tool routing configuration
 */
export interface ToolRoute {
  path: string;
  method: "GET" | "POST";
  pathBuilder?: (params: any) => string;
}

/**
 * Mapping of MCP tool names to their corresponding API routes
 */
export const TOOL_ROUTES: Record<string, ToolRoute> = {
  searchRepositories: {
    path: "/api/octokit/search/repos",
    method: "POST",
  },
  upsertFile: {
    path: "/api/tools/files/upsert",
    method: "POST",
  },
  createIssue: {
    path: "/api/tools/issues/create",
    method: "POST",
  },
  createPullRequest: {
    path: "/api/tools/prs/create",
    method: "POST",
  },
  createSession: {
    path: "/api/agents/session",
    method: "POST",
  },
  getSessionStatus: {
    path: "/api/agents/session",
    method: "GET",
    pathBuilder: (params: { sessionId: string }) => `/api/agents/session/${params.sessionId}`,
  },
  listRepoTree: {
    path: "/api/tools/files/tree",
    method: "POST",
  },
};
