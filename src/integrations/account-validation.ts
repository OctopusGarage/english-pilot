import type { DailyReviewIntegrationPayload } from './daily-pack.js';
import { buildIntegrationCredentialPolicy } from './credential-policy.js';
import { buildIntegrationDeliveryModePolicy } from './delivery-mode.js';
import { buildDailyReviewDryRun, type IntegrationDryRun } from './dry-run.js';
import { buildIntegrationPreflight, type IntegrationPreflight } from './preflight.js';
import { buildIntegrationSendReadiness, type IntegrationSendReadiness } from './send-readiness.js';
import {
  sendDailyReviewIntegration,
  type IntegrationFetch,
  type IntegrationNetworkDeliveryResult,
} from './network-sender.js';
import type { IntegrationTarget } from './targets.js';

export interface IntegrationAccountValidationStage {
  name: 'preflight' | 'dry-run' | 'send-readiness' | 'network-send';
  ok: boolean;
  skipped?: boolean;
  detail: string;
}

export interface IntegrationAccountValidationResult {
  target: IntegrationTarget;
  operation: 'account-validation';
  validated: boolean;
  send: boolean;
  network: boolean;
  stages: IntegrationAccountValidationStage[];
  blockers: string[];
  preflight: IntegrationPreflight;
  dryRun: IntegrationDryRun;
  readiness: IntegrationSendReadiness;
  delivery?: IntegrationNetworkDeliveryResult;
}

export async function runIntegrationAccountValidation(input: {
  target: IntegrationTarget;
  payload: DailyReviewIntegrationPayload;
  send: boolean;
  env?: NodeJS.ProcessEnv;
  fetch?: IntegrationFetch;
}): Promise<IntegrationAccountValidationResult> {
  const env = input.env ?? process.env;
  const preflight = buildIntegrationPreflight(input.target, env);
  const dryRun = buildDailyReviewDryRun(input.target, input.payload);
  const readiness = buildIntegrationSendReadiness({
    dryRun,
    preflight,
    credentialPolicy: buildIntegrationCredentialPolicy(input.target),
    deliveryMode: buildIntegrationDeliveryModePolicy(input.target),
    confirmSend: input.send,
  });
  const stages: IntegrationAccountValidationStage[] = [
    {
      name: 'preflight',
      ok: preflight.ready,
      detail: preflight.ready ? 'All required credentials are present.' : `Missing ${preflight.missing.join(', ')}`,
    },
    {
      name: 'dry-run',
      ok: Boolean(dryRun.messagePreview),
      detail: dryRun.messagePreview
        ? `${dryRun.messagePreview.mode} preview available.`
        : 'No message preview is available.',
    },
    {
      name: 'send-readiness',
      ok: readiness.ready,
      detail: readiness.ready
        ? 'Ready for explicit account validation send.'
        : normalizeReadinessBlockers(readiness).join('; '),
    },
  ];
  if (!input.send) {
    stages.push({
      name: 'network-send',
      ok: false,
      skipped: true,
      detail: 'Pass --send to perform account validation network delivery.',
    });
    return buildResult(
      input.target,
      input.send,
      false,
      stages,
      ['Pass --send to perform account validation network delivery.'],
      preflight,
      dryRun,
      readiness,
    );
  }
  if (!readiness.ready) {
    stages.push({
      name: 'network-send',
      ok: false,
      skipped: true,
      detail: 'Skipped because send readiness is blocked.',
    });
    return buildResult(
      input.target,
      input.send,
      false,
      stages,
      normalizeReadinessBlockers(readiness),
      preflight,
      dryRun,
      readiness,
    );
  }

  try {
    const delivery = await sendDailyReviewIntegration({
      readiness,
      env,
      fetch: input.fetch,
    });
    stages.push({
      name: 'network-send',
      ok: true,
      skipped: false,
      detail: `${delivery.targetApi} delivered.`,
    });
    return {
      ...buildResult(input.target, input.send, true, stages, [], preflight, dryRun, readiness),
      delivery,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    stages.push({
      name: 'network-send',
      ok: false,
      skipped: false,
      detail: message,
    });
    return buildResult(input.target, input.send, true, stages, [message], preflight, dryRun, readiness);
  }
}

export function formatIntegrationAccountValidation(result: IntegrationAccountValidationResult): string {
  return [
    `Account validation: ${result.validated ? 'validated' : 'not validated'}`,
    `Target: ${result.target.id} (${result.target.status})`,
    `Send: ${result.send ? 'yes' : 'no'}`,
    `Network: ${result.network ? 'yes' : 'no'}`,
    '',
    'Stages',
    ...result.stages.map(
      (stage) =>
        `- ${stage.name}: ${stage.ok ? 'ok' : 'blocked'}${stage.skipped ? ' (skipped)' : ''} - ${stage.detail}`,
    ),
    '',
    'Blockers',
    ...(result.blockers.length > 0 ? result.blockers.map((blocker) => `- ${blocker}`) : ['- none']),
    '',
  ].join('\n');
}

function buildResult(
  target: IntegrationTarget,
  send: boolean,
  network: boolean,
  stages: IntegrationAccountValidationStage[],
  blockers: string[],
  preflight: IntegrationPreflight,
  dryRun: IntegrationDryRun,
  readiness: IntegrationSendReadiness,
): IntegrationAccountValidationResult {
  return {
    target,
    operation: 'account-validation',
    validated: blockers.length === 0 && stages.every((stage) => stage.ok),
    send,
    network,
    stages,
    blockers,
    preflight,
    dryRun,
    readiness,
  };
}

function normalizeReadinessBlockers(readiness: IntegrationSendReadiness): string[] {
  return readiness.blockers.map((blocker) =>
    blocker === 'Pass --confirm-send to acknowledge network sending.'
      ? 'Pass --send to perform account validation network delivery.'
      : blocker,
  );
}
