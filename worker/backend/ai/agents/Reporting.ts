import { BaseAgent } from "./BaseAgent";
import { ResearchLogger } from "@research-logger";
import { getDb } from "@db";
import { resolveDefaultAiProvider, resolveDefaultAiModel } from "@/ai/providers/config";

export class ReportingAgent extends BaseAgent {
  private researchLogger?: ResearchLogger;
  private doState: DurableObjectState;

  constructor(state: DurableObjectState, env: Env) {
    super(state, env);
    this.doState = state;
  }

  async generateReport(briefId: string, candidates: any[], plan: any) {
    const db = getDb(this.env.DB);
    this.researchLogger = new ResearchLogger(db, briefId, null, "ReportingAgent", this.doState);
    
    await this.researchLogger.logInfo("Reporting", `Synthesizing report from ${candidates.length} sources...`);

    const sourcesText = candidates.map((c, i) => `Source [${i+1}] (${c.sourceUrl}): ${c.initialSummary}`).join("\n\n");
    const prompt = `Research Goal: ${JSON.stringify(plan)}\n\nVerified Sources:\n${sourcesText}\n\nGenerate a comprehensive markdown report. Cite sources using [Source URL] notation.`;

    const report = await this.runTextWithModel({
      name: "ResearchReporter",
      instructions: `You remain objective and thorough. Synthesize the provided sources into a cohesive report.
      Use standard Markdown. Include a "Key Findings", "Detailed Analysis", and "References" section.`,
      prompt,
      provider: resolveDefaultAiProvider(this.env),
      model: resolveDefaultAiModel(this.env, resolveDefaultAiProvider(this.env))
    });

    await this.researchLogger?.logToolOutput("ReportGeneration", "Report generated successfully.");
    
    return report;
  }
}
