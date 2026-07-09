import { buildVoiceProviderPreflight } from '../core/voice-preflight.js';
import { listVoiceProviders } from '../core/voice-providers.js';
import { buildVoiceSttPolicy } from '../core/voice-stt-policy.js';
import { assessVoiceSttProvider, buildVoiceSttProviderAssessmentHistory } from '../core/voice-stt-assessment.js';
import { buildVoiceSttProviderContractDraft } from '../core/voice-stt-provider-contract-draft.js';
import { buildVoiceSttContract, validateVoiceSttResponse } from '../core/voice-stt-contract.js';
import { buildVoiceSttWrapperTemplate } from '../core/voice-stt-wrapper-template.js';
import {
  buildVoicePracticeFromAudio,
  buildVoicePracticeFromAudioAsync,
  buildVoicePracticeLearningItem,
} from '../core/voice-practice.js';
import { transcribeWithLocalWhisper } from '../core/voice-transcription.js';
import { transcribeVoiceAudio } from '../core/voice-stt-gateway.js';
import type { IntegrationFetch } from '../integrations/network-sender.js';
import { recordLearningItem } from '../storage/repository.js';
import {
  optionalBoolean,
  optionalString,
  requireObject,
  requireString,
  requireVoiceProvider,
} from './mcp-tool-arguments.js';
import type { EnglishPilotMcpToolName } from './mcp-tool-registry.js';

export interface McpVoiceAsyncOptions {
  env?: NodeJS.ProcessEnv;
  fetch?: IntegrationFetch;
}

export function handleVoiceMcpToolCall(
  name: EnglishPilotMcpToolName,
  args: Record<string, unknown>,
): Record<string, unknown> | undefined {
  switch (name) {
    case 'english_record_voice_practice': {
      const item = recordLearningItem(
        buildVoicePracticeLearningItem({
          transcript: requireString(args, 'transcript'),
          target: requireString(args, 'target'),
          feedback: optionalString(args, 'feedback'),
        }),
      );
      return { item };
    }
    case 'english_voice_providers':
      return { providers: listVoiceProviders() };
    case 'english_voice_stt_policy':
      return buildVoiceSttPolicy() as unknown as Record<string, unknown>;
    case 'english_voice_stt_contract':
      return buildVoiceSttContract() as unknown as Record<string, unknown>;
    case 'english_voice_stt_validate':
      return validateVoiceSttResponse(requireObject(args, 'response')) as unknown as Record<string, unknown>;
    case 'english_voice_stt_assess_provider':
      return assessVoiceSttProvider({
        providerName: requireString(args, 'providerName'),
        response: requireObject(args, 'response'),
        record: optionalBoolean(args, 'record') ?? false,
      }) as unknown as Record<string, unknown>;
    case 'english_voice_stt_assessment_history':
      return buildVoiceSttProviderAssessmentHistory({
        providerName: optionalString(args, 'providerName'),
      }) as unknown as Record<string, unknown>;
    case 'english_voice_stt_provider_contract_draft':
      return buildVoiceSttProviderContractDraft({
        providerName: requireString(args, 'providerName'),
      }) as unknown as Record<string, unknown>;
    case 'english_voice_stt_wrapper_template':
      return buildVoiceSttWrapperTemplate() as unknown as Record<string, unknown>;
    case 'english_voice_preflight': {
      const provider = requireVoiceProvider(args);
      return buildVoiceProviderPreflight(provider) as unknown as Record<string, unknown>;
    }
    case 'english_voice_transcribe': {
      const provider = requireVoiceProvider(args);
      const audioPath = requireString(args, 'audioPath');
      return transcribeWithLocalWhisper(provider, audioPath) as unknown as Record<string, unknown>;
    }
    case 'english_voice_practice_from_audio': {
      const provider = requireVoiceProvider(args);
      const result = buildVoicePracticeFromAudio({
        provider,
        audioPath: requireString(args, 'audioPath'),
        target: requireString(args, 'target'),
        feedback: optionalString(args, 'feedback'),
      });
      const item = recordLearningItem(result.draft);
      return { transcription: result.transcription, item };
    }
    default:
      return undefined;
  }
}

export async function handleVoiceMcpToolCallAsync(
  name: EnglishPilotMcpToolName,
  args: Record<string, unknown>,
  options: McpVoiceAsyncOptions = {},
): Promise<Record<string, unknown> | undefined> {
  if (name === 'english_voice_transcribe') {
    const provider = requireVoiceProvider(args);
    const audioPath = requireString(args, 'audioPath');
    return (await transcribeVoiceAudio({
      provider,
      audioPath,
      env: options.env,
      fetch: options.fetch,
    })) as unknown as Record<string, unknown>;
  }

  if (name === 'english_voice_practice_from_audio') {
    const provider = requireVoiceProvider(args);
    const result = await buildVoicePracticeFromAudioAsync({
      provider,
      audioPath: requireString(args, 'audioPath'),
      target: requireString(args, 'target'),
      feedback: optionalString(args, 'feedback'),
      env: options.env,
      fetch: options.fetch,
    });
    const item = recordLearningItem(result.draft);
    return { transcription: result.transcription, item };
  }

  return handleVoiceMcpToolCall(name, args);
}
