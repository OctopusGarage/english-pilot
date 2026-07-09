import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { buildIntegrationAccountGuide, formatIntegrationAccountGuide } from '../integrations/account-guide.js';
import { listIntegrationTargets } from '../integrations/targets.js';
import { doctor, writeDoctorMarkdown } from './config.js';
import { buildRoadmap, type Roadmap, type RoadmapItem, type RoadmapTarget, writeRoadmapMarkdown } from './roadmap.js';
import {
  buildVoiceSttProviderAssessmentHistory,
  formatVoiceSttProviderAssessmentHistory,
  listVoiceSttProviderAssessmentRecords,
} from './voice-stt-assessment.js';
import { buildVoiceSttContract, formatVoiceSttContract } from './voice-stt-contract.js';
import {
  buildVoiceSttProviderContractDraft,
  formatVoiceSttProviderContractDraft,
} from './voice-stt-provider-contract-draft.js';
import { buildVoiceSttWrapperTemplate, formatVoiceSttWrapperTemplate } from './voice-stt-wrapper-template.js';

export type ExternalValidationBundleFileKind =
  | 'index'
  | 'manifest'
  | 'evidence-checklist'
  | 'evidence-checklist-json'
  | 'next-commands'
  | 'next-commands-json'
  | 'roadmap'
  | 'roadmap-json'
  | 'doctor'
  | 'doctor-json'
  | 'integration-account-guide'
  | 'integration-account-guide-json'
  | 'voice-stt-contract'
  | 'voice-stt-contract-json'
  | 'voice-stt-wrapper'
  | 'voice-stt-wrapper-json'
  | 'voice-stt-wrapper-template'
  | 'voice-stt-assessment-history'
  | 'voice-stt-assessment-history-json'
  | 'voice-stt-provider-contract-draft'
  | 'voice-stt-provider-contract-draft-json';

export interface ExternalValidationBundleFile {
  kind: ExternalValidationBundleFileKind;
  path: string;
}

export interface ExternalValidationBundle {
  operation: 'external-validation-handoff-bundle';
  target?: RoadmapTarget;
  written: boolean;
  directory: string;
  files: ExternalValidationBundleFile[];
}

export interface ExternalValidationBundleVerification {
  operation: 'external-validation-handoff-bundle-verify';
  target?: RoadmapTarget;
  ok: boolean;
  directory: string;
  manifestPath: string;
  expectedFiles: ExternalValidationBundleFile[];
  missingFiles: ExternalValidationBundleFile[];
  problems: string[];
}

export interface ExternalValidationNextCommands {
  operation: 'external-validation-next-commands';
  target?: RoadmapTarget;
  commands: ExternalValidationNextCommand[];
}

export interface ExternalValidationNextCommand {
  roadmapItemId: string;
  roadmapItemTitle: string;
  relatedTarget: RoadmapTarget;
  command: string;
}

export interface ExternalValidationEvidenceChecklist {
  operation: 'external-validation-evidence-checklist';
  target?: RoadmapTarget;
  items: ExternalValidationEvidenceChecklistItem[];
}

export interface ExternalValidationEvidenceChecklistItem {
  roadmapItemId: string;
  roadmapItemTitle: string;
  relatedTarget: RoadmapTarget;
  status: string;
  blockers: string[];
  evidenceRequired: string[];
  evidenceFound: string[];
  missingEvidence: string[];
  missingEvidenceActions: Array<{
    evidence: string;
    command: string;
    reason: string;
  }>;
}

