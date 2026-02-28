

import { Agent, callable } from "agents";
import { BaseAgent } from "./BaseAgent";
import { resolveDefaultAiModel, resolveDefaultAiProvider } from "@/ai/providers/config";

import { runTextAgent } from "@/ai/agent-sdk";

export class Supervisor extends BaseAgent<Env> {
    private static readonly CONTAINER_API_ORIGIN = "http://container:8788";
    private static readonly DEBUG_PORT = 8080;
    private static readonly DEBUG_SESSION_TTL_MS = 60 * 60 * 1000;

    // State
    private sessions: { ws: WebSocket; type: 'terminal' | 'control' }[] = []; // Frontend clients
    private containerWs: WebSocket | null = null; // Connection to Container
    private logs: string[] = [];
    private status: 'idle' | 'running' | 'completed' | 'failed' | 'intervention_needed' = 'idle';
    private startTime: number = 0;
    private healthStatus: any = null;
    private debugSessions = new Map<string, { issuedAt: number; operationId: string; port: number }>();

    constructor(ctx: DurableObjectState, env: Env) {
        super(ctx, env);
        // Restore state if needed, but usually ephemeral for supervision
        this.ctx.blockConcurrencyWhile(async () => {
            const storedLogs = await this.ctx.storage.get<string[]>("logs");
            if (storedLogs) this.logs = storedLogs;
            const storedStatus = await this.ctx.storage.get<string>("status");
            if (storedStatus) this.status = storedStatus as any;
            const storedHealth = await this.ctx.storage.get("healthStatus");
            if (storedHealth) this.healthStatus = storedHealth;
        });
    }

    @callable()
    healthProbe() {
        return {
            status: "ok",
            agent: "Supervisor",
            timestamp: new Date().toISOString(),
            runtimeStatus: this.status,
        };
    }

    async fetch(request: Request): Promise<Response> {
        const url = new URL(request.url);

        // 1. Browser/Frontend Connection (Spectator & Control)
        if (url.pathname === "/websocket") {
            if (request.headers.get("Upgrade") !== "websocket") {
                return new Response("Expected Upgrade: websocket", { status: 426 });
            }
            const pair = new WebSocketPair();
            const [client, server] = Object.values(pair);

            const type = url.searchParams.get("type") === "control" ? "control" : "terminal";

            this.handleSession(server, type);
            return new Response(null, { status: 101, webSocket: client });
        }

        // 2. Container Connection (The Managed Resource)
        // The container connects here to stream logs TO the supervisor
        if (url.pathname === "/connect-container") {
            if (request.headers.get("Upgrade") !== "websocket") {
                return new Response("Expected Upgrade: websocket", { status: 426 });
            }
            const pair = new WebSocketPair();
            const [client, server] = Object.values(pair);

            this.handleContainer(server);
            return new Response(null, { status: 101, webSocket: client });
        }

        // 3. RPC / API
        if (url.pathname === "/status") {
            return Response.json({
                status: this.status,
                startTime: this.startTime,
                logsCount: this.logs.length,
                health: this.healthStatus
            });
        }

        if (request.method === "GET" && url.pathname === "/health-probe") {
            return Response.json(this.healthProbe());
        }

        if (request.method === "POST" && url.pathname === "/start") {
            const body = await request.json() as any;
            return this.startTask(body);
        }

        if (request.method === "POST" && url.pathname === "/kill") {
            return this.killTask();
        }

        if (request.method === "POST" && url.pathname === "/chat") {
            const body = await request.json() as any;
            return this.handleChat(body.message);
        }


        if (request.method === "POST" && url.pathname === "/debug/start") {
            return this.startLiveSurgery(request);
        }

        if (url.pathname.startsWith("/debug/")) {
            return this.handleDebugProxy(request, url);
        }

        // --- Operator Relays ---
        if (request.method === "POST" && url.pathname === "/exec") {
            return this.relayToContainer(request, "/exec");
        }
        if (request.method === "GET" && url.pathname === "/ps") {
            return this.relayToContainer(request, "/ps");
        }
        if (request.method === "POST" && url.pathname === "/fs/read") {
            return this.relayToContainer(request, "/fs/read");
        }
        if (request.method === "POST" && url.pathname === "/fs/write") {
            return this.relayToContainer(request, "/fs/write");
        }
        if (request.method === "POST" && url.pathname === "/kill-process") {
            return this.relayToContainer(request, "/kill"); // Remap to container's /kill
        }

        return new Response("Not Found", { status: 404 });
    }

    // --- Logic ---



    async startTask(params: any): Promise<Response> {
        return Response.json({ error: "Container support temporarily disabled" }, { status: 503 });

    }

