

/**
 * Clone repository in container and get file contents
 * This replaces GitHub API calls with container-based file access
 */
export class RepoAnalyzerContainer {
  private containerFetcher: Fetcher | null;
  private containerUrl: string;
  private owner: string;
  private repo: string;
  private token?: string;

  constructor(containerUrlOrFetcher: string | Fetcher, owner: string, repo: string, token?: string) {
    // Handle both container binding (Fetcher) and URL string
    if (typeof containerUrlOrFetcher === 'string') {
      this.containerUrl = containerUrlOrFetcher;
      this.containerFetcher = null;
    } else {
      this.containerFetcher = containerUrlOrFetcher;
      this.containerUrl = 'container://repo-analyzer'; // Placeholder for binding
    }
    this.owner = owner;
    this.repo = repo;
    this.token = token;
  }

  /**
   * Make a fetch request to the container
   */
  private async fetch(path: string, options?: RequestInit): Promise<Response> {
    const url = path.startsWith('http') ? path : `${this.containerUrl}${path}`;

    if (this.containerFetcher) {
      // Use container binding directly
      return this.containerFetcher.fetch(url, options);
    } else {
      // Use regular fetch with URL
      return fetch(url, options);
    }
  }

  /**
   * Clone the repository in the container
   */
  async clone(): Promise<void> {
    const repoUrl = `https://github.com/${this.owner}/${this.repo}`;

    const response = await this.fetch('/clone', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        repo_url: repoUrl,
        owner: this.owner,
        repo: this.repo,
        token: this.token,
      }),
    });

    if (!response.ok) {
      const error = await response.json() as any;
      throw new Error(`Failed to clone repository: ${error.error || response.statusText}`);
    }

    const result = await response.json() as any;
    if (result.status !== 'success') {
      throw new Error(`Clone failed: ${result.error || 'Unknown error'}`);
    }
  }

  /**
   * Get list of all files in the repository
   */
  async getFileTree(): Promise<Array<{ path: string; type: string; size?: number }>> {
    const response = await this.fetch(
      `/files?owner=${encodeURIComponent(this.owner)}&repo=${encodeURIComponent(this.repo)}`
    );

    if (!response.ok) {
      const error = await response.json() as any;
      throw new Error(`Failed to list files: ${error.error || response.statusText}`);
    }

    const data = await response.json() as any;
    return data.files || [];
  }

  /**
   * Get content of a single file
   */
  async getFileContent(filePath: string): Promise<string> {
    const encodedPath = encodeURIComponent(filePath);
    const response = await this.fetch(
      `/file/${encodedPath}?owner=${encodeURIComponent(this.owner)}&repo=${encodeURIComponent(this.repo)}`
    );

    if (!response.ok) {
      const error = await response.json() as any;
      throw new Error(`Failed to fetch file ${filePath}: ${error.error || response.statusText}`);
    }

    const data = await response.json() as any;
    return data.content || '';
  }

  /**
   * Get content of multiple files
   */
  async getFilesContent(
    filePaths: string[],
    maxSize: number = 8000
  ): Promise<Array<{ path: string; content: string; error?: string }>> {
    const response = await this.fetch('/analyze', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        owner: this.owner,
        repo: this.repo,
        file_paths: filePaths,
        max_size: maxSize,
      }),
    });

    if (!response.ok) {
      const error = await response.json() as any;
      throw new Error(`Failed to analyze files: ${error.error || response.statusText}`);
    }

    const data = await response.json() as any;
    return data.files || [];
  }

  /**
   * Check if container is healthy
   */
  async healthCheck(): Promise<boolean> {
    try {
      const response = await this.fetch('/health');
      return response.ok;
    } catch {
      return false;
    }
  }
}

/**
 * Get container URL from environment or construct from container binding
 */
export function getContainerUrl(env: Env): string {
  // If container binding exists, use it
  // Container bindings in Cloudflare Workers provide a fetch-like interface
  const containerBinding = (env as any).REPO_ANALYZER_CONTAINER;

  if (containerBinding) {
    // Container binding is a Fetcher-like object with a URL property or we construct it
    // In practice, we'll use the binding directly for fetch calls
    // For now, return a placeholder that will be handled by the RepoAnalyzerContainer class
    return 'container://repo-analyzer';
  }

  // Fallback to environment variable or local development
  return (env as any).REPO_ANALYZER_CONTAINER_URL || 'http://localhost:8080';
}

/**
 * Get container fetcher from environment
 */
export function getContainerFetcher(env: Env): Fetcher | null {
  const containerBinding = (env as any).REPO_ANALYZER_CONTAINER;
  return containerBinding || null;
}

