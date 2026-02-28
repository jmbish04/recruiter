/**
 * @file sandbox-sdk-tools/session-manager.ts
 * @description Manages sandbox sessions keyed by GitHub repository.
 *
 * Each repository gets its own sandbox instance (identified by its sanitized
 * full_name) and can optionally create isolated sessions within that sandbox.
 *
 * Usage:
 * ```ts
 * import { SandboxSessionManager } from "@sandbox-sdk-tools";
 *
 * const mgr = new SandboxSessionManager(env.SANDBOX);
 * const session = await mgr.ensureRepoSession("my-org/my-repo", {
 *   env: { GITHUB_TOKEN: token },
 * });
 * const result = await session.exec("ls -la");
 * ```
 */

import { getSandbox, type Sandbox } from "@cloudflare/sandbox";
import { sanitizeRepoName } from "./utils";
import type { SandboxExecResult } from "./types";
import { SandboxClient } from "./client";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type RepoSessionOptions = {
  /** Extra environment variables injected into the session */
  env?: Record<string, string>;
  /** Override the session working directory (default: `/workspace`) */
  cwd?: string;
  /** Keep the container alive indefinitely (default: false) */
  keepAlive?: boolean;
  /** Sandbox SDK options — normalizeId defaults to true for DNS safety */
  normalizeId?: boolean;
};

export type RepoSession = {
  /** The sanitized sandbox / session ID (derived from repo full name) */
  sandboxId: string;
  /** Original repo full name, e.g. "owner/repo" */
  repoFullName: string;
  /** The underlying SandboxClient for advanced operations */
  client: SandboxClient;
  /** Execute a command in this repo's sandbox */
  exec: (command: string, timeoutMs?: number) => Promise<SandboxExecResult>;
  /** Write a file inside the sandbox */
  writeFile: (path: string, content: string) => Promise<void>;
  /** Read a file from the sandbox */
  readFile: (path: string) => Promise<string>;
  /** Destroy the sandbox and release resources */
  destroy: () => Promise<void>;
};

// ---------------------------------------------------------------------------
// SandboxSessionManager
// ---------------------------------------------------------------------------

export class SandboxSessionManager {
  constructor(private env: Env) {}

  /**
   * Get or create a sandbox scoped to a GitHub repository.
   *
   * The sandbox ID is derived from `sanitizeRepoName(repoFullName)` —
   * e.g. `"my-org/cool-repo"` → `"my-org-cool-repo"`.
   *
   * @param repoFullName  GitHub repository full name, e.g. "owner/repo"
   * @param opts          Optional session configuration
   * @returns             A `RepoSession` handle with typed helper methods
   */
  async ensureRepoSession(
    repoFullName: string,
    opts: RepoSessionOptions = {},
  ): Promise<RepoSession> {
    const sandboxId = sanitizeRepoName(repoFullName);

    const client = await SandboxClient.create(this.env, sandboxId, {
      normalizeId: opts.normalizeId ?? true,
      keepAlive: opts.keepAlive,
    });

    // If env or cwd are specified, create a named session inside the sandbox
    if (opts.env || opts.cwd) {
      await client.createSession({
        id: sandboxId,
        env: opts.env,
        cwd: opts.cwd ?? "/workspace",
      });
    }

    return {
      sandboxId,
      repoFullName,
      client,

      async exec(command: string, timeoutMs?: number): Promise<SandboxExecResult> {
        return client.exec({
          command,
          sessionId: (opts.env || opts.cwd) ? sandboxId : undefined,
          timeoutMs,
        });
      },

      async writeFile(path: string, content: string): Promise<void> {
        await client.writeFile({ path, content });
      },

      async readFile(path: string): Promise<string> {
        const result = await client.readFile({ path });
        return result.content;
      },

      async destroy(): Promise<void> {
        await client.destroy();
      },
    };
  }

  /**
   * Convenience: clone a repo into its sandbox workspace and return the
   * session handle.
   *
   * @param repoFullName  e.g. "my-org/my-repo"
   * @param repoUrl       Authenticated git URL (https://x-access-token:TOKEN@github.com/...)
   * @param branch        Optional branch to clone
   * @param opts          Session options (env, cwd)
   */
  async cloneAndGetSession(
    repoFullName: string,
    repoUrl: string,
    branch?: string,
    opts: RepoSessionOptions = {},
  ): Promise<RepoSession> {
    const session = await this.ensureRepoSession(repoFullName, opts);

    await session.client.gitClone({
      repoUrl,
      branch,
      targetDir: `/workspace/repo`,
      sessionId: (opts.env || opts.cwd) ? session.sandboxId : undefined,
    });

    return session;
  }
}
