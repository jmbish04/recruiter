import { Tool, Agent, createGatewayAgent } from '@/ai/agent-sdk';
import { getAgentModel } from "@/ai/providers/config";
import { getMessageContent } from '@/ai/agent-utils';

export type PromptChainingStep = Record<string, never>;

/**
 * Abstract Base Class for Prompt Chaining Pattern.
 * Generates content, evaluates it, and regenerates if necessary.
 */
export abstract class BasePromptChainingAgent {
  constructor(protected env: Env) {}

  protected maxTurns = 3;

  /**
   * Implement this to check quality.
   * Return a JSON object with metrics and a boolean 'passes' flag (or inferred from metrics).
   */
  protected abstract checkQuality(content: string): Promise<{ passes: boolean; feedback: string[] }>;

  /**
   * Main execution flow.
   */
  async execute(input: string, instructions?: string) {
    const model = getAgentModel('default', this.env);
    const generator = await createGatewayAgent(this.env, model, instructions || "You are a helpful assistant.");
    
    // 1. Generate
    const initialRes = await generator.run(input);
    // 2. Evaluate
    let content = getMessageContent(initialRes.data);
    let quality = await this.checkQuality(content);

    // 3. Conditional Regenerate
    let turns = 0;
    while (!quality.passes && turns < this.maxTurns) {
      console.log(`Quality check failed: ${quality.feedback.join('\n')}. Regenerating...`);
      
      const refinedRes = await generator.run(`
        Original Request: ${input}
        Previous Attempt: ${content}
        Critique: ${quality.feedback.join('\n')}
        Improve the response based on the critique.
      `);
      
      content = getMessageContent(refinedRes.data);
      quality = await this.checkQuality(content);
      turns++;
    }

    return { content, quality };
  }
}
