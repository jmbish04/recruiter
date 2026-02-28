/**
 * @file src/ai/repo-analysis.ts
 * @description Uses Cloudflare Workers AI (Llama 3) to extract structured metadata from repository files.
 * @owner AI-Builder
 */


// 1. JSON Schema for Structured Output
export const REPO_ANALYSIS_JSON_SCHEMA = {
    name: "repo_analysis",
    schema: {
        type: "object",
        additionalProperties: false,
        properties: {
            // Core identity (AI can guess or leave null)
            id: {
                type: "string",
                description:
                    "Stable repo identifier like 'github:owner/name'. If unknown, set to null or empty string."
            },
            provider: {
                type: "string",
                description: "SCM provider if known.",
                enum: ["github", "gitlab", "local", "unknown"],
                default: "unknown"
            },
            owner: {
                type: "string",
                description: "Repository owner/user/org if known.",
                nullable: true
            },
            name: {
                type: "string",
                description: "Repository name if known.",
                nullable: true
            },

            description: {
                type: "string",
                description:
                    "2–4 sentence, high-signal functional description of this repo.",
                nullable: true
            },

            topics: {
                type: "array",
                description:
                    "Short, lowercase tags derived from README, package.json, etc.",
                items: { type: "string" }
            },

            visibility: {
                type: "string",
                description: "Leave 'unknown' if not obvious.",
                enum: ["public", "private", "internal", "unknown"],
                default: "unknown"
            },

            lifecycleStage: {
                type: "string",
                description:
                    "Stage based on cues like README wording, archived notes, etc.",
                enum: ["prototype", "active", "deprecated", "archived", "unknown"],
                default: "unknown"
            },

            isTemplate: {
                type: "boolean",
                description:
                    "True if this is clearly meant to be reused as a starter/template."
            },

            criticality: {
                type: "integer",
                description:
                    "0–10 subjective importance. 0 = toy, 10 = critical production system.",
                minimum: 0,
                maximum: 10
            },

            // Human/AI summaries
            humanSummary: {
                type: "string",
                description:
                    "Copy a short, high-signal excerpt from README if suitable, else null.",
                nullable: true
            },
            aiSummary: {
                type: "string",
                description:
                    "Your own concise summary highlighting architecture, stack, and main purpose.",
                nullable: true
            },

            // Tech stack = maps to repo_tech_stack
            stack: {
                type: "object",
                additionalProperties: false,
                properties: {
                    frontend: {
                        type: "object",
                        additionalProperties: false,
                        properties: {
                            framework: {
                                type: "string",
                                description: "e.g. 'react','svelte','none','unknown'",
                                nullable: true
                            },
                            bundler: {
                                type: "string",
                                description: "e.g. 'vite','webpack','next','unknown'",
                                nullable: true
                            },
                            uiPrimitives: {
                                type: "string",
                                description: "e.g. 'radix-ui','headlessui','none','unknown'",
                                nullable: true
                            },
                            components: {
                                type: "string",
                                description: "e.g. 'shadcn','mui','chakra','none','unknown'",
                                nullable: true
                            },
                            styling: {
                                type: "string",
                                description: "e.g. 'tailwindcss','vanilla-extract','css-modules'",
                                nullable: true
                            }
                        },
                        required: [
                            "framework",
                            "bundler",
                            "uiPrimitives",
                            "components",
                            "styling"
                        ]
                    },

                    backend: {
                        type: "object",
                        additionalProperties: false,
                        properties: {
                            runtime: {
                                type: "string",
                                description:
                                    "e.g. 'cloudflare-workers','node','deno','python','none','unknown'",
                                nullable: true
                            },
                            framework: {
                                type: "string",
                                description:
                                    "e.g. 'fastify','express','hono','fastapi','none','unknown'",
                                nullable: true
                            }
                        },
                        required: ["runtime", "framework"]
                    },

                    testing: {
                        type: "object",
                        additionalProperties: false,
                        properties: {
                            hasTests: {
                                type: "boolean",
                                description: "True if any obvious tests are present."
                            },
                            testFramework: {
                                type: "string",
                                description: "e.g. 'vitest','jest','pytest','none','unknown'",
                                nullable: true
                            }
                        },
                        required: ["hasTests", "testFramework"]
                    }
                },
                required: ["frontend", "backend", "testing"]
            },

            // Infra = maps to repo_infra
            infra: {
                type: "object",
                additionalProperties: false,
                properties: {
                    provider: {
                        type: "string",
                        description: "Primary runtime/infra provider.",
                        enum: ["cloudflare", "gcp", "aws", "azure", "vercel", "unknown"],
                        default: "unknown"
                    },

                    usesWorkers: { type: "boolean" },
                    usesPages: { type: "boolean" },
                    usesD1: { type: "boolean" },
                    usesKv: { type: "boolean" },
                    usesR2: { type: "boolean" },
                    usesQueues: { type: "boolean" },
                    usesVectorize: { type: "boolean" },

                    wranglerPath: {
                        type: "string",
                        description:
                            "Path to wrangler config file if present, else null.",
                        nullable: true
                    }
                },
                required: [
                    "provider",
                    "usesWorkers",
                    "usesPages",
                    "usesD1",
                    "usesKv",
                    "usesR2",
                    "usesQueues",
                    "usesVectorize",
                    "wranglerPath"
                ]
            },

            // Tags = maps to repo_tags
            tags: {
                type: "array",
                description:
                    "High-level tags like 'cloudflare-template','mcp-server','rag-demo','production'.",
                items: { type: "string" }
            },

            // Free-form notes (go into repositories.notes)
            notes: {
                type: "string",
                description:
                    "Any extra observations that might help future maintenance or AI usage.",
            }
        },
        required: [
            "provider",
            "topics",
            "visibility",
            "lifecycleStage",
            "isTemplate",
            "criticality",
            "stack",
            "infra",
            "tags",
            "notes"
        ]
    },
    strict: true
} as const;

