/**
 * @file sandbox-sdk-tools/utils.ts
 * @description Shared utility helpers used across sandbox-sdk-tools.
 */

/**
 * Shell-escape a value for safe interpolation into a bash command.
 */
export function shellEscape(value: string): string {
  return `'${value.replace(/'/g, `'"'"'`)}'`;
}

/**
 * Sanitize a GitHub repository full_name (e.g. "owner/repo") into a
 * lowercase, DNS/Durable-Object-safe identifier suitable for use as a
 * sandbox ID or agent name.
 *
 * Rules:
 *  - Lowercased
 *  - "/" replaced with "-"
 *  - Non-alphanumeric/hyphen characters stripped
 *
 * @example sanitizeRepoName("My-Org/Cool.Repo") => "my-org-coolrepo"
 */
export function sanitizeRepoName(fullName: string): string {
  return fullName
    .toLowerCase()
    .replace(/\//g, "-")
    .replace(/[^a-z0-9-]/g, "");
}

/**
 * Truncate long output for log/AI consumption.
 */
export function truncateOutput(output: string, max = 4000): string {
  if (output.length <= max) return output;
  return `${output.slice(0, max)}\n...[truncated]`;
}

/**
 * Sanitize a value for use as a filesystem path segment.
 */
export function sanitizeForPath(value: string): string {
  return value.replace(/[^a-zA-Z0-9-_]/g, "-");
}
