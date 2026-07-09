import { z } from 'zod';
import type { McpToolDefinition } from './mcp-tool-types.js';

export const voiceMcpToolDefinitions = [
  {
    name: 'english_voice_providers',
    description: 'List supported and planned EnglishPilot voice input providers.',
    inputSchema: {},
    mode: 'sync',
  },

  {
    name: 'english_voice_stt_policy',
    description: 'Return the first-version speech-to-text provider policy.',
    inputSchema: {},
    mode: 'sync',
  },

  {
    name: 'english_voice_stt_contract',
    description:
      'Return the generic JSON speech-to-text request and response contract used by local wrappers and cloud STT.',
    inputSchema: {},
    mode: 'sync',
  },

  {
    name: 'english_voice_stt_validate',
    description: 'Validate a generic JSON speech-to-text response against the EnglishPilot parser contract.',
    inputSchema: {
      response: z.record(z.string(), z.unknown()),
    },
    mode: 'sync',
  },

  {
    name: 'english_voice_stt_assess_provider',
    description: 'Assess whether a concrete cloud STT provider sample response needs a provider-specific contract.',
    inputSchema: {
      providerName: z.string(),
      response: z.record(z.string(), z.unknown()),
      record: z.boolean().optional(),
    },
    mode: 'sync',
  },

  {
    name: 'english_voice_stt_assessment_history',
    description: 'Return recorded cloud STT provider assessment evidence, optionally filtered by provider name.',
    inputSchema: {
      providerName: z.string().optional(),
    },
    mode: 'sync',
  },

  {
    name: 'english_voice_stt_provider_contract_draft',
    description: 'Draft a provider-specific cloud STT contract plan from recorded generic JSON compatibility evidence.',
    inputSchema: {
      providerName: z.string(),
    },
    mode: 'sync',
  },

  {
    name: 'english_voice_stt_wrapper_template',
    description:
      'Return a local Python wrapper template that adapts plain-text or provider-specific STT commands to the EnglishPilot generic JSON contract.',
    inputSchema: {},
    mode: 'sync',
  },

  {
    name: 'english_voice_preflight',
    description: 'Check a voice input provider configuration without network calls.',
    inputSchema: {
      provider: z.enum(['manual', 'local-whisper', 'cloud-stt']),
    },
    mode: 'sync',
  },

  {
    name: 'english_voice_transcribe',
    description: 'Transcribe an audio file through local Whisper or the generic JSON cloud STT provider.',
    inputSchema: {
      provider: z.enum(['local-whisper', 'cloud-stt']),
      audioPath: z.string(),
    },
    mode: 'async',
  },

  {
    name: 'english_voice_practice_from_audio',
    description:
      'Transcribe an audio file through local Whisper or cloud STT and record it as a voice-practice learning item.',
    inputSchema: {
      provider: z.enum(['local-whisper', 'cloud-stt']),
      audioPath: z.string(),
      target: z.string(),
      feedback: z.string().optional(),
    },
    mode: 'async',
  },
] as const satisfies readonly McpToolDefinition[];
