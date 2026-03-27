
import { generateStructuredResponse } from "@/ai/providers";

export interface HealthFailureAnalysis {
    rootCause: string;
    suggestedFix: string;
    severity: 'low' | 'medium' | 'critical';
    confidence: number;
    providedContext?: {
        stepName: string;
        errorMsg: string;
        details?: any;
    };
    fixPrompt: string;
}

/**
 * Analyzes a health check failure using AI to determine root cause and fix.
 */
export async function analyzeFailure(
    env: Env,
    stepName: string,
    errorMsg: string,
    details?: any,
    options?: { reasoningEffort?: "low" | "medium" | "high" }
): Promise<HealthFailureAnalysis | null> {
    if (!env.AI) return null;

    const contextPayload = details || {};
    const safeContextString = Object.keys(contextPayload).length > 0
        ? JSON.stringify(contextPayload).substring(0, 10000)
        : "None";

    const detailsStr = safeContextString;

    // Explicitly format the input so the model can echo it back accurately.
    const prompt = `
    You are a Site Reliability Engineer invoking a Health Diagnosis Agent.
    
    === INPUT DATA (MUST ECHO) ===
    Step Name: "${stepName}"
    Error Message: "${errorMsg}"
    ==============================

    === TECHNICAL DETAILS ===
    ${detailsStr}
    =========================
    
    Task:
    1. READ the "TECHNICAL DETAILS". Find the entry with status "FAILURE".
    2. DIAGNOSE the root cause based on that failure (e.g., "Authentication", "Timeout", "Model Refusal").
    3. PROVIDE a fix.
    4. ECHO the Input Data into the 'providedContext' field EXACTLY as shown above.
    5. GENERATE a "Fix Prompt" for a coding agent.
    
    Restrictions:
    - You must NOT return "Unknown" for Step Name or Error Message. Use the values provided in "INPUT DATA".
    - If details contain a specific error, cite it.
    `;

    const schema = {
        type: "object",
        properties: {
            providedContext: {
                type: "object",
                description: "Context provided to the AI. You MUST echo back the input data here.",
                properties: {
                    stepName: { type: "string" },
                    errorMsg: { type: "string" },
                    details: { type: "object" }
                },
                required: ["stepName", "errorMsg"]
            },
            rootCause: {
                type: "string",
                description: "Technical explanation of why it failed"
            },
            suggestedFix: {
                type: "string",
                description: "Actionable command or configuration change to fix it"
            },
            severity: {
                type: "string",
                enum: ["low", "medium", "critical"],
                description: "Critical = System Down, Medium = Degradation, Low = Minor Warning"
            },
            confidence: {
                type: "number",
                minimum: 0,
                maximum: 1,
                description: "Confidence (0.0 - 1.0) in this diagnosis"
            },
            fixPrompt: {
                type: "string",
                description: "A detailed prompt for another AI agent to fix this specific issue"
            }
        },
        required: ["rootCause", "suggestedFix", "severity", "confidence", "providedContext", "fixPrompt"]
    };


    try {
        const analysis = await generateStructuredResponse<HealthFailureAnalysis>(
            env,
            prompt,
            schema,
            undefined,
            { effort: options?.reasoningEffort || "high" }
        );
        
        if (!analysis) {
            throw new Error("Provider returned empty response or encountered a parsing error.");
        }
        
        return analysis;
    } catch (error: any) {
        console.error(`AI Analysis critical error for ${stepName}: `, error);
        
        return {
            rootCause: `Agent execution failed: ${error.message || "400 Bad Request"}`,
            suggestedFix: "Review raw logs, check AI Gateway token limits, and verify payload schemas.",
            severity: "critical",
            confidence: 0,
            providedContext: {
                stepName: stepName,
                errorMsg: error.message || "Unknown execution error",
                details: { errorName: error.name || "Error", rawError: error.message }
            },
            fixPrompt: "Please analyze the logs to determine why the Health Diagnostician failed."
        };
    }
}
