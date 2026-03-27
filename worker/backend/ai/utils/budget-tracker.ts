import { drizzle } from 'drizzle-orm/d1';
import { aiCostLogs, budgetEvents, sessions } from '@db/schema';
import { generateUuid } from '@/utils/common';
import { sql, desc, eq, gt, and } from 'drizzle-orm';
import { z } from 'zod';
import Cloudflare from 'cloudflare';
import { PRICING_CATALOG, guardCheck, type ModelPricing } from './pricing-registry';


// ============================================================================
// CLOUDFLARE PRICING SCHEMAS
// ============================================================================

const ModelPriceSchema = z.object({
  unit: z.string(),
  price: z.number(),
  currency: z.string(),
});

type ModelPrice = z.infer<typeof ModelPriceSchema>;

const ModelPropertySchema = z.object({
  property_id: z.string(),
  value: z.union([
    z.string(),
    z.array(ModelPriceSchema),
    z.unknown()
  ]),
});

const AiModelSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().optional(),
  properties: z.array(ModelPropertySchema),
});

// Pricing configuration (USD per 1M tokens) is now loaded from ./pricing-registry.ts

// Global cache for Workers AI pricing to persist across requests
// Maps model name -> Array of pricing tiers (as returned by CF API)
let WORKERS_AI_PRICING_CACHE: Record<string, ModelPrice[]> | null = null;
let CACHE_TIMESTAMP = 0;
const CACHE_TTL_MS = 1000 * 60 * 60; // 1 hour

/**
 * BudgetTracker enforces the global AI spending limit.
 * It tracks usage in D1 and halts execution if the limit is exceeded.
 */
export class BudgetTracker {
  private db: ReturnType<typeof drizzle>;
  private env: Env;
  private cf: Cloudflare | null = null;

  constructor(env: Env) {
    this.env = env;
    this.db = drizzle(env.DB);
  }

  private async getCloudflare(): Promise<Cloudflare | null> {
    if (this.cf) return this.cf;

    let apiToken: string | null = null;
    
    // Handle SecretsStoreSecret or simple string
    const rawToken = this.env.CLOUDFLARE_API_TOKEN as any;
    if (typeof rawToken === 'string') {
        apiToken = rawToken;
    } else if (rawToken && typeof rawToken.get === 'function') {
         // Assuming SecretsStoreSecret has .get() which returns Promise<string>?
         // Or maybe it's just a value binding? 
         // Actually, usually secrets are strings in Env if not using SecretsStore?
         // If using SecretsStore, it might be different. 
         // I'll try generic access.
         try {
            const secret = await rawToken.get();
            if (secret && typeof secret === 'object' && secret.value) apiToken = secret.value; // unwrapping?
            else apiToken = secret;
         } catch (e) {
            console.warn('[BudgetTracker] Failed to retrieve CLOUDFLARE_API_TOKEN secret:', e);
         }
    } else if (rawToken) {
        // Fallback checks
        apiToken = String(rawToken);
    }

    if (apiToken) {
        this.cf = new Cloudflare({
            apiToken: apiToken
        });
    }
    return this.cf;
  }

