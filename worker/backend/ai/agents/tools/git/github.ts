

/**
 * Helper to get token from Env
 */
async function getToken(env: Env): Promise<string> {
  const token = await env.GITHUB_TOKEN.get();
  if (!token) {
    throw new Error("Missing GITHUB_TOKEN in environment");
  }
  return token;
}

/**
 * Verify GitHub Token Validity
 */
export async function verifyGitHubToken(env: Env): Promise<{
  valid: boolean;
  user?: string;
  scopes?: string[];
  error?: string;
}> {
  try {
    const token = await getToken(env);
    const response = await fetch("https://api.github.com/user", {
      headers: {
        Authorization: `Bearer ${token}`,
        "User-Agent": "Cloudflare-Worker-MCP",
      },
    });

    if (!response.ok) {
      if (response.status === 401) {
        return { valid: false, error: "Invalid or expired token (401)" };
      }
      return { valid: false, error: `GitHub API error: ${response.status} ${await response.text()}` };
    }

    const data = await response.json() as any;
    const scopesHeader = response.headers.get("x-oauth-scopes");
    const scopes = scopesHeader ? scopesHeader.split(",").map(s => s.trim()) : [];

    return {
      valid: true,
      user: data.login,
      scopes
    };
  } catch (error) {
    return {
      valid: false,
      error: error instanceof Error ? error.message : "Unknown error"
    };
  }
}

/**
 * Get the default branch name for a repository
 */
export async function getDefaultBranch(
  env: Env,
  owner: string,
  repo: string
): Promise<string> {
  const token = await getToken(env);
  const url = `https://api.github.com/repos/${owner}/${repo}`;

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github.v3+json",
      "User-Agent": "Cloudflare-Worker-MCP",
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch repo info: ${response.status}`);
  }

  const data = await response.json() as any;
  return data.default_branch;
}

/**
 * Fetch file content from GitHub
 */
export async function fetchGitHubFile(
  env: Env,
  owner: string,
  repo: string,
  path: string,
  ref?: string
): Promise<string> {
  const token = await getToken(env);
  // Use provided ref or fetch default branch
  const branch = ref || await getDefaultBranch(env, owner, repo);
  const url = `https://api.github.com/repos/${owner}/${repo}/contents/${path}?ref=${branch}`;

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github.v3+json",
      "User-Agent": "Cloudflare-Worker-MCP",
    },
  });

  if (!response.ok) {
    throw new Error(
      `GitHub API error (${response.status}): ${await response.text()}`
    );
  }

  const data = (await response.json()) as { content: string; encoding: string };

  if (data.encoding === "base64") {
    // Decode base64 content
    return atob(data.content.replace(/\n/g, ""));
  }

  return data.content || "";
}

/**
 * Fetch multiple files from GitHub
 */
export async function fetchGitHubFiles(
  env: Env,
  owner: string,
  repo: string,
  files: Array<{ path: string; start_line?: number; end_line?: number }>,
  ref?: string
): Promise<
  Array<{
    path: string;
    content: string;
    snippet?: string;
  }>
> {
  const token = await getToken(env);
  // Resolve branch once for all files if not provided
  const branch = ref || await getDefaultBranch(env, owner, repo);

  const results = await Promise.all(
    files.map(async (file) => {
      try {
        const content = await fetchGitHubFile(env, owner, repo, file.path, branch);

        // Extract snippet if line numbers provided
        let snippet: string | undefined;
        if (file.start_line && file.end_line) {
          const lines = content.split("\n");
          const start = Math.max(0, file.start_line - 1);
          const end = Math.min(lines.length, file.end_line);
          snippet = lines.slice(start, end).join("\n");
        }

        return {
          path: file.path,
          content,
          snippet: snippet || content,
        };
      } catch (error) {
        console.error(`Error fetching ${file.path}:`, error);
        return {
          path: file.path,
          content: "",
          snippet: `Error: ${error instanceof Error ? error.message : "Unknown error"}`,
        };
      }
    })
  );

  return results;
}

/**
 * Get repository structure
 */
