/**
 * @module OwnerAgent
 * @description Cloudflare Durable Object Agent for managing state and processing webhooks 
 * across a GitHub Owner (User or Organization). It aggregates stats across multiple 
 * repositories and tracks organization-wide events and automation runs.
 * @version 1.0.0
 */

import { callable } from "agents";
import { BaseAgent, BaseAgentState } from "@agent-sdk";
import { Logger } from "@logging";
import { generateUuid } from "@/utils/common";
import { desc, eq } from "drizzle-orm";
import { getAgentDb, agentSchema, type AgentDb } from "@/db/schemas/agents/stateful";
import type {
  GitHubEventType,
  GitHubForkPayload,
  GitHubInstallationPayload,
  GitHubInstallationRepositoriesPayload,
  GitHubIssueCommentPayload,
  GitHubIssuesPayload,
  GitHubPingPayload,
  GitHubPullRequestPayload,
  GitHubPushPayload,
  GitHubReleasePayload,
  GitHubRepository,
  GitHubStarPayload,
  GitHubWebhookPayload,
  StoredEvent,
} from "@/ai/agents/github-types";


/**
 * @interface OwnerState
 * @description Defines the durable state shape for the OwnerAgent, representing aggregated 
 * GitHub owner statistics and webhook configuration status.
 */
export type OwnerState = BaseAgentState & {
  ownerName: string;
  stats: {
    totalStars: number;
    totalForks: number;
    totalOpenIssues: number;
    repoCount: number;
  };
  lastUpdated: string | null;
  webhookConfigured: boolean;
};

/**
 * @class OwnerAgent
 * @extends BaseAgent<Env, OwnerState>
 * @description Maintains persistent state for a GitHub Owner and provides an interface 
 * for ingesting webhook events, running automation tracking, and serving metrics.
 */
export class OwnerAgent extends BaseAgent<Env, OwnerState> {
  private _db: AgentDb | null = null;
  // logger inherited from BaseAgent

  /**
   * @constructor
   * @param {DurableObjectState} state - The Durable Object state injected by Cloudflare.
   * @param {Env} env - Global environment bindings.
   */
  constructor(state: DurableObjectState, env: Env) {
    super(state, env);
  }

  /**
   * @private
   * @getter db
   * @description Lazily initializes the Drizzle ORM instance backed by the DO's SQLite storage API.
   * @returns {AgentDb} Drizzle ORM Database instance.
   */
  private get db(): AgentDb {
    if (!this._db) {
      this._db = getAgentDb(this.ctx.storage);
    }
    return this._db;
  }

  /**
   * @property initialState
   * @description The default state applied to new Owner instances before any data is ingested.
   */
  initialState: OwnerState = {
    ownerName: "",
    stats: {
      totalStars: 0,
      totalForks: 0,
      totalOpenIssues: 0,
      repoCount: 0
    },
    lastUpdated: null,
    webhookConfigured: false,
    status: "idle",
    history: []
  };

  /**
   * @method onStart
   * @description Lifecycle hook executed when the agent starts. Responsible for 
   * idempotent table schema initialization in the Durable Object SQLite backend.
   */
  async onStart(): Promise<void> {
    // Idempotent table creation (Drizzle doesn't auto-migrate inside DOs natively yet).
    void this.sql`
      CREATE TABLE IF NOT EXISTS events (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL,
        action TEXT,
        title TEXT NOT NULL,
        description TEXT,
        url TEXT,
        actor_login TEXT,
        actor_avatar TEXT,
        timestamp TEXT NOT NULL,
        repo_name TEXT
      )
    `;
    void this.sql`
      CREATE INDEX IF NOT EXISTS idx_events_timestamp ON events(timestamp DESC)
    `;
    void this.sql`
      CREATE TABLE IF NOT EXISTS automation_runs (
        id TEXT PRIMARY KEY,
        rule_id TEXT NOT NULL,
        rule_name TEXT NOT NULL,
        workflow TEXT NOT NULL,
        event_id TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        started_at TEXT NOT NULL,
        completed_at TEXT
      )
    `;
    // Migration: Remove broken FOREIGN KEY constraint from existing DOs.
    // SQLite doesn't support ALTER TABLE DROP CONSTRAINT, so we must rebuild.
    // Check if the table has the FK by inspecting sql definition.
    try {
      const tableInfo = this.sql`SELECT sql FROM sqlite_master WHERE type='table' AND name='automation_runs'`;
      const rows = [...tableInfo] as any[];
      if (rows.length > 0 && rows[0].sql && rows[0].sql.includes('FOREIGN KEY')) {
        // Rebuild without FK
        void this.sql`ALTER TABLE automation_runs RENAME TO automation_runs_old`;
        void this.sql`
          CREATE TABLE automation_runs (
            id TEXT PRIMARY KEY,
            rule_id TEXT NOT NULL,
            rule_name TEXT NOT NULL,
            workflow TEXT NOT NULL,
            event_id TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'pending',
            started_at TEXT NOT NULL,
            completed_at TEXT
          )
        `;
        void this.sql`INSERT INTO automation_runs SELECT * FROM automation_runs_old`;
        void this.sql`DROP TABLE automation_runs_old`;
        console.log('[OwnerAgent] Migrated automation_runs: removed broken FK constraint');
      }
    } catch (migrationErr) {
      console.warn('[OwnerAgent] FK migration check skipped:', migrationErr);
    }
    void this.sql`
      CREATE INDEX IF NOT EXISTS idx_automation_runs_event ON automation_runs(event_id)
    `;
  }

