import { readFileSync } from 'node:fs';
import { buildVoiceProviderPreflight } from '../core/voice-preflight.js';
import { findVoiceProvider, formatVoiceProviders, listVoiceProviders } from '../core/voice-providers.js';
import { buildVoiceSttPolicy, formatVoiceSttPolicy } from '../core/voice-stt-policy.js';
import {
  assessVoiceSttProvider,
  buildVoiceSttProviderAssessmentHistory,
  formatVoiceSttProviderAssessment,
  formatVoiceSttProviderAssessmentHistory,
} from '../core/voice-stt-assessment.js';
import {
  buildVoiceSttProviderContractDraft,
  formatVoiceSttProviderContractDraft,
} from '../core/voice-stt-provider-contract-draft.js';
import {
  buildVoiceSttContract,
  formatVoiceSttContract,
  formatVoiceSttValidation,
  validateVoiceSttResponse,
} from '../core/voice-stt-contract.js';
import { buildVoiceSttWrapperTemplate, formatVoiceSttWrapperTemplate } from '../core/voice-stt-wrapper-template.js';
import {
  buildVoicePracticeFromAudio,
  buildVoicePracticeFromAudioAsync,
  buildVoicePracticeLearningItem,
} from '../core/voice-practice.js';
import { transcribeVoiceAudio } from '../core/voice-stt-gateway.js';
import { transcribeWithLocalWhisper } from '../core/voice-transcription.js';
import { recordLearningItem } from '../storage/repository.js';
import type { CliAsyncOptions, CliResult } from './cli-types.js';

