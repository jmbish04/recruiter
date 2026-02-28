// Dynamic imports used instead of static
import { Agent as CFAgent, callable } from "agents";

export class ParallelAgent extends CFAgent<Env> {
  
  @callable()
  async debate(topic: string) {
    const { Agent, run } = await import("@openai/agents");
    
    // Independent workers
    const proArguer = new Agent({
      name: "Pro",
      instructions: "Give arguments IN FAVOR of the topic."
    });

    const conArguer = new Agent({
      name: "Con",
      instructions: "Give arguments AGAINST the topic."
    });

    const synthesizer = new Agent({
      name: "Synthesizer",
      instructions: "Synthesize the provided arguments into a balanced conclusion."
    });

    // 1. Run in parallel
    console.log(`[Parallel] Starting debate on: ${topic}`);
    
    const [proResult, conResult] = await Promise.all([
      run(proArguer, topic),
      run(conArguer, topic)
    ]);

    const proArgs = proResult.finalOutput;
    const conArgs = conResult.finalOutput;

    // 2. Synthesize
    const finalInput = `
      Topic: ${topic}
      Arguments For: ${proArgs}
      Arguments Against: ${conArgs}
      
      Provide a final verdict.
    `;

    const summaryResult = await run(synthesizer, finalInput);
    
    return {
      pro: proArgs,
      con: conArgs,
      verdict: summaryResult.finalOutput
    };
  }
}