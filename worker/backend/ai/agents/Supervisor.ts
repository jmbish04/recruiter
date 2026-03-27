import { callable } from "agents";
import { BaseAgent } from "./BaseAgent";
import { resolveDefaultAiModel, resolveDefaultAiProvider } from "@/ai/providers/config";

import { runTextAgent } from "@/ai/agent-sdk";

export class Supervisor extends BaseAgent<Env> {
    private sessions: { ws: WebSocket; type: 'terminal' | 'control' }[] = [];
    private containerWs: WebSocket | null = null;
    private logs: string[] = [];
    private status: 'idle' | 'running' | 'completed' | 'failed' | 'intervention_needed' = 'idle';
    private startTime: number = 0;
    private healthStatus: any = null;

    constructor(ctx: DurableObjectState, env: Env) {
        super(ctx, env);
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

        if (url.pathname === "/connect-container") {
            if (request.headers.get("Upgrade") !== "websocket") {
                return new Response("Expected Upgrade: websocket", { status: 426 });
            }
            const pair = new WebSocketPair();
            const [client, server] = Object.values(pair);

            this.handleContainer(server);
            return new Response(null, { status: 101, webSocket: client });
        }

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

    async startTask(params: any): Promise<Response> {
        return Response.json({ error: "Container support temporarily disabled" }, { status: 503 });

    }

    async killTask(): Promise<Response> {
         return Response.json({ error: "Container support temporarily disabled" }, { status: 503 });

    }

    async relayToContainer(req: Request, path: string): Promise<Response> {
        return Response.json({ error: "Container support temporarily disabled" }, { status: 503 });

    }
    private async startLiveSurgery(_request: Request): Promise<Response> {
        return Response.json({ error: "Container support temporarily disabled" }, { status: 503 });

    }

    private async handleDebugProxy(_request: Request, _url: URL): Promise<Response> {
        return Response.json({ error: "Container support temporarily disabled" }, { status: 503 });

    }

    async handleChat(msg: string): Promise<Response> {
        this.broadcast(`[User] ${msg}\n`);

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

    handleSession(ws: WebSocket, type: 'terminal' | 'control') {
        const session = { ws, type };
        this.sessions.push(session);
        ws.accept();

        if (type === 'terminal') {
            ws.send(this.logs.join(""));
        } else if (type === 'control') {
            ws.send(JSON.stringify({ type: 'status', status: this.status, health: this.healthStatus }));
        }

        ws.addEventListener("message", async (msg) => {
            if (type === 'terminal') {
                if (this.containerWs) {
                    this.containerWs.send(msg.data);
                }
            } else if (type === 'control') {
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

        ws.accept();

        ws.addEventListener("message", (msg) => {
            const text = msg.data.toString();
            this.logs.push(text);
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
        this.sessions.filter(s => s.type === 'terminal').forEach(s => s.ws.send(msg));
    }

    broadcastEvent(event: any) {
        const payload = JSON.stringify(event);
        this.sessions.filter(s => s.type === 'control').forEach(s => s.ws.send(payload));
    }

    async saveState() {
        await this.ctx.storage.put("status", this.status);
        await this.ctx.storage.put("logs", this.logs);
        if (this.healthStatus) await this.ctx.storage.put("healthStatus", this.healthStatus);
    }
}
