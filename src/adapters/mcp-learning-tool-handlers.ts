import {
  buildDailyReviewAnswer,
  buildDailyReviewPack,
  buildDueDailyReviewItems,
  checkDailyReviewAnswer,
  extractLesson,
} from '../core/lesson.js';
import { buildMethodTemplateLearningItem, findMethodTemplate, listMethodTemplates } from '../core/method-templates.js';
import { buildPronunciationBite } from '../core/pronunciation.js';
import { buildReviewCleanupPlan } from '../core/review-cleanup.js';
import {
  buildDueReviewItems,
  buildUpcomingReviewSchedule,
  isDateKey,
  parsePositiveInteger,
} from '../core/review-schedule.js';
import {
  listLearningItems,
  markLearningItemReview,
  recordLearningItem,
  removeLearningItem,
  updateLearningItem,
} from '../storage/repository.js';
import {
  optionalBoolean,
  optionalNumber,
  optionalString,
  optionalStringArray,
  requireReviewOutcome,
  requireString,
  requireText,
} from './mcp-tool-arguments.js';
import type { EnglishPilotMcpToolName } from './mcp-tool-registry.js';

export function handleLearningMcpTool(
  name: EnglishPilotMcpToolName,
  args: Record<string, unknown>,
): Record<string, unknown> | undefined {
  switch (name) {
    case 'english_method_templates':
      return { templates: listMethodTemplates(optionalString(args, 'scene')) };
    case 'english_extract_lesson': {
      const text = requireText(args);
      return extractLesson(text) as unknown as Record<string, unknown>;
    }
    case 'english_record_learning_item': {
      const original = requireString(args, 'original');
      const suggested = requireString(args, 'suggested');
      const item = recordLearningItem({
        original,
        suggested,
        scene: optionalString(args, 'scene'),
        tags: optionalStringArray(args, 'tags'),
      });
      return { item };
    }
    case 'english_record_method_template': {
      const template = findMethodTemplate(requireString(args, 'id'));
      if (!template) throw new Error('MCP argument id must be a known method template id.');
      const item = recordLearningItem(buildMethodTemplateLearningItem(template));
      return { item };
    }
    case 'english_review_queue':
      return { items: listLearningItems() };
    case 'english_review_due': {
      const date = optionalDate(args);
      return { date, items: buildDueReviewItems(listLearningItems(), date) };
    }
    case 'english_review_upcoming': {
      const date = optionalDate(args);
      const days = optionalNumber(args, 'days') ?? parsePositiveInteger(optionalString(args, 'days'), 7);
      return { date, days, groups: buildUpcomingReviewSchedule(listLearningItems(), date, days) };
    }
    case 'english_daily_review':
      return { items: buildDueDailyReviewItems(listLearningItems()) };
    case 'english_daily_check': {
      const id = requireString(args, 'id');
      const item = listLearningItems().find((candidate) => candidate.id === id);
      if (!item) return { error: `Learning item not found: ${id}` };
      return {
        item: buildDailyReviewAnswer(item),
        check: checkDailyReviewAnswer(item, requireString(args, 'answer')),
      };
    }
    case 'english_daily_pack':
      return buildDailyReviewPack(listLearningItems(), optionalDate(args)) as unknown as Record<string, unknown>;
    case 'english_mark_review': {
      const id = requireString(args, 'id');
      const outcome = requireReviewOutcome(args);
      const item = markLearningItemReview(id, outcome);
      return item ? { item } : { error: `Learning item not found: ${id}` };
    }
    case 'english_update_review_item': {
      const id = requireString(args, 'id');
      const suggested = optionalString(args, 'suggested');
      const update = {
        ...(optionalString(args, 'original') !== undefined
          ? { original: optionalString(args, 'original') as string }
          : {}),
        ...(suggested !== undefined ? { suggested, ipa: buildPronunciationBite(suggested, 6) } : {}),
        ...(optionalString(args, 'scene') !== undefined ? { scene: optionalString(args, 'scene') as string } : {}),
        ...(optionalString(args, 'pattern') !== undefined
          ? { pattern: optionalString(args, 'pattern') as string }
          : {}),
        ...(optionalStringArray(args, 'tags') !== undefined
          ? { tags: optionalStringArray(args, 'tags') as string[] }
          : {}),
      };
      if (Object.keys(update).length === 0) {
        throw new Error('MCP english_update_review_item requires at least one field to update.');
      }
      const item = updateLearningItem(id, update);
      return item ? { item } : { error: `Learning item not found: ${id}` };
    }
    case 'english_remove_review_item': {
      const id = requireString(args, 'id');
      const item = removeLearningItem(id);
      return item ? { removed: true, item } : { removed: false, error: `Learning item not found: ${id}` };
    }
    case 'english_review_cleanup': {
      const confirm = optionalBoolean(args, 'confirm') ?? false;
      const plan = buildReviewCleanupPlan(listLearningItems());
      const removed = confirm
        ? plan.candidates
            .map((candidate) => removeLearningItem(candidate.id))
            .filter((item): item is NonNullable<typeof item> => item !== undefined)
        : [];
      return {
        mode: confirm ? 'delete' : 'preview',
        candidateCount: plan.candidateCount,
        candidates: plan.candidates,
        ...(confirm ? { removedCount: removed.length, removed: removed.map((item) => item.id) } : {}),
      };
    }
    default:
      return undefined;
  }
}

function optionalDate(args: Record<string, unknown>): string {
  const date = optionalString(args, 'date') ?? new Date().toISOString().slice(0, 10);
  if (!isDateKey(date)) throw new Error('MCP argument date must use YYYY-MM-DD.');
  return date;
}
