import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';

export interface RunningMarker {
  pid: number;
  startedAt: string;
}

export type RestartState =
  { unclean: false; path: string } | { unclean: true; path: string; pid?: number; startedAt?: string };

export function markRunning(
  path: string,
  marker: RunningMarker = {
    pid: process.pid,
    startedAt: new Date().toISOString(),
  },
): RunningMarker {
  writeFileSync(path, `${JSON.stringify(marker, null, 2)}\n`, 'utf8');
  return marker;
}

export function markCleanShutdown(path: string): void {
  rmSync(path, { force: true });
}

export function detectUncleanRestart(path: string): RestartState {
  if (!existsSync(path)) return { unclean: false, path };
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8')) as Partial<RunningMarker>;
    return {
      unclean: true,
      path,
      ...(typeof parsed.pid === 'number' ? { pid: parsed.pid } : {}),
      ...(typeof parsed.startedAt === 'string' ? { startedAt: parsed.startedAt } : {}),
    };
  } catch {
    return { unclean: true, path };
  }
}
