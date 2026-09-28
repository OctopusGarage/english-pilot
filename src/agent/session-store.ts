import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
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

// Only pending turns are retained. A reset or saved replacement invalidates
// their permission to mutate this scope, including turns with no saved session.
const pendingTurns = new Map<string, Set<{ current: boolean }>>();

export function trackAgentSessionTurn(scope: string): { isCurrent(): boolean; finish(): void } {
  const key = pendingTurnKey(scope);
  const turns = pendingTurns.get(key) ?? new Set<{ current: boolean }>();
  const turn = { current: true };
  turns.add(turn);
  pendingTurns.set(key, turns);
  return {
    isCurrent: () => turn.current,
    finish: () => {
      turns.delete(turn);
      if (turns.size === 0) pendingTurns.delete(key);
    },
  };
}

function invalidatePendingTurns(scope: string): void {
  for (const turn of pendingTurns.get(pendingTurnKey(scope)) ?? []) turn.current = false;
}

function pendingTurnKey(scope: string): string {
  return JSON.stringify([getEnglishPilotHome(), scope]);
}

export function getAgentSession(
  scope: string,
  backend: ExternalAgentBackend,
  cwd: string,
): AgentSessionEntry | undefined {
  const entry = readAgentSessions()[sessionKey(scope, backend, cwd)];
  if (!entry || entry.backend !== backend || entry.cwd !== cwd) return undefined;
  if (backend === 'claude' && entry.sessionId) return entry;
  if (backend === 'codex' && entry.threadId) return entry;
  return undefined;
}

export function saveAgentSessionFromResult(
  scope: string,
  result: ExternalAgentRunResult,
): AgentSessionEntry | undefined {
  const sessionId = result.backend === 'claude' ? result.sessionId?.trim() : undefined;
  const threadId = result.backend === 'codex' ? result.threadId?.trim() : undefined;
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
  sessions[sessionKey(scope, result.backend, result.cwd)] = entry;
  writeAgentSessions(sessions);
  invalidatePendingTurns(scope);
  return entry;
}

export function clearAgentSession(scope: string): boolean {
  invalidatePendingTurns(scope);
  const sessions = readAgentSessions();
  let removed = false;
  for (const [key, entry] of Object.entries(sessions)) {
    if (entry.scope !== scope) continue;
    delete sessions[key];
    removed = true;
  }
  if (!removed) return false;
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
    return canonicalizeAgentSessions(
      Object.entries(parsed as Record<string, unknown>)
        .map(([key, value]) => [key, normalizeEntry(key, value)] as const)
        .filter((entry): entry is readonly [string, AgentSessionEntry] => entry[1] !== undefined),
    );
  } catch {
    return {};
  }
}

function sessionKey(scope: string, backend: ExternalAgentBackend, cwd: string): string {
  return [scope, backend, cwd].map(encodeURIComponent).join('::');
}

function canonicalizeAgentSessions(
  entries: Array<readonly [string, AgentSessionEntry]>,
): Record<string, AgentSessionEntry> {
  return Object.fromEntries(
    entries.map(([, entry]) => [sessionKey(entry.scope, entry.backend, entry.cwd), entry] as const),
  );
}

function writeAgentSessions(sessions: Record<string, AgentSessionEntry>): void {
  const path = agentSessionsPath();
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(sessions, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
  chmodSync(path, 0o600);
}

function normalizeEntry(storageKey: string, value: unknown): AgentSessionEntry | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const record = value as Record<string, unknown>;
  if (typeof record.scope !== 'string' || !record.scope.trim()) return undefined;
  if (record.backend !== 'claude' && record.backend !== 'codex') return undefined;
  if (typeof record.cwd !== 'string' || !record.cwd.trim()) return undefined;
  const sessionId =
    typeof record.sessionId === 'string' && record.sessionId.trim() ? record.sessionId.trim() : undefined;
  const threadId = typeof record.threadId === 'string' && record.threadId.trim() ? record.threadId.trim() : undefined;
  if (record.backend === 'claude' && !sessionId) return undefined;
  if (record.backend === 'codex' && !threadId) return undefined;
  if (storageKey !== record.scope && storageKey !== sessionKey(record.scope, record.backend, record.cwd)) {
    return undefined;
  }
  return {
    scope: record.scope,
    backend: record.backend,
    cwd: record.cwd,
    updatedAt: typeof record.updatedAt === 'string' ? record.updatedAt : new Date(0).toISOString(),
    ...(sessionId ? { sessionId } : {}),
    ...(threadId ? { threadId } : {}),
  };
}
