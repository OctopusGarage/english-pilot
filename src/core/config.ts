import { accessSync, constants, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import type { EnglishPilotConfig } from './types.js';
import { defaultConfig } from './policy.js';
import { buildIntegrationPreflight, type IntegrationPreflight } from '../integrations/preflight.js';
import { findIntegrationTarget } from '../integrations/targets.js';
import { buildVoiceProviderPreflight, type VoiceProviderPreflight } from './voice-preflight.js';
import { findVoiceProvider } from './voice-providers.js';
import {
  buildVoiceSttProviderAssessmentHistory,
  type VoiceSttProviderAssessmentRecord,
} from './voice-stt-assessment.js';
import { detectUncleanRestart } from './infra/lifecycle.js';
import { ensureRuntimeLayout, getRuntimeHome } from './infra/state-dir.js';

export function getEnglishPilotHome(): string {
  return getRuntimeHome();
}

export function getConfigPath(): string {
  return join(getEnglishPilotHome(), 'config.json');
}

export interface DoctorReport {
  ok: boolean;
  home: string;
  config: { ok: boolean; path: string; error?: string };
  storage: { ok: boolean; path: string; error?: string };
  daemon: {
    running: boolean;
    socketReachable: boolean;
    controlSocketPath: string;
    instanceLockPath: string;
    runningMarkerPath: string;
    daemonLogPath: string;
    uncleanRestart: boolean;
    pid?: number;
    startedAt?: string;
  };
  rewrite: {
    backend: 'off' | 'argos';
    ready: boolean;
    python?: string;
    error?: string;
  };
  claude: {
    hookInstalled: boolean;
    mcpInstalled: boolean;
    hookPath: string;
    configPath: string;
  };
  codex: {
    hookInstalled: boolean;
    hooksEnabled: boolean;
    mcpInstalled: boolean;
    hooksPath: string;
    configPath: string;
  };
  integrations: {
    feishu: IntegrationPreflight;
    wechat: IntegrationPreflight;
  };
  voice: {
    manual: VoiceProviderPreflight;
    localWhisper: VoiceProviderPreflight;
    cloudStt: VoiceProviderPreflight;
  };
  voiceSttAssessments: {
    records: VoiceSttProviderAssessmentRecord[];
  };
}

export interface DoctorExport {
  written: true;
  path: string;
}

export function doctor(): DoctorReport {
  const home = getEnglishPilotHome();
  const configPath = getConfigPath();
  const report: DoctorReport = {
    ok: true,
    home,
    config: { ok: true, path: configPath },
    storage: { ok: true, path: home },
    daemon: inspectDaemon(),
    rewrite: { backend: 'off', ready: true },
    claude: inspectClaudeInstall(resolveInstallHome()),
    codex: inspectCodexInstall(resolveInstallHome()),
    integrations: inspectIntegrations(),
    voice: inspectVoiceProviders(),
    voiceSttAssessments: inspectVoiceSttAssessments(),
  };

  let loadedConfig: EnglishPilotConfig | undefined;
  try {
    loadedConfig = loadConfig();
    report.rewrite = inspectRewrite(loadedConfig);
  } catch (error) {
    report.config = {
      ok: false,
      path: configPath,
      error: error instanceof Error ? error.message : String(error),
    };
  }

  try {
    mkdirSync(home, { recursive: true });
  } catch (error) {
    report.storage = {
      ok: false,
      path: home,
      error: error instanceof Error ? error.message : String(error),
    };
  }

  report.ok = report.config.ok && report.storage.ok && report.rewrite.ready;
  return report;
}

export function writeDoctorMarkdown(report: DoctorReport, directory: string): DoctorExport {
  mkdirSync(directory, { recursive: true });
  const path = join(directory, 'english-pilot-doctor.md');
  writeFileSync(path, formatDoctorMarkdown(report), 'utf8');
  return {
    written: true,
    path,
  };
}

export function formatDoctorMarkdown(report: DoctorReport): string {
  return [
    '# EnglishPilot Doctor Report',
    '',
    `- Overall: ${report.ok ? 'ok' : 'failed'}`,
    `- Home: ${report.home}`,
    '',
    '## Local System',
    '',
    `- Config: ${report.config.ok ? 'ok' : `failed - ${report.config.error}`}`,
    `- Config path: ${report.config.path}`,
    `- Storage: ${report.storage.ok ? 'ok' : `failed - ${report.storage.error}`}`,
    `- Storage path: ${report.storage.path}`,
    `- Daemon running: ${report.daemon.running ? 'yes' : 'no'}`,
    `- Daemon socket: ${report.daemon.socketReachable ? 'reachable' : 'not reachable'} (${report.daemon.controlSocketPath})`,
    `- Daemon instance lock: ${report.daemon.instanceLockPath}`,
    `- Daemon log: ${report.daemon.daemonLogPath}`,
    `- Daemon unclean restart marker: ${report.daemon.uncleanRestart ? 'yes' : 'no'}`,
    `- Rewrite: ${report.rewrite.ready ? 'ok' : `failed - ${report.rewrite.error}`} (${report.rewrite.backend})`,
    `- Claude hook: ${report.claude.hookInstalled ? 'installed' : 'missing'}`,
    `- Claude MCP: ${report.claude.mcpInstalled ? 'installed' : 'missing'}`,
    `- Codex hook: ${report.codex.hookInstalled ? 'installed' : 'missing'}`,
    `- Codex hooks enabled: ${report.codex.hooksEnabled ? 'yes' : 'no'}`,
    `- Codex MCP: ${report.codex.mcpInstalled ? 'installed' : 'missing'}`,
    '',
    '## Integration Preflight',
    '',
    `- Feishu/Lark: ${formatDoctorPreflightMarkdown(report.integrations.feishu.ready, report.integrations.feishu.missing)}`,
    `- WeChat: ${formatDoctorPreflightMarkdown(report.integrations.wechat.ready, report.integrations.wechat.missing)}`,
    '',
    '## Voice',
    '',
    `- Manual: ${formatDoctorPreflightMarkdown(report.voice.manual.ready, report.voice.manual.missing)}`,
    `- Local Whisper: ${formatDoctorPreflightMarkdown(report.voice.localWhisper.ready, report.voice.localWhisper.missing)}`,
    `- Cloud STT: ${formatDoctorPreflightMarkdown(report.voice.cloudStt.ready, report.voice.cloudStt.missing)}`,
    `- Voice STT assessments: ${report.voiceSttAssessments.records.length} recorded`,
    ...report.voiceSttAssessments.records.map(
      (record) =>
        `  - ${record.providerName}: generic-json ${record.genericJsonCompatible ? 'compatible' : 'incompatible'}, provider-specific contract ${record.providerSpecificContractNeeded ? 'needed' : 'not needed'}`,
    ),
    '',
  ].join('\n');
}

export function loadConfig(): EnglishPilotConfig {
  const configPath = getConfigPath();
  if (!existsSync(configPath)) return validateConfig(defaultConfig);

  const raw = readFileSync(configPath, 'utf8');
  const overrides = JSON.parse(raw) as Partial<EnglishPilotConfig>;
  return validateConfig({ ...defaultConfig, ...overrides });
}

function formatDoctorPreflightMarkdown(ready: boolean, missing: string[]): string {
  return ready ? 'ready' : `missing ${missing.join(', ')}`;
}

function inspectDaemon(): DoctorReport['daemon'] {
  const layout = ensureRuntimeLayout();
  const restart = detectUncleanRestart(layout.runningMarkerPath);
  return {
    running: false,
    socketReachable: false,
    controlSocketPath: layout.controlSocketPath,
    instanceLockPath: layout.instanceLockPath,
    runningMarkerPath: layout.runningMarkerPath,
    daemonLogPath: layout.daemonLogPath,
    uncleanRestart: restart.unclean,
    ...(restart.unclean && restart.pid !== undefined ? { pid: restart.pid } : {}),
    ...(restart.unclean && restart.startedAt !== undefined ? { startedAt: restart.startedAt } : {}),
  };
}

export function saveConfig(config: EnglishPilotConfig): void {
  const validConfig = validateConfig(config);
  const home = getEnglishPilotHome();
  mkdirSync(home, { recursive: true });
  writeFileSync(`${getConfigPath()}\n`.trim(), `${JSON.stringify(validConfig, null, 2)}\n`, 'utf8');
}

export function setConfigValue(key: string, value: string): EnglishPilotConfig {
  const config = loadConfig();
  if (!isConfigKey(key)) {
    throw new Error(`Unknown config key: ${key}`);
  }

  const next = validateConfig({ ...config, [key]: parseConfigValue(key, value) });
  saveConfig(next);
  return next;
}

function isConfigKey(key: string): key is keyof EnglishPilotConfig {
  return Object.prototype.hasOwnProperty.call(defaultConfig, key);
}

function parseConfigValue<K extends keyof EnglishPilotConfig>(key: K, value: string): EnglishPilotConfig[K] {
  const current = defaultConfig[key];
  if (typeof current === 'number') {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) {
      throw new Error(`Config key ${String(key)} expects a number.`);
    }
    return numeric as EnglishPilotConfig[K];
  }

  if (typeof current === 'boolean') {
    if (value === 'true') return true as EnglishPilotConfig[K];
    if (value === 'false') return false as EnglishPilotConfig[K];
    throw new Error(`Config key ${String(key)} expects true or false.`);
  }

  return parseStringConfigValue(key, value);
}

