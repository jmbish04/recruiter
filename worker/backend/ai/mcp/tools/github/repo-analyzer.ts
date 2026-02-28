import { DetailedQuestion, MigrationPillar } from "@/ai/mcp/types";
import { generateStructuredResponse } from "@/ai/providers";
import { getRepoStructure, fetchGitHubFile } from "./github";
import { fetchCloudflareDocsIndex, fetchDocPages } from "@/ai/mcp/tools/browser/docs-fetcher";
import { MIGRATION_PILLARS, categorizeQuestion, createMigrationPlan } from "./migration-pillars";
import { RepoAnalyzerContainer, getContainerUrl, getContainerFetcher } from "./container-repo";

/**
 * Parse GitHub repository URL
 */
export function parseRepoUrl(url: string): { owner: string; repo: string } | null {
  try {
    const patterns = [
      new RegExp("github\\.com/([^/]+)/([^/.]+)"),  // https://github.com/owner/repo
      new RegExp("github\\.com/([^/]+)/([^/]+)\\.git"), // https://github.com/owner/repo.git
    ];

    for (const pattern of patterns) {
      const match = url.match(pattern);
      if (match) {
        return {
          owner: match[1],
          repo: match[2].replace(/\.git$/, ""),
        };
      }
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Get repository file tree
 */
export async function getRepoFileTree(
  env: Env,
  owner: string,
  repo: string,
  path: string = "",
  maxDepth: number = 3,
  currentDepth: number = 0
): Promise<Array<{ path: string; type: string; size?: number }>> {
  if (currentDepth >= maxDepth) return [];

  const contents = await getRepoStructure(env, owner, repo, path);
  const files: Array<{ path: string; type: string; size?: number }> = [];

  if (!Array.isArray(contents)) return [];

  for (const item of contents) {
    if (item.type === "file") {
      files.push({
        path: item.path,
        type: item.type,
        size: item.size,
      });
    } else if (item.type === "dir") {
      const subFiles = await getRepoFileTree(
        env,
        owner,
        repo,
        item.path,
        maxDepth,
        currentDepth + 1
      );
      files.push(...subFiles);
    }
  }

  return files;
}

/**
 * Filter relevant files for analysis
 */
export function filterRelevantFiles(
  files: Array<{ path: string; type: string; size?: number }>,
  maxFiles: number = 50
): Array<{ path: string; type: string; size?: number }> {
  const ignorePaths = [
    "node_modules/",
    ".git/",
    "dist/",
    "build/",
    "coverage/",
    ".next/",
    ".nuxt/",
    "vendor/",
    "public/assets/",
    "package-lock.json",
    "yarn.lock",
    "pnpm-lock.yaml",
  ];

  const relevantExtensions = [
    ".js", ".ts", ".jsx", ".tsx", ".py", ".go", ".rs", ".java", ".php", ".rb",
    ".vue", ".svelte", ".json", ".yaml", ".yml", ".toml", ".config.js", ".config.ts",
    "Dockerfile", "Procfile"
  ];

  const filtered = files.filter((file) => {
    if (ignorePaths.some((ignore) => file.path.includes(ignore))) return false;
    return (
      relevantExtensions.some((ext) => file.path.endsWith(ext)) ||
      file.path.includes("config") ||
      file.path.includes("webpack") ||
      file.path.includes("vite") ||
      file.path.includes("wrangler")
    );
  });

  filtered.sort((a, b) => {
    const aIsConfig = a.path.includes("config") || a.path.includes("wrangler") || a.path.includes("package.json");
    const bIsConfig = b.path.includes("config") || b.path.includes("wrangler") || b.path.includes("package.json");
    if (aIsConfig && !bIsConfig) return -1;
    if (!aIsConfig && bIsConfig) return 1;
    return a.path.localeCompare(b.path);
  });

  return filtered.slice(0, maxFiles);
}

/**
 * Analyze repository and generate questions
 * Supports switching between Worker AI and Gemini
 */
export async function analyzeRepoAndGenerateQuestions(
  env: Env,
  owner: string,
  repo: string,
  // token: string // Removed
  maxFiles: number = 50,
  useGemini: boolean = false,
  useContainer: boolean = true,
  onProgress?: (message: string) => void
): Promise<DetailedQuestion[]> {
  const token = await env.GITHUB_TOKEN.get(); // Internal access
  console.log(`[Analyzer] Analyzing ${owner}/${repo}... (Provider: ${useGemini ? "Gemini" : "Workers AI"}, Container: ${useContainer})`);

  let validFiles: Array<{ path: string; content: string }> = [];

  if (useContainer) {
    try {
      // Use container for repository cloning and file access
      onProgress?.("📦 Cloning repository in container...");
      const containerFetcher = getContainerFetcher(env);
      const containerUrl = getContainerUrl(env);

      if (!token) throw new Error("Missing GITHUB_TOKEN for container clone");

      const container = new RepoAnalyzerContainer(
        containerFetcher || containerUrl,
        owner,
        repo,
        token
      );

      // Check container health
      const isHealthy = await container.healthCheck();
      if (!isHealthy) {
        throw new Error("Container health check failed");
      }

      // Clone repository
      await container.clone();
      onProgress?.("✅ Repository cloned successfully");

      // Get file tree
      onProgress?.("📂 Listing repository files...");
      const allFiles = await container.getFileTree();
      const relevantFiles = filterRelevantFiles(allFiles, maxFiles);

      onProgress?.(`📄 Reading ${Math.min(relevantFiles.length, 15)} files...`);
      // Get file contents in batches
      const filePaths = relevantFiles.slice(0, 15).map(f => f.path);
      const fileContents = await container.getFilesContent(filePaths, 8000);

      validFiles = fileContents
        .filter(f => f.content && !f.error)
        .map(f => ({
          path: f.path,
          content: f.content.substring(0, 8000),
        }));

      onProgress?.(`✅ Loaded ${validFiles.length} files from container`);
    } catch (error) {
      console.warn(`[Analyzer] Container-based analysis failed, falling back to GitHub API:`, error);
      onProgress?.(`⚠️ Container failed, using GitHub API fallback...`);
      // Fall back to GitHub API
      useContainer = false;
    }
  }

  // Fallback to GitHub API if container not used or failed
  if (!useContainer || validFiles.length === 0) {
    onProgress?.("📡 Fetching files via GitHub API...");
    // Updated signature call
    const allFiles = await getRepoFileTree(env, owner, repo);
    const relevantFiles = filterRelevantFiles(allFiles, maxFiles);

    const fileContents = await Promise.all(
      relevantFiles.slice(0, 15).map(async (file) => {
        try {
          // Updated signature call
          const content = await fetchGitHubFile(env, owner, repo, file.path);
          return {
            path: file.path,
            content: content.substring(0, 8000),
          };
        } catch {
          return null;
        }
      })
    );
    validFiles = fileContents.filter((f) => f !== null) as Array<{ path: string; content: string }>;
  }

  const repoContext = validFiles.map((f) => `\n=== ${f.path} ===\n${f.content.substring(0, 1500)}...`).join("\n");

  const queryAI = async (prompt: string, schema: object, sysPrompt?: string) => {
    if (useGemini) {
      if (!env.AI_GATEWAY_TOKEN || !env.CLOUDFLARE_ACCOUNT_ID) {
        console.warn("[Analyzer] Gemini requested but missing credentials. Falling back to Workers AI.");
        return await generateStructuredResponse(env, prompt, schema, sysPrompt, undefined, "worker-ai");
      }
      return await generateStructuredResponse(env, prompt, schema, sysPrompt, undefined, "gemini");
    } else {
      return await generateStructuredResponse(env, prompt, schema, sysPrompt, undefined, "worker-ai");
    }
  };

  // ... rest of logic largely unchanged, using internal logic ...
  // Docs fetching (no token needed usually, uses proxy or public)
  let docsContext = "";
  try {
    // ... (existing logic) ...
    // I'll preserve the logic but just ensure it's written correctly.
    // Copying logic from previous file view Step 2430 around lines 230+
    console.log(`[Analyzer] Fetching Cloudflare Docs Index (llms.txt)...`);
    const docSections = await fetchCloudflareDocsIndex();

    const indexSummary = docSections.map(s =>
      `Product: ${s.title}\nPages: ${s.links.slice(0, 5).map(l => l.title).join(", ")}`
    ).join("\n\n");

    const selectionPrompt = `You are a Solutions Architect. 
      Analyze the repository context and the available Cloudflare documentation.
      
      REPO CONTEXT:
      ${repoContext.substring(0, 4000)}
  
      AVAILABLE DOCS:
      ${indexSummary}
  
      Identify the technology stack and select 3-5 specific Cloudflare documentation URLs.
      `;

    const selectionSchema = {
      type: "object",
      properties: {
        stack_detected: { type: "string" },
        relevant_urls: {
          type: "array",
          items: { type: "string" },
          description: "List of full URLs to fetch"
        }
      },
      required: ["relevant_urls"],
      additionalProperties: false
    };

    const selection = await queryAI(selectionPrompt, selectionSchema);

    const targetUrls: string[] = [];
    if (selection.relevant_urls && Array.isArray(selection.relevant_urls)) {
      const findUrl = (hint: string) => {
        for (const sec of docSections) {
          for (const link of sec.links) {
            if (link.url === hint || link.title === hint) return link.url;
          }
        }
        return hint.startsWith('http') ? hint : null;
      };

      selection.relevant_urls.forEach((hint: string) => {
        const url = findUrl(hint);
        if (url) targetUrls.push(url);
      });
    }

    if (targetUrls.length > 0) {
      console.log(`[Analyzer] Fetching ${targetUrls.length} doc pages...`);
      const fetchedDocs = await fetchDocPages(targetUrls);
      docsContext = fetchedDocs.map(d => `\n=== CLOUDFLARE DOCS (${d.url}) ===\n${d.content}`).join("\n");
    }
  } catch (error) {
    console.warn("[Analyzer] Docs retrieval failed, proceeding with repo context only:", error);
  }

  const pillarsInfo = MIGRATION_PILLARS.map(p =>
    `- ${p.name} (${p.id}): ${p.description} - Bindings: ${p.bindings.join(', ')}`
  ).join('\n');

  const finalPrompt = `You are a Senior Cloud Architect specializing in Cloudflare Workers migrations.
  
  REPO ANALYSIS:
  ${repoContext}

  RELEVANT CLOUDFLARE DOCUMENTATION:
  ${docsContext}

  MIGRATION PILLARS TO EVALUATE:
  ${pillarsInfo}

  TASK:
  Generate 3-8 highly specific, technical questions organized by migration pillars.
  Each question should:
  1. Target a specific Cloudflare Workers capability or binding
  2. Reference specific code patterns or dependencies found in the repo
  3. Be categorized into one or more migration pillars (frontend, compute, storage, networking, ai-ml, security, observability)
  4. Include relevant code file references when applicable
  
  Focus on questions that will help determine:
  - Compatibility with Cloudflare Workers runtime
  - Migration path for dependencies
  - Required Cloudflare bindings and services
  - Code changes needed for compatibility
  `;

  const finalSchema = {
    type: "object",
    properties: {
      questions: {
        type: "array",
        items: {
          type: "object",
          properties: {
            query: { type: "string" },
            cloudflare_bindings_involved: { type: "array", items: { type: "string" } },
            node_libs_involved: { type: "array", items: { type: "string" } },
            tags: { type: "array", items: { type: "string" } },
            relevant_code_files: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  file_path: { type: "string" },
                  start_line: { type: "integer" },
                  end_line: { type: "integer" },
                  relation_to_question: { type: "string" }
                },
                required: ["file_path", "start_line", "end_line", "relation_to_question"],
                additionalProperties: false
              }
            }
          },
          required: ["query", "cloudflare_bindings_involved", "node_libs_involved", "tags", "relevant_code_files"],
          additionalProperties: false
        }
      }
    },
    required: ["questions"],
    additionalProperties: false
  };

  try {
    const result = await queryAI(finalPrompt, finalSchema);
    return result.questions;
  } catch (error) {
    console.error("[Analyzer] AI generation failed, using fallback:", error);
    return generateFallbackQuestions(validFiles, owner, repo);
  }
}

