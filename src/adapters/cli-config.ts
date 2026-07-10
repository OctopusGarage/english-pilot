import { loadConfig, setConfigValue } from '../core/config.js';
import {
  applyConfigProfile,
  buildConfigProfileStatus,
  configProfiles,
  findConfigProfile,
  formatConfigProfiles,
  formatConfigProfileStatus,
} from '../core/config-profiles.js';
import {
  applyRatioProgressionSuggestion,
  buildRatioProgressionSuggestion,
  formatRatioProgressionApplyResult,
  formatRatioProgressionSuggestion,
} from '../core/ratio-progression.js';
import { listPromptEvents } from '../storage/repository.js';
import type { CliResult } from './cli-types.js';

export function runConfig(args: string[]): CliResult {
  const [subcommand, key, value] = args;

  if (subcommand === 'get') {
    try {
      return {
        exitCode: 0,
        stdout: `${JSON.stringify(loadConfig(), null, 2)}\n`,
        stderr: '',
      };
    } catch (error) {
      return configErrorResult(error);
    }
  }

  if (subcommand === 'profiles') {
    return {
      exitCode: 0,
      stdout: args.includes('--json')
        ? `${JSON.stringify({ profiles: configProfiles }, null, 2)}\n`
        : formatConfigProfiles(configProfiles),
      stderr: '',
    };
  }

  if (subcommand === 'profile-status') {
    try {
      const status = buildConfigProfileStatus();
      return {
        exitCode: 0,
        stdout: args.includes('--json') ? `${JSON.stringify(status, null, 2)}\n` : formatConfigProfileStatus(status),
        stderr: '',
      };
    } catch (error) {
      return configErrorResult(error);
    }
  }

  if (subcommand === 'progression-suggestion') {
    try {
      const suggestion = buildRatioProgressionSuggestion(loadConfig(), listPromptEvents());
      return {
        exitCode: 0,
        stdout: args.includes('--json')
          ? `${JSON.stringify(suggestion, null, 2)}\n`
          : formatRatioProgressionSuggestion(suggestion),
        stderr: '',
      };
    } catch (error) {
      return configErrorResult(error);
    }
  }

  if (subcommand === 'progression-apply') {
    try {
      const result = applyRatioProgressionSuggestion(loadConfig(), listPromptEvents(), {
        apply: args.includes('--yes'),
      });
      return {
        exitCode: 0,
        stdout: args.includes('--json')
          ? `${JSON.stringify(result, null, 2)}\n`
          : formatRatioProgressionApplyResult(result),
        stderr: '',
      };
    } catch (error) {
      return configErrorResult(error);
    }
  }

  if (subcommand === 'use') {
    const profile = findConfigProfile(key);
    if (!profile) return usage('english-pilot config use beginner|balanced|strict|force|coach [--json]');
    try {
      const config = applyConfigProfile(profile);
      return {
        exitCode: 0,
        stdout: args.includes('--json')
          ? `${JSON.stringify({ profile, config }, null, 2)}\n`
          : `Applied config profile: ${profile.id}\n`,
        stderr: '',
      };
    } catch (error) {
      return configErrorResult(error);
    }
  }

  if (subcommand === 'set' && key && value !== undefined) {
    try {
      const config = setConfigValue(key, value);
      return {
        exitCode: 0,
        stdout: `Set ${key} = ${JSON.stringify(config[key as keyof typeof config])}\n`,
        stderr: '',
      };
    } catch (error) {
      return configErrorResult(error);
    }
  }

  return usage(
    'english-pilot config get | config profiles [--json] | config profile-status [--json] | config progression-suggestion [--json] | config progression-apply [--yes] [--json] | config use beginner|balanced|strict|force|coach [--json] | config set <key> <value>',
  );
}

function usage(command: string): CliResult {
  return {
    exitCode: 1,
    stdout: '',
    stderr: `Usage: ${command}\n`,
  };
}

function configErrorResult(error: unknown): CliResult {
  return {
    exitCode: 1,
    stdout: '',
    stderr: `${error instanceof Error ? error.message : String(error)}\n`,
  };
}
