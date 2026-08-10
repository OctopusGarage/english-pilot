import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildDailyReviewPack } from '../../src/core/lesson.js';
import type { LearningItem, LearningItemDraft } from '../../src/core/learning-card.js';
import type { IntegrationAccountValidationResult } from '../../src/integrations/account-validation.js';
import { buildIntegrationCredentialPolicy } from '../../src/integrations/credential-policy.js';
import { buildDailyReviewIntegrationPayload } from '../../src/integrations/daily-pack.js';
import { buildIntegrationDeliveryModePolicy } from '../../src/integrations/delivery-mode.js';
import { buildDailyReviewDryRun } from '../../src/integrations/dry-run.js';
import { buildIntegrationEventCoaching, normalizeInboundMessageEvent } from '../../src/integrations/message-events.js';
import { buildIntegrationPreflight } from '../../src/integrations/preflight.js';
import {
  buildIntegrationSendReadiness,
  formatIntegrationSendReadiness,
} from '../../src/integrations/send-readiness.js';
import { sendDailyReviewIntegration } from '../../src/integrations/network-sender.js';
import { findIntegrationTarget } from '../../src/integrations/targets.js';
import {
  buildIntegrationValidationRequirement,
  listIntegrationValidationRecords,
  recordIntegrationValidation,
} from '../../src/integrations/validation-history.js';

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

  it('reports credential and confirmation checks independently in readiness output', () => {
    const target = findIntegrationTarget('feishu');
    if (!target) throw new Error('missing feishu target');
    const readiness = buildReadiness(
      target,
      {
        FEISHU_APP_ID: 'app-id',
        FEISHU_APP_SECRET: 'app-secret',
        FEISHU_ALLOWED_OPEN_IDS: 'open-id',
      },
      true,
    );

    expect(readiness.ready).toBe(false);
    expect(readiness.checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'credentials', ok: true }),
        expect.objectContaining({ name: 'send-confirmation', ok: true }),
      ]),
    );
    expect(readiness.blockers).not.toContain('Missing credential: FEISHU_APP_ID');
    expect(formatIntegrationSendReadiness(readiness)).toContain('Send readiness: blocked');
    expect(formatIntegrationSendReadiness(readiness)).toContain('send-confirmation: ok');
  });
});

describe('integration message events', () => {
  it('normalizes nested Feishu text events without losing message identity', () => {
    const target = requiredTarget('feishu');

    const event = normalizeInboundMessageEvent(target, {
      event: {
        sender: { sender_id: { open_id: 'ou_sender', user_id: 'fallback_user' } },
        message: {
          message_id: 'om_message',
          content: JSON.stringify({ text: '  我们需要 check deployment 权限  ' }),
        },
      },
    });

    expect(event).toEqual({
      target,
      text: '我们需要 check deployment 权限',
      messageId: 'om_message',
      senderId: 'ou_sender',
    });
  });

  it('normalizes WeChat text events and rejects missing channel text', () => {
    const target = requiredTarget('wechat');

    expect(
      normalizeInboundMessageEvent(target, {
        Content: '  Please review 这个 onboarding path  ',
        MsgId: 'wx_msg',
        FromUserName: 'wx_user',
      }),
    ).toEqual({
      target,
      text: 'Please review 这个 onboarding path',
      messageId: 'wx_msg',
      senderId: 'wx_user',
    });
    expect(() => normalizeInboundMessageEvent(target, { MsgId: 'wx_msg' })).toThrow(
      'WeChat event does not contain text message content.',
    );
  });

  it('records a learning item from channel event coaching only when requested', () => {
    const target = requiredTarget('wechat');
    const recordedDrafts: LearningItemDraft[] = [];

    const result = buildIntegrationEventCoaching({
      target,
      event: {
        content: '我想 create a new project 用来练习 English.',
        msgId: 'wx_msg',
        fromUserName: 'wx_user',
      },
      record: true,
      recordLearningItem: (draft) => {
        recordedDrafts.push(draft);
        return {
          ...draft,
          id: 'learning_channel_1',
          createdAt: '2026-08-11T00:00:00.000Z',
          nextReviewAt: '2026-08-12',
          ease: 2.5,
          intervalDays: 1,
          reviewCount: 0,
          lapseCount: 0,
          tags: draft.tags ?? [],
        } satisfies LearningItem;
      },
    });

    expect(result.event).toMatchObject({ messageId: 'wx_msg', senderId: 'wx_user' });
    expect(result.recorded).toBe(true);
    expect(result.item?.id).toBe('learning_channel_1');
    expect(recordedDrafts[0]).toMatchObject({
      tags: expect.arrayContaining(['integration-message', 'wechat']),
    });
  });
});