  /**
   * @method onRequest
   * @description Standard fetch handler for the Agent. Parses incoming webhook events 
   * and automation run requests, routing them to the appropriate processor.
   * @param {Request} request - The incoming HTTP Request.
   * @returns {Promise<Response>} HTTP Response indicating success or failure.
   */
  async onRequest(request: Request): Promise<Response> {
    if (request.method !== "POST") {
      return new Response("Method not allowed", { status: 405 });
    }

    const url = new URL(request.url);

    // Handle automation run storage from webhook-handler
    if (url.pathname === "/store-automation") {
      const body = await request.json() as {
        id: string;
        ruleId: string;
        ruleName: string;
        workflow: string;
        eventId: string;
        status: string;
        startedAt: string;
      };
      this.storeAutomationRun(body);
      return new Response("OK", { status: 200 });
    }

    // Default: handle webhook event forwarding
    const eventType = request.headers.get("X-GitHub-Event") as GitHubEventType;
    if (!eventType) {
      return new Response("Missing X-GitHub-Event header", { status: 400 });
    }

    // Signature already verified at the router level (webhook-handler.ts)
    const body = await request.text();
    const payload = JSON.parse(body) as GitHubWebhookPayload;
    
    await this.processWebhook(eventType, payload);

    return new Response("OK", { status: 200 });
  }

  /**
   * @private
   * @method processWebhook
   * @description Ingests the normalized GitHub payload, updates Owner state metrics, 
   * inserts the event into SQLite, and cleans up historical records.
   * @param {GitHubEventType} eventType - The type of GitHub webhook event.
   * @param {GitHubWebhookPayload} payload - The normalized JSON payload.
   */
  private async processWebhook(
    eventType: GitHubEventType,
    payload: GitHubWebhookPayload
  ): Promise<void> {
    const repo = this.getRepository(payload);
    
    // Extract owner name from various possible payload structures
    const ownerName = repo?.owner.login || 
                      (payload as any).installation?.account?.login || 
                      (payload as any).sender?.login;

    if (ownerName && this.state.ownerName !== ownerName) {
        this.setState({ ...this.state, ownerName });
    }

    // Track activity & webhook health state
    this.setState({
      ...this.state,
      lastUpdated: new Date().toISOString(),
      webhookConfigured: true
    });

    const event = this.createEvent(eventType, payload);
    if (event) {
      const repoName = repo?.full_name || (payload as any).repository?.full_name || "";

      this.db
        .insert(agentSchema.agentEvents)
        .values({
          id: event.id,
          type: event.type,
          action: event.action ?? null,
          title: event.title,
          description: event.description,
          url: event.url,
          actorLogin: event.actor.login,
          actorAvatar: event.actor.avatar_url,
          repoName: repoName,
          timestamp: event.timestamp,
        })
        .onConflictDoUpdate({
          target: agentSchema.agentEvents.id,
          set: {
            type: event.type,
            action: event.action ?? null,
            title: event.title,
            description: event.description,
            url: event.url,
            actorLogin: event.actor.login,
            actorAvatar: event.actor.avatar_url,
            repoName: repoName,
            timestamp: event.timestamp,
          },
        })
        .run();

      // Optimize storage space: Cleanup old events keeping only the latest 200.
      this.db.run(
        "DELETE FROM events WHERE id IN (SELECT id FROM events ORDER BY timestamp DESC LIMIT -1 OFFSET 200)"
      );
    }
  }

  /**
   * @private
   * @method getRepository
   * @description Safe extraction of the repository object from generic webhook payloads.
   * @param {GitHubWebhookPayload} payload - The JSON payload.
   * @returns {GitHubRepository | null} Parsed Repository object, if present.
   */
  private getRepository(payload: GitHubWebhookPayload): GitHubRepository | null {
    if ("repository" in payload && payload.repository) {
      return payload.repository;
    }
    return null;
  }

