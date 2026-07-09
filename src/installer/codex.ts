import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

export interface CodexInstallPlan {
  hooksConfigPath: string;
  configPath: string;
  agentsPath: string;
  hookCommand: string;
  mcpServerConfig: {
    command: string;
    args: string[];
  };
  statusMessage: string;
}

interface CodexCommandHook {
  type: 'command';
  command: string;
  statusMessage?: string;
}

interface CodexMatcherGroup {
  matcher?: string;
  hooks?: CodexCommandHook[];
}

export function createCodexInstallPlan(
  homeDir: string,
  hookCommand = 'english-pilot hook codex --stdin',
  mcpServerConfig = { command: 'english-pilot', args: ['serve', '--mcp'] },
): CodexInstallPlan {
  return {
    hooksConfigPath: join(homeDir, '.codex', 'hooks.json'),
    configPath: join(homeDir, '.codex', 'config.toml'),
    agentsPath: join(homeDir, '.codex', 'AGENTS.md'),
    hookCommand,
    mcpServerConfig,
    statusMessage: 'Checking English policy',
  };
}

export function resolveCodexInstallHome(defaultHomeDir: string): string {
  return process.env.ENGLISH_PILOT_INSTALL_HOME || defaultHomeDir;
}

export function installCodexHook(plan: CodexInstallPlan): void {
  const config = readJsonObject(plan.hooksConfigPath);
  const hooks = isRecord(config.hooks) ? config.hooks : {};
  const userPromptSubmit = Array.isArray(hooks.UserPromptSubmit)
    ? hooks.UserPromptSubmit.filter(isCodexMatcherGroup)
    : [];

  config.hooks = {
    ...hooks,
    UserPromptSubmit: [
      ...removeEnglishPilotGroups(userPromptSubmit, plan),
      {
        hooks: [
          {
            type: 'command',
            command: plan.hookCommand,
            statusMessage: plan.statusMessage,
          },
        ],
      },
    ],
  };

  mkdirSync(dirname(plan.hooksConfigPath), { recursive: true });
  writeFileSync(plan.hooksConfigPath, `${JSON.stringify(config, null, 2)}\n`, 'utf8');
  writeCodexMcpConfig(plan);
  writeCodexGuidance(plan);
}

export function uninstallCodexHook(plan: CodexInstallPlan): boolean {
  const config = readJsonObject(plan.hooksConfigPath);
  if (!isRecord(config.hooks)) {
    removeCodexMcpConfigFile(plan.configPath);
    removeManagedBlockFile(plan.agentsPath, CODEX_GUIDANCE_BLOCK_START, CODEX_GUIDANCE_BLOCK_END);
    return false;
  }

  const groups = Array.isArray(config.hooks.UserPromptSubmit)
    ? config.hooks.UserPromptSubmit.filter(isCodexMatcherGroup)
    : [];
  const nextGroups = removeEnglishPilotGroups(groups, plan);
  const removed = nextGroups.length !== groups.length;

  if (nextGroups.length > 0) {
    config.hooks.UserPromptSubmit = nextGroups;
  } else {
    delete config.hooks.UserPromptSubmit;
  }

  if (Object.keys(config.hooks).length === 0) {
    delete config.hooks;
  }

  mkdirSync(dirname(plan.hooksConfigPath), { recursive: true });
  writeFileSync(plan.hooksConfigPath, `${JSON.stringify(config, null, 2)}\n`, 'utf8');
  removeCodexMcpConfigFile(plan.configPath);
  removeManagedBlockFile(plan.agentsPath, CODEX_GUIDANCE_BLOCK_START, CODEX_GUIDANCE_BLOCK_END);
  return removed;
}

export function formatCodexInstallDryRun(plan: CodexInstallPlan): string {
  return [
    'Dry run: would install Codex hook',
    `Path: ${plan.hooksConfigPath}`,
    `MCP config: ${plan.configPath}`,
    `Guidance: ${plan.agentsPath}`,
    '',
    JSON.stringify(
      {
        hooks: {
          UserPromptSubmit: [
            {
              hooks: [
                {
                  type: 'command',
                  command: plan.hookCommand,
                  statusMessage: plan.statusMessage,
                },
              ],
            },
          ],
        },
      },
      null,
      2,
    ),
    '',
    codexMcpBlock(plan),
    '',
    '[hooks]',
    'enabled = true',
    '',
    codexGuidanceBlock(),
  ].join('\n');
}

