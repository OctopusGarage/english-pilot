import type { z } from 'zod';

export interface McpToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, z.ZodTypeAny>;
  mode: 'sync' | 'async';
}
