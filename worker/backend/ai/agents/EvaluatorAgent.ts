import { Agent, Connection } from "agents";
import { generateStructuredResponse } from "@/ai/providers";

export class EvaluatorAgent extends Agent<Env> {
  async onConnect(connection: Connection) {
    connection.send(JSON.stringify({ type: "status", message: "EvaluatorAgent Connected" }));
  }

  async onMessage(connection: Connection, message: string) {
    try {
      const { jobId, profileText, preferencesText, jobPayload } = JSON.parse(message);
      
      connection.send(JSON.stringify({ type: "info", message: `Evaluating Job ID: ${jobId}` }));

      const schema = {
        type: "object",
        properties: {
          aiScore: { type: "number", description: "Overall holistic match score (0-100)" },
          feedbackNotes: { type: "string", description: "A concise paragraph explaining the score" }
        },
        required: ["aiScore", "feedbackNotes"],
        additionalProperties: false
      };

      const humanFeedbackContext = "Historically, the user down-votes jobs with non-remote requirements and low equity.";
      
      const prompt = `
        Evaluate this job description against the candidate's profile and preferences.
        
        Profile: ${profileText}
        Preferences: ${preferencesText}
        Historical Human Feedback Context: ${humanFeedbackContext}
        
        Job Details:
        ${JSON.stringify(jobPayload, null, 2)}
        
        Return a score from 0-100 and a short justification paragraph. Note: Strict JSON output required.
      `;

      type EvalResult = { aiScore: number, feedbackNotes: string };

      const result = await generateStructuredResponse<EvalResult>(
        this.env,
        prompt,
        schema,
        "You are an expert technical recruiter analyzing job fits.",
        {},
        "workerai"
      );

      connection.send(JSON.stringify({ 
        type: "success", 
        message: "Evaluation Complete",
        payload: {
          jobId,
          aiScore: result.aiScore,
          notes: result.feedbackNotes
        }
      }));

    } catch (err: any) {
      console.error("EvaluatorAgent Error:", err);
      connection.send(JSON.stringify({ type: "error", message: `Evaluation error: ${err.message}` }));
    }
  }
}