const CODEX_MCP_BLOCK_START = '# BEGIN EnglishPilot MCP';
const CODEX_MCP_BLOCK_END = '# END EnglishPilot MCP';
const CODEX_GUIDANCE_BLOCK_START = '<!-- ENGLISH_PILOT_GUIDANCE_START -->';
const CODEX_GUIDANCE_BLOCK_END = '<!-- ENGLISH_PILOT_GUIDANCE_END -->';

function writeCodexMcpConfig(plan: CodexInstallPlan): void {
  const existing = existsSync(plan.configPath) ? readFileSync(plan.configPath, 'utf8') : '';
  const cleaned = removeCodexMcpBlocks(existing).trimEnd();
  const withHooks = ensureCodexHooksEnabled(cleaned ? `${cleaned}\n` : '').trimEnd();
  const next = withHooks ? `${withHooks}\n\n${codexMcpBlock(plan)}\n` : `${codexMcpBlock(plan)}\n`;
  mkdirSync(dirname(plan.configPath), { recursive: true });
  writeFileSync(plan.configPath, next, 'utf8');
}

function writeCodexGuidance(plan: CodexInstallPlan): void {
  void plan;
  writeManagedBlockFile(plan.agentsPath, CODEX_GUIDANCE_BLOCK_START, CODEX_GUIDANCE_BLOCK_END, codexGuidanceBlock());
}

function codexMcpBlock(plan: CodexInstallPlan): string {
  return [
    CODEX_MCP_BLOCK_START,
    '[mcp_servers.english-pilot]',
    'type = "stdio"',
    `command = ${tomlString(plan.mcpServerConfig.command)}`,
    `args = [${plan.mcpServerConfig.args.map(tomlString).join(', ')}]`,
    CODEX_MCP_BLOCK_END,
  ].join('\n');
}

export function ensureCodexHooksEnabled(toml: string): string {
  const lines = toml.split('\n');
  const hooksStart = lines.findIndex((line) => /^\s*\[hooks]\s*$/.test(line));
  if (hooksStart >= 0) {
    const hooksEnd = findNextTomlSection(lines, hooksStart + 1);
    const enabledIndex = findTomlKey(lines, hooksStart + 1, hooksEnd, 'enabled');
    if (enabledIndex >= 0) {
      lines[enabledIndex] = 'enabled = true';
    } else {
      lines.splice(hooksStart + 1, 0, 'enabled = true');
    }
    return ensureTrailingNewline(lines.join('\n'));
  }

  const hooksStateStart = lines.findIndex((line) => /^\s*\[hooks\./.test(line));
  const block = ['[hooks]', 'enabled = true', ''];
  if (hooksStateStart >= 0) {
    lines.splice(hooksStateStart, 0, ...block);
  } else {
    if (lines.length > 0 && lines[lines.length - 1]?.trim()) lines.push('');
    lines.push('[hooks]', 'enabled = true');
  }
  return ensureTrailingNewline(lines.join('\n'));
}

function findNextTomlSection(lines: string[], from: number): number {
  const next = lines.findIndex((line, index) => index >= from && /^\s*\[/.test(line));
  return next >= 0 ? next : lines.length;
}

function findTomlKey(lines: string[], from: number, to: number, key: string): number {
  return lines.findIndex((line, index) => {
    return index >= from && index < to && new RegExp(`^\\s*${key}\\s*=`).test(line);
  });
}

function ensureTrailingNewline(value: string): string {
  return value.endsWith('\n') ? value : `${value}\n`;
}

function codexGuidanceBlock(): string {
  return [
    CODEX_GUIDANCE_BLOCK_START,
    '## EnglishPilot',
    '',
    'Do not derail the main task. When the user prompt is allowed, complete the requested work first.',
    'If the prompt contains any Chinese fragment, awkward English, or an obvious everyday phrasing improvement, append one compact teaching note at the end of the final response.',
    'In force/high intensity, treat this as required unless there is genuinely no useful improvement.',
    '',
    'English note: "original phrase" -> "more natural English"; Why: one practical rule; IPA: key word /IPA/ when useful.',
    '',
    'Keep it elegant and professional: 1-3 short lines, practical workplace English, no lecture, no interruption before the main answer.',
    'When the english-pilot MCP server is available, use `english_coaching_context`, `english_rewrite_text`, and `english_pronounce_text` for structured help.',
    'Do not add an English note for prompts blocked by the EnglishPilot hook.',
    CODEX_GUIDANCE_BLOCK_END,
  ].join('\n');
}

function writeManagedBlockFile(path: string, start: string, end: string, block: string): void {
  const existing = existsSync(path) ? readFileSync(path, 'utf8') : '';
  const withoutBlock = removeManagedBlock(existing, start, end).trimEnd();
  const next = withoutBlock ? `${withoutBlock}\n\n${block}\n` : `${block}\n`;
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, next, 'utf8');
}

function removeManagedBlockFile(path: string, start: string, end: string): void {
  const existing = existsSync(path) ? readFileSync(path, 'utf8') : '';
  const next = removeManagedBlock(existing, start, end).trimEnd();
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, next ? `${next}\n` : '', 'utf8');
}

