import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import type { EnglishPilotConfig } from '../core/types.js';

export type ExternalAgentBackend = Exclude<EnglishPilotConfig['externalAgentBackend'], 'off'>;

export interface ExternalAgentInvocation {
  backend: ExternalAgentBackend;
  command: string;
  args: string[];
  cwd: string;
  promptStdin: string;
  sessionId?: string;
  threadId?: string;
}

export interface ExternalAgentRunOptions {
  config: EnglishPilotConfig;
  prompt: string;
  backend?: ExternalAgentBackend;
  cwd?: string;
  dryRun?: boolean;
  timeoutMs?: number;
  sessionId?: string;
  threadId?: string;
  spawnProcess?: typeof spawn;
}

export interface ExternalAgentRunResult extends ExternalAgentInvocation {
  operation: 'external-agent-run';
  dryRun: boolean;
  exitCode: number | null;
  signal?: NodeJS.Signals | null;
  stdout: string;
  stderr: string;
  sessionId?: string;
  threadId?: string;
}

export function buildExternalAgentInvocation(options: ExternalAgentRunOptions): ExternalAgentInvocation {
  const backend = resolveBackend(options.config, options.backend);
  const cwd = resolveCwd(options.config, options.cwd);
  if (backend === 'claude') {
    const args = [
      '-p',
      '--output-format',
      'stream-json',
      '--verbose',
      '--permission-mode',
      'bypassPermissions',
      ...(options.sessionId ? ['--resume', options.sessionId] : []),
    ];
    return {
      backend,
      command: options.config.externalAgentClaudeBinary,
      args,
      cwd,
      promptStdin: options.prompt,
      ...(options.sessionId ? { sessionId: options.sessionId } : {}),
    };
  }

  const globalFlags = [
    '--sandbox',
    options.config.externalAgentCodexSandbox,
    '-c',
    'approval_policy="never"',
    '-c',
    'shell_environment_policy.inherit="all"',
    '--skip-git-repo-check',
    '-C',
    cwd,
  ];
  const args = options.threadId
    ? ['exec', ...globalFlags, 'resume', '--json', options.threadId, '-']
    : ['exec', '--json', ...globalFlags, '-'];
  return {
    backend,
    command: options.config.externalAgentCodexBinary,
    args,
    cwd,
    promptStdin: options.prompt,
    ...(options.threadId ? { threadId: options.threadId } : {}),
  };
}

export async function runExternalAgent(options: ExternalAgentRunOptions): Promise<ExternalAgentRunResult> {
  const invocation = buildExternalAgentInvocation(options);
  if (options.dryRun) {
    return {
      operation: 'external-agent-run',
      ...invocation,
      dryRun: true,
      exitCode: 0,
      stdout: '',
      stderr: '',
      ...(invocation.sessionId ? { sessionId: invocation.sessionId } : {}),
      ...(invocation.threadId ? { threadId: invocation.threadId } : {}),
    };
  }

  const timeoutMs = options.timeoutMs ?? options.config.externalAgentTimeoutMs;
  return spawnExternalAgent(invocation, timeoutMs, options.spawnProcess ?? spawn);
}

export function formatExternalAgentRunResult(result: ExternalAgentRunResult): string {
  return [
    `External agent: ${result.backend}`,
    `Command: ${formatCommandForDisplay(result.command, result.args)}`,
    `Cwd: ${result.cwd}`,
    `Dry run: ${result.dryRun ? 'yes' : 'no'}`,
    `Exit code: ${result.exitCode ?? 'none'}`,
    ...(result.stdout.trim() ? ['', result.stdout.trim()] : []),
    ...(result.stderr.trim() ? ['', 'stderr:', result.stderr.trim()] : []),
    '',
  ].join('\n');
}

export function extractExternalAgentReplyText(result: ExternalAgentRunResult): string {
  const structured = extractStructuredText(result.stdout);
  return structured || result.stdout.trim();
}

function resolveBackend(config: EnglishPilotConfig, override: ExternalAgentBackend | undefined): ExternalAgentBackend {
  if (override) return override;
  if (config.externalAgentBackend === 'claude' || config.externalAgentBackend === 'codex') {
    return config.externalAgentBackend;
  }
  throw new Error(
    'External agent backend is not configured. Set externalAgentBackend to claude or codex, or pass --backend claude|codex.',
  );
}

