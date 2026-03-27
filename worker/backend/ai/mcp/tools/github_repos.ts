/**
 * @file backend/src/mcp/github-tools.ts
 * @description GitHub Tool Registry with lazy MCP loading and context-aware activation
 * @owner Research Team
 */

import { z } from "zod";
import { getOctokit } from "@/services/octokit/core";
import type { RunnableTool } from "@/ai/mcp/tools/github/shared";

export type ToolContext = "planning" | "github-op" | "research";

export interface GitHubToolRegistry {
  getTools(context: ToolContext, env: Env): Promise<RunnableTool[]>;
  attachMCP(env: Env, callbackHost: string): Promise<RunnableTool[]>;
}

/**
 * Get internal Octokit-based tools
 */
function getInternalTools(env: Env): RunnableTool[] {
  return [
    {
      name: "search_repos",
      description: "Search GitHub repositories with query filters",
      parameters: z.object({
        query: z.string().describe("Search query (e.g., 'language:typescript stars:>100')"),
        sort: z.enum(["stars", "forks", "updated", "help-wanted-issues"]).optional(),
        order: z.enum(["asc", "desc"]).optional().default("desc"),
        per_page: z.number().optional().default(10),
      }),
      execute: async (params: any, context: any) => {
        const octokit = await getOctokit(context.env as Env);
        const result = await octokit.search.repos({
          q: params.query,
          sort: params.sort,
          order: params.order,
          per_page: params.per_page,
        });
        return JSON.stringify({
          total_count: result.data.total_count,
          items: result.data.items.map((repo: any) => ({
            full_name: repo.full_name,
            description: repo.description,
            stars: repo.stargazers_count,
            forks: repo.forks_count,
            language: repo.language,
            url: repo.html_url,
          })),
        });
      },
    },
    {
      name: "get_repo_info",
      description: "Get detailed information about a specific repository",
      parameters: z.object({
        owner: z.string().describe("Repository owner"),
        repo: z.string().describe("Repository name"),
      }),
      execute: async (params: any, context: any) => {
        const { owner, repo } = params;
        const octokit = await getOctokit(context.env as Env);
        const result = await octokit.repos.get({ owner, repo });
        return JSON.stringify({
          full_name: result.data.full_name,
          description: result.data.description,
          stars: result.data.stargazers_count,
          forks: result.data.forks_count,
          language: result.data.language,
          topics: result.data.topics,
          default_branch: result.data.default_branch,
          created_at: result.data.created_at,
          updated_at: result.data.updated_at,
        });
      },
    },
    {
      name: "get_file_contents",
      description: "Get the contents of a file from a repository",
      parameters: z.object({
        owner: z.string().describe("Repository owner"),
        repo: z.string().describe("Repository name"),
        path: z.string().describe("File path"),
        ref: z.string().optional().describe("Branch, tag, or commit SHA"),
      }),
      execute: async (params: any, context: any) => {
        const { owner, repo, path, ref } = params;
        const octokit = await getOctokit(context.env as Env);
        const result = await octokit.repos.getContent({
          owner,
          repo,
          path,
          ...(ref ? { ref } : {}),
        } as any);

        const data = result.data as any;
        if (data.type === "file" && data.content) {
          const content = Buffer.from(data.content, "base64").toString("utf8");
          return content;
        }
        return JSON.stringify({ error: "Not a file or content unavailable" });
      },
    },
    {
      name: "list_repo_files",
      description: "List files in a repository directory",
      parameters: z.object({
        owner: z.string().describe("Repository owner"),
        repo: z.string().describe("Repository name"),
        path: z.string().optional().describe("Directory path (empty for root)"),
        ref: z.string().optional().describe("Branch, tag, or commit SHA"),
      }),
      execute: async (params: any, context: any) => {
        const { owner, repo, path, ref } = params;
        const octokit = await getOctokit(context.env as Env);
        const result = await octokit.repos.getContent({
          owner,
          repo,
          path: path || "",
          ...(ref ? { ref } : {}),
        } as any);

        if (Array.isArray(result.data)) {
          return JSON.stringify(
            result.data.map((item: any) => ({
              name: item.name,
              path: item.path,
              type: item.type,
              size: item.size,
            }))
          );
        }
        return JSON.stringify({ error: "Not a directory" });
      },
    },
    {
      name: "get_repo_tree",
      description: "Get the complete file tree of a repository",
      parameters: z.object({
        owner: z.string().describe("Repository owner"),
        repo: z.string().describe("Repository name"),
        branch: z.string().optional().describe("Branch name (defaults to default branch)"),
      }),
      execute: async (params: any, context: any) => {
        const { owner, repo, branch } = params;
        const octokit = await getOctokit(context.env as Env);

        // Get default branch if not specified
        const repoData = await octokit.repos.get({ owner, repo });
        const defaultBranch = branch || repoData.data.default_branch;

        // Get tree
        const treeResponse = await octokit.git.getTree({
          owner,
          repo,
          tree_sha: defaultBranch,
          recursive: "1",
        } as any);

        return JSON.stringify({
          tree: (treeResponse.data as any).tree.map((item: any) => ({
            path: item.path,
            type: item.type,
            size: item.size,
          })),
        });
      },
    },
  ];
}

