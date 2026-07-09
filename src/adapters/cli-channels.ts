import { loadConfig } from '../core/config.js';
import { formatFeishuChannelDoctor, loadFeishuChannelConfig } from '../channels/feishu/config.js';
import { runFeishuOnboarding } from '../channels/feishu/onboarding.js';
import { startFeishuChannel } from '../channels/feishu/start.js';
import { formatWeChatChannelDoctor, loadWeChatChannelConfig } from '../channels/wechat/config.js';
import { runWeChatOnboarding } from '../channels/wechat/onboarding.js';
import { listWeChatAccounts, removeWeChatAccount } from '../channels/wechat/state.js';
import { startWeChatChannel } from '../channels/wechat/start.js';
import type { CliResult } from './cli-types.js';

export function runFeishu(args: string[]): CliResult {
  const [subcommand] = args;
  if (subcommand === 'doctor') {
    const report = loadFeishuChannelConfig();
    return {
      exitCode: report.ok ? 0 : 1,
      stdout: args.includes('--json') ? `${JSON.stringify(report, null, 2)}\n` : formatFeishuChannelDoctor(report),
      stderr: '',
    };
  }
  if (subcommand === 'start' && args.includes('--dry-run')) {
    return runFeishuStartDryRun(args);
  }
  return {
    exitCode: 1,
    stdout: '',
    stderr: [
      'Usage:',
      '  english-pilot feishu setup [--json]',
      '  english-pilot feishu doctor [--json]',
      '  english-pilot feishu start [--dry-run] [--json]',
      '',
    ].join('\n'),
  };
}

export async function runFeishuAsync(args: string[]): Promise<CliResult> {
  const [subcommand] = args;
  if (subcommand === 'setup') {
    try {
      const result = await runFeishuOnboarding({
        write: !args.includes('--no-write'),
        log: (line) => {
          process.stderr.write(`${line}\n`);
        },
      });
      return {
        exitCode: 0,
        stdout: args.includes('--json')
          ? `${JSON.stringify(redactFeishuOnboardingResult(result), null, 2)}\n`
          : [
              `Installed Feishu long-connection config: ${result.written?.path ?? 'not written'}`,
              `Allowed open_id: ${result.allowedOpenId ?? 'missing; set FEISHU_ALLOWED_OPEN_IDS before starting'}`,
              'Start it with: english-pilot feishu start',
              '',
            ].join('\n'),
        stderr: '',
      };
    } catch (error) {
      return {
        exitCode: 1,
        stdout: '',
        stderr: `${error instanceof Error ? error.message : String(error)}\n`,
      };
    }
  }
  if (subcommand === 'start') {
    try {
      const preview = await startFeishuChannel({
        dryRun: args.includes('--dry-run'),
        log: (line) => {
          process.stderr.write(`${line}\n`);
        },
      });
      return {
        exitCode: preview.ready ? 0 : 1,
        stdout: args.includes('--json') ? `${JSON.stringify(preview, null, 2)}\n` : formatFeishuStartPreview(preview),
        stderr: '',
      };
    } catch (error) {
      return {
        exitCode: 1,
        stdout: '',
        stderr: `${error instanceof Error ? error.message : String(error)}\n`,
      };
    }
  }
  return runFeishu(args);
}

export function runWeChat(args: string[]): CliResult {
  const [subcommand] = args;
  if (subcommand === 'doctor') {
    const report = loadWeChatChannelConfig();
    return {
      exitCode: report.ok ? 0 : 1,
      stdout: args.includes('--json')
        ? `${JSON.stringify(report, redactSecrets, 2)}\n`
        : formatWeChatChannelDoctor(report),
      stderr: '',
    };
  }
  if (subcommand === 'accounts') {
    const accounts = listWeChatAccounts().map((account) => ({
      accountId: account.accountId,
      baseUrl: account.baseUrl,
      userId: account.userId,
      savedAt: account.savedAt,
    }));
    return {
      exitCode: 0,
      stdout: args.includes('--json')
        ? `${JSON.stringify({ accounts }, null, 2)}\n`
        : accounts.map((account) => `${account.accountId} ${account.userId ?? ''}`.trim()).join('\n') +
          (accounts.length ? '\n' : ''),
      stderr: '',
    };
  }
  if (subcommand === 'logout') {
    const accountId = args[1];
    if (!accountId) {
      return {
        exitCode: 1,
        stdout: '',
        stderr: 'Usage: english-pilot wechat logout <accountId>\n',
      };
    }
    const removed = removeWeChatAccount(accountId);
    return {
      exitCode: removed ? 0 : 1,
      stdout: removed ? `Removed WeChat account: ${accountId}\n` : '',
      stderr: removed ? '' : `WeChat account not found: ${accountId}\n`,
    };
  }
  if (subcommand === 'start' && args.includes('--dry-run')) {
    return runWeChatStartDryRun(args);
  }
  return {
    exitCode: 1,
    stdout: '',
    stderr: [
      'Usage:',
      '  english-pilot wechat setup [--json]',
      '  english-pilot wechat doctor [--json]',
      '  english-pilot wechat accounts [--json]',
      '  english-pilot wechat logout <accountId>',
      '  english-pilot wechat start [--dry-run] [--json]',
      '',
    ].join('\n'),
  };
}

