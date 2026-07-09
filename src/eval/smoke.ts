import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildExternalChannelAgentPrompt } from '../agent/channel-prompt.js';
import { buildExternalAgentInvocation } from '../agent/runner.js';
import { monitorExternalChannelText } from '../channels/external-monitor.js';
import { buildPromptAssessment } from '../core/prompt-assessment.js';
import { saveConfig } from '../core/config.js';
import { defaultConfig } from '../core/policy.js';
import type { EnglishPilotConfig } from '../core/types.js';
import {
  awkwardWeatherPrompt,
  blockedProjectPrompt,
  getAgentEvalPrompt,
  listEvalPromptFixtures,
  type EvalPromptFixture,
} from './cases.js';

export interface SmokeEvalCaseResult {
  id: string;
  passed: boolean;
  summary: string;
  details?: Record<string, unknown>;
}

export interface SmokeEvalReport {
  operation: 'english-pilot-smoke-eval';
  passed: boolean;
  cases: SmokeEvalCaseResult[];
  prompts: SmokeEvalPrompt[];
}

export type SmokeEvalPrompt = EvalPromptFixture;

export function runSmokeEval(): SmokeEvalReport {
  const prompts = listEvalPromptFixtures();
  const cases = withTemporarySmokeHome(() => {
    saveConfig(forceSmokeConfig());
    return [
      runCase('gate.blocks_over_limit_chinese', 'Blocks over-limit Chinese prompts with a copyable rewrite.', () => {
        const assessment = buildPromptAssessment({ text: blockedProjectPrompt, config: forceSmokeConfig() });
        return {
          passed: assessment.analysis.decision === 'BLOCK' && (assessment.rewrite?.includes('new project') ?? false),
          details: {
            decision: assessment.analysis.decision,
            rewrite: assessment.rewrite,
          },
        };
      }),
      runCase(
        'gate.force_coaches_awkward_mixed_prompt',
        'Force mode coaches an allowed prompt with awkward English and a short Chinese fragment.',
        () => {
          const assessment = buildPromptAssessment({ text: awkwardWeatherPrompt, config: forceSmokeConfig() });
          return {
            passed:
              assessment.analysis.decision === 'ALLOW_WITH_COACHING' &&
              (assessment.analysis.coachingSignals?.includes('short-non-English-fragment') ?? false),
            details: {
              decision: assessment.analysis.decision,
              coachingSignals: assessment.analysis.coachingSignals ?? [],
            },
          };
        },
      ),
      runChannelCoachingCase('feishu', 'channel.feishu_agent_prompt_includes_coaching'),
      runChannelCoachingCase('wechat', 'channel.wechat_agent_prompt_includes_coaching'),
      runCase(
        'agent.codex_dry_run_builds_resume_safe_command',
        'Builds the Codex dry-run command without invoking Codex.',
        () => {
          const invocation = buildExternalAgentInvocation({
            config: forceSmokeConfig(),
            backend: 'codex',
            prompt: getAgentEvalPrompt('codex', 'channel-weather'),
            cwd: '/tmp/english-pilot-smoke',
            dryRun: true,
          });
          return {
            passed:
              invocation.command === 'codex' &&
              invocation.args.includes('exec') &&
              invocation.args.includes('--json') &&
              invocation.args.includes('--skip-git-repo-check') &&
              invocation.promptStdin.includes('<english_pilot_coaching>'),
            details: {
              command: invocation.command,
              args: invocation.args,
            },
          };
        },
      ),
    ];
  });
  return {
    operation: 'english-pilot-smoke-eval',
    passed: cases.every((item) => item.passed),
    cases,
    prompts,
  };
}

export function formatSmokeEvalReport(report: SmokeEvalReport): string {
  return [
    `EnglishPilot smoke eval: ${report.passed ? 'passed' : 'failed'}`,
    ...report.cases.map((item) => `${item.passed ? 'PASS' : 'FAIL'} ${item.id} - ${item.summary}`),
    '',
  ].join('\n');
}

export function formatSmokeEvalPrompts(prompts = listEvalPromptFixtures()): string {
  return prompts
    .map((item) =>
      [`# ${item.title}`, '', `Command: ${item.command}`, '', 'Prompt:', '```text', item.prompt.trim(), '```', ''].join(
        '\n',
      ),
    )
    .join('\n');
}

function runChannelCoachingCase(channel: 'feishu' | 'wechat', id: string): SmokeEvalCaseResult {
  return runCase(id, `Adds coaching instructions to an allowed ${channel} agent prompt.`, () => {
    const monitorResult = monitorExternalChannelText({
      text: awkwardWeatherPrompt,
      replyMode: 'violation',
      source: `${channel}-channel`,
      channelTag: channel,
      coachingScene: `${channel} smoke coaching`,
      quoteStyle: channel === 'feishu' ? 'markdown-blockquote' : 'plain',
    });
    const prompt = buildExternalChannelAgentPrompt({
      channel,
      text: awkwardWeatherPrompt,
      metadata: {
        inputKind: 'text',
        thresholdDecision: 'ALLOW',
      },
      coachingInstruction: monitorResult.agentCoachingInstruction,
    });
    return {
      passed:
        monitorResult.decision === 'ALLOW_WITH_COACHING' &&
        prompt.includes('<english_pilot_coaching>') &&
        prompt.includes('English note:') &&
        prompt.includes(awkwardWeatherPrompt),
      details: {
        decision: monitorResult.decision,
        hasCoachingInstruction: monitorResult.agentCoachingInstruction !== undefined,
      },
    };
  });
}

function runCase(
  id: string,
  summary: string,
  fn: () => { passed: boolean; details?: Record<string, unknown> },
): SmokeEvalCaseResult {
  try {
    const result = fn();
    return {
      id,
      summary,
      passed: result.passed,
      ...(result.details ? { details: result.details } : {}),
    };
  } catch (error) {
    return {
      id,
      summary,
      passed: false,
      details: {
        error: error instanceof Error ? error.message : String(error),
      },
    };
  }
}

function forceSmokeConfig(): EnglishPilotConfig {
  return {
    ...defaultConfig,
    targetChineseRatio: 0,
    maxChineseRatio: 0.1,
    coachingIntensity: 'force',
    coachingCooldownMinutes: 0,
    maxInlineCoachingPerDay: 999,
    externalAgentBackend: 'codex',
    externalAgentCwd: '/tmp/english-pilot-smoke',
  };
}

function withTemporarySmokeHome<T>(fn: () => T): T {
  const previousHome = process.env.ENGLISH_PILOT_HOME;
  const home = mkdtempSync(join(tmpdir(), 'english-pilot-smoke-eval-'));
  process.env.ENGLISH_PILOT_HOME = home;
  try {
    return fn();
  } finally {
    if (previousHome === undefined) {
      delete process.env.ENGLISH_PILOT_HOME;
    } else {
      process.env.ENGLISH_PILOT_HOME = previousHome;
    }
    rmSync(home, { recursive: true, force: true });
  }
}
