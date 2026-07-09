import type { IntegrationCredentialPolicy } from './credential-policy.js';
import type { IntegrationDeliveryModePolicy } from './delivery-mode.js';
import type { IntegrationDryRun } from './dry-run.js';
import type { IntegrationPreflight } from './preflight.js';
import type { IntegrationTarget } from './targets.js';

export interface IntegrationReadinessCheck {
  name: 'delivery-mode' | 'credential-policy' | 'credentials' | 'request-preview' | 'send-confirmation';
  ok: boolean;
  detail: string;
  missing?: string[];
}

export interface IntegrationSendReadiness {
  target: IntegrationTarget;
  operation: 'daily-review-delivery';
  ready: boolean;
  wouldSend: false;
  network: false;
  confirmSend: boolean;
  checks: IntegrationReadinessCheck[];
  blockers: string[];
  dryRun: IntegrationDryRun;
}

export function buildIntegrationSendReadiness(input: {
  dryRun: IntegrationDryRun;
  preflight: IntegrationPreflight;
  credentialPolicy: IntegrationCredentialPolicy;
  deliveryMode: IntegrationDeliveryModePolicy;
  confirmSend: boolean;
}): IntegrationSendReadiness {
  const checks: IntegrationReadinessCheck[] = [
    {
      name: 'delivery-mode',
      ok: false,
      detail: input.deliveryMode.mode,
    },
    {
      name: 'credential-policy',
      ok: input.credentialPolicy.policy === 'environment',
      detail: input.credentialPolicy.policy,
    },
    {
      name: 'credentials',
      ok: input.preflight.ready,
      detail: input.preflight.ready
        ? 'All required credentials are present.'
        : `Missing ${input.preflight.missing.join(', ')}`,
      missing: input.preflight.missing,
    },
    {
      name: 'request-preview',
      ok: false,
      detail:
        input.dryRun.target.id === 'wechat'
          ? 'WeChat uses `english-pilot wechat start`; HTTP request-preview sending is deprecated.'
          : 'No request preview is available for this target.',
    },
    {
      name: 'send-confirmation',
      ok: input.confirmSend,
      detail: input.confirmSend
        ? 'Explicit send confirmation received.'
        : 'Pass --confirm-send to acknowledge network sending.',
    },
  ];
  return {
    target: input.dryRun.target,
    operation: 'daily-review-delivery',
    ready: checks.every((check) => check.ok),
    wouldSend: false,
    network: false,
    confirmSend: input.confirmSend,
    checks,
    blockers: buildReadinessBlockers(checks),
    dryRun: input.dryRun,
  };
}

export function formatIntegrationSendReadiness(readiness: IntegrationSendReadiness): string {
  return [
    `Send readiness: ${readiness.ready ? 'ready' : 'blocked'}`,
    `Target: ${readiness.target.id} (${readiness.target.status})`,
    `Would send now: ${readiness.wouldSend ? 'yes' : 'no'}`,
    `Network: ${readiness.network ? 'yes' : 'no'}`,
    `Confirm send: ${readiness.confirmSend ? 'yes' : 'no'}`,
    '',
    'Checks',
    ...readiness.checks.map((check) => `- ${check.name}: ${check.ok ? 'ok' : 'blocked'} - ${check.detail}`),
    '',
    'Blockers',
    ...(readiness.blockers.length > 0 ? readiness.blockers.map((blocker) => `- ${blocker}`) : ['- none']),
    '',
  ].join('\n');
}

function buildReadinessBlockers(checks: IntegrationReadinessCheck[]): string[] {
  return checks.flatMap((check) => {
    if (check.ok) return [];
    if (check.name === 'credentials') {
      return (check.missing ?? []).map((name) => `Missing credential: ${name}`);
    }
    return [check.detail];
  });
}
