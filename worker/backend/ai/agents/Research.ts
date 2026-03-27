/**
 * @file backend/src/agents/ResearchAgent.ts
 * @description Stateful orchestrator for the Agentic Research Team
 * @owner Agentic Research Team
 */

import { callable } from "agents";
import { BaseAgent, BaseAgentState } from "@/ai/agent-sdk";
import { Logger } from "@logging";
import type { Agent } from "@openai/agents";
import { getAgentModelName } from "@/ai/utils/model-config";
import { z } from "zod";

interface ResearchState extends BaseAgentState {
  currentPlan: string | null;
  workflowId: string | null;
  researchStatus: "idle" | "planning" | "researching" | "review_required" | "completed";
  findings: any | null;
  approvalRequired: boolean;
}

// Define the search tool manually to match @openai/agents FunctionTool interface
// Moved inside onStart to access this.env

export class ResearchAgent extends BaseAgent<Env, ResearchState> {
  // logger inherited from BaseAgent
  protected agent!: Agent;

  constructor(state: DurableObjectState, env: Env) {
    super(state, env);
  }

  initialState: ResearchState = {
    currentPlan: null,
    workflowId: null,
    researchStatus: "idle",
    findings: null,
    approvalRequired: false,
    status: "idle",
    history: [],
  };

  async onStart(): Promise<void> {
    this.logger.info("ResearchAgent initialized");

    const { Agent: OpenAIAgent } = await import("@openai/agents");
    // Initialize agent WITH tools
    this.agent = new OpenAIAgent({
      name: "ResearchAgent",
      model: getAgentModelName('ResearchAgent'), // Cost-optimized: gpt-4o
      instructions: `You are a senior research analyst.
      
Your capabilities:
- Generate insights about architectures
- Research general programming topics

Always be thorough but concise. Focus on practical insights that developers can use.`,
      tools: [],
    });
  }

  @callable()
  async onMessage(connection: any, message: any): Promise<any> {
    const messageText = typeof message === 'string' ? message : message.text || JSON.stringify(message);
    this.logger.info("Received research request", { message: messageText });

    try {
      // Update state to planning
      await this.setState({ ...this.state, researchStatus: "planning" });

      // Generate research plan using AI
      const planResult = await this.runAgent(this.agent, messageText);
      const plan = String(planResult.finalOutput || "");

      this.logger.info("Research plan generated", { plan });

      // Check if the plan requires deep analysis (workflow trigger)
      const requiresDeepAnalysis = this.shouldTriggerWorkflow(message, plan);

      if (requiresDeepAnalysis) {
        // Extract repo info from message
        const repoInfo = this.extractRepoInfo(message);

        if (repoInfo) {
          // Trigger workflow
          const instance = await this.env.DEEP_RESEARCH_WORKFLOW.create({
            params: {
              repoUrl: repoInfo.url,
              repoOwner: repoInfo.owner,
              repoName: repoInfo.name,
              mode: "targeted",
            },
          });


          await this.setState({
            ...this.state,
            currentPlan: plan,
            workflowId: instance.id,
            researchStatus: "researching",
          });

          this.logger.info("Workflow triggered", { workflowId: instance.id });

          return {
            status: "researching",
            plan,
            workflowId: instance.id,
            message: "Deep research workflow initiated. This may take a few minutes.",
          };
        }
      }

      // For simpler queries, return the plan directly
      await this.setState({
        ...this.state,
        currentPlan: plan,
        researchStatus: "completed",
      });

      return {
        status: "completed",
        plan,
        message: "Research completed",
      };
    } catch (error: any) {
      this.logger.error("Research failed", { error: error.message });
      await this.setState({ ...this.state, researchStatus: "idle" });
      
      return {
        status: "error",
        error: error.message,
      };
    }
  }

  @callable()
  async getStatus(): Promise<any> {
    return {
      status: this.state.researchStatus,
      plan: this.state.currentPlan,
      workflowId: this.state.workflowId,
      findings: this.state.findings,
    };
  }

  @callable()
  async reportProgress(workflowId: string, findings: any): Promise<void> {
    this.logger.info("Workflow progress reported", { workflowId, findings });
    
    await this.setState({
      ...this.state,
      findings,
      researchStatus: "review_required",
      approvalRequired: true,
    });
  }

  @callable()
  async approveFindings(): Promise<any> {
    await this.setState({
      ...this.state,
      researchStatus: "completed",
      approvalRequired: false,
    });

    return {
      status: "approved",
      findings: this.state.findings,
    };
  }

  /**
   * Determines if a workflow should be triggered based on the message and plan
   */
  private shouldTriggerWorkflow(message: string, plan: string): boolean {
    const keywords = ["analyze", "deep dive", "research", "clone", "vectorize", "index"];
    const lowerMessage = message.toLowerCase();
    const lowerPlan = plan.toLowerCase();

    return keywords.some(
      (keyword) => lowerMessage.includes(keyword) || lowerPlan.includes(keyword)
    );
  }

  /**
   * Extracts repository information from a message
   */
  private extractRepoInfo(message: string): { owner: string; name: string; url: string } | null {
    // Match patterns like "facebook/react" or "https://github.com/facebook/react"
    const repoPattern = /(?:https?:\/\/github\.com\/)?([a-zA-Z0-9_-]+)\/([a-zA-Z0-9_-]+)/;
    const match = message.match(repoPattern);

    if (match) {
      const owner = match[1];
      const name = match[2];
      return {
        owner,
        name,
        url: `https://github.com/${owner}/${name}.git`,
      };
    }

    return null;
  }
}
