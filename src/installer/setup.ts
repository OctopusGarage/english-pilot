import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { getEnglishPilotHome, loadConfig, setConfigValue } from '../core/config.js';

export type SetupAgentBackend = 'off' | 'claude' | 'codex';

export interface SetupPlan {
  operation: 'setup';
  home: string;
  envPath: string;
  envCreated: boolean;
  agentBackend: SetupAgentBackend;
  externalAgentCwd?: string;
  nextCommands: string[];
}

export function runSetupPlan(input: {
  agentBackend?: SetupAgentBackend;
  externalAgentCwd?: string;
  write?: boolean;
}): SetupPlan {
  const home = getEnglishPilotHome();
  const envPath = join(home, 'env');
  const envCreated = input.write === true ? ensureEnvFile(envPath) : !existsSync(envPath);
  const agentBackend = input.agentBackend ?? loadConfig().externalAgentBackend;
  if (input.write === true && input.agentBackend) {
    setConfigValue('externalAgentBackend', input.agentBackend);
  }
  if (input.write === true && input.externalAgentCwd) {
    setConfigValue('externalAgentCwd', input.externalAgentCwd);
  }

  return {
    operation: 'setup',
    home,
    envPath,
    envCreated,
    agentBackend,
    ...(input.externalAgentCwd ? { externalAgentCwd: input.externalAgentCwd } : {}),
    nextCommands: [
      'english-pilot doctor --json',
      'english-pilot wechat setup',
      'english-pilot wechat doctor --json',
      'english-pilot run',
      'english-pilot service install',
    ],
  };
}

export function formatSetupPlan(plan: SetupPlan): string {
  return [
    'EnglishPilot setup',
    `Home: ${plan.home}`,
    `Service env: ${plan.envPath}${plan.envCreated ? ' (created)' : ''}`,
    `External agent: ${plan.agentBackend}`,
    ...(plan.externalAgentCwd ? [`External agent cwd: ${plan.externalAgentCwd}`] : []),
    '',
    'Next:',
    ...plan.nextCommands.map((command) => `  ${command}`),
    '',
  ].join('\n');
}

function ensureEnvFile(path: string): boolean {
  mkdirSync(dirname(path), { recursive: true });
  if (existsSync(path)) {
    const current = readFileSync(path, 'utf8');
    const next = mergeMissingEnvDefaults(current);
    if (next !== current) writeFileSync(path, next, 'utf8');
    return false;
  }
  writeFileSync(path, `${defaultEnvTemplate()}\n`, 'utf8');
  return true;
}

function mergeMissingEnvDefaults(current: string): string {
  const existingNames = new Set(
    current
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith('#') && line.includes('='))
      .map((line) => line.slice(0, line.indexOf('='))),
  );
  const missing = defaultEnvTemplate()
    .split('\n')
    .filter((line) => {
      if (!line.includes('=') || line.trim().startsWith('#')) return false;
      return !existingNames.has(line.slice(0, line.indexOf('=')));
    });
  if (missing.length === 0) return current;
  return `${current.trimEnd()}\n\n${missing.join('\n')}\n`;
}

function defaultEnvTemplate(): string {
  return [
    '# EnglishPilot service environment',
    '# Used by launchd/systemd background runs. Shell syntax is supported.',
    '',
    '# Optional local speech-to-text command for Feishu audio and CLI voice tools.',
    '# WHISPER_COMMAND=/absolute/path/to/english-pilot-stt-wrapper.py',
    '',
    'WECHAT_PROCESSING_ACK=on',
    'WECHAT_PROCESSING_ACK_TEXT="Received. Working on it..."',
    'FEISHU_PROCESSING_ACK=on',
    'FEISHU_PROCESSING_ACK_TEXT="Received. Working on it..."',
  ].join('\n');
}