    async killTask(): Promise<Response> {
         return Response.json({ error: "Container support temporarily disabled" }, { status: 503 });

    }

    async relayToContainer(req: Request, path: string): Promise<Response> {
        return Response.json({ error: "Container support temporarily disabled" }, { status: 503 });

    }

    private pruneExpiredDebugSessions() {
        const now = Date.now();
        for (const [sessionId, session] of this.debugSessions.entries()) {
            if (now - session.issuedAt > Supervisor.DEBUG_SESSION_TTL_MS) {
                this.debugSessions.delete(sessionId);
            }
        }
    }

    private async startLiveSurgery(request: Request): Promise<Response> {
        return Response.json({ error: "Container support temporarily disabled" }, { status: 503 });

    }

    private async handleDebugProxy(request: Request, url: URL): Promise<Response> {
        return Response.json({ error: "Container support temporarily disabled" }, { status: 503 });

    }

    async handleChat(msg: string): Promise<Response> {
        // Agentic support
        // Broadcast user message to terminal log too for context
        this.broadcast(`[User] ${msg}\n`);

        // Also send to control clients as a chat event
        this.broadcastEvent({ type: 'chat', role: 'user', content: msg });

        try {
            const context = `
            You are a Supervisor Agent ensuring the health of a containerized task.
            Logs:
            ${this.logs.slice(-20).join('\n')}
            
            User Query: ${msg}
            `;

            const reply = await this.processDeepReasoning(context);

            this.broadcast(reply + "\n");
            this.broadcastEvent({ type: 'chat', role: 'ai', content: reply });

            return Response.json({ reply });
        } catch (e) {
            return Response.json({ error: "AI Busy or Failed" });
        }
    }

    // --- Deep Reasoning Logic ---
    async processDeepReasoning(prompt: string): Promise<string> {
        const provider = resolveDefaultAiProvider(this.env as any);
        const model = resolveDefaultAiModel(this.env as any, provider);
        return await runTextAgent({
            env: this.env as any,
            provider,
            model,
            name: "SupervisorReasoning",
            instructions:
                "You are a helpful AI ops assistant. Analyze logs and respond with concise, actionable guidance.",
            input: prompt,
        });
    }

    // --- WebSocket Handling ---

    handleSession(ws: WebSocket, type: 'terminal' | 'control') {
        const session = { ws, type };
        this.sessions.push(session);
        ws.accept();

        if (type === 'terminal') {
            // Send history to terminal
            ws.send(this.logs.join(""));
        } else if (type === 'control') {
            // Send initial status and state
            ws.send(JSON.stringify({ type: 'status', status: this.status, health: this.healthStatus }));
            // Could send chat history here too if we stored it separately
        }

        ws.addEventListener("message", async (msg) => {
            if (type === 'terminal') {
                // Handle client input (like typing in terminal) -> Forward to Container
                if (this.containerWs) {
                    this.containerWs.send(msg.data);
                }
            } else if (type === 'control') {
                // Handle control messages (e.g. Chat from control socket)
                try {
                    const data = JSON.parse(msg.data as string);
                    if (data.type === 'chat') {
                        await this.handleChat(data.message);
                    }
                } catch (e) {
                    console.error("Invalid control message", e);
                }
            }
        });

        ws.addEventListener("close", () => {
            this.sessions = this.sessions.filter(s => s !== session);
        });
    }

    handleContainer(ws: WebSocket) {
        if (this.containerWs) this.containerWs.close();
        this.containerWs = ws;

        ws.accept(); // Connect

        ws.addEventListener("message", (msg) => {
            const text = msg.data.toString();
            this.logs.push(text);
            // Cap logs
            if (this.logs.length > 1000) this.logs.shift();

            this.broadcast(text);
        });

        ws.addEventListener("close", () => {
            this.status = 'completed';
            this.broadcast("\n[Supervisor] Container Disconnected.\n");
            this.broadcastEvent({ type: 'status', status: 'completed' });
            this.saveState();
        });
    }

    broadcast(msg: string) {
        // Broadcast raw text to terminal clients
        this.sessions.filter(s => s.type === 'terminal').forEach(s => s.ws.send(msg));
    }

    broadcastEvent(event: any) {
        // Broadcast JSON events to control clients
        const payload = JSON.stringify(event);
        this.sessions.filter(s => s.type === 'control').forEach(s => s.ws.send(payload));
    }

    async saveState() {
        await this.ctx.storage.put("status", this.status);
        await this.ctx.storage.put("logs", this.logs);
        if (this.healthStatus) await this.ctx.storage.put("healthStatus", this.healthStatus);
    }
}