  /**
   * Fetches dynamic pricing for a SPECIFIC Worker AI model.
   * Adopts the user's robust Zod-based search and validation logic.
   */
  private async ensureWorkersAiPricing(modelName: string) {
    // If cache is valid and has this model, return
    if (WORKERS_AI_PRICING_CACHE && WORKERS_AI_PRICING_CACHE[modelName] && (Date.now() - CACHE_TIMESTAMP < CACHE_TTL_MS)) {
        return;
    }

    const cf = await this.getCloudflare();

    if (!cf || !this.env.CLOUDFLARE_ACCOUNT_ID) {
        console.warn('[BudgetTracker] Missing Cloudflare credentials, skipping dynamic pricing fetch.');
        return;
    }

    console.log(`[BudgetTracker] Fetching pricing for: ${modelName}...`);
    try {
        // Initialize cache
        WORKERS_AI_PRICING_CACHE = WORKERS_AI_PRICING_CACHE || {};

        // Unwrap Account ID if it's a secret
        let accountId = "";
        const rawAccountId = this.env.CLOUDFLARE_ACCOUNT_ID as any; 
        if (typeof rawAccountId === 'string') {
            accountId = rawAccountId;
        } else if (rawAccountId && typeof rawAccountId.get === 'function') {
            const secret = await rawAccountId.get();
             if (secret && typeof secret === 'object' && secret.value) accountId = secret.value;
             else accountId = String(secret);
        } else {
             accountId = String(rawAccountId);
        }

        // 1. Search for the model
        const response = await cf.ai.models.list({
            account_id: accountId,
            search: modelName,
        });

        // 2. Iterate and find EXACT match
        let targetModel: z.infer<typeof AiModelSchema> | undefined;

        for (const rawModel of response.result) {
            const parsed = AiModelSchema.safeParse(rawModel);
            if (parsed.success && parsed.data.name === modelName) {
                targetModel = parsed.data;
                break;
            }
        }

        if (!targetModel) {
             console.warn(`[BudgetTracker] Model '${modelName}' not found in search results.`);
             WORKERS_AI_PRICING_CACHE[modelName] = []; // Mark as found but empty to avoid refetching immediately
             return;
        }

        // 3. Extract 'price' property
        const priceProperty = targetModel.properties.find(p => p.property_id === 'price');
        
        if (!priceProperty) {
            console.info(`[BudgetTracker] Model '${modelName}' exists but has no pricing property.`);
            WORKERS_AI_PRICING_CACHE[modelName] = [];
            return;
        }

        // 4. Validate struct
        const result = z.array(ModelPriceSchema).safeParse(priceProperty.value);
        if (!result.success) {
             console.error(`[BudgetTracker] Failed to parse pricing for '${modelName}':`, result.error);
             return;
        }

        // 5. Update Cache
        WORKERS_AI_PRICING_CACHE[modelName] = result.data;
        CACHE_TIMESTAMP = Date.now();
        console.log(`[BudgetTracker] Cached pricing for ${modelName}:`, result.data);

    } catch (e) {
        console.error('[BudgetTracker] Failed to fetch Workers AI pricing:', e);
    }
  }

  /**
   * Calculates the cost of a transaction in micro-dollars (1/1,000,000 USD).
   * Enforces Guardrails via Pricing Registry.
   */
  private calculateCostMicros(modelName: string, inputTokens: number, outputTokens: number): number {
    let pricing: ModelPricing | undefined;

    // 1. Exact match in Registry
    if (PRICING_CATALOG[modelName]) {
        pricing = PRICING_CATALOG[modelName];
    }
    
    // 2. Dynamic Workers AI (Synthetic ModelPricing)
    else if (WORKERS_AI_PRICING_CACHE && WORKERS_AI_PRICING_CACHE[modelName] && WORKERS_AI_PRICING_CACHE[modelName].length > 0) {
        // Construct synthetic pricing object from cache
        const prices = WORKERS_AI_PRICING_CACHE[modelName];
        
        pricing = {
            id: modelName,
            provider: 'cloudflare',
            name: modelName,
            input: prices.find(p => p.unit.includes('input'))?.price || 0,
            output: prices.find(p => p.unit.includes('output'))?.price || 0,
            cache_read: 0,
            is_preview: false
        };
    }

    // 3. Fallbacks / Aliases
    if (!pricing) {
        if (modelName.includes('gpt-4o-mini') || modelName.includes('gpt-4.1-mini')) {
            pricing = PRICING_CATALOG['gpt-4o-mini'];
        } else if (modelName.includes('gpt-4o')) {
            pricing = PRICING_CATALOG['gpt-4o'];
        } else if (modelName.includes('gpt-5-mini')) {
             pricing = PRICING_CATALOG['gpt-4o-mini']; 
        } else if (modelName.includes('o1') && !modelName.includes('mini')) {
             pricing = PRICING_CATALOG['o1'];
        } else if (modelName.includes('o1-mini')) {
             pricing = PRICING_CATALOG['o1-mini'];
        } else if (modelName.startsWith('openai/') && !pricing) {
            pricing = PRICING_CATALOG['gpt-4o-mini'];
        } else {
             // Ultimate fallback: Workers AI (Free/Cheap)
             pricing = {
                 id: 'workers-ai-fallback', 
                 provider: 'cloudflare', 
                 name: 'Workers AI Default',
                 input: 0, 
                 output: 0,
                 cache_read: 0,
                 is_preview: false
             };
        }
    }

    // pricing is guaranteed to be defined here due to fallbacks
    // 4. GUARDRAIL CHECK
    // This throws ExpensiveModelError if limits exceeded
    const isLongContext = inputTokens > 200_000;
    guardCheck(modelName, pricing!, isLongContext);

    // 5. Calculation
    const p = pricing!;
    const inputRate = (isLongContext && p.input_long) ? p.input_long : p.input;
    const outputRate = (isLongContext && p.output_long) ? p.output_long : p.output;

    const inputCost = (inputTokens / 1_000_000) * inputRate;
    const outputCost = (outputTokens / 1_000_000) * outputRate;
    
    return Math.ceil((inputCost + outputCost) * 1_000_000);
  }


