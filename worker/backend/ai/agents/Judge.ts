import { BaseAgent } from "./BaseAgent";
import { ResearchLogger } from "@research-logger";
import { getDb } from "@db";
import { resolveDefaultAiProvider, resolveDefaultAiModel } from "@/ai/providers/config";
import { z } from "zod";

export class JudgeAgent extends BaseAgent {
  private researchLogger?: ResearchLogger;
  private doState: DurableObjectState;

  constructor(state: DurableObjectState, env: Env) {
    super(state, env);
    this.doState = state;
  }

  async evaluateCandidate(briefId: string, candidate: { url: string; content?: string }, criteria: string) {
    const db = getDb(this.env.DB);
    this.researchLogger = new ResearchLogger(db, briefId, null, "JudgeAgent", this.doState);
    
    await this.researchLogger.logInfo("Evaluation", `Judging candidate: ${candidate.url}`);

    // LLM-as-a-Judge
    let result = { score: 0, reasoning: "Evaluation failed", relevant: false };
    try {
      result = await this.runStructuredResponseWithModel({
        name: "ResearchJudge",
        instructions: `You are a critical research judge. evaluate the following content against the research criteria.`,
        prompt: `Criteria: ${criteria}\n\nCandidate Content: ${candidate.content?.substring(0, 5000)}...`,
        schema: z.object({
          score: z.number().min(0).max(100).describe("Score from 0 to 100"),
          reasoning: z.string().describe("Explanation for the score"),
          relevant: z.boolean().describe("Whether the content is relevant to the criteria")
        }),
        provider: resolveDefaultAiProvider(this.env),
        model: resolveDefaultAiModel(this.env, resolveDefaultAiProvider(this.env))
      });
    } catch (e) {
      await this.researchLogger?.logError("Evaluation", e, { raw: "Structured output failed" });
    }

    await this.researchLogger?.logThought("Evaluation", `Score: ${result.score}. Reasoning: ${result.reasoning}`);
    
    return result;
  }
}