function parseStringConfigValue<K extends keyof EnglishPilotConfig>(key: K, value: string): EnglishPilotConfig[K] {
  if (key === 'gateMode') return parseOneOf(key, value, ['enforce', 'coach']) as EnglishPilotConfig[K];
  if (key === 'coachingIntensity')
    return parseOneOf(key, value, ['low', 'medium', 'high', 'force']) as EnglishPilotConfig[K];
  if (key === 'ratioProgression') {
    return parseOneOf(key, value, ['manual', 'scheduled']) as EnglishPilotConfig[K];
  }
  if (key === 'storage') return parseOneOf(key, value, ['sqlite', 'jsonl']) as EnglishPilotConfig[K];
  if (key === 'rewriteBackend') return parseOneOf(key, value, ['off', 'argos']) as EnglishPilotConfig[K];
  if (key === 'externalAgentBackend')
    return parseOneOf(key, value, ['off', 'claude', 'codex']) as EnglishPilotConfig[K];
  if (key === 'externalAgentCodexSandbox') {
    return parseOneOf(key, value, ['read-only', 'workspace-write', 'danger-full-access']) as EnglishPilotConfig[K];
  }
  return value as EnglishPilotConfig[K];
}

function parseOneOf<K extends keyof EnglishPilotConfig>(key: K, value: string, allowed: readonly string[]): string {
  if (allowed.includes(value)) return value;
  throw new Error(`${String(key)} must be one of: ${allowed.join(', ')}.`);
}

