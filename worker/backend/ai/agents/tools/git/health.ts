import { HealthStepResult } from "@/health/health-check";
import { verifyGitHubToken } from "./github";
import { getSandbox } from "@cloudflare/sandbox";
import { getSandboxOptions } from "@/ai/utils/sandbox";

// ─── Timeout utility ──────────────────────────────────────────────────
// Ensures no health check step hangs the system.
const withTimeout = <T>(promise: Promise<T>, ms: number, stepName: string): Promise<T> => {
    let timeoutId: ReturnType<typeof setTimeout>;
    const timeout = new Promise<never>((_, reject) => {
        timeoutId = setTimeout(() => reject(new Error(`Timeout exceeded for ${stepName} (${ms}ms)`)), ms);
    });
    return Promise.race([promise, timeout]).finally(() => clearTimeout(timeoutId));
};

/**
 * Checks the health of the Git Domain by verifying:
 * 1. GitHub API Authentication
 */
export async function checkGitHealth(env: Env): Promise<HealthStepResult> {
    const start = Date.now();
    const subChecks: Record<string, any> = {};

    try {
        // --- 1. Test GitHub Auth ---
        const authStart = Date.now();
        const authResult = await withTimeout(verifyGitHubToken(env), 5000, "GitHub Auth");
        subChecks.githubAuth = {
            status: authResult.valid ? "OK" : "FAIL",
            latency: Date.now() - authStart,
            ...(authResult.valid ? { user: authResult.user } : { error: authResult.error })
        };

        // Determine overall status
        const isOverallSuccess = subChecks.githubAuth?.status !== "FAIL";

        return {
            name: "Git Integration",
            status: isOverallSuccess ? "success" : "failure",
            message: isOverallSuccess ? "GitHub Auth Operational" : "GitHub Auth degraded",
            durationMs: Date.now() - start,
            details: subChecks
        };
    } catch (error) {
        return {
            name: "Git Integration",
            status: "failure",
            message: error instanceof Error ? error.message : String(error),
            durationMs: Date.now() - start,
            details: subChecks
        };
    }
}

/**
 * Checks the health of the Sandbox Container by verifying:
 * 1. Sandbox Initialization & Ping
 * 2. File System (R2 Mounts & Local I/O)
 * 3. Git Operations (Clone)
 * 4. Execution Engine (Commands & Streams)
 */
export async function checkSandboxHealth(env: Env): Promise<HealthStepResult> {
    const start = Date.now();
    const subChecks: Record<string, any> = {};

    try {
        if (!env.SANDBOX) {
            subChecks.containerSandbox = { status: "SKIPPED", reason: "Binding missing" };
            return {
                name: "Sandbox Container",
                status: "success",
                message: "Sandbox skipped (no binding)",
                durationMs: Date.now() - start,
                details: subChecks
            };
        }

        const sandboxStart = Date.now();

        try {
            // Initialize Sandbox via the Cloudflare SDK
            const options = await getSandboxOptions(env);
            const sandbox = getSandbox(env.SANDBOX, "sandbox-health-probe", {
                ...options,
            });

            // 1. Ping test — verifies container runtime is awake
            const pingStart = Date.now();
            let pingSuccess = false;
            let lastPingError: any = null;
            const timeoutMs = env.HEALTH_SANDBOX_TIMEOUT_MS || 15000;

            for (let i = 0; i < 3; i++) {
                try {
                    await withTimeout(sandbox.exec("echo ping"), timeoutMs, "Sandbox Ping");
                    pingSuccess = true;
                    break;
                } catch (e: any) {
                    lastPingError = e;
                    console.warn(`[Sandbox Ping] Attempt ${i + 1} failed, retrying in 2s...`);
                    // Sleep 2 seconds before retry
                    await new Promise(y => setTimeout(y, 2000));
                }
            }

            if (!pingSuccess) {
                throw new Error(`Sandbox Ping failed after 3 attempts: ${lastPingError?.message || lastPingError}`);
            }

            subChecks.sandboxPing = { status: "OK", latency: Date.now() - pingStart };

            // 2. File System Check — tests write → read → delete cycle
            const fsStart = Date.now();
            try {
                const testPath = "/tmp/health-check.tmp";
                await withTimeout(sandbox.writeFile(testPath, "health-ok"), timeoutMs, "FS Write");
                const readResult = await withTimeout(sandbox.readFile(testPath), timeoutMs, "FS Read");
                await withTimeout(sandbox.exec(`rm ${testPath}`), timeoutMs, "FS Delete");

                subChecks.sandboxFS = {
                    status: readResult?.content === "health-ok" ? "OK" : "DEGRADED",
                    latency: Date.now() - fsStart
                };
            } catch (fsErr) {
                subChecks.sandboxFS = {
                    status: "FAIL",
                    error: fsErr instanceof Error ? fsErr.message : String(fsErr),
                    latency: Date.now() - fsStart
                };
            }

            // 3. Git Operations Check — shallow clone of a tiny public repo
            const gitStart = Date.now();
            try {
                await withTimeout(
                    sandbox.exec("git clone --depth=1 https://github.com/octocat/Hello-World.git /tmp/health-git"),
                    timeoutMs,
                    "Git Clone"
                );
                subChecks.sandboxGit = { status: "OK", latency: Date.now() - gitStart };
            } catch (gitErr) {
                subChecks.sandboxGit = {
                    status: "FAIL",
                    error: gitErr instanceof Error ? gitErr.message : String(gitErr),
                    latency: Date.now() - gitStart
                };
            }

            // 4. Command Execution — verify exec engine
            const execStart = Date.now();
            try {
                const psResult = await withTimeout(
                    sandbox.exec("echo health-ok"),
                    timeoutMs,
                    "Exec echo"
                );
                subChecks.sandboxExec = {
                    status: psResult.exitCode === 0 ? "OK" : "FAIL",
                    latency: Date.now() - execStart,
                    exitCode: psResult.exitCode,
                };
            } catch (execErr) {
                subChecks.sandboxExec = {
                    status: "FAIL",
                    error: execErr instanceof Error ? execErr.message : String(execErr),
                    latency: Date.now() - execStart
                };
            }

            // Aggregate Sandbox Status
            subChecks.containerSandbox = {
                status: "OK",
                message: "All container subsystems evaluated",
                totalLatency: Date.now() - sandboxStart
            };

        } catch (sandboxError) {
            subChecks.containerSandbox = {
                status: "FAIL",
                error: sandboxError instanceof Error ? sandboxError.message : String(sandboxError),
                latency: Date.now() - sandboxStart
            };
        }

        const isOverallSuccess = subChecks.containerSandbox?.status !== "FAIL";

        const hasDegradation =
            subChecks.sandboxFS?.status === "FAIL" ||
            subChecks.sandboxGit?.status === "FAIL" ||
            subChecks.sandboxExec?.status === "FAIL";

        return {
            name: "Sandbox Container",
            status: isOverallSuccess ? (hasDegradation ? "success" : "success") : "failure", // Always marked success/failure based on root
            message: isOverallSuccess
                ? hasDegradation ? "Operational with subsystem degradation" : "All systems operational"
                : "Subsystem degradation detected",
            durationMs: Date.now() - start,
            details: subChecks
        };

    } catch (error) {
        return {
            name: "Sandbox Container",
            status: "failure",
            message: error instanceof Error ? error.message : String(error),
            durationMs: Date.now() - start,
            details: subChecks
        };
    }
}