import { chmodSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

export interface ClaudeInstallPlan {
  hookPath: string;
  settingsPath: string;
  mcpConfigPath: string;
  hookCommand: string;
  script: string;
  mcpServerConfig: {
    command: string;
    args: string[];
  };
}

export function createClaudeInstallPlan(
  homeDir: string,
  hookCommand = 'english-pilot hook claude --stdin',
  mcpServerConfig = { command: 'english-pilot', args: ['serve', '--mcp'] },
): ClaudeInstallPlan {
  const hookPath = join(homeDir, '.claude', 'hooks', 'english-pilot.sh');
  return {
    hookPath,
    settingsPath: join(homeDir, '.claude', 'settings.json'),
    mcpConfigPath: join(homeDir, '.claude.json'),
    hookCommand,
    script: ['#!/usr/bin/env bash', 'set -euo pipefail', hookCommand, ''].join('\n'),
    mcpServerConfig,
  };
}

export function resolveClaudeInstallHome(defaultHomeDir: string): string {
  return process.env.ENGLISH_PILOT_INSTALL_HOME || defaultHomeDir;
}

export function installClaudeHook(plan: ClaudeInstallPlan): void {
  mkdirSync(dirname(plan.hookPath), { recursive: true });
  writeFileSync(plan.hookPath, plan.script, 'utf8');
  chmodSync(plan.hookPath, 0o755);
  writeClaudeHookSettings(plan);
  writeClaudeMcpConfig(plan);
}

export function uninstallClaudeHook(plan: ClaudeInstallPlan): boolean {
  const removedHook = existsSync(plan.hookPath);
  if (removedHook) rmSync(plan.hookPath);
  removeClaudeHookSettings(plan);
  removeClaudeMcpConfig(plan);
  return removedHook;
}

export function formatClaudeInstallDryRun(plan: ClaudeInstallPlan): string {
  return [
    'Dry run: would install Claude hook',
    `Path: ${plan.hookPath}`,
    `Settings: ${plan.settingsPath}`,
    `MCP config: ${plan.mcpConfigPath}`,
    '',
    plan.script,
    '',
    JSON.stringify({ hooks: claudeHookSettings(plan) }, null, 2),
    '',
    JSON.stringify({ mcpServers: { 'english-pilot': plan.mcpServerConfig } }, null, 2),
  ].join('\n');
}

interface ClaudeCommandHook {
  type: 'command';
  command: string;
}

interface ClaudeMatcherGroup {
  matcher?: string;
  hooks?: ClaudeCommandHook[];
}

function writeClaudeHookSettings(plan: ClaudeInstallPlan): void {
  const config = readJsonObject(plan.settingsPath);
  const hooks = isRecord(config.hooks) ? config.hooks : {};
  config.hooks = {
    ...hooks,
    UserPromptSubmit: [
      ...removeEnglishPilotClaudeHookGroups(readClaudeHookGroups(hooks.UserPromptSubmit), plan),
      claudeHookGroup(plan),
    ],
    Stop: [...removeEnglishPilotClaudeHookGroups(readClaudeHookGroups(hooks.Stop), plan), claudeHookGroup(plan)],
  };
  mkdirSync(dirname(plan.settingsPath), { recursive: true });
  writeFileSync(plan.settingsPath, `${JSON.stringify(config, null, 2)}\n`, 'utf8');
}

function removeClaudeHookSettings(plan: ClaudeInstallPlan): void {
  const config = readJsonObject(plan.settingsPath);
  if (!isRecord(config.hooks)) {
    mkdirSync(dirname(plan.settingsPath), { recursive: true });
    writeFileSync(plan.settingsPath, `${JSON.stringify(config, null, 2)}\n`, 'utf8');
    return;
  }

  removeClaudeHookEvent(config.hooks, 'UserPromptSubmit', plan);
  removeClaudeHookEvent(config.hooks, 'Stop', plan);
  if (Object.keys(config.hooks).length === 0) delete config.hooks;

  mkdirSync(dirname(plan.settingsPath), { recursive: true });
  writeFileSync(plan.settingsPath, `${JSON.stringify(config, null, 2)}\n`, 'utf8');
}

function removeClaudeHookEvent(
  hooks: Record<string, unknown>,
  event: 'UserPromptSubmit' | 'Stop',
  plan: ClaudeInstallPlan,
): void {
  const groups = readClaudeHookGroups(hooks[event]);
  const nextGroups = removeEnglishPilotClaudeHookGroups(groups, plan);
  if (nextGroups.length > 0) {
    hooks[event] = nextGroups;
  } else {
    delete hooks[event];
  }
}

function claudeHookSettings(plan: ClaudeInstallPlan) {
  return {
    UserPromptSubmit: [claudeHookGroup(plan)],
    Stop: [claudeHookGroup(plan)],
  };
}

function claudeHookGroup(plan: ClaudeInstallPlan): ClaudeMatcherGroup {
  return {
    hooks: [
      {
        type: 'command',
        command: plan.hookPath,
      },
    ],
  };
}

function readClaudeHookGroups(value: unknown): ClaudeMatcherGroup[] {
  return Array.isArray(value) ? value.filter(isClaudeMatcherGroup) : [];
}

function removeEnglishPilotClaudeHookGroups(
  groups: ClaudeMatcherGroup[],
  plan: ClaudeInstallPlan,
): ClaudeMatcherGroup[] {
  return groups.filter((group) => {
    const hooks = Array.isArray(group.hooks) ? group.hooks : [];
    return !hooks.some((hook) => isEnglishPilotClaudeHookCommand(hook.command, plan));
  });
}

function isEnglishPilotClaudeHookCommand(command: string, plan: ClaudeInstallPlan): boolean {
  return command === plan.hookPath || command === plan.hookCommand || command.endsWith(' hook claude --stdin');
}

function writeClaudeMcpConfig(plan: ClaudeInstallPlan): void {
  const config = readJsonObject(plan.mcpConfigPath);
  const mcpServers = isRecord(config.mcpServers) ? config.mcpServers : {};
  config.mcpServers = {
    ...mcpServers,
    'english-pilot': plan.mcpServerConfig,
  };
  mkdirSync(dirname(plan.mcpConfigPath), { recursive: true });
  writeFileSync(plan.mcpConfigPath, `${JSON.stringify(config, null, 2)}\n`, 'utf8');
}

function removeClaudeMcpConfig(plan: ClaudeInstallPlan): void {
  const config = readJsonObject(plan.mcpConfigPath);
  if (isRecord(config.mcpServers)) {
    delete config.mcpServers['english-pilot'];
    if (Object.keys(config.mcpServers).length === 0) {
      delete config.mcpServers;
    }
  }
  mkdirSync(dirname(plan.mcpConfigPath), { recursive: true });
  writeFileSync(plan.mcpConfigPath, `${JSON.stringify(config, null, 2)}\n`, 'utf8');
}

function readJsonObject(path: string): Record<string, unknown> {
  if (!existsSync(path)) return {};
  const parsed = JSON.parse(readFileSync(path, 'utf8')) as unknown;
  return isRecord(parsed) ? parsed : {};
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isClaudeMatcherGroup(value: unknown): value is ClaudeMatcherGroup {
  if (!isRecord(value)) return false;
  return value.hooks === undefined || Array.isArray(value.hooks);
}
