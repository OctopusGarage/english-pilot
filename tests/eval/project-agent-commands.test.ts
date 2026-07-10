import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const repoRoot = process.cwd();

describe('project agent commands', () => {
  it('provides a Claude slash command for smoke eval', () => {
    const commandPath = join(repoRoot, '.claude', 'commands', 'smoke-eval.md');

    expect(existsSync(commandPath)).toBe(true);
    const command = readFileSync(commandPath, 'utf8');
    expect(command).toContain('description: Run EnglishPilot deterministic smoke eval');
    expect(command).toContain('npm run build');
    expect(command).toContain('npm run smoke:json');
    expect(command).toContain('eval prompts');
  });

  it('provides a Claude slash command for AI-backed agent eval', () => {
    const commandPath = join(repoRoot, '.claude', 'commands', 'agent-eval.md');

    expect(existsSync(commandPath)).toBe(true);
    const command = readFileSync(commandPath, 'utf8');
    expect(command).toContain('description: Run EnglishPilot AI-backed agent eval');
    expect(command).toContain('eval agent --backend <claude|codex>');
    expect(command).toContain('--dry-run');
  });

  it('provides a Claude slash command for remote installation updates', () => {
    const commandPath = join(repoRoot, '.claude', 'commands', 'update-remote-install.md');
    const scriptPath = join(repoRoot, 'scripts', 'update-remote-install.sh');

    expect(existsSync(commandPath)).toBe(true);
    expect(existsSync(scriptPath)).toBe(true);
    const command = readFileSync(commandPath, 'utf8');
    expect(command).toContain('description: Update a remote EnglishPilot npm installation over SSH');
    expect(command).toContain('scripts/update-remote-install.sh <user@host> <version>');
    expect(command).toContain('ys-aquria@mac2015.local');
    expect(command).toContain('ys-aquria@mac2015.local latest');
    expect(statSync(scriptPath).mode & 0o111).toBeTruthy();
  });

  it('documents the smoke eval trigger for Codex and other repo agents', () => {
    const agents = readFileSync(join(repoRoot, 'AGENTS.md'), 'utf8');

    expect(agents).toContain('/smoke-eval');
    expect(agents).toContain('/agent-eval');
    expect(agents).toContain('/update-remote-install');
    expect(agents).toContain('npm run build && npm run smoke:json');
    expect(agents).toContain('node dist/src/bin/english-pilot.js eval prompts');
    expect(agents).toContain('node dist/src/bin/english-pilot.js eval agent --backend codex');
  });
});
