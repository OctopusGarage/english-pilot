import type { IntegrationTarget } from './targets.js';

export interface IntegrationCredentialCheck {
  name: string;
  present: boolean;
}

export interface IntegrationPreflight {
  target: IntegrationTarget;
  ready: boolean;
  network: false;
  requiredCredentials: IntegrationCredentialCheck[];
  missing: string[];
}

export function buildIntegrationPreflight(
  target: IntegrationTarget,
  env: NodeJS.ProcessEnv = process.env,
): IntegrationPreflight {
  const requiredCredentials = requiredCredentialsForTarget(target.id).map((name) => ({
    name,
    present: typeof env[name] === 'string' && env[name].trim().length > 0,
  }));
  const missing = requiredCredentials.filter((credential) => !credential.present).map((credential) => credential.name);
  return {
    target,
    ready: missing.length === 0,
    network: false,
    requiredCredentials,
    missing,
  };
}

export function requiredCredentialsForTarget(targetId: IntegrationTarget['id']): string[] {
  if (targetId === 'feishu') return ['FEISHU_APP_ID', 'FEISHU_APP_SECRET', 'FEISHU_ALLOWED_OPEN_IDS'];
  if (targetId === 'wechat') return [];
  return [];
}
