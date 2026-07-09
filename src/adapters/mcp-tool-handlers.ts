import { join } from 'node:path';
import { analyzeText } from '../core/analyze.js';
import { suggestRewrite } from '../core/coach.js';
import { buildCoachingContext } from '../core/coaching-context.js';
import {
  applyConfigProfile,
  buildConfigProfileStatus,
  configProfiles,
  findConfigProfile,
} from '../core/config-profiles.js';
import { doctor, getEnglishPilotHome, loadConfig, writeDoctorMarkdown } from '../core/config.js';
import { buildExternalValidationBundle, verifyExternalValidationBundle } from '../core/external-validation-bundle.js';
import { listGlossaryEntries } from '../core/glossary.js';
import {
  buildDailyReviewAnswer,
  buildDailyReviewPack,
  buildDueDailyReviewItems,
  checkDailyReviewAnswer,
  extractLesson,
} from '../core/lesson.js';
import { buildMethodTemplateLearningItem, findMethodTemplate, listMethodTemplates } from '../core/method-templates.js';
import { buildPronunciationBite, lookupPronunciations } from '../core/pronunciation.js';
import {
  buildRoadmap,
  buildRoadmapEnvTemplate,
  buildRoadmapNextActions,
  isRoadmapTarget,
  writeRoadmapMarkdown,
  writeRoadmapNextActionsMarkdown,
} from '../core/roadmap.js';
import { buildProjectStatus } from '../core/status.js';
import { applyRatioProgressionSuggestion, buildRatioProgressionSuggestion } from '../core/ratio-progression.js';
import { buildIntegrationAccountGuide } from '../integrations/account-guide.js';
import { buildIntegrationCredentialPolicy } from '../integrations/credential-policy.js';
import { buildIntegrationDeliveryModePolicy } from '../integrations/delivery-mode.js';
import { deliverObsidianDailyReview } from '../integrations/deliver.js';
import {
  buildDailyReviewDeliveryDryRun,
  buildDailyReviewDeliveryPayload,
  buildDailyReviewDeliveryReadiness,
  runDailyReviewAccountValidation,
  runDailyReviewDeliverySend,
} from '../integrations/daily-review-delivery.js';
import {
  buildIntegrationMessageLearningItem,
  buildIntegrationMessageCoachingPayload,
} from '../integrations/message-coaching.js';
import { buildIntegrationEventCoaching } from '../integrations/message-events.js';
import { buildIntegrationPreflight } from '../integrations/preflight.js';
import type { IntegrationFetch } from '../integrations/network-sender.js';
import { listIntegrationTargets } from '../integrations/targets.js';
import { listIntegrationValidationRecords } from '../integrations/validation-history.js';
import {
  buildDueReviewItems,
  buildUpcomingReviewSchedule,
  isDateKey,
  parsePositiveInteger,
} from '../core/review-schedule.js';
import { buildReviewCleanupPlan } from '../core/review-cleanup.js';
import {
  listLearningItems,
  listPromptEvents,
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
  requireIntegrationMessageTarget,
  requireIntegrationTarget,
  requireObject,
  requireReviewOutcome,
  requireString,
  requireText,
} from './mcp-tool-arguments.js';
import { mcpToolNames, type EnglishPilotMcpToolName } from './mcp-tool-registry.js';
import { handleVoiceMcpToolCall, handleVoiceMcpToolCallAsync } from './mcp-voice-tool-handlers.js';

