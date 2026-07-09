export type VoiceProviderId = 'manual' | 'local-whisper' | 'cloud-stt';
export type VoiceProviderStatus = 'supported' | 'planned';
export type VoiceProviderInput = 'text' | 'audio';

export interface VoiceProvider {
  id: VoiceProviderId;
  label: string;
  status: VoiceProviderStatus;
  input: VoiceProviderInput;
  capabilities: string[];
}

export const voiceProviders: VoiceProvider[] = [
  {
    id: 'manual',
    label: 'Manual Transcript',
    status: 'supported',
    input: 'text',
    capabilities: ['transcript-review', 'pronunciation-feedback'],
  },
  {
    id: 'local-whisper',
    label: 'Local Whisper',
    status: 'supported',
    input: 'audio',
    capabilities: ['speech-to-text', 'pronunciation-feedback'],
  },
  {
    id: 'cloud-stt',
    label: 'Cloud Speech-to-Text',
    status: 'supported',
    input: 'audio',
    capabilities: ['speech-to-text', 'pronunciation-feedback'],
  },
];

export function listVoiceProviders(): VoiceProvider[] {
  return voiceProviders.map((provider) => ({
    ...provider,
    capabilities: [...provider.capabilities],
  }));
}

export function findVoiceProvider(value: string | undefined): VoiceProvider | undefined {
  const provider = voiceProviders.find((item) => item.id === value);
  if (!provider) return undefined;
  return {
    ...provider,
    capabilities: [...provider.capabilities],
  };
}

export function formatVoiceProviders(providers = listVoiceProviders()): string {
  return providers.map((provider) => `${provider.id} - ${provider.label} (${provider.status})`).join('\n') + '\n';
}
