import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';

export const companies = sqliteTable('companies', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  careerUrl: text('career_url').notNull(),
  jobLinkPattern: text('job_link_pattern').notNull()
});

export const preferences = sqliteTable('preferences', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  candidateProfile: text('candidate_profile').notNull(),
  jobPreferences: text('job_preferences').notNull(),
  minScore: integer('min_score').default(80)
});

export const jobs = sqliteTable('jobs', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  companyId: integer('company_id').references(() => companies.id),
  jobUrl: text('job_url').notNull().unique(),
  title: text('title').notNull(),
  location: text('location').notNull(),
  salary: text('salary').notNull(),
  description: text('description').notNull(),
  lastSeenDate: text('last_seen_date').notNull(),
  relevancyScore: integer('relevancy_score').default(0),
  processedForResume: integer('processed_for_resume', { mode: 'boolean' }).default(false)
});
