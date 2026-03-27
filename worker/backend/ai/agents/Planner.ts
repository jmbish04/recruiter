import { callable } from "agents";
import type { Agent } from "@openai/agents";
import { z } from "zod";
import { resolveDefaultAiModel, resolveDefaultAiProvider, createGatewayClient } from "@/ai/agent-sdk";
import { BaseAgent, BaseAgentState } from "@/ai/agent-sdk";
import { Logger } from "@logging";

const PlanSchema = z.object({
  title: z.string().describe("The comprehensive title of the plan"),
  steps: z.array(
    z.object({
      id: z.string().describe("Unique identifier for the step (e.g., step-1)"),
      description: z.string().describe("Detailed description of what needs to be done"),
      difficulty: z.enum(["easy", "medium", "hard"]).describe("Estimated difficulty level"),
      command: z.string().optional().describe("CLI command provided if applicable"),
    }),
  ),
});

export class PlannerAgent extends BaseAgent<Env, BaseAgentState> {


  constructor(state: DurableObjectState, env: Env) {
    super(state, env);
  }

  @callable()
  healthProbe() {
    return {
      status: "ok",
      agent: "PlannerAgent",
      timestamp: new Date().toISOString(),
    };
  }

  async onRequest(request: Request) {
    const url = new URL(request.url);
    if (request.method === "GET" && url.pathname === "/health-probe") {
      return Response.json(this.healthProbe());
    }

    let goal = "";
    try {
      const body = (await request.json()) as { goal: string };
      goal = body.goal;
    } catch {
      return new Response("Invalid request body", { status: 400 });
    }

    if (!goal.trim()) {
      return new Response("Goal is required", { status: 400 });
    }

    try {
      const provider = resolveDefaultAiProvider(this.env);
      const model = resolveDefaultAiModel(this.env, provider);
      
      this.logger.info("Generating plan", { goalLength: goal.length, provider, model });

      const client = await createGatewayClient(this.env, model);
      const { Agent: OpenAIAgent } = await import("@openai/agents");
      const planner = new OpenAIAgent({
        name: "PlannerAgent",
        model,
        outputType: PlanSchema,
        instructions:
          "Create an implementation plan for the user goal. Return a concise, execution-ready plan.",
      });

      const result = await this.runAgent(planner as any, goal);

      return Response.json(result.finalOutput ?? { title: "Plan", steps: [] });
    } catch (error: any) {
      this.logger.error("Planning failed", { error: error.message });
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { "content-type": "application/json" },
      });
    }
  }
}
