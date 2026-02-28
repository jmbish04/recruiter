import { BaseOrchestrator } from "./base/orchestrator";
import { callable, getAgentByName } from "agents";
import { generateUuid } from "@/utils/common";

export class OrchestratorAgent extends BaseOrchestrator {
  
  constructor(state: DurableObjectState, env: Env) {
    super(state, env);
    this.initAgent({
      moduleName: "Orchestrator",
      instructions: "You are a concise and helpful engineering assistant."
    });
  }

  @callable()
  healthProbe() {
    return {
      status: "ok",
      agent: "OrchestratorAgent",
      timestamp: new Date().toISOString(),
    };
  }

  @callable()
  async start(prompt: string) {
    this.logger.info(`Starting new session with prompt: ${prompt}`);
    return { 
      sessionId: generateUuid(),
      message: "Session started" 
    };
  }

  async plan(input: string): Promise<any> {
    try {
      this.logger.info(`Planning for goal: ${input}`);
      
      const getByName = getAgentByName as any;
      const plannerStub = await getByName(this.env.PLANNER, "global-planner");

      const planResponse = await plannerStub.fetch("http://agent/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ goal: input }),
      });

      if (!planResponse.ok) {
        throw new Error(`Planner failed: ${planResponse.status} ${await planResponse.text()}`);
      }

      const planJson = await planResponse.json();
      return planJson;

    } catch (error: any) {
      this.logger.error(`Planning failed`, { error: error.message });
      throw error;
    }
  }

  async onMessage(connection: WebSocket, message: string) {
    if (!message?.trim()) {
      connection.send(JSON.stringify({ type: "error", content: "Message is required" }));
      return;
    }

    try {
      if (message.toLowerCase().includes("plan")) {
        connection.send(JSON.stringify({ type: "status", content: "Contacting Planner Agent..." }));
        
        const planResult = await this.plan(message);
        
        connection.send(
          JSON.stringify({
            type: "tool-result",
            toolName: "create_plan",
            result: planResult,
          }),
        );
      } else {
        // Chat
        const response = await this.runOrchestration(message);
        connection.send(JSON.stringify({ type: "text", content: response }));
      }
    } catch (error: any) {
      connection.send(JSON.stringify({ type: "error", content: `Execution failed: ${error.message}` }));
    }
  }
}
