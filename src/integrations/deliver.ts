import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { DailyReviewIntegrationPayload } from './daily-pack.js';
import type { IntegrationTarget } from './targets.js';

export interface DailyReviewDeliveryResult {
  target: IntegrationTarget;
  operation: 'daily-review-delivery';
  delivered: boolean;
  wouldSend: false;
  network: false;
  path: string;
  payload: DailyReviewIntegrationPayload;
}

export function deliverObsidianDailyReview(
  target: IntegrationTarget,
  payload: DailyReviewIntegrationPayload,
  directory: string,
  write: boolean,
): DailyReviewDeliveryResult {
  const path = join(directory, `${payload.pack.date}.md`);
  if (write) {
    mkdirSync(directory, { recursive: true });
    writeFileSync(path, payload.pack.markdown, 'utf8');
  }
  return {
    target,
    operation: 'daily-review-delivery',
    delivered: write,
    wouldSend: false,
    network: false,
    path,
    payload,
  };
}

export function formatDailyReviewDelivery(result: DailyReviewDeliveryResult): string {
  return [
    `${result.delivered ? 'Delivered' : 'Prepared'} EnglishPilot daily review pack for ${result.target.label}`,
    `Path: ${result.path}`,
    `Would send: ${result.wouldSend ? 'yes' : 'no'}`,
    `Network: ${result.network ? 'yes' : 'no'}`,
    `Items: ${result.payload.pack.itemCount}`,
    '',
  ].join('\n');
}