function removeManagedBlock(text: string, start: string, end: string): string {
  let next = text;
  while (true) {
    const startIndex = next.indexOf(start);
    if (startIndex < 0) return next;
    const endIndex = next.indexOf(end, startIndex);
    if (endIndex < 0) return next;
    next = `${next.slice(0, startIndex)}${next.slice(endIndex + end.length)}`;
  }
}

function removeCodexMcpConfigFile(path: string): void {
  const existing = existsSync(path) ? readFileSync(path, 'utf8') : '';
  const next = removeCodexMcpBlocks(existing).trimEnd();
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, next ? `${next}\n` : '', 'utf8');
}

function removeCodexMcpBlocks(text: string): string {
  return removeTomlSection(
    removeManagedBlock(text, CODEX_MCP_BLOCK_START, CODEX_MCP_BLOCK_END),
    'mcp_servers.english-pilot',
  )
    .replaceAll(CODEX_MCP_BLOCK_END, '')
    .trimEnd();
}

function removeTomlSection(text: string, sectionName: string): string {
  const lines = text.split('\n');
  const kept: string[] = [];
  for (let index = 0; index < lines.length;) {
    if (new RegExp(`^\\s*\\[${escapeRegExp(sectionName)}]\\s*$`).test(lines[index] ?? '')) {
      index += 1;
      while (index < lines.length && !/^\s*\[/.test(lines[index] ?? '')) {
        index += 1;
      }
      continue;
    }
    kept.push(lines[index] ?? '');
    index += 1;
  }
  return kept.join('\n');
}

function tomlString(value: string): string {
  return JSON.stringify(value);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function removeEnglishPilotGroups(groups: CodexMatcherGroup[], plan: CodexInstallPlan): CodexMatcherGroup[] {
  return groups.filter((group) => {
    const hooks = Array.isArray(group.hooks) ? group.hooks : [];
    return !hooks.some((hook) => isEnglishPilotCodexHookCommand(hook.command, plan));
  });
}

function isEnglishPilotCodexHookCommand(command: string, plan: CodexInstallPlan): boolean {
  if (command === plan.hookCommand) return true;
  if (command === 'english-pilot hook codex --stdin') return true;
  return command.includes('english-pilot.js') && command.endsWith(' hook codex --stdin');
}

function readJsonObject(path: string): Record<string, unknown> {
  if (!existsSync(path)) return {};
  const parsed = JSON.parse(readFileSync(path, 'utf8')) as unknown;
  return isRecord(parsed) ? parsed : {};
}

function isCodexMatcherGroup(value: unknown): value is CodexMatcherGroup {
  if (!isRecord(value)) return false;
  return value.hooks === undefined || Array.isArray(value.hooks);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
