export type IntegrationTargetId = 'obsidian' | 'feishu' | 'wechat' | 'voice';
export type IntegrationTargetStatus = 'supported' | 'planned' | 'deferred';

export interface IntegrationTarget {
  id: IntegrationTargetId;
  label: string;
  status: IntegrationTargetStatus;
  capabilities: string[];
}

export const integrationTargets: IntegrationTarget[] = [
  {
    id: 'obsidian',
    label: 'Obsidian Markdown',
    status: 'deferred',
    capabilities: ['review-export', 'daily-review-delivery'],
  },
  {
    id: 'feishu',
    label: 'Feishu/Lark',
    status: 'supported',
    capabilities: ['long-connection', 'qr-onboarding', 'message-coaching', 'reply-coaching', 'review-items'],
  },
  {
    id: 'wechat',
    label: 'WeChat',
    status: 'supported',
    capabilities: [
      'long-connection',
      'qr-onboarding',
      'message-coaching',
      'reply-coaching',
      'review-items',
      'daily-review-delivery',
    ],
  },
  {
    id: 'voice',
    label: 'Voice Practice',
    status: 'deferred',
    capabilities: ['speech-input', 'pronunciation-feedback', 'review-items'],
  },
];

export function listIntegrationTargets(): IntegrationTarget[] {
  return integrationTargets.map((target) => ({
    ...target,
    capabilities: [...target.capabilities],
  }));
}

export function findIntegrationTarget(value: string | undefined): IntegrationTarget | undefined {
  const target = integrationTargets.find((item) => item.id === value);
  if (!target) return undefined;
  return {
    ...target,
    capabilities: [...target.capabilities],
  };
}

export function formatIntegrationTargets(targets = listIntegrationTargets()): string {
  return targets.map((target) => `${target.id} - ${target.label} (${target.status})`).join('\n') + '\n';
}
