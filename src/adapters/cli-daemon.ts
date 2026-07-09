import type { CliResult } from './cli-types.js';
import { runDaemon, getDaemonStatusSnapshot } from '../daemon/run-daemon.js';
import { detectUncleanRestart } from '../core/infra/lifecycle.js';
import { ensureRuntimeLayout } from '../core/infra/state-dir.js';

export function runDaemonCommand(args: string[]): CliResult {
  const [subcommand] = args;
  if (subcommand === 'status') {
    const layout = ensureRuntimeLayout();
    const restart = detectUncleanRestart(layout.runningMarkerPath);
    const status = {
      running: false,
      socketReachable: false,
      controlSocketPath: layout.controlSocketPath,
      instanceLockPath: layout.instanceLockPath,
      runningMarkerPath: layout.runningMarkerPath,
      uncleanRestart: restart.unclean,
      ...(restart.unclean && restart.pid !== undefined ? { pid: restart.pid } : {}),
      ...(restart.unclean && restart.startedAt !== undefined ? { startedAt: restart.startedAt } : {}),
    };
    return {
      exitCode: 0,
      stdout: args.includes('--json') ? `${JSON.stringify(status, null, 2)}\n` : formatDaemonStatus(status),
      stderr: '',
    };
  }
  return {
    exitCode: 1,
    stdout: '',
    stderr: 'Usage: english-pilot daemon status [--json]\n',
  };
}

export async function runDaemonCommandAsync(args: string[]): Promise<CliResult> {
  const [subcommand] = args;
  if (subcommand === 'status') {
    const status = await getDaemonStatusSnapshot();
    return {
      exitCode: 0,
      stdout: args.includes('--json') ? `${JSON.stringify(status, null, 2)}\n` : formatDaemonStatus(status),
      stderr: '',
    };
  }
  return runDaemonCommand(args);
}

export async function runRunCommand(args: string[]): Promise<CliResult> {
  try {
    const result = await runDaemon({
      dryRun: args.includes('--dry-run'),
      waitForever: !args.includes('--dry-run'),
      log: (line) => process.stderr.write(`${line}\n`),
    });
    return {
      exitCode: result.ready ? 0 : 1,
      stdout: args.includes('--json') ? `${JSON.stringify(result, null, 2)}\n` : formatRunResult(result),
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

function formatRunResult(result: Awaited<ReturnType<typeof runDaemon>>): string {
  return [
    'EnglishPilot daemon',
    `Ready: ${result.ready ? 'yes' : 'no'}`,
    `Dry run: ${result.dryRun ? 'yes' : 'no'}`,
    `Control socket: ${result.socketPath}`,
    `Feishu: ${result.channels.feishu}${result.missing.feishu.length ? ` (${result.missing.feishu.join(', ')})` : ''}`,
    `WeChat: ${result.channels.wechat}${result.missing.wechat.length ? ` (${result.missing.wechat.join(', ')})` : ''}`,
    '',
  ].join('\n');
}

function formatDaemonStatus(status: {
  running: boolean;
  socketReachable: boolean;
  controlSocketPath: string;
  instanceLockPath: string;
  runningMarkerPath: string;
  uncleanRestart: boolean;
  pid?: number;
  startedAt?: string;
}): string {
  return [
    'EnglishPilot daemon status',
    `Running: ${status.running ? 'yes' : 'no'}`,
    `Socket reachable: ${status.socketReachable ? 'yes' : 'no'}`,
    `Control socket: ${status.controlSocketPath}`,
    `Instance lock: ${status.instanceLockPath}`,
    `Running marker: ${status.runningMarkerPath}`,
    `Unclean restart marker: ${status.uncleanRestart ? 'yes' : 'no'}`,
    ...(status.pid ? [`PID: ${status.pid}`] : []),
    ...(status.startedAt ? [`Started at: ${status.startedAt}`] : []),
    '',
  ].join('\n');
}
