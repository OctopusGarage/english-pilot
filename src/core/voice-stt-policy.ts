import { requiredConfigurationForProvider } from './voice-preflight.js';

export interface VoiceSttProviderPolicyEntry {
  provider: 'manual' | 'local-whisper' | 'cloud-stt';
  role: string;
  status: 'supported' | 'planned';
  requiredConfiguration: string[];
  reason?: string;
}

export interface VoiceSttPolicy {
  defaultProvider: 'local-whisper';
  cloudProviderDecision: 'generic-json';
  network: false;
  supported: VoiceSttProviderPolicyEntry[];
  planned: VoiceSttProviderPolicyEntry[];
}

export function buildVoiceSttPolicy(): VoiceSttPolicy {
  return {
    defaultProvider: 'local-whisper',
    cloudProviderDecision: 'generic-json',
    network: false,
    supported: [
      {
        provider: 'manual',
        role: 'manual transcript review',
        status: 'supported',
        requiredConfiguration: requiredConfigurationForProvider('manual'),
      },
      {
        provider: 'local-whisper',
        role: 'offline speech-to-text',
        status: 'supported',
        requiredConfiguration: requiredConfigurationForProvider('local-whisper'),
      },
      {
        provider: 'cloud-stt',
        role: 'generic JSON cloud speech-to-text',
        status: 'supported',
        requiredConfiguration: requiredConfigurationForProvider('cloud-stt'),
      },
    ],
    planned: [],
  };
}

export function formatVoiceSttPolicy(policy: VoiceSttPolicy): string {
  return [
    `Default STT provider: ${policy.defaultProvider}`,
    `Cloud STT decision: ${policy.cloudProviderDecision}`,
    `Network: ${policy.network ? 'yes' : 'no'}`,
    'Supported:',
    ...policy.supported.map((entry) => `- ${entry.provider}: ${entry.role} (${entry.status})`),
    'Planned:',
    ...policy.planned.map((entry) => `- ${entry.provider}: ${entry.reason ?? entry.role}`),
    '',
  ].join('\n');
}
