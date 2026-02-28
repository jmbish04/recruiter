import { sqliteTable, text, integer, real } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

export const companies = sqliteTable("companies", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  careerUrl: text("career_url").notNull(),
  jobLinkPattern: text("job_link_pattern").notNull(),
  createdAt: text("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const candidateProfiles = sqliteTable("candidate_profiles", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  profileText: text("profile_text").notNull(),
  preferencesText: text("preferences_text").notNull(),
  minScore: integer("min_score").default(60).notNull(),
  createdAt: text("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const jobs = sqliteTable("jobs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  companyId: integer("company_id")
    .references(() => companies.id, { onDelete: "cascade" })
    .notNull(),
  jobUrl: text("job_url").notNull().unique(),
  title: text("title").notNull(),
  location: text("location"),
  salary: text("salary"),
  compensation: text("compensation"),
  equity: text("equity"),
  bonus: text("bonus"),
  requirements: text("requirements", { mode: "json" }),
  benefits: text("benefits", { mode: "json" }),
  healthBenefits: text("health_benefits", { mode: "json" }),
  financialBenefits: text("financial_benefits", { mode: "json" }),
  timeOff: text("time_off"),
  description: text("description"),
  createdAt: text("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const jobEvaluations = sqliteTable("job_evaluations", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  jobId: integer("job_id")
    .references(() => jobs.id, { onDelete: "cascade" })
    .notNull()
    .unique(),
  aiScore: integer("ai_score"),
  humanOverallScore: integer("human_overall_score"),
  humanLocationScore: integer("human_location_score"),
  humanSalaryScore: integer("human_salary_score"),
  humanBenefitsScore: integer("human_benefits_score"),
  feedbackNotes: text("feedback_notes"),
  evaluatedAt: text("evaluated_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const applicationMaterials = sqliteTable("application_materials", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  jobId: integer("job_id").references(() => jobs.id, { onDelete: "cascade" }),
  type: text("type", { enum: ["resume", "cover_letter"] }).notNull(),
  content: text("content", { mode: "json" }).notNull(), // Plate UI JSON structure
  isSampleBlock: integer("is_sample_block", { mode: "boolean" }).default(false).notNull(),
  title: text("title"), // Name of the sample block or draft version
  createdAt: text("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});
