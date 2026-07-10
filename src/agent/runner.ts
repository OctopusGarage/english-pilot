import { spawn } from 'node:child_process';
import type { EnglishPilotConfig } from '../core/types.js';
import { getExternalAgentBackendAdapter } from './backend-adapters.js';
import type {
  ExternalAgentBackend,
  ExternalAgentChildProcess,
  ExternalAgentInvocation,
  ExternalAgentRunOptions,
  ExternalAgentRunResult,
} from './types.js';

export type {
  ExternalAgentBackend,
  ExternalAgentInvocation,
  ExternalAgentRunOptions,
  ExternalAgentRunResult,
} from './types.js';

export function buildExternalAgentInvocation(options: ExternalAgentRunOptions): ExternalAgentInvocation {
  const backend = resolveBackend(options.config, options.backend);
  const cwd = resolveCwd(options.config, options.cwd);
  return getExternalAgentBackendAdapter(backend).buildInvocation(options, cwd);
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
    }) as ExternalAgentChildProcess;
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
  const finalResults: string[] = [];
  const agentMessages: string[] = [];
  const chunks: string[] = [];
  for (const line of stdout.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('{')) continue;
    try {
      const parsed = JSON.parse(trimmed) as unknown;
      collectPreferredText(parsed, finalResults, agentMessages);
      collectText(parsed, chunks);
    } catch {
      // Ignore non-JSON progress lines.
    }
  }
  const finalResult = finalResults.at(-1)?.trim();
  if (finalResult) return finalResult;
  const agentMessage = agentMessages.at(-1)?.trim();
  if (agentMessage) return agentMessage;
  return dedupeAdjacentTextChunks(chunks).join('\n').trim();
}

function collectPreferredText(value: unknown, finalResults: string[], agentMessages: string[]): void {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return;
  const record = value as Record<string, unknown>;
  if (record.type === 'result' && typeof record.result === 'string' && record.result.trim()) {
    finalResults.push(record.result.trim());
  }
  if (isAgentMessageItem(record.item)) {
    agentMessages.push(record.item.text.trim());
  }
}

function isAgentMessageItem(value: unknown): value is { type: 'agent_message'; text: string } {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return record.type === 'agent_message' && typeof record.text === 'string' && record.text.trim().length > 0;
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

function dedupeAdjacentTextChunks(chunks: string[]): string[] {
  const deduped: string[] = [];
  for (const chunk of chunks) {
    if (deduped[deduped.length - 1] === chunk) continue;
    deduped.push(chunk);
  }
  return deduped;
}

function withExtractedConversationIds(result: ExternalAgentRunResult): ExternalAgentRunResult {
  const ids = getExternalAgentBackendAdapter(result.backend).extractConversationIds(result.stdout);
  return {
    ...result,
    ...ids,
  };
}
