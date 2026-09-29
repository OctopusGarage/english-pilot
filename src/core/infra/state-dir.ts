import { chmodSync, mkdirSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, isAbsolute, join, relative, sep } from 'node:path';

export interface RuntimeLayout {
  home: string;
  configPath: string;
  sqlitePath: string;
  logsDir: string;
  runDir: string;
  controlSocketPath: string;
  instanceLockPath: string;
  runningMarkerPath: string;
  daemonLogPath: string;
}

export function getRuntimeHome(): string {
  return process.env.ENGLISH_PILOT_HOME || join(homedir(), '.english-pilot');
}

export function getRuntimeLayout(): RuntimeLayout {
  const home = getRuntimeHome();
  const logsDir = join(home, 'logs');
  const runDir = join(home, 'run');
  return {
    home,
    configPath: join(home, 'config.json'),
    sqlitePath: join(home, 'english-pilot.sqlite'),
    logsDir,
    runDir,
    controlSocketPath: join(runDir, 'english-pilot.sock'),
    instanceLockPath: join(runDir, '.instance.lock'),
    runningMarkerPath: join(runDir, '.running'),
    daemonLogPath: join(logsDir, 'daemon.log'),
  };
}

export function ensureRuntimeLayout(): RuntimeLayout {
  const layout = getRuntimeLayout();
  ensureRuntimeHome();
  mkdirPrivate(layout.logsDir);
  mkdirPrivate(layout.runDir);
  return layout;
}

export function ensureRuntimeHome(): string {
  const home = getRuntimeHome();
  mkdirPrivate(home);
  return home;
}

export function ensurePrivateRuntimeDirectory(directory: string): void {
  const home = ensureRuntimeHome();
  const relativePath = relative(home, directory);
  if (relativePath === '..' || relativePath.startsWith(`..${sep}`) || isAbsolute(relativePath)) {
    throw new Error('Private runtime directory must be inside the runtime home.');
  }
  let current = home;
  for (const segment of relativePath.split(sep).filter(Boolean)) {
    current = join(current, segment);
    mkdirPrivate(current);
  }
}

export function writePrivateRuntimeFile(path: string, content: string): void {
  ensurePrivateRuntimeDirectory(dirname(path));
  writeFileSync(path, content, { encoding: 'utf8', mode: 0o600 });
  chmodSync(path, 0o600);
}

function mkdirPrivate(path: string): void {
  mkdirSync(path, { recursive: true, mode: 0o700 });
  chmodSync(path, 0o700);
}