function resolveCwd(config: EnglishPilotConfig, override: string | undefined): string {
  const configured = override?.trim() || config.externalAgentCwd.trim();
  return configured || process.cwd();
}

function spawnExternalAgent(
  invocation: ExternalAgentInvocation,
  timeoutMs: number,
  spawnProcess: typeof spawn,
): Promise<ExternalAgentRunResult> {
  return new Promise((resolve) => {
    const child = spawnProcess(invocation.command, invocation.args, {
      cwd: invocation.cwd,
      stdio: 'pipe',
      shell: false,
    }) as ChildProcessWithoutNullStreams;
    let stdout = '';
    let stderr = '';
    let settled = false;
    const timer = setTimeout(() => {
      settled = true;
      child.kill('SIGTERM');
      resolve(
        withExtractedConversationIds({
          operation: 'external-agent-run',
          ...invocation,
          dryRun: false,
          exitCode: null,
          signal: 'SIGTERM',
          stdout,
          stderr: `${stderr}${stderr.endsWith('\n') || stderr.length === 0 ? '' : '\n'}External agent timed out after ${timeoutMs}ms.\n`,
        }),
      );
    }, timeoutMs);

    child.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString('utf8');
    });
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString('utf8');
    });
    child.on('error', (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(
        withExtractedConversationIds({
          operation: 'external-agent-run',
          ...invocation,
          dryRun: false,
          exitCode: 1,
          stdout,
          stderr: `${stderr}${error.message}\n`,
        }),
      );
    });
    child.on('close', (code, signal) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(
        withExtractedConversationIds({
          operation: 'external-agent-run',
          ...invocation,
          dryRun: false,
          exitCode: code,
          signal,
          stdout,
          stderr,
        }),
      );
    });

    child.stdin.end(invocation.promptStdin);
  });
}

function formatCommandForDisplay(command: string, args: string[]): string {
  return [command, ...args].map(shellQuote).join(' ');
}

function shellQuote(value: string): string {
  if (/^[A-Za-z0-9_./:=@-]+$/.test(value)) return value;
  return `'${value.replace(/'/g, "'\\''")}'`;
}

function extractStructuredText(stdout: string): string {
  const chunks: string[] = [];
  for (const line of stdout.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('{')) continue;
    try {
      collectText(JSON.parse(trimmed) as unknown, chunks);
    } catch {
      // Ignore non-JSON progress lines.
    }
  }
  return chunks.join('\n').trim();
}

function collectText(value: unknown, chunks: string[]): void {
  if (!value || typeof value !== 'object') return;
  if (Array.isArray(value)) {
    value.forEach((item) => collectText(item, chunks));
    return;
  }
  const record = value as Record<string, unknown>;
  for (const key of ['result', 'text', 'delta', 'content']) {
    const candidate = record[key];
    if (typeof candidate === 'string' && candidate.trim()) {
      chunks.push(candidate.trim());
    }
  }
  if (typeof record.message === 'object' && record.message) collectText(record.message, chunks);
  if (Array.isArray(record.content)) collectText(record.content, chunks);
  if (typeof record.item === 'object' && record.item) collectText(record.item, chunks);
}

function withExtractedConversationIds(result: ExternalAgentRunResult): ExternalAgentRunResult {
  const ids = extractConversationIds(result.stdout);
  return {
    ...result,
    ...(result.backend === 'claude' && ids.sessionId ? { sessionId: ids.sessionId } : {}),
    ...(result.backend === 'codex' && ids.threadId ? { threadId: ids.threadId } : {}),
  };
}

function extractConversationIds(stdout: string): { sessionId?: string; threadId?: string } {
  let sessionId: string | undefined;
  let threadId: string | undefined;
  for (const line of stdout.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('{')) continue;
    try {
      const parsed = JSON.parse(trimmed) as unknown;
      if (!parsed || typeof parsed !== 'object') continue;
      const record = parsed as Record<string, unknown>;
      sessionId = sessionId ?? firstString(record.session_id, record.sessionId);
      threadId = threadId ?? firstString(record.thread_id, record.threadId);
    } catch {
      // Ignore non-JSON progress lines.
    }
  }
  return {
    ...(sessionId ? { sessionId } : {}),
    ...(threadId ? { threadId } : {}),
  };
}

function firstString(...values: unknown[]): string | undefined {
  return values.find((value): value is string => typeof value === 'string' && value.trim().length > 0)?.trim();
}
