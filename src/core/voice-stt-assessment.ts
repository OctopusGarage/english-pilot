import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { getRuntimeHome } from './infra/state-dir.js';
import { validateVoiceSttResponse, type VoiceSttValidationResult } from './voice-stt-contract.js';

export interface VoiceSttProviderAssessment {
  operation: 'voice-stt-provider-assessment';
  providerName: string;
  genericJsonCompatible: boolean;
  providerSpecificContractNeeded: boolean;
  validation: VoiceSttValidationResult;
  recorded?: boolean;
  record?: VoiceSttProviderAssessmentRecord;
}

export interface VoiceSttProviderAssessmentRecord {
  id: string;
  createdAt: string;
  operation: 'voice-stt-provider-assessment';
  providerName: string;
  genericJsonCompatible: boolean;
  providerSpecificContractNeeded: boolean;
  validation: {
    provider: 'generic-json';
    valid: boolean;
    blockers: string[];
  };
}

export function assessVoiceSttProvider(input: {
  providerName: string;
  response: unknown;
  record?: boolean;
}): VoiceSttProviderAssessment {
  const providerName = input.providerName.trim();
  if (!providerName) throw new Error('providerName is required.');
  const validation = validateVoiceSttResponse(input.response);
  const assessment: VoiceSttProviderAssessment = {
    operation: 'voice-stt-provider-assessment',
    providerName,
    genericJsonCompatible: validation.valid,
    providerSpecificContractNeeded: !validation.valid,
    validation,
  };
  if (input.record === true) {
    assessment.recorded = true;
    assessment.record = recordVoiceSttProviderAssessment(assessment);
  }
  return assessment;
}

export function listVoiceSttProviderAssessmentRecords(): VoiceSttProviderAssessmentRecord[] {
  return readJsonLines<VoiceSttProviderAssessmentRecord>(assessmentHistoryPath());
}

export function buildVoiceSttProviderAssessmentHistory(
  input: {
    providerName?: string;
  } = {},
): { records: VoiceSttProviderAssessmentRecord[] } {
  const providerName = input.providerName?.trim().toLowerCase();
  const records = listVoiceSttProviderAssessmentRecords().filter(
    (record) => providerName === undefined || record.providerName.toLowerCase() === providerName,
  );
  return { records };
}

export function formatVoiceSttProviderAssessment(assessment: VoiceSttProviderAssessment): string {
  return [
    `Provider assessment: ${assessment.providerName}`,
    `Generic JSON compatible: ${assessment.genericJsonCompatible ? 'yes' : 'no'}`,
    `Provider-specific contract needed: ${assessment.providerSpecificContractNeeded ? 'yes' : 'no'}`,
    `Recorded: ${assessment.recorded ? 'yes' : 'no'}`,
    '',
    'Blockers',
    ...(assessment.validation.blockers.length > 0
      ? assessment.validation.blockers.map((blocker) => `- ${blocker}`)
      : ['- none']),
    '',
  ].join('\n');
}

export function formatVoiceSttProviderAssessmentHistory(input: {
  records: VoiceSttProviderAssessmentRecord[];
}): string {
  return [
    'Voice STT provider assessment history',
    ...(input.records.length > 0
      ? input.records.flatMap((record) => [
          `- ${record.providerName}: generic-json ${record.genericJsonCompatible ? 'compatible' : 'incompatible'}, provider-specific contract ${record.providerSpecificContractNeeded ? 'needed' : 'not needed'}, recorded at ${record.createdAt}`,
          ...(record.validation.blockers.length > 0
            ? record.validation.blockers.map((blocker) => `  blocker: ${blocker}`)
            : []),
        ])
      : ['- none']),
    '',
  ].join('\n');
}

function recordVoiceSttProviderAssessment(
  assessment: VoiceSttProviderAssessment,
  now = new Date(),
): VoiceSttProviderAssessmentRecord {
  const record: VoiceSttProviderAssessmentRecord = {
    id: `voice_stt_assessment_${now.toISOString().replace(/[^0-9a-z]/gi, '')}_${Math.random().toString(36).slice(2, 8)}`,
    createdAt: now.toISOString(),
    operation: 'voice-stt-provider-assessment',
    providerName: assessment.providerName,
    genericJsonCompatible: assessment.genericJsonCompatible,
    providerSpecificContractNeeded: assessment.providerSpecificContractNeeded,
    validation: {
      provider: assessment.validation.provider,
      valid: assessment.validation.valid,
      blockers: [...assessment.validation.blockers],
    },
  };
  appendJsonLine(assessmentHistoryPath(), record);
  return record;
}

function assessmentHistoryPath(): string {
  return join(getRuntimeHome(), 'voice-stt-assessments.jsonl');
}

function appendJsonLine(path: string, value: unknown): void {
  mkdirSync(getRuntimeHome(), { recursive: true });
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
