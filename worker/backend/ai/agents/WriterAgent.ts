import { Agent, Connection } from "agents";
import { generateStructuredResponse } from "@/ai/providers";

export class WriterAgent extends Agent<Env> {
  async onConnect(connection: Connection) {
    connection.send(JSON.stringify({ type: "status", message: "WriterAgent Connected" }));
  }

  async onMessage(connection: Connection, message: string) {
    try {
      const { jobId, profileText, jobPayload, type } = JSON.parse(message);
      
      connection.send(JSON.stringify({ type: "info", message: `Drafting ${type} for Job ID: ${jobId}` }));

      const schema = {
        type: "object",
        properties: {
          blocks: {
            type: "array",
            description: "The generated document structured as Plate UI / Slate.js JSON blocks",
            items: {
              type: "object",
              properties: {
                type: { type: "string", enum: ["p", "h1", "h2", "ul", "li"] },
                children: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: { text: { type: "string" } },
                    required: ["text"]
                  }
                }
              },
              required: ["type", "children"]
            }
          }
        },
        required: ["blocks"],
        additionalProperties: false
      };

      const userSamplesContext = "No sample blocks saved yet.";

      const prompt = `
        Draft a highly customized ${type === 'resume' ? 'resume body' : 'cover letter'} for this candidate:
        Profile: ${profileText}
        
        Job Details:
        ${JSON.stringify(jobPayload, null, 2)}
        
        Use the following user preferred phrasing samples if relevant:
        ${userSamplesContext}
        
        Return the document as strict Plate UI JSON structure (an array of block objects with type and children).
      `;

      type PlateUIResult = { blocks: any[] };

      const result = await generateStructuredResponse<PlateUIResult>(
        this.env,
        prompt,
        schema,
        "You are an expert career consultant drafting bespoke application materials.",
        { model: "@cf/meta/llama-3.1-8b-instruct" },
        "worker-ai"
      );

      connection.send(JSON.stringify({ 
        type: "success", 
        message: "Drafting Complete",
        payload: {
          jobId,
          type,
          plateContent: result.blocks
        }
      }));

    } catch (err: any) {
      console.error("WriterAgent Error:", err);
      connection.send(JSON.stringify({ type: "error", message: `Writing error: ${err.message}` }));
    }
  }
}
