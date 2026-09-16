import { spawn } from 'node:child_process';
import { StringDecoder } from 'node:string_decoder';
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
  return spawnExternalAgent(
    invocation,
    timeoutMs,
    options.spawnProcess ?? spawn,
    options.maxOutputBytes,
    options.waitForChildCloseAfterTermination,
    options.spawnEnv,
    options.onChildTermination,
  );
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
  maxOutputBytes?: number,
  waitForChildCloseAfterTermination = false,
  spawnEnv?: NodeJS.ProcessEnv,
  onChildTermination?: () => void,
): Promise<ExternalAgentRunResult> {
  return new Promise((resolve, reject) => {
    let childTerminationNotified = false;
    const notifyChildTermination = () => {
      if (childTerminationNotified) return;
      childTerminationNotified = true;
      onChildTermination?.();
    };
    let child: ExternalAgentChildProcess;
    try {
      child = spawnProcess(invocation.command, invocation.args, {
        cwd: invocation.cwd,
        stdio: 'pipe',
        shell: false,
        ...(spawnEnv ? { env: spawnEnv } : {}),
      }) as ExternalAgentChildProcess;
    } catch (error) {
      notifyChildTermination();
      reject(error);
      return;
    }
    let stdout = '';
    let stderr = '';
    let outputBytes = 0;
    let settled = false;
    let terminatedResult: ExternalAgentRunResult | undefined;
    let terminationSignal: NodeJS.Signals = 'SIGTERM';
    let terminationGraceTimer: ReturnType<typeof setTimeout> | undefined;
    const stdoutDecoder = maxOutputBytes === undefined ? undefined : new StringDecoder('utf8');
    const stderrDecoder = maxOutputBytes === undefined ? undefined : new StringDecoder('utf8');
    const resolveResult = (result: ExternalAgentRunResult) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (terminationGraceTimer) clearTimeout(terminationGraceTimer);
      resolve(withExtractedConversationIds(result));
    };
    const terminateWithResult = (result: ExternalAgentRunResult) => {
      if (!waitForChildCloseAfterTermination) {
        child.kill('SIGTERM');
        resolveResult(result);
        return;
      }
      terminatedResult = result;
      terminationGraceTimer = setTimeout(() => {
        if (settled || !terminatedResult) return;
        terminationSignal = 'SIGKILL';
        const killSent = child.kill('SIGKILL');
        if (!killSent) {
          // Node reports false when the process is already gone; no close event
          // can arrive, so this is the final state that permits cleanup.
          resolveResult({
            ...terminatedResult,
            signal: terminationSignal,
            terminationFailure: 'SIGKILL_NOT_SENT',
          });
          notifyChildTermination();
        }
      }, 100);
      child.kill('SIGTERM');
    };
    const boundedStderr = (message: string) => {
      if (maxOutputBytes === undefined) return `${stderr}${message}`;
      const remaining = Math.max(0, maxOutputBytes - outputBytes);
      if (remaining === 0) return stderr;
      const decoder = new StringDecoder('utf8');
      return `${stderr}${decoder.write(Buffer.from(message, 'utf8').subarray(0, remaining))}`;
    };
    const timer = setTimeout(() => {
      terminateWithResult({
        operation: 'external-agent-run',
        ...invocation,
        dryRun: false,
        exitCode: null,
        signal: 'SIGTERM',
        stdout,
        stderr: boundedStderr(
          `${stderr.endsWith('\n') || stderr.length === 0 ? '' : '\n'}External agent timed out after ${timeoutMs}ms.\n`,
        ),
      });
    }, timeoutMs);

    const stopForOutputLimit = () => {
      if (settled) return;
      terminateWithResult({
        operation: 'external-agent-run',
        ...invocation,
        dryRun: false,
        exitCode: null,
        signal: 'SIGTERM',
        stdout,
        stderr,
        outputLimitExceeded: true,
      });
    };
    const appendOutput = (target: 'stdout' | 'stderr', chunk: Buffer) => {
      if (settled || terminatedResult) return;
      if (maxOutputBytes === undefined) {
        if (target === 'stdout') stdout += chunk.toString('utf8');
        else stderr += chunk.toString('utf8');
        return;
      }
      const chunkBytes = chunk.byteLength;
      const remaining = maxOutputBytes - outputBytes;
      if (remaining <= 0) {
        stopForOutputLimit();
        return;
      }
      const accepted = chunk.subarray(0, remaining);
      outputBytes += accepted.byteLength;
      const decoded = target === 'stdout' ? stdoutDecoder?.write(accepted) : stderrDecoder?.write(accepted);
      if (target === 'stdout') stdout += decoded ?? '';
      else stderr += decoded ?? '';
      if (maxOutputBytes !== undefined && chunkBytes > accepted.byteLength) stopForOutputLimit();
    };
    child.stdout.on('data', (chunk: Buffer) => appendOutput('stdout', chunk));
    child.stderr.on('data', (chunk: Buffer) => appendOutput('stderr', chunk));
    child.on('error', (error) => {
      if (settled || terminatedResult) return;
      resolveResult({
        operation: 'external-agent-run',
        ...invocation,
        dryRun: false,
        exitCode: 1,
        stdout,
        stderr: boundedStderr(`${error.message}\n`),
      });
      notifyChildTermination();
    });
    child.on('close', (code, signal) => {
      if (terminatedResult) {
        resolveResult({
          ...terminatedResult,
          signal: terminationSignal,
        });
        notifyChildTermination();
        return;
      }
      if (settled) return;
      resolveResult({
        operation: 'external-agent-run',
        ...invocation,
        dryRun: false,
        exitCode: code,
        signal,
        stdout,
        stderr,
      });
      notifyChildTermination();
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
