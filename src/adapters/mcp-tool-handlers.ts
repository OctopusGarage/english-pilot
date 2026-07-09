import type { IntegrationFetch } from '../integrations/network-sender.js';
import { handleIntegrationMcpTool, handleIntegrationMcpToolAsync } from './mcp-integration-tool-handlers.js';
import { handleLanguageMcpTool } from './mcp-language-tool-handlers.js';
import { handleLearningMcpTool } from './mcp-learning-tool-handlers.js';
import { handleProjectMcpTool } from './mcp-project-tool-handlers.js';
import { handleVoiceMcpToolCall, handleVoiceMcpToolCallAsync } from './mcp-voice-tool-handlers.js';
import type { EnglishPilotMcpToolName } from './mcp-tool-registry.js';

type SyncMcpToolHandler = (
  name: EnglishPilotMcpToolName,
  args: Record<string, unknown>,
) => Record<string, unknown> | undefined;

const syncToolHandlers: SyncMcpToolHandler[] = [
  handleLanguageMcpTool,
  handleProjectMcpTool,
  handleLearningMcpTool,
  handleIntegrationMcpTool,
  handleVoiceMcpToolCall,
];

export function handleMcpToolCall(
  name: EnglishPilotMcpToolName,
  args: Record<string, unknown>,
): Record<string, unknown> {
  for (const handler of syncToolHandlers) {
    const result = handler(name, args);
    if (result) return result;
  }

  throw new Error(`Unknown MCP tool: ${name}`);
}

export interface McpAsyncOptions {
  env?: NodeJS.ProcessEnv;
  fetch?: IntegrationFetch;
}

export async function handleMcpToolCallAsync(
  name: EnglishPilotMcpToolName,
  args: Record<string, unknown>,
  options: McpAsyncOptions = {},
): Promise<Record<string, unknown>> {
  const voiceResult = await handleVoiceMcpToolCallAsync(name, args, options);
  if (voiceResult) return voiceResult;

  const integrationResult = await handleIntegrationMcpToolAsync(name, args, options);
  if (integrationResult) return integrationResult;

  return handleMcpToolCall(name, args);
}
