import { BaseAgent } from "./BaseAgent";
import { getDb } from "@db";
import { researchBriefs, researchPlans, researchCandidates } from "@db/schemas/github/research";
import { ResearchLogger } from "@research-logger";
import { eq } from "drizzle-orm";
import { z } from "zod";

type AgentState = {
  briefId?: string;
  status: "idle" | "planning" | "researching" | "review" | "complete";
};

// Actually I'll do two chunks.

export class TopicOrchestratorAgent extends BaseAgent<AgentState> {
  private researchLogger?: ResearchLogger;
  private doState: DurableObjectState; // Store DO state explicitly

  constructor(state: DurableObjectState, env: Env) {
    super(state, env);
    this.doState = state; // Capture it
    // Logger initialized in methods where we have briefId context
  }

  // --- Public Methods (RPC) ---

  async submitBrief(userId: string, title: string, content: any) {
    const db = getDb(this.env.DB);
    
    // Create new brief
    const [brief] = await db.insert(researchBriefs).values({
      userId,
      title,
      rawBriefContent: JSON.stringify(content),
      status: "planning",
      createdAt: new Date(),
      updatedAt: new Date()
    }).returning();

    this.setState({ briefId: brief.id, status: "planning" });
    
    // Initialize logger
    this.researchLogger = new ResearchLogger(db, brief.id, null, "TopicOrchestrator", this.doState); // Use explicit DO state
    await this.researchLogger.logInfo("Lifecycle", `Brief created: ${title}`, { briefId: brief.id });
    
    // Trigger initial planning
    await this.formulatePlan(brief.id, content);
    
    return brief;
  }

  async getStatus() {
    return this.state; // Refers to TState
  }

  // --- Internal Logic ---

  private async formulatePlan(briefId: string, content: any) {
    if (!this.researchLogger) return; // Should be inited
    
    await this.researchLogger.logThought("Planning", "Analyzing user brief to generate research plan...");
    
    const db = getDb(this.env.DB);
    
    // Use AI to generate a plan with a structured schema
    let plan = {};
    try {
      plan = await this.runStructuredResponseWithModel({
        name: "ResearchPlanner",
        instructions: `You are an expert Research Planner. 
        Analyze the user request and create a list of specific research questions and Google search queries.`,
        prompt: JSON.stringify(content),
        schema: z.object({
          goals: z.array(z.string()).describe("List of high level research goals"),
          search_queries: z.array(z.string()).describe("Specific Google search queries to run"),
          required_sources: z.array(z.string()).describe("Specific websites or sources to target if any")
        })
      });
    } catch (e) {
      await this.researchLogger.logError("Planning", e);
      plan = { error: "Failed to generate structured plan", details: String(e) };
    }

    // Save plan
    await db.insert(researchPlans).values({
      briefId,
      currentVersion: JSON.stringify(plan),
      isApproved: false,
    });
    
    await this.researchLogger.logInfo("Planning", "Plan generated and saved.", { plan });
  }
}
