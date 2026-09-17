import type { GlossaryEntry } from './glossary.js';
import {
  buildLocalTranslationResult,
  type LocalTranslationResult,
  type TranslationRequest,
  type TranslationStageResponse,
} from './translation-result.js';

export interface LocalTranslationLearningItemDraft {
  original: string;
  suggested: string;
  scene: string;
  pattern: string;
  tags: string[];
  ipa?: LocalTranslationResult['ipa'];
}

export interface LocalTranslationLookupOptions<Item = unknown> {
  glossary: GlossaryEntry[];
  record?: boolean;
  recordLearningItem?: (item: LocalTranslationLearningItemDraft) => Item;
}

export type LocalTranslationLookupResponse<Item = unknown> = TranslationStageResponse & {
  result: LocalTranslationResult;
  recorded: boolean;
  item?: Item;
};

export function performLocalTranslationLookup(
  request: TranslationRequest,
  options: LocalTranslationLookupOptions,
): LocalTranslationLookupResponse {
  const result = buildLocalTranslationResult(request.text, options.glossary);
  const item =
    options.record && result.lesson.worthRecording && options.recordLearningItem
      ? options.recordLearningItem({
          original: result.original,
          suggested: result.lesson.suggested,
          scene: result.lesson.scene,
          pattern: result.lesson.pattern,
          tags: [...new Set([...result.lesson.tags, 'ghostty-lookup'])],
          ipa: result.ipa,
        })
      : undefined;

  return {
    requestId: request.requestId,
    source: request.source,
    stage: 'local',
    status: 'ready',
    result,
    recorded: item !== undefined,
    ...(item ? { item } : {}),
  };
}
