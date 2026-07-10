import { getFlagValue } from './cli-args.js';
import type { CliResult } from './cli-types.js';
import { formatSetupPlan, runSetupPlan, type SetupAgentBackend } from '../installer/setup.js';

export function runSetup(args: string[]): CliResult {
  const json = args.includes('--json');
  const write = args.includes('--yes');
  const agentBackend = parseAgentBackend(getFlagValue(args, '--agent'));
  const externalAgentCwd = getFlagValue(args, '--cwd');

  if (agentBackend === undefined && args.includes('--agent')) {
    return {
      exitCode: 1,
      stdout: '',
      stderr: 'Usage: english-pilot setup [--yes] [--agent off|claude|codex] [--cwd <path>] [--json]\n',
    };
  }

  const plan = runSetupPlan({ agentBackend, externalAgentCwd, write });
  return {
    exitCode: 0,
    stdout: json ? `${JSON.stringify(plan, null, 2)}\n` : formatSetupPlan(plan),
    stderr: '',
  };
}

function parseAgentBackend(value: string | undefined): SetupAgentBackend | undefined {
  if (value === undefined) return undefined;
  if (value === 'off' || value === 'claude' || value === 'codex') return value;
  return undefined;
}
