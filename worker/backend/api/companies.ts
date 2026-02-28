import { Hono } from "hono";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "../db/schema";
import { eq } from "drizzle-orm";

export const companiesRouter = new Hono<{ Bindings: Env }>();

companiesRouter.get("/", async (c) => {
  const db = drizzle(c.env.DB, { schema });
  const companies = await db.query.companies.findMany({
    orderBy: (companies, { desc }) => [desc(companies.createdAt)]
  });
  return c.json(companies);
});

companiesRouter.post("/", async (c) => {
  const body = await c.req.json();
  const db = drizzle(c.env.DB, { schema });
  
  const result = await db.insert(schema.companies).values({
    name: body.name,
    careerUrl: body.careerUrl,
    jobLinkPattern: body.jobLinkPattern
  }).returning();

  return c.json(result[0], 201);
});

companiesRouter.delete("/:id", async (c) => {
  const id = parseInt(c.req.param("id"), 10);
  const db = drizzle(c.env.DB, { schema });
  
  await db.delete(schema.companies).where(eq(schema.companies.id, id));
  
  return c.json({ success: true });
});
