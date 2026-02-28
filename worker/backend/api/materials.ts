import { Hono } from "hono";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "../db/schema";
import { eq } from "drizzle-orm";

export const materialsRouter = new Hono<{ Bindings: Env }>();

/**
 * PUT /api/materials/:id
 * 
 * Persists modifications made by the user within the Plate UI 
 * rich-text editor back to the D1 SQLite Application Materials table.
 */
materialsRouter.put("/:id", async (c) => {
  const id = parseInt(c.req.param("id"), 10);
  const body = await c.req.json();
  
  if (!body.content || !Array.isArray(body.content)) {
    return c.json({ error: "Invalid Plate UI content structure" }, 400);
  }

  const db = drizzle(c.env.DB, { schema });
  
  const result = await db.update(schema.applicationMaterials)
    .set({ content: body.content })
    .where(eq(schema.applicationMaterials.id, id))
    .returning();

  if (result.length === 0) {
    return c.json({ error: "Material not found" }, 404);
  }

  return c.json({ success: true, material: result[0] });
});
