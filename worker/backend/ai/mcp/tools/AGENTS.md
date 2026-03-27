# MCP Tool Development Guidelines

> **Concept**: Distinguish between "The Menu" (Server) and "The Phone" (Client).

## 1. The Menu (Server) `src/mcp/tools/`

This directory defines the tools **this Worker provides** to the world.

### Structure
-   `index.ts`: The aggregator. Exports `MCP_TOOLS` and types.
-   `github.ts`: GitHub-specific tool definitions.
-   `orchestration.ts`: Agent/Session tool definitions.
-   `[domain].ts`: create new files for new domains.

### How to Add a New Tool
1.  **Define Schema**: Add the Zod schema to `src/schemas/apiSchemas.ts` (if API request) or inline if simple.
2.  **Create Definition**: Add the tool object to the appropriate file in `src/mcp/tools/`.
    ```typescript
    {
      name: "myNewTool",
      description: "Does something cool",
      category: "My Category",
      inputSchema: MyZodSchema,
      examples: [...]
    }
    ```
3.  **Export**: Ensure it's included in `MCP_TOOLS` in `index.ts`.
4.  **Route**: Add the execution route mapping to `TOOL_ROUTES` in `index.ts`.

## 2. The Phone (Client) `src/lib/mcp-client.ts`

This library is used by Agents to **call external tools** (like Cloudflare Docs).

-   **Do not** define tools here.
-   **Do** use `connectToMcpServer` to dial out.

## Maintenance

-   Keep descriptions clear; LLMs rely on them.
-   Always provide examples.
-   Ensure `inputSchema` matches the API implementation requirements.
