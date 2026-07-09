import { isDateKey } from '../core/review-schedule.js';
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
  buildIntegrationMessageCoachingPayload,
  buildIntegrationMessageLearningItem,
} from '../integrations/message-coaching.js';
import { buildIntegrationEventCoaching } from '../integrations/message-events.js';
import type { IntegrationFetch } from '../integrations/network-sender.js';
import { buildIntegrationPreflight } from '../integrations/preflight.js';
import { listIntegrationTargets } from '../integrations/targets.js';
import { listIntegrationValidationRecords } from '../integrations/validation-history.js';
import { listLearningItems, recordLearningItem } from '../storage/repository.js';
import {
  optionalBoolean,
  optionalString,
  requireIntegrationMessageTarget,
  requireIntegrationTarget,
  requireObject,
  requireString,
  requireText,
} from './mcp-tool-arguments.js';
import type { EnglishPilotMcpToolName } from './mcp-tool-registry.js';
import { allowedGlossaryTerms } from './mcp-language-tool-handlers.js';

export interface McpIntegrationAsyncOptions {
  env?: NodeJS.ProcessEnv;
  fetch?: IntegrationFetch;
}

export function handleIntegrationMcpTool(
  name: EnglishPilotMcpToolName,
  args: Record<string, unknown>,
): Record<string, unknown> | undefined {
  switch (name) {
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
      return buildDailyReviewDeliveryPayload({
        target,
        date: optionalDate(args),
        items: listLearningItems(),
      }) as unknown as Record<string, unknown>;
    }
    case 'english_integration_dry_run': {
      const target = requireIntegrationTarget(args);
      return buildDailyReviewDeliveryDryRun({
        target,
        date: optionalDate(args),
        items: listLearningItems(),
      }) as unknown as Record<string, unknown>;
    }
    case 'english_integration_preflight': {
      const target = requireIntegrationTarget(args);
      return buildIntegrationPreflight(target) as unknown as Record<string, unknown>;
    }
    case 'english_integration_send_readiness': {
      const target = requireIntegrationTarget(args);
      return buildDailyReviewDeliveryReadiness({
        target,
        date: optionalDate(args),
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
      const payload = buildDailyReviewDeliveryPayload({ target, date: optionalDate(args), items: listLearningItems() });
      return deliverObsidianDailyReview(
        target,
        payload,
        requireString(args, 'directory'),
        optionalBoolean(args, 'write') ?? false,
      ) as unknown as Record<string, unknown>;
    }
    default:
      return undefined;
  }
}

export async function handleIntegrationMcpToolAsync(
  name: EnglishPilotMcpToolName,
  args: Record<string, unknown>,
  options: McpIntegrationAsyncOptions = {},
): Promise<Record<string, unknown> | undefined> {
  if (name !== 'english_integration_send' && name !== 'english_integration_account_validate') return undefined;

  const target = requireIntegrationTarget(args);
  const date = optionalDate(args);
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

function optionalDate(args: Record<string, unknown>): string {
  const date = optionalString(args, 'date') ?? new Date().toISOString().slice(0, 10);
  if (!isDateKey(date)) throw new Error('MCP argument date must use YYYY-MM-DD.');
  return date;
}
