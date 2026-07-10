import { readFileSync } from 'node:fs';
import { runAgent, runAgentRunAsync } from './cli-agent.js';
import { runFeishu, runFeishuAsync, runWeChat, runWeChatAsync } from './cli-channels.js';
import { runConfig } from './cli-config.js';
import { runDaemonCommand, runDaemonCommandAsync, runRunCommand } from './cli-daemon.js';
import { runEval, runEvalAsync } from './cli-eval.js';
import { runInstall, runUninstall } from './cli-installer.js';
import { runIntegrationAccountValidate, runIntegrations, runIntegrationSend } from './cli-integrations.js';
import { runCheck, runCoach, runHook, runPronounce } from './cli-language.js';
import { runMcp } from './cli-mcp.js';
import { runDoctor, runExport, runGlossary, runHandoff, runRoadmap, runStats, runStatus } from './cli-project.js';
import { runDaily, runReview } from './cli-review.js';
import { runService } from './cli-service.js';
import { runSetup } from './cli-setup.js';
import type { CliAsyncOptions, CliResult } from './cli-types.js';
import { runVoice, runVoiceAsync } from './cli-voice.js';
import { helpText } from './cli-help.js';
import { serveMcpStdio } from './mcp-stdio.js';

export function runCli(argv: string[], stdin = ''): CliResult {
  const [command, ...args] = argv;

  if (!command || command === 'help' || command === '--help' || command === '-h') {
    return {
      exitCode: 0,
      stdout: helpText(),
      stderr: '',
    };
  }

  if (command === 'check') return runCheck(args, stdin);
  if (command === 'hook') return runHook(args, stdin);
  if (command === 'install') return runInstall(args);
  if (command === 'uninstall') return runUninstall(args);
  if (command === 'setup') return runSetup(args);
  if (command === 'service') return runService(args);
  if (command === 'daemon') return runDaemonCommand(args);
  if (command === 'config') return runConfig(args);
  if (command === 'mcp') return runMcp(args);
  if (command === 'review') return runReview(args);
  if (command === 'coach') return runCoach(args, stdin);
  if (command === 'pronounce') return runPronounce(args, stdin);
  if (command === 'voice') return runVoice(args);
  if (command === 'daily') return runDaily(args);
  if (command === 'glossary') return runGlossary(args);
  if (command === 'stats') return runStats(args);
  if (command === 'export') return runExport(args);
  if (command === 'handoff') return runHandoff(args);
  if (command === 'integrations') return runIntegrations(args);
  if (command === 'agent') return runAgent(args, stdin);
  if (command === 'feishu') return runFeishu(args);
  if (command === 'wechat') return runWeChat(args);
  if (command === 'doctor') return runDoctor(args);
  if (command === 'status') return runStatus(args);
  if (command === 'roadmap') return runRoadmap(args);
  if (command === 'eval') return runEval(args);

  return {
    exitCode: 1,
    stdout: '',
    stderr: `Unknown command: ${command}\n\n${helpText()}`,
  };
}

export async function runCliAsync(argv: string[], stdin = '', options: CliAsyncOptions = {}): Promise<CliResult> {
  const [command, ...args] = argv;
  if (command === 'run') {
    return runRunCommand(args);
  }
  if (command === 'daemon') {
    return runDaemonCommandAsync(args);
  }
  if (command === 'integrations' && args[0] === 'send') {
    return runIntegrationSend(args, options);
  }
  if (command === 'integrations' && args[0] === 'account-validate') {
    return runIntegrationAccountValidate(args, options);
  }
  if (command === 'feishu' && (args[0] === 'setup' || args[0] === 'start')) {
    return runFeishuAsync(args);
  }
  if (command === 'wechat' && (args[0] === 'setup' || args[0] === 'start')) {
    return runWeChatAsync(args);
  }
  if (command === 'agent' && args[0] === 'run') {
    return runAgentRunAsync(args, stdin);
  }
  if (command === 'voice' && (args[0] === 'transcribe' || args[0] === 'practice')) {
    return runVoiceAsync(args, options);
  }
  if (command === 'eval' && args[0] === 'agent') {
    return runEvalAsync(args);
  }
  return runCli(argv, stdin);
}

export async function runCliFromProcess(): Promise<void> {
  if (process.argv[2] === 'serve' && process.argv[3] === '--mcp') {
    await serveMcpStdio();
    return;
  }

  if (process.argv[2] === 'hook') {
    process.env.NODE_NO_WARNINGS = process.env.NODE_NO_WARNINGS || '1';
  }

  const stdin = process.argv.includes('--stdin') ? readFileSync(0, 'utf8') : '';
  const result = await runCliAsync(process.argv.slice(2), stdin);
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  process.exitCode = result.exitCode;
}
