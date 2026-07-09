import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { CliResult } from './cli-types.js';
import { ensureRuntimeLayout } from '../core/infra/state-dir.js';

type ServiceAction = 'install' | 'uninstall' | 'status' | 'restart' | 'logs' | 'pause' | 'resume';

export function runService(args: string[]): CliResult {
  const [action] = args;
  if (!isServiceAction(action)) {
    return {
      exitCode: 1,
      stdout: '',
      stderr: serviceUsage(),
    };
  }
  if (args.includes('--dry-run')) {
    const plan = buildServicePlan(action);
    return {
      exitCode: 0,
      stdout: args.includes('--json') ? `${JSON.stringify(plan, null, 2)}\n` : formatServicePlan(plan),
      stderr: '',
    };
  }
  const script = findServiceScript();
  if (!script) {
    return {
      exitCode: 1,
      stdout: '',
      stderr: 'Cannot find scripts/service.sh from this installation.\n',
    };
  }
  const result = spawnSync('sh', [script, action], {
    encoding: 'utf8',
    env: process.env,
  });
  return {
    exitCode: result.status ?? 1,
    stdout: result.stdout,
    stderr: result.stderr,
  };
}

function buildServicePlan(action: ServiceAction): Record<string, unknown> {
  const layout = ensureRuntimeLayout();
  return {
    operation: `service-${action}`,
    dryRun: true,
    platform: process.platform,
    command: serviceCommand(action),
    daemonCommand: `${process.execPath} ${process.argv[1] ?? 'dist/src/bin/english-pilot.js'} run`,
    home: layout.home,
    logsDir: layout.logsDir,
    controlSocketPath: layout.controlSocketPath,
  };
}

function serviceCommand(action: ServiceAction): string {
  if (process.platform === 'darwin') return `launchctl ${action === 'install' ? 'bootstrap gui/$UID' : action}`;
  if (process.platform === 'linux') return `systemctl --user ${action}`;
  return action;
}

function formatServicePlan(plan: Record<string, unknown>): string {
  return [
    `Operation: ${plan.operation}`,
    `Dry run: ${plan.dryRun}`,
    `Platform: ${plan.platform}`,
    `Daemon command: ${plan.daemonCommand}`,
    `Home: ${plan.home}`,
    `Logs: ${plan.logsDir}`,
    `Control socket: ${plan.controlSocketPath}`,
    '',
  ].join('\n');
}

function findServiceScript(): string | undefined {
  const here = dirname(fileURLToPath(import.meta.url));
  const candidates = [
    join(process.cwd(), 'scripts', 'service.sh'),
    resolve(here, '..', '..', '..', 'scripts', 'service.sh'),
    resolve(here, '..', '..', 'scripts', 'service.sh'),
  ];
  return candidates.find((candidate) => existsSync(candidate));
}

function isServiceAction(action: string | undefined): action is ServiceAction {
  return (
    action === 'install' ||
    action === 'uninstall' ||
    action === 'status' ||
    action === 'restart' ||
    action === 'logs' ||
    action === 'pause' ||
    action === 'resume'
  );
}

function serviceUsage(): string {
  return [
    'Usage:',
    '  english-pilot service install [--dry-run] [--json]',
    '  english-pilot service uninstall',
    '  english-pilot service status',
    '  english-pilot service restart',
    '  english-pilot service logs',
    '  english-pilot service pause',
    '  english-pilot service resume',
    '',
  ].join('\n');
}
