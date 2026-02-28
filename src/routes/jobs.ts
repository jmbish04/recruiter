import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi';
import { drizzle } from 'drizzle-orm/d1';
import { eq } from 'drizzle-orm';
import { jobs } from '../db/schema';
import { Bindings } from '../index';

const app = new OpenAPIHono<{ Bindings: Bindings }>();

const JobSchema = z.object({
  id: z.number().openapi({ example: 1 }),
  companyId: z.number().nullable().openapi({ example: 1 }),
  jobUrl: z.string().nullable().openapi({ example: 'https://example.com/job/1' }),
  title: z.string().nullable().openapi({ example: 'Software Engineer' }),
  location: z.string().nullable().openapi({ example: 'Remote' }),
  salary: z.string().nullable().openapi({ example: '50k' }),
  compensation: z.string().nullable(),
  equity: z.string().nullable(),
  bonus: z.string().nullable(),
  requirements: z.string().nullable(),
  benefits: z.string().nullable(),
  healthBenefits: z.string().nullable(),
  financialBenefits: z.string().nullable(),
  timeOff: z.string().nullable(),
  description: z.string().nullable(),
  lastSeenDate: z.string().nullable(),
  relevancyScore: z.number().default(0),
  processedForResume: z.boolean().default(false),
});

const CreateJobSchema = JobSchema.omit({ id: true });
const UpdateJobSchema = CreateJobSchema.partial();

const ListJobsRoute = createRoute({
  method: 'get',
  path: '/',
  responses: {
    200: {
      content: {
        'application/json': {
          schema: z.array(JobSchema),
        },
      },
      description: 'List jobs',
    },
  },
});

app.openapi(ListJobsRoute, async (c) => {
  const db = drizzle(c.env.DB);
  const result = await db.select().from(jobs).all();
  return c.json(result);
});

const CreateJobRoute = createRoute({
  method: 'post',
  path: '/',
  request: {
    body: {
      content: {
        'application/json': {
          schema: CreateJobSchema,
        },
      },
    },
  },
  responses: {
    200: {
      content: {
        'application/json': {
          schema: JobSchema,
        },
      },
      description: 'Create job',
    },
  },
});

app.openapi(CreateJobRoute, async (c) => {
  const db = drizzle(c.env.DB);
  const body = c.req.valid('json');
  try {
    const result = await db.insert(jobs).values(body).returning().get();
    return c.json(result);
  } catch (e) {
    return c.json({ error: e instanceof Error ? e.message : 'Unknown error' }, 400);
  }
});

const GetJobRoute = createRoute({
  method: 'get',
  path: '/:id',
  request: {
    params: z.object({
      id: z.string().transform((v) => parseInt(v)),
    }),
  },
  responses: {
    200: {
      content: {
        'application/json': {
          schema: JobSchema,
        },
      },
      description: 'Get job',
    },
    404: {
      description: 'Not found',
    },
  },
});

app.openapi(GetJobRoute, async (c) => {
  const db = drizzle(c.env.DB);
  const id = parseInt(c.req.param('id'));
  const result = await db.select().from(jobs).where(eq(jobs.id, id)).get();
  if (!result) return c.json({ error: 'Not found' }, 404);
  return c.json(result);
});

const UpdateJobRoute = createRoute({
  method: 'put',
  path: '/:id',
  request: {
    params: z.object({
      id: z.string().transform((v) => parseInt(v)),
    }),
    body: {
      content: {
        'application/json': {
          schema: UpdateJobSchema,
        },
      },
    },
  },
  responses: {
    200: {
      content: {
        'application/json': {
          schema: JobSchema,
        },
      },
      description: 'Update job',
    },
    404: {
      description: 'Not found',
    },
  },
});

app.openapi(UpdateJobRoute, async (c) => {
  const db = drizzle(c.env.DB);
  const id = parseInt(c.req.param('id'));
  const body = c.req.valid('json');
  const result = await db.update(jobs).set(body).where(eq(jobs.id, id)).returning().get();
  if (!result) return c.json({ error: 'Not found' }, 404);
  return c.json(result);
});

export default app;