/**
 * GitHub Tool Registry with context-aware loading
 */
export const githubTools: GitHubToolRegistry = {
  /**
   * Get tools based on context to optimize token costs
   * - planning: Minimal tools, no heavy MCP (search + info only)
   * - github-op: Full internal Octokit tools
   * - research: Internal + External MCP (when available)
   */
  async getTools(context: ToolContext, env: Env): Promise<RunnableTool[]> {
    const internalTools = getInternalTools(env);

    if (context === "planning") {
      // Minimal tools for planning phase - reduce token costs
      return internalTools.filter((t) =>
        ["search_repos", "get_repo_info"].includes(t.name)
      );
    }

    if (context === "github-op") {
      // All internal tools for GitHub operations
      return internalTools;
    }

    if (context === "research") {
      // Internal + External MCP (if configured)
      try {
        const mcpTools = await this.attachMCP(env, env.BASE_URL || "");
        return [...internalTools, ...mcpTools];
      } catch (error) {
        console.warn("[GitHubTools] MCP attachment failed, using internal tools only:", error);
        return internalTools;
      }
    }

    return internalTools;
  },

  /**
   * Attach official GitHub MCP server
   * Note: This requires GITHUB_MCP_PAT secret to be configured or standard GITHUB_TOKEN.
   */
  async attachMCP(env: Env, callbackHost: string): Promise<RunnableTool[]> {
    // Check if MCP is configured
    if (!env.GITHUB_TOKEN) {
      console.warn("[GitHubTools] GITHUB_TOKEN not configured, skipping MCP attachment");
      return [];
    }

    const mcpPat = await env.GITHUB_TOKEN.get();
    if (!mcpPat) {
      return [];
    }

    try {
      // Import the official SDK clients dynamically to avoid cold start overhead if untouched
      const { Client } = await import("@modelcontextprotocol/sdk/client/index.js");
      const { SSEClientTransport } = await import("@modelcontextprotocol/sdk/client/sse.js");

      // Connect to the official MCP server. If env URL is not provided, use default local or worker hosted URL.
      const targetUrl = env.MCP_API_URL || "https://docs.mcp.cloudflare.com/mcp";
      const transport = new SSEClientTransport(new URL(targetUrl), {
        requestInit: {
          headers: {
            Authorization: `Bearer ${mcpPat}`,
          }
        }
      });
      
      const client = new Client({ name: "core-github-api-client", version: "1.0.0" }, { capabilities: {} });
      await client.connect(transport);

      const mcpToolsList = await client.listTools();

      // Implement the 19.2 Tool Conversion Pattern mapping MCP Tool shape to RunnableTool
      const mappedTools: RunnableTool[] = mcpToolsList.tools.map((tool) => ({
        name: tool.name,
        description: tool.description || "No description available",
        parameters: tool.inputSchema as any,
        execute: async (params: any) => {
          // Implement the 19.3 Execution Loop proxy
          const args = typeof params === "string" ? JSON.parse(params) : params;
          const result = await client.callTool({
            name: tool.name,
            arguments: args
          });
          return JSON.stringify(result);
        }
      }));

      console.log(`[GitHubTools] Successfully attached MCP Server with ${mappedTools.length} tools`);
      return mappedTools;
    } catch (error) {
      console.error("[GitHubTools] MCP integration failed, falling back to internal tools:", error);
      return [];
    }
  },
};

/**
 * Helper to retry GitHub API calls with exponential backoff
 */
export async function retryGitHubCall<T>(
  fn: () => Promise<T>,
  maxRetries = 3,
  baseDelay = 1000
): Promise<T> {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (error: any) {
      // Retry on rate limit errors
      if (error.status === 429 && i < maxRetries - 1) {
        const delay = baseDelay * Math.pow(2, i);
        console.log(`[GitHubTools] Rate limited, retrying in ${delay}ms...`);
        await new Promise((resolve) => setTimeout(resolve, delay));
        continue;
      }
      throw error;
    }
  }
  throw new Error("Max retries exceeded");
}
