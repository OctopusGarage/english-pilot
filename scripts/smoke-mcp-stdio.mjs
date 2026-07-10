#!/usr/bin/env node
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(scriptDir, '..');
const cliPath = join(repoRoot, 'dist', 'src', 'bin', 'english-pilot.js');
const home = await mkdtemp(join(tmpdir(), 'english-pilot-mcp-stdio-'));
const stderrChunks = [];

const transport = new StdioClientTransport({
  command: process.execPath,
  args: [cliPath, 'serve', '--mcp'],
  cwd: repoRoot,
  env: {
    ...definedEnv(process.env),
    ENGLISH_PILOT_HOME: home,
  },
  stderr: 'pipe',
});

if (transport.stderr) {
  transport.stderr.on('data', (chunk) => {
    stderrChunks.push(Buffer.from(chunk).toString('utf8'));
  });
}

const client = new Client({
  name: 'english-pilot-mcp-stdio-smoke',
  version: '0.0.0',
});

try {
  await client.connect(transport);

  const tools = await client.listTools();
  const toolNames = tools.tools.map((tool) => tool.name);
  assertIncludes(toolNames, 'english_learning_brief', 'MCP tool list should include english_learning_brief.');
  assertIncludes(toolNames, 'english_input_history', 'MCP tool list should include english_input_history.');
  assertIncludes(toolNames, 'english_voice_preflight', 'MCP tool list should include english_voice_preflight.');

  const result = await client.callTool({
    name: 'english_learning_brief',
    arguments: {
      limit: 5,
    },
  });
  const text = result.content.find((item) => item.type === 'text')?.text;
  if (!text) throw new Error('english_learning_brief returned no text content.');
  const payload = JSON.parse(text);
  if (!String(payload.teachingPrompt ?? '').includes('EnglishPilot learning brief')) {
    throw new Error('english_learning_brief did not return an agent-ready teaching prompt.');
  }

  console.log(
    JSON.stringify(
      {
        operation: 'english-pilot-mcp-stdio-smoke',
        passed: true,
        toolCount: toolNames.length,
        checkedTools: ['english_learning_brief', 'english_input_history', 'english_voice_preflight'],
      },
      null,
      2,
    ),
  );
} catch (error) {
  console.error(
    JSON.stringify(
      {
        operation: 'english-pilot-mcp-stdio-smoke',
        passed: false,
        error: error instanceof Error ? error.message : String(error),
        stderr: stderrChunks.join('').trim(),
      },
      null,
      2,
    ),
  );
  process.exitCode = 1;
} finally {
  await client.close().catch(() => {});
  await rm(home, { recursive: true, force: true }).catch(() => {});
}

function assertIncludes(values, expected, message) {
  if (!values.includes(expected)) throw new Error(message);
}

function definedEnv(env) {
  return Object.fromEntries(Object.entries(env).filter((entry) => entry[1] !== undefined));
}
