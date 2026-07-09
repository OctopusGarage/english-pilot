import {
  listVoiceSttProviderAssessmentRecords,
  type VoiceSttProviderAssessmentRecord,
} from './voice-stt-assessment.js';

export interface VoiceSttProviderContractDraft {
  operation: 'voice-stt-provider-contract-draft';
  providerName: string;
  status: 'needs-assessment' | 'generic-json-compatible' | 'ready-to-design';
  providerSpecificContractNeeded: boolean | null;
  evidence?: {
    providerName: string;
    createdAt: string;
    genericJsonCompatible: boolean;
    blockers: string[];
  };
  missingEvidence: string[];
  draft?: {
    adapterStrategy: string;
    proposedFiles: string[];
    normalizedFields: string[];
    acceptanceCriteria: string[];
  };
  nextCommands: string[];
}

export function buildVoiceSttProviderContractDraft(input: { providerName: string }): VoiceSttProviderContractDraft {
  const providerName = input.providerName.trim();
  if (!providerName) throw new Error('providerName is required.');
  const latestAssessment = latestRecordForProvider(providerName);
  const assessmentCommand = `english-pilot voice stt-assess-provider --provider-name ${providerName} --response-json <json> --record --json`;
  const assessmentFileCommand = `english-pilot voice stt-assess-provider --provider-name ${providerName} --response-json-file <sample.json> --record --json`;

  if (!latestAssessment) {
    return {
      operation: 'voice-stt-provider-contract-draft',
      providerName,
      status: 'needs-assessment',
      providerSpecificContractNeeded: null,
      missingEvidence: [`recorded generic-json incompatibility assessment for ${providerName}`],
      nextCommands: [assessmentCommand, assessmentFileCommand, 'english-pilot voice stt-contract --json'],
    };
  }

  const evidence = {
    providerName,
    createdAt: latestAssessment.createdAt,
    genericJsonCompatible: latestAssessment.genericJsonCompatible,
    blockers: [...latestAssessment.validation.blockers],
  };

  if (!latestAssessment.providerSpecificContractNeeded) {
    return {
      operation: 'voice-stt-provider-contract-draft',
      providerName,
      status: 'generic-json-compatible',
      providerSpecificContractNeeded: false,
      evidence,
      missingEvidence: [],
      nextCommands: [
        'english-pilot voice stt-contract --json',
        'english-pilot voice stt-validate --response-json <provider-json> --json',
        'english-pilot voice stt-validate --response-json-file <sample.json> --json',
      ],
    };
  }

  return {
    operation: 'voice-stt-provider-contract-draft',
    providerName,
    status: 'ready-to-design',
    providerSpecificContractNeeded: true,
    evidence,
    missingEvidence: [],
    draft: {
      adapterStrategy: `Use a local wrapper or provider adapter to normalize ${providerName} responses into generic-json before EnglishPilot parses them.`,
      proposedFiles: [
        'src/core/voice-transcription.ts',
        'src/core/voice-stt-contract.ts',
        'src/core/voice-stt-provider-contract-draft.ts',
      ],
      normalizedFields: [
        'transcript',
        'words[].word',
        'words[].startSeconds',
        'words[].endSeconds',
        'words[].confidence',
        'words[].phonemes[]',
      ],
      acceptanceCriteria: [
        'english-pilot voice stt-validate --response-json <normalized-json> --json returns valid: true',
        `A recorded ${providerName} sample maps to transcript, text, or segments[].text without exposing provider secrets.`,
        'MCP and CLI return the same contract draft for the provider.',
      ],
    },
    nextCommands: [
      'english-pilot voice stt-wrapper-template --json',
      'english-pilot voice stt-contract --json',
      assessmentCommand,
      assessmentFileCommand,
    ],
  };
}

export function formatVoiceSttProviderContractDraft(draft: VoiceSttProviderContractDraft): string {
  return [
    `Provider-specific STT contract draft: ${draft.providerName}`,
    `Status: ${draft.status}`,
    `Provider-specific contract needed: ${draft.providerSpecificContractNeeded === null ? 'unknown' : draft.providerSpecificContractNeeded ? 'yes' : 'no'}`,
    '',
    'Evidence',
    ...(draft.evidence
      ? [
          `- recorded at: ${draft.evidence.createdAt}`,
          `- generic JSON compatible: ${draft.evidence.genericJsonCompatible ? 'yes' : 'no'}`,
          ...draft.evidence.blockers.map((blocker) => `- blocker: ${blocker}`),
        ]
      : ['- none']),
    '',
    'Missing evidence',
    ...(draft.missingEvidence.length > 0 ? draft.missingEvidence.map((item) => `- ${item}`) : ['- none']),
    '',
    ...(draft.draft
      ? [
          'Draft',
          `- adapter strategy: ${draft.draft.adapterStrategy}`,
          ...draft.draft.acceptanceCriteria.map((item) => `- acceptance: ${item}`),
          '',
        ]
      : []),
    'Next commands',
    ...draft.nextCommands.map((command) => `- ${command}`),
    '',
  ].join('\n');
}

function latestRecordForProvider(providerName: string): VoiceSttProviderAssessmentRecord | undefined {
  return listVoiceSttProviderAssessmentRecords()
    .filter((record) => record.providerName === providerName)
    .sort((left, right) => left.createdAt.localeCompare(right.createdAt))
    .at(-1);
}
