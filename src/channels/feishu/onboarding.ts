import { registerApp } from '@larksuiteoapi/node-sdk';
import qrcode from 'qrcode-terminal';
import { writeFeishuEnvFile } from './config.js';

export interface FeishuOnboardingResult {
  appId: string;
  domain: 'feishu' | 'lark';
  allowedOpenId?: string;
  env: Record<string, string>;
  written?: {
    path: string;
  };
}

export async function runFeishuOnboarding(
  input: {
    write?: boolean;
    envPath?: string;
    log?: (line: string) => void;
  } = {},
): Promise<FeishuOnboardingResult> {
  const log = input.log ?? console.error;
  const result = await registerApp({
    source: 'english-pilot',
    appPreset: {
      name: 'EnglishPilot {user}',
      desc: 'English coaching assistant for mixed Chinese-English workflows.',
    },
    addons: {
      scopes: {
        tenant: ['im:message:send_as_bot'],
      },
      events: {
        items: {
          tenant: ['im.message.receive_v1'],
        },
      },
    },
    onQRCodeReady(info) {
      log('Scan this QR code with Feishu/Lark to create or bind the EnglishPilot bot:');
      qrcode.generate(info.url, { small: true }, (code) => log(code));
      log(`QR expires in ${info.expireIn} seconds.`);
    },
    onStatusChange(info) {
      if (info.status === 'polling') return;
      log(`Feishu setup status: ${info.status}`);
    },
  });
  const env = buildFeishuEnvValues(result);
  const written = input.write !== false ? writeFeishuEnvFile(env, input.envPath) : undefined;
  return {
    appId: result.client_id,
    domain: env.FEISHU_DOMAIN === 'lark' ? 'lark' : 'feishu',
    ...(env.FEISHU_ALLOWED_OPEN_IDS ? { allowedOpenId: env.FEISHU_ALLOWED_OPEN_IDS } : {}),
    env,
    ...(written ? { written: { path: written.path } } : {}),
  };
}

export function buildFeishuEnvValues(result: {
  client_id: string;
  client_secret: string;
  user_info?: {
    open_id?: string;
    tenant_brand?: 'feishu' | 'lark';
  };
}): Record<string, string> {
  return {
    FEISHU_APP_ID: result.client_id,
    FEISHU_APP_SECRET: result.client_secret,
    FEISHU_ALLOWED_OPEN_IDS: result.user_info?.open_id ?? '',
    FEISHU_DOMAIN: result.user_info?.tenant_brand === 'lark' ? 'lark' : 'feishu',
    FEISHU_REPLY_MODE: 'violation',
    FEISHU_PROCESSING_ACK: 'on',
    FEISHU_PROCESSING_ACK_TEXT: 'Received. Working on it...',
  };
}
