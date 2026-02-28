import type { AgentInputItem } from "@openai/agents";
import { Agent as CFAgent, callable } from "agents";
import { z } from "zod";

// --- Schemas & Types ---
const EvaluationSchema = z.object({
  feedback: z.string(),
  score: z.enum(["pass", "fail"])
});

type EvaluatorState = {
  history: {
    iteration: number;
    content: string;
    feedback: string;
    score: "pass" | "fail";
  }[];
  finalResult?: string;
  status: string;
};

// --- Agent Class ---
export class EvaluatorOptimizerAgent extends CFAgent<Env, EvaluatorState> {
  initialState: EvaluatorState = {
    history: [],
    status: "idle"
  };

  @callable()
  async execute(input: string) {
    const { Agent, run, withTrace } = await import("@openai/agents");
    
    // 1. Generator Agent (The "Writer")
    const generator = new Agent({
      name: "Generator",
      instructions: "You are a helpful assistant. Improve your previous response based on feedback if provided."
    });

    // 2. Evaluator Agent (The "Judge")
    const evaluator = new Agent({
      name: "Evaluator",
      instructions: "Evaluate the content for accuracy and clarity. Provide constructive feedback.",
      outputType: EvaluationSchema
    });

    await withTrace("Evaluator-Optimizer Loop", async () => {
      let currentInput: AgentInputItem[] = [{ role: "user", content: input }];
      let attempts = 0;
      const MAX_ATTEMPTS = 3;

      this.setState({ ...this.state, status: "running", history: [] });

      while (attempts < MAX_ATTEMPTS) {
        // --- Generate ---
        console.log(`[Optimizer] Iteration ${attempts + 1}: Generating...`);
        const genResult = await run(generator, currentInput);
        const content = genResult.finalOutput;

        if (!content) throw new Error("No content generated");

        // --- Evaluate ---
        console.log(`[Optimizer] Iteration ${attempts + 1}: Evaluating...`);
        const evalResult = await run(evaluator, [
          { role: "user", content: `Original Request: ${input}\nGenerated Content: ${content}` }
        ]);
        
        const judgment = evalResult.finalOutput; // Typed as EvaluationSchema
        
        // Update State
        const newHistory = [
          ...this.state.history, 
          { 
            iteration: attempts, 
            content, 
            feedback: judgment?.feedback || "", 
            score: judgment?.score || "fail" 
          }
        ];
        this.setState({ ...this.state, history: newHistory });

        // Check Exit Condition
        if (judgment?.score === "pass") {
          this.setState({ ...this.state, status: "complete", finalResult: content });
          return content;
        }

        // Prepare for next loop
        currentInput = [
          ...genResult.history, // Keep history so generator sees its own previous work
          { role: "user", content: `Feedback: ${judgment?.feedback}. Please improve.` }
        ];
        
        attempts++;
      }

      this.setState({ ...this.state, status: "failed" });
      return "Max iterations reached without passing score.";
    });
  }
}