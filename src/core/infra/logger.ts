import { appendFileSync } from 'node:fs';
import { ensureRuntimeLayout } from './state-dir.js';

export interface RuntimeLogger {
  info(message: string): void;
  error(message: string): void;
}

export function createRuntimeLogger(logPath = ensureRuntimeLayout().daemonLogPath): RuntimeLogger {
  return {
    info(message) {
      writeLog(logPath, 'info', message);
    },
    error(message) {
      writeLog(logPath, 'error', message);
    },
  };
}

function writeLog(logPath: string, level: 'info' | 'error', message: string): void {
  appendFileSync(
    logPath,
    `${JSON.stringify({
      time: new Date().toISOString(),
      level,
      message,
    })}\n`,
    'utf8',
  );
}
