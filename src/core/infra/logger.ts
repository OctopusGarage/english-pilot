import { appendFileSync } from 'node:fs';
import { ensureRuntimeLayout } from './state-dir.js';

export type RuntimeLogLevel = 'debug' | 'info' | 'warn' | 'error';
export type RuntimeLogFields = Record<string, unknown>;

export interface RuntimeLogger {
  debug(event: string, message?: string | RuntimeLogFields, fields?: RuntimeLogFields): void;
  info(event: string, message?: string | RuntimeLogFields, fields?: RuntimeLogFields): void;
  warn(event: string, message?: string | RuntimeLogFields, fields?: RuntimeLogFields): void;
  error(event: string, message?: string | RuntimeLogFields, fields?: RuntimeLogFields): void;
  child(fields: RuntimeLogFields): RuntimeLogger;
}

export function createRuntimeLogger(
  logPath = ensureRuntimeLayout().daemonLogPath,
  baseFields: RuntimeLogFields = {},
): RuntimeLogger {
  return {
    debug(event, message, fields) {
      writeLog(logPath, 'debug', event, message, { ...baseFields, ...fields });
    },
    info(event, message, fields) {
      writeLog(logPath, 'info', event, message, { ...baseFields, ...fields });
    },
    warn(event, message, fields) {
      writeLog(logPath, 'warn', event, message, { ...baseFields, ...fields });
    },
    error(event, message, fields) {
      writeLog(logPath, 'error', event, message, { ...baseFields, ...fields });
    },
    child(fields) {
      return createRuntimeLogger(logPath, { ...baseFields, ...fields });
    },
  };
}

function writeLog(
  logPath: string,
  level: RuntimeLogLevel,
  event: string,
  messageOrFields?: string | RuntimeLogFields,
  fields: RuntimeLogFields = {},
): void {
  const normalized = normalizeLogInput(event, messageOrFields, fields);
  appendFileSync(
    logPath,
    `${JSON.stringify(
      sanitizeFields({
        time: new Date().toISOString(),
        level,
        event: normalized.event,
        message: normalized.message,
        ...normalized.fields,
      }),
    )}\n`,
    'utf8',
  );
}

function normalizeLogInput(
  event: string,
  messageOrFields: string | RuntimeLogFields | undefined,
  fields: RuntimeLogFields,
): { event: string; message: string; fields: RuntimeLogFields } {
  if (typeof messageOrFields === 'string') {
    return { event: normalizeEvent(event), message: messageOrFields, fields };
  }
  return {
    event: 'runtime.message',
    message: event,
    fields: {
      ...(messageOrFields ?? {}),
      ...fields,
    },
  };
}

function normalizeEvent(event: string): string {
  const trimmed = event.trim();
  return trimmed.includes(' ') || trimmed.length === 0 ? 'runtime.message' : trimmed;
}

function sanitizeFields(fields: RuntimeLogFields): RuntimeLogFields {
  return Object.fromEntries(
    Object.entries(fields)
      .filter(([, value]) => value !== undefined)
      .map(([key, value]) => [key, sanitizeValue(value)]),
  );
}

function sanitizeValue(value: unknown): unknown {
  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message,
      stack: value.stack,
    };
  }
  if (typeof value === 'bigint') return value.toString();
  return value;
}