export function buildExternalValidationBundle(input: {
  directory: string;
  target?: RoadmapTarget;
  write?: boolean;
}): ExternalValidationBundle {
  const files = plannedExternalValidationBundleFiles(input.directory, input.target, {
    includeProviderDraft: shouldIncludeProviderDraft(input.target),
  });
  const bundle: ExternalValidationBundle = {
    operation: 'external-validation-handoff-bundle',
    ...(input.target ? { target: input.target } : {}),
    written: input.write === true,
    directory: input.directory,
    files,
  };
  if (input.write !== true) return bundle;

  mkdirSync(input.directory, { recursive: true });
  const roadmap = buildRoadmap({ target: input.target });
  writeRoadmapMarkdown(roadmap, join(input.directory, 'roadmap'), input.target);
  writeJsonFile(requiredBundleFilePath(files, 'roadmap-json'), roadmap);

  const nextCommands = buildExternalValidationNextCommands(roadmap, input.target);
  writeTextFile(
    requiredBundleFilePath(files, 'next-commands'),
    formatExternalValidationNextCommandsMarkdown(nextCommands),
  );
  writeJsonFile(requiredBundleFilePath(files, 'next-commands-json'), nextCommands);

  const evidenceChecklist = buildExternalValidationEvidenceChecklist(roadmap, input.target);
  writeTextFile(
    requiredBundleFilePath(files, 'evidence-checklist'),
    formatExternalValidationEvidenceChecklistMarkdown(evidenceChecklist),
  );
  writeJsonFile(requiredBundleFilePath(files, 'evidence-checklist-json'), evidenceChecklist);

  const doctorReport = doctor();
  writeDoctorMarkdown(doctorReport, join(input.directory, 'diagnostics'));
  writeJsonFile(requiredBundleFilePath(files, 'doctor-json'), doctorReport);

  for (const target of integrationGuideTargets(input.target)) {
    const guide = buildIntegrationAccountGuide(target);
    writeTextFile(
      requiredBundleFilePath(files, 'integration-account-guide', `${target.id}-account-guide.md`),
      formatIntegrationAccountGuide(guide),
    );
    writeJsonFile(
      requiredBundleFilePath(files, 'integration-account-guide-json', `${target.id}-account-guide.json`),
      guide,
    );
  }

  if (input.target === undefined || input.target === 'cloud-stt') {
    const contract = buildVoiceSttContract();
    const wrapperTemplate = buildVoiceSttWrapperTemplate();
    const assessmentHistory = buildVoiceSttProviderAssessmentHistory();
    writeTextFile(requiredBundleFilePath(files, 'voice-stt-contract'), formatVoiceSttContract(contract));
    writeJsonFile(requiredBundleFilePath(files, 'voice-stt-contract-json'), contract);
    writeTextFile(requiredBundleFilePath(files, 'voice-stt-wrapper'), formatVoiceSttWrapperTemplate(wrapperTemplate));
    writeJsonFile(requiredBundleFilePath(files, 'voice-stt-wrapper-json'), wrapperTemplate);
    writeTextFile(requiredBundleFilePath(files, 'voice-stt-wrapper-template'), wrapperTemplate.template);
    writeTextFile(
      requiredBundleFilePath(files, 'voice-stt-assessment-history'),
      formatVoiceSttProviderAssessmentHistory(assessmentHistory),
    );
    writeJsonFile(requiredBundleFilePath(files, 'voice-stt-assessment-history-json'), assessmentHistory);

    const providerName = latestProviderSpecificAssessmentProviderName();
    if (providerName) {
      const draft = buildVoiceSttProviderContractDraft({ providerName });
      writeTextFile(
        requiredBundleFilePath(files, 'voice-stt-provider-contract-draft'),
        formatVoiceSttProviderContractDraft(draft),
      );
      writeJsonFile(requiredBundleFilePath(files, 'voice-stt-provider-contract-draft-json'), draft);
    }
  }

  writeJsonFile(requiredBundleFilePath(files, 'manifest'), bundle);
  writeTextFile(requiredBundleFilePath(files, 'index'), formatExternalValidationBundleIndex(bundle));
  return bundle;
}

