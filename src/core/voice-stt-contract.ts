import { parseVoiceTranscriptionJson, type VoiceTranscriptionWord } from './voice-transcription.js';

export interface VoiceSttContractField {
  name: string;
  required: boolean;
  description: string;
}

export interface VoiceSttContract {
  provider: 'generic-json';
  request: {
    method: 'POST';
    headers: string[];
    body: {
      provider: 'generic-json';
      audioBase64: '<base64 wav/mp3/m4a bytes>';
    };
  };
  acceptedResponseFields: VoiceSttContractField[];
  normalizedOutput: string[];
  exampleResponse: {
    transcript: string;
    words: Array<{
      word: string;
      start: number;
      end: number;
      confidence: number;
      phonemes: Array<{
        phoneme: string;
        start: number;
        end: number;
        confidence: number;
      }>;
    }>;
  };
  notes: string[];
}

export interface VoiceSttValidationResult {
  provider: 'generic-json';
  valid: boolean;
  parsed: {
    transcript: string;
    wordCount: number;
    phonemeCount: number;
    words?: VoiceTranscriptionWord[];
  };
  blockers: string[];
}

export function buildVoiceSttContract(): VoiceSttContract {
  return {
    provider: 'generic-json',
    request: {
      method: 'POST',
      headers: ['Authorization: Bearer $CLOUD_STT_API_KEY', 'Content-Type: application/json'],
      body: {
        provider: 'generic-json',
        audioBase64: '<base64 wav/mp3/m4a bytes>',
      },
    },
    acceptedResponseFields: [
      {
        name: 'text',
        required: false,
        description: 'Plain transcript text. Used when transcript is not present.',
      },
      {
        name: 'transcript',
        required: false,
        description: 'Preferred plain transcript text.',
      },
      {
        name: 'segments[].text',
        required: false,
        description: 'Optional segment text joined when root text/transcript is absent.',
      },
      {
        name: 'words[].word',
        required: false,
        description: 'Recognized word token for pronunciation feedback.',
      },
      {
        name: 'words[].start',
        required: false,
        description: 'Word start time in seconds; normalized to startSeconds.',
      },
      {
        name: 'words[].end',
        required: false,
        description: 'Word end time in seconds; normalized to endSeconds.',
      },
      {
        name: 'words[].confidence',
        required: false,
        description: 'Word confidence from 0 to 1.',
      },
      {
        name: 'words[].phonemes[].phoneme',
        required: false,
        description: 'Phoneme-level symbol attached to a word.',
      },
      {
        name: 'phonemes[].word',
        required: false,
        description: 'Root-level or segment-level phoneme word anchor; attached to the matching word.',
      },
    ],
    normalizedOutput: [
      'transcript',
      'words[].word',
      'words[].startSeconds',
      'words[].endSeconds',
      'words[].confidence',
      'words[].phonemes[]',
    ],
    exampleResponse: {
      transcript: 'I want to create a new project.',
      words: [
        {
          word: 'project',
          start: 1.2,
          end: 1.8,
          confidence: 0.86,
          phonemes: [
            {
              phoneme: 'pr',
              start: 1.2,
              end: 1.32,
              confidence: 0.82,
            },
          ],
        },
      ],
    },
    notes: [
      'At least one of transcript, text, or segment text must be present.',
      'Local Whisper wrappers may print the same JSON shape to stdout; plain stdout is also accepted as transcript text.',
      'Cloud STT providers are called through CLOUD_STT_ENDPOINT and must not return API keys or provider secrets.',
    ],
  };
}

export function validateVoiceSttResponse(response: unknown): VoiceSttValidationResult {
  const parsed = parseVoiceTranscriptionJson(response);
  const words = parsed.words ?? [];
  const transcript = parsed.transcript;
  const phonemeCount = words.reduce((count, word) => count + (word.phonemes?.length ?? 0), 0);
  const blockers = [...(transcript ? [] : ['Response must include transcript, text, or segments[].text.'])];
  return {
    provider: 'generic-json',
    valid: blockers.length === 0,
    parsed: {
      transcript,
      wordCount: words.length,
      phonemeCount,
      ...(words.length > 0 ? { words } : {}),
    },
    blockers,
  };
}

export function formatVoiceSttContract(contract: VoiceSttContract): string {
  return [
    'Generic JSON STT contract',
    `Provider: ${contract.provider}`,
    `Request: ${contract.request.method} $CLOUD_STT_ENDPOINT`,
    'Headers:',
    ...contract.request.headers.map((header) => `- ${header}`),
    'Request body:',
    `- provider: ${contract.request.body.provider}`,
    `- audioBase64: ${contract.request.body.audioBase64}`,
    '',
    'Accepted response fields:',
    ...contract.acceptedResponseFields.map(
      (field) => `- ${field.name}${field.required ? ' (required)' : ''}: ${field.description}`,
    ),
    '',
    'Normalized output:',
    ...contract.normalizedOutput.map((field) => `- ${field}`),
    '',
  ].join('\n');
}

export function formatVoiceSttValidation(result: VoiceSttValidationResult): string {
  return [
    `STT response valid: ${result.valid ? 'yes' : 'no'}`,
    `Transcript: ${result.parsed.transcript || '(missing)'}`,
    `Words: ${result.parsed.wordCount}`,
    `Phonemes: ${result.parsed.phonemeCount}`,
    '',
    'Blockers',
    ...(result.blockers.length > 0 ? result.blockers.map((blocker) => `- ${blocker}`) : ['- none']),
    '',
  ].join('\n');
}
