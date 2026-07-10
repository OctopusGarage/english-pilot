import type { ExternalAgentBackend, ExternalAgentInvocation, ExternalAgentRunOptions } from './types.js';

export interface ExternalAgentBackendAdapter {
  backend: ExternalAgentBackend;
  buildInvocation: (options: ExternalAgentRunOptions, cwd: string) => ExternalAgentInvocation;
  extractConversationIds: (stdout: string) => { sessionId?: string; threadId?: string };
}

const claudeBackendAdapter: ExternalAgentBackendAdapter = {
  backend: 'claude',
  buildInvocation: (options, cwd) => {
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
      backend: 'claude',
      command: options.config.externalAgentClaudeBinary,
      args,
      cwd,
      promptStdin: options.prompt,
      ...(options.sessionId ? { sessionId: options.sessionId } : {}),
    };
  },
  extractConversationIds: (stdout) => {
    const sessionId = findJsonLineString(stdout, 'session_id', 'sessionId');
    return {
      ...(sessionId ? { sessionId } : {}),
    };
  },
};

const codexBackendAdapter: ExternalAgentBackendAdapter = {
  backend: 'codex',
  buildInvocation: (options, cwd) => {
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
      backend: 'codex',
      command: options.config.externalAgentCodexBinary,
      args,
      cwd,
      promptStdin: options.prompt,
      ...(options.threadId ? { threadId: options.threadId } : {}),
    };
  },
  extractConversationIds: (stdout) => {
    const threadId = findJsonLineString(stdout, 'thread_id', 'threadId');
    return {
      ...(threadId ? { threadId } : {}),
    };
  },
};

const backendAdapters = {
  claude: claudeBackendAdapter,
  codex: codexBackendAdapter,
} as const satisfies Record<ExternalAgentBackend, ExternalAgentBackendAdapter>;

export function getExternalAgentBackendAdapter(backend: ExternalAgentBackend): ExternalAgentBackendAdapter {
  return backendAdapters[backend];
}

function findJsonLineString(stdout: string, ...keys: string[]): string | undefined {
  for (const line of stdout.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('{')) continue;
    try {
      const parsed = JSON.parse(trimmed) as unknown;
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) continue;
      const record = parsed as Record<string, unknown>;
      const value = keys
        .map((key) => record[key])
        .find((candidate): candidate is string => isNonEmptyString(candidate));
      if (value) return value.trim();
    } catch {
      // Ignore non-JSON progress lines.
    }
  }
  return undefined;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}
