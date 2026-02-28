// backend/src/ai/agents/HealthDiagnostician.ts
import { Buffer } from "node:buffer";
import { z } from "zod";
import { Octokit } from "@octokit/rest";
import { desc, eq } from "drizzle-orm";

import { BaseAgent } from "./BaseAgent";
import { getDb } from "@db";
import { healthResults } from "@db/schemas/logs/health";
import { julesJobs } from "@/db/schemas/agents/jules";
import { JulesService } from "@/services/jules";
import type { Agent as OpenAIAgentType } from "@openai/agents";

// Define the exact schema we expect the Agent to return
const HealthDiagnosticianOutputSchema = z.object({
    severity: z.enum(["low", "medium", "high", "critical"]),
    rootCause: z.string().describe("Explanation of the root cause"),
    suggestedFix: z.string().describe("Fix details or reasoning for not fixing"),
    prUrl: z.string().nullable().describe("URL to the PR created, or Jules Session ID, or null if transient")
});

const finalAnalysisSchema = z.object({
    severity: z.enum(["low", "medium", "high", "critical"]).describe("The severity level of the issue"),
    rootCause: z.string().describe("Explanation of the root cause"),
    suggestedFix: z.string().describe("Fix details or reasoning for not fixing"),
    prUrl: z.string().nullable().describe("URL to the PR created, or Jules Session ID, or null if transient")
});

type HealthDiagnosticianOutput = z.infer<typeof HealthDiagnosticianOutputSchema>;

export class HealthDiagnostician extends BaseAgent {
    
    // Override the core DO fetch to bypass PartyServer room enforcement for direct DO invocations
    async fetch(request: Request) {
        const url = new URL(request.url);

        // Intercept direct HTTP calls to the DO bypassing standard agent routing
        if (url.pathname === "/diagnose") {
            if (request.method !== "POST") {
                return new Response("Method not allowed", { status: 405 });
            }
            return this.handleDiagnose(request);
        }

        // Fallback to BaseAgent/PartyServer's native fetch for websockets or standard room requests
        return super.fetch(request);
    }

