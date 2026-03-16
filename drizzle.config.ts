import type { Config } from "drizzle-kit";

export default {
  schema: "./src/db/schemas/index.ts",
  out: "./drizzle",
  driver: "d1",
  dbCredentials: {
    wranglerConfigPath: "wrangler.json",
    dbName: "2026-recruiter"
  }
} satisfies Config;
