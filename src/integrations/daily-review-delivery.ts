import { buildDailyReviewPack } from '../core/lesson.js';
import type { LearningItem } from '../storage/repository.js';
import { runIntegrationAccountValidation } from './account-validation.js';
import { buildIntegrationValidationRequirement, recordIntegrationValidation } from './validation-history.js';
import { buildIntegrationCredentialPolicy } from './credential-policy.js';
import { buildDailyReviewIntegrationPayload } from './daily-pack.js';
import { buildIntegrationDeliveryModePolicy } from './delivery-mode.js';
import { buildDailyReviewDryRun } from './dry-run.js';
import { sendDailyReviewIntegration, type IntegrationFetch } from './network-sender.js';
import { buildIntegrationPreflight } from './preflight.js';
import { buildIntegrationSendReadiness } from './send-readiness.js';
import type { IntegrationTarget } from './targets.js';

export interface DailyReviewDeliveryInput {
  target: IntegrationTarget;
  date: string;
  items: LearningItem[];
  env?: NodeJS.ProcessEnv;
}

export function buildDailyReviewDeliveryPayload(input: DailyReviewDeliveryInput) {
  const pack = buildDailyReviewPack(input.items, input.date);
  return buildDailyReviewIntegrationPayload(input.target, pack);
}

export function buildDailyReviewDeliveryDryRun(input: DailyReviewDeliveryInput) {
  return buildDailyReviewDryRun(input.target, buildDailyReviewDeliveryPayload(input));
}

export function buildDailyReviewDeliveryReadiness(
  input: DailyReviewDeliveryInput & {
    confirmSend?: boolean;
  },
) {
  return buildIntegrationSendReadiness({
    dryRun: buildDailyReviewDeliveryDryRun(input),
    preflight: buildIntegrationPreflight(input.target, input.env),
    credentialPolicy: buildIntegrationCredentialPolicy(input.target),
    deliveryMode: buildIntegrationDeliveryModePolicy(input.target),
    confirmSend: input.confirmSend ?? false,
  });
}

export async function runDailyReviewDeliverySend(
  input: DailyReviewDeliveryInput & {
    fetch?: IntegrationFetch;
    requireValidation?: boolean;
  },
) {
  const env = input.env ?? process.env;
  const readiness = buildDailyReviewDeliveryReadiness({
    ...input,
    env,
    confirmSend: true,
  });
  if (!readiness.ready) return readiness;

  const validationRequirement = input.requireValidation
    ? buildIntegrationValidationRequirement(input.target)
    : undefined;
  if (validationRequirement && !validationRequirement.ready) return validationRequirement;

  const result = await sendDailyReviewIntegration({
    readiness,
    env,
    fetch: input.fetch,
  });
  return validationRequirement ? { ...result, accountValidation: validationRequirement } : result;
}

export async function runDailyReviewAccountValidation(
  input: DailyReviewDeliveryInput & {
    send?: boolean;
    fetch?: IntegrationFetch;
    record?: boolean;
  },
) {
  const result = await runIntegrationAccountValidation({
    target: input.target,
    payload: buildDailyReviewDeliveryPayload(input),
    send: input.send ?? false,
    env: input.env,
    fetch: input.fetch,
  });
  return input.record ? { ...result, recorded: true, record: recordIntegrationValidation(result) } : result;
}
