// Dynamic imports used instead of static
import { Agent as CFAgent, callable } from "agents";
import { z } from "zod";

// --- Schemas ---
const TaskSchema = z.object({
  id: z.string(),
  workerType: z.enum(["researcher", "coder"]),
  instruction: z.string()
});

const PlanSchema = z.object({
  tasks: z.array(TaskSchema)
});

type OrchestratorState = {
  plan?: z.infer<typeof PlanSchema>;
  results: Record<string, string>;
};

// --- Agent Class ---
export class OrchestratorAgent extends CFAgent<Env, OrchestratorState> {
  initialState: OrchestratorState = { results: {} };

  @callable()
  async processRequest(objective: string) {
    const { Agent, run, withTrace } = await import("@openai/agents");
    
    // 1. Planner Agent
    const planner = new Agent({
      name: "Planner",
      instructions: "Break the user request into smaller, distinct tasks.",
      outputType: PlanSchema
    });

    // 2. Worker Agents
    const researcher = new Agent({
      name: "Researcher",
      instructions: "You are a research assistant. Find information and summarize."
    });

    const coder = new Agent({
      name: "Coder",
      instructions: "You are a software engineer. Write code snippets based on instructions."
    });

    return await withTrace("Orchestrator Workflow", async () => {
      
      // Step 1: Create Plan
      const planResult = await run(planner, objective);
      const plan = planResult.finalOutput;

      if (!plan) return "Failed to generate plan";

      this.setState({ ...this.state, plan });

      // Step 2: Execute Workers
      const results: Record<string, string> = {};

      for (const task of plan.tasks) {
        console.log(`[Orchestrator] Executing task: ${task.id}`);
        
        let workerAgent;
        if (task.workerType === "researcher") workerAgent = researcher;
        else workerAgent = coder;

        // Run worker with context
        const result = await run(workerAgent, [
          { role: "system", content: `Context: ${objective}` },
          { role: "user", content: task.instruction }
        ]);

        results[task.id] = result.finalOutput || "Error";
      }

      this.setState({ ...this.state, results });
      return results;
    });
  }
}