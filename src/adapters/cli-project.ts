import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { doctor, getEnglishPilotHome, writeDoctorMarkdown } from '../core/config.js';
import { buildExternalValidationBundle, verifyExternalValidationBundle } from '../core/external-validation-bundle.js';
import { listGlossaryEntries, removeGlossaryEntry, upsertGlossaryEntry } from '../core/glossary.js';
import { buildProjectStatus, type ProjectStatus } from '../core/status.js';
import {
  buildRoadmap,
  buildRoadmapEnvTemplate,
  buildRoadmapNextActions,
  formatRoadmap,
  formatRoadmapEnvTemplate,
  formatRoadmapNextActions,
  isRoadmapTarget,
  writeRoadmapMarkdown,
  writeRoadmapNextActionsMarkdown,
} from '../core/roadmap.js';
import { exportLearningItemsMarkdown, exportLearningItemsObsidianFiles, getStats } from '../storage/repository.js';
import { mcpToolNames } from './mcp-server.js';
import type { CliResult } from './cli-types.js';
import { getFlagValue, getRepeatedFlagValues } from './cli-args.js';

export function runGlossary(args: string[]): CliResult {
  const [subcommand] = args;
  if (subcommand === 'list') {
    const entries = listGlossaryEntries();
    return {
      exitCode: 0,
      stdout: args.includes('--json')
        ? `${JSON.stringify(entries, null, 2)}\n`
        : entries
            .map(
              (entry) =>
                `${entry.term}${entry.ipa ? ` ${entry.ipa}` : ''}${entry.meaning ? ` - ${entry.meaning}` : ''}`,
            )
            .join('\n') + (entries.length ? '\n' : ''),
      stderr: '',
    };
  }

  if (subcommand === 'add') {
    const term = args[1];
    if (!term) {
      return {
        exitCode: 1,
        stdout: '',
        stderr: 'Usage: english-pilot glossary add <term> [--ipa "..."] [--meaning "..."] [--tag tag] [--allow-term]\n',
      };
    }
    const entry = upsertGlossaryEntry({
      term,
      ipa: getFlagValue(args, '--ipa'),
      meaning: getFlagValue(args, '--meaning'),
      tags: getRepeatedFlagValues(args, '--tag'),
      allowTerm: args.includes('--allow-term'),
    });
    return {
      exitCode: 0,
      stdout: `Added ${entry.term}\n`,
      stderr: '',
    };
  }

  if (subcommand === 'remove') {
    const term = args[1];
    if (!term) {
      return {
        exitCode: 1,
        stdout: '',
        stderr: 'Usage: english-pilot glossary remove <term>\n',
      };
    }
    const removed = removeGlossaryEntry(term);
    return {
      exitCode: 0,
      stdout: removed ? `Removed ${term}\n` : `Glossary entry not found: ${term}\n`,
      stderr: '',
    };
  }

  return {
    exitCode: 1,
    stdout: '',
    stderr:
      'Usage: english-pilot glossary list [--json] | glossary add <term> [--ipa "..."] [--meaning "..."] [--tag tag] [--allow-term] | glossary remove <term>\n',
  };
}

export function runStats(args: string[]): CliResult {
  const stats = getStats();
  return {
    exitCode: 0,
    stdout: args.includes('--json') ? `${JSON.stringify(stats)}\n` : formatStats(stats),
    stderr: '',
  };
}

export function runExport(args: string[]): CliResult {
  const [format] = args;
  if (format === 'obsidian') {
    const dir = getFlagValue(args, '--dir') ?? join(getEnglishPilotHome(), 'obsidian');
    if (!args.includes('--write')) {
      return {
        exitCode: 1,
        stdout: '',
        stderr: 'Usage: english-pilot export obsidian --write [--dir path]\n',
      };
    }
    mkdirSync(dir, { recursive: true });
    for (const file of exportLearningItemsObsidianFiles()) {
      writeFileSync(join(dir, file.path), file.content, 'utf8');
    }
    return {
      exitCode: 0,
      stdout: `Wrote Obsidian export: ${dir}\n`,
      stderr: '',
    };
  }

  if (format !== 'markdown') {
    return {
      exitCode: 1,
      stdout: '',
      stderr: 'Usage: english-pilot export markdown | export obsidian --write [--dir path]\n',
    };
  }

  return {
    exitCode: 0,
    stdout: exportLearningItemsMarkdown(),
    stderr: '',
  };
}

