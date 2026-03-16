import { Agent } from 'agents';
import { drizzle } from 'drizzle-orm/d1';
import * as schema from '../db/schemas/index';
import { eq } from 'drizzle-orm';
import { OpenAI } from 'openai';

interface Env {
  DB: D1Database;
  OPENAI_API_KEY: string;
  AI_GATEWAY_URL: string;
}

const ONE_HOUR_IN_MS = 60 * 60 * 1000;
const SYSTEM_PROMPT = `You are an expert technical recruiter AI. Analyze the following job description and provide a score from 0-100 on these metrics: overall, location, benefits, salary. Return JSON only: {"overallScore": 85, "locationScore": 90, "benefitsScore": 80, "salaryScore": 75, "aiAnalysis": "Brief explanation"}`;

export class JobAnalyzerAgent extends Agent<Env> {
  async onStart() {
    this.schedule(ONE_HOUR_IN_MS);
  }

  async onSchedule() {
    console.log("Running scheduled job analysis...");
    await this.analyzePendingJobs();
  }

  async analyzePendingJobs() {
    const db = drizzle(this.env.DB, { schema });

    const pendingJobs = await db.select()
      .from(schema.jobScores)
      .where(eq(schema.jobScores.status, 'pending'))
      .leftJoin(schema.jobs, eq(schema.jobScores.jobId, schema.jobs.id))
      .all();

    if (pendingJobs.length === 0) return;

    const openai = new OpenAI({
      apiKey: this.env.OPENAI_API_KEY,
      baseURL: this.env.AI_GATEWAY_URL || 'https://api.openai.com/v1',
    });

    for (const record of pendingJobs) {
      if (!record.jobs) continue;

      const job = record.jobs;

      try {
        const analysis = await openai.chat.completions.create({
          model: 'gpt-4o',
          messages: [
            {
              role: 'system',
              content: SYSTEM_PROMPT
            },
            {
              role: 'user',
              content: JSON.stringify({
                title: job.title,
                description: job.description,
                location: job.location
              })
            }
          ],
          response_format: { type: 'json_object' }
        });

        const resultStr = analysis.choices[0].message.content;
        if (resultStr) {
          const result = JSON.parse(resultStr);
          await db.update(schema.jobScores)
            .set({
              overallScore: result.overallScore,
              locationScore: result.locationScore,
              benefitsScore: result.benefitsScore,
              salaryScore: result.salaryScore,
              aiAnalysis: result.aiAnalysis,
              status: 'reviewed',
              updatedAt: new Date().toISOString()
            })
            .where(eq(schema.jobScores.id, record.job_scores.id))
            .run();
        }
      } catch (e) {
        console.error("Failed to parse AI response", e);
        await db.update(schema.jobScores)
          .set({
            status: 'failed',
            aiAnalysis: `Failed to parse AI response: ${e instanceof Error ? e.message : String(e)}`,
            updatedAt: new Date().toISOString()
          })
          .where(eq(schema.jobScores.id, record.job_scores.id))
          .run();
      }
    }
  }
}