export function verifyExternalValidationBundle(input: {
  directory: string;
  target?: RoadmapTarget;
}): ExternalValidationBundleVerification {
  const manifestPath = join(input.directory, 'manifest.json');
  const manifest = readOptionalJson(manifestPath);
  const target =
    input.target ?? (isRecord(manifest) && isRoadmapTargetValue(manifest.target) ? manifest.target : undefined);
  const expectedFiles = plannedExternalValidationBundleFiles(input.directory, target, {
    includeProviderDraft: existsSync(join(input.directory, 'voice-stt', 'provider-contract-draft.json')),
  });
  const missingFiles = expectedFiles.filter((file) => !existsSync(file.path));
  const problems = [
    ...validateManifest(manifestPath, manifest, input.directory, target, expectedFiles),
    ...missingFiles.map((file) => `Missing expected file: ${relative(input.directory, file.path)}`),
    ...expectedFiles.flatMap((file) => validateReadableBundleFile(input.directory, file)),
  ];
  return {
    operation: 'external-validation-handoff-bundle-verify',
    ...(target ? { target } : {}),
    ok: problems.length === 0,
    directory: input.directory,
    manifestPath,
    expectedFiles,
    missingFiles,
    problems,
  };
}

function buildExternalValidationNextCommands(roadmap: Roadmap, target?: RoadmapTarget): ExternalValidationNextCommands {
  const commands = roadmap.items.flatMap((item) =>
    item.nextCommands.map((command) => ({
      roadmapItemId: item.id,
      roadmapItemTitle: item.title,
      relatedTarget: item.relatedTarget,
      command,
    })),
  );
  return {
    operation: 'external-validation-next-commands',
    ...(target ? { target } : {}),
    commands,
  };
}

function buildExternalValidationEvidenceChecklist(
  roadmap: Roadmap,
  target?: RoadmapTarget,
): ExternalValidationEvidenceChecklist {
  return {
    operation: 'external-validation-evidence-checklist',
    ...(target ? { target } : {}),
    items: roadmap.items.map((item) => ({
      roadmapItemId: item.id,
      roadmapItemTitle: item.title,
      relatedTarget: item.relatedTarget,
      status: item.status,
      blockers: [...item.blockers],
      evidenceRequired: [...item.evidenceRequired],
      evidenceFound: [...item.evidenceFound],
      missingEvidence: item.evidenceRequired.filter((evidence) => !item.evidenceFound.includes(evidence)),
      missingEvidenceActions: missingEvidenceActions(item),
    })),
  };
}

function missingEvidenceActions(item: RoadmapItem): ExternalValidationEvidenceChecklistItem['missingEvidenceActions'] {
  return item.evidenceActions
    .filter((action) => !item.evidenceFound.includes(action.evidence))
    .map((action) => ({ ...action }));
}

function formatExternalValidationNextCommandsMarkdown(nextCommands: ExternalValidationNextCommands): string {
  return [
    '# EnglishPilot External Validation Next Commands',
    '',
    `- Target: ${nextCommands.target ?? 'all'}`,
    `- Command count: ${nextCommands.commands.length}`,
    '',
    ...nextCommands.commands.flatMap((item) => [
      `## ${item.roadmapItemId}`,
      '',
      `- Title: ${item.roadmapItemTitle}`,
      `- Target: ${item.relatedTarget}`,
      '',
      '```bash',
      item.command,
      '```',
      '',
    ]),
  ].join('\n');
}

function formatExternalValidationEvidenceChecklistMarkdown(checklist: ExternalValidationEvidenceChecklist): string {
  return [
    '# EnglishPilot External Validation Evidence Checklist',
    '',
    `- Target: ${checklist.target ?? 'all'}`,
    `- Item count: ${checklist.items.length}`,
    '',
    ...checklist.items.flatMap((item) => [
      `## ${item.roadmapItemId}`,
      '',
      `- Title: ${item.roadmapItemTitle}`,
      `- Target: ${item.relatedTarget}`,
      `- Status: ${item.status}`,
      '',
      '### Missing Evidence',
      '',
      ...(item.missingEvidence.length > 0 ? item.missingEvidence.map((evidence) => `- ${evidence}`) : ['- none']),
      '',
      '### Actions',
      '',
      ...(item.missingEvidenceActions.length > 0
        ? item.missingEvidenceActions.map((action) => `- ${action.evidence}: ${action.command}`)
        : ['- none']),
      '',
    ]),
  ].join('\n');
}

