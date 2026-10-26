import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { describe, expect, it } from 'vitest';
import { z } from 'zod/v3';
import { createMcpServer } from '../../src/adapters/mcp-stdio.js';
import { learningMcpToolDefinitions } from '../../src/adapters/mcp-tools-learning.js';

const tagTools = ['english_record_learning_item', 'english_notes_history', 'english_update_review_item'];

describe('MCP tag validation security', () => {
  it.each(tagTools)('bounds malformed-array errors before dispatch for %s', async (name) => {
    const server = createMcpServer();
    const client = new Client({ name: 'input-security-regression', version: '1' });
    const [serverTransport, clientTransport] = InMemoryTransport.createLinkedPair();
    try {
      await server.connect(serverTransport);
      await client.connect(clientTransport);
      const result = await client.callTool({
        name,
        arguments: {
          original: 'original',
          suggested: 'suggested',
          id: 'missing-item',
          tags: Array(20_000).fill({ secret: 'do-not-echo-invalid-input' }),
        },
      });
      expect(result.isError).toBe(true);
      const response = JSON.stringify(result);
      expect(response.length).toBeLessThan(1_000);
      expect(response).not.toContain('do-not-echo-invalid-input');
      // A validation failure must leave the connection available for later calls.
      const tools = (await client.listTools()).tools;
      expect(tools).toHaveLength(59);
      expect(tools.find((tool) => tool.name === name)?.inputSchema.properties?.tags).toEqual({
        type: 'array',
        items: { type: 'string' },
      });
    } finally {
      await client.close();
      await server.close();
    }
  });

  it.each(tagTools)('preserves the advertised schema and all valid tag lengths for %s', (name) => {
    const tool = learningMcpToolDefinitions.find((definition) => definition.name === name)!;
    const tags = (tool.inputSchema as Record<string, z.ZodTypeAny>).tags;
    for (const value of [undefined, [], ['work', '', 'work'], Array(20_000).fill('work')]) {
      expect(tags.parse(value)).toEqual(value);
    }
    for (const value of [null, 'work', [1], ['work', null], new Array(20_000)]) {
      expect(tags.safeParse(value).success).toBe(false);
    }
  });
});
