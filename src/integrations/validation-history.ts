import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { getEnglishPilotHome } from '../core/config.js';
import type { IntegrationAccountValidationResult, IntegrationAccountValidationStage } from './account-validation.js';
import type { IntegrationTargetId, IntegrationTargetStatus } from './targets.js';
import type { IntegrationTarget } from './targets.js';

export interface IntegrationValidationRecord {
  id: string;
  createdAt: string;
  operation: 'account-validation';
  target: {
    id: IntegrationTargetId;
    label: string;
    status: IntegrationTargetStatus;
  };
  validated: boolean;
  send: boolean;
  network: boolean;
  stages: IntegrationAccountValidationStage[];
  blockers: string[];
  deliveryTargetApi?: string;
  providerResponse?: Record<string, unknown>;
}

export interface IntegrationValidationRequirement {
  ready: boolean;
  requirement: 'account-validation-history';
  required: true;
  validated: boolean;
  target: {
    id: IntegrationTargetId;
    label: string;
    status: IntegrationTargetStatus;
  };
  record?: IntegrationValidationRecord;
  blockers: string[];
}

export function recordIntegrationValidation(
  result: IntegrationAccountValidationResult,
  now = new Date(),
): IntegrationValidationRecord {
  const record = buildIntegrationValidationRecord(result, now);
  appendJsonLine(validationHistoryPath(), record);
  return record;
}

export function listIntegrationValidationRecords(
  filter: {
    target?: 'feishu' | 'wechat';
  } = {},
): IntegrationValidationRecord[] {
  const records = readJsonLines<IntegrationValidationRecord>(validationHistoryPath());
  if (!filter.target) return records;
  return records.filter((record) => record.target.id === filter.target);
}

export function formatIntegrationValidationHistory(records: IntegrationValidationRecord[]): string {
  if (records.length === 0) return 'No integration validation records.\n';
  return (
    records
      .map((record) =>
        [
          `${record.createdAt} - ${record.target.label}: ${record.validated ? 'validated' : 'not validated'}`,
          `  send: ${record.send ? 'yes' : 'no'}, network: ${record.network ? 'yes' : 'no'}`,
          `  target api: ${record.deliveryTargetApi ?? 'none'}`,
          `  blockers: ${record.blockers.length > 0 ? record.blockers.join('; ') : 'none'}`,
        ].join('\n'),
      )
      .join('\n') + '\n'
  );
}

export function buildIntegrationValidationRequirement(target: IntegrationTarget): IntegrationValidationRequirement {
  if (target.id !== 'feishu' && target.id !== 'wechat') {
    throw new Error('Integration account validation history is only supported for feishu and wechat.');
  }

  const record = [...listIntegrationValidationRecords({ target: target.id })]
    .reverse()
    .find((candidate) => candidate.validated && candidate.send && candidate.network);
  const validated = record !== undefined;
  return {
    ready: validated,
    requirement: 'account-validation-history',
    required: true,
    validated,
    target: {
      id: target.id,
      label: target.label,
      status: target.status,
    },
    record,
    blockers: validated
      ? []
      : [`No successful account validation record found for ${target.id}. Run account-validate --send --record first.`],
  };
}

function buildIntegrationValidationRecord(
  result: IntegrationAccountValidationResult,
  now: Date,
): IntegrationValidationRecord {
  return {
    id: createValidationId(result.target.id, now),
    createdAt: now.toISOString(),
    operation: 'account-validation',
    target: {
      id: result.target.id,
      label: result.target.label,
      status: result.target.status,
    },
    validated: result.validated,
    send: result.send,
    network: result.network,
    stages: result.stages.map((stage) => ({ ...stage })),
    blockers: [...result.blockers],
    deliveryTargetApi: result.delivery?.targetApi,
    providerResponse: result.delivery?.providerResponse
      ? sanitizeProviderResponse(result.delivery.providerResponse)
      : undefined,
  };
}

function validationHistoryPath(): string {
  return join(getEnglishPilotHome(), 'integration-validations.jsonl');
}

function appendJsonLine(path: string, value: unknown): void {
  mkdirSync(getEnglishPilotHome(), { recursive: true });
  const existing = existsSync(path) ? readFileSync(path, 'utf8') : '';
  writeFileSync(path, `${existing}${JSON.stringify(value)}\n`, 'utf8');
}

function readJsonLines<T>(path: string): T[] {
  if (!existsSync(path)) return [];
  return readFileSync(path, 'utf8')
    .split('\n')
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line) as T);
}

function sanitizeProviderResponse(response: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(response).filter(
      ([key, value]) =>
        !/token|secret|key|authorization/i.test(key) &&
        (value === null || ['string', 'number', 'boolean'].includes(typeof value)),
    ),
  );
}

function createValidationId(target: string, now: Date): string {
  return `validation_${target}_${now.toISOString().replace(/[^0-9a-z]/gi, '')}_${Math.random().toString(36).slice(2, 8)}`;
}
