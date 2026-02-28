import { sqliteTable, text } from "drizzle-orm/sqlite-core";

export const julesJobs = sqliteTable("jules_jobs", {
  sessionId: text("session_id").notNull().primaryKey(),
  repoFullName: text("repo_full_name").notNull(),
  prompt: text("prompt").notNull(),
  status: text("status").notNull(),
});