function validateConfig(config: EnglishPilotConfig): EnglishPilotConfig {
  validateRatio('maxChineseRatio', config.maxChineseRatio);
  validateRatio('targetChineseRatio', config.targetChineseRatio);
  if (config.targetChineseRatio > config.maxChineseRatio) {
    throw new Error('targetChineseRatio must be less than or equal to maxChineseRatio.');
  }
  validateOneOf('gateMode', config.gateMode, ['enforce', 'coach']);
  validateOneOf('coachingIntensity', config.coachingIntensity, ['low', 'medium', 'high', 'force']);
  validateRatioProgression(config.ratioProgression);
  validateOneOf('storage', config.storage, ['sqlite', 'jsonl']);
  validateOneOf('rewriteBackend', config.rewriteBackend, ['off', 'argos']);
  validateOneOf('externalAgentBackend', config.externalAgentBackend, ['off', 'claude', 'codex']);
  validateOneOf('externalAgentCodexSandbox', config.externalAgentCodexSandbox, [
    'read-only',
    'workspace-write',
    'danger-full-access',
  ]);
  validateBoolean('preferEnglishLeading', config.preferEnglishLeading);
  validateBoolean('ignoreCodePathsUrls', config.ignoreCodePathsUrls);
  validateBoolean('blockWithRewrite', config.blockWithRewrite);
  validateBoolean('recordAllowedPrompts', config.recordAllowedPrompts);
  validateNonNegativeInteger('ignoreShortCjkFragmentsUnder', config.ignoreShortCjkFragmentsUnder);
  validateNonNegativeInteger('coachingCooldownMinutes', config.coachingCooldownMinutes);
  validateNonNegativeInteger('maxInlineCoachingPerDay', config.maxInlineCoachingPerDay);
  validatePositiveInteger('rewriteTimeoutMs', config.rewriteTimeoutMs);
  validatePositiveInteger('externalAgentTimeoutMs', config.externalAgentTimeoutMs);
  return config;
}

function validateRatio(key: 'maxChineseRatio' | 'targetChineseRatio', value: number): void {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 1) {
    throw new Error(`${key} must be between 0 and 1.`);
  }
}

function validateOneOf<K extends keyof EnglishPilotConfig>(
  key: K,
  value: EnglishPilotConfig[K],
  allowed: readonly EnglishPilotConfig[K][],
): void {
  if (allowed.includes(value)) return;
  throw new Error(`${String(key)} must be one of: ${allowed.join(', ')}.`);
}

function validateRatioProgression(value: EnglishPilotConfig['ratioProgression']): void {
  validateOneOf('ratioProgression', value, ['manual', 'scheduled']);
}

function validateBoolean(key: string, value: boolean): void {
  if (typeof value !== 'boolean') {
    throw new Error(`${key} must be true or false.`);
  }
}

function validateNonNegativeInteger(key: string, value: number): void {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`${key} must be a non-negative integer.`);
  }
}

