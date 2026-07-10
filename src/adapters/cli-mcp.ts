import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { getEnglishPilotHome } from '../core/config.js';
import type { CliResult } from './cli-types.js';

export interface McpClientConfig {
  mcpServers: {
    'english-pilot': {
      command: string;
      args: string[];
    };
  };
}

export function runMcp(args: string[]): CliResult {
  const [subcommand] = args;
  if (subcommand !== 'config') {
    return usage();
  }

  const config = buildMcpClientConfig();
  if (args.includes('--write')) {
    const path = getMcpClientConfigPath();
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, `${JSON.stringify(config, null, 2)}\n`, 'utf8');
    const payload = { written: true, path, config };
    return {
      exitCode: 0,
      stdout: args.includes('--json') ? `${JSON.stringify(payload, null, 2)}\n` : `Wrote MCP config: ${path}\n`,
      stderr: '',
    };
  }

  return {
    exitCode: 0,
    stdout: args.includes('--json') ? `${JSON.stringify(config, null, 2)}\n` : `${JSON.stringify(config, null, 2)}\n`,
    stderr: '',
  };
}

export function buildMcpClientConfig(): McpClientConfig {
  return {
    mcpServers: {
      'english-pilot': {
        command: 'english-pilot',
        args: ['serve', '--mcp'],
      },
    },
  };
}

export function getMcpClientConfigPath(): string {
  return join(getEnglishPilotHome(), 'mcp.json');
}

function usage(): CliResult {
  return {
    exitCode: 1,
    stdout: '',
    stderr: 'Usage: english-pilot mcp config [--write] [--json]\n',
  };
}
