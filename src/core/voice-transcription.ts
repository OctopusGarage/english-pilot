import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import type { VoiceProvider } from './voice-providers.js';

export interface VoiceTranscriptionWord {
  word: string;
  startSeconds?: number;
  endSeconds?: number;
  confidence?: number;
  phonemes?: VoiceTranscriptionPhoneme[];
}

export interface VoiceTranscriptionPhoneme {
  phoneme: string;
  word?: string;
  startSeconds?: number;
  endSeconds?: number;
  confidence?: number;
}

export interface VoiceTranscriptionResult {
  provider: VoiceProvider;
  audioPath: string;
  transcript: string;
  words?: VoiceTranscriptionWord[];
  network: boolean;
  cloud?: {
    provider: 'generic-json';
    endpoint: string;
    storedSecrets: false;
  };
}

export type VoiceFetch = (
  url: string,
  init: {
    method: 'POST';
    headers?: Record<string, string>;
    body?: string;
  },
) => Promise<VoiceHttpResponse>;

export interface VoiceHttpResponse {
  ok: boolean;
  status: number;
  json: () => Promise<unknown>;
  text: () => Promise<string>;
}

export function transcribeWithLocalWhisper(
  provider: VoiceProvider,
  audioPath: string,
  env: NodeJS.ProcessEnv = process.env,
): VoiceTranscriptionResult {
  if (provider.id !== 'local-whisper') {
    throw new Error('Voice transcription currently supports local-whisper only.');
  }

  const command = env.WHISPER_COMMAND?.trim();
  if (!command) {
    throw new Error('WHISPER_COMMAND is not configured.');
  }

  if (!existsSync(audioPath)) {
    throw new Error(`Audio file not found: ${audioPath}`);
  }

  const result = spawnSync(command, [audioPath], {
    encoding: 'utf8',
    timeout: 120_000,
    maxBuffer: 1024 * 1024,
  });
  if (result.error) {
    throw new Error(`Local Whisper command failed: ${result.error.message}`);
  }
  if (result.status !== 0) {
    const details = normalizeTranscript(result.stderr || result.stdout);
    throw new Error(`Local Whisper command exited with code ${result.status}${details ? `: ${details}` : ''}`);
  }

  const parsed = parseVoiceTranscriptionOutput(result.stdout);
  const transcript = parsed.transcript;
  if (!transcript) {
    throw new Error('Local Whisper command did not return a transcript on stdout.');
  }

  return {
    provider,
    audioPath,
    transcript,
    ...(parsed.words && parsed.words.length > 0 ? { words: parsed.words } : {}),
    network: false,
  };
}

export async function transcribeWithCloudStt(input: {
  provider: VoiceProvider;
  audioPath: string;
  env?: NodeJS.ProcessEnv;
  fetch?: VoiceFetch;
}): Promise<VoiceTranscriptionResult> {
  if (input.provider.id !== 'cloud-stt') {
    throw new Error('Cloud voice transcription requires provider cloud-stt.');
  }
  const env = input.env ?? process.env;
  const cloudProvider = env.CLOUD_STT_PROVIDER?.trim();
  const apiKey = env.CLOUD_STT_API_KEY?.trim();
  const endpoint = env.CLOUD_STT_ENDPOINT?.trim();
  if (cloudProvider !== 'generic-json') {
    throw new Error('CLOUD_STT_PROVIDER must be generic-json.');
  }
  if (!apiKey) throw new Error('CLOUD_STT_API_KEY is not configured.');
  if (!endpoint) throw new Error('CLOUD_STT_ENDPOINT is not configured.');
  if (!existsSync(input.audioPath)) {
    throw new Error(`Audio file not found: ${input.audioPath}`);
  }

  const response = await (input.fetch ?? defaultVoiceFetch)(endpoint, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      provider: cloudProvider,
      audioBase64: readFileSync(input.audioPath).toString('base64'),
    }),
  });
  if (!response.ok) {
    throw new Error(`Cloud STT request failed (${response.status}): ${await response.text()}`);
  }
  const parsed = parseVoiceTranscriptionJson(await response.json());
  if (!parsed.transcript) {
    throw new Error('Cloud STT response did not include a transcript.');
  }
  return {
    provider: input.provider,
    audioPath: input.audioPath,
    transcript: parsed.transcript,
    ...(parsed.words && parsed.words.length > 0 ? { words: parsed.words } : {}),
    network: true,
    cloud: {
      provider: 'generic-json',
      endpoint,
      storedSecrets: false,
    },
  };
}

export function parseVoiceTranscriptionOutput(value: string): { transcript: string; words?: VoiceTranscriptionWord[] } {
  const trimmed = value.trim();
  if (!trimmed) return { transcript: '' };
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try {
      const parsed = JSON.parse(trimmed) as unknown;
      const result = parseVoiceTranscriptionJson(parsed);
      if (result.transcript) return result;
    } catch {
      // Fall through to plain-text handling for commands that print non-JSON logs.
    }
  }
  return { transcript: normalizeTranscript(value) };
}

export function parseVoiceTranscriptionJson(value: unknown): { transcript: string; words?: VoiceTranscriptionWord[] } {
  const transcript = transcriptFromJson(value);
  const words = wordsFromJson(value);
  return { transcript, ...(words.length > 0 ? { words } : {}) };
}

