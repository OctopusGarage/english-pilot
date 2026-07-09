import { requiredCredentialsForTarget } from './preflight.js';
import type { IntegrationTarget } from './targets.js';

export interface IntegrationAccountGuide {
  target: IntegrationTarget;
  deliveryMode: 'long-connection-bot';
  requiredCredentials: string[];
  environment: Array<{
    name: string;
    description: string;
  }>;
  validationCommands: string[];
  checklist: string[];
  officialDocs: Array<{
    label: string;
    url: string;
  }>;
  troubleshooting: Array<{
    symptom: string;
    likelyCause: string;
    fix: string;
  }>;
}

export function buildIntegrationAccountGuide(target: IntegrationTarget): IntegrationAccountGuide {
  if (target.id === 'feishu') return buildFeishuGuide(target);
  if (target.id === 'wechat') return buildWechatGuide(target);
  throw new Error('Account validation guide is only available for feishu or wechat.');
}

export function formatIntegrationAccountGuide(guide: IntegrationAccountGuide): string {
  return [
    `${guide.target.label} account validation`,
    `Delivery mode: ${guide.deliveryMode}`,
    `Required credentials: ${guide.requiredCredentials.join(', ')}`,
    '',
    'Environment',
    ...guide.environment.map((item) => `- ${item.name}: ${item.description}`),
    '',
    'Validation commands',
    ...guide.validationCommands.map((command) => `- ${command}`),
    '',
    'Checklist',
    ...guide.checklist.map((item) => `- ${item}`),
    '',
    'Troubleshooting',
    ...guide.troubleshooting.map((item) => `- ${item.symptom}: ${item.fix}`),
    '',
    'Official docs',
    ...guide.officialDocs.map((item) => `- ${item.label}: ${item.url}`),
    '',
  ].join('\n');
}

function buildFeishuGuide(target: IntegrationTarget): IntegrationAccountGuide {
  return {
    target,
    deliveryMode: 'long-connection-bot',
    requiredCredentials: requiredCredentialsForTarget(target.id),
    environment: [
      { name: 'FEISHU_APP_ID', description: 'Feishu/Lark app ID written by `english-pilot feishu setup`.' },
      {
        name: 'FEISHU_APP_SECRET',
        description:
          'Feishu/Lark app secret written by `english-pilot feishu setup`; keep it local or in the runtime environment only.',
      },
      {
        name: 'FEISHU_ALLOWED_OPEN_IDS',
        description: 'Comma-separated sender open_id allowlist. The long-connection handler ignores unknown senders.',
      },
    ],
    validationCommands: [
      'english-pilot feishu setup',
      'english-pilot feishu doctor --json',
      'english-pilot feishu start --dry-run --json',
      'english-pilot feishu start',
    ],
    checklist: [
      'Run `english-pilot feishu setup` and scan the QR code with Feishu/Lark.',
      'Confirm `~/.english-pilot/feishu.env` contains app credentials and FEISHU_ALLOWED_OPEN_IDS.',
      'Run `english-pilot feishu doctor --json` before starting the long-connection process.',
      'Run `english-pilot feishu start --dry-run --json` to verify startup without opening the connection.',
      'Run `english-pilot feishu start` in a long-running shell or process manager.',
    ],
    officialDocs: [
      {
        label: 'Feishu receive message event',
        url: 'https://open.feishu.cn/document/server-docs/im-v1/message/events/receive',
      },
      {
        label: 'Feishu bot message send',
        url: 'https://open.feishu.cn/document/server-docs/im-v1/message/create',
      },
    ],
    troubleshooting: [
      {
        symptom: 'doctor reports missing credentials',
        likelyCause:
          '`english-pilot feishu setup` has not completed or the runtime cannot read `~/.english-pilot/feishu.env`.',
        fix: 'Rerun `english-pilot feishu setup`, or export FEISHU_APP_ID, FEISHU_APP_SECRET, and FEISHU_ALLOWED_OPEN_IDS in the process environment.',
      },
      {
        symptom: 'messages are ignored',
        likelyCause: 'The sender open_id is not in FEISHU_ALLOWED_OPEN_IDS.',
        fix: 'Add the sender open_id to FEISHU_ALLOWED_OPEN_IDS and restart `english-pilot feishu start`.',
      },
      {
        symptom: 'connection fails at startup',
        likelyCause: 'The Feishu/Lark app credentials are wrong, revoked, or not authorized for message events.',
        fix: 'Rerun setup, confirm the app is installed in the tenant, and verify message event permissions before starting again.',
      },
    ],
  };
}

function buildWechatGuide(target: IntegrationTarget): IntegrationAccountGuide {
  return {
    target,
    deliveryMode: 'long-connection-bot',
    requiredCredentials: requiredCredentialsForTarget(target.id),
    environment: [
      {
        name: 'WECHAT_ALLOWED_USERS',
        description:
          'Comma-separated WeChat sender IDs allowed to talk to the long-connection channel. The QR-login owner user is allowed automatically when available.',
      },
      {
        name: 'WECHAT_REPLY_MODE',
        description: 'Optional reply policy: violation, always, or silent. Defaults to violation.',
      },
      {
        name: 'WECHAT_BOT_AGENT',
        description: 'Optional UA-style identifier sent to the iLink backend for observability.',
      },
    ],
    validationCommands: [
      'english-pilot wechat setup',
      'english-pilot wechat doctor --json',
      'english-pilot wechat start --dry-run --json',
      'english-pilot wechat start',
    ],
    checklist: [
      'Run `english-pilot wechat setup` and scan the QR code with WeChat.',
      'Confirm `english-pilot wechat accounts --json` lists the saved local account.',
      'Set WECHAT_ALLOWED_USERS for additional senders if needed.',
      'Run `english-pilot wechat doctor --json` before starting the long-connection process.',
      'Run `english-pilot wechat start` in a long-running shell or process manager.',
    ],
    officialDocs: [
      {
        label: 'Tencent openclaw-weixin',
        url: 'https://github.com/Tencent/openclaw-weixin',
      },
      {
        label: 'OpenClaw WeChat channel',
        url: 'https://docs.openclaw.ai/zh-CN/channels/wechat',
      },
    ],
    troubleshooting: [
      {
        symptom: 'doctor reports missing WECHAT_ACCOUNT',
        likelyCause: '`english-pilot wechat setup` has not completed or the account file is unreadable.',
        fix: 'Rerun `english-pilot wechat setup` and scan the QR code again.',
      },
      {
        symptom: 'messages are ignored',
        likelyCause: 'The sender is not in WECHAT_ALLOWED_USERS.',
        fix: 'Add the sender ID to WECHAT_ALLOWED_USERS and restart `english-pilot wechat start`.',
      },
      {
        symptom: 'session expired',
        likelyCause: 'The local iLink token is stale or revoked.',
        fix: 'Run `english-pilot wechat setup` again, then restart the long-connection process.',
      },
    ],
  };
}