export async function getRepoStructure(
  env: Env,
  owner: string,
  repo: string,
  path: string = "",
  ref?: string
): Promise<any> {
  const token = await getToken(env);
  const branch = ref || await getDefaultBranch(env, owner, repo);
  const url = `https://api.github.com/repos/${owner}/${repo}/contents/${path}?ref=${branch}`;

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github.v3+json",
      "User-Agent": "Cloudflare-Worker-MCP",
    },
  });

  if (!response.ok) {
    throw new Error(
      `GitHub API error (${response.status}): ${await response.text()}`
    );
  }

  return await response.json();
}

/**
 * Search code in a repository
 */
export async function searchRepoCode(
  env: Env,
  owner: string,
  repo: string,
  query: string
): Promise<any> {
  const token = await getToken(env);
  const url = `https://api.github.com/search/code?q=${encodeURIComponent(
    query
  )}+repo:${owner}/${repo}`;

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github.v3+json",
      "User-Agent": "Cloudflare-Worker-MCP",
    },
  });

  if (!response.ok) {
    throw new Error(
      `GitHub API error (${response.status}): ${await response.text()}`
    );
  }

  return await response.json();
}

/**
 * Extract code snippets from GitHub files based on line ranges
 */
export async function extractCodeSnippets(
  env: Env,
  owner: string,
  repo: string,
  files: Array<{
    file_path: string;
    start_line: number;
    end_line: number;
    relation_to_question: string;
  }>,
  ref?: string
): Promise<
  Array<{
    file_path: string;
    code: string;
    relation: string;
  }>
> {
  const token = await getToken(env);
  const branch = ref || await getDefaultBranch(env, owner, repo);

  const snippets = await Promise.all(
    files.map(async (file) => {
      try {
        const content = await fetchGitHubFile(
          env,
          owner,
          repo,
          file.file_path,
          branch
        );

        const lines = content.split("\n");
        const start = Math.max(0, file.start_line - 1);
        const end = Math.min(lines.length, file.end_line);
        const code = lines.slice(start, end).join("\n");

        return {
          file_path: file.file_path,
          code,
          relation: file.relation_to_question,
        };
      } catch (error) {
        console.error(`Error extracting snippet from ${file.file_path}:`, error);
        return {
          file_path: file.file_path,
          code: `Error: ${error instanceof Error ? error.message : "Unknown error"}`,
          relation: file.relation_to_question,
        };
      }
    })
  );

  return snippets;
}

/**
 * Parse PR URL to extract owner, repo, and PR number
 */
export function parsePRUrl(prUrl: string): { owner: string; repo: string; prNumber: number } | null {
  const regex = new RegExp("github\\.com/([^/]+)/([^/]+)/pull/(\\d+)");
  const match = prUrl.match(regex);

  if (!match) {
    return null;
  }

  return {
    owner: match[1],
    repo: match[2],
    prNumber: parseInt(match[3], 10),
  };
}

/**
 * Get all comments from a PR (both review comments and issue comments)
 */
export async function getPRComments(
  env: Env,
  owner: string,
  repo: string,
  prNumber: number
): Promise<Array<{
  author: string;
  body: string;
  file_path?: string;
  line?: number;
  comment_type: 'review' | 'issue';
}>> {
  const token = await getToken(env);
  // Get review comments (inline code comments)
  const reviewCommentsUrl = `https://api.github.com/repos/${owner}/${repo}/pulls/${prNumber}/comments`;
  const reviewCommentsResponse = await fetch(reviewCommentsUrl, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github.v3+json",
      "User-Agent": "Cloudflare-Worker-MCP",
    },
  });

  if (!reviewCommentsResponse.ok) {
    throw new Error(
      `GitHub API error (${reviewCommentsResponse.status}): ${await reviewCommentsResponse.text()}`
    );
  }

  const reviewComments = await reviewCommentsResponse.json() as any[];

  // Get issue comments (general PR comments)
  const issueCommentsUrl = `https://api.github.com/repos/${owner}/${repo}/issues/${prNumber}/comments`;
  const issueCommentsResponse = await fetch(issueCommentsUrl, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github.v3+json",
      "User-Agent": "Cloudflare-Worker-MCP",
    },
  });

  if (!issueCommentsResponse.ok) {
    throw new Error(
      `GitHub API error (${issueCommentsResponse.status}): ${await issueCommentsResponse.text()}`
    );
  }

  const issueComments = await issueCommentsResponse.json() as any[];

  // Combine and normalize comments
  const allComments = [
    ...reviewComments.map((comment) => ({
      id: comment.id,
      author: comment.user?.login || "unknown",
      body: comment.body || "",
      file_path: comment.path,
      line: comment.line || comment.original_line,
      comment_type: 'review' as const,
    })),
    ...issueComments.map((comment) => ({
      id: comment.id,
      author: comment.user?.login || "unknown",
      body: comment.body || "",
      comment_type: 'issue' as const,
    })),
  ];

  return allComments;
}