export function runDoctor(args: string[]): CliResult {
  const report = doctor();
  const doctorExport = args.includes('--write')
    ? writeDoctorMarkdown(report, getFlagValue(args, '--dir') ?? join(getEnglishPilotHome(), 'diagnostics'))
    : undefined;
  const output = doctorExport ? { ...report, export: doctorExport } : report;
  const json = args.includes('--json');
  return {
    exitCode: report.ok ? 0 : 1,
    stdout: json
      ? `${JSON.stringify(output, null, 2)}\n`
      : [formatDoctor(report), ...(doctorExport ? [`Wrote doctor Markdown: ${doctorExport.path}`, ''] : [])].join('\n'),
    stderr: '',
  };
}

export function runHandoff(args: string[]): CliResult {
  const [subcommand] = args;
  const target = getFlagValue(args, '--target');
  if (subcommand !== 'external-validation' || (target !== undefined && !isRoadmapTarget(target))) {
    return {
      exitCode: 1,
      stdout: '',
      stderr:
        'Usage: english-pilot handoff external-validation [--target feishu|wechat|cloud-stt] [--write|--verify] [--dir <path>] [--json]\n',
    };
  }
  if (args.includes('--verify')) {
    const verification = verifyExternalValidationBundle({
      directory: getFlagValue(args, '--dir') ?? join(getEnglishPilotHome(), 'external-validation'),
      target,
    });
    return {
      exitCode: verification.ok ? 0 : 1,
      stdout: args.includes('--json')
        ? `${JSON.stringify(verification, null, 2)}\n`
        : [
            `${verification.ok ? 'Verified' : 'Failed'} external validation handoff bundle: ${verification.directory}`,
            ...verification.problems.map((problem) => `- ${problem}`),
            '',
          ].join('\n'),
      stderr: '',
    };
  }
  const bundle = buildExternalValidationBundle({
    directory: getFlagValue(args, '--dir') ?? join(getEnglishPilotHome(), 'external-validation'),
    target,
    write: args.includes('--write'),
  });
  return {
    exitCode: 0,
    stdout: args.includes('--json')
      ? `${JSON.stringify(bundle, null, 2)}\n`
      : [
          `${bundle.written ? 'Wrote' : 'Planned'} external validation handoff bundle: ${bundle.directory}`,
          ...bundle.files.map((file) => `- ${file.kind}: ${file.path}`),
          '',
        ].join('\n'),
    stderr: '',
  };
}

export function runStatus(args: string[]): CliResult {
  const status = buildProjectStatus(mcpToolNames);
  return {
    exitCode: 0,
    stdout: args.includes('--json') ? `${JSON.stringify(status, null, 2)}\n` : formatProjectStatus(status),
    stderr: '',
  };
}

export function runRoadmap(args: string[]): CliResult {
  const subcommand = args[0];
  const target = getFlagValue(args, '--target');
  if (target !== undefined && !isRoadmapTarget(target)) {
    return {
      exitCode: 1,
      stdout: '',
      stderr: roadmapUsage(),
    };
  }
  const roadmap = buildRoadmap({ target });
  if (subcommand === 'env-template') {
    const template = buildRoadmapEnvTemplate({ target });
    return {
      exitCode: 0,
      stdout: args.includes('--json') ? `${JSON.stringify(template, null, 2)}\n` : formatRoadmapEnvTemplate(template),
      stderr: '',
    };
  }
  if (subcommand === 'next') {
    const nextActions = buildRoadmapNextActions(roadmap);
    const nextActionsExport = args.includes('--write')
      ? writeRoadmapNextActionsMarkdown(
          nextActions,
          getFlagValue(args, '--dir') ?? join(getEnglishPilotHome(), 'roadmap'),
          target,
        )
      : undefined;
    const output = nextActionsExport ? { ...nextActions, export: nextActionsExport } : nextActions;
    return {
      exitCode: 0,
      stdout: args.includes('--json')
        ? `${JSON.stringify(output, null, 2)}\n`
        : [
            formatRoadmapNextActions(nextActions),
            ...(nextActionsExport ? [`Wrote roadmap next-actions Markdown: ${nextActionsExport.path}`, ''] : []),
          ].join('\n'),
      stderr: '',
    };
  }
  const roadmapExport = args.includes('--write')
    ? writeRoadmapMarkdown(roadmap, getFlagValue(args, '--dir') ?? join(getEnglishPilotHome(), 'roadmap'), target)
    : undefined;
  const output = roadmapExport ? { ...roadmap, export: roadmapExport } : roadmap;
  return {
    exitCode: 0,
    stdout: args.includes('--json')
      ? `${JSON.stringify(output, null, 2)}\n`
      : [formatRoadmap(roadmap), ...(roadmapExport ? [`Wrote roadmap Markdown: ${roadmapExport.path}`, ''] : [])].join(
          '\n',
        ),
    stderr: '',
  };
}