export async function runWeChatAsync(args: string[]): Promise<CliResult> {
  const [subcommand] = args;
  if (subcommand === 'setup') {
    try {
      const result = await runWeChatOnboarding({
        log: (line) => {
          process.stderr.write(`${line}\n`);
        },
      });
      return {
        exitCode: result.connected ? 0 : 1,
        stdout: args.includes('--json')
          ? `${JSON.stringify(result, redactSecrets, 2)}\n`
          : [
              result.message,
              result.account?.userId
                ? `Add this user to WECHAT_ALLOWED_USERS before starting: ${result.account.userId}`
                : 'Set WECHAT_ALLOWED_USERS to the sender IDs that may talk to EnglishPilot.',
              'Start it with: english-pilot wechat start',
              '',
            ].join('\n'),
        stderr: '',
      };
    } catch (error) {
      return {
        exitCode: 1,
        stdout: '',
        stderr: `${error instanceof Error ? error.message : String(error)}\n`,
      };
    }
  }
  if (subcommand === 'start') {
    try {
      const preview = await startWeChatChannel({
        dryRun: args.includes('--dry-run'),
        log: (line) => {
          process.stderr.write(`${line}\n`);
        },
      });
      return {
        exitCode: preview.ready ? 0 : 1,
        stdout: args.includes('--json') ? `${JSON.stringify(preview, null, 2)}\n` : formatWeChatStartPreview(preview),
        stderr: '',
      };
    } catch (error) {
      return {
        exitCode: 1,
        stdout: '',
        stderr: `${error instanceof Error ? error.message : String(error)}\n`,
      };
    }
  }
  return runWeChat(args);
}

function runFeishuStartDryRun(args: string[]): CliResult {
  const report = loadFeishuChannelConfig();
  const preview = {
    operation: 'feishu-long-connection-start' as const,
    ready: report.ok,
    wouldConnect: false,
    ...(report.config
      ? {
          domain: report.config.domain,
          allowedUsers: report.config.allowedOpenIds.size,
        }
      : {}),
    agentBackend: loadConfig().externalAgentBackend,
    missing: report.missing,
  };
  return {
    exitCode: preview.ready ? 0 : 1,
    stdout: args.includes('--json') ? `${JSON.stringify(preview, null, 2)}\n` : formatFeishuStartPreview(preview),
    stderr: '',
  };
}

function runWeChatStartDryRun(args: string[]): CliResult {
  const report = loadWeChatChannelConfig();
  const preview = {
    operation: 'wechat-long-connection-start' as const,
    ready: report.ok,
    wouldConnect: false,
    accountCount: report.config?.accounts.length ?? 0,
    allowedUsers: report.config?.allowedUsers.size ?? 0,
    agentBackend: loadConfig().externalAgentBackend,
    missing: report.missing,
  };
  return {
    exitCode: preview.ready ? 0 : 1,
    stdout: args.includes('--json') ? `${JSON.stringify(preview, null, 2)}\n` : formatWeChatStartPreview(preview),
    stderr: '',
  };
}

function formatFeishuStartPreview(preview: {
  ready: boolean;
  wouldConnect: boolean;
  domain?: string;
  allowedUsers?: number;
  agentBackend?: string;
  missing: string[];
}): string {
  return [
    'Feishu long-connection bot',
    `Ready: ${preview.ready ? 'yes' : 'no'}`,
    `Would connect: ${preview.wouldConnect ? 'yes' : 'no'}`,
    ...(preview.domain ? [`Domain: ${preview.domain}`] : []),
    ...(preview.allowedUsers !== undefined ? [`Allowed users: ${preview.allowedUsers}`] : []),
    ...(preview.agentBackend ? [`Agent backend: ${preview.agentBackend}`] : []),
    `Missing: ${preview.missing.length > 0 ? preview.missing.join(', ') : 'none'}`,
    '',
  ].join('\n');
}

function formatWeChatStartPreview(preview: {
  ready: boolean;
  wouldConnect: boolean;
  accountCount: number;
  allowedUsers: number;
  agentBackend?: string;
  missing: string[];
}): string {
  return [
    'WeChat long-connection channel',
    `Ready: ${preview.ready ? 'yes' : 'no'}`,
    `Would connect: ${preview.wouldConnect ? 'yes' : 'no'}`,
    `Accounts: ${preview.accountCount}`,
    `Allowed users: ${preview.allowedUsers}`,
    ...(preview.agentBackend ? [`Agent backend: ${preview.agentBackend}`] : []),
    `Missing: ${preview.missing.length > 0 ? preview.missing.join(', ') : 'none'}`,
    '',
  ].join('\n');
}

function redactSecrets(key: string, value: unknown): unknown {
  if (typeof value !== 'string') return value;
  return /token|secret|authorization/i.test(key) ? '***' : value;
}

function redactFeishuOnboardingResult(
  result: Awaited<ReturnType<typeof runFeishuOnboarding>>,
): Record<string, unknown> {
  return {
    appId: result.appId,
    domain: result.domain,
    allowedOpenId: result.allowedOpenId,
    written: result.written,
    env: {
      ...result.env,
      FEISHU_APP_SECRET: result.env.FEISHU_APP_SECRET ? '[REDACTED]' : '',
    },
  };
}
