import { existsSync, readFileSync, realpathSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import type { EnglishPilotConfig } from './types.js';

const PROJECT_CONFIG_FILE = '.english-pilot.json';

export function isProjectGateDisabled(config: EnglishPilotConfig, projectPath: string): boolean {
  const current = normalizePath(projectPath);
  if (hasLocalGateHookOptOut(current)) return true;
  return config.disabledProjectPaths.some((disabledPath) => isSameOrDescendant(current, normalizePath(disabledPath)));
}

function isSameOrDescendant(candidate: string, parent: string): boolean {
  const offset = relative(parent, candidate);
  return offset === '' || (!offset.startsWith('..') && !isAbsolute(offset));
}

function hasLocalGateHookOptOut(projectPath: string): boolean {
  let directory = projectPath;
  while (true) {
    if (localConfigDisablesGateHook(join(directory, PROJECT_CONFIG_FILE))) return true;
    const parent = dirname(directory);
    if (parent === directory) return false;
    directory = parent;
  }
}

function localConfigDisablesGateHook(path: string): boolean {
  if (!existsSync(path)) return false;
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8')) as unknown;
    return isRecord(parsed) && parsed.gateHook === false;
  } catch {
    return false;
  }
}

function normalizePath(path: string): string {
  const resolved = resolve(path);
  try {
    return realpathSync(resolved);
  } catch {
    return resolved;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