function transcriptFromJson(value: unknown): string {
  if (!isRecord(value)) return '';
  const transcript = firstString(value.transcript, value.text);
  if (transcript) return normalizeTranscript(transcript);
  const segments = Array.isArray(value.segments) ? value.segments : [];
  const segmentText = segments
    .filter(isRecord)
    .map((segment) => firstString(segment.text, segment.transcript))
    .filter(Boolean)
    .join(' ');
  return normalizeTranscript(segmentText);
}

function wordsFromJson(value: unknown): VoiceTranscriptionWord[] {
  if (!isRecord(value)) return [];
  const directWords = Array.isArray(value.words) ? value.words : [];
  const segments = (Array.isArray(value.segments) ? value.segments : []).filter(isRecord);
  const segmentWords = segments.flatMap((segment) => (Array.isArray(segment.words) ? segment.words : []));
  const words = [...directWords, ...segmentWords]
    .map(wordFromJson)
    .filter((word): word is VoiceTranscriptionWord => word !== undefined);
  const detachedPhonemes = [
    ...phonemesFromArray(value.phonemes),
    ...segments.flatMap((segment) => phonemesFromArray(segment.phonemes)),
  ];
  return attachDetachedPhonemes(words, detachedPhonemes);
}

function wordFromJson(value: unknown): VoiceTranscriptionWord | undefined {
  if (!isRecord(value)) return undefined;
  const word = firstString(value.word, value.text, value.token)?.trim();
  if (!word) return undefined;
  const phonemes = phonemesFromArray(value.phonemes);
  return {
    word,
    ...optionalNumberProperty('startSeconds', firstNumber(value.startSeconds, value.start)),
    ...optionalNumberProperty('endSeconds', firstNumber(value.endSeconds, value.end)),
    ...optionalNumberProperty('confidence', firstNumber(value.confidence, value.probability, value.score)),
    ...(phonemes.length > 0 ? { phonemes } : {}),
  };
}

function phonemesFromArray(value: unknown): VoiceTranscriptionPhoneme[] {
  if (!Array.isArray(value)) return [];
  return value.map(phonemeFromJson).filter((phoneme): phoneme is VoiceTranscriptionPhoneme => phoneme !== undefined);
}

function phonemeFromJson(value: unknown): VoiceTranscriptionPhoneme | undefined {
  if (!isRecord(value)) return undefined;
  const phoneme = firstString(value.phoneme, value.phone, value.symbol, value.text)?.trim();
  if (!phoneme) return undefined;
  const word = firstString(value.word, value.wordText, value.parentWord)?.trim();
  return {
    phoneme,
    ...(word ? { word } : {}),
    ...optionalNumberProperty('startSeconds', firstNumber(value.startSeconds, value.start)),
    ...optionalNumberProperty('endSeconds', firstNumber(value.endSeconds, value.end)),
    ...optionalNumberProperty('confidence', firstNumber(value.confidence, value.probability, value.score)),
  };
}

function attachDetachedPhonemes(
  words: VoiceTranscriptionWord[],
  phonemes: VoiceTranscriptionPhoneme[],
): VoiceTranscriptionWord[] {
  if (phonemes.length === 0) return words;
  const normalizedWords = new Map(words.map((word) => [normalizeWordKey(word.word), word]));
  const unassigned: VoiceTranscriptionPhoneme[] = [];
  for (const phoneme of phonemes) {
    if (!phoneme.word) {
      unassigned.push(phoneme);
      continue;
    }
    const key = normalizeWordKey(phoneme.word);
    const word = normalizedWords.get(key);
    if (word) {
      word.phonemes = [...(word.phonemes ?? []), withoutWordLink(phoneme)];
      continue;
    }
    const newWord: VoiceTranscriptionWord = {
      word: phoneme.word,
      phonemes: [withoutWordLink(phoneme)],
    };
    words.push(newWord);
    normalizedWords.set(key, newWord);
  }
  if (unassigned.length > 0 && words.length > 0) {
    words[words.length - 1].phonemes = [
      ...(words[words.length - 1].phonemes ?? []),
      ...unassigned.map(withoutWordLink),
    ];
  }
  return words;
}

function withoutWordLink(phoneme: VoiceTranscriptionPhoneme): VoiceTranscriptionPhoneme {
  const { word: _word, ...rest } = phoneme;
  return rest;
}

function normalizeWordKey(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9']/g, '');
}

function normalizeTranscript(value: string): string {
  return value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function firstString(...values: unknown[]): string | undefined {
  return values.find((value): value is string => typeof value === 'string');
}

function firstNumber(...values: unknown[]): number | undefined {
  return values.find((value): value is number => typeof value === 'number' && Number.isFinite(value));
}

function optionalNumberProperty(
  key: 'startSeconds' | 'endSeconds' | 'confidence',
  value: number | undefined,
): Partial<VoiceTranscriptionWord> {
  return value === undefined ? {} : { [key]: value };
}

async function defaultVoiceFetch(
  url: string,
  init: {
    method: 'POST';
    headers?: Record<string, string>;
    body?: string;
  },
): Promise<VoiceHttpResponse> {
  const response = await fetch(url, init);
  return {
    ok: response.ok,
    status: response.status,
    json: () => response.json() as Promise<unknown>,
    text: () => response.text(),
  };
}