function formatExternalValidationBundleIndex(bundle: ExternalValidationBundle): string {
  return [
    '# EnglishPilot External Validation Handoff',
    '',
    `- Target: ${bundle.target ?? 'all'}`,
    `- File count: ${bundle.files.length}`,
    '',
    'Use this bundle for the active long-connection and voice validation workstreams.',
    '',
    '## Files',
    '',
    ...bundle.files.map((file) => `- ${relative(bundle.directory, file.path)} (${file.kind})`),
    '',
    '## Next Steps',
    '',
    '- Read the roadmap handoff first.',
    '- Use the account guide for Feishu/Lark or WeChat long-connection setup.',
    '- Use the voice-STT files only for cloud speech-to-text validation.',
    '- Run doctor before starting long-running monitors.',
    '',
  ].join('\n');
}

function plannedExternalValidationBundleFiles(
  directory: string,
  target?: RoadmapTarget,
  options: { includeProviderDraft?: boolean } = {},
): ExternalValidationBundleFile[] {
  const roadmapName = target ? `${target}-roadmap` : 'english-pilot-roadmap';
  return [
    { kind: 'index', path: join(directory, 'README.md') },
    { kind: 'manifest', path: join(directory, 'manifest.json') },
    { kind: 'evidence-checklist', path: join(directory, 'evidence', 'evidence-checklist.md') },
    { kind: 'evidence-checklist-json', path: join(directory, 'evidence', 'evidence-checklist.json') },
    { kind: 'next-commands', path: join(directory, 'commands', 'next-commands.md') },
    { kind: 'next-commands-json', path: join(directory, 'commands', 'next-commands.json') },
    { kind: 'roadmap', path: join(directory, 'roadmap', `${roadmapName}.md`) },
    { kind: 'roadmap-json', path: join(directory, 'roadmap', `${roadmapName}.json`) },
    { kind: 'doctor', path: join(directory, 'diagnostics', 'english-pilot-doctor.md') },
    { kind: 'doctor-json', path: join(directory, 'diagnostics', 'english-pilot-doctor.json') },
    ...integrationGuideBundleFiles(directory, target),
    ...voiceSttBundleFiles(directory, target, options.includeProviderDraft),
  ];
}

function integrationGuideBundleFiles(directory: string, target?: RoadmapTarget): ExternalValidationBundleFile[] {
  if (target === 'cloud-stt') return [];
  return integrationGuideTargets(target).flatMap((item) => [
    {
      kind: 'integration-account-guide' as const,
      path: join(directory, 'integration-runbooks', `${item.id}-account-guide.md`),
    },
    {
      kind: 'integration-account-guide-json' as const,
      path: join(directory, 'integration-runbooks', `${item.id}-account-guide.json`),
    },
  ]);
}

function integrationGuideTargets(target?: RoadmapTarget) {
  return listIntegrationTargets()
    .filter((item) => item.id === 'feishu' || item.id === 'wechat')
    .filter((item) => target === undefined || item.id === target);
}

function voiceSttBundleFiles(
  directory: string,
  target?: RoadmapTarget,
  includeProviderDraft?: boolean,
): ExternalValidationBundleFile[] {
  if (target !== undefined && target !== 'cloud-stt') return [];
  return [
    { kind: 'voice-stt-contract', path: join(directory, 'voice-stt', 'generic-json-contract.md') },
    { kind: 'voice-stt-contract-json', path: join(directory, 'voice-stt', 'generic-json-contract.json') },
    { kind: 'voice-stt-wrapper', path: join(directory, 'voice-stt', 'wrapper-template.md') },
    { kind: 'voice-stt-wrapper-json', path: join(directory, 'voice-stt', 'wrapper-template.json') },
    { kind: 'voice-stt-wrapper-template', path: join(directory, 'voice-stt', 'english-pilot-stt-wrapper.py') },
    { kind: 'voice-stt-assessment-history', path: join(directory, 'voice-stt', 'assessment-history.md') },
    { kind: 'voice-stt-assessment-history-json', path: join(directory, 'voice-stt', 'assessment-history.json') },
    ...(includeProviderDraft
      ? [
          {
            kind: 'voice-stt-provider-contract-draft' as const,
            path: join(directory, 'voice-stt', 'provider-contract-draft.md'),
          },
          {
            kind: 'voice-stt-provider-contract-draft-json' as const,
            path: join(directory, 'voice-stt', 'provider-contract-draft.json'),
          },
        ]
      : []),
  ];
}

