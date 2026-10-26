import type { z } from 'zod/v3';

export type McpToolName = string;

export interface McpToolDefinition {
  name: McpToolName;
  description: string;
  inputSchema: Record<string, z.ZodTypeAny>;
  mode: 'sync' | 'async';
}