  /**
   * @private
   * @method createEvent
   * @description Translates standard GitHub payloads into our internal StoredEvent format.
   * @param {GitHubEventType} eventType - Webhook event discriminator.
   * @param {GitHubWebhookPayload} payload - Full webhook data.
   * @returns {StoredEvent | null} Standardized StoredEvent record or null if unhandled.
   */
  private createEvent(
    eventType: GitHubEventType,
    payload: GitHubWebhookPayload
  ): StoredEvent | null {
    const id = generateUuid();
    const timestamp = new Date().toISOString();
    
    const getRepoPrefix = () => {
        const repo = this.getRepository(payload);
        return repo ? `[${repo.name}] ` : "";
    };

    switch (eventType) {
      case "ping": {
        const p = payload as GitHubPingPayload;
        return {
          id, type: "ping", title: `${getRepoPrefix()}Webhook configured`, description: p.zen,
          url: p.repository?.html_url || "", actor: { login: p.sender?.login || "github", avatar_url: p.sender?.avatar_url || "" }, timestamp
        };
      }
      case "push": {
        const p = payload as GitHubPushPayload;
        const branch = p.ref.replace("refs/heads/", "");
        const commitCount = p.commits?.length || 0;
        return {
          id, type: "push", 
          title: `${getRepoPrefix()}Pushed ${commitCount} commit${commitCount !== 1 ? "s" : ""} to ${branch}`,
          description: p.commits?.[0]?.message?.split("\n")[0] || "No commit message",
          url: p.commits?.[0]?.url || p.repository.html_url,
          actor: { login: p.sender.login, avatar_url: p.sender.avatar_url }, timestamp
        };
      }
      case "pull_request": {
        const p = payload as GitHubPullRequestPayload;
        return {
          id, type: "pull_request", action: p.action,
          title: `${getRepoPrefix()}PR #${p.number}: ${p.pull_request.title}`,
          description: `${p.action} by ${p.sender.login}`,
          url: p.pull_request.html_url,
          actor: { login: p.sender.login, avatar_url: p.sender.avatar_url }, timestamp
        };
      }
      case "issues": {
        const p = payload as GitHubIssuesPayload;
        return {
          id, type: "issues", action: p.action,
          title: `${getRepoPrefix()}Issue #${p.issue.number}: ${p.issue.title}`,
          description: `${p.action} by ${p.sender.login}`,
          url: p.issue.html_url,
          actor: { login: p.sender.login, avatar_url: p.sender.avatar_url }, timestamp
        };
      }
      case "issue_comment": {
        const p = payload as GitHubIssueCommentPayload;
        return {
          id, type: "issue_comment", action: p.action,
          title: `${getRepoPrefix()}Comment on #${p.issue.number}`,
          description: p.comment.body.slice(0, 100) + (p.comment.body.length > 100 ? "..." : ""),
          url: p.comment.html_url,
          actor: { login: p.sender.login, avatar_url: p.sender.avatar_url }, timestamp
        };
      }
      case "star": {
        const p = payload as GitHubStarPayload;
        return {
            id, type: "star", action: p.action,
            title: `${getRepoPrefix()}${p.action === "created" ? "Repository starred" : "Star removed"}`,
            description: `by ${p.sender.login}`,
            url: p.repository.html_url,
            actor: { login: p.sender.login, avatar_url: p.sender.avatar_url }, timestamp
        };
      }
      case "fork": {
          const p = payload as GitHubForkPayload;
          return {
              id, type: "fork", title: `${getRepoPrefix()}Repository forked`,
              description: `Forked to ${p.forkee.full_name}`,
              url: p.forkee.html_url,
              actor: { login: p.sender.login, avatar_url: p.sender.avatar_url }, timestamp
          };
      }
      case "release": {
          const p = payload as GitHubReleasePayload;
          return {
              id, type: "release", action: p.action,
              title: `${getRepoPrefix()}Release ${p.release.tag_name}`,
              description: p.release.name || `${p.action} by ${p.sender.login}`,
              url: p.release.html_url,
              actor: { login: p.sender.login, avatar_url: p.sender.avatar_url }, timestamp
          };
      }
      case "installation": {
          const p = payload as GitHubInstallationPayload;
          return {
            id, type: "installation", action: p.action,
            title: `App ${p.action}`,
            description: `Installation ${p.action} for ${p.installation.account.login}`,
            url: p.installation.html_url,
            actor: { login: p.sender.login, avatar_url: p.sender.avatar_url }, timestamp
          };
      }
      case "installation_repositories": {
          const p = payload as GitHubInstallationRepositoriesPayload;
          const count = p.repositories_added.length + p.repositories_removed.length;
          return {
            id, type: "installation_repositories", action: p.action,
            title: `Repositories updated`,
            description: `${p.action} ${count} repos by ${p.sender.login}`,
            url: p.installation.account.html_url,
            actor: { login: p.sender.login, avatar_url: p.sender.avatar_url }, timestamp
          };
      }
      case "check_run": {
          const p = payload as any;
          return {
            id, type: "check_run", action: p.action,
            title: `${getRepoPrefix()}Check Run ${p.check_run.status}`,
            description: p.check_run.output?.title || p.check_run.name,
            url: p.check_run.html_url,
            actor: { login: p.sender.login, avatar_url: p.sender.avatar_url }, timestamp
          };
      }
      case "check_suite": {
          const p = payload as any;
          return {
            id, type: "check_suite", action: p.action,
            title: `${getRepoPrefix()}Check Suite ${p.check_suite.status}`,
            description: p.check_suite.conclusion || p.action,
            url: p.check_suite.html_url || p.repository?.html_url,
            actor: { login: p.sender.login, avatar_url: p.sender.avatar_url }, timestamp
          };
      }
      default:
        return {
            id, type: eventType,
            title: `${getRepoPrefix()}${eventType}`,
            description: (payload as any).action || "No description",
            url: (payload as any).repository?.html_url || "",
            actor: { login: (payload as any).sender?.login || "unknown", avatar_url: (payload as any).sender?.avatar_url || "" }, timestamp
        };
    }
  }

