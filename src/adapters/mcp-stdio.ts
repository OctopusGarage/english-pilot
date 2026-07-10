import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { handleMcpToolCall, handleMcpToolCallAsync } from './mcp-server.js';
import { listMcpToolDefinitions, type EnglishPilotMcpToolName } from './mcp-tool-registry.js';

export function createMcpServer(): McpServer {
  const server = new McpServer({
    name: 'english-pilot',
    version: '0.1.0',
  });

  for (const tool of listMcpToolDefinitions()) {
    const toolName = tool.name as EnglishPilotMcpToolName;
    server.registerTool(
      toolName,
      {
        description: tool.description,
        inputSchema: tool.inputSchema,
      },
      async (args: Record<string, unknown>) =>
        asTextContent(
          tool.mode === 'async' ? await handleMcpToolCallAsync(toolName, args) : handleMcpToolCall(toolName, args),
        ),
    );
  }

  return server;
}

export async function serveMcpStdio(): Promise<void> {
  const transport = new StdioServerTransport();
  await createMcpServer().connect(transport);
}

function asTextContent(value: unknown): { content: Array<{ type: 'text'; text: string }> } {
  return {
    content: [{ type: 'text', text: JSON.stringify(value, null, 2) }],
  };
}