export function handleMcpToolCall(
  name: EnglishPilotMcpToolName,
  args: Record<string, unknown>,
): Record<string, unknown> {
  switch (name) {
    case 'english_analyze_text': {
      const text = requireText(args);
      return analyzeText(text, loadConfig(), allowedGlossaryTerms()) as unknown as Record<string, unknown>;
    }
    case 'english_status':
      return buildProjectStatus(mcpToolNames) as unknown as Record<string, unknown>;
    case 'english_roadmap': {
      const target = optionalString(args, 'target');
      if (target !== undefined && !isRoadmapTarget(target)) {
        throw new Error('MCP argument target must be feishu, wechat, or cloud-stt when provided.');
      }
      const roadmap = buildRoadmap({ target });
      const roadmapExport =
        optionalBoolean(args, 'write') === true
          ? writeRoadmapMarkdown(
              roadmap,
              optionalString(args, 'directory') ?? join(getEnglishPilotHome(), 'roadmap'),
              target,
            )
          : undefined;
      return (roadmapExport ? { ...roadmap, export: roadmapExport } : roadmap) as unknown as Record<string, unknown>;
    }
    case 'english_roadmap_next': {
      const target = optionalString(args, 'target');
      if (target !== undefined && !isRoadmapTarget(target)) {
        throw new Error('MCP argument target must be feishu, wechat, or cloud-stt when provided.');
      }
      const nextActions = buildRoadmapNextActions(buildRoadmap({ target }));
      const nextActionsExport =
        optionalBoolean(args, 'write') === true
          ? writeRoadmapNextActionsMarkdown(
              nextActions,
              optionalString(args, 'directory') ?? join(getEnglishPilotHome(), 'roadmap'),
              target,
            )
          : undefined;
      return (nextActionsExport ? { ...nextActions, export: nextActionsExport } : nextActions) as unknown as Record<
        string,
        unknown
      >;
    }
    case 'english_roadmap_env_template': {
      const target = optionalString(args, 'target');
      if (target !== undefined && !isRoadmapTarget(target)) {
        throw new Error('MCP argument target must be feishu, wechat, or cloud-stt when provided.');
      }
      return buildRoadmapEnvTemplate({ target }) as unknown as Record<string, unknown>;
    }
    case 'english_external_validation_bundle': {
      const target = optionalString(args, 'target');
      if (target !== undefined && !isRoadmapTarget(target)) {
        throw new Error('MCP argument target must be feishu, wechat, or cloud-stt when provided.');
      }
      return buildExternalValidationBundle({
        directory: optionalString(args, 'directory') ?? join(getEnglishPilotHome(), 'external-validation'),
        target,
        write: optionalBoolean(args, 'write') ?? false,
      }) as unknown as Record<string, unknown>;
    }
    case 'english_external_validation_bundle_verify': {
      const target = optionalString(args, 'target');
      if (target !== undefined && !isRoadmapTarget(target)) {
        throw new Error('MCP argument target must be feishu, wechat, or cloud-stt when provided.');
      }
      return verifyExternalValidationBundle({
        directory: optionalString(args, 'directory') ?? join(getEnglishPilotHome(), 'external-validation'),
        target,
      }) as unknown as Record<string, unknown>;
    }
    case 'english_config_profiles':
      return { profiles: configProfiles } as unknown as Record<string, unknown>;
    case 'english_config_use': {
      const profile = findConfigProfile(requireString(args, 'profile'));
      if (!profile) throw new Error('MCP argument profile must be beginner, balanced, strict, or force.');
      return {
        profile,
        config: applyConfigProfile(profile),
      } as unknown as Record<string, unknown>;
    }
    case 'english_config_profile_status':
      return buildConfigProfileStatus() as unknown as Record<string, unknown>;
    case 'english_config_progression_suggestion':
      return buildRatioProgressionSuggestion(loadConfig(), listPromptEvents()) as unknown as Record<string, unknown>;
    case 'english_config_progression_apply':
      return applyRatioProgressionSuggestion(loadConfig(), listPromptEvents(), {
        apply: optionalBoolean(args, 'apply') ?? false,
      }) as unknown as Record<string, unknown>;
    case 'english_rewrite_text': {
      const text = requireText(args);
      return { rewrite: suggestRewrite(text) };
    }
    case 'english_pronounce_text': {
      const text = requireText(args);
      return lookupPronunciations(text) as unknown as Record<string, unknown>;
    }
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
      const date = optionalString(args, 'date') ?? new Date().toISOString().slice(0, 10);
      if (!isDateKey(date)) throw new Error('MCP argument date must use YYYY-MM-DD.');
      return { date, items: buildDueReviewItems(listLearningItems(), date) };
    }
    case 'english_review_upcoming': {
      const date = optionalString(args, 'date') ?? new Date().toISOString().slice(0, 10);
      if (!isDateKey(date)) throw new Error('MCP argument date must use YYYY-MM-DD.');
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
    case 'english_daily_pack': {
      const date = optionalString(args, 'date') ?? new Date().toISOString().slice(0, 10);
      if (!isDateKey(date)) throw new Error('MCP argument date must use YYYY-MM-DD.');
      return buildDailyReviewPack(listLearningItems(), date) as unknown as Record<string, unknown>;
    }
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
    case 'english_integration_targets':
      return { targets: listIntegrationTargets() };
    case 'english_integration_credential_policy': {
      const target = requireIntegrationTarget(args);
      return buildIntegrationCredentialPolicy(target) as unknown as Record<string, unknown>;
    }
    case 'english_integration_delivery_mode': {
      const target = requireIntegrationTarget(args);
      return buildIntegrationDeliveryModePolicy(target) as unknown as Record<string, unknown>;
    }
    case 'english_integration_daily_pack': {
      const target = requireIntegrationTarget(args);
      const date = optionalString(args, 'date') ?? new Date().toISOString().slice(0, 10);
      if (!isDateKey(date)) throw new Error('MCP argument date must use YYYY-MM-DD.');
      return buildDailyReviewDeliveryPayload({
        target,
        date,
        items: listLearningItems(),
      }) as unknown as Record<string, unknown>;
    }
    case 'english_integration_dry_run': {
      const target = requireIntegrationTarget(args);
      const date = optionalString(args, 'date') ?? new Date().toISOString().slice(0, 10);
      if (!isDateKey(date)) throw new Error('MCP argument date must use YYYY-MM-DD.');
      return buildDailyReviewDeliveryDryRun({
        target,
        date,
        items: listLearningItems(),
      }) as unknown as Record<string, unknown>;
    }
    case 'english_integration_preflight': {
      const target = requireIntegrationTarget(args);
      return buildIntegrationPreflight(target) as unknown as Record<string, unknown>;
    }
    case 'english_integration_send_readiness': {
      const target = requireIntegrationTarget(args);
      const date = optionalString(args, 'date') ?? new Date().toISOString().slice(0, 10);
      if (!isDateKey(date)) throw new Error('MCP argument date must use YYYY-MM-DD.');
      return buildDailyReviewDeliveryReadiness({
        target,
        date,
        items: listLearningItems(),
        confirmSend: optionalBoolean(args, 'confirmSend') ?? false,
      }) as unknown as Record<string, unknown>;
    }
    case 'english_integration_send':
      return { error: 'Use the asynchronous MCP handler for english_integration_send.' };
    case 'english_integration_account_guide': {
      const target = requireIntegrationTarget(args);
      return buildIntegrationAccountGuide(target) as unknown as Record<string, unknown>;
    }
    case 'english_integration_account_validate':
      return { error: 'Use the asynchronous MCP handler for english_integration_account_validate.' };
    case 'english_integration_validation_history': {
      const target = optionalString(args, 'target');
      if (target !== undefined && target !== 'wechat') {
        throw new Error('MCP argument target must be wechat when provided.');
      }
      return { records: listIntegrationValidationRecords({ target }) };
    }
    case 'english_integration_message_coaching': {
      const target = requireIntegrationTarget(args);
      const text = requireText(args);
      const payload = buildIntegrationMessageCoachingPayload(target, text, allowedGlossaryTerms());
      if (optionalBoolean(args, 'record') === true) {
        const draft = buildIntegrationMessageLearningItem(payload);
        const item = draft ? recordLearningItem(draft) : undefined;
        return {
          ...payload,
          recorded: item !== undefined,
          ...(item ? { item } : {}),
        } as unknown as Record<string, unknown>;
      }
      return payload as unknown as Record<string, unknown>;
    }
    case 'english_integration_event_coaching': {
      const target = requireIntegrationMessageTarget(args);
      return buildIntegrationEventCoaching({
        target,
        event: requireObject(args, 'event'),
        allowedTerms: allowedGlossaryTerms(),
        record: optionalBoolean(args, 'record') === true,
        recordLearningItem,
      }) as unknown as Record<string, unknown>;
    }
    case 'english_integration_deliver': {
      const target = requireIntegrationTarget(args);
      if (target.id !== 'obsidian') throw new Error('MCP argument target must be obsidian for delivery.');
      const date = optionalString(args, 'date') ?? new Date().toISOString().slice(0, 10);
      if (!isDateKey(date)) throw new Error('MCP argument date must use YYYY-MM-DD.');
      const directory = requireString(args, 'directory');
      const payload = buildDailyReviewDeliveryPayload({ target, date, items: listLearningItems() });
      return deliverObsidianDailyReview(
        target,
        payload,
        directory,
        optionalBoolean(args, 'write') ?? false,
      ) as unknown as Record<string, unknown>;
    }
    case 'english_doctor': {
      const report = doctor();
      const doctorExport =
        optionalBoolean(args, 'write') === true
          ? writeDoctorMarkdown(report, optionalString(args, 'directory') ?? join(getEnglishPilotHome(), 'diagnostics'))
          : undefined;
      return (doctorExport ? { ...report, export: doctorExport } : report) as unknown as Record<string, unknown>;
    }
    case 'english_coaching_context':
      return buildCoachingContext({
        config: loadConfig(),
        promptEvents: listPromptEvents(),
      }) as unknown as Record<string, unknown>;
  }

  const voiceResult = handleVoiceMcpToolCall(name, args);
  if (voiceResult) return voiceResult;

  throw new Error(`Unknown MCP tool: ${name}`);
}

