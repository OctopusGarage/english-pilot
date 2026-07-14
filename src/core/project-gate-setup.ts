import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { homedir } from 'node:os';

export type ProjectGateIgnoreMode = 'repo' | 'global';

export interface ProjectGateDisableResult {
  operation: 'gate-disable';
  projectRoot: string;
  projectConfigPath: string;
  ignore: {
    mode: ProjectGateIgnoreMode;
    path: string;
    pattern: '.english-pilot.json';
  };
}

const PROJECT_CONFIG_FILE = '.english-pilot.json';
const PROJECT_CONFIG_PATTERN = '.english-pilot.json';

export function disableProjectGateHook(input: {
  cwd?: string;
  ignoreMode: ProjectGateIgnoreMode;
}): ProjectGateDisableResult {
  const project = findGitProject(input.cwd ?? process.cwd());
  const projectConfigPath = join(project.root, PROJECT_CONFIG_FILE);
  writeProjectGateOptOut(projectConfigPath);
  const ignorePath =
    input.ignoreMode === 'repo' ? join(project.gitDir, 'info', 'exclude') : resolveGlobalGitIgnorePath();
  appendUniqueLine(ignorePath, PROJECT_CONFIG_PATTERN);
  return {
    operation: 'gate-disable',
    projectRoot: project.root,
    projectConfigPath,
    ignore: {
      mode: input.ignoreMode,
      path: ignorePath,
      pattern: PROJECT_CONFIG_PATTERN,
    },
  };
}

function findGitProject(startPath: string): { root: string; gitDir: string } {
  let directory = resolve(startPath);
  while (true) {
    const gitDir = resolveGitDir(directory);
    if (gitDir) return { root: directory, gitDir };
    const parent = dirname(directory);
    if (parent === directory) throw new Error(`No Git repository found from ${startPath}.`);
    directory = parent;
  }
}

function resolveGitDir(directory: string): string | undefined {
  const dotGit = join(directory, '.git');
  if (!existsSync(dotGit)) return undefined;
  const stat = statSync(dotGit);
  if (stat.isDirectory()) return dotGit;
  if (!stat.isFile()) return undefined;
  const content = readFileSync(dotGit, 'utf8').trim();
  const match = /^gitdir:\s*(.+)$/i.exec(content);
  if (!match) return undefined;
  const gitDir = match[1].trim();
  return isAbsolute(gitDir) ? gitDir : resolve(directory, gitDir);
}

function writeProjectGateOptOut(path: string): void {
  const current = readJsonObject(path);
  const next = { ...current, gateHook: false };
  writeFileSync(path, `${JSON.stringify(next, null, 2)}\n`, 'utf8');
}

function readJsonObject(path: string): Record<string, unknown> {
  if (!existsSync(path)) return {};
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8')) as unknown;
    return isRecord(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function appendUniqueLine(path: string, line: string): void {
  mkdirSync(dirname(path), { recursive: true });
  const current = existsSync(path) ? readFileSync(path, 'utf8') : '';
  const lines = current.split(/\r?\n/).filter(Boolean);
  if (lines.includes(line)) return;
  const prefix = current.trimEnd();
  writeFileSync(path, `${prefix ? `${prefix}\n` : ''}${line}\n`, 'utf8');
}

function resolveGlobalGitIgnorePath(): string {
  const configured = configuredGlobalExcludesFile();
  if (configured) return expandHome(configured);
  const configHome = process.env.XDG_CONFIG_HOME?.trim() || join(homedir(), '.config');
  return join(configHome, 'git', 'ignore');
}

function configuredGlobalExcludesFile(): string | undefined {
  try {
    return execFileSync('git', ['config', '--global', '--get', 'core.excludesFile'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return undefined;
  }
}

function expandHome(path: string): string {
  if (path === '~') return homedir();
  if (path.startsWith('~/')) return join(homedir(), path.slice(2));
  return path;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
