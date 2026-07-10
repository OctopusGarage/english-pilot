import { runAgentEval, formatAgentEvalReport, type AgentEvalCaseId } from '../eval/agent-eval-runner.js';
import { formatSmokeEvalPrompts, formatSmokeEvalReport, runSmokeEval } from '../eval/smoke-eval-runner.js';
import type { ExternalAgentBackend } from '../agent/runner.js';
import type { CliResult } from './cli-types.js';

export function runEval(args: string[]): CliResult {
  const [subcommand] = args;
  if (subcommand === 'smoke') {
    const report = runSmokeEval();
    return {
      exitCode: report.passed ? 0 : 1,
      stdout: args.includes('--json') ? `${JSON.stringify(report, null, 2)}\n` : formatSmokeEvalReport(report),
      stderr: '',
    };
  }

  if (subcommand === 'prompts') {
    return {
      exitCode: 0,
      stdout: formatSmokeEvalPrompts(),
      stderr: '',
    };
  }

  return {
    exitCode: 1,
    stdout: '',
    stderr:
      'Usage: english-pilot eval smoke [--json] | eval prompts | eval agent --backend claude|codex [--case channel-weather|history-lesson] [--dry-run] [--json]\n',
  };
}

export async function runEvalAsync(args: string[]): Promise<CliResult> {
  const [subcommand] = args;
  if (subcommand !== 'agent') return runEval(args);
  try {
    const backend = parseBackend(getFlagValue(args, '--backend'));
    const caseId = parseCaseId(getFlagValue(args, '--case'));
    const report = await runAgentEval({
      backend,
      caseId,
      cwd: getFlagValue(args, '--cwd'),
      timeoutMs: parseOptionalPositiveInteger(getFlagValue(args, '--timeout-ms'), 'timeout-ms'),
      dryRun: args.includes('--dry-run'),
    });
    const output = args.includes('--include-raw') ? report : compactAgentEvalReport(report);
    return {
      exitCode: report.passed ? 0 : 1,
      stdout: args.includes('--json') ? `${JSON.stringify(output, null, 2)}\n` : formatAgentEvalReport(report),
      stderr: '',
    };
  } catch (error) {
    return {
      exitCode: 1,
      stdout: '',
      stderr: `${error instanceof Error ? error.message : String(error)}\n`,
    };
  }
}

function compactAgentEvalReport(report: Awaited<ReturnType<typeof runAgentEval>>): unknown {
  return {
    ...report,
    run: {
      operation: report.run.operation,
      backend: report.run.backend,
      command: report.run.command,
      args: report.run.args,
      cwd: report.run.cwd,
      dryRun: report.run.dryRun,
      exitCode: report.run.exitCode,
      ...(report.run.signal ? { signal: report.run.signal } : {}),
      ...(report.run.sessionId ? { sessionId: report.run.sessionId } : {}),
      ...(report.run.threadId ? { threadId: report.run.threadId } : {}),
      stdoutPreview: preview(report.run.stdout),
      stderrPreview: preview(report.run.stderr),
    },
  };
}

function preview(value: string): string {
  const trimmed = value.trim();
  return trimmed.length > 800 ? `${trimmed.slice(0, 800)}...` : trimmed;
}

function parseBackend(value: string | undefined): ExternalAgentBackend {
  if (value === 'claude' || value === 'codex') return value;
  throw new Error('--backend must be one of: claude, codex.');
}

function parseCaseId(value: string | undefined): AgentEvalCaseId {
  if (value === undefined || value === 'channel-weather') return 'channel-weather';
  if (value === 'history-lesson') return 'history-lesson';
  throw new Error('--case must be one of: channel-weather, history-lesson.');
}

function parseOptionalPositiveInteger(value: string | undefined, name: string): number | undefined {
  if (value === undefined) return undefined;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) throw new Error(`--${name} must be a positive integer.`);
  return parsed;
}

function getFlagValue(args: string[], flag: string): string | undefined {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : undefined;
}
