import { Agent as CFAgent } from "agents";
import {
  createRunner,
  resolveDefaultAiModel,
  resolveDefaultAiProvider,
  type SupportedProvider,
} from "@/ai/agent-sdk";
import { Logger } from "@/lib/logger";
import type { z } from "zod"; // ✅ Use type import to avoid runtime evaluation

export class BaseAgent<State = any> extends CFAgent<Env, State> {
  private _logger?: Logger;

  protected get logger(): Logger {
    return this._logger ?? new Logger(this.env, this.constructor.name);
  }

  protected set logger(value: Logger) {
    this._logger = value;
  }

  protected resolveProvider(preferredProvider?: string | null): SupportedProvider {
    const configured = String(preferredProvider || "").trim();
    if (!configured) return resolveDefaultAiProvider(this.env);
    return configured as SupportedProvider;
  }

  protected resolveModel(provider: SupportedProvider, preferredModel?: string | null): string {
    const configured = String(preferredModel || "").trim();
    return configured || resolveDefaultAiModel(this.env, provider);
  }

  protected async runTextWithModel(input: {
    name: string;
    instructions: string;
    prompt: string;
    provider?: string | null;
    model?: string | null;
    tools?: any[];
  }): Promise<string> {
    const provider = this.resolveProvider(input.provider);
    const model = this.resolveModel(provider, input.model);
    
    // ✅ Dynamically import the heavy SDK only when executed
    const { Agent: OpenAIAgent } = await import("@openai/agents");
    
    const runner = await createRunner(this.env, provider, model);
    
    // ⚠️ Note: Removed unused createGatewayClient
    
    const agent = new OpenAIAgent({
      name: input.name,
      model,
      instructions: input.instructions,
      tools: input.tools,
      // ⚠️ Removed local 'stdio'/'npx' MCP config as it will crash a CF Worker.
      // If MCP is required, you must use an SSE/HTTP transport or inject it as a standard tool.
    });

    const result = await runner.run(agent, input.prompt);
    return String(result.finalOutput ?? "");
  }

  protected async runStructuredResponseWithModel<T = any>(input: {
    name: string;
    instructions: string;
    prompt: string;
    schema: z.ZodType<T>;
    provider?: string | null;
    model?: string | null;
    tools?: any[];
  }): Promise<T> {
    const provider = this.resolveProvider(input.provider);
    const model = this.resolveModel(provider, input.model);
    
    // ✅ Dynamically import the heavy SDK only when executed
    const { Agent: OpenAIAgent } = await import("@openai/agents");
    
    const runner = await createRunner(this.env, provider, model);
    
    const agent = new OpenAIAgent({
      name: input.name,
      model,
      instructions: input.instructions,
      outputType: input.schema as any,
      tools: input.tools,
      // ⚠️ Removed local 'stdio'/'npx' MCP config
    });
    
    try {
      const result = await runner.run(agent, input.prompt);
      return result.finalOutput as T;
    } catch (error: any) {
      this.logger.error(`[runStructuredResponseWithModel] ${error.message}`, { error });
      throw error;
    }
  }
}