import { disableProjectGateHook, type ProjectGateIgnoreMode } from '../core/project-gate-setup.js';
import { getFlagValue } from './cli-args.js';
import type { CliResult } from './cli-types.js';

export function runGate(args: string[]): CliResult {
  const [subcommand] = args;
  if (subcommand !== 'disable') return usage();

  const ignoreMode = parseIgnoreMode(args);
  if (!ignoreMode) return usage();

  try {
    const result = disableProjectGateHook({
      cwd: getFlagValue(args, '--cwd'),
      ignoreMode,
    });
    return {
      exitCode: 0,
      stdout: args.includes('--json') ? `${JSON.stringify(result, null, 2)}\n` : formatGateDisableResult(result),
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

function parseIgnoreMode(args: string[]): ProjectGateIgnoreMode | undefined {
  const repo = args.includes('--repo-ignore');
  const global = args.includes('--global-ignore');
  if (repo === global) return undefined;
  return repo ? 'repo' : 'global';
}

function formatGateDisableResult(result: ReturnType<typeof disableProjectGateHook>): string {
  return [
    'Disabled EnglishPilot submit-hook gate for this project.',
    `Project config: ${result.projectConfigPath}`,
    `Git ignore (${result.ignore.mode}): ${result.ignore.path}`,
    '',
  ].join('\n');
}

function usage(): CliResult {
  return {
    exitCode: 1,
    stdout: '',
    stderr: 'Usage: english-pilot gate disable (--repo-ignore|--global-ignore) [--cwd <path>] [--json]\n',
  };
}
