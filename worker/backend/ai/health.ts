import { generateText, generateStructuredResponse, generateEmbedding } from "@/ai/providers";
import { getAIGatewayUrl } from "./utils/ai-gateway";
import { cleanJsonOutput, sanitizeAndFormatResponse } from "./utils/sanitizer";
import { analyzeFailure } from "./utils/diagnostician";
import { HealthStepResult } from "@/health/types";
import { getGeminiApiKey, getOpenaiApiKey } from "@utils/secrets";
import { verifyCloudflareTokens } from "@utils/cloudflare/tokens";

/**
 * Checks the health of the AI domain by validating:
 * 1. Sanitizer utilities (CPU-bound)
 * 2. Unstructured Text Generation (Network-bound)
 * 3. Structured JSON Generation (Network-bound, Multi-step)
 * 4. Vector Embeddings (Network-bound)
 * 5. Gemini via AI Gateway (SDK + Raw)
 * 6. OpenAI via AI Gateway (SDK + Raw)
 * 7. Diagnostician (self-test)
 */
export async function checkHealth(env: Env): Promise<HealthStepResult> {
    const start = Date.now();
    const subChecks: Record<string, any> = {};

    // Helper to run a check safely
    const runCheck = async (name: string, fn: () => Promise<any>) => {
        const checkStart = Date.now();
        try {
            const result = await fn();
            subChecks[name] = { status: "OK", latency: Date.now() - checkStart, ...result };
        } catch (e: any) {
            let errorDetails = e instanceof Error ? e.message : String(e);
            
            // Try to extract nested JSON if the error string is JSON
            try {
                if (errorDetails.startsWith('{') && errorDetails.includes('"error"')) {
                    const parsed = JSON.parse(errorDetails);
                    errorDetails = JSON.stringify(parsed, null, 2);
                }
            } catch (_) {}

            subChecks[name] = {
                status: "FAILURE",
                latency: Date.now() - checkStart,
                error: errorDetails,
                errorName: e?.name || "Error",
                stack: e?.stack,
                details: e?.details || e?.cause || undefined
            };
        }
    };

    // --- 1. Test Sanitizers (Fast, Synchronous) ---
    try {
        const dirtyJson = '```json\n{"status": "ok"}\n```';
        const cleanJson = cleanJsonOutput(dirtyJson);
        if (cleanJson !== '{"status": "ok"}') {
            throw new Error(`cleanJsonOutput failed. Got: ${cleanJson}`);
        }

        const markdown = "**Bold** and `code`";
        const html = sanitizeAndFormatResponse(markdown);
        if (!html.includes("<strong>Bold</strong>") || !html.includes("<code>code</code>")) {
            throw new Error(`sanitizeAndFormatResponse failed. Got: ${html}`);
        }
        subChecks.sanitizer = { status: "OK" };
    } catch (e) {
        subChecks.sanitizer = { status: "FAILURE", error: e instanceof Error ? e.message : String(e) };
    }

    // --- 2. Test Text Generation (GPT-OSS-120B) ---
    if (!env.AI) {
        subChecks.generateText = { status: "SKIPPED", reason: "env.AI binding missing" };
    } else {
        await runCheck("generateText", async () => {
            const response = await generateText(env, "Reply with exactly: Pong");
            if (!response || response.trim().length === 0) {
                throw new Error("Empty response");
            }
            return { sample: response.substring(0, 50) };
        });
    }

    // --- 3. Test Structured Output (GPT-OSS → Llama 3.3) ---
    if (!env.AI) {
        subChecks.generateStructured = { status: "SKIPPED", reason: "env.AI binding missing" };
    } else {
        await runCheck("generateStructured", async () => {
            const schema = {
                type: "object",
                properties: {
                    message: { type: "string" },
                    number: { type: "number" }
                },
                required: ["message", "number"]
            };

            // Use a clear, unambiguous prompt
            const result = await generateStructuredResponse<{ message: string; number: number }>(
                env,
                "Generate a test response with message='hello' and number=42",
                schema,
                undefined,
                { effort: "low" }
            );

            if (!result.message || typeof result.number !== 'number') {
                throw new Error(`Invalid response: ${JSON.stringify(result)}`);
            }
            return { response: result };
        });
    }

    // --- 4. Test Embeddings ---
    if (!env.AI) {
        subChecks.generateEmbedding = { status: "SKIPPED", reason: "env.AI binding missing" };
    } else {
        await runCheck("generateEmbedding", async () => {
            const vector = await generateEmbedding(env, "Health check embedding test");
            if (!Array.isArray(vector) || vector.length === 0) {
                throw new Error("Invalid vector returned");
            }
            return { dimensions: vector.length };
        });
    }

    // --- 5. Test AI Gateway Configuration ---
    // First verify all required env vars are present
    const aigEnvCheck: Record<string, boolean> = {
        CLOUDFLARE_ACCOUNT_ID: !!env.CLOUDFLARE_ACCOUNT_ID,
        AI_GATEWAY_NAME: !!env.AI_GATEWAY_NAME,
        AI_GATEWAY_TOKEN: !!env.AI_GATEWAY_TOKEN,
        GEMINI_API_KEY: !!(await getGeminiApiKey(env)),
        OPENAI_API_KEY: !!(await getOpenaiApiKey(env))
    };

    const missingEnvVars = Object.entries(aigEnvCheck)
        .filter(([_, present]) => !present)
        .map(([name, _]) => name);

    if (missingEnvVars.length > 0) {
        subChecks.aiGatewayConfig = {
            status: "FAILURE",
            error: `Missing env vars: ${missingEnvVars.join(", ")}`,
            envCheck: aigEnvCheck
        };
    } else {
        subChecks.aiGatewayConfig = { status: "OK", envCheck: aigEnvCheck };
    }

    // --- 5b. Verify AI Gateway Token is Active ---
    if (env.CLOUDFLARE_ACCOUNT_ID && env.AI_GATEWAY_TOKEN) {
        await runCheck("aiGatewayToken", async () => {
            const accountId = (typeof env.CLOUDFLARE_ACCOUNT_ID === 'object' && env.CLOUDFLARE_ACCOUNT_ID !== null && 'get' in env.CLOUDFLARE_ACCOUNT_ID ? await env.CLOUDFLARE_ACCOUNT_ID.get() : env.CLOUDFLARE_ACCOUNT_ID) as string;
            if (!accountId) throw new Error("CLOUDFLARE_ACCOUNT_ID is required for token verification");

            const token = (typeof env.AI_GATEWAY_TOKEN === 'object' && env.AI_GATEWAY_TOKEN !== null && 'get' in env.AI_GATEWAY_TOKEN ? await env.AI_GATEWAY_TOKEN.get() : env.AI_GATEWAY_TOKEN) as string;
            const gatewayName = env.AI_GATEWAY_NAME || "core-github-api";
            
            if (!token) throw new Error(`AI_GATEWAY_TOKEN is empty. Gateway Config: { name: "${gatewayName}", tokenName: "AI_GATEWAY_TOKEN" }`);
            
            // Re-use our Cloudflare Token Verification Utility (Prioritizes Account, then User)
            const verifyResult = await verifyCloudflareTokens(token, accountId, "AI_GATEWAY_TOKEN");
            
            if (!verifyResult.passed) {
                const sdkErrors = verifyResult.details?.user?.errors || verifyResult.details?.account?.errors || [];
                throw new Error(`Token verification failed against Account & User endpoints. Gateway Config: { name: "${gatewayName}", tokenName: "AI_GATEWAY_TOKEN" }\nSDK Errors: ${JSON.stringify(sdkErrors)}`);
            }

            return {
                tokenStatus: "active",
                message: `${verifyResult.detectedType} Token Active`,
                type: verifyResult.detectedType
            };
        });
    } else {
        subChecks.aiGatewayToken = { status: "SKIPPED", reason: "Missing required env vars" };
    }

    // --- 5c. Test Gemini (SDK) ---
    const geminiKey = await getGeminiApiKey(env);
    const hasGeminiAccess = !!(geminiKey || env.AI_GATEWAY_TOKEN);
    if (!hasGeminiAccess) {
        subChecks.gemini = { status: "SKIPPED", reason: "Missing GEMINI_API_KEY and AI_GATEWAY_TOKEN" };
    } else {
        await runCheck("gemini", async () => {
            const response = await generateText(env, "Reply with: Pong", "You are a ping bot.", { model: "gemini-2.5-flash" }, "gemini");
            if (!response.toLowerCase().includes("pong")) {
                throw new Error(`Unexpected response: ${response.substring(0, 100)}`);
            }
            return { sample: response.substring(0, 50) };
        });
    }

    // --- 5d. Test Gemini (Raw Fetch via Custom Router) ---
    if (!hasGeminiAccess || !env.CLOUDFLARE_ACCOUNT_ID) {
        subChecks.geminiRaw = { status: "SKIPPED", reason: "Missing Env Vars" };
    } else {
        await runCheck("geminiRaw", async () => {
            const model = "gemini-2.5-flash";
            // Do not pass apiVersion, let getAIGatewayUrl infer it from 'model' length
            const url = await getAIGatewayUrl(env, { provider: "google-ai-studio", modelName: model });

            const payload = {
                contents: [
                    {
                        role: "user",
                        parts: [{ text: "Reply with: Pong" }]
                    }
                ]
            };

            const gatewayToken = typeof env.AI_GATEWAY_TOKEN === 'object' && env.AI_GATEWAY_TOKEN !== null && 'get' in env.AI_GATEWAY_TOKEN ? await env.AI_GATEWAY_TOKEN.get() : env.AI_GATEWAY_TOKEN as string;
            const gatewayName = env.AI_GATEWAY_NAME || "core-github-api";

            if (!gatewayToken) throw new Error(`AI_GATEWAY_TOKEN is empty. Gateway Config: { name: "${gatewayName}" }`);

            // When AI Gateway has provider keys configured, only cf-aig-authorization is needed
            const headers: Record<string, string> = {
                "Content-Type": "application/json",
                "cf-aig-authorization": `Bearer ${gatewayToken}`,
            };

            const response = await fetch(url, {
                method: "POST",
                headers,
                body: JSON.stringify(payload)
            });

            if (!response.ok) {
                const text = await response.text();
                throw new Error(`HTTP ${response.status}: ${text}. Gateway Config: { name: "${gatewayName}" }`);
            }

            const data = await response.json() as any;
            const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || "";
            if (!text.toLowerCase().includes("pong")) {
                throw new Error(`Unexpected Raw response: ${JSON.stringify(data).substring(0, 200)}`);
            }
            return { success: true, model: model };
        });
    }

    // --- 5e. Test OpenAI (SDK) ---
    const openaiKey = await getOpenaiApiKey(env);
    const hasOpenAIAccess = !!(openaiKey || env.AI_GATEWAY_TOKEN);
    if (!hasOpenAIAccess) {
        subChecks.openai = { status: "SKIPPED", reason: "Missing OPENAI_API_KEY and AI_GATEWAY_TOKEN" };
    } else {
        await runCheck("openai", async () => {
            const response = await generateText(env, "Reply with: Pong", "You are a ping bot.", { model: "gpt-4o-mini" }, "openai");
            if (!response.toLowerCase().includes("pong")) {
                throw new Error(`Unexpected response: ${response.substring(0, 100)}`);
            }
            return { sample: response.substring(0, 50) };
        });
    }

    // --- 5f. Test OpenAI (Raw Fetch) ---
    if (!hasOpenAIAccess || !env.CLOUDFLARE_ACCOUNT_ID) {
        subChecks.openaiRaw = { status: "SKIPPED", reason: "Missing Env Vars" };
    } else {
        await runCheck("openaiRaw", async () => {
            const model = "gpt-4o-mini";
            const url = await getAIGatewayUrl(env, { provider: "openai", modelName: model });

            const payload = {
                model: model,
                messages: [{ role: "user", content: "Reply with: Pong" }]
            };

            const gatewayToken = typeof env.AI_GATEWAY_TOKEN === 'object' && env.AI_GATEWAY_TOKEN !== null && 'get' in env.AI_GATEWAY_TOKEN ? await env.AI_GATEWAY_TOKEN.get() : env.AI_GATEWAY_TOKEN as string;
            const gatewayName = env.AI_GATEWAY_NAME || "core-github-api";

            if (!gatewayToken) throw new Error(`AI_GATEWAY_TOKEN is empty. Gateway Config: { name: "${gatewayName}" }`);

            // When AI Gateway has provider keys configured, only cf-aig-authorization is needed
            const response = await fetch(url, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "cf-aig-authorization": `Bearer ${gatewayToken}`,
                },
                body: JSON.stringify(payload)
            });

            if (!response.ok) {
                const text = await response.text();
                throw new Error(`HTTP ${response.status}: ${text}. Gateway Config: { name: "${gatewayName}" }`);
            }

            const data = await response.json() as any;
            const text = data?.choices?.[0]?.message?.content || "";
            if (!text.toLowerCase().includes("pong")) {
                throw new Error(`Unexpected Raw response: ${JSON.stringify(data).substring(0, 200)}`);
            }
            return { success: true, model: model };
        });
    }


    // --- 6. Test Diagnostician (Self-Test) ---
    if (!env.AI) {
        subChecks.diagnostician = { status: "SKIPPED", reason: "env.AI binding missing" };
    } else {
        await runCheck("diagnostician", async () => {
            // Call diagnostician with mock failure data
            const mockAnalysis = await analyzeFailure(
                env,
                "Mock Test Step",
                "This is a mock error for testing the diagnostician",
                { testKey: "testValue", status: "FAILURE" },
                { reasoningEffort: "low" }
            );

            if (!mockAnalysis) {
                throw new Error("Diagnostician returned null");
            }
            if (!mockAnalysis.rootCause || !mockAnalysis.suggestedFix) {
                throw new Error(`Incomplete analysis: ${JSON.stringify(mockAnalysis)}`);
            }
            // Verify it echoed back context
            if (mockAnalysis.providedContext?.stepName === "Unknown") {
                throw new Error("Diagnostician failed to capture input context");
            }
            return {
                rootCause: mockAnalysis.rootCause.substring(0, 100),
                confidence: mockAnalysis.confidence
            };
        });
    }

    // --- Determine Overall Status ---
    const allChecks = Object.values(subChecks);
    const hasFailure = allChecks.some((c: any) => c.status === "FAILURE");
    const allSkipped = allChecks.every((c: any) => c.status === "SKIPPED");

    let overallStatus: 'success' | 'failure' = 'success';
    let message = "All AI subsystems operational";

    if (hasFailure) {
        overallStatus = 'failure';
        const failedChecks = Object.entries(subChecks)
            .filter(([_, v]: [string, any]) => v.status === "FAILURE")
            .map(([k, _]) => k);
        message = `Failed: ${failedChecks.join(", ")}`;
    } else if (allSkipped) {
        message = "All checks skipped (bindings missing)";
    }

    return {
        name: "AI Domain",
        status: overallStatus,
        message,
        durationMs: Date.now() - start,
        details: subChecks
    };
}