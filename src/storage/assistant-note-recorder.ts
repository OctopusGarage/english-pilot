import {
  buildAssistantEnglishNoteLearningItem,
  type AssistantEnglishNote,
  type AssistantEnglishNoteSource,
} from '../core/assistant-note.js';
import { recordLearningItem, updateLearningItem, type LearningItem } from './repository.js';

export function recordAssistantEnglishNote(
  source: AssistantEnglishNoteSource,
  note: AssistantEnglishNote,
): LearningItem {
  const draft = buildAssistantEnglishNoteLearningItem(source, note);
  const item = recordLearningItem(draft);
  if (!item) throw new Error('Assistant English note did not meet the learning-item quality policy.');
  return (
    updateLearningItem(item.id, {
      original: draft.original,
      suggested: draft.suggested,
      ...(draft.scene ? { scene: draft.scene } : {}),
      ...(draft.tags ? { tags: draft.tags } : {}),
      ...(draft.pattern ? { pattern: draft.pattern } : {}),
      ...(draft.ipa ? { ipa: draft.ipa } : {}),
    }) ?? item
  );
}
