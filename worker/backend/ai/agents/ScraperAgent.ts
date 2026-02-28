import { Agent, Connection } from "agents";
import { z } from "zod";

// Validates the incoming WebSocket message
const ScrapeRequestSchema = z.object({
  type: z.literal("scrape_job"),
  url: z.string().url(),
  companyId: z.number()
});

export class ScraperAgent extends Agent<Env> {
  async onConnect(connection: Connection) {
    connection.send(JSON.stringify({ type: "status", message: "ScraperAgent Connected" }));
  }

  async onMessage(connection: Connection, message: string) {
    try {
      const data = JSON.parse(message);
      const parsed = ScrapeRequestSchema.parse(data);
      
      connection.send(JSON.stringify({ type: "info", message: `Scraping: ${parsed.url}` }));
      
      // We use the REST API because the prompt/json endpoint is currently REST only
      // It executes headless rendering + AI extraction concurrently
      const accountId = this.env.CLOUDFLARE_ACCOUNT_ID;
      const token = this.env.CLOUDFLARE_BROWSER_RENDER_TOKEN;
      
      if (!accountId || !token) {
        throw new Error("Missing CLOUDFLARE_ACCOUNT_ID or CLOUDFLARE_BROWSER_RENDER_TOKEN in environment.");
      }

      const prompt = `Extract the exact job details into JSON. We need the title, location, salary range explicitly mentioned, compensation overview, equity structure, bonus structure, required skills (requirements), benefits, health benefits, financial benefits, time off, and the complete description. Use literal 'null' if a field is entirely missing from the page texts.`;
      
      const schema = {
        type: "object",
        properties: {
          title: { type: "string" },
          location: { type: "string", description: "City, State or Remote if specified" },
          salary: { type: "string", description: "Direct numerical range, e.g., $100k-$150k" },
          compensation: { type: "string" },
          equity: { type: "string" },
          bonus: { type: "string" },
          requirements: { type: "array", items: { type: "string" } },
          benefits: { type: "array", items: { type: "string" } },
          health_benefits: { type: "array", items: { type: "string" } },
          financial_benefits: { type: "array", items: { type: "string" } },
          time_off: { type: "string" },
          description: { type: "string" }
        },
        required: ["title", "location", "salary", "compensation", "equity", "bonus", "requirements", "benefits", "health_benefits", "financial_benefits", "time_off", "description"],
        additionalProperties: false
      };

      const res = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/browser/json`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${token}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          url: parsed.url,
          prompt,
          response_format: {
            type: "json_schema",
            json_schema: {
              name: "job_extraction",
              schema,
              strict: true
            }
          }
        })
      });

      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`Cloudflare Browser Render failed [${res.status}]: ${errText}`);
      }

      const jsonRes: any = await res.json();
      
      // Save data back to D1 Database (Simplified for ScraperAgent, detailed evaluation later)
      // Normally we'd do DB insertion here or return it to the caller to handle the DB transaction
      connection.send(JSON.stringify({ 
        type: "success", 
        message: "Extraction Complete",
        payload: jsonRes.result 
      }));

    } catch (err: any) {
      console.error("ScraperAgent Error:", err);
      connection.send(JSON.stringify({ type: "error", message: `Scraper error: ${err.message}` }));
    }
  }
}
