import { BaseAgent, Agent } from "@agent-sdk"; // Agent alias for OpenAIAgent
import { getAgentModel } from "@/ai/providers/config";
import { Logger } from "@logging";

export interface AgentConfig {
  instructions?: string;
  moduleName?: string;
}

export abstract class BaseTaskAssignee extends BaseAgent<Env> {
  protected openaiAgent: Agent;


  constructor(state: any, env: Env, config: AgentConfig = {}) {
    super(state, env);
    const model = getAgentModel(config.moduleName || 'default', env);
    (this as any).logger = new Logger(env, `task-assignee/${config.moduleName || 'base'}`);

    this.openaiAgent = new Agent({
      name: config.moduleName || "TaskAssignee",
      model: model,
      // apiKey: env.CLOUDFLARE_AI_GATEWAY_TOKEN, // Removed: Not part of Agent constructor
      // BaseAgent might handle some of standard invocation, but constructing OpenAIAgent manually is fine
      instructions: config.instructions || "You are a specialized task executor.",
    });
  }

  abstract execute(input: any): Promise<any>;

  protected async runTask(input: string) {
    this.logger.debug(`Running agent task with input size: ${input.length}`);
    const start = Date.now();
    
    // Use BaseAgent's wrapper for standardized history/status
    const result = await super.runAgent(this.openaiAgent, input);
    
    const duration = Date.now() - start;
    this.logger.info(`Agent task completed in ${duration}ms`, { outputSize: JSON.stringify(result.finalOutput).length });
    return { data: result.finalOutput }; // Adapting to match previous return signature if needed, or expected by subclasses
  }
}
