import { chmodSync, mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { runCli } from '../src/adapters/cli.js';

describe('config commands', () => {
  let previousHome: string | undefined;
  let previousInstallHome: string | undefined;
  let configHome: string;

  beforeEach(() => {
    previousHome = process.env.ENGLISH_PILOT_HOME;
    previousInstallHome = process.env.ENGLISH_PILOT_INSTALL_HOME;
    configHome = mkdtempSync(join(tmpdir(), 'english-pilot-test-'));
    process.env.ENGLISH_PILOT_HOME = configHome;
    process.env.ENGLISH_PILOT_INSTALL_HOME = configHome;
  });

  afterEach(() => {
    if (previousHome === undefined) {
      delete process.env.ENGLISH_PILOT_HOME;
    } else {
      process.env.ENGLISH_PILOT_HOME = previousHome;
    }
    if (previousInstallHome === undefined) {
      delete process.env.ENGLISH_PILOT_INSTALL_HOME;
    } else {
      process.env.ENGLISH_PILOT_INSTALL_HOME = previousInstallHome;
    }
    rmSync(configHome, { recursive: true, force: true });
  });

  it('prints default config as JSON', () => {
    const result = runCli(['config', 'get']);

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe('');
    expect(JSON.parse(result.stdout)).toMatchObject({
      maxChineseRatio: 0.3,
      coachingIntensity: 'medium',
      storage: 'sqlite',
      externalAgentBackend: 'off',
      externalAgentCodexSandbox: 'workspace-write',
    });
  });

  it('persists a numeric config override', () => {
    const setResult = runCli(['config', 'set', 'maxChineseRatio', '0.25']);
    const getResult = runCli(['config', 'get']);

    expect(setResult).toEqual({
      exitCode: 0,
      stdout: 'Set maxChineseRatio = 0.25\n',
      stderr: '',
    });
    expect(JSON.parse(getResult.stdout).maxChineseRatio).toBe(0.25);
  });

  it('persists coaching intensity overrides', () => {
    const setResult = runCli(['config', 'set', 'coachingIntensity', 'force']);
    const getResult = runCli(['config', 'get']);

    expect(setResult.exitCode).toBe(0);
    expect(JSON.parse(getResult.stdout).coachingIntensity).toBe('force');
  });

  it('persists external agent runtime overrides', () => {
    const backend = runCli(['config', 'set', 'externalAgentBackend', 'claude']);
    const cwd = runCli(['config', 'set', 'externalAgentCwd', '/tmp/project']);
    const sandbox = runCli(['config', 'set', 'externalAgentCodexSandbox', 'danger-full-access']);
    const getResult = runCli(['config', 'get']);

    expect(backend.exitCode).toBe(0);
    expect(cwd.exitCode).toBe(0);
    expect(sandbox.exitCode).toBe(0);
    expect(JSON.parse(getResult.stdout)).toMatchObject({
      externalAgentBackend: 'claude',
      externalAgentCwd: '/tmp/project',
      externalAgentCodexSandbox: 'danger-full-access',
    });
  });

  it('rejects ratio config values outside their valid range', () => {
    const highMax = runCli(['config', 'set', 'maxChineseRatio', '1.5']);
    const negativeTarget = runCli(['config', 'set', 'targetChineseRatio', '-0.1']);
    const targetAboveMax = runCli(['config', 'set', 'targetChineseRatio', '0.4']);

    expect(highMax.exitCode).toBe(1);
    expect(highMax.stderr).toContain('maxChineseRatio must be between 0 and 1');
    expect(negativeTarget.exitCode).toBe(1);
    expect(negativeTarget.stderr).toContain('targetChineseRatio must be between 0 and 1');
    expect(targetAboveMax.exitCode).toBe(1);
    expect(targetAboveMax.stderr).toContain('targetChineseRatio must be less than or equal to maxChineseRatio');
  });

  it('rejects invalid enum config values', () => {
    const intensity = runCli(['config', 'set', 'coachingIntensity', 'extreme']);
    const progression = runCli(['config', 'set', 'ratioProgression', 'automatic']);
    const storage = runCli(['config', 'set', 'storage', 'yaml']);
    const rewrite = runCli(['config', 'set', 'rewriteBackend', 'deepl']);
    const agentBackend = runCli(['config', 'set', 'externalAgentBackend', 'gemini']);
    const codexSandbox = runCli(['config', 'set', 'externalAgentCodexSandbox', 'root']);

    expect(intensity.exitCode).toBe(1);
    expect(intensity.stderr).toContain('coachingIntensity must be one of: low, medium, high, force');
    expect(progression.exitCode).toBe(1);
    expect(progression.stderr).toContain('ratioProgression must be one of: manual, scheduled');
    expect(storage.exitCode).toBe(1);
    expect(storage.stderr).toContain('storage must be one of: sqlite, jsonl');
    expect(rewrite.exitCode).toBe(1);
    expect(rewrite.stderr).toContain('rewriteBackend must be one of: off, argos');
    expect(agentBackend.exitCode).toBe(1);
    expect(agentBackend.stderr).toContain('externalAgentBackend must be one of: off, claude, codex');
    expect(codexSandbox.exitCode).toBe(1);
    expect(codexSandbox.stderr).toContain(
      'externalAgentCodexSandbox must be one of: read-only, workspace-write, danger-full-access',
    );
  });

  it('supports scheduled ratio progression opt-in while rejecting unsupported modes', () => {
    const manual = runCli(['config', 'set', 'ratioProgression', 'manual']);
    const suggested = runCli(['config', 'set', 'ratioProgression', 'suggested']);
    const scheduled = runCli(['config', 'set', 'ratioProgression', 'scheduled']);
    const config = runCli(['config', 'get']);

    expect(manual.exitCode).toBe(0);
    expect(suggested.exitCode).toBe(1);
    expect(suggested.stderr).toContain('ratioProgression must be one of: manual, scheduled');
    expect(scheduled.exitCode).toBe(0);
    expect(JSON.parse(config.stdout)).toMatchObject({
      ratioProgression: 'scheduled',
    });
  });

  it('rejects negative or fractional count and timeout config values', () => {
    const cooldown = runCli(['config', 'set', 'coachingCooldownMinutes', '-1']);
    const cap = runCli(['config', 'set', 'maxInlineCoachingPerDay', '1.5']);
    const timeout = runCli(['config', 'set', 'rewriteTimeoutMs', '0']);

    expect(cooldown.exitCode).toBe(1);
    expect(cooldown.stderr).toContain('coachingCooldownMinutes must be a non-negative integer');
    expect(cap.exitCode).toBe(1);
    expect(cap.stderr).toContain('maxInlineCoachingPerDay must be a non-negative integer');
    expect(timeout.exitCode).toBe(1);
    expect(timeout.stderr).toContain('rewriteTimeoutMs must be a positive integer');
  });

  it('reports invalid persisted config files from config get', () => {
    writeFileSync(
      join(configHome, 'config.json'),
      JSON.stringify({
        maxChineseRatio: 1.5,
      }),
      'utf8',
    );

    const result = runCli(['config', 'get']);

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe('');
    expect(result.stderr).toContain('maxChineseRatio must be between 0 and 1');
  });

  it('reports invalid persisted config files in doctor status', () => {
    writeFileSync(
      join(configHome, 'config.json'),
      JSON.stringify({
        coachingIntensity: 'extreme',
      }),
      'utf8',
    );

    const result = runCli(['doctor', '--json']);

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toBe('');
    expect(JSON.parse(result.stdout)).toMatchObject({
      ok: false,
      config: {
        ok: false,
      },
    });
    expect(JSON.parse(result.stdout).config.error).toContain(
      'coachingIntensity must be one of: low, medium, high, force',
    );
  });

  it('disables blocked prompt rewrite output when blockWithRewrite is false', () => {
    runCli(['config', 'set', 'blockWithRewrite', 'false']);

    const result = runCli(['check', '--text', '我想创建一个 new project，用来辅助英语学习。', '--json']);

    expect(result.exitCode).toBe(2);
    expect(JSON.parse(result.stdout)).toMatchObject({
      decision: 'BLOCK',
    });
    expect(JSON.parse(result.stdout)).not.toHaveProperty('rewrite');
  });

  it('does not auto-record allowed prompt lessons when recordAllowedPrompts is false', () => {
    runCli(['config', 'set', 'recordAllowedPrompts', 'false']);

    const result = runCli([
      'check',
      '--text',
      'I want to create a new project because this workflow should help me practice English while we 创建一个新的项目流程 for review.',
      '--json',
    ]);
    const queue = runCli(['review', '--json']);

    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({
      decision: 'ALLOW_WITH_COACHING',
    });
    expect(JSON.parse(queue.stdout)).toEqual([]);
  });

  it('rejects invalid config keys', () => {
    const result = runCli(['config', 'set', 'notAKey', 'value']);

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('Unknown config key: notAKey');
  });

  it('reports doctor status as JSON', () => {
    const result = runCli(['doctor', '--json']);

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe('');
    expect(JSON.parse(result.stdout)).toMatchObject({
      ok: true,
      config: { ok: true },
      storage: { ok: true },
      rewrite: {
        backend: 'off',
        ready: true,
      },
      claude: {
        hookInstalled: false,
        mcpInstalled: false,
      },
      codex: {
        hookInstalled: false,
        hooksEnabled: false,
        mcpInstalled: false,
      },
      integrations: {
        feishu: {
          ready: false,
          network: false,
          missing: ['FEISHU_APP_ID', 'FEISHU_APP_SECRET', 'FEISHU_ALLOWED_OPEN_IDS'],
        },
        wechat: {
          ready: true,
          network: false,
          missing: [],
        },
      },
      voice: {
        manual: {
          ready: true,
          network: false,
          missing: [],
        },
        localWhisper: {
          ready: false,
          network: false,
          missing: ['WHISPER_COMMAND'],
        },
        cloudStt: {
          ready: false,
          network: false,
          missing: ['CLOUD_STT_PROVIDER', 'CLOUD_STT_API_KEY', 'CLOUD_STT_ENDPOINT'],
        },
      },
    });
  });

  it('reports ready local voice provider configuration in doctor status', () => {
    const previous = {
      WHISPER_COMMAND: process.env.WHISPER_COMMAND,
    };
    const fakeWhisper = join(configHome, 'fake-whisper');
    writeFileSync(fakeWhisper, '#!/bin/sh\nexit 0\n', 'utf8');
    chmodSync(fakeWhisper, 0o755);
    process.env.WHISPER_COMMAND = fakeWhisper;

    try {
      const result = runCli(['doctor', '--json']);

      expect(result.exitCode).toBe(0);
      expect(JSON.parse(result.stdout)).toMatchObject({
        voice: {
          localWhisper: {
            ready: true,
            missing: [],
          },
        },
      });
    } finally {
      restoreEnv(previous);
    }
  });

  it('reports WeChat long-connection integration status from local channel configuration', () => {
    const previous = {
      WECHAT_ALLOWED_USERS: process.env.WECHAT_ALLOWED_USERS,
    };
    process.env.WECHAT_ALLOWED_USERS = 'wxid_owner';

    try {
      const result = runCli(['doctor', '--json']);

      expect(result.exitCode).toBe(0);
      expect(JSON.parse(result.stdout)).toMatchObject({
        integrations: {
          wechat: {
            ready: true,
            missing: [],
          },
        },
      });
    } finally {
      restoreEnv(previous);
    }
  });

  it('reports configured Argos rewrite readiness', () => {
    const fakePython = join(configHome, 'fake-python');
    writeFileSync(fakePython, '#!/bin/sh\nexit 0\n', 'utf8');
    chmodSync(fakePython, 0o755);
    runCli(['config', 'set', 'rewriteBackend', 'argos']);
    runCli(['config', 'set', 'argosPython', fakePython]);

    const result = runCli(['doctor', '--json']);

    expect(JSON.parse(result.stdout)).toMatchObject({
      ok: true,
      rewrite: {
        backend: 'argos',
        ready: true,
        python: fakePython,
      },
    });
  });

  it('reports Claude and Codex hook and MCP installation health', () => {
    const claudeHookDir = join(configHome, '.claude', 'hooks');
    mkdirSync(claudeHookDir, { recursive: true });
    writeFileSync(
      join(claudeHookDir, 'english-pilot.sh'),
      ['#!/usr/bin/env bash', 'node /tmp/english-pilot.js hook claude --stdin', ''].join('\n'),
      'utf8',
    );
    writeFileSync(
      join(configHome, '.claude.json'),
      JSON.stringify(
        {
          mcpServers: {
            'english-pilot': {
              command: 'node',
              args: ['/tmp/english-pilot.js', 'serve', '--mcp'],
            },
          },
        },
        null,
        2,
      ),
      'utf8',
    );

    const codexHome = join(configHome, '.codex');
    mkdirSync(codexHome, { recursive: true });
    writeFileSync(
      join(codexHome, 'hooks.json'),
      JSON.stringify({
        hooks: {
          UserPromptSubmit: [
            {
              hooks: [
                {
                  type: 'command',
                  command: 'node /tmp/english-pilot.js hook codex --stdin',
                },
              ],
            },
          ],
        },
      }),
      'utf8',
    );
    writeFileSync(
      join(codexHome, 'config.toml'),
      [
        '[hooks]',
        'enabled = true',
        '',
        '# BEGIN EnglishPilot MCP',
        '[mcp_servers.english-pilot]',
        'command = "node"',
        '# END EnglishPilot MCP',
        '',
      ].join('\n'),
      'utf8',
    );

    const result = runCli(['doctor', '--json']);

    expect(JSON.parse(result.stdout)).toMatchObject({
      claude: {
        hookInstalled: true,
        mcpInstalled: true,
      },
      codex: {
        hookInstalled: true,
        hooksEnabled: true,
        mcpInstalled: true,
      },
    });
  });
});

function restoreEnv(values: Record<string, string | undefined>): void {
  for (const [key, value] of Object.entries(values)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
}