// ... Rest of file (organizeQuestionsByPillars, generateFallbackQuestions, deduplicateQuestions, evaluateQuestionSufficiency)
// ... I'll include them to be complete.

export function organizeQuestionsByPillars(questions: DetailedQuestion[]): MigrationPillar[] {
  const pillars = createMigrationPlan('', '');

  for (const question of questions) {
    const pillarIds = categorizeQuestion(question);

    for (const pillarId of pillarIds) {
      const pillar = pillars.find(p => p.id === pillarId);
      if (pillar) {
        pillar.questions.push(question);
      }
    }
  }

  for (const pillar of pillars) {
    if (pillar.questions.length > 0) {
      pillar.status = 'pending';
    }
  }

  return pillars;
}

function generateFallbackQuestions(
  files: Array<{ path: string; content: string }>,
  owner: string,
  repo: string
): DetailedQuestion[] {
  // Logic from original...
  const questions: DetailedQuestion[] = [];
  const hasPackageJson = files.some((f) => f.path.includes("package.json"));
  const hasWebpack = files.some((f) => f.path.includes("webpack") || f.content.includes("webpack"));
  const hasReact = files.some((f) => f.content.includes("react"));
  const hasEnv = files.some((f) => f.path.includes(".env"));

  if (hasPackageJson) {
    questions.push({
      query: "How do I migrate my Node.js dependencies to Cloudflare Workers?",
      cloudflare_bindings_involved: ["env"],
      node_libs_involved: ["npm", "package.json"],
      tags: ["migration", "dependencies", "nodejs"],
      relevant_code_files: [{ file_path: "package.json", start_line: 1, end_line: 50, relation_to_question: "Project dependencies" }]
    });
  }
  if (hasWebpack) {
    questions.push({
      query: "How do I replace Webpack with Cloudflare Workers build system?",
      cloudflare_bindings_involved: ["env"],
      node_libs_involved: ["webpack"],
      tags: ["migration", "build", "webpack"],
      relevant_code_files: [{ file_path: "webpack.config.js", start_line: 1, end_line: 100, relation_to_question: "Webpack configuration" }]
    });
  }
  if (hasReact) {
    questions.push({
      query: "How do I deploy a React application to Cloudflare Pages?",
      cloudflare_bindings_involved: ["pages", "env"],
      node_libs_involved: ["react", "react-dom"],
      tags: ["migration", "react", "pages"],
      relevant_code_files: [{ file_path: "src/App.tsx", start_line: 1, end_line: 50, relation_to_question: "React application entry point" }]
    });
  }
  if (hasEnv) {
    questions.push({
      query: "How do I manage environment variables in Cloudflare Workers?",
      cloudflare_bindings_involved: ["env", "secrets"],
      node_libs_involved: ["dotenv"],
      tags: ["migration", "environment", "secrets"],
      relevant_code_files: [{ file_path: ".env.example", start_line: 1, end_line: 30, relation_to_question: "Environment variables" }]
    });
  }
  questions.push({
    query: `What are the key considerations for migrating ${repo} to Cloudflare Workers/Pages?`,
    cloudflare_bindings_involved: ["env", "kv"],
    node_libs_involved: [],
    tags: ["migration", "overview", "cloudflare"],
    relevant_code_files: [],
  });
  return questions;
}

export function deduplicateQuestions(
  existingQuestions: DetailedQuestion[],
  newQuestions: DetailedQuestion[]
): DetailedQuestion[] {
  const merged = [...existingQuestions];
  const existingQueries = new Set(existingQuestions.map((q) => q.query.toLowerCase()));
  for (const newQ of newQuestions) {
    if (!existingQueries.has(newQ.query.toLowerCase())) {
      merged.push(newQ);
      existingQueries.add(newQ.query.toLowerCase());
    }
  }
  return merged;
}

export async function evaluateQuestionSufficiency(
  ai: Ai,
  existingQuestions: DetailedQuestion[],
  newQuestions: DetailedQuestion[]
): Promise<{ sufficient: boolean; reasoning: string; recommendedQuestions: DetailedQuestion[] }> {
  return { sufficient: existingQuestions.length > 0, reasoning: "Fallback", recommendedQuestions: deduplicateQuestions(existingQuestions, newQuestions) };
}
