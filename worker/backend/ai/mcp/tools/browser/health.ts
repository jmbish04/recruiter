


import { HealthStepResult } from "@/health/types";
import { testAnyValidToken } from "@/utils/cloudflare/tokens";

/**
 * Checks the health of the Browser Render API by verifying:
 * 1. CLOUDFLARE_ACCOUNT_ID and CF_BROWSER_RENDER_TOKEN are configured
 */
export async function checkHealth(env: Env): Promise<HealthStepResult> {
    const start = Date.now();

    // Unwrap tokens
    let accountId = ""; 
    const rawAccountId = env.CLOUDFLARE_ACCOUNT_ID as any;
    if (typeof rawAccountId === 'string') accountId = rawAccountId;
    else if (rawAccountId && typeof rawAccountId.get === 'function') {
         const s = await rawAccountId.get();
         accountId = (s && typeof s === 'object' && s.value) ? s.value : String(s);
    } else accountId = String(rawAccountId || "");

    let token = "";
    const rawToken = env.CF_BROWSER_RENDER_TOKEN as any;
    if (typeof rawToken === 'string') token = rawToken;
    else if (rawToken && typeof rawToken.get === 'function') {
         const s = await rawToken.get();
         token = (s && typeof s === 'object' && s.value) ? s.value : String(s);
    } else token = String(rawToken || "");


    if (!accountId || !token) {
        return {
            name: "Browser Render API",
            status: "failure",
            message: "Missing configuration",
            durationMs: Date.now() - start,
            details: {
                accountId: !!accountId,
                token: !!token
            }
        };
    }

    // Verify Token
    const authResult = await testAnyValidToken(token, accountId, "CF_BROWSER_RENDER_TOKEN");

    if (!authResult.passed) {
        return {
            name: "Browser Render API",
            status: "failure",
            message: `Token Verification Failed: ${authResult.reason}`,
            durationMs: Date.now() - start,
            details: {
                reason: authResult.reason,
                detectedType: authResult.detectedType,
                authDetails: authResult.details
            }
        };
    }

    return {
        name: "Browser Render API",
        status: "success",
        message: "Configured & Active",
        durationMs: Date.now() - start,
        details: {
            configured: true,
            authType: authResult.detectedType
        }
    };
}