/**
 * Filter comments by author (case-insensitive partial match)
 */
export function filterCommentsByAuthor(
  comments: Array<{ author: string;[key: string]: any }>,
  authorFilter?: string
): Array<{ author: string;[key: string]: any }> {
  if (!authorFilter) {
    return comments;
  }

  const lowerFilter = authorFilter.toLowerCase();
  return comments.filter((comment) =>
    comment.author.toLowerCase().includes(lowerFilter)
  );
}

/**
 * Get the SHA of a reference (e.g., heads/main)
 */
export async function getRef(
  env: Env,
  owner: string,
  repo: string,
  ref: string // e.g. "heads/main" or "heads/feature-branch"
): Promise<string> {
  const token = await getToken(env);
  const url = `https://api.github.com/repos/${owner}/${repo}/git/ref/${ref}`;
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github.v3+json",
      "User-Agent": "Cloudflare-Worker-MCP",
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to get ref ${ref}: ${response.status} ${await response.text()}`);
  }

  const data = await response.json() as any;
  return data.object.sha;
}

/**
 * Create a new branch from a base SHA
 */
export async function createBranch(
  env: Env,
  owner: string,
  repo: string,
  newBranchName: string,
  baseSha: string
): Promise<void> {
  const token = await getToken(env);
  const url = `https://api.github.com/repos/${owner}/${repo}/git/refs`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github.v3+json",
      "User-Agent": "Cloudflare-Worker-MCP",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      ref: `refs/heads/${newBranchName}`,
      sha: baseSha,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to create branch ${newBranchName}: ${response.status} ${errorText}`);
  }
}

/**
 * Create or Update a file (Commit)
 */
export async function createOrUpdateFile(
  env: Env,
  owner: string,
  repo: string,
  path: string,
  content: string,
  message: string,
  branch: string,
  sha?: string
): Promise<void> {
  const token = await getToken(env);
  const url = `https://api.github.com/repos/${owner}/${repo}/contents/${path}`;

  // Base64 encode content
  const encodedContent = btoa(unescape(encodeURIComponent(content))); // Robust utf-8 -> base64

  const body: any = {
    message,
    content: encodedContent,
    branch,
  };

  if (sha) {
    body.sha = sha;
  }

  const response = await fetch(url, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github.v3+json",
      "User-Agent": "Cloudflare-Worker-MCP",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error(`Failed to write file ${path}: ${response.status} ${await response.text()}`);
  }
}

/**
 * Create a Pull Request
 */
export async function createPullRequest(
  env: Env,
  owner: string,
  repo: string,
  title: string,
  body: string,
  head: string, // The feature branch (e.g. "my-feature")
  base: string // The target branch (e.g. "main")
): Promise<{ number: number; html_url: string }> {
  const token = await getToken(env);
  const url = `https://api.github.com/repos/${owner}/${repo}/pulls`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github.v3+json",
      "User-Agent": "Cloudflare-Worker-MCP",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      title,
      body,
      head,
      base,
    }),
  });

  if (!response.ok) {
    throw new Error(`Failed to create PR: ${response.status} ${await response.text()}`);
  }

  const data = await response.json() as any;
  return {
    number: data.number,
    html_url: data.html_url,
  };
}
