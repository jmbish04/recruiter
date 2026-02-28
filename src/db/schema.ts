import { sqliteTable, integer, text } from 'drizzle-orm/sqlite-core';

export const companies = sqliteTable('companies', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name'),
  careerUrl: text('career_url'),
  jobLinkPattern: text('job_link_pattern'),
});

export const preferences = sqliteTable('preferences', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  candidateProfile: text('candidate_profile'),
  jobPreferences: text('job_preferences'),
  minScore: integer('min_score').default(80),
});

export const jobs = sqliteTable('jobs', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  companyId: integer('company_id').references(() => companies.id),
  jobUrl: text('job_url').unique(),
  title: text('title'),
  location: text('location'),
  salary: text('salary'),
  compensation: text('compensation'),
  equity: text('equity'),
  bonus: text('bonus'),
  requirements: text('requirements'),
  benefits: text('benefits'),
  healthBenefits: text('health_benefits'),
  financialBenefits: text('financial_benefits'),
  timeOff: text('time_off'),
  description: text('description'),
  lastSeenDate: text('last_seen_date'),
  relevancyScore: integer('relevancy_score').default(0),
  processedForResume: integer('processed_for_resume', { mode: 'boolean' }).default(false),
});
