import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { requiredCredentialsForTarget } from '../integrations/preflight.js';
import {
  listVoiceSttProviderAssessmentRecords,
  type VoiceSttProviderAssessmentRecord,
} from './voice-stt-assessment.js';
import { requiredConfigurationForProvider } from './voice-preflight.js';

export type RoadmapStatus = 'external_pending' | 'conditional' | 'evidence_ready' | 'ready';

export interface RoadmapItem {
  id: string;
  title: string;
  status: RoadmapStatus;
  relatedTarget: 'feishu' | 'wechat' | 'cloud-stt';
  blockers: string[];
  evidenceRequired: string[];
  evidenceFound: string[];
  evidenceActions: RoadmapEvidenceAction[];
  nextCommands: string[];
  currentEndpoint?: {
    publicUrl: string;
    recordedAt: string;
  };
  providerAssessment?: {
    providerName: string;
    recordedAt: string;
    genericJsonCompatible: boolean;
  };
}

export interface RoadmapEvidenceAction {
  evidence: string;
  command: string;
  reason: string;
}

export interface Roadmap {
  items: RoadmapItem[];
}

export interface RoadmapNextAction {
  id: string;
  title: string;
  status: RoadmapStatus;
  relatedTarget: RoadmapTarget;
  complete: boolean;
  nextEvidence?: string;
  nextCommand?: string;
  reason?: string;
  prerequisites: string[];
  preflightCommands: string[];
  readinessChecks: RoadmapReadinessCheck[];
  blockers: string[];
}

export interface RoadmapReadinessCheck {
  name: string;
  present: boolean;
}

export interface RoadmapEnvTemplateEntry {
  name: string;
  required: true;
  value: '';
}

export interface RoadmapEnvTemplate {
  target?: RoadmapTarget;
  entries: RoadmapEnvTemplateEntry[];
  shellExports: string[];
  dotenv: string[];
}

export interface RoadmapNextActions {
  items: RoadmapNextAction[];
}

export interface RoadmapExport {
  written: true;
  path: string;
}

export type RoadmapTarget = RoadmapItem['relatedTarget'];

export function isRoadmapTarget(value: string | undefined): value is RoadmapTarget {
  return value === 'feishu' || value === 'wechat' || value === 'cloud-stt';
}

export function buildRoadmap(filter: { target?: RoadmapTarget } = {}): Roadmap {
  const items = [
    buildFeishuLongConnectionItem(),
    buildWechatLongConnectionHardeningItem(),
    buildProviderSpecificCloudSttItem(),
  ];
  return {
    items: filter.target ? items.filter((item) => item.relatedTarget === filter.target) : items,
  };
}

export function formatRoadmap(roadmap: Roadmap): string {
  return roadmap.items
    .map((item) =>
      [
        `${item.id} (${item.status})`,
        `Title: ${item.title}`,
        `Target: ${item.relatedTarget}`,
        'Blockers:',
        ...item.blockers.map((blocker) => `- ${blocker}`),
        'Evidence required:',
        ...item.evidenceRequired.map((evidence) => `- ${evidence}`),
        'Evidence found:',
        ...(item.evidenceFound.length > 0 ? item.evidenceFound.map((evidence) => `- ${evidence}`) : ['- none']),
        'Evidence actions:',
        ...item.evidenceActions.map((action) => `- ${action.evidence} -> ${action.command}`),
        ...(item.currentEndpoint
          ? [
              `Current endpoint: ${item.currentEndpoint.publicUrl}`,
              `Endpoint recorded at: ${item.currentEndpoint.recordedAt}`,
            ]
          : []),
        ...(item.providerAssessment
          ? [
              `Provider assessment: ${item.providerAssessment.providerName}`,
              `Assessment recorded at: ${item.providerAssessment.recordedAt}`,
            ]
          : []),
        'Next commands:',
        ...item.nextCommands.map((command) => `- ${command}`),
        '',
      ].join('\n'),
    )
    .join('\n');
}

