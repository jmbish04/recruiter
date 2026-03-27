import { BaseAgent, Agent } from "@/ai/agent-sdk";
import { getAgentModel } from "@/ai/providers/config";
import { ResearchLogger } from "@research-logger";
import { Logger } from "@/lib/logger";

export interface AgentConfig {
  instructions?: string;
  moduleName?: string; // Optional override
}

export abstract class BaseOrchestrator extends BaseAgent<Env> {
  protected agent!: Agent; // Initialized lazily


  constructor(state: DurableObjectState, env: Env) {
      super(state, env);
    (this as any).logger = new Logger(env, `orchestrator/base`); // Default logger
  }

  protected initAgent(config: AgentConfig = {}) {
     const model = getAgentModel(config.moduleName || 'default', this.env);
     (this as any).logger = new Logger(this.env, `orchestrator/${config.moduleName || 'base'}`);
     
    this.agent = new Agent({
      name: config.moduleName || "Orchestrator",
      model: model,
      instructions: config.instructions || "You are a senior orchestrator responsible for planning and delegating tasks.",
    });
  }

  abstract plan(input: string): Promise<any>;

  protected async runOrchestration(input: string) {
    if (!this.agent) {
         this.initAgent();
    }
    this.logger.debug(`Running agent with input: ${input.slice(0, 100)}...`);
    const start = Date.now();
    
    // Use BaseAgent's runAgent wrapper
    // Now compatible: runAgent(agent, input)
    const result = await super.runAgent(this.agent, input);
    
    const duration = Date.now() - start;
    this.logger.info(`Agent execution completed in ${duration}ms`, { inputSize: input.length });
    return result.finalOutput;
  }
}
