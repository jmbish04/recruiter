import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi';
import { drizzle } from 'drizzle-orm/d1';
import { swaggerUI } from '@hono/swagger-ui';
import * as schema from '../../db/schemas/index';
import { bearerAuth } from 'hono/bearer-auth';

type Bindings = {
  DB: D1Database;
  AI: Ai; // Use Ai type for Cloudflare Workers AI binding
  API_KEY: string;
};

export const api = new OpenAPIHono<{ Bindings: Bindings }>();

// Simple auth middleware for API routes
api.use('/companies/*', (c, next) => {
  const token = c.env.API_KEY || 'default-secret-key';
  return bearerAuth({ token })(c, next);
});

const companySchema = z.object({
  id: z.number().openapi({ example: 1 }),
  name: z.string().openapi({ example: 'Tech Corp' }),
  website: z.string().nullable().openapi({ example: 'https://techcorp.com' }),
  careerPageUrl: z.string().openapi({ example: 'https://techcorp.com/careers' }),
  isActive: z.boolean().openapi({ example: true }),
  lastScannedAt: z.string().nullable().openapi({ example: '2023-01-01T00:00:00Z' }),
});

api.openapi(
  createRoute({
    method: 'get',
    path: '/companies',
    security: [{ bearerAuth: [] }],
    responses: {
      200: {
        description: 'List of companies',
        content: { 'application/json': { schema: z.array(companySchema) } }
      }
    }
  }),
  async (c) => {
    const db = drizzle(c.env.DB, { schema });
    const companies = await db.select().from(schema.companies).all();
    return c.json(companies);
  }
);

api.openapi(
  createRoute({
    method: 'post',
    path: '/companies',
    security: [{ bearerAuth: [] }],
    request: {
      body: {
        content: { 'application/json': { schema: companySchema.omit({ id: true }) } },
      },
    },
    responses: {
      201: {
        description: 'Created company',
        content: { 'application/json': { schema: companySchema } }
      }
    }
  }),
  async (c) => {
    const data = c.req.valid('json');
    const db = drizzle(c.env.DB, { schema });
    const result = await db.insert(schema.companies).values(data).returning().get();
    return c.json(result, 201);
  }
);

api.doc('/doc', {
  openapi: '3.0.0',
  info: { version: '1.0.0', title: 'Job Scraper API' },
});
api.get('/ui', swaggerUI({ url: '/api/doc' }));
