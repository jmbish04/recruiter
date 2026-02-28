import { sqliteTable, text, integer, real } from 'drizzle-orm/sqlite-core';

export const companies = sqliteTable('companies', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  website: text('website'),
  careerPageUrl: text('career_page_url').notNull(),
  isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
  lastScannedAt: text('last_scanned_at'),
  createdAt: text('created_at').notNull().default('CURRENT_TIMESTAMP'),
  updatedAt: text('updated_at').notNull().default('CURRENT_TIMESTAMP'),
});

export const jobs = sqliteTable('jobs', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  companyId: integer('company_id').references(() => companies.id).notNull(),
  title: text('title').notNull(),
  description: text('description').notNull(),
  location: text('location'),
  url: text('url').notNull(),
  publishedAt: text('published_at'),
  status: text('status').notNull().default('open'),
  createdAt: text('created_at').notNull().default('CURRENT_TIMESTAMP'),
  updatedAt: text('updated_at').notNull().default('CURRENT_TIMESTAMP'),
});

export const jobScores = sqliteTable('job_scores', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  jobId: integer('job_id').references(() => jobs.id).notNull(),
  overallScore: real('overall_score'),
  locationScore: real('location_score'),
  benefitsScore: real('benefits_score'),
  salaryScore: real('salary_score'),
  aiAnalysis: text('ai_analysis'),
  humanOverallRating: real('human_overall_rating'),
  humanLocationRating: real('human_location_rating'),
  humanBenefitsRating: real('human_benefits_rating'),
  humanSalaryRating: real('human_salary_rating'),
  humanNotes: text('human_notes'),
  status: text('status').notNull().default('pending'), // pending, reviewed, rejected
  createdAt: text('created_at').notNull().default('CURRENT_TIMESTAMP'),
  updatedAt: text('updated_at').notNull().default('CURRENT_TIMESTAMP'),
});

export const preferences = sqliteTable('preferences', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  key: text('key').notNull().unique(), // e.g., min_salary, preferred_locations
  value: text('value').notNull(), // JSON string for complex objects
  createdAt: text('created_at').notNull().default('CURRENT_TIMESTAMP'),
  updatedAt: text('updated_at').notNull().default('CURRENT_TIMESTAMP'),
});

export const userProfile = sqliteTable('user_profile', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  currentTitle: text('current_title'),
  skills: text('skills'), // JSON string array
  experience: text('experience'), // Rich text or JSON
  education: text('education'), // Rich text or JSON
  createdAt: text('created_at').notNull().default('CURRENT_TIMESTAMP'),
  updatedAt: text('updated_at').notNull().default('CURRENT_TIMESTAMP'),
});

export const documents = sqliteTable('documents', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  jobId: integer('job_id').references(() => jobs.id).notNull(),
  type: text('type').notNull(), // 'resume' or 'cover_letter'
  title: text('title').notNull(),
  content: text('content').notNull(), // Plate UI JSON state
  createdAt: text('created_at').notNull().default('CURRENT_TIMESTAMP'),
  updatedAt: text('updated_at').notNull().default('CURRENT_TIMESTAMP'),
});

export const snippets = sqliteTable('snippets', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  title: text('title').notNull(),
  content: text('content').notNull(), // Text block or Plate JSON
  tags: text('tags'), // JSON string array
  createdAt: text('created_at').notNull().default('CURRENT_TIMESTAMP'),
  updatedAt: text('updated_at').notNull().default('CURRENT_TIMESTAMP'),
});