function shouldIncludeProviderDraft(target?: RoadmapTarget): boolean {
  return (
    (target === undefined || target === 'cloud-stt') && latestProviderSpecificAssessmentProviderName() !== undefined
  );
}

function latestProviderSpecificAssessmentProviderName(): string | undefined {
  return [...listVoiceSttProviderAssessmentRecords()].reverse().find((record) => record.providerSpecificContractNeeded)
    ?.providerName;
}

function validateManifest(
  manifestPath: string,
  manifest: unknown,
  directory: string,
  target: RoadmapTarget | undefined,
  expectedFiles: ExternalValidationBundleFile[],
): string[] {
  if (!isRecord(manifest)) return [`Manifest is missing or invalid JSON: ${manifestPath}`];
  const problems: string[] = [];
  if (manifest.operation !== 'external-validation-handoff-bundle') {
    problems.push('manifest operation must be external-validation-handoff-bundle.');
  }
  if (manifest.directory !== directory) {
    problems.push(`manifest directory ${String(manifest.directory)} does not match ${directory}.`);
  }
  if (target !== undefined && manifest.target !== target) {
    problems.push(`manifest target ${String(manifest.target)} does not match ${target}.`);
  }
  if (!Array.isArray(manifest.files)) {
    problems.push('manifest files must be an array.');
    return problems;
  }
  const expectedRelativePaths = expectedFiles.map((file) => relative(directory, file.path));
  const actualRelativePaths = manifest.files
    .filter(isRecord)
    .map((file) => (typeof file.path === 'string' ? relative(directory, file.path) : ''));
  for (const expectedPath of expectedRelativePaths) {
    if (!actualRelativePaths.includes(expectedPath)) {
      problems.push(`manifest is missing file ${expectedPath}.`);
    }
  }
  return problems;
}

function validateReadableBundleFile(directory: string, file: ExternalValidationBundleFile): string[] {
  if (!existsSync(file.path)) return [];
  const label = relative(directory, file.path);
  try {
    const text = readFileSync(file.path, 'utf8');
    if (text.trim().length === 0) return [`${label} must not be blank.`];
    if (file.kind.endsWith('-json') || file.kind === 'manifest') JSON.parse(text);
    return [];
  } catch (error) {
    return [`${label} is not readable or valid: ${error instanceof Error ? error.message : String(error)}`];
  }
}

function requiredBundleFilePath(
  files: ExternalValidationBundleFile[],
  kind: ExternalValidationBundleFileKind,
  basename?: string,
): string {
  const file = files.find(
    (candidate) => candidate.kind === kind && (basename === undefined || candidate.path.endsWith(`/${basename}`)),
  );
  if (!file)
    throw new Error(`Missing planned external validation bundle file: ${kind}${basename ? ` ${basename}` : ''}`);
  return file.path;
}

function writeTextFile(path: string, value: string): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, value, 'utf8');
}

function writeJsonFile(path: string, value: unknown): void {
  writeTextFile(path, `${JSON.stringify(value, null, 2)}\n`);
}

function readOptionalJson(path: string): unknown {
  if (!existsSync(path)) return undefined;
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as unknown;
  } catch {
    return undefined;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isRoadmapTargetValue(value: unknown): value is RoadmapTarget {
  return value === 'feishu' || value === 'wechat' || value === 'cloud-stt';
}