export function buildRoadmapNextActions(roadmap: Roadmap, input: { env?: NodeJS.ProcessEnv } = {}): RoadmapNextActions {
  const env = input.env ?? process.env;
  return {
    items: roadmap.items.map((item) => {
      const nextAction = item.evidenceActions.find((action) => !item.evidenceFound.includes(action.evidence));
      return {
        id: item.id,
        title: item.title,
        status: item.status,
        relatedTarget: item.relatedTarget,
        complete: nextAction === undefined,
        ...(nextAction
          ? {
              nextEvidence: nextAction.evidence,
              nextCommand: nextAction.command,
              reason: nextAction.reason,
            }
          : {}),
        prerequisites: buildRoadmapNextActionPrerequisites(item),
        preflightCommands: buildRoadmapNextActionPreflightCommands(item),
        readinessChecks: buildRoadmapReadinessChecks(item, env),
        blockers: item.blockers,
      };
    }),
  };
}

export function formatRoadmapNextActions(nextActions: RoadmapNextActions): string {
  return nextActions.items
    .map((item) =>
      [
        `${item.id} (${item.status})`,
        `Title: ${item.title}`,
        `Target: ${item.relatedTarget}`,
        `Complete: ${item.complete ? 'yes' : 'no'}`,
        ...(item.nextEvidence ? [`Next evidence: ${item.nextEvidence}`] : ['Next evidence: none']),
        ...(item.nextCommand ? [`Command: ${item.nextCommand}`] : []),
        ...(item.reason ? [`Reason: ${item.reason}`] : []),
        'Prerequisites:',
        ...(item.prerequisites.length > 0 ? item.prerequisites.map((prerequisite) => `- ${prerequisite}`) : ['- none']),
        'Preflight commands:',
        ...(item.preflightCommands.length > 0 ? item.preflightCommands.map((command) => `- ${command}`) : ['- none']),
        'Readiness checks:',
        ...(item.readinessChecks.length > 0
          ? item.readinessChecks.map((check) => `- ${check.name}: ${check.present ? 'present' : 'missing'}`)
          : ['- none']),
        'Blockers:',
        ...(item.blockers.length > 0 ? item.blockers.map((blocker) => `- ${blocker}`) : ['- none']),
        '',
      ].join('\n'),
    )
    .join('\n');
}

export function writeRoadmapNextActionsMarkdown(
  nextActions: RoadmapNextActions,
  directory: string,
  target?: RoadmapTarget,
): RoadmapExport {
  mkdirSync(directory, { recursive: true });
  const path = join(directory, target ? `${target}-roadmap-next.md` : 'english-pilot-roadmap-next.md');
  writeFileSync(path, formatRoadmapNextActionsMarkdown(nextActions), 'utf8');
  return {
    written: true,
    path,
  };
}

export function formatRoadmapNextActionsMarkdown(nextActions: RoadmapNextActions): string {
  return [
    '# EnglishPilot Roadmap Next Actions',
    '',
    `- Item count: ${nextActions.items.length}`,
    '',
    ...nextActions.items.flatMap((item) => [
      `## ${item.id}`,
      '',
      `- Title: ${item.title}`,
      `- Target: ${item.relatedTarget}`,
      `- Status: ${item.status}`,
      `- Complete: ${item.complete ? 'yes' : 'no'}`,
      `- Next evidence: ${item.nextEvidence ?? 'none'}`,
      ...(item.reason ? [`- Reason: ${item.reason}`] : []),
      '',
      ...(item.nextCommand ? ['```bash', item.nextCommand, '```', ''] : []),
      '### Prerequisites',
      '',
      ...(item.prerequisites.length > 0 ? item.prerequisites.map((prerequisite) => `- ${prerequisite}`) : ['- none']),
      '',
      '### Preflight Commands',
      '',
      ...(item.preflightCommands.length > 0 ? ['```bash', ...item.preflightCommands, '```'] : ['- none']),
      '',
      '### Readiness Checks',
      '',
      ...(item.readinessChecks.length > 0
        ? item.readinessChecks.map((check) => `- ${check.name}: ${check.present ? 'present' : 'missing'}`)
        : ['- none']),
      '',
      '### Blockers',
      '',
      ...(item.blockers.length > 0 ? item.blockers.map((blocker) => `- ${blocker}`) : ['- none']),
      '',
    ]),
  ].join('\n');
}

