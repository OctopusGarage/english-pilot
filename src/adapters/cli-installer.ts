import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import {
  createClaudeInstallPlan,
  formatClaudeInstallDryRun,
  installClaudeHook,
  resolveClaudeInstallHome,
  uninstallClaudeHook,
} from '../installer/claude.js';
import {
  createCodexInstallPlan,
  formatCodexInstallDryRun,
  installCodexHook,
  resolveCodexInstallHome,
  uninstallCodexHook,
} from '../installer/codex.js';
import {
  findInstallerTarget,
  formatInstallerTargets,
  isInstallerTargetId,
  listInstallerTargets,
  type InstallerTarget,
} from '../installer/targets.js';
import type { CliResult } from './cli-types.js';

export function runInstall(args: string[]): CliResult {
  const [target] = args;
  if (target === 'targets') {
    const targets = listInstallerTargets();
    return {
      exitCode: 0,
      stdout: args.includes('--json') ? `${JSON.stringify({ targets }, null, 2)}\n` : formatInstallerTargets(targets),
      stderr: '',
    };
  }
  const targetInfo = findInstallerTarget(target);
  if (targetInfo && !targetInfo.supportsInstall) return unsupportedInstallerTarget(targetInfo);
  if (target === 'codex') return runInstallCodex(args);
  if (!isInstallerTargetId(target) || target !== 'claude') {
    return {
      exitCode: 1,
      stdout: '',
      stderr: `Usage: english-pilot install ${installerTargetUsage()} --dry-run | --yes | install targets [--json]\n`,
    };
  }

  const plan = createClaudeInstallPlan(
    resolveClaudeInstallHome(homedir()),
    resolveHookCommand('claude'),
    resolveMcpServerConfig(),
  );
  if (args.includes('--dry-run')) {
    return {
      exitCode: 0,
      stdout: formatClaudeInstallDryRun(plan),
      stderr: '',
    };
  }

  if (args.includes('--yes')) {
    installClaudeHook(plan);
    return {
      exitCode: 0,
      stdout: [
        `Installed Claude hook: ${plan.hookPath}`,
        `Installed Claude MCP server: ${plan.mcpConfigPath}`,
        '',
      ].join('\n'),
      stderr: '',
    };
  }

  return {
    exitCode: 1,
    stdout: '',
    stderr: 'Usage: english-pilot install claude --dry-run | --yes\n',
  };
}

export function runUninstall(args: string[]): CliResult {
  const [target] = args;
  if (target === 'codex') return runUninstallCodex(args);
  const targetInfo = findInstallerTarget(target);
  if (targetInfo && !targetInfo.supportsUninstall) return unsupportedInstallerTarget(targetInfo);

  if (!isInstallerTargetId(target) || target !== 'claude' || !args.includes('--yes')) {
    return {
      exitCode: 1,
      stdout: '',
      stderr: `Usage: english-pilot uninstall ${installerTargetUsage()} --yes\n`,
    };
  }

  const plan = createClaudeInstallPlan(
    resolveClaudeInstallHome(homedir()),
    resolveHookCommand('claude'),
    resolveMcpServerConfig(),
  );
  const removed = uninstallClaudeHook(plan);
  return {
    exitCode: 0,
    stdout: [
      removed ? `Removed Claude hook: ${plan.hookPath}` : `Claude hook was not installed: ${plan.hookPath}`,
      `Removed Claude MCP server: ${plan.mcpConfigPath}`,
      '',
    ].join('\n'),
    stderr: '',
  };
}

function runInstallCodex(args: string[]): CliResult {
  const plan = createCodexInstallPlan(
    resolveCodexInstallHome(homedir()),
    resolveHookCommand('codex'),
    resolveMcpServerConfig(),
  );
  if (args.includes('--dry-run')) {
    return {
      exitCode: 0,
      stdout: formatCodexInstallDryRun(plan),
      stderr: '',
    };
  }
  if (args.includes('--yes')) {
    installCodexHook(plan);
    return {
      exitCode: 0,
      stdout: [
        `Installed Codex hook: ${plan.hooksConfigPath}`,
        `Installed Codex MCP server: ${plan.configPath}`,
        `Installed Codex guidance: ${plan.agentsPath}`,
        '',
      ].join('\n'),
      stderr: '',
    };
  }

  return {
    exitCode: 1,
    stdout: '',
    stderr: 'Usage: english-pilot install codex --dry-run | --yes\n',
  };
}

function runUninstallCodex(args: string[]): CliResult {
  if (!args.includes('--yes')) {
    return {
      exitCode: 1,
      stdout: '',
      stderr: 'Usage: english-pilot uninstall codex --yes\n',
    };
  }

  const plan = createCodexInstallPlan(
    resolveCodexInstallHome(homedir()),
    resolveHookCommand('codex'),
    resolveMcpServerConfig(),
  );
  const removed = uninstallCodexHook(plan);
  return {
    exitCode: 0,
    stdout: [
      removed ? `Removed Codex hook: ${plan.hooksConfigPath}` : `Codex hook was not installed: ${plan.hooksConfigPath}`,
      `Removed Codex MCP server: ${plan.configPath}`,
      `Removed Codex guidance: ${plan.agentsPath}`,
      '',
    ].join('\n'),
    stderr: '',
  };
}

function resolveHookCommand(target: 'claude' | 'codex'): string {
  const currentScript = process.argv[1];
  if (currentScript && currentScript.endsWith('english-pilot.js') && existsSync(currentScript)) {
    return `${shellQuote(process.execPath)} --no-warnings ${shellQuote(currentScript)} hook ${target} --stdin`;
  }
  return `english-pilot hook ${target} --stdin`;
}

function resolveMcpServerConfig(): { command: string; args: string[] } {
  const currentScript = process.argv[1];
  if (currentScript && currentScript.endsWith('english-pilot.js') && existsSync(currentScript)) {
    return {
      command: process.execPath,
      args: ['--no-warnings', currentScript, 'serve', '--mcp'],
    };
  }
  return {
    command: 'english-pilot',
    args: ['serve', '--mcp'],
  };
}

function shellQuote(value: string): string {
  return `"${value.replace(/(["\\$`])/g, '\\$1')}"`;
}

function installerTargetUsage(): string {
  return listInstallerTargets()
    .map((target) => target.id)
    .join('|');
}

function unsupportedInstallerTarget(target: InstallerTarget): CliResult {
  return {
    exitCode: 1,
    stdout: '',
    stderr: [
      `Installer target is planned but not supported yet: ${target.id}`,
      'Use `english-pilot install targets` to see supported targets.',
      '',
    ].join('\n'),
  };
}