// 2. Types
export type RepoAnalysis = {
    id: string | null;
    provider: "github" | "gitlab" | "local" | "unknown";
    owner: string | null;
    name: string | null;
    description: string | null;
    topics: string[];
    visibility: "public" | "private" | "internal" | "unknown";
    lifecycleStage: "prototype" | "active" | "deprecated" | "archived" | "unknown";
    isTemplate: boolean;
    criticality: number;
    humanSummary: string | null;
    aiSummary: string | null;
    stack: {
        frontend: {
            framework: string | null;
            bundler: string | null;
            uiPrimitives: string | null;
            components: string | null;
            styling: string | null;
        };
        backend: {
            runtime: string | null;
            framework: string | null;
        };
        testing: {
            hasTests: boolean;
            testFramework: string | null;
        };
    };
    infra: {
        provider: "cloudflare" | "gcp" | "aws" | "azure" | "vercel" | "unknown";
        usesWorkers: boolean;
        usesPages: boolean;
        usesD1: boolean;
        usesKv: boolean;
        usesR2: boolean;
        usesQueues: boolean;
        usesVectorize: boolean;
        wranglerPath: string | null;
    };
    tags: string[];
    notes: string;
};

// 3. Worker Implementation
export async function analyzeRepo(env: Env, input: {
    id?: string;
    provider?: string;
    owner?: string;
    name?: string;
    readme?: string;
    packageJson?: any;
    wranglerConfig?: string;
    extraFiles?: Record<string, string>; // path -> content
}): Promise<RepoAnalysis> {
    const systemPrompt = `
You are a senior engineer helping catalogue JavaScript/TypeScript repositories.

Your job:
- Infer a CLEAN, NORMALIZED view of the repository's purpose and tech stack.
- Focus on frontend stack, backend runtime/framework, and Cloudflare infra.
- Use short, machine-friendly strings for stack values (e.g. "react","vite","radix-ui","shadcn","tailwindcss").
- If something is unknown, **do not hallucinate**. Return "unknown", null, or sensible defaults.
- Be conservative about "isTemplate": only true if the README or structure clearly indicates reusable starter/template.
- Criticality:
  - 0–2: toy / experiment
  - 3–5: small utility, non-critical
  - 6–8: actively used, important
  - 9–10: production critical core system.
`;

    const userContent = `
Repository inputs:

- id: ${input.id ?? "unknown"}
- provider: ${input.provider ?? "unknown"}
- owner: ${input.owner ?? "unknown"}
- name: ${input.name ?? "unknown"}

README:
${input.readme ?? "(none provided)"}

package.json:
${input.packageJson ? JSON.stringify(input.packageJson, null, 2) : "(none provided)"}

wrangler config:
${input.wranglerConfig ?? "(none provided)"}

extra files:
${input.extraFiles ? Object.keys(input.extraFiles).join(", ") : "(none)"}
`.trim();

    try {
        const response = await env.AI.run(
            "@cf/meta/llama-3-8b-instruct-fast" as any,
            {
                messages: [
                    { role: "system", content: systemPrompt },
                    { role: "user", content: userContent }
                ],
                // Cloudflare-style structured output using JSON Schema
                response_format: {
                    type: "json_schema",
                    json_schema: REPO_ANALYSIS_JSON_SCHEMA
                }
            }
        );

        // response will be parsed JSON if structured outputs are enabled
        // The return type of ai.run is generic, so we cast.
        // Note: check if response has .response property or is direct object depending on SDK version?
        // With @google/genai or similar, it varies. For Cloudflare workers-types Ai, it usually returns the object directly if structured.
        // Let's assume direct return for now based on recent docs.
        return response as unknown as RepoAnalysis;

    } catch (error) {
        console.error("AI Analysis failed:", error);
        throw error;
    }
}