export function runVoice(args: string[]): CliResult {
  const [subcommand] = args;
  if (subcommand === 'providers') {
    const providers = listVoiceProviders();
    return {
      exitCode: 0,
      stdout: args.includes('--json') ? `${JSON.stringify({ providers }, null, 2)}\n` : formatVoiceProviders(providers),
      stderr: '',
    };
  }

  if (subcommand === 'stt-policy') {
    const policy = buildVoiceSttPolicy();
    return {
      exitCode: 0,
      stdout: args.includes('--json') ? `${JSON.stringify(policy, null, 2)}\n` : formatVoiceSttPolicy(policy),
      stderr: '',
    };
  }

  if (subcommand === 'stt-contract') {
    const contract = buildVoiceSttContract();
    return {
      exitCode: 0,
      stdout: args.includes('--json') ? `${JSON.stringify(contract, null, 2)}\n` : formatVoiceSttContract(contract),
      stderr: '',
    };
  }

  if (subcommand === 'stt-validate') {
    const responseJson = readVoiceSttResponseJsonArg(args);
    if (responseJson.error) return errorResult(responseJson.error);
    if (!responseJson.value?.trim()) {
      return usage('english-pilot voice stt-validate --response-json <json> | --response-json-file <path> [--json]');
    }
    try {
      const result = validateVoiceSttResponse(JSON.parse(responseJson.value) as unknown);
      return {
        exitCode: result.valid ? 0 : 1,
        stdout: args.includes('--json') ? `${JSON.stringify(result, null, 2)}\n` : formatVoiceSttValidation(result),
        stderr: '',
      };
    } catch {
      return errorResult('Invalid STT response JSON.');
    }
  }

  if (subcommand === 'stt-assess-provider') {
    const providerName = getFlagValue(args, '--provider-name');
    const responseJson = readVoiceSttResponseJsonArg(args);
    if (responseJson.error) return errorResult(responseJson.error);
    if (!providerName?.trim() || !responseJson.value?.trim()) {
      return usage(
        'english-pilot voice stt-assess-provider --provider-name <name> --response-json <json> | --response-json-file <path> [--record] [--json]',
      );
    }
    try {
      const result = assessVoiceSttProvider({
        providerName,
        response: JSON.parse(responseJson.value) as unknown,
        record: args.includes('--record'),
      });
      return {
        exitCode: 0,
        stdout: args.includes('--json')
          ? `${JSON.stringify(result, null, 2)}\n`
          : formatVoiceSttProviderAssessment(result),
        stderr: '',
      };
    } catch (error) {
      return errorResult(
        error instanceof SyntaxError
          ? 'Invalid STT response JSON.'
          : error instanceof Error
            ? error.message
            : String(error),
      );
    }
  }

  if (subcommand === 'stt-assessment-history') {
    const history = buildVoiceSttProviderAssessmentHistory({
      providerName: getFlagValue(args, '--provider-name'),
    });
    return {
      exitCode: 0,
      stdout: args.includes('--json')
        ? `${JSON.stringify(history, null, 2)}\n`
        : formatVoiceSttProviderAssessmentHistory(history),
      stderr: '',
    };
  }

  if (subcommand === 'stt-wrapper-template') {
    const template = buildVoiceSttWrapperTemplate();
    return {
      exitCode: 0,
      stdout: args.includes('--json')
        ? `${JSON.stringify(template, null, 2)}\n`
        : formatVoiceSttWrapperTemplate(template),
      stderr: '',
    };
  }

  if (subcommand === 'stt-provider-contract-draft') {
    const providerName = getFlagValue(args, '--provider-name');
    if (!providerName?.trim()) {
      return usage('english-pilot voice stt-provider-contract-draft --provider-name <name> [--json]');
    }
    try {
      const draft = buildVoiceSttProviderContractDraft({ providerName });
      return {
        exitCode: 0,
        stdout: args.includes('--json')
          ? `${JSON.stringify(draft, null, 2)}\n`
          : formatVoiceSttProviderContractDraft(draft),
        stderr: '',
      };
    } catch (error) {
      return errorResult(error instanceof Error ? error.message : String(error));
    }
  }

  if (subcommand === 'preflight') {
    const provider = findVoiceProvider(getFlagValue(args, '--provider'));
    if (!provider) return usage('english-pilot voice preflight --provider <provider> [--json]');

    const preflight = buildVoiceProviderPreflight(provider);
    return {
      exitCode: 0,
      stdout: args.includes('--json') ? `${JSON.stringify(preflight, null, 2)}\n` : formatVoicePreflight(preflight),
      stderr: '',
    };
  }

  if (subcommand === 'transcribe') {
    const provider = findVoiceProvider(getFlagValue(args, '--provider'));
    const audioPath = getFlagValue(args, '--audio');
    if (!provider || provider.id !== 'local-whisper' || !audioPath?.trim()) {
      return usage('english-pilot voice transcribe --provider local-whisper|cloud-stt --audio <path> [--json]');
    }

    try {
      const result = transcribeWithLocalWhisper(provider, audioPath);
      return {
        exitCode: 0,
        stdout: args.includes('--json') ? `${JSON.stringify(result, null, 2)}\n` : `${result.transcript}\n`,
        stderr: '',
      };
    } catch (error) {
      return errorResult(error instanceof Error ? error.message : String(error));
    }
  }

  if (subcommand === 'record') {
    const transcript = getFlagValue(args, '--transcript');
    const target = getFlagValue(args, '--target');
    if (!transcript?.trim() || !target?.trim()) {
      return usage('english-pilot voice record --transcript "..." --target "..." [--feedback "..."] [--json]');
    }

    const draft = buildVoicePracticeLearningItem({
      transcript,
      target,
      feedback: getFlagValue(args, '--feedback'),
    });
    const item = recordLearningItem(draft);
    return {
      exitCode: 0,
      stdout: args.includes('--json')
        ? `${JSON.stringify({ item }, null, 2)}\n`
        : `Recorded voice practice item: ${item.id}\n`,
      stderr: '',
    };
  }

  if (subcommand === 'practice') {
    const provider = findVoiceProvider(getFlagValue(args, '--provider'));
    const audioPath = getFlagValue(args, '--audio');
    const target = getFlagValue(args, '--target');
    if (!provider || provider.id !== 'local-whisper' || !audioPath?.trim() || !target?.trim()) {
      return usage(
        'english-pilot voice practice --provider local-whisper|cloud-stt --audio <path> --target "..." [--feedback "..."] [--json]',
      );
    }

    try {
      const result = buildVoicePracticeFromAudio({
        provider,
        audioPath,
        target,
        feedback: getFlagValue(args, '--feedback'),
      });
      const item = recordLearningItem(result.draft);
      return {
        exitCode: 0,
        stdout: args.includes('--json')
          ? `${JSON.stringify({ transcription: result.transcription, item }, null, 2)}\n`
          : `Recorded voice practice item: ${item.id}\n`,
        stderr: '',
      };
    } catch (error) {
      return errorResult(error instanceof Error ? error.message : String(error));
    }
  }

  return usage(
    'english-pilot voice providers [--json] | voice stt-policy [--json] | voice stt-contract [--json] | voice stt-validate --response-json <json> | --response-json-file <path> [--json] | voice stt-assess-provider --provider-name <name> --response-json <json> | --response-json-file <path> [--record] [--json] | voice stt-assessment-history [--provider-name <name>] [--json] | voice stt-provider-contract-draft --provider-name <name> [--json] | voice stt-wrapper-template [--json] | voice preflight --provider <provider> [--json] | voice transcribe --provider local-whisper|cloud-stt --audio <path> [--json] | voice practice --provider local-whisper|cloud-stt --audio <path> --target "..." [--feedback "..."] [--json] | voice record --transcript "..." --target "..." [--feedback "..."] [--json]',
  );
}

