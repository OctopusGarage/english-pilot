import {
  invokeMcpTool,
  invokeMcpToolAsync,
  type EnglishPilotMcpToolName,
  type McpAsyncOptions,
} from './mcp-tool-catalog.js';

export type { McpAsyncOptions } from './mcp-tool-catalog.js';

export function handleMcpToolCall(
  name: EnglishPilotMcpToolName,
  args: Record<string, unknown>,
): Record<string, unknown> {
  return invokeMcpTool(name, args);
}

export async function handleMcpToolCallAsync(
  name: EnglishPilotMcpToolName,
  args: Record<string, unknown>,
  options: McpAsyncOptions = {},
): Promise<Record<string, unknown>> {
  return invokeMcpToolAsync(name, args, options);
}
