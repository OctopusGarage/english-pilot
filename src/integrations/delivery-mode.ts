import type { IntegrationTarget, IntegrationTargetStatus } from './targets.js';

export interface IntegrationDeliveryModePolicy {
  target: IntegrationTarget;
  mode: 'long-connection-bot' | 'offline-export';
  status: IntegrationTargetStatus;
  network: false;
  rationale: string;
}

export function buildIntegrationDeliveryModePolicy(target: IntegrationTarget): IntegrationDeliveryModePolicy {
  if (target.id === 'feishu') {
    return {
      target,
      mode: 'long-connection-bot',
      status: 'supported',
      network: false,
      rationale:
        'Feishu/Lark uses the dedicated long-connection channel. Run `english-pilot feishu setup`, then `english-pilot feishu start`.',
    };
  }
  if (target.id === 'wechat') {
    return {
      target,
      mode: 'long-connection-bot',
      status: 'supported',
      network: false,
      rationale:
        'WeChat uses the dedicated QR-login long-connection channel. Run `english-pilot wechat setup`, then `english-pilot wechat start`.',
    };
  }
  return {
    target,
    mode: 'offline-export',
    status: target.status,
    network: false,
    rationale: 'This target uses offline local export/delivery and does not require a network delivery mode.',
  };
}

export function formatIntegrationDeliveryModePolicy(policy: IntegrationDeliveryModePolicy): string {
  return [
    `Delivery mode: ${policy.mode}`,
    `Target: ${policy.target.id} (${policy.target.status})`,
    `Status: ${policy.status}`,
    `Network: ${policy.network ? 'yes' : 'no'}`,
    policy.rationale,
    '',
  ].join('\n');
}
