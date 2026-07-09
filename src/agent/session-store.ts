import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { getEnglishPilotHome } from '../core/config.js';
import type { ExternalAgentBackend, ExternalAgentRunResult } from './runner.js';

export interface AgentSessionEntry {
  scope: string;
  backend: ExternalAgentBackend;
  cwd: string;
  updatedAt: string;
  sessionId?: string;
  threadId?: string;
}

export function getAgentSession(
  scope: string,
  backend: ExternalAgentBackend,
  cwd: string,
): AgentSessionEntry | undefined {
  const entry = readAgentSessions()[scope];
  if (!entry || entry.backend !== backend || entry.cwd !== cwd) return undefined;
  if (backend === 'claude' && entry.sessionId) return entry;
  if (backend === 'codex' && entry.threadId) return entry;
  return undefined;
}

export function saveAgentSessionFromResult(
  scope: string,
  result: ExternalAgentRunResult,
): AgentSessionEntry | undefined {
  const sessionId = result.backend === 'claude' ? result.sessionId : undefined;
  const threadId = result.backend === 'codex' ? result.threadId : undefined;
  if (!sessionId && !threadId) return undefined;
  const sessions = readAgentSessions();
  const entry: AgentSessionEntry = {
    scope,
    backend: result.backend,
    cwd: result.cwd,
    updatedAt: new Date().toISOString(),
    ...(sessionId ? { sessionId } : {}),
    ...(threadId ? { threadId } : {}),
  };
  sessions[scope] = entry;
  writeAgentSessions(sessions);
  return entry;
}

export function clearAgentSession(scope: string): boolean {
  const sessions = readAgentSessions();
  if (!sessions[scope]) return false;
  delete sessions[scope];
  writeAgentSessions(sessions);
  return true;
}

function agentSessionsPath(): string {
  return join(getEnglishPilotHome(), 'agent-sessions.json');
}

function readAgentSessions(): Record<string, AgentSessionEntry> {
  const path = agentSessionsPath();
  if (!existsSync(path)) return {};
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8')) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    return Object.fromEntries(
      Object.entries(parsed as Record<string, unknown>)
        .map(([scope, value]) => [scope, normalizeEntry(scope, value)] as const)
        .filter((entry): entry is readonly [string, AgentSessionEntry] => entry[1] !== undefined),
    );
  } catch {
    return {};
  }
}

function writeAgentSessions(sessions: Record<string, AgentSessionEntry>): void {
  const path = agentSessionsPath();
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(sessions, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
}

function normalizeEntry(scope: string, value: unknown): AgentSessionEntry | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const record = value as Record<string, unknown>;
  if (record.scope !== scope) return undefined;
  if (record.backend !== 'claude' && record.backend !== 'codex') return undefined;
  if (typeof record.cwd !== 'string' || !record.cwd.trim()) return undefined;
  const sessionId =
    typeof record.sessionId === 'string' && record.sessionId.trim() ? record.sessionId.trim() : undefined;
  const threadId = typeof record.threadId === 'string' && record.threadId.trim() ? record.threadId.trim() : undefined;
  if (record.backend === 'claude' && !sessionId) return undefined;
  if (record.backend === 'codex' && !threadId) return undefined;
  return {
    scope,
    backend: record.backend,
    cwd: record.cwd,
    updatedAt: typeof record.updatedAt === 'string' ? record.updatedAt : new Date(0).toISOString(),
    ...(sessionId ? { sessionId } : {}),
    ...(threadId ? { threadId } : {}),
  };
}
