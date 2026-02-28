import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi';
import { drizzle } from 'drizzle-orm/d1';
import { eq } from 'drizzle-orm';
import { companies } from '../db/schema';
import { Bindings } from '../index';

const app = new OpenAPIHono<{ Bindings: Bindings }>();

const CompanySchema = z.object({
  id: z.number().openapi({ example: 1 }),
  name: z.string().openapi({ example: 'Cloudflare' }),
  careerUrl: z.string().nullable().openapi({ example: 'https://www.cloudflare.com/careers/' }),
  jobLinkPattern: z.string().nullable().openapi({ example: '/jobs/' }),
});

const CreateCompanySchema = CompanySchema.omit({ id: true });
const UpdateCompanySchema = CreateCompanySchema.partial();

const ListCompaniesRoute = createRoute({
  method: 'get',
  path: '/',
  responses: {
    200: {
      content: {
        'application/json': {
          schema: z.array(CompanySchema),
        },
      },
      description: 'List companies',
    },
  },
});

app.openapi(ListCompaniesRoute, async (c) => {
  const db = drizzle(c.env.DB);
  const result = await db.select().from(companies).all();
  return c.json(result);
});

const CreateCompanyRoute = createRoute({
  method: 'post',
  path: '/',
  request: {
    body: {
      content: {
        'application/json': {
          schema: CreateCompanySchema,
        },
      },
    },
  },
  responses: {
    200: {
      content: {
        'application/json': {
          schema: CompanySchema,
        },
      },
      description: 'Create company',
    },
  },
});

app.openapi(CreateCompanyRoute, async (c) => {
  const db = drizzle(c.env.DB);
  const body = c.req.valid('json');
  const result = await db.insert(companies).values(body).returning().get();
  return c.json(result);
});

const GetCompanyRoute = createRoute({
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
          schema: CompanySchema,
        },
      },
      description: 'Get company',
    },
    404: {
      description: 'Not found',
    },
  },
});

app.openapi(GetCompanyRoute, async (c) => {
  const db = drizzle(c.env.DB);
  const id = parseInt(c.req.param('id'));
  const result = await db.select().from(companies).where(eq(companies.id, id)).get();
  if (!result) return c.json({ error: 'Not found' }, 404);
  return c.json(result);
});


const UpdateCompanyRoute = createRoute({
  method: 'put',
  path: '/:id',
  request: {
    params: z.object({
      id: z.string().transform((v) => parseInt(v)),
    }),
    body: {
      content: {
        'application/json': {
          schema: UpdateCompanySchema,
        },
      },
    },
  },
  responses: {
    200: {
      content: {
        'application/json': {
          schema: CompanySchema,
        },
      },
      description: 'Update company',
    },
     404: {
      description: 'Not found',
    },
  },
});

app.openapi(UpdateCompanyRoute, async (c) => {
  const db = drizzle(c.env.DB);
  const id = parseInt(c.req.param('id'));
  const body = c.req.valid('json');
  const result = await db.update(companies).set(body).where(eq(companies.id, id)).returning().get();
    if (!result) return c.json({ error: 'Not found' }, 404);
  return c.json(result);
});

export default app;
