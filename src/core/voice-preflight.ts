import { accessSync, constants, existsSync } from 'node:fs';
import type { VoiceProvider } from './voice-providers.js';

export interface VoiceProviderConfigurationCheck {
  name: string;
  present: boolean;
}

export interface VoiceProviderPreflight {
  provider: VoiceProvider;
  ready: boolean;
  network: false;
  requiredConfiguration: VoiceProviderConfigurationCheck[];
  missing: string[];
  errors?: string[];
}

export function buildVoiceProviderPreflight(
  provider: VoiceProvider,
  env: NodeJS.ProcessEnv = process.env,
): VoiceProviderPreflight {
  const requiredConfiguration = requiredConfigurationForProvider(provider.id).map((name) => ({
    name,
    present: typeof env[name] === 'string' && env[name].trim().length > 0,
  }));
  const missing = requiredConfiguration.filter((entry) => !entry.present).map((entry) => entry.name);
  const errors = buildProviderConfigurationErrors(provider, env, missing);
  return {
    provider,
    ready: missing.length === 0 && errors.length === 0,
    network: false,
    requiredConfiguration,
    missing,
    ...(errors.length > 0 ? { errors } : {}),
  };
}

export function requiredConfigurationForProvider(providerId: VoiceProvider['id']): string[] {
  if (providerId === 'local-whisper') return ['WHISPER_COMMAND'];
  if (providerId === 'cloud-stt') return ['CLOUD_STT_PROVIDER', 'CLOUD_STT_API_KEY', 'CLOUD_STT_ENDPOINT'];
  return [];
}

function buildProviderConfigurationErrors(
  provider: VoiceProvider,
  env: NodeJS.ProcessEnv,
  missing: string[],
): string[] {
  if (provider.id !== 'local-whisper' || missing.includes('WHISPER_COMMAND')) return [];
  const command = env.WHISPER_COMMAND?.trim();
  if (!command) return [];
  if (!existsSync(command)) return [`WHISPER_COMMAND does not exist: ${command}`];
  try {
    accessSync(command, constants.X_OK);
    return [];
  } catch {
    return [`WHISPER_COMMAND is not executable: ${command}`];
  }
}