export interface McpAsyncOptions {
  env?: NodeJS.ProcessEnv;
  fetch?: IntegrationFetch;
}

export async function handleMcpToolCallAsync(
  name: EnglishPilotMcpToolName,
  args: Record<string, unknown>,
  options: McpAsyncOptions = {},
): Promise<Record<string, unknown>> {
  const voiceResult = await handleVoiceMcpToolCallAsync(name, args, options);
  if (voiceResult) return voiceResult;

  if (name !== 'english_integration_send' && name !== 'english_integration_account_validate')
    return handleMcpToolCall(name, args);

  const target = requireIntegrationTarget(args);
  const date = optionalString(args, 'date') ?? new Date().toISOString().slice(0, 10);
  if (!isDateKey(date)) throw new Error('MCP argument date must use YYYY-MM-DD.');
  const send = optionalBoolean(args, 'send') ?? false;
  if (name === 'english_integration_account_validate') {
    return (await runDailyReviewAccountValidation({
      target,
      date,
      items: listLearningItems(),
      send,
      env: options.env,
      fetch: options.fetch,
      record: optionalBoolean(args, 'record') === true,
    })) as unknown as Record<string, unknown>;
  }
  if (!send) throw new Error('MCP argument send must be true to perform network delivery.');
  return (await runDailyReviewDeliverySend({
    target,
    date,
    items: listLearningItems(),
    env: options.env,
    fetch: options.fetch,
    requireValidation: optionalBoolean(args, 'requireValidation') === true,
  })) as unknown as Record<string, unknown>;
}

function allowedGlossaryTerms(): string[] {
  return listGlossaryEntries()
    .filter((entry) => entry.allowTerm)
    .map((entry) => entry.term);
}
