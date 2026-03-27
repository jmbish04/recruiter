
import { z } from "zod";

export interface ToolDefinition {
    description: string;
    parameters: z.ZodType<any>;
}

export type ToolResult = any;

export interface ToolSet {
    [key: string]: ToolDefinition;
}

export interface DetailedQuestion {
  query: string;
  cloudflare_bindings_involved: string[];
  node_libs_involved: string[];
  tags: string[];
  relevant_code_files: Array<{
    file_path: string;
    start_line: number;
    end_line: number;
    relation_to_question: string;
  }>;
}

export interface MigrationPillar {
  id: string;
  name: string;
  description: string;
  bindings: string[];
  questions: DetailedQuestion[];
  status?: string;
}

export interface MCPToolCallParams {
  name: string;
  arguments: Record<string, any>;
}

export interface MCPRequest {
  jsonrpc: "2.0";
  method: string;
  params?: any;
  id?: number | string;
}

export interface MCPResponse {
  jsonrpc: "2.0";
  result?: any;
  error?: {
    code: number;
    message: string;
    data?: any;
  };
  id: number | string | null;
}
