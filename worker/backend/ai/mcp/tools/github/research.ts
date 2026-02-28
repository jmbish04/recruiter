/**
 * GitHub API Utilities
 */
export function parseGitHubUrl(url: string) {
  const cleanUrl = url.endsWith("/") ? url.slice(0, -1) : url;
  const parts = cleanUrl.replace("https://github.com/", "").split("/");
  return { owner: parts[0], repo: parts[1] };
}

export async function fetchGitHubTree(owner: string, repo: string, token: string) {
  const url = `https://api.github.com/repos/${owner}/${repo}/git/trees/main?recursive=1`;
  const response = await fetch(url, {
    headers: { 
      Authorization: `Bearer ${token}`, 
      "User-Agent": "cloudflare-repo-analyzer" 
    }
  });
  if (!response.ok) return [];
  const data: any = await response.json();
  return data.tree?.map((f: any) => f.path) || [];
}

export async function fetchCriticalFiles(owner: string, repo: string, tree: string[], targets: string[], token: string) {
  const contents: Record<string, string> = {};
  // Limit to top 10 most relevant files to manage token context
  const foundPaths = tree.filter(path => targets.some(t => path.endsWith(t))).slice(0, 10);

  for (const path of foundPaths) {
    const rawUrl = `https://raw.githubusercontent.com/${owner}/${repo}/main/${path}`;
    const resp = await fetch(rawUrl, {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (resp.ok) {
      contents[path] = await resp.text();
    }
  }
  return contents;
}