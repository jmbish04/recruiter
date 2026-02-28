import { Hono } from "hono";


const app = new Hono<{ Bindings: Env }>();

app.post('/jules', async (c) => {
    try {
        const body = await c.req.json();
        const { feedback, screenshot, url } = body;

        console.log("Feedback body", body);

        if (!feedback) {
            return c.json({ error: "Missing highly required feedback string." }, 400);
        }

        const env = c.env;
        
        // Spawn the specialized JulesFeedbackAgent DO
        const agentId = env.AGENT_JULES_FEEDBACK.idFromName("global_feedback_router");
        const agentStub = env.AGENT_JULES_FEEDBACK.get(agentId);

        // Dispath the analysis message asynchronously or wait for it
        let responsePayload;
        try {
             responsePayload = await agentStub.onMessage(null, {
                feedback,
                url: url || "Unknown URL",
                screenshot: screenshot || null
            });
        } catch (e: any) {
            console.error("Agent error:", e);
           return c.json({ status: "error", message: e.message }, 500);
        }

        return c.json({ status: "success", data: responsePayload }, 200);

    } catch (e: any) {
        console.error("Failed to parse feedback payload", e);
        return c.json({ error: "Malformed payload." }, 400);
    }
});

export default app;