describe('integration validation history', () => {
  let previousHome: string | undefined;
  let home: string;

  beforeEach(() => {
    previousHome = process.env.ENGLISH_PILOT_HOME;
    home = mkdtempSync(join(tmpdir(), 'english-pilot-integration-history-'));
    process.env.ENGLISH_PILOT_HOME = home;
  });

  afterEach(() => {
    if (previousHome === undefined) {
      delete process.env.ENGLISH_PILOT_HOME;
    } else {
      process.env.ENGLISH_PILOT_HOME = previousHome;
    }
    rmSync(home, { recursive: true, force: true });
  });

  it('persists successful account validation records with sensitive provider fields removed', () => {
    const target = requiredTarget('wechat');

    const record = recordIntegrationValidation(successfulValidationResult(target), new Date('2026-08-11T00:00:00Z'));
    const [stored] = listIntegrationValidationRecords({ target: 'wechat' });
    const requirement = buildIntegrationValidationRequirement(target);

    expect(stored).toMatchObject({
      id: record.id,
      validated: true,
      send: true,
      network: true,
      deliveryTargetApi: 'deprecated-network-send',
      providerResponse: {
        status: 'ok',
        code: 0,
        accepted: true,
      },
    });
    expect(stored.providerResponse).not.toHaveProperty('access_token');
    expect(stored.providerResponse).not.toHaveProperty('Authorization');
    expect(stored.providerResponse).not.toHaveProperty('nested');
    expect(requirement).toMatchObject({
      ready: true,
      validated: true,
      blockers: [],
      record: { id: record.id },
    });
  });

  it('keeps validation gated until a sent network validation succeeds', () => {
    const target = requiredTarget('wechat');
    recordIntegrationValidation(
      { ...successfulValidationResult(target), validated: false, network: false, blockers: ['network failed'] },
      new Date('2026-08-11T00:00:00Z'),
    );

    expect(buildIntegrationValidationRequirement(target)).toMatchObject({
      ready: false,
      validated: false,
      blockers: [
        'No successful account validation record found for wechat. Run account-validate --send --record first.',
      ],
    });
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

function requiredTarget(id: 'feishu' | 'wechat') {
  const target = findIntegrationTarget(id);
  if (!target) throw new Error(`missing ${id} target`);
  return target;
}

function successfulValidationResult(
  target: NonNullable<ReturnType<typeof findIntegrationTarget>>,
): IntegrationAccountValidationResult {
  const env = { WECHAT_ALLOWED_USERS: 'wx_user' };
  const readiness = buildReadiness(target, env, true);
  return {
    target,
    operation: 'account-validation',
    validated: true,
    send: true,
    network: true,
    stages: [
      { name: 'preflight', ok: true, detail: 'All required credentials are present.' },
      { name: 'dry-run', ok: true, detail: 'channel preview available.' },
      { name: 'send-readiness', ok: true, detail: 'Ready for explicit account validation send.' },
      { name: 'network-send', ok: true, skipped: false, detail: 'wechat-long-connection delivered.' },
    ],
    blockers: [],
    preflight: buildIntegrationPreflight(target, env),
    dryRun: buildDailyReviewDryRun(
      target,
      buildDailyReviewIntegrationPayload(target, buildDailyReviewPack([], '2026-08-11')),
    ),
    readiness,
    delivery: {
      target,
      operation: 'daily-review-delivery',
      delivered: true,
      wouldSend: true,
      network: true,
      targetApi: 'deprecated-network-send',
      auth: { credentialPolicy: 'environment', storedSecrets: false },
      providerResponse: {
        status: 'ok',
        code: 0,
        accepted: true,
        access_token: 'secret-token',
        Authorization: 'Bearer secret-token',
        nested: { token: 'secret-token' },
      },
    },
  };
}

function jsonResponse(body: unknown) {
  return {
    ok: true,
    status: 200,
    json: async () => body,
    text: async () => JSON.stringify(body),
  };
}
