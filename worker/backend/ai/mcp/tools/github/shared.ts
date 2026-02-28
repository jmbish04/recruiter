/**
 * @file backend/src/tools/shared.ts
 * @description Centralized GitHub tools for Agentic Research
 * @owner Agentic Research Team
 */

import { z } from "zod";
import { getOctokit } from "@services/octokit/core";

/**
 * Definition for a tool that can be executed directly by the agent.
 * This matches the object literal shape used in manual tool definitions.
 */
export interface RunnableTool {
  name: string;
  description: string;
  parameters: z.ZodType<any> | any;
  execute: (params: any, context: any) => Promise<string>;
}

/**
 * Fetches GitHub tools for agent consumption
 * @param env - Worker environment
 * @returns Array of tools for agent consumption
 */
export async function getGitHubTools(env: Env): Promise<RunnableTool[]> {
  const customGitHubTools: RunnableTool[] = [
    {
      name: "custom_list_repo_files",
      description: "List files in a GitHub repository with optional path filtering",
      parameters: z.object({
        owner: z.string().describe("Repository owner"),
        repo: z.string().describe("Repository name"),
        path: z.string().optional().describe("Optional path to filter files"),
        ref: z.string().optional().describe("Optional branch/tag/commit ref"),
      }),
      execute: async (params: any, context: any) => {
        const { owner, repo, path, ref } = params;
        const octokit = await getOctokit(context.env as Env);
        const response = await octokit.repos.getContent({
          owner,
          repo,
          path: path || "",
          ...(ref ? { ref } : {}),
        } as any);

        if (Array.isArray(response.data)) {
          return JSON.stringify(
            response.data.map((item: any) => ({
              name: item.name,
              path: item.path,
              type: item.type,
              size: item.size,
            }))
          );
        }

        return JSON.stringify({ name: (response.data as any).name, type: (response.data as any).type });
      },
    },
    {
      name: "custom_read_file_content",
      description: "Read the content of a specific file from a GitHub repository",
      parameters: z.object({
        owner: z.string().describe("Repository owner"),
        repo: z.string().describe("Repository name"),
        path: z.string().describe("File path"),
        ref: z.string().optional().describe("Optional branch/tag/commit ref"),
      }),
      execute: async (params: any, context: any) => {
        const { owner, repo, path, ref } = params;
        const octokit = await getOctokit(context.env as Env);
        const response = await octokit.repos.getContent({
          owner,
          repo,
          path,
          ...(ref ? { ref } : {}),
        } as any);

        const data = response.data as any;
        if (data.type === "file" && data.content) {
          const content = Buffer.from(data.content, "base64").toString("utf8");
          return content;
        }

        return JSON.stringify({ error: "Not a file or content unavailable" });
      },
    },
    {
      name: "custom_search_code",
      description: "Search for code across GitHub repositories",
      parameters: z.object({
        query: z.string().describe("Search query"),
        per_page: z.number().optional().default(30).describe("Results per page"),
        page: z.number().optional().default(1).describe("Page number"),
      }),
      execute: async (params: any, context: any) => {
        const { query, per_page, page } = params;
        const octokit = await getOctokit(context.env as Env);
        const response = await octokit.search.code({
          q: query,
          per_page: per_page || 30,
          page: page || 1,
        });

        return JSON.stringify({
          total_count: response.data.total_count,
          items: response.data.items.map((item: any) => ({
            name: item.name,
            path: item.path,
            repository: item.repository.full_name,
            html_url: item.html_url,
          })),
        });
      },
    },
    {
      name: "custom_get_repo_tree",
      description: "Get the full file tree of a repository",
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

  return customGitHubTools;
}

/**
 * Get research-specific tools for the ResearchAgent
 * Includes GitHub tools + Vectorize RAG tools
 */
export async function getResearchTools(env: Env): Promise<RunnableTool[]> {
  const githubTools = await getGitHubTools(env);

  const researchTools: RunnableTool[] = [
    {
      name: "query_research_index",
      description: "Query the research vectorize index for relevant code snippets",
      parameters: z.object({
        query: z.string().describe("Natural language query"),
        topK: z.number().optional().default(5).describe("Number of results to return"),
        filter: z.object({
          repo: z.string().optional(),
          filepath: z.string().optional(),
        }).optional().describe("Optional metadata filters"),
      }),
      execute: async (params: any, context: any) => {
        const { query, topK, filter } = params;
        const e = context.env as Env;
        
        // Embed the query
        const embeddingResponse = await e.AI.run("@cf/baai/bge-large-en-v1.5", {
          text: query,
        });

        // Extract embedding vector
        const embedding = (embeddingResponse as any).data?.[0] || [];

        if (embedding.length === 0) {
          return JSON.stringify({ error: "Failed to generate embedding" });
        }

        // Query vectorize
        const results = await e.RESEARCH_INDEX.query(embedding, {
          topK: topK || 5,
          ...(filter ? { filter } : {}),
        });

        return JSON.stringify({
          matches: results.matches.map((match: any) => ({
            score: match.score,
            metadata: match.metadata,
          })),
        });
      },
    },
  ];

  return [...githubTools, ...researchTools];
}