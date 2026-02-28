import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi';
import { drizzle } from 'drizzle-orm/d1';
import { eq } from 'drizzle-orm';
import { preferences } from '../db/schema';
import { Bindings } from '../index';

const app = new OpenAPIHono<{ Bindings: Bindings }>();

const PreferenceSchema = z.object({
  id: z.number().openapi({ example: 1 }),
  candidateProfile: z.string().nullable().openapi({ example: 'Senior Developer' }),
  jobPreferences: z.string().nullable().openapi({ example: 'Remote, 50k+' }),
  minScore: z.number().default(80).openapi({ example: 85 }),
});

const CreatePreferenceSchema = PreferenceSchema.omit({ id: true });
const UpdatePreferenceSchema = CreatePreferenceSchema.partial();

const GetPreferencesRoute = createRoute({
  method: 'get',
  path: '/',
  responses: {
    200: {
      content: {
        'application/json': {
          schema: PreferenceSchema.nullable(),
        },
      },
      description: 'Get preferences',
    },
  },
});

app.openapi(GetPreferencesRoute, async (c) => {
  const db = drizzle(c.env.DB);
  const result = await db.select().from(preferences).limit(1).get();
  return c.json(result || null);
});

const CreateOrUpdatePreferencesRoute = createRoute({
  method: 'post',
  path: '/',
  request: {
    body: {
      content: {
        'application/json': {
          schema: CreatePreferenceSchema,
        },
      },
    },
  },
  responses: {
    200: {
      content: {
        'application/json': {
          schema: PreferenceSchema,
        },
      },
      description: 'Create or update preferences',
    },
  },
});

app.openapi(CreateOrUpdatePreferencesRoute, async (c) => {
  const db = drizzle(c.env.DB);
  const body = c.req.valid('json');

  // Check if exists
  const existing = await db.select().from(preferences).limit(1).get();

  if (existing) {
     const result = await db.update(preferences).set(body).where(eq(preferences.id, existing.id)).returning().get();
     return c.json(result);
  } else {
     const result = await db.insert(preferences).values(body).returning().get();
     return c.json(result);
  }
});

export default app;