export async function runVoiceAsync(args: string[], options: CliAsyncOptions): Promise<CliResult> {
  const [subcommand] = args;
  if (subcommand === 'transcribe') {
    const provider = findVoiceProvider(getFlagValue(args, '--provider'));
    const audioPath = getFlagValue(args, '--audio');
    if (!provider || !audioPath?.trim() || (provider.id !== 'local-whisper' && provider.id !== 'cloud-stt')) {
      return usage('english-pilot voice transcribe --provider local-whisper|cloud-stt --audio <path> [--json]');
    }

    try {
      const result = await transcribeVoiceAudio({
        provider,
        audioPath,
        env: options.env,
        fetch: options.fetch,
      });
      return {
        exitCode: 0,
        stdout: args.includes('--json') ? `${JSON.stringify(result, null, 2)}\n` : `${result.transcript}\n`,
        stderr: '',
      };
    } catch (error) {
      return errorResult(error instanceof Error ? error.message : String(error));
    }
  }

  if (subcommand === 'practice') {
    const provider = findVoiceProvider(getFlagValue(args, '--provider'));
    const audioPath = getFlagValue(args, '--audio');
    const target = getFlagValue(args, '--target');
    if (
      !provider ||
      !audioPath?.trim() ||
      !target?.trim() ||
      (provider.id !== 'local-whisper' && provider.id !== 'cloud-stt')
    ) {
      return usage(
        'english-pilot voice practice --provider local-whisper|cloud-stt --audio <path> --target "..." [--feedback "..."] [--json]',
      );
    }

    try {
      const result = await buildVoicePracticeFromAudioAsync({
        provider,
        audioPath,
        target,
        feedback: getFlagValue(args, '--feedback'),
        env: options.env,
        fetch: options.fetch,
      });
      const item = recordLearningItem(result.draft);
      return {
        exitCode: 0,
        stdout: args.includes('--json')
          ? `${JSON.stringify({ transcription: result.transcription, item }, null, 2)}\n`
          : `Recorded voice practice item: ${item.id}\n`,
        stderr: '',
      };
    } catch (error) {
      return errorResult(error instanceof Error ? error.message : String(error));
    }
  }

  return runVoice(args);
}

function formatVoicePreflight(preflight: ReturnType<typeof buildVoiceProviderPreflight>): string {
  return [
    `Voice provider preflight: ${preflight.provider.label}`,
    `Ready: ${preflight.ready ? 'yes' : 'no'}`,
    `Network: ${preflight.network ? 'yes' : 'no'}`,
    `Missing: ${preflight.missing.length > 0 ? preflight.missing.join(', ') : 'none'}`,
    '',
  ].join('\n');
}

function readVoiceSttResponseJsonArg(args: string[]): { value?: string; error?: string } {
  const responseJson = getFlagValue(args, '--response-json');
  if (responseJson?.trim()) return { value: responseJson };
  const responseJsonFile = getFlagValue(args, '--response-json-file');
  if (!responseJsonFile?.trim()) return {};
  try {
    return { value: readFileSync(responseJsonFile, 'utf8') };
  } catch (error) {
    return {
      error: `Unable to read STT response JSON file: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

function getFlagValue(args: string[], flag: string): string | undefined {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : undefined;
}

function usage(command: string): CliResult {
  return {
    exitCode: 1,
    stdout: '',
    stderr: `Usage: ${command}\n`,
  };
}

function errorResult(message: string): CliResult {
  return {
    exitCode: 1,
    stdout: '',
    stderr: `${message}\n`,
  };
}
