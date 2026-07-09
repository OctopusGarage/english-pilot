import type { VoiceProvider } from './voice-providers.js';
import {
  transcribeWithCloudStt,
  transcribeWithLocalWhisper,
  type VoiceFetch,
  type VoiceTranscriptionResult,
} from './voice-transcription.js';

export interface VoiceSttGatewayInput {
  provider: VoiceProvider;
  audioPath: string;
  env?: NodeJS.ProcessEnv;
  fetch?: VoiceFetch;
}

export async function transcribeVoiceAudio(input: VoiceSttGatewayInput): Promise<VoiceTranscriptionResult> {
  if (input.provider.id === 'cloud-stt') {
    return transcribeWithCloudStt({
      provider: input.provider,
      audioPath: input.audioPath,
      env: input.env,
      fetch: input.fetch,
    });
  }
  return transcribeWithLocalWhisper(input.provider, input.audioPath, input.env);
}
