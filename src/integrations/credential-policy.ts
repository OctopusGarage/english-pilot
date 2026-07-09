import { requiredCredentialsForTarget } from './preflight.js';
import type { IntegrationTarget } from './targets.js';

export interface IntegrationCredentialPolicy {
  target: IntegrationTarget;
  policy: 'environment';
  storage: 'process-env';
  network: false;
  requiredCredentials: string[];
  secretHandling: string;
}

export function buildIntegrationCredentialPolicy(target: IntegrationTarget): IntegrationCredentialPolicy {
  return {
    target,
    policy: 'environment',
    storage: 'process-env',
    network: false,
    requiredCredentials: requiredCredentialsForTarget(target.id),
    secretHandling:
      'EnglishPilot reads credentials from environment variables and does not persist integration secrets.',
  };
}

export function formatIntegrationCredentialPolicy(policy: IntegrationCredentialPolicy): string {
  return [
    `Credential policy: ${policy.policy}`,
    `Target: ${policy.target.id} (${policy.target.status})`,
    `Storage: ${policy.storage}`,
    `Network: ${policy.network ? 'yes' : 'no'}`,
    `Required credentials: ${policy.requiredCredentials.length > 0 ? policy.requiredCredentials.join(', ') : 'none'}`,
    policy.secretHandling,
    '',
  ].join('\n');
}
