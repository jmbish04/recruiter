import { z } from 'zod';
import { Tool } from '@/ai/agent-sdk';

const TABLE_COLUMNS = {
  companies: ['id', 'name', 'career_url', 'job_link_pattern', 'created_at'],
  candidate_profiles: ['id', 'profile_text', 'preferences_text', 'min_score', 'created_at'],
  jobs: [
    'id',
    'company_id',
    'job_url',
    'title',
    'location',
    'salary',
    'compensation',
    'equity',
    'bonus',
    'requirements',
    'benefits',
    'health_benefits',
    'financial_benefits',
    'time_off',
    'description',
    'created_at',
  ],
  job_evaluations: [
    'id',
    'job_id',
    'ai_score',
    'human_overall_score',
    'human_location_score',
    'human_salary_score',
    'human_benefits_score',
    'feedback_notes',
    'evaluated_at',
  ],
  application_materials: ['id', 'job_id', 'type', 'content', 'is_sample_block', 'title', 'created_at'],
  jules_jobs: ['session_id', 'repo_full_name', 'prompt', 'status'],
} as const;

const TABLE_NAMES = [
  'companies',
  'candidate_profiles',
  'jobs',
  'job_evaluations',
  'application_materials',
  'jules_jobs',
] as const;
const SORT_DIRECTIONS = ['asc', 'desc'] as const;
const CONDITION_OPERATORS = ['eq', 'ne', 'gt', 'gte', 'lt', 'lte', 'like', 'in', 'isNull', 'isNotNull'] as const;
const WRITE_ACTIONS = ['insert', 'update', 'delete'] as const;
const DEFAULT_READ_LIMIT = 50;

const ScalarValueSchema = z.union([z.string(), z.number(), z.boolean(), z.null()]);
const ScalarArraySchema = z.array(ScalarValueSchema).min(1);
const ColumnValueSchema = z.union([ScalarValueSchema, ScalarArraySchema]);

const ConditionSchema = z.object({
  column: z.string(),
  operator: z.enum(CONDITION_OPERATORS),
  value: ColumnValueSchema.optional(),
});

const OrderBySchema = z.object({
  column: z.string(),
  direction: z.enum(SORT_DIRECTIONS).default('asc'),
});

type TableName = keyof typeof TABLE_COLUMNS;
type Condition = z.infer<typeof ConditionSchema>;
type ScalarValue = z.infer<typeof ScalarValueSchema>;
type ColumnValue = z.infer<typeof ColumnValueSchema>;

function assertTable(table: string): TableName {
  if (!(table in TABLE_COLUMNS)) {
    throw new Error(`Table "${table}" is not available.`);
  }
  return table as TableName;
}

function assertColumn(table: TableName, column: string): string {
  const allowedColumns = TABLE_COLUMNS[table] as readonly string[];
  if (!allowedColumns.includes(column)) {
    throw new Error(`Column "${column}" is not allowed for table "${table}".`);
  }
  return column;
}

function quoteIdentifier(identifier: string): string {
  return `"${identifier.replace(/"/g, '""')}"`;
}

function requireScalarValue(condition: Condition): ScalarValue {
  if (condition.value === undefined || Array.isArray(condition.value)) {
    throw new Error(`Operator "${condition.operator}" for column "${condition.column}" requires a single value.`);
  }
  return condition.value;
}

function buildCondition(table: TableName, condition: Condition): { sql: string; params: ScalarValue[] } {
  const column = quoteIdentifier(assertColumn(table, condition.column));
  switch (condition.operator) {
    case 'eq':
      return { sql: `${column} = ?`, params: [requireScalarValue(condition)] };
    case 'ne':
      return { sql: `${column} != ?`, params: [requireScalarValue(condition)] };
    case 'gt':
      return { sql: `${column} > ?`, params: [requireScalarValue(condition)] };
    case 'gte':
      return { sql: `${column} >= ?`, params: [requireScalarValue(condition)] };
    case 'lt':
      return { sql: `${column} < ?`, params: [requireScalarValue(condition)] };
    case 'lte':
      return { sql: `${column} <= ?`, params: [requireScalarValue(condition)] };
    case 'like':
      return { sql: `${column} LIKE ?`, params: [requireScalarValue(condition)] };
    case 'in': {
      if (!Array.isArray(condition.value)) {
        throw new Error(`Operator "in" for column "${condition.column}" requires an array value.`);
      }
      if (condition.value.length === 0) {
        throw new Error(`Operator "in" for column "${condition.column}" requires at least one value.`);
      }
      return {
        sql: `${column} IN (${condition.value.map(() => '?').join(', ')})`,
        params: condition.value,
      };
    }
    case 'isNull':
      return { sql: `${column} IS NULL`, params: [] };
    case 'isNotNull':
      return { sql: `${column} IS NOT NULL`, params: [] };
    default:
      throw new Error(`Unsupported operator "${condition.operator}".`);
  }
}

function buildWhereClause(table: TableName, where: Condition[] = []) {
  if (where.length === 0) {
    return { sql: '', params: [] as ScalarValue[] };
  }

  const parts = where.map(condition => buildCondition(table, condition));
  return {
    sql: ` WHERE ${parts.map(part => part.sql).join(' AND ')}`,
    params: parts.flatMap(part => part.params),
  };
}

