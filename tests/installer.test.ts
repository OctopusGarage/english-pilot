import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { runCli } from '../src/adapters/cli.js';

describe('installer target registry', () => {
  it('lists supported and planned installer targets as JSON', () => {
    const result = runCli(['install', 'targets', '--json']);

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe('');
    expect(JSON.parse(result.stdout)).toEqual({
      targets: [
        {
          id: 'claude',
          label: 'Claude Code',
          supportsInstall: true,
          supportsUninstall: true,
          status: 'supported',
        },
        {
          id: 'codex',
          label: 'Codex',
          supportsInstall: true,
          supportsUninstall: true,
          status: 'supported',
        },
        {
          id: 'cursor',
          label: 'Cursor',
          supportsInstall: false,
          supportsUninstall: false,
          status: 'planned',
        },
        {
          id: 'gemini',
          label: 'Gemini CLI',
          supportsInstall: false,
          supportsUninstall: false,
          status: 'planned',
        },
      ],
    });
  });

  it('lists supported and planned installer targets for humans', () => {
    const result = runCli(['install', 'targets']);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('claude - Claude Code (supported)');
    expect(result.stdout).toContain('codex - Codex (supported)');
    expect(result.stdout).toContain('cursor - Cursor (planned)');
    expect(result.stdout).toContain('gemini - Gemini CLI (planned)');
  });

  it('explains planned targets when install is not supported yet', () => {
    const result = runCli(['install', 'cursor', '--dry-run']);

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe('');
    expect(result.stderr).toContain('Installer target is planned but not supported yet: cursor');
    expect(result.stderr).toContain('Use `english-pilot install targets` to see supported targets.');
  });

  it('explains planned targets when uninstall is not supported yet', () => {
    const result = runCli(['uninstall', 'gemini', '--yes']);

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe('');
    expect(result.stderr).toContain('Installer target is planned but not supported yet: gemini');
    expect(result.stderr).toContain('Use `english-pilot install targets` to see supported targets.');
  });
});

describe('Claude installer commands', () => {
  let previousInstallHome: string | undefined;
  let installHome: string;

  beforeEach(() => {
    previousInstallHome = process.env.ENGLISH_PILOT_INSTALL_HOME;
    installHome = mkdtempSync(join(tmpdir(), 'english-pilot-install-'));
    process.env.ENGLISH_PILOT_INSTALL_HOME = installHome;
  });

  afterEach(() => {
    if (previousInstallHome === undefined) {
      delete process.env.ENGLISH_PILOT_INSTALL_HOME;
    } else {
      process.env.ENGLISH_PILOT_INSTALL_HOME = previousInstallHome;
    }
    rmSync(installHome, { recursive: true, force: true });
  });

  it('installs a Claude hook script with --yes', () => {
    const result = runCli(['install', 'claude', '--yes']);
    const hookPath = join(installHome, '.claude', 'hooks', 'english-pilot.sh');
    const mcpPath = join(installHome, '.claude.json');

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain(`Installed Claude hook: ${hookPath}`);
    expect(result.stdout).toContain(`Installed Claude MCP server: ${mcpPath}`);
    expect(existsSync(hookPath)).toBe(true);
    expect(statSync(hookPath).mode & 0o111).not.toBe(0);
    expect(readFileSync(hookPath, 'utf8')).toContain('english-pilot hook claude --stdin');
    expect(JSON.parse(readFileSync(mcpPath, 'utf8'))).toMatchObject({
      mcpServers: {
        'english-pilot': {
          command: 'english-pilot',
          args: ['serve', '--mcp'],
        },
      },
    });
  });

  it('uses an absolute node command for Claude hooks when installed from a local built script', () => {
    const previousArgv = [...process.argv];
    const scriptPath = join(installHome, 'dist with spaces', 'english-pilot.js');
    mkdirSync(join(installHome, 'dist with spaces'), { recursive: true });
    writeFileSync(scriptPath, '', 'utf8');
    process.argv[1] = scriptPath;

    try {
      const result = runCli(['install', 'claude', '--yes']);
      const hookPath = join(installHome, '.claude', 'hooks', 'english-pilot.sh');
      const mcpPath = join(installHome, '.claude.json');
      const mcpConfig = JSON.parse(readFileSync(mcpPath, 'utf8'));

      expect(result.exitCode).toBe(0);
      expect(readFileSync(hookPath, 'utf8')).toContain(
        `"${process.execPath}" --no-warnings "${scriptPath}" hook claude --stdin`,
      );
      expect(mcpConfig.mcpServers['english-pilot']).toEqual({
        command: process.execPath,
        args: ['--no-warnings', scriptPath, 'serve', '--mcp'],
      });
    } finally {
      process.argv = previousArgv;
    }
  });

  it('uninstalls the Claude hook script with --yes', () => {
    runCli(['install', 'claude', '--yes']);
    const result = runCli(['uninstall', 'claude', '--yes']);
    const hookPath = join(installHome, '.claude', 'hooks', 'english-pilot.sh');
    const mcpPath = join(installHome, '.claude.json');

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain(`Removed Claude hook: ${hookPath}`);
    expect(result.stdout).toContain(`Removed Claude MCP server: ${mcpPath}`);
    expect(existsSync(hookPath)).toBe(false);
    expect(JSON.parse(readFileSync(mcpPath, 'utf8'))).toEqual({});
  });
});