  /**
   * Tracks a transaction and logs it to D1.
   * "Fire and forget" style is recommended for the caller, but this method is async.
   */
  async trackUsage(params: {
    model: string;
    inputTokens: number;
    outputTokens: number;
    sessionId?: string;
    documentId?: string;
    workflowName?: string;
  }): Promise<void> {
    
    // Attempt to fetch dynamic pricing if not found in static list and it looks like a CF model (or just always try lazily if cache expired)
    if (!PRICING_CATALOG[params.model]) {
        await this.ensureWorkersAiPricing(params.model);
    }

    const costMicros = this.calculateCostMicros(params.model, params.inputTokens, params.outputTokens);

    try {
      await this.db.insert(aiCostLogs).values({
        id: generateUuid(),
        model: params.model,
        inputTokens: params.inputTokens,
        outputTokens: params.outputTokens,
        estimatedCost: costMicros,
        sessionId: params.sessionId || null,
        documentId: params.documentId || null,
        workflowName: params.workflowName || null,
      });
    } catch (err) {
      console.error('[BudgetTracker] Failed to log usage:', err);
    }
  }

  /**
   * Checks if the total budget has been exceeded since the last reset.
   * Throws an Error if budget is exceeded.
   */
  async checkBudgetStrict(): Promise<void> {
    const maxBudgetUsd = parseFloat(this.env.MAX_AI_BUDGET || '0');
    if (maxBudgetUsd <= 0) return; // No limit set

    const currentSpendUsd = await this.getCurrentSpend();

    if (currentSpendUsd >= maxBudgetUsd) {
      console.error(`[BudgetTracker] 🚨 BUDGET EXCEEDED! Limit: $${maxBudgetUsd}, Used: $${currentSpendUsd.toFixed(4)}`);
      throw new Error(`AI Budget Exceeded: Limit $${maxBudgetUsd}, Used $${currentSpendUsd.toFixed(4)}. Please reset budget to continue.`);
    }
  }
  
  /**
   * Helper to get current spend SINCE LAST RESET.
   */
  async getCurrentSpend(): Promise<number> {
    // 1. Find the last reset timestamp
    const lastReset = await this.db.select()
      .from(budgetEvents)
      .where(eq(budgetEvents.eventType, 'reset'))
      .orderBy(desc(budgetEvents.timestamp))
      .limit(1)
      .get();
      
    const resetTime = lastReset?.timestamp || new Date(0); // Default to epoch if no reset

    // Filter ignored sessions
    const notIgnored = sql`session_id NOT IN (SELECT id FROM sessions WHERE is_ignore = 1)`;

    // 2. Sum costs since that time
    const result = await this.db
      .select({ 
        totalMicros: sql<number>`sum(${aiCostLogs.estimatedCost})` 
      })
      .from(aiCostLogs)
      .where(and(gt(aiCostLogs.timestamp, resetTime), notIgnored))
      .get();
      
    return (result?.totalMicros || 0) / 1_000_000;
  }

  /**
   * Resets the budget by creating a new 'reset' event.
   */
  async resetBudget(note?: string): Promise<void> {
    await this.db.insert(budgetEvents).values({
        id: generateUuid(),
        eventType: 'reset',
        message: note || 'Manual Reset',
        threshold: 0,
        currentSpend: 0
    });
  }

  /**
   * Returns full status for the dashboard.
   */
  async getBudgetStatus() {
    const limit = parseFloat(this.env.MAX_AI_BUDGET || '0');
    const spent = await this.getCurrentSpend();
    
    // Get last reset time
    const lastReset = await this.db.select()
      .from(budgetEvents)
      .where(eq(budgetEvents.eventType, 'reset'))
      .orderBy(desc(budgetEvents.timestamp))
      .limit(1)
      .get();

    return {
        limit,
        spent,
        remaining: Math.max(0, limit - spent),
        percentUsed: limit > 0 ? (spent / limit) * 100 : 0,
        lastReset: lastReset?.timestamp || null
    };
  }

  /**
   * Get recent transactions for the table (paginated).
   */
  async getTransactions(limit = 50, offset = 0) {
    // Filter ignored sessions
    const notIgnored = sql`session_id NOT IN (SELECT id FROM sessions WHERE is_ignore = 1)`;

    return await this.db.select()
        .from(aiCostLogs)
        .where(notIgnored)
        .orderBy(desc(aiCostLogs.timestamp))
        .limit(limit)
        .offset(offset)
        .all();
  }
}
