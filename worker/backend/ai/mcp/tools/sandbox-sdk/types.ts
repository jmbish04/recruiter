/**
 * @file sandbox-sdk-tools/types.ts
 * @description Shared types for the Cloudflare Sandbox SDK tools layer.
 */

// ---------------------------------------------------------------------------
// Sandbox exec results
// ---------------------------------------------------------------------------

export type SandboxExecResult = {
  success: boolean;
  command: string;
  exitCode: number;
  stdout: string;
  stderr: string;
};

export type SandboxExecOptions = {
  /** Command to execute inside the sandbox */
  command: string;
  /** Session ID to execute within (auto-created if missing) */
  sessionId?: string;
  /** Per-command timeout in ms (default 300 000 – 5 min) */
  timeoutMs?: number;
  /** Extra environment variables merged into the session env */
  env?: Record<string, string>;
  /** Working directory override (relative to session cwd or absolute) */
  cwd?: string;
};

// ---------------------------------------------------------------------------
// Session management
// ---------------------------------------------------------------------------

export type SandboxSessionOptions = {
  /** Unique session id (auto-generated if omitted) */
  id?: string;
  /** Initial working directory */
  cwd?: string;
  /** Environment variables for this session */
  env?: Record<string, string>;
};

export type SandboxSessionResult = {
  success: boolean;
  sessionId: string;
  createdAt: string;
  timestamp: string;
};

// ---------------------------------------------------------------------------
// File operations
// ---------------------------------------------------------------------------

export type SandboxWriteFileOptions = {
  path: string;
  content: string;
  sessionId?: string;
};

export type SandboxReadFileOptions = {
  path: string;
  sessionId?: string;
};

export type SandboxWriteFileResult = {
  success: boolean;
  path: string;
  bytesWritten: number;
};

export type SandboxReadFileResult = {
  success: boolean;
  path: string;
  content: string;
};

// ---------------------------------------------------------------------------
// Process management
// ---------------------------------------------------------------------------

export type ProcessInfo = {
  user: string;
  pid: string;
  command: string;
  cpu: string;
  mem: string;
  time: string;
};

// ---------------------------------------------------------------------------
// Port exposure
// ---------------------------------------------------------------------------

export type ExposePortOptions = {
  port: number;
  sessionId?: string;
  name?: string;
};

export type ExposedPortResult = {
  success: boolean;
  port: number;
  name?: string;
  sessionId: string;
  url: string;
};

// ---------------------------------------------------------------------------
// Git checkout
// ---------------------------------------------------------------------------

export type GitCheckoutOptions = {
  repoUrl: string;
  branch?: string;
  targetDir?: string;
  sessionId?: string;
};

export type GitCheckoutResult = {
  success: boolean;
  repoUrl: string;
  branch: string;
  targetDir: string;
  timestamp: string;
};
