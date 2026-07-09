import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { getEnglishPilotHome } from '../../core/config.js';

export type FeishuDomain = 'feishu' | 'lark';
export type FeishuReplyMode = 'silent' | 'violation' | 'always';

export interface FeishuChannelConfig {
  appId: string;
  appSecret: string;
  allowedOpenIds: Set<string>;
  domain: FeishuDomain;
  replyMode: FeishuReplyMode;
}

export interface FeishuChannelConfigReport {
  ok: boolean;
  path: string;
  missing: string[];
  config?: FeishuChannelConfig;
}

export function getFeishuEnvPath(): string {
  return join(getEnglishPilotHome(), 'feishu.env');
}

export function loadFeishuChannelConfig(
  env: NodeJS.ProcessEnv = process.env,
  envPath = getFeishuEnvPath(),
): FeishuChannelConfigReport {
  const values = {
    ...readFeishuEnvFile(envPath),
    ...definedEnvValues(env),
  };
  const missing: string[] = requiredFeishuEnvNames.filter((name) => !values[name]?.trim());
  const allowedOpenIds = parseList(values.FEISHU_ALLOWED_OPEN_IDS);
  if (allowedOpenIds.length === 0) missing.push('FEISHU_ALLOWED_OPEN_IDS');
  if (missing.length > 0) {
    return { ok: false, path: envPath, missing: [...new Set(missing)] };
  }
  return {
    ok: true,
    path: envPath,
    missing: [],
    config: {
      appId: values.FEISHU_APP_ID as string,
      appSecret: values.FEISHU_APP_SECRET as string,
      allowedOpenIds: new Set(allowedOpenIds),
      domain: parseDomain(values.FEISHU_DOMAIN),
      replyMode: parseReplyMode(values.FEISHU_REPLY_MODE),
    },
  };
}

export function formatFeishuChannelDoctor(report: FeishuChannelConfigReport): string {
  return [
    'Feishu long-connection bot',
    `Config file: ${report.path}`,
    `Ready: ${report.ok ? 'yes' : 'no'}`,
    `Missing: ${report.missing.length > 0 ? report.missing.join(', ') : 'none'}`,
    ...(report.config
      ? [
          `Domain: ${report.config.domain}`,
          `Allowed users: ${report.config.allowedOpenIds.size}`,
          `Reply mode: ${report.config.replyMode}`,
        ]
      : []),
    '',
  ].join('\n');
}

export function writeFeishuEnvFile(
  values: Record<string, string>,
  envPath = getFeishuEnvPath(),
): { written: true; path: string } {
  mkdirSync(dirname(envPath), { recursive: true });
  const content = [
    '# Managed by english-pilot feishu setup',
    `FEISHU_APP_ID=${quoteEnv(values.FEISHU_APP_ID ?? '')}`,
    `FEISHU_APP_SECRET=${quoteEnv(values.FEISHU_APP_SECRET ?? '')}`,
    `FEISHU_ALLOWED_OPEN_IDS=${quoteEnv(values.FEISHU_ALLOWED_OPEN_IDS ?? '')}`,
    `FEISHU_DOMAIN=${quoteEnv(values.FEISHU_DOMAIN ?? 'feishu')}`,
    `FEISHU_REPLY_MODE=${quoteEnv(values.FEISHU_REPLY_MODE ?? 'violation')}`,
    '',
  ].join('\n');
  writeFileSync(envPath, content, 'utf8');
  try {
    chmodSync(envPath, 0o600);
  } catch {
    // Best-effort on non-POSIX filesystems.
  }
  return { written: true, path: envPath };
}

export function readFeishuEnvFile(path = getFeishuEnvPath()): Record<string, string> {
  if (!existsSync(path)) return {};
  return Object.fromEntries(
    readFileSync(path, 'utf8')
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith('#') && line.includes('='))
      .map((line) => {
        const separator = line.indexOf('=');
        return [line.slice(0, separator).trim(), unquoteEnv(line.slice(separator + 1).trim())];
      }),
  );
}

const requiredFeishuEnvNames = ['FEISHU_APP_ID', 'FEISHU_APP_SECRET'] as const;

function definedEnvValues(env: NodeJS.ProcessEnv): Record<string, string> {
  return Object.fromEntries(
    ['FEISHU_APP_ID', 'FEISHU_APP_SECRET', 'FEISHU_ALLOWED_OPEN_IDS', 'FEISHU_DOMAIN', 'FEISHU_REPLY_MODE']
      .map((name) => [name, env[name]])
      .filter((entry): entry is [string, string] => typeof entry[1] === 'string' && entry[1].trim().length > 0),
  );
}

function parseList(value: string | undefined): string[] {
  return [
    ...new Set(
      (value ?? '')
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  ];
}

function parseDomain(value: string | undefined): FeishuDomain {
  return value?.trim().toLowerCase() === 'lark' ? 'lark' : 'feishu';
}

function parseReplyMode(value: string | undefined): FeishuReplyMode {
  const normalized = value?.trim().toLowerCase();
  if (normalized === 'silent' || normalized === 'always') return normalized;
  return 'violation';
}

function quoteEnv(value: string): string {
  return JSON.stringify(value);
}

function unquoteEnv(value: string): string {
  if (!value) return '';
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    try {
      return JSON.parse(value.replace(/^'/, '"').replace(/'$/, '"')) as string;
    } catch {
      return value.slice(1, -1);
    }
  }
  return value;
}
