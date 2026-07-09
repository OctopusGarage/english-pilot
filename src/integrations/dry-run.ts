import type { DailyReviewIntegrationPayload } from './daily-pack.js';
import { requiredCredentialsForTarget } from './preflight.js';
import type { IntegrationTarget } from './targets.js';

export interface IntegrationDryRun {
  target: IntegrationTarget;
  operation: 'daily-review-delivery';
  wouldSend: false;
  requiresCredentials: string[];
  messagePreview?: IntegrationMessagePreview;
  payload: DailyReviewIntegrationPayload;
}

export interface IntegrationMessagePreview {
  target: 'wechat';
  mode: 'long-connection';
  credentialPolicy: 'local-account';
  text: string;
}

export function buildDailyReviewDryRun(
  target: IntegrationTarget,
  payload: DailyReviewIntegrationPayload,
): IntegrationDryRun {
  return {
    target,
    operation: 'daily-review-delivery',
    wouldSend: false,
    requiresCredentials: requiredCredentialsForTarget(target.id),
    ...buildMessagePreviewField(target, payload),
    payload,
  };
}

export function formatDailyReviewDryRun(dryRun: IntegrationDryRun): string {
  return [
    `Dry run: would deliver EnglishPilot daily review pack to ${dryRun.target.label}`,
    `Target: ${dryRun.target.id} (${dryRun.target.status})`,
    `Would send: ${dryRun.wouldSend ? 'yes' : 'no'}`,
    `Required credentials: ${dryRun.requiresCredentials.length > 0 ? dryRun.requiresCredentials.join(', ') : 'none'}`,
    ...(dryRun.messagePreview
      ? [`Message mode: ${dryRun.messagePreview.mode}`, `Credential policy: ${dryRun.messagePreview.credentialPolicy}`]
      : []),
    `Items: ${dryRun.payload.pack.itemCount}`,
    '',
    ...(dryRun.messagePreview ? [dryRun.messagePreview.text, ''] : []),
    dryRun.payload.pack.markdown,
  ].join('\n');
}

function buildMessagePreviewField(
  target: IntegrationTarget,
  payload: DailyReviewIntegrationPayload,
): { messagePreview?: IntegrationMessagePreview } {
  if (target.id !== 'wechat') return {};
  const targetId = target.id;
  return {
    messagePreview: {
      target: targetId,
      mode: 'long-connection',
      credentialPolicy: 'local-account',
      text: formatMessageText(payload),
    },
  };
}

function formatMessageText(payload: DailyReviewIntegrationPayload): string {
  return [payload.pack.title, '', `Items due: ${payload.pack.itemCount}`, '', payload.pack.markdown].join('\n');
}
