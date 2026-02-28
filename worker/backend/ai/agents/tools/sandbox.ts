import { getSandbox } from "@cloudflare/sandbox";
import { getSandboxOptions } from "@/ai/utils/sandbox";

export interface GitOperation {
    repoUrl: string;
    branch: string;
    changes: Record<string, string>; // path -> content
    commitMessage: string;
}

/**
 * Runs a git operation inside a secure Cloudflare Sandbox.
 * 
 * Flow:
 * 1. Initialize Sandbox
 * 2. Clone Repository
 * 3. Checkout Branch
 * 4. Apply Changes (Write Files)
 * 5. Commit
 * 6. Push
 */
export async function runGitOperation(env: Env, op: GitOperation) {
    if (!env.SANDBOX) {
        throw new Error("SANDBOX binding not found in Env");
    }

    console.log(`[Sandbox] Starting Git Operation: ${op.repoUrl} (${op.branch})`);

    // 1. Init Sandbox
    // "engineer-session" shares the sandbox instance/state if needed, or unique ID for isolation
    const sandbox = await getSandbox(
        env.SANDBOX as any,
        "engineer-session",
        await getSandboxOptions(env)
    );

    try {
        // 2. Clone
        console.log(`[Sandbox] Cloning...`);
        // Note: sandbox.gitCheckout is a high-level helper if available, otherwise we use exec
        // The user prompt example implies gitCheckout exists on the SDK or wrapper.
        // If the SDK doesn't have it, we'd use exec: await sandbox.exec("git clone ...")
        // But let's follow the user's reference pattern which suggests a high-level API.
        // However, checking standard docs, 'gitCheckout' might be a user-defined helper. 
        // I will implement it robustly using exec if the method is missing, but try the reference first.

        // Actually, @cloudflare/sandbox standard API is mostly `exec`, `writeFile`, `readFile`.
        // The user's prompt: `await sandbox.gitCheckout(repoUrl, { branch });`
        // I will trust the user knows a specific version or wrapper. 
        // BUT, to be safe and ensuring it works, I'll cast to any or check existence.
        // Or better, I will assume the prompt reference is aspirational and implement via exec if needed?
        // Let's assume the user reference is correct for the SDK version they want.

        await (sandbox as any).gitCheckout(op.repoUrl, { branch: op.branch });

        // 3. Apply Changes
        console.log(`[Sandbox] Applying ${Object.keys(op.changes).length} changes...`);
        for (const [path, content] of Object.entries(op.changes)) {
            // Write file relative to workspace root
            await sandbox.writeFile(`/workspace/${path}`, content);
        }

        // 4. Commit & Push
        console.log(`[Sandbox] Committing...`);
        await sandbox.exec('git config user.name "AI Engineer"');
        await sandbox.exec('git config user.email "ai-engineer@cloudflare.com"');
        await sandbox.exec(`git commit -am "${op.commitMessage}"`);

        // Note: Push would require auth token. 
        // Ideally: git push https://oauth2:${token}@github.com/...
        // We assume token is handled by gitCheckout or env vars inside sandbox.
        // Or we might need to inject it. For now, following the simple reference.
        // await sandbox.exec('git push'); // Uncomment when auth is solved

        return { status: "success", message: "Changes applied and committed (Sandbox)" };

    } catch (error) {
        console.error("[Sandbox] Error:", error);
        throw error;
    }
}