export function buildRoadmapEnvTemplate(input: { target?: RoadmapTarget } = {}): RoadmapEnvTemplate {
  const names = input.target
    ? envNamesForRoadmapTarget(input.target)
    : [
        ...envNamesForRoadmapTarget('feishu'),
        ...envNamesForRoadmapTarget('wechat'),
        ...envNamesForRoadmapTarget('cloud-stt'),
      ];
  const entries = uniqueStrings(names).map((name) => ({
    name,
    required: true as const,
    value: '' as const,
  }));
  return {
    ...(input.target ? { target: input.target } : {}),
    entries,
    shellExports: entries.map((entry) => `export ${entry.name}=""`),
    dotenv: entries.map((entry) => `${entry.name}=`),
  };
}

export function formatRoadmapEnvTemplate(template: RoadmapEnvTemplate): string {
  return [
    `Roadmap env template: ${template.target ?? 'all'}`,
    '',
    'Shell exports:',
    ...template.shellExports.map((line) => `- ${line}`),
    '',
    '.env:',
    ...template.dotenv.map((line) => `- ${line}`),
    '',
  ].join('\n');
}

function buildRoadmapReadinessChecks(item: RoadmapItem, env: NodeJS.ProcessEnv): RoadmapReadinessCheck[] {
  const names = readinessEnvNamesForRoadmapTarget(item.relatedTarget);
  return names.map((name) => ({
    name,
    present: typeof env[name] === 'string' && env[name].trim().length > 0,
  }));
}

function buildRoadmapNextActionPreflightCommands(item: RoadmapItem): string[] {
  if (item.relatedTarget === 'feishu') {
    return [
      'english-pilot feishu setup',
      'english-pilot feishu doctor --json',
      'english-pilot feishu start --dry-run --json',
    ];
  }
  if (item.relatedTarget === 'wechat') {
    return [
      `english-pilot integrations account-guide --target ${item.relatedTarget} --json`,
      'english-pilot wechat doctor --json',
      'english-pilot wechat start --dry-run --json',
    ];
  }
  return [
    'english-pilot voice preflight --provider cloud-stt --json',
    'english-pilot voice stt-contract --json',
    'english-pilot voice stt-wrapper-template --json',
  ];
}

function readinessEnvNamesForRoadmapTarget(target: RoadmapTarget): string[] {
  return target === 'cloud-stt' ? requiredConfigurationForProvider('cloud-stt') : requiredCredentialsForTarget(target);
}

function envNamesForRoadmapTarget(target: RoadmapTarget): string[] {
  if (target === 'feishu') return requiredCredentialsForTarget(target);
  if (target === 'wechat') return requiredCredentialsForTarget(target);
  return requiredConfigurationForProvider('cloud-stt');
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values)];
}

function buildRoadmapNextActionPrerequisites(item: RoadmapItem): string[] {
  if (item.relatedTarget === 'feishu') {
    return [
      'Set FEISHU_APP_ID in the environment.',
      'Set FEISHU_APP_SECRET in the environment.',
      'Set FEISHU_ALLOWED_OPEN_IDS in the environment.',
    ];
  }
  if (item.relatedTarget === 'wechat') {
    return [
      'Run english-pilot wechat setup and scan the QR code.',
      'Run english-pilot wechat doctor --json to confirm the saved account is usable.',
      'Run english-pilot wechat start --dry-run --json before starting the long-connection process.',
    ];
  }
  return [
    'Choose a concrete provider name for --provider-name <name>.',
    'Save the provider sample response JSON to <sample.json>.',
    'Run voice stt-validate --response-json-file <sample.json> before recording evidence.',
  ];
}

export function writeRoadmapMarkdown(roadmap: Roadmap, directory: string, target?: RoadmapTarget): RoadmapExport {
  mkdirSync(directory, { recursive: true });
  const path = join(directory, target ? `${target}-roadmap.md` : 'english-pilot-roadmap.md');
  writeFileSync(path, formatRoadmapMarkdown(roadmap), 'utf8');
  return {
    written: true,
    path,
  };
}