  /**
   * @method getEvents
   * @description Callable endpoint to retrieve recent events from SQLite storage.
   * @param {number} limit - The maximum number of events to return (default: 20).
   * @returns {StoredEvent[]} Array of stored events.
   */
  @callable()
  getEvents(limit = 20): StoredEvent[] {
    const rows = this.db
      .select()
      .from(agentSchema.agentEvents)
      .orderBy(desc(agentSchema.agentEvents.timestamp))
      .limit(limit)
      .all();

    return rows.map((row) => ({
      id: row.id,
      type: row.type as GitHubEventType,
      action: row.action || undefined,
      title: row.title ?? "",
      description: row.description ?? "",
      url: row.url ?? "",
      actor: { login: row.actorLogin ?? "", avatar_url: row.actorAvatar ?? "" },
      repoName: row.repoName || undefined,
      timestamp: row.timestamp,
    }));
  }

  /**
   * @method getStats
   * @description Callable endpoint returning the current state statistics.
   * @returns {OwnerState["stats"]} Current aggregation metrics for the Owner.
   */
  @callable()
  getStats(): OwnerState["stats"] {
      return this.state.stats;
  }
  
  /**
   * @method clearEvents
   * @description Callable endpoint to truncate all events and automation runs from storage.
   */
  @callable()
  clearEvents(): void {
      this.db.delete(agentSchema.automationRuns).run();
      this.db.delete(agentSchema.agentEvents).run();
      this.setState({ ...this.state, lastUpdated: new Date().toISOString() });
  }

  /**
   * @method getAutomationRuns
   * @description Retrieves associated automation runs executed via webhooks.
   * @param {string} eventId - The ID of the primary event that triggered the automation.
   * @returns {Array} Array of historical automation run objects.
   */
  @callable()
  getAutomationRuns(eventId: string): Array<{
    id: string;
    ruleId: string;
    ruleName: string;
    workflow: string;
    eventId: string;
    status: string;
    startedAt: string;
    completedAt?: string;
  }> {
    const rows = this.db
      .select()
      .from(agentSchema.automationRuns)
      .where(eq(agentSchema.automationRuns.eventId, eventId))
      .orderBy(desc(agentSchema.automationRuns.startedAt))
      .all();

    return rows.map((r) => ({
      id: r.id,
      ruleId: r.ruleId,
      ruleName: r.ruleName,
      workflow: r.workflow,
      eventId: r.eventId,
      status: r.status,
      startedAt: r.startedAt,
      completedAt: r.completedAt || undefined,
    }));
  }

  /**
   * @method storeAutomationRun
   * @description Upserts an automation execution record into the SQLite storage.
   * @param {Object} run - Data containing execution metrics for a specific workflow automation.
   */
  storeAutomationRun(run: {
    id: string;
    ruleId: string;
    ruleName: string;
    workflow: string;
    eventId: string;
    status: string;
    startedAt: string;
  }): void {
    this.db
      .insert(agentSchema.automationRuns)
      .values({
        id: run.id,
        ruleId: run.ruleId,
        ruleName: run.ruleName,
        workflow: run.workflow,
        eventId: run.eventId,
        status: run.status,
        startedAt: run.startedAt,
      })
      .onConflictDoUpdate({
        target: agentSchema.automationRuns.id,
        set: {
          ruleId: run.ruleId,
          ruleName: run.ruleName,
          workflow: run.workflow,
          eventId: run.eventId,
          status: run.status,
          startedAt: run.startedAt,
        },
      })
      .run();
  }
}