import { randomBytes } from 'node:crypto';

export interface WeChatApiOptions {
  baseUrl: string;
  token?: string;
  fetch?: typeof fetch;
  botAgent?: string;
}

export interface WeChatQrStartResult {
  qrcode: string;
  qrcodeUrl: string;
}

export interface WeChatQrStatusResult {
  status: 'wait' | 'scaned' | 'scaned_but_redirect' | 'confirmed' | 'expired' | string;
  accountId?: string;
  token?: string;
  baseUrl?: string;
  userId?: string;
  redirectHost?: string;
}

export interface WeChatUpdateMessage {
  message_id?: string | number;
  from_user_id?: string;
  to_user_id?: string;
  room_id?: string;
  chat_room_id?: string;
  context_token?: string;
  message_type?: number;
  item_list?: Array<{
    type?: number;
    text_item?: {
      text?: string;
    };
    voice_item?: {
      text?: string;
    };
  }>;
}

export interface WeChatUpdatesResult {
  ret?: number;
  errcode?: number;
  errmsg?: string;
  msgs?: WeChatUpdateMessage[];
  get_updates_buf?: string;
  longpolling_timeout_ms?: number;
}

export async function startWeChatQrLogin(input: {
  baseUrl: string;
  botType?: string;
  fetch?: typeof fetch;
}): Promise<WeChatQrStartResult> {
  const response = await apiGet({
    baseUrl: input.baseUrl,
    endpoint: `ilink/bot/get_bot_qrcode?bot_type=${encodeURIComponent(input.botType ?? '3')}`,
    fetch: input.fetch,
  });
  return {
    qrcode: stringValue(response.qrcode),
    qrcodeUrl: stringValue(response.qrcode_img_content) || stringValue(response.qrcode),
  };
}

export async function getWeChatQrStatus(input: {
  baseUrl: string;
  qrcode: string;
  fetch?: typeof fetch;
}): Promise<WeChatQrStatusResult> {
  const response = await apiGet({
    baseUrl: input.baseUrl,
    endpoint: `ilink/bot/get_qrcode_status?qrcode=${encodeURIComponent(input.qrcode)}`,
    fetch: input.fetch,
  });
  return {
    status: stringValue(response.status) || 'wait',
    accountId: stringValue(response.ilink_bot_id),
    token: stringValue(response.bot_token),
    baseUrl: stringValue(response.baseurl),
    userId: stringValue(response.ilink_user_id),
    redirectHost: stringValue(response.redirect_host),
  };
}

export async function getWeChatUpdates(
  input: WeChatApiOptions & {
    syncCursor: string;
    timeoutMs?: number;
    abortSignal?: AbortSignal;
  },
): Promise<WeChatUpdatesResult> {
  try {
    return (await apiPost({
      ...input,
      endpoint: 'ilink/bot/getupdates',
      body: {
        get_updates_buf: input.syncCursor,
      },
      timeoutMs: input.timeoutMs ?? 35_000,
      abortSignal: input.abortSignal,
    })) as WeChatUpdatesResult;
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      return { ret: 0, msgs: [], get_updates_buf: input.syncCursor };
    }
    throw error;
  }
}

export async function sendWeChatMessage(
  input: WeChatApiOptions & {
    to: string;
    text: string;
    contextToken?: string;
  },
): Promise<void> {
  const msg: Record<string, unknown> = {
    from_user_id: '',
    to_user_id: input.to,
    client_id: `english-pilot-${Date.now().toString(36)}-${randomBytes(3).toString('hex')}`,
    message_type: 2,
    message_state: 2,
    item_list: [
      {
        type: 1,
        text_item: {
          text: input.text,
        },
      },
    ],
  };
  if (input.contextToken) msg.context_token = input.contextToken;
  const response = (await apiPost({
    ...input,
    endpoint: 'ilink/bot/sendmessage',
    body: { msg },
    timeoutMs: 15_000,
  })) as { ret?: number; errcode?: number; errmsg?: string };
  if (response.ret && response.ret !== 0) {
    throw new Error(`WeChat sendmessage failed: ret=${response.ret} ${response.errmsg ?? ''}`.trim());
  }
}

export async function notifyWeChatStart(input: WeChatApiOptions): Promise<void> {
  await apiPost({
    ...input,
    endpoint: 'ilink/bot/msg/notifystart',
    body: {},
    timeoutMs: 10_000,
  });
}

export async function notifyWeChatStop(input: WeChatApiOptions): Promise<void> {
  await apiPost({
    ...input,
    endpoint: 'ilink/bot/msg/notifystop',
    body: {},
    timeoutMs: 10_000,
  });
}

export function extractWeChatText(message: WeChatUpdateMessage): string {
  for (const item of message.item_list ?? []) {
    if (item.type === 1 && item.text_item?.text) return item.text_item.text;
  }
  for (const item of message.item_list ?? []) {
    if (item.type === 3 && item.voice_item?.text) return item.voice_item.text;
  }
  return '';
}

async function apiGet(input: {
  baseUrl: string;
  endpoint: string;
  fetch?: typeof fetch;
}): Promise<Record<string, unknown>> {
  const response = await fetchImpl(input.fetch)(urlFor(input.baseUrl, input.endpoint), {
    method: 'GET',
    headers: commonHeaders(),
  });
  return readJsonResponse(response, input.endpoint);
}

async function apiPost(
  input: WeChatApiOptions & {
    endpoint: string;
    body: Record<string, unknown>;
    timeoutMs?: number;
    abortSignal?: AbortSignal;
  },
): Promise<Record<string, unknown>> {
  const controller = input.timeoutMs ? new AbortController() : undefined;
  const timeout = controller && input.timeoutMs ? setTimeout(() => controller.abort(), input.timeoutMs) : undefined;
  const signal = input.abortSignal ?? controller?.signal;
  try {
    const response = await fetchImpl(input.fetch)(urlFor(input.baseUrl, input.endpoint), {
      method: 'POST',
      headers: {
        ...commonHeaders(input.token),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        ...input.body,
        base_info: {
          channel_version: '0.1.0',
          bot_agent: input.botAgent ?? 'EnglishPilot/0.1.0',
        },
      }),
      ...(signal ? { signal } : {}),
    });
    return readJsonResponse(response, input.endpoint);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

async function readJsonResponse(response: Response, label: string): Promise<Record<string, unknown>> {
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`WeChat ${label} HTTP ${response.status}: ${text.slice(0, 200)}`);
  }
  return JSON.parse(text) as Record<string, unknown>;
}

function commonHeaders(token?: string): Record<string, string> {
  return {
    AuthorizationType: 'ilink_bot_token',
    'X-WECHAT-UIN': Buffer.from(String(randomBytes(4).readUInt32BE(0)), 'utf8').toString('base64'),
    'iLink-App-Id': 'bot',
    'iLink-App-ClientVersion': String(0x00000100),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

function urlFor(baseUrl: string, endpoint: string): string {
  return new URL(endpoint, baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`).toString();
}

function fetchImpl(customFetch: typeof fetch | undefined): typeof fetch {
  return customFetch ?? fetch;
}

function stringValue(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}