export function formatRoadmapMarkdown(roadmap: Roadmap): string {
  return [
    '# EnglishPilot Roadmap Handoff',
    '',
    `- Item count: ${roadmap.items.length}`,
    '',
    ...roadmap.items.flatMap((item) => [
      `## ${item.id}`,
      '',
      `- Title: ${item.title}`,
      `- Target: ${item.relatedTarget}`,
      `- Status: ${item.status}`,
      '',
      '### Blockers',
      '',
      ...(item.blockers.length > 0 ? item.blockers.map((blocker) => `- ${blocker}`) : ['- none']),
      '',
      '### Evidence Required',
      '',
      ...item.evidenceRequired.map((evidence) => `- ${evidence}`),
      '',
      '### Evidence Found',
      '',
      ...(item.evidenceFound.length > 0 ? item.evidenceFound.map((evidence) => `- ${evidence}`) : ['- none']),
      '',
      '### Evidence Actions',
      '',
      ...item.evidenceActions.flatMap((action) => [
        `- ${action.evidence}`,
        `  - Reason: ${action.reason}`,
        `  - Command: \`${action.command}\``,
      ]),
      '',
      ...(item.currentEndpoint
        ? [
            '### Current Endpoint',
            '',
            `- URL: ${item.currentEndpoint.publicUrl}`,
            `- Recorded at: ${item.currentEndpoint.recordedAt}`,
            '',
          ]
        : []),
      ...(item.providerAssessment
        ? [
            '### Provider Assessment',
            '',
            `- Provider: ${item.providerAssessment.providerName}`,
            `- Recorded at: ${item.providerAssessment.recordedAt}`,
            `- Generic JSON compatible: ${item.providerAssessment.genericJsonCompatible ? 'yes' : 'no'}`,
            '',
          ]
        : []),
      '### Next Commands',
      '',
      '```bash',
      ...item.nextCommands,
      '```',
      '',
    ]),
  ].join('\n');
}

function buildProviderSpecificCloudSttItem(): RoadmapItem {
  const latestIncompatibleAssessment = [...listVoiceSttProviderAssessmentRecords()]
    .reverse()
    .find((record) => record.providerSpecificContractNeeded);
  const evidenceFound = latestIncompatibleAssessment
    ? [`recorded generic-json incompatibility assessment for ${latestIncompatibleAssessment.providerName}`]
    : [];
  return {
    id: 'provider-specific-cloud-stt-contract',
    title: 'Provider-specific cloud STT contract',
    status: latestIncompatibleAssessment ? 'evidence_ready' : 'conditional',
    relatedTarget: 'cloud-stt',
    blockers: latestIncompatibleAssessment
      ? ['provider-specific contract implementation not added yet']
      : [
          'concrete cloud STT provider sample response that cannot satisfy generic-json',
          'provider-specific authentication or payload rules not covered by CLOUD_STT_ENDPOINT',
        ],
    evidenceRequired: [
      'provider sample response fails generic-json validation',
      'provider API contract requires fields outside the generic-json request or response',
    ],
    evidenceFound,
    evidenceActions: buildProviderSpecificCloudSttEvidenceActions(
      latestIncompatibleAssessment?.providerName ?? '<name>',
    ),
    nextCommands: [
      'english-pilot voice stt-contract --json',
      'english-pilot voice stt-validate --response-json <json> --json',
      'english-pilot voice stt-validate --response-json-file <sample.json> --json',
      'english-pilot voice stt-assess-provider --provider-name <name> --response-json <json> --record --json',
      'english-pilot voice stt-assess-provider --provider-name <name> --response-json-file <sample.json> --record --json',
      `english-pilot voice stt-assessment-history --provider-name ${latestIncompatibleAssessment?.providerName ?? '<name>'} --json`,
      `english-pilot voice stt-provider-contract-draft --provider-name ${latestIncompatibleAssessment?.providerName ?? '<name>'} --json`,
      'english-pilot voice stt-wrapper-template --json',
      'english-pilot handoff external-validation --target cloud-stt --write --dir <handoff-dir> --json',
      'english-pilot handoff external-validation --target cloud-stt --verify --dir <handoff-dir> --json',
    ],
    ...(latestIncompatibleAssessment
      ? {
          providerAssessment: buildProviderAssessment(latestIncompatibleAssessment),
        }
      : {}),
  };
}