describe('Codex installer commands', () => {
  let previousInstallHome: string | undefined;
  let installHome: string;

  beforeEach(() => {
    previousInstallHome = process.env.ENGLISH_PILOT_INSTALL_HOME;
    installHome = mkdtempSync(join(tmpdir(), 'english-pilot-install-'));
    process.env.ENGLISH_PILOT_INSTALL_HOME = installHome;
  });

  afterEach(() => {
    if (previousInstallHome === undefined) {
      delete process.env.ENGLISH_PILOT_INSTALL_HOME;
    } else {
      process.env.ENGLISH_PILOT_INSTALL_HOME = previousInstallHome;
    }
    rmSync(installHome, { recursive: true, force: true });
  });

  it('installs a Codex UserPromptSubmit hook with --yes', () => {
    const result = runCli(['install', 'codex', '--yes']);
    const hooksPath = join(installHome, '.codex', 'hooks.json');
    const configPath = join(installHome, '.codex', 'config.toml');
    const agentsPath = join(installHome, '.codex', 'AGENTS.md');

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain(`Installed Codex hook: ${hooksPath}`);
    expect(result.stdout).toContain(`Installed Codex MCP server: ${configPath}`);
    expect(result.stdout).toContain(`Installed Codex guidance: ${agentsPath}`);
    expect(JSON.parse(readFileSync(hooksPath, 'utf8'))).toMatchObject({
      hooks: {
        UserPromptSubmit: [
          {
            hooks: [
              {
                type: 'command',
                command: 'english-pilot hook codex --stdin',
                statusMessage: 'Checking English policy',
              },
            ],
          },
        ],
      },
    });
    expect(readFileSync(configPath, 'utf8')).toContain('[mcp_servers.english-pilot]');
    expect(readFileSync(configPath, 'utf8')).toContain('[hooks]\nenabled = true');
    expect(readFileSync(configPath, 'utf8')).toContain('serve');
    expect(readFileSync(agentsPath, 'utf8')).toContain('English note:');
    expect(readFileSync(agentsPath, 'utf8')).toContain('Do not derail the main task');
  });

  it('enables Codex hooks when an existing config has hooks disabled', () => {
    const configPath = join(installHome, '.codex', 'config.toml');
    mkdirSync(join(installHome, '.codex'), { recursive: true });
    writeFileSync(
      configPath,
      ['model = "gpt-5"', '', '[hooks]', 'enabled = false', '', '[hooks.state]', ''].join('\n'),
      'utf8',
    );

    const result = runCli(['install', 'codex', '--yes']);
    const config = readFileSync(configPath, 'utf8');

    expect(result.exitCode).toBe(0);
    expect(config).toContain('[hooks]\nenabled = true');
    expect(config).toContain('[hooks.state]');
    expect(config).not.toContain('enabled = false');
  });

  it('replaces duplicate and orphaned Codex MCP config blocks during install', () => {
    const configPath = join(installHome, '.codex', 'config.toml');
    mkdirSync(join(installHome, '.codex'), { recursive: true });
    writeFileSync(
      configPath,
      [
        '[mcp_servers.keep]',
        'command = "keep"',
        '',
        '[mcp_servers.english-pilot]',
        'type = "stdio"',
        'command = "english-pilot"',
        'args = ["serve", "--mcp"]',
        '# END EnglishPilot MCP',
        '',
        '# BEGIN EnglishPilot MCP',
        '[mcp_servers.english-pilot]',
        'type = "stdio"',
        'command = "english-pilot"',
        'args = ["serve", "--mcp"]',
        '# END EnglishPilot MCP',
      ].join('\n'),
      'utf8',
    );

    const result = runCli(['install', 'codex', '--yes']);
    const config = readFileSync(configPath, 'utf8');

    expect(result.exitCode).toBe(0);
    expect(config.match(/\[mcp_servers\.english-pilot]/g)).toHaveLength(1);
    expect(config.match(/# END EnglishPilot MCP/g)).toHaveLength(1);
    expect(config).toContain('[mcp_servers.keep]');
    expect(config).toContain('[hooks]\nenabled = true');
  });

  it('uninstalls only the EnglishPilot Codex hook with --yes', () => {
    runCli(['install', 'codex', '--yes']);
    const hooksPath = join(installHome, '.codex', 'hooks.json');
    const configPath = join(installHome, '.codex', 'config.toml');
    const agentsPath = join(installHome, '.codex', 'AGENTS.md');
    const installed = JSON.parse(readFileSync(hooksPath, 'utf8'));
    installed.hooks.UserPromptSubmit.push({
      hooks: [
        {
          type: 'command',
          command: 'echo keep-me',
        },
      ],
    });
    writeFileSync(hooksPath, `${JSON.stringify(installed, null, 2)}\n`, 'utf8');
    writeFileSync(configPath, `${readFileSync(configPath, 'utf8')}\n[mcp_servers.keep]\ncommand = "keep"\n`, 'utf8');
    writeFileSync(agentsPath, `${readFileSync(agentsPath, 'utf8')}\n\n## Keep Me\n`, 'utf8');

    const result = runCli(['uninstall', 'codex', '--yes']);
    const hooksJson = JSON.parse(readFileSync(hooksPath, 'utf8'));

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain(`Removed Codex hook: ${hooksPath}`);
    expect(result.stdout).toContain(`Removed Codex MCP server: ${configPath}`);
    expect(result.stdout).toContain(`Removed Codex guidance: ${agentsPath}`);
    expect(hooksJson.hooks.UserPromptSubmit).toHaveLength(1);
    expect(hooksJson.hooks.UserPromptSubmit[0].hooks[0].command).toBe('echo keep-me');
    expect(readFileSync(configPath, 'utf8')).not.toContain('english-pilot');
    expect(readFileSync(configPath, 'utf8')).toContain('[mcp_servers.keep]');
    expect(readFileSync(agentsPath, 'utf8')).not.toContain('English note:');
    expect(readFileSync(agentsPath, 'utf8')).toContain('## Keep Me');
  });

  it('replaces a legacy PATH-dependent Codex hook command during install', () => {
    const previousArgv = [...process.argv];
    const hooksPath = join(installHome, '.codex', 'hooks.json');
    const scriptPath = join(installHome, 'dist', 'english-pilot.js');
    mkdirSync(join(installHome, '.codex'), { recursive: true });
    mkdirSync(join(installHome, 'dist'), { recursive: true });
    writeFileSync(scriptPath, '', 'utf8');
    writeFileSync(
      hooksPath,
      `${JSON.stringify(
        {
          hooks: {
            UserPromptSubmit: [
              {
                hooks: [
                  {
                    type: 'command',
                    command: 'english-pilot hook codex --stdin',
                  },
                ],
              },
            ],
          },
        },
        null,
        2,
      )}\n`,
      'utf8',
    );
    process.argv[1] = scriptPath;

    try {
      const result = runCli(['install', 'codex', '--yes']);
      const hooksJson = JSON.parse(readFileSync(hooksPath, 'utf8'));
      const groups = hooksJson.hooks.UserPromptSubmit;

      expect(result.exitCode).toBe(0);
      expect(groups).toHaveLength(1);
      expect(groups[0].hooks[0].command).toBe(`"${process.execPath}" --no-warnings "${scriptPath}" hook codex --stdin`);
    } finally {
      process.argv = previousArgv;
    }
  });

  it('removes Codex MCP and guidance even when the hook config is already missing', () => {
    runCli(['install', 'codex', '--yes']);
    const hooksPath = join(installHome, '.codex', 'hooks.json');
    const configPath = join(installHome, '.codex', 'config.toml');
    const agentsPath = join(installHome, '.codex', 'AGENTS.md');
    rmSync(hooksPath);

    const result = runCli(['uninstall', 'codex', '--yes']);

    expect(result.exitCode).toBe(0);
    expect(readFileSync(configPath, 'utf8')).not.toContain('english-pilot');
    expect(readFileSync(agentsPath, 'utf8')).not.toContain('English note:');
  });
});
