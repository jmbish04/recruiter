import { z } from "zod";
import { MCPTool } from "@/ai/mcp/index";
import { rewriteQuestionForMCP } from "@/ai/providers";

export const AskCloudflareTool: MCPTool = {
  name: "ask_cloudflare",
  description: "Ask a question about Cloudflare Workers, D1, R2, or other products. This tool automatically optimizes your query before searching the documentation.",
  category: "orchestration",
  inputSchema: z.object({
    question: z.string().describe("The formulated question about Cloudflare capabilities or code implementation."),
    context: z.object({
        tags: z.array(z.string()).optional(),
        libraries: z.array(z.string()).optional()
    }).optional()
  }),
  examples: [
    {
      input: { question: "How do I list buckets in R2?" },
      output: { answer: "Use generic S3 client or bindings..." }
    }
  ]
};

// We don't implement the handler here in the definition file usually, 
// unless we use a unified structure. 
// For this architecture, the handler logic resides in `backend/src/ai/mcp/tools/index.ts` 
// or a specific route handler.
// But based on `index.ts` analyzing `TOOL_ROUTES`, we need to define the route/execution logic there.
