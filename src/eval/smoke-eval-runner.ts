import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildExternalChannelAgentPrompt } from '../agent/channel-prompt.js';
import { buildExternalAgentInvocation } from '../agent/runner.js';
import { monitorExternalChannelText } from '../channels/external-monitor.js';
import { buildLearningBrief } from '../core/learning-brief.js';
import { buildPromptAssessment } from '../core/prompt-assessment.js';
import { saveConfig } from '../core/config.js';
import { defaultConfig } from '../core/policy.js';
import { transcribeWithLocalWhisper } from '../core/voice-transcription.js';
import { findVoiceProvider } from '../core/voice-providers.js';
import type { EnglishPilotConfig } from '../core/types.js';
import {
  awkwardWeatherPrompt,
  blockedProjectPrompt,
  getAgentEvalPrompt,
  listEvalPromptFixtures,
  type EvalPromptFixture,
} from './agent-eval-cases.js';

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
  const cases = withTemporarySmokeRuntime(({ cwd }) => {
    saveConfig(forceSmokeConfig(cwd));
    return [
      runCase('gate.blocks_over_limit_chinese', 'Blocks over-limit Chinese prompts with a copyable rewrite.', () => {
        const assessment = buildPromptAssessment({ text: blockedProjectPrompt, config: forceSmokeConfig(cwd) });
        return {
          passed: assessment.analysis.decision === 'BLOCK' && (assessment.rewrite?.includes('new project') ?? false),
          details: {
            decision: assessment.analysis.decision,
            rewrite: assessment.rewrite,
          },
        };
      }),
      runCase(
        'gate.coach_mode_records_without_blocking',
        'Coach mode lets an over-limit prompt pass while recording a reviewable rewrite.',
        () => {
          saveConfig(coachSmokeConfig(cwd));
          let monitorResult: ReturnType<typeof monitorExternalChannelText>;
          try {
            monitorResult = monitorExternalChannelText({
              text: blockedProjectPrompt,
              replyMode: 'violation',
              source: 'wechat-channel',
              channelTag: 'wechat',
              coachingScene: 'coach mode smoke',
              quoteStyle: 'plain',
            });
          } finally {
            saveConfig(forceSmokeConfig(cwd));
          }
          return {
            passed:
              monitorResult.decision === 'ALLOW_WITH_COACHING' &&
              !monitorResult.shouldReply &&
              monitorResult.recorded &&
              (monitorResult.item?.suggested.includes('new project') ?? false),
            details: {
              decision: monitorResult.decision,
              shouldReply: monitorResult.shouldReply,
              recorded: monitorResult.recorded,
              suggested: monitorResult.item?.suggested,
            },
          };
        },
      ),
      runCase(
        'gate.force_coaches_awkward_mixed_prompt',
        'Force mode coaches an allowed prompt with awkward English and a short Chinese fragment.',
        () => {
          const assessment = buildPromptAssessment({ text: awkwardWeatherPrompt, config: forceSmokeConfig(cwd) });
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
      runCase('mcp.learning_brief_supports_history_based_teaching', 'Builds an agent-ready learning brief.', () => {
        const now = new Date().toISOString();
        const brief = buildLearningBrief(
          [
            {
              id: 'evt_smoke',
              createdAt: now,
              source: 'cli',
              text: awkwardWeatherPrompt,
              decision: 'ALLOW_WITH_COACHING',
              nonEnglishRatio: 0.1,
              englishCount: 28,
              nonEnglishCount: 2,
              reason: 'Smoke eval prompt.',
              coachingShown: true,
            },
          ],
          [
            {
              id: 'learn_smoke',
              createdAt: now,
              nextReviewAt: now.slice(0, 10),
              ease: 2.5,
              reviewCount: 0,
              lapseCount: 0,
              intervalDays: 1,
              original: awkwardWeatherPrompt,
              suggested: "What's the weather like in Guangzhou?",
              scene: 'weather question',
              tags: ['weather'],
              pattern: 'Use "What is the weather like in + place?" when asking about local weather.',
              ipa: [{ word: 'weather', ipa: '/ˈweðər/' }],
            },
          ],
          { date: now.slice(0, 10), limit: 10 },
        );
        return {
          passed:
            brief.stats.promptEvents === 1 &&
            brief.stats.learningItems === 1 &&
            brief.teachingPrompt.includes('EnglishPilot learning brief') &&
            brief.suggestedActivities.some((activity) => activity.includes('short English speech')),
          details: {
            promptEvents: brief.stats.promptEvents,
            learningItems: brief.stats.learningItems,
            suggestedActivities: brief.suggestedActivities,
          },
        };
      }),
      runCase(
        'voice.local_whisper_fake_provider_transcribes',
        'Runs the local-whisper gateway against a fake executable and parses transcript metadata.',
        () => {
          const provider = findVoiceProvider('local-whisper');
          if (!provider) throw new Error('local-whisper provider is not registered.');
          const fakeWhisper = join(cwd, 'fake-whisper');
          const audioPath = join(cwd, 'sample.wav');
          writeFileSync(
            fakeWhisper,
            [
              '#!/bin/sh',
              'printf \'{"text":"What is the weather like in Guangzhou?","words":[{"word":"weather","start":0.2,"end":0.6,"confidence":0.98}]}\\n\'',
              '',
            ].join('\n'),
            'utf8',
          );
          chmodSync(fakeWhisper, 0o755);
          writeFileSync(audioPath, 'fake audio', 'utf8');
          const result = transcribeWithLocalWhisper(provider, audioPath, {
            ...process.env,
            WHISPER_COMMAND: fakeWhisper,
          });
          return {
            passed:
              result.transcript === 'What is the weather like in Guangzhou?' &&
              result.network === false &&
              result.words?.[0]?.word === 'weather',
            details: {
              transcript: result.transcript,
              wordCount: result.words?.length ?? 0,
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
            config: forceSmokeConfig(cwd),
            backend: 'codex',
            prompt: getAgentEvalPrompt('codex', 'channel-weather'),
            cwd,
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
              args: redactSmokeArgs(invocation.args, cwd),
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

function redactSmokeArgs(args: string[], cwd: string): string[] {
  return args.map((arg) => (arg === cwd ? '<temporary-workspace>' : arg));
}

function forceSmokeConfig(cwd: string): EnglishPilotConfig {
  return {
    ...defaultConfig,
    gateMode: 'enforce',
    targetChineseRatio: 0,
    maxChineseRatio: 0.1,
    coachingIntensity: 'force',
    coachingCooldownMinutes: 0,
    maxInlineCoachingPerDay: 999,
    externalAgentBackend: 'codex',
    externalAgentCwd: cwd,
  };
}

function coachSmokeConfig(cwd: string): EnglishPilotConfig {
  return {
    ...forceSmokeConfig(cwd),
    gateMode: 'coach',
  };
}

function withTemporarySmokeRuntime<T>(fn: (runtime: { home: string; cwd: string }) => T): T {
  const previousHome = process.env.ENGLISH_PILOT_HOME;
  const home = mkdtempSync(join(tmpdir(), 'english-pilot-smoke-eval-'));
  const cwd = join(home, 'workspace');
  mkdirSync(cwd, { recursive: true });
  process.env.ENGLISH_PILOT_HOME = home;
  try {
    return fn({ home, cwd });
  } finally {
    if (previousHome === undefined) {
      delete process.env.ENGLISH_PILOT_HOME;
    } else {
      process.env.ENGLISH_PILOT_HOME = previousHome;
    }
    rmSync(home, { recursive: true, force: true });
  }
}
