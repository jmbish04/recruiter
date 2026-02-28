import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi';
import { swaggerUI } from '@hono/swagger-ui';
import { apiReference } from '@scalar/hono-api-reference';
import { drizzle } from 'drizzle-orm/d1';
import * as schema from './db/schema';
import { eq } from 'drizzle-orm';

export type Env = {
  DB: D1Database;
  AI: any;
};

const app = new OpenAPIHono<{ Bindings: Env }>();

// ---------------------------------------------------------
// Standard Endpoints (Health, Context, Docs)
// ---------------------------------------------------------

app.openapi(createRoute({
  operationId: 'getHealth',
  method: 'get',
  path: '/health',
  responses: { 200: { description: 'Health check', content: { 'application/json': { schema: z.object({ status: z.string(), timestamp: z.string() }) } } } }
}), (c) => c.json({ status: 'ok', timestamp: new Date().toISOString() }));

app.openapi(createRoute({
  operationId: 'getContext',
  method: 'get',
  path: '/context',
  responses: { 200: { description: 'Deployment context', content: { 'application/json': { schema: z.object({ env: z.string(), framework: z.string() }) } } } }
}), (c) => c.json({ env: 'production', framework: 'Hono + Astro Worker Assets' }));

app.doc('/openapi.json', {
  openapi: '3.1.0',
  info: { title: 'Codex AI Job Platform API', version: '1.0.0' },
});
app.get('/swagger', swaggerUI({ url: '/openapi.json' }));
app.get('/scalar', apiReference({ spec: { url: '/openapi.json' }, theme: 'purple' }));
app.get('/docs', (c) => c.redirect('/scalar'));

// ---------------------------------------------------------
// Job Platform Endpoints
// ---------------------------------------------------------

app.openapi(createRoute({
  operationId: 'getPreferences',
  method: 'get',
  path: '/api/preferences',
  responses: { 200: { description: 'Get System Preferences', content: { 'application/json': { schema: z.any() } } } }
}), async (c) => {
  const db = drizzle(c.env.DB, { schema });
  const prefs = await db.query.preferences.findFirst();
  return c.json(prefs || {});
});

const JobSchema = z.object({
  companyId: z.number(),
  jobUrl: z.string().url(),
  title: z.string(),
  location: z.string(),
  salary: z.string(),
  description: z.string()
});

app.openapi(createRoute({
  operationId: 'upsertJob',
  method: 'post',
  path: '/api/jobs',
  request: { body: { content: { 'application/json': { schema: JobSchema } } } },
  responses: { 200: { description: 'Job Upserted', content: { 'application/json': { schema: z.any() } } } }
}), async (c) => {
  const db = drizzle(c.env.DB, { schema });
  const data = await c.req.json();

  const existing = await db.query.jobs.findFirst({ where: eq(schema.jobs.jobUrl, data.jobUrl) });

  if (existing) {
    await db.update(schema.jobs).set({
      title: data.title,
      location: data.location,
      salary: data.salary,
      description: data.description,
      lastSeenDate: new Date().toISOString()
    }).where(eq(schema.jobs.id, existing.id));
    return c.json({ id: existing.id, status: 'updated' });
  } else {
    const result = await db.insert(schema.jobs).values({
      ...data,
      lastSeenDate: new Date().toISOString()
    }).returning();
    return c.json({ id: result[0].id, status: 'created' });
  }
});

const AiPromptSchema = z.object({
  prompt: z.string(),
  system: z.string().optional()
});

app.openapi(createRoute({
  operationId: 'runAi',
  method: 'post',
  path: '/api/ai',
  request: { body: { content: { 'application/json': { schema: AiPromptSchema } } } },
  responses: { 200: { description: 'Workers AI Execution', content: { 'application/json': { schema: z.any() } } } }
}), async (c) => {
  const { prompt, system } = await c.req.json();

  const messages = [];
  if (system) messages.push({ role: 'system', content: system });
  messages.push({ role: 'user', content: prompt });

  // Native AI Binding (Assumes AI Gateway is configured in CF Dashboard for this binding)
  const response = await c.env.AI.run('@cf/meta/llama-3.1-8b-instruct', { messages });
  return c.json({ response: response.response });
});

export default app;
