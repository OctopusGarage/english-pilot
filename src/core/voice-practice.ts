import type { LearningItemDraft } from './learning-card.js';
import { buildPronunciationBite } from './pronunciation.js';
import {
  transcribeWithLocalWhisper,
  type VoiceFetch,
  type VoiceTranscriptionResult,
  type VoiceTranscriptionWord,
} from './voice-transcription.js';
import { transcribeVoiceAudio } from './voice-stt-gateway.js';
import type { VoiceProvider } from './voice-providers.js';

export interface VoicePracticeInput {
  transcript: string;
  target: string;
  feedback?: string;
  words?: VoiceTranscriptionWord[];
}

export interface VoicePracticeFromAudioInput {
  provider: VoiceProvider;
  audioPath: string;
  target: string;
  feedback?: string;
  env?: NodeJS.ProcessEnv;
  fetch?: VoiceFetch;
}

export interface VoicePracticeFromAudioDraft {
  transcription: VoiceTranscriptionResult;
  draft: LearningItemDraft;
}

export function buildVoicePracticeLearningItem(input: VoicePracticeInput): LearningItemDraft {
  const feedback = input.feedback?.trim() || suggestVoicePracticeFeedback(input.transcript, input.target, input.words);
  return {
    original: input.transcript.trim(),
    suggested: input.target.trim(),
    scene: 'voice practice',
    tags: ['voice-practice', 'pronunciation'],
    pattern: `Voice practice feedback: ${feedback}`,
    ipa: buildPronunciationBite(input.target, 6),
  };
}

export function buildVoicePracticeFromAudio(input: VoicePracticeFromAudioInput): VoicePracticeFromAudioDraft {
  const transcription = transcribeWithLocalWhisper(input.provider, input.audioPath);
  return {
    transcription,
    draft: buildVoicePracticeLearningItem({
      transcript: transcription.transcript,
      target: input.target,
      feedback: input.feedback,
      words: transcription.words,
    }),
  };
}

export async function buildVoicePracticeFromAudioAsync(
  input: VoicePracticeFromAudioInput,
): Promise<VoicePracticeFromAudioDraft> {
  const transcription = await transcribeVoiceAudio(input);
  return {
    transcription,
    draft: buildVoicePracticeLearningItem({
      transcript: transcription.transcript,
      target: input.target,
      feedback: input.feedback,
      words: transcription.words,
    }),
  };
}

export function suggestVoicePracticeFeedback(
  transcript: string,
  target: string,
  words: VoiceTranscriptionWord[] = [],
): string {
  const transcriptTokens = tokenizeSpeechText(transcript);
  const targetTokens = tokenizeSpeechText(target);
  const missing = findMissingOrderedTokens(transcriptTokens, targetTokens);
  const notes: string[] = [];
  if (missing.length > 0) {
    notes.push(`Missing words: ${missing.join(', ')}.`);
  }
  notes.push(...buildGrammarFocusNotes(missing, targetTokens));
  const extra = findMissingOrderedTokens(targetTokens, transcriptTokens);
  if (extra.length > 0) {
    notes.push(`Extra words in transcript: ${extra.join(', ')}.`);
  }
  const scoring = buildWordLevelPronunciationScoring(words);
  if (scoring) notes.push(scoring);
  const phonemeScoring = buildPhonemeLevelPronunciationScoring(words);
  if (phonemeScoring) notes.push(phonemeScoring);
  const pronunciationFocus = buildPronunciationFocus(target);
  if (pronunciationFocus) notes.push(pronunciationFocus);
  if (notes.length === 0) {
    notes.push('Transcript matches the target words; practice rhythm, stress, and clear pronunciation.');
  }
  return notes.join(' ');
}

function tokenizeSpeechText(value: string): string[] {
  return value.toLowerCase().match(/[a-z]+(?:'[a-z]+)?/g) ?? [];
}

function findMissingOrderedTokens(source: string[], target: string[]): string[] {
  const missing: string[] = [];
  let sourceIndex = 0;
  for (const token of target) {
    const foundAt = source.indexOf(token, sourceIndex);
    if (foundAt >= 0) {
      sourceIndex = foundAt + 1;
    } else {
      missing.push(token);
    }
  }
  return missing;
}

function buildGrammarFocusNotes(missing: string[], targetTokens: string[]): string[] {
  const notes: string[] = [];
  const missingSet = new Set(missing);
  if (missingSet.has('to') && containsAdjacent(targetTokens, 'want', 'to')) {
    notes.push('Grammar focus: use "want to + verb" for intentions.');
  }
  if (['a', 'an', 'the'].some((article) => missingSet.has(article))) {
    notes.push('Article focus: use "a" before a singular countable noun when introducing one item.');
  }
  return notes;
}

function containsAdjacent(tokens: string[], first: string, second: string): boolean {
  return tokens.some((token, index) => token === first && tokens[index + 1] === second);
}

function buildPronunciationFocus(target: string): string | undefined {
  const entries = buildPronunciationBite(target, 2);
  if (entries.length === 0) return undefined;
  return `Pronunciation focus: ${entries.map((entry) => `${entry.word} ${entry.ipa}`).join(', ')}.`;
}

function buildWordLevelPronunciationScoring(words: VoiceTranscriptionWord[]): string | undefined {
  const scoredWords = words.filter((word) => typeof word.confidence === 'number');
  if (scoredWords.length === 0) return undefined;
  const average = scoredWords.reduce((sum, word) => sum + (word.confidence as number), 0) / scoredWords.length;
  const lowConfidenceWords = scoredWords.filter((word) => (word.confidence as number) < 0.75).map((word) => word.word);
  const parts = [`Pronunciation scoring: average confidence ${Math.round(average * 100)}%.`];
  if (lowConfidenceWords.length > 0) {
    parts.push(`Low-confidence words: ${[...new Set(lowConfidenceWords)].join(', ')}.`);
  }
  if (words.some((word) => typeof word.startSeconds === 'number' || typeof word.endSeconds === 'number')) {
    parts.push('Word timing is available for follow-up rhythm review.');
  }
  return parts.join(' ');
}

function buildPhonemeLevelPronunciationScoring(words: VoiceTranscriptionWord[]): string | undefined {
  const phonemes = words.flatMap((word) =>
    (word.phonemes ?? []).map((phoneme) => ({
      ...phoneme,
      word: word.word,
    })),
  );
  const scoredPhonemes = phonemes.filter((phoneme) => typeof phoneme.confidence === 'number');
  if (scoredPhonemes.length === 0) return undefined;
  const average =
    scoredPhonemes.reduce((sum, phoneme) => sum + (phoneme.confidence as number), 0) / scoredPhonemes.length;
  const lowConfidencePhonemes = scoredPhonemes
    .filter((phoneme) => (phoneme.confidence as number) < 0.7)
    .map((phoneme) => `${phoneme.word}/${phoneme.phoneme}`);
  const parts = [`Phoneme scoring: average confidence ${Math.round(average * 100)}%.`];
  if (lowConfidencePhonemes.length > 0) {
    parts.push(`Low-confidence phonemes: ${[...new Set(lowConfidencePhonemes)].join(', ')}.`);
  }
  if (phonemes.some((phoneme) => typeof phoneme.startSeconds === 'number' || typeof phoneme.endSeconds === 'number')) {
    parts.push('Phoneme timing is available for precise articulation review.');
  }
  return parts.join(' ');
}
