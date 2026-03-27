/**
 * @file backend/ai/agents/JulesFeedbackAgent.ts
 * @description Specialized Agent for capturing frontend feedback, analyzing context, and delegating PR creation to Jules.
 * @owner Agentic Team
 */

import { callable } from "agents";
import { BaseAgent, BaseAgentState } from "@/ai/agent-sdk";
import type { Agent } from "@openai/agents";
import { getDb } from "@/db";
import { JulesService } from "@/services/jules";
import { julesJobs } from "@/db/schemas/agents/jules";
import { queryMCP } from "@/ai/mcp/mcp-client";
import { getAgentModelName } from "@/ai/utils/model-config";

interface JulesFeedbackState extends BaseAgentState {
  currentStatus: "idle" | "analyzing" | "delegating" | "completed" | "error";
  julesSessionId: string | null;
  prUrl: string | null;
}

export class JulesFeedbackAgent extends BaseAgent<Env, JulesFeedbackState> {
  protected agent!: Agent;

  constructor(state: DurableObjectState, env: Env) {
    super(state, env);
  }

  initialState: JulesFeedbackState = {
    currentStatus: "idle",
    status: "idle",
    history: [],
    julesSessionId: null,
    prUrl: null
  };

  async onStart(): Promise<void> {
    this.logger.info("JulesFeedbackAgent initialized");

    const delegateToJulesTool = {
      type: 'function' as const,
      name: 'delegate_to_jules',
      description: 'Delegate fixing the issues to a Jules deeper reasoning AI by opening a Pull Request.',
      parameters: {
        type: 'object' as const,
        properties: {
          prompt: { type: 'string' as const, description: 'The intensely detailed prompt to send to Jules to fix the issue.' },
        },
        required: ['prompt'],
        additionalProperties: false
      },
      strict: true,
      isEnabled: async () => true,
      needsApproval: async () => false,
      invoke: async (context: any, input: string) => {
        try {
          const args = JSON.parse(input);
          const julesService = JulesService.getInstance(this.env);
          
          const session = await julesService.startSession({
            prompt: args.prompt,
            autoPr: true,
            repo: { owner: "jmbish04", repo: "recruiter", branch: "main" }
          });
          
          const db = getDb(this.env.DB);
          await db.insert(julesJobs).values({
            sessionId: session.id, 
            repoFullName: `jmbish04/recruiter`,
            prompt: args.prompt, 
            status: "pending"
          });

          return JSON.stringify({ success: true, sessionId: session.id, message: `Successfully delegated to Jules. Session ID: ${session.id}` });
        } catch (e: any) {
          this.logger.error("delegate_to_jules failed", e);
          return JSON.stringify({ success: false, error: e.message });
        }
      }
    };

    const { Agent: OpenAIAgent } = await import("@openai/agents");
    this.agent = new OpenAIAgent({
      name: "JulesFeedbackAgent",
      model: getAgentModelName('JulesFeedbackAgent'), // Will use standard capable model
      instructions: `You are a Senior Frontend Engineer and Systems Architect.
Your task is to take user feedback, context, and a visual UI snapshot, and formulate an elite engineering prompt to send to Jules (our deep-reasoning agent). Jules will then clone the repository and fix the issue.

PROCESS:
1. Analyze the user's feedback, the provided URL, and the base64 screenshot.
2. Formulate a comprehensive plan to fix it.
3. Delegate the task to Jules using the 'delegate_to_jules' tool. Your prompt to Jules must be extremely specific about WHAT needs to change, WHERE the issue likely lives, and WHAT the Cloudflare/Astro architectural constraints are.

You MUST call 'delegate_to_jules' to successfully complete your task.`,
      tools: [delegateToJulesTool],
    });
  }

  @callable()
  async onMessage(connection: any, message: any): Promise<any> {
    try {
      if (typeof message !== 'object' || !message.feedback) {
        throw new Error("Invalid payload format. Expected { feedback, url, screenshot }");
      }

      await this.setState({ ...this.state, currentStatus: "analyzing" });
      
      this.logger.info("Received Jules Feedback request", { feedback: message.feedback, url: message.url });

      // 1. Fetch Cloudflare / Implementation Context via MCP
      const mcpQuery = `We are fixing a bug on path: ${message.url}. User says: ${message.feedback}. Provide architectural context.`;
      let mcpContext = "No Cloudflare Docs context available.";
      try {
        const mcpResult = await queryMCP(mcpQuery, "JulesFeedbackAgent");
        mcpContext = typeof mcpResult === 'string' ? mcpResult : JSON.stringify(mcpResult);
      } catch (e) {
        this.logger.warn("queryMCP failed", e);
      }

      // 2. Format Prompt for the Local Agent
      const agentInput: any[] = [
        { type: "text", text: `USER FEEDBACK: ${message.feedback}` },
        { type: "text", text: `URL CONTEXT: ${message.url}` },
        { type: "text", text: `SYSTEM CONTEXT (Cloudflare Docs / Settings): ${mcpContext}` },
        { type: "text", text: `Please analyze this and delegate a fix to Jules.` }
      ];

      if (message.screenshot) {
        agentInput.push({
          type: "image_url",
          // @ts-ignore
          image_url: { url: message.screenshot.startsWith('data:') ? message.screenshot : `data:image/png;base64,${message.screenshot}` }
        });
      }

      // 3. Run Agent (which will call delegate_to_jules)
      const result = await this.runAgent(this.agent, agentInput);
      
      const finalOutput = String(result.finalOutput || "");

      await this.setState({
        ...this.state,
        currentStatus: "completed"
      });

      return {
        status: "completed",
        result: finalOutput
      };

    } catch (error: any) {
      this.logger.error("JulesFeedbackAgent failed", { error: error.message });
      await this.setState({ ...this.state, currentStatus: "error" });
      
      return {
        status: "error",
        error: error.message,
      };
    }
  }

  @callable()
  async getStatus(): Promise<any> {
    return {
      status: this.state.currentStatus,
      julesSessionId: this.state.julesSessionId,
      prUrl: this.state.prUrl
    };
  }
}