function roadmapUsage(): string {
  return [
    'Usage: english-pilot roadmap [--target feishu|wechat|cloud-stt] [--write] [--dir <path>] [--json]',
    '       english-pilot roadmap next [--target feishu|wechat|cloud-stt] [--write] [--dir <path>] [--json]',
    '       english-pilot roadmap env-template [--target feishu|wechat|cloud-stt] [--json]',
    '',
  ].join('\n');
}

function formatProjectStatus(status: ProjectStatus): string {
  return [
    `${status.name} ${status.version}`,
    '',
    'Supported',
    `- Hooks: ${status.supported.hooks.join(', ')}`,
    `- CLI: ${status.supported.cli.join(', ')}`,
    `- MCP: ${status.supported.mcp.join(', ')}`,
    `- Storage: ${status.supported.storage.join(', ')}`,
    `- Integrations: ${status.supported.integrations.join(', ')}`,
    `- Voice: ${status.supported.voice.length > 0 ? status.supported.voice.join(', ') : 'none'}`,
    '',
    'Deferred',
    ...status.deferred.map((item) => `- ${item}`),
    '',
    'Planned',
    ...status.planned.map((item) => `- ${item}`),
    '',
    'Open decisions',
    ...status.openDecisions.map((item) => `- ${item}`),
    '',
  ].join('\n');
}

function formatStats(stats: ReturnType<typeof getStats>): string {
  return [
    `Prompt events: ${stats.promptEvents}`,
    `Blocked prompts: ${stats.blockedPrompts}`,
    `Learning items: ${stats.learningItems}`,
    '',
  ].join('\n');
}

function formatDoctor(report: ReturnType<typeof doctor>): string {
  return [
    `Overall: ${report.ok ? 'ok' : 'failed'}`,
    `Home: ${report.home}`,
    `Config: ${report.config.ok ? 'ok' : `failed (${report.config.error})`}`,
    `Storage: ${report.storage.ok ? 'ok' : `failed (${report.storage.error})`}`,
    `Daemon: ${report.daemon.running ? 'running' : 'stopped'} (${report.daemon.controlSocketPath})`,
    `Daemon unclean restart marker: ${report.daemon.uncleanRestart ? 'yes' : 'no'}`,
    `Rewrite: ${report.rewrite.ready ? 'ok' : `failed (${report.rewrite.error})`} (${report.rewrite.backend}${report.rewrite.python ? `: ${report.rewrite.python}` : ''})`,
    `Codex hook: ${report.codex.hookInstalled ? 'installed' : 'missing'} (${report.codex.hooksPath})`,
    `Codex MCP: ${report.codex.mcpInstalled ? 'installed' : 'missing'} (${report.codex.configPath})`,
    `Feishu preflight: ${formatDoctorIntegration(report.integrations.feishu)}`,
    `WeChat preflight: ${formatDoctorIntegration(report.integrations.wechat)}`,
    `Voice manual: ${formatDoctorVoice(report.voice.manual)}`,
    `Voice local-whisper: ${formatDoctorVoice(report.voice.localWhisper)}`,
    `Voice cloud-stt: ${formatDoctorVoice(report.voice.cloudStt)}`,
    `Voice STT assessments: ${formatDoctorVoiceSttAssessments(report.voiceSttAssessments)}`,
    '',
  ].join('\n');
}

function formatDoctorIntegration(preflight: ReturnType<typeof doctor>['integrations']['feishu']): string {
  return preflight.ready ? 'ready' : `missing ${preflight.missing.join(', ')}`;
}

function formatDoctorVoice(preflight: ReturnType<typeof doctor>['voice']['manual']): string {
  return preflight.ready ? 'ready' : `missing ${preflight.missing.join(', ')}`;
}

function formatDoctorVoiceSttAssessments(history: ReturnType<typeof doctor>['voiceSttAssessments']): string {
  if (history.records.length === 0) return '0 recorded';
  const latest = history.records[history.records.length - 1];
  return [
    `${history.records.length} recorded`,
    `latest ${latest.providerName} ${latest.providerSpecificContractNeeded ? 'needs' : 'does not need'} provider-specific contract`,
  ].join(', ');
}
