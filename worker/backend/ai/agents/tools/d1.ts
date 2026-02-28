import { z } from 'zod';
import { Tool } from '@/ai/agent-sdk';

function validateQuery(query: string, allowedTypes: string[]) {
  const upper = query.trim().toUpperCase();
  if (!allowedTypes.some(type => upper.startsWith(type))) {
    throw new Error(`Query must start with one of: ${allowedTypes.join(', ')}`);
  }
  // Prevent statement stacking vulnerabilities
  if (query.indexOf(';') !== -1 && query.indexOf(';') !== query.length - 1) {
    throw new Error('Multiple statements are not allowed for security reasons.');
  }
}

/**
 * Tool for reading from D1 database via SQL.
 */
// @ts-ignore Env is global
export const D1ReadTool = (env: Env): Tool => ({
  name: 'd1_read_sql',
  description: 'Execute a SELECT query against the D1 database. Use this to retrieve data. Valid SQL only.',
  parameters: z.object({
    query: z.string().describe('The SELECT SQL query to execute. MUST use ? for parameters and pass them in params array to prevent SQL injection.'),
    params: z.array(z.union([z.string(), z.number(), z.boolean()])).optional().describe('Optional parameters for the query.')
  }),
  execute: async ({ query, params = [] }: { query: string; params?: any[] }) => {
    try {
      validateQuery(query, ['SELECT']);
      // Always bind explicitly to enforce parameterization
      const stmt = env.DB.prepare(query).bind(...params);
      const { results } = await stmt.all();
      return results;
    } catch (e: any) {
      return { error: e.message };
    }
  }
});

/**
 * Tool for writing to D1 database via SQL.
 */
// @ts-ignore Env is global
export const D1WriteTool = (env: Env): Tool => ({
  name: 'd1_write_sql',
  description: 'Execute an INSERT, UPDATE, or DELETE query against the D1 database. MUST use parameterized queries (?).',
  parameters: z.object({
    query: z.string().describe('The SQL query to execute (INSERT, UPDATE, DELETE). MUST use ? placeholders to prevent SQL injection.'),
    params: z.array(z.union([z.string(), z.number(), z.boolean()])).optional().describe('Optional parameters for the query.')
  }),
  execute: async ({ query, params = [] }: { query: string; params?: any[] }) => {
    try {
      validateQuery(query, ['INSERT', 'UPDATE', 'DELETE']);
      const stmt = env.DB.prepare(query).bind(...params);
      const result = await stmt.run();
      return {
        success: result.success,
        meta: result.meta,
        error: result.error
      };
    } catch (e: any) {
      return { error: e.message, success: false };
    }
  }
});