const readParameters = z.object({
  table: z.enum(TABLE_NAMES).describe('The allowlisted table to read from.'),
  columns: z.array(z.string()).min(1).optional().describe('Optional list of columns to select. Defaults to all columns.'),
  where: z.array(ConditionSchema).optional().describe('Optional AND-filter conditions.'),
  orderBy: OrderBySchema.optional().describe('Optional sort order.'),
  limit: z.number().int().min(1).max(100).optional().describe(`Optional limit between 1 and 100 rows. Defaults to ${DEFAULT_READ_LIMIT}.`),
});

const writeParameters = z.object({
  action: z.enum(WRITE_ACTIONS).describe('The write action to perform.'),
  table: z.enum(TABLE_NAMES).describe('The allowlisted table to modify.'),
  data: z.record(z.string(), ScalarValueSchema).optional().describe('Column values for insert or update operations.'),
  where: z.array(ConditionSchema).optional().describe('AND-filter conditions. Required for update and delete operations.'),
});

function getSelectedColumns(table: TableName, columns?: string[]) {
  if (!columns || columns.length === 0) {
    return TABLE_COLUMNS[table].map(column => quoteIdentifier(column)).join(', ');
  }

  return columns
    .map(column => quoteIdentifier(assertColumn(table, column)))
    .join(', ');
}

function buildInsertStatement(table: TableName, data: Record<string, ScalarValue>) {
  const entries = Object.entries(data);
  if (entries.length === 0) {
    throw new Error('Insert operations require at least one column value.');
  }

  const columns = entries.map(([column]) => quoteIdentifier(assertColumn(table, column)));
  const params = entries.map(([, value]) => value);
  return {
    sql: `INSERT INTO ${quoteIdentifier(table)} (${columns.join(', ')}) VALUES (${entries.map(() => '?').join(', ')})`,
    params,
  };
}

function buildUpdateStatement(table: TableName, data: Record<string, ScalarValue>, where: Condition[]) {
  const entries = Object.entries(data);
  if (entries.length === 0) {
    throw new Error('Update operations require at least one column value.');
  }
  if (where.length === 0) {
    throw new Error('Update operations require at least one filter condition.');
  }

  const assignments = entries.map(([column]) => `${quoteIdentifier(assertColumn(table, column))} = ?`);
  const params = entries.map(([, value]) => value);
  const whereClause = buildWhereClause(table, where);

  return {
    sql: `UPDATE ${quoteIdentifier(table)} SET ${assignments.join(', ')}${whereClause.sql}`,
    params: [...params, ...whereClause.params],
  };
}

function buildDeleteStatement(table: TableName, where: Condition[]) {
  if (where.length === 0) {
    throw new Error('Delete operations require at least one filter condition.');
  }

  const whereClause = buildWhereClause(table, where);
  return {
    sql: `DELETE FROM ${quoteIdentifier(table)}${whereClause.sql}`,
    params: whereClause.params,
  };
}

/**
 * Tool for reading from D1 database via structured, allowlisted queries.
 */
// @ts-ignore Env is global
export const D1ReadTool = (env: Env): Tool => ({
  name: 'd1_read_sql',
  description: 'Read from the D1 database using allowlisted tables, columns, filters, and sorting.',
  parameters: readParameters,
  execute: async ({ table, columns, where = [], orderBy, limit }: z.infer<typeof readParameters>) => {
    try {
      const safeTable = assertTable(table);
      const selectedColumns = getSelectedColumns(safeTable, columns);
      const whereClause = buildWhereClause(safeTable, where);
      const effectiveLimit = limit ?? DEFAULT_READ_LIMIT;
      const orderClause = orderBy
        ? ` ORDER BY ${quoteIdentifier(assertColumn(safeTable, orderBy.column))} ${orderBy.direction.toUpperCase()}`
        : '';
      const limitClause = ' LIMIT ?';
      const params = [...whereClause.params, effectiveLimit];
      const query = `SELECT ${selectedColumns} FROM ${quoteIdentifier(safeTable)}${whereClause.sql}${orderClause}${limitClause}`;
      const { results } = await env.DB.prepare(query).bind(...params).all();
      return results;
    } catch (e: any) {
      return { error: e.message };
    }
  }
});

/**
 * Tool for writing to D1 database via structured, allowlisted queries.
 */
// @ts-ignore Env is global
export const D1WriteTool = (env: Env): Tool => ({
  name: 'd1_write_sql',
  description: 'Modify the D1 database using allowlisted tables, columns, and parameterized filters.',
  parameters: writeParameters,
  execute: async ({ action, table, data = {}, where = [] }: z.infer<typeof writeParameters>) => {
    try {
      const safeTable = assertTable(table);
      let statement;
      switch (action) {
        case 'insert':
          statement = buildInsertStatement(safeTable, data);
          break;
        case 'update':
          statement = buildUpdateStatement(safeTable, data, where);
          break;
        case 'delete':
          statement = buildDeleteStatement(safeTable, where);
          break;
      }

      const result = await env.DB.prepare(statement.sql).bind(...statement.params).run();
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
