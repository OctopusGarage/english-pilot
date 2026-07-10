import { describe, expect, it } from 'vitest';
import { buildDailyReviewPack } from '../../src/core/lesson.js';
import { buildIntegrationCredentialPolicy } from '../../src/integrations/credential-policy.js';
import { buildDailyReviewIntegrationPayload } from '../../src/integrations/daily-pack.js';
import { buildIntegrationDeliveryModePolicy } from '../../src/integrations/delivery-mode.js';
import { buildDailyReviewDryRun } from '../../src/integrations/dry-run.js';
import { buildIntegrationPreflight } from '../../src/integrations/preflight.js';
import { buildIntegrationSendReadiness } from '../../src/integrations/send-readiness.js';
import { sendDailyReviewIntegration } from '../../src/integrations/network-sender.js';
import { findIntegrationTarget } from '../../src/integrations/targets.js';

describe('sendDailyReviewIntegration', () => {
  it('refuses to send when readiness is blocked', async () => {
    const target = findIntegrationTarget('feishu');
    if (!target) throw new Error('missing feishu target');
    const env = {};
    const readiness = buildReadiness(target, env, false);
    const calls: Array<{ url: string; init: unknown }> = [];

    await expect(
      sendDailyReviewIntegration({
        readiness,
        env,
        fetch: async (url, init) => {
          calls.push({ url, init });
          return jsonResponse({});
        },
      }),
    ).rejects.toThrow('Integration is not ready to send');
    expect(calls).toEqual([]);
  });

  it('rejects Feishu/Lark daily review network sends because Feishu uses the long-connection channel', async () => {
    const target = findIntegrationTarget('feishu');
    if (!target) throw new Error('missing feishu target');
    const env = {
      FEISHU_APP_ID: 'app-id',
      FEISHU_APP_SECRET: 'app-secret',
      FEISHU_ALLOWED_OPEN_IDS: 'open-id',
    };
    const calls: Array<{ url: string; init: { method?: string; headers?: Record<string, string>; body?: string } }> =
      [];

    await expect(
      sendDailyReviewIntegration({
        readiness: buildReadiness(target, env, true),
        env,
        fetch: async (url, init) => {
          calls.push({ url, init: init as { method?: string; headers?: Record<string, string>; body?: string } });
          return jsonResponse({});
        },
      }),
    ).rejects.toThrow('Integration is not ready to send');
    expect(calls).toEqual([]);
  });

  it('rejects WeChat daily review network sends because WeChat uses the long-connection channel', async () => {
    const target = findIntegrationTarget('wechat');
    if (!target) throw new Error('missing wechat target');
    const env = {
      WECHAT_ALLOWED_USERS: 'wxid_owner',
    };
    const calls: Array<{ url: string; init: unknown }> = [];

    await expect(
      sendDailyReviewIntegration({
        readiness: buildReadiness(target, env, true),
        env,
        fetch: async (url, init) => {
          calls.push({ url, init });
          return jsonResponse({});
        },
      }),
    ).rejects.toThrow('Integration is not ready to send: long-connection-bot');
    expect(calls).toEqual([]);
  });

  it('does not send WeChat daily reviews through a direct network path', async () => {
    const target = findIntegrationTarget('wechat');
    if (!target) throw new Error('missing wechat target');
    const env = {};
    const calls: Array<{ url: string; init: unknown }> = [];

    await expect(
      sendDailyReviewIntegration({
        readiness: buildReadiness(target, env, true),
        env,
        fetch: async (url, init) => {
          calls.push({ url, init });
          return jsonResponse({});
        },
      }),
    ).rejects.toThrow('Integration is not ready to send: long-connection-bot');
    expect(calls).toEqual([]);
  });
});

function buildReadiness(
  target: NonNullable<ReturnType<typeof findIntegrationTarget>>,
  env: NodeJS.ProcessEnv,
  confirmSend: boolean,
) {
  const pack = buildDailyReviewPack([], '2026-07-08');
  const payload = buildDailyReviewIntegrationPayload(target, pack);
  const dryRun = buildDailyReviewDryRun(target, payload);
  return buildIntegrationSendReadiness({
    dryRun,
    preflight: buildIntegrationPreflight(target, env),
    credentialPolicy: buildIntegrationCredentialPolicy(target),
    deliveryMode: buildIntegrationDeliveryModePolicy(target),
    confirmSend,
  });
}

function jsonResponse(body: unknown) {
  return {
    ok: true,
    status: 200,
    json: async () => body,
    text: async () => JSON.stringify(body),
  };
}
