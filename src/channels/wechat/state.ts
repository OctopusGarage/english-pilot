import { chmodSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { getEnglishPilotHome } from '../../core/config.js';

export interface WeChatAccount {
  accountId: string;
  token: string;
  baseUrl: string;
  userId?: string;
  savedAt: string;
}

export function defaultWeChatBaseUrl(): string {
  return 'https://ilinkai.weixin.qq.com';
}

export function getWeChatStateDir(): string {
  return join(getEnglishPilotHome(), 'wechat');
}

export function getWeChatAccountsDir(): string {
  return join(getWeChatStateDir(), 'accounts');
}

export function listWeChatAccounts(): WeChatAccount[] {
  const ids = readAccountIndex();
  return ids.map((id) => loadWeChatAccount(id)).filter((account): account is WeChatAccount => account !== undefined);
}

export function loadWeChatAccount(accountId: string): WeChatAccount | undefined {
  const path = accountPath(normalizeWeChatAccountId(accountId));
  if (!existsSync(path)) return undefined;
  const value = JSON.parse(readFileSync(path, 'utf8')) as Partial<WeChatAccount>;
  if (!value.accountId || !value.token) return undefined;
  return {
    accountId: value.accountId,
    token: value.token,
    baseUrl: value.baseUrl?.trim() || defaultWeChatBaseUrl(),
    ...(value.userId ? { userId: value.userId } : {}),
    savedAt: value.savedAt ?? new Date(0).toISOString(),
  };
}

export function saveWeChatAccount(input: {
  accountId: string;
  token: string;
  baseUrl?: string;
  userId?: string;
  savedAt?: string;
}): WeChatAccount {
  const accountId = normalizeWeChatAccountId(input.accountId);
  const account: WeChatAccount = {
    accountId,
    token: input.token,
    baseUrl: input.baseUrl?.trim() || defaultWeChatBaseUrl(),
    ...(input.userId?.trim() ? { userId: input.userId.trim() } : {}),
    savedAt: input.savedAt ?? new Date().toISOString(),
  };
  mkdirSync(getWeChatAccountsDir(), { recursive: true });
  writeJsonSecure(accountPath(accountId), account);
  registerAccountId(accountId);
  return account;
}

export function removeWeChatAccount(accountId: string): boolean {
  const normalized = normalizeWeChatAccountId(accountId);
  const existed = existsSync(accountPath(normalized));
  rmSync(accountPath(normalized), { force: true });
  rmSync(syncCursorPath(normalized), { force: true });
  rmSync(contextTokenPath(normalized), { force: true });
  writeAccountIndex(readAccountIndex().filter((id) => id !== normalized));
  return existed;
}

export function loadWeChatSyncCursor(accountId: string): string {
  const path = syncCursorPath(normalizeWeChatAccountId(accountId));
  if (!existsSync(path)) return '';
  try {
    const value = JSON.parse(readFileSync(path, 'utf8')) as { get_updates_buf?: string };
    return value.get_updates_buf ?? '';
  } catch {
    return '';
  }
}

export function saveWeChatSyncCursor(accountId: string, cursor: string): void {
  if (!cursor) return;
  writeJsonSecure(syncCursorPath(normalizeWeChatAccountId(accountId)), {
    get_updates_buf: cursor,
  });
}

export function getWeChatContextToken(accountId: string, userId: string): string | undefined {
  const tokens = readContextTokens(accountId);
  return tokens[userId];
}

export function saveWeChatContextToken(accountId: string, userId: string, token: string): void {
  if (!token) return;
  const tokens = readContextTokens(accountId);
  tokens[userId] = token;
  writeJsonSecure(contextTokenPath(normalizeWeChatAccountId(accountId)), tokens);
}

export function normalizeWeChatAccountId(accountId: string): string {
  return accountId.trim().replace(/@/g, '-').replace(/\./g, '-');
}

function readContextTokens(accountId: string): Record<string, string> {
  const path = contextTokenPath(normalizeWeChatAccountId(accountId));
  if (!existsSync(path)) return {};
  try {
    const value = JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>;
    return Object.fromEntries(
      Object.entries(value).filter((entry): entry is [string, string] => typeof entry[1] === 'string'),
    );
  } catch {
    return {};
  }
}

function readAccountIndex(): string[] {
  const path = accountIndexPath();
  if (!existsSync(path)) return [];
  try {
    const value = JSON.parse(readFileSync(path, 'utf8')) as unknown;
    if (!Array.isArray(value)) return [];
    return value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0);
  } catch {
    return [];
  }
}

function registerAccountId(accountId: string): void {
  const ids = readAccountIndex();
  if (ids.includes(accountId)) return;
  writeAccountIndex([...ids, accountId]);
}

function writeAccountIndex(ids: string[]): void {
  writeJsonSecure(accountIndexPath(), [...new Set(ids)]);
}

function accountIndexPath(): string {
  return join(getWeChatStateDir(), 'accounts.json');
}

function accountPath(accountId: string): string {
  return join(getWeChatAccountsDir(), `${accountId}.json`);
}

function syncCursorPath(accountId: string): string {
  return join(getWeChatAccountsDir(), `${accountId}.sync.json`);
}

function contextTokenPath(accountId: string): string {
  return join(getWeChatAccountsDir(), `${accountId}.context-tokens.json`);
}

function writeJsonSecure(path: string, value: unknown): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  try {
    chmodSync(path, 0o600);
  } catch {
    // Best-effort on non-POSIX filesystems.
  }
}