function buildProviderAssessment(record: VoiceSttProviderAssessmentRecord): RoadmapItem['providerAssessment'] {
  return {
    providerName: record.providerName,
    recordedAt: record.createdAt,
    genericJsonCompatible: record.genericJsonCompatible,
  };
}

function buildFeishuLongConnectionItem(): RoadmapItem {
  return {
    id: 'feishu-long-connection-onboarding',
    title: 'Feishu/Lark long-connection onboarding',
    status: 'external_pending',
    relatedTarget: 'feishu',
    blockers: [
      'Feishu/Lark app credentials configured locally',
      'allowed sender open IDs configured for monitored users',
      'long-connection client dry-run verified',
    ],
    evidenceRequired: [
      'configured Feishu/Lark app credentials',
      'configured Feishu/Lark allowed sender open IDs',
      'verified Feishu/Lark long-connection startup',
    ],
    evidenceFound: [],
    evidenceActions: [
      {
        evidence: 'configured Feishu/Lark app credentials',
        command: 'english-pilot feishu setup',
        reason: 'Guides the local QR/onboarding flow and records the required long-connection configuration steps.',
      },
      {
        evidence: 'configured Feishu/Lark allowed sender open IDs',
        command: 'english-pilot feishu doctor --json',
        reason: 'Checks the long-connection configuration without sending messages.',
      },
      {
        evidence: 'verified Feishu/Lark long-connection startup',
        command: 'english-pilot feishu start --dry-run --json',
        reason: 'Verifies the long-connection startup path before running the monitor.',
      },
    ],
    nextCommands: [
      'english-pilot feishu setup',
      'english-pilot feishu doctor --json',
      'english-pilot feishu start --dry-run --json',
      'english-pilot feishu start',
      'english-pilot handoff external-validation --target feishu --write --dir <handoff-dir> --json',
      'english-pilot handoff external-validation --target feishu --verify --dir <handoff-dir> --json',
    ],
  };
}

function buildWechatLongConnectionHardeningItem(): RoadmapItem {
  return {
    id: 'wechat-long-connection-hardening',
    title: 'WeChat QR-login long-connection hardening',
    status: 'external_pending',
    relatedTarget: 'wechat',
    blockers: [
      'QR-login account setup verified on a real WeChat account',
      'long-connection dry-run verified',
      'session refresh and reconnect behavior exercised',
    ],
    evidenceRequired: [
      'saved WeChat QR-login account',
      'verified WeChat long-connection startup',
      'documented reconnect/session refresh behavior',
    ],
    evidenceFound: [],
    evidenceActions: [
      {
        evidence: 'saved WeChat QR-login account',
        command: 'english-pilot wechat setup',
        reason: 'Creates the local account state used by the long-connection monitor.',
      },
      {
        evidence: 'verified WeChat long-connection startup',
        command: 'english-pilot wechat start --dry-run --json',
        reason: 'Checks startup readiness before opening the long-running connection.',
      },
      {
        evidence: 'documented reconnect/session refresh behavior',
        command: 'english-pilot wechat doctor --json',
        reason: 'Confirms saved account state and reports session or allowlist blockers before running the monitor.',
      },
    ],
    nextCommands: [
      'english-pilot wechat setup',
      'english-pilot wechat accounts --json',
      'english-pilot wechat doctor --json',
      'english-pilot wechat start --dry-run --json',
      'english-pilot wechat start',
      'english-pilot handoff external-validation --target wechat --write --dir <handoff-dir> --json',
      'english-pilot handoff external-validation --target wechat --verify --dir <handoff-dir> --json',
    ],
  };
}

function buildProviderSpecificCloudSttEvidenceActions(providerName: string): RoadmapEvidenceAction[] {
  return [
    {
      evidence: 'provider sample response fails generic-json validation',
      command: `english-pilot voice stt-assess-provider --provider-name ${providerName} --response-json-file <sample.json> --record --json`,
      reason: 'Records a concrete provider sample that cannot satisfy the generic-json STT response contract.',
    },
    {
      evidence: 'provider API contract requires fields outside the generic-json request or response',
      command: `english-pilot voice stt-provider-contract-draft --provider-name ${providerName} --json`,
      reason: 'Turns recorded incompatibility evidence into the provider-specific adapter contract draft.',
    },
  ];
}