function validatePositiveInteger(key: string, value: number): void {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${key} must be a positive integer.`);
  }
}

function inspectRewrite(config: EnglishPilotConfig): DoctorReport['rewrite'] {
  if (config.rewriteBackend === 'off') {
    return { backend: 'off', ready: true };
  }

  const python = config.argosPython.trim();
  if (!python) {
    return {
      backend: 'argos',
      ready: false,
      error: 'argosPython is not configured.',
    };
  }

  if (!existsSync(python)) {
    return {
      backend: 'argos',
      ready: false,
      python,
      error: 'Configured argosPython does not exist.',
    };
  }

  try {
    accessSync(python, constants.X_OK);
  } catch {
    return {
      backend: 'argos',
      ready: false,
      python,
      error: 'Configured argosPython is not executable.',
    };
  }

  return {
    backend: 'argos',
    ready: true,
    python,
  };
}

function inspectCodexInstall(home: string): DoctorReport['codex'] {
  const hooksPath = join(home, '.codex', 'hooks.json');
  const configPath = join(home, '.codex', 'config.toml');
  return {
    hookInstalled: hasCodexHook(hooksPath),
    hooksEnabled: hasCodexHooksEnabled(configPath),
    mcpInstalled: hasManagedCodexMcp(configPath),
    hooksPath,
    configPath,
  };
}

function inspectClaudeInstall(home: string): DoctorReport['claude'] {
  const hookPath = join(home, '.claude', 'hooks', 'english-pilot.sh');
  const configPath = join(home, '.claude.json');
  return {
    hookInstalled: hasClaudeHook(hookPath),
    mcpInstalled: hasClaudeMcp(configPath),
    hookPath,
    configPath,
  };
}

function inspectIntegrations(): DoctorReport['integrations'] {
  const feishu = findIntegrationTarget('feishu');
  const wechat = findIntegrationTarget('wechat');
  if (!feishu || !wechat) {
    throw new Error('Expected Feishu and WeChat integration targets to be registered.');
  }
  return {
    feishu: buildIntegrationPreflight(feishu),
    wechat: buildIntegrationPreflight(wechat),
  };
}

function inspectVoiceProviders(): DoctorReport['voice'] {
  const manual = findVoiceProvider('manual');
  const localWhisper = findVoiceProvider('local-whisper');
  const cloudStt = findVoiceProvider('cloud-stt');
  if (!manual || !localWhisper || !cloudStt) {
    throw new Error('Expected voice providers to be registered.');
  }
  return {
    manual: buildVoiceProviderPreflight(manual),
    localWhisper: buildVoiceProviderPreflight(localWhisper),
    cloudStt: buildVoiceProviderPreflight(cloudStt),
  };
}

function inspectVoiceSttAssessments(): DoctorReport['voiceSttAssessments'] {
  return buildVoiceSttProviderAssessmentHistory();
}

function resolveInstallHome(): string {
  return process.env.ENGLISH_PILOT_INSTALL_HOME || homedir();
}

function hasCodexHook(path: string): boolean {
  if (!existsSync(path)) return false;
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8')) as unknown;
    if (!isRecord(parsed) || !isRecord(parsed.hooks)) return false;
    const groups = parsed.hooks.UserPromptSubmit;
    if (!Array.isArray(groups)) return false;
    return groups.some((group) => {
      if (!isRecord(group) || !Array.isArray(group.hooks)) return false;
      return group.hooks.some((hook) => {
        return isRecord(hook) && typeof hook.command === 'string' && hook.command.includes(' hook codex --stdin');
      });
    });
  } catch {
    return false;
  }
}

function hasManagedCodexMcp(path: string): boolean {
  if (!existsSync(path)) return false;
  const text = readFileSync(path, 'utf8');
  return text.includes('# BEGIN EnglishPilot MCP') && text.includes('[mcp_servers.english-pilot]');
}

function hasClaudeHook(path: string): boolean {
  if (!existsSync(path)) return false;
  try {
    return readFileSync(path, 'utf8').includes(' hook claude --stdin');
  } catch {
    return false;
  }
}

function hasClaudeMcp(path: string): boolean {
  if (!existsSync(path)) return false;
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8')) as unknown;
    return isRecord(parsed) && isRecord(parsed.mcpServers) && isRecord(parsed.mcpServers['english-pilot']);
  } catch {
    return false;
  }
}

function hasCodexHooksEnabled(path: string): boolean {
  if (!existsSync(path)) return false;
  const lines = readFileSync(path, 'utf8').split('\n');
  const hooksStart = lines.findIndex((line) => /^\s*\[hooks]\s*$/.test(line));
  if (hooksStart < 0) return false;
  const hooksEnd = lines.findIndex((line, index) => index > hooksStart && /^\s*\[/.test(line));
  const end = hooksEnd >= 0 ? hooksEnd : lines.length;
  return lines.some((line, index) => {
    return index > hooksStart && index < end && /^\s*enabled\s*=\s*true\s*$/.test(line);
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
