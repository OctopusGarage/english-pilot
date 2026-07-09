import { chmodSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

export interface ClaudeInstallPlan {
  hookPath: string;
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
  writeClaudeMcpConfig(plan);
}

export function uninstallClaudeHook(plan: ClaudeInstallPlan): boolean {
  const removedHook = existsSync(plan.hookPath);
  if (removedHook) rmSync(plan.hookPath);
  removeClaudeMcpConfig(plan);
  return removedHook;
}

export function formatClaudeInstallDryRun(plan: ClaudeInstallPlan): string {
  return [
    'Dry run: would install Claude hook',
    `Path: ${plan.hookPath}`,
    `MCP config: ${plan.mcpConfigPath}`,
    '',
    plan.script,
    '',
    JSON.stringify({ mcpServers: { 'english-pilot': plan.mcpServerConfig } }, null, 2),
  ].join('\n');
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
