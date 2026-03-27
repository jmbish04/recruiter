// Dynamic imports used instead of static
import { Agent as CFAgent, callable } from "agents";
import { z } from "zod";

const RouteSchema = z.object({
  category: z.enum(["billing", "technical", "general"]),
  reasoning: z.string()
});

export class RouterAgent extends CFAgent<Env> {
  
  @callable()
  async handleRequest(query: string) {
    const { Agent, run } = await import("@openai/agents");
    
    // The Router / Classifier
    const router = new Agent({
      name: "Router",
      instructions: "Classify the user input to route it to the correct department.",
      outputType: RouteSchema
    });

    // Specialized Agents
    const billingAgent = new Agent({ name: "Billing", instructions: "Handle invoices and payments." });
    const techAgent = new Agent({ name: "TechSupport", instructions: "Debug technical issues." });
    const generalAgent = new Agent({ name: "General", instructions: "Helpful general assistant." });

    // 1. Classify
    const routeResult = await run(router, query);
    const route = routeResult.finalOutput;

    if (!route) return "Routing failed";

    console.log(`[Router] Routing to: ${route.category} (Reason: ${route.reasoning})`);

    // 2. Execute selected agent
    let targetAgent;
    switch (route.category) {
      case "billing": targetAgent = billingAgent; break;
      case "technical": targetAgent = techAgent; break;
      default: targetAgent = generalAgent; break;
    }

    const result = await run(targetAgent, query);
    return {
      category: route.category,
      response: result.finalOutput
    };
  }
}