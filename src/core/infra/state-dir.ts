import { mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

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
  mkdirSync(layout.home, { recursive: true });
  mkdirSync(layout.logsDir, { recursive: true });
  mkdirSync(layout.runDir, { recursive: true });
  return layout;
}
