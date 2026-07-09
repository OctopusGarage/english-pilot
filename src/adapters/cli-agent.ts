import { loadConfig } from '../core/config.js';
import {
  buildExternalAgentInvocation,
  formatExternalAgentRunResult,
  runExternalAgent,
  type ExternalAgentBackend,
} from '../agent/runner.js';
import type { CliResult } from './cli-types.js';

export function runAgent(args: string[], stdin: string): CliResult {
  const [subcommand] = args;
  if (subcommand === 'doctor') {
    try {
      const config = loadConfig();
      const report = {
        backend: config.externalAgentBackend,
        configured: config.externalAgentBackend !== 'off',
        cwd: config.externalAgentCwd || process.cwd(),
        timeoutMs: config.externalAgentTimeoutMs,
        claudeBinary: config.externalAgentClaudeBinary,
        codexBinary: config.externalAgentCodexBinary,
        codexSandbox: config.externalAgentCodexSandbox,
      };
      return {
        exitCode: report.configured ? 0 : 1,
        stdout: args.includes('--json') ? `${JSON.stringify(report, null, 2)}\n` : formatAgentDoctor(report),
        stderr: '',
      };
    } catch (error) {
      return errorResult(error);
    }
  }

  if (subcommand === 'run') {
    if (args.includes('--dry-run')) {
      return runAgentDryRun(args, stdin);
    }
    return {
      exitCode: 1,
      stdout: '',
      stderr: 'Use runCliAsync for `english-pilot agent run`, or run the installed english-pilot binary directly.\n',
    };
  }

  return {
    exitCode: 1,
    stdout: '',
    stderr: agentUsage(),
  };
}

export async function runAgentRunAsync(args: string[], stdin: string): Promise<CliResult> {
  try {
    const config = loadConfig();
    const prompt = getAgentPrompt(args.slice(1), stdin);
    if (!prompt.trim()) {
      return {
        exitCode: 1,
        stdout: '',
        stderr: agentRunUsage(),
      };
    }
    const result = await runExternalAgent({
      config,
      prompt,
      backend: parseExternalAgentBackend(getFlagValue(args, '--backend')),
      cwd: getFlagValue(args, '--cwd'),
      timeoutMs: parseOptionalPositiveInteger(getFlagValue(args, '--timeout-ms'), 'timeout-ms'),
      dryRun: args.includes('--dry-run'),
    });
    return {
      exitCode: result.exitCode === 0 ? 0 : (result.exitCode ?? 1),
      stdout: args.includes('--json') ? `${JSON.stringify(result, null, 2)}\n` : formatExternalAgentRunResult(result),
      stderr: '',
    };
  } catch (error) {
    return errorResult(error);
  }
}

function runAgentDryRun(args: string[], stdin: string): CliResult {
  const runArgs = args.slice(1);
  const prompt = getAgentPrompt(runArgs, stdin);
  if (!prompt.trim()) {
    return {
      exitCode: 1,
      stdout: '',
      stderr: agentRunUsage(),
    };
  }
  try {
    const config = loadConfig();
    const invocation = {
      config,
      prompt,
      backend: parseExternalAgentBackend(getFlagValue(args, '--backend')),
      cwd: getFlagValue(args, '--cwd'),
      timeoutMs: parseOptionalPositiveInteger(getFlagValue(args, '--timeout-ms'), 'timeout-ms'),
      dryRun: true,
    };
    return runAgentDryRunResult(invocation, args.includes('--json'));
  } catch (error) {
    return errorResult(error);
  }
}

function runAgentDryRunResult(options: Parameters<typeof runExternalAgent>[0], json: boolean): CliResult {
  const invocation = buildExternalAgentInvocation(options);
  const result = {
    operation: 'external-agent-run' as const,
    ...invocation,
    dryRun: true,
    exitCode: 0,
    stdout: '',
    stderr: '',
  };
  return {
    exitCode: 0,
    stdout: json ? `${JSON.stringify(result, null, 2)}\n` : formatExternalAgentRunResult(result),
    stderr: '',
  };
}

function formatAgentDoctor(report: {
  backend: string;
  configured: boolean;
  cwd: string;
  timeoutMs: number;
  claudeBinary: string;
  codexBinary: string;
  codexSandbox: string;
}): string {
  return [
    'External agent runtime',
    `Configured: ${report.configured ? 'yes' : 'no'}`,
    `Backend: ${report.backend}`,
    `Cwd: ${report.cwd}`,
    `Timeout: ${report.timeoutMs}ms`,
    `Claude binary: ${report.claudeBinary}`,
    `Codex binary: ${report.codexBinary}`,
    `Codex sandbox: ${report.codexSandbox}`,
    '',
  ].join('\n');
}

function agentUsage(): string {
  return [
    'Usage:',
    '  english-pilot agent doctor [--json]',
    '  english-pilot agent run --text "..." [--backend claude|codex] [--cwd <path>] [--timeout-ms <ms>] [--dry-run] [--json]',
    '  english-pilot agent run --stdin [--backend claude|codex] [--cwd <path>] [--timeout-ms <ms>] [--dry-run] [--json]',
    '',
  ].join('\n');
}

function agentRunUsage(): string {
  return 'Usage: english-pilot agent run --text "..." | --stdin [--backend claude|codex] [--cwd <path>] [--dry-run] [--json]\n';
}

function getAgentPrompt(args: string[], stdin: string): string {
  if (args.includes('--stdin')) return stdin;
  return getFlagValue(args, '--text') ?? '';
}

function parseExternalAgentBackend(value: string | undefined): ExternalAgentBackend | undefined {
  if (value === undefined) return undefined;
  if (value === 'claude' || value === 'codex') return value;
  throw new Error('--backend must be one of: claude, codex.');
}

function parseOptionalPositiveInteger(value: string | undefined, name: string): number | undefined {
  if (value === undefined) return undefined;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`--${name} must be a positive integer.`);
  }
  return parsed;
}

function getFlagValue(args: string[], flag: string): string | undefined {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : undefined;
}

function errorResult(error: unknown): CliResult {
  return {
    exitCode: 1,
    stdout: '',
    stderr: `${error instanceof Error ? error.message : String(error)}\n`,
  };
}