    private async handleDiagnose(request: Request) {
        const payload = await request.json<{
            errorName: string;
            errorMessage: string;
            errorDetails: any;
            category: string;
            target: string;
        }>();

        // 1. Initialize GitHub Client
        // @ts-ignore - Support both standard string and secret binding
        const ghToken = typeof this.env.GITHUB_TOKEN === 'object' && this.env.GITHUB_TOKEN?.get 
            ? await (this.env as any).GITHUB_TOKEN.get() 
            : this.env.GITHUB_TOKEN;
            
        const octokit = new Octokit({ auth: ghToken });
        const repoOwner = this.env.GITHUB_OWNER || "jmbish04";
        const repoName = this.env.CLOUDFLARE_WORKER_NAME || "core-github-api";

        // Determine the default branch dynamically
        const { data: repoData } = await octokit.repos.get({ owner: repoOwner, repo: repoName });
        const defaultBranch = repoData.default_branch;

        // 2. Query Cloudflare documentation via MCP
        const { rewriteQuestionForMCP } = await import("@/ai/providers/index");
        const { queryMCP } = await import("@/ai/mcp/mcp-client");
        
        const mcpQueryStr = `How to fix Cloudflare worker error: ${payload.errorName} - ${payload.errorMessage}`;
        let rewritten = mcpQueryStr;
        try {
            const rewrittenResult = await rewriteQuestionForMCP(this.env, mcpQueryStr);
            if (rewrittenResult) rewritten = rewrittenResult;
        } catch (e) {
            this.logger.warn("rewriteQuestionForMCP fallback", e);
        }
        
        let mcpContext = "No Cloudflare Docs context available.";
        try {
            const mcpResult = await queryMCP(rewritten, "HealthDiagnostician");
            mcpContext = typeof mcpResult === 'string' ? mcpResult : JSON.stringify(mcpResult);
        } catch (e) {
            this.logger.warn("queryMCP failed", e);
        }

        // 3. Define the Agent's Instructions
        const instructions = `You are a Senior Engineer and an autonomous Site Reliability Agent operating on the Cloudflare ecosystem.
Your primary directive is to investigate, diagnose, and remediate system health failures within the repository \`${repoOwner}/${repoName}\`.

CRITICAL PRE-FLIGHT CHECK:
1. Deduplication: You MUST use \`check_duplicate_pr\` to ensure no PRs or Jules tasks already exist for this issue. If one exists, halt immediately and return the URL in your final output.

TRIAGE AND REMEDIATION:
2. Analyze & Investigate: Read the error details, pull the failing code using \`get_github_file\`, and consult Cloudflare MCP documentation if needed.
3. Reason about Complexity: Determine the scope of the fix.
   - IF the fix is SMALL (e.g., typos, simple config adjustments, single-file logic errors under 20 lines): Formulate the fix and use \`create_pull_request\` to submit it immediately.
   - IF the fix is COMPLEX (e.g., multi-file refactoring, architectural changes, deep logic bugs, package upgrades): Do NOT try to fix it yourself. Instead, use the \`delegate_to_jules\` tool to dispatch a deep-reasoning session to Google Jules. Provide Jules with a highly detailed prompt of what needs to be refactored.

Conclude your investigation with a detailed summary containing the severity, rootCause, suggestedFix (or delegation note), and prUrl (or Jules Session ID).`;

        const MAX_LOG_LENGTH = 15000;
        let stringifiedDetails = JSON.stringify(payload.errorDetails, null, 2) || "{}";
        
        // Use RAG to fetch relevant chunks if the error details are a large array
        if (Array.isArray(payload.errorDetails) && stringifiedDetails.length > MAX_LOG_LENGTH) {
            try {
                this.logger.info(`Extracting relevant logs via Vectorize RAG...`);
                const { vectorizeAndStoreLogs } = await import("@/ai/utils/log-vectorizer");
                const { generateEmbeddings } = await import("@/ai/providers/index");
                
                const runId = `diag-${Date.now()}`;
                await vectorizeAndStoreLogs(this.env, runId, payload.errorDetails);
                
                const diagnosticQuery = "Find fatal errors, agent execution failures, timeouts, 400 status codes, crash stack traces, and high severity warnings.";
                const queryEmbeddings = await generateEmbeddings(this.env, [diagnosticQuery]);
                const searchVector = queryEmbeddings[0];
                
                const vectorMatches = await this.env.VECTORIZE_LOGS.query(searchVector, {
                    topK: 10,
                    filter: { runId: runId },
                    returnValues: false,
                    returnMetadata: true
                });
                
                const relevantLogs = vectorMatches.matches
                    .map(match => match.metadata?.content)
                    .filter(Boolean)
                    .join("\n\n---\n\n");
                    
                stringifiedDetails = `[RAG FETCHED RELEVANT LOG CHUNKS]\n${relevantLogs}`;
                this.logger.info(`Successfully retrieved ${vectorMatches.matches.length} relevant chunks`);
            } catch (e: any) {
                this.logger.error("RAG Log Vectorization failed, falling back to truncation", e);
                stringifiedDetails = stringifiedDetails.substring(0, MAX_LOG_LENGTH) + "\n...[RAG ERROR, TRUNCATED FOR LENGTH]";
            }
        } else if (stringifiedDetails.length > MAX_LOG_LENGTH) {
            stringifiedDetails = stringifiedDetails.substring(0, MAX_LOG_LENGTH) + "\n...[TRUNCATED FOR LENGTH to prevent 400 payload rejection]";
        }

        const prompt = `Health Check Failed in category: ${payload.category}\nTarget: ${payload.target}\nError: ${payload.errorName} - ${payload.errorMessage}\nDetails: ${stringifiedDetails}\n\nRelevant Cloudflare Docs Context:\nQuery: ${rewritten}\nDocs Result: ${mcpContext}`;

        // 4. Define Tools inline for the BaseAgent to register
        const agentConfig = {
            name: "HealthDiagnostician",
            instructions,
            // Utilize the default provider and model logic from BaseAgent
            provider: this.resolveProvider(), 
            model: this.resolveModel(this.resolveProvider()),
            tools: [
                {
                    type: 'function' as const,
                    name: 'check_duplicate_pr',
                    description: 'Check for identical active pull requests or database suggestion records.',
                    parameters: { type: 'object' as const, properties: {}, required: [], additionalProperties: false },
                    strict: true,
                    isEnabled: async () => true,
                    needsApproval: async () => false,
                    invoke: async (context: any, input: string) => {
                        try {
                            const { data: prs } = await octokit.pulls.list({ owner: repoOwner, repo: repoName, state: "open" });
                            const openPrs = prs.map(pr => ({ title: pr.title, url: pr.html_url }));
    
                            const db = getDb(this.env.DB);
                            const recentFailures = await db.select()
                                .from(healthResults)
                                .where(eq(healthResults.status, 'failure'))
                                .orderBy(desc(healthResults.timestamp))
                                .limit(10);
                            
                            const recentAiSuggestions = recentFailures
                                .filter(f => f.ai_suggestion && f.ai_suggestion.includes('github.com'))
                                .map(f => ({ target: f.name, suggestion: f.ai_suggestion }));
    
                            return JSON.stringify({ activePullRequests: openPrs, recentDatabaseActions: recentAiSuggestions });
                        } catch (e: any) {
                            this.logger.error("check_duplicate_pr failed", e);
                            return JSON.stringify({ error: e.message });
                        }
                    }
                },
                {
                    type: 'function' as const,
                    name: 'get_github_file',
                    description: 'Fetch file content from GitHub.',
                    parameters: { 
                        type: 'object' as const, 
                        properties: { path: { type: 'string' as const } },
                        required: ['path'],
                        additionalProperties: false
                    },
                    strict: true,
                    isEnabled: async () => true,
                    needsApproval: async () => false,
                    invoke: async (context: any, input: string) => {
                        try {
                            const args = JSON.parse(input);
                            const { data } = await octokit.repos.getContent({ owner: repoOwner, repo: repoName, path: args.path });
                            if ('content' in data && typeof data.content === 'string') {
                                return Buffer.from(data.content, 'base64').toString('utf-8');
                            }
                            return "File is not a standard text file or is a directory.";
                        } catch (e: any) {
                            this.logger.error("get_github_file failed", e);
                            return `Failed to fetch file: ${e.message}`;
                        }
                    }
                },
                {
                    type: 'function' as const,
                    name: 'create_pull_request',
                    description: 'Create a new pull request on GitHub.',
                    parameters: {
                        type: 'object' as const,
                        properties: {
                            branchName: { type: 'string' as const },
                            filePath: { type: 'string' as const },
                            newContent: { type: 'string' as const },
                            commitMessage: { type: 'string' as const },
                            prTitle: { type: 'string' as const },
                            prBody: { type: 'string' as const }
                        },
                        required: ['branchName', 'filePath', 'newContent', 'commitMessage', 'prTitle', 'prBody'],
                        additionalProperties: false
                    },
                    strict: true,
                    isEnabled: async () => true,
                    needsApproval: async () => false,
                    invoke: async (context: any, input: string) => {
                        try {
                            const args = JSON.parse(input);
                            const { branchName, filePath, newContent, commitMessage, prTitle, prBody } = args;
                            
                            const { data: refData } = await octokit.git.getRef({ owner: repoOwner, repo: repoName, ref: `heads/${defaultBranch}` });
                            await octokit.git.createRef({ owner: repoOwner, repo: repoName, ref: `refs/heads/${branchName}`, sha: refData.object.sha });
    
                            let fileSha;
                            try {
                                const { data: fileData } = await octokit.repos.getContent({ owner: repoOwner, repo: repoName, path: filePath, ref: branchName });
                                if (!Array.isArray(fileData) && fileData.type === "file") fileSha = fileData.sha;
                            } catch (e) { /* Ignore */ }
    
                            await octokit.repos.createOrUpdateFileContents({
                                owner: repoOwner, repo: repoName, path: filePath,
                                message: commitMessage, content: Buffer.from(newContent).toString("base64"),
                                branch: branchName, sha: fileSha
                            });
    
                            const { data: prData } = await octokit.pulls.create({
                                owner: repoOwner, repo: repoName, title: prTitle, body: prBody,
                                head: branchName, base: defaultBranch
                            });
    
                            return `Successfully created PR: ${prData.html_url}`;
                        } catch (e: any) {
                            this.logger.error("create_pull_request failed", e);
                            return `PR Creation failed: ${e.message}`;
                        }
                    }
                },
                {
                    type: 'function' as const,
                    name: 'delegate_to_jules',
                    description: 'Delegate fixing the issues to a Jules deeper reasoning AI.',
                    parameters: {
                        type: 'object' as const,
                        properties: {
                            prompt: { type: 'string' as const },
                            autoPr: { type: 'boolean' as const }
                        },
                        required: ['prompt'],
                        additionalProperties: false
                    },
                    strict: true,
                    isEnabled: async () => true,
                    needsApproval: async () => false,
                    invoke: async (context: any, input: string) => {
                        try {
                            const args = JSON.parse(input);
                            const julesService = JulesService.getInstance(this.env);
                            const session = await julesService.startSession({
                                prompt: args.prompt,
                                autoPr: args.autoPr || false,
                                repo: { owner: repoOwner, repo: repoName, branch: defaultBranch }
                            });
                            
                            const db = getDb(this.env.DB);
                            await db.insert(julesJobs).values({
                                sessionId: session.id, repoFullName: `${repoOwner}/${repoName}`,
                                prompt: args.prompt, status: "pending"
                            });
    
                            return `Successfully delegated to Jules. Session ID: ${session.id}`;
                        } catch (e: any) {
                            this.logger.error("delegate_to_jules failed", e);
                            return `Delegation failed: ${e.message}`;
                        }
                    }
                },
                {
                    type: 'function' as const,
                    name: "search_cloudflare_documentation",
                    description: "Search the Cloudflare documentation for specific products, features, or error codes. Returns semantic chunks.",
                    parameters: {
                        type: "object" as const,
                        properties: {
                            query: {
                                type: "string" as const,
                                description: "The search query (e.g., 'how to configure D1 bindings', 'workers size limit', 'error 1001')."
                            }
                        },
                        required: ["query"],
                        additionalProperties: false
                    },
                    strict: true,
                    isEnabled: async () => true,
                    needsApproval: async () => false,
                    invoke: async (_context: any, input: string) => {
                        try {
                            const { queryMCP } = await import("@/ai/mcp/mcp-client");
                            const args = JSON.parse(input);
                            const result = await queryMCP(args.query, "HealthDiagnostician");
                            return typeof result === 'string' ? result : JSON.stringify(result);
                        } catch (error: any) {
                            return JSON.stringify({ error: `MCP Query failed: ${error.message}` });
                        }
                    }
                }
            ]
        };

        // 4. Execute the Agent using the BaseAgent's structured response method
        try {
             // We need to bypass BaseAgent's protective wrapper to inject custom tools while still getting structured output.
             // BaseAgent currently doesn't accept a `tools` parameter in `runStructuredResponseWithModel`. 
             // We'll instantiate the OpenAIAgent directly here to achieve both tools AND schema.
             
             const runner = await import("@/ai/agent-sdk").then(m => m.createRunner(this.env, agentConfig.provider, agentConfig.model));
             
             const { Agent } = await import("@openai/agents");
             const agent = new Agent({
                 name: agentConfig.name,
                 instructions: agentConfig.instructions,
                 model: agentConfig.model,
                 tools: agentConfig.tools,
                 // Removed outputType here to comply with AI standard mandate: let agent run freely, extract structure internally below
             });

             // Diagnostic tracking: monitor actual byte size of the outbound LLM payload
             const payloadBytes = new TextEncoder().encode(prompt).length;
             this.logger.info(`[HealthDiagnostician] Outbound Prompt Payload Size: ${payloadBytes} bytes`);

             const result = await runner.run(agent, prompt);
             
             // Enforce strict JSON output using the globally mandated AiProvider.generateStructuredResponse
             const { generateStructuredResponse } = await import("@/ai/providers/index");
             const { zodToJsonSchema } = await import("zod-to-json-schema");
             
             const extractPrompt = `Extract the exact diagnosis details from the Agent's final response below. Respond ONLY with valid JSON.\n\nAgent Response:\n${result.finalOutput}`;
             const finalData = await generateStructuredResponse<HealthDiagnosticianOutput>(
                this.env, 
                extractPrompt, 
                zodToJsonSchema(HealthDiagnosticianOutputSchema as any, "structured_output")
             );

             return new Response(JSON.stringify(finalData), {
                headers: { "Content-Type": "application/json" }
             });

        } catch (error: any) {
            this.logger.error("HealthDiagnostician Execution Failed", { error });
            
            // Fallback response matching the schema
            const fallback: HealthDiagnosticianOutput = {
                severity: "high",
                rootCause: `Agent execution failed: ${error.message}`,
                suggestedFix: "Review raw logs. The agent encountered a fatal error during the diagnostic loop.",
                prUrl: null
            };

            return new Response(JSON.stringify(fallback), { 
                status: 500,
                headers: { "Content-Type": "application/json" } 
            });
        }
    }
}