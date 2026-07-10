import { buildExternalChannelAgentPrompt } from '../agent/channel-prompt.js';
import type { ExternalAgentBackend, ExternalAgentRunResult } from '../agent/runner.js';

export type AgentEvalCaseId = 'channel-weather' | 'history-lesson';

export interface AgentEvalAssertion {
  id: string;
  passed: boolean;
  summary: string;
  details?: Record<string, unknown>;
}

export interface AgentEvalCase {
  id: AgentEvalCaseId;
  buildPrompt: (backend: ExternalAgentBackend) => string;
  buildPromptFixture: (backend: ExternalAgentBackend) => EvalPromptFixture;
  dryRunAssertions: (run: ExternalAgentRunResult) => AgentEvalAssertion[];
  replyAssertions: (run: ExternalAgentRunResult, replyText: string) => AgentEvalAssertion[];
}

export interface EvalPromptFixture {
  id: string;
  title: string;
  command: string;
  prompt: string;
}

export const blockedProjectPrompt = '我想创建一个 new project，用来辅助英语学习。';
export const awkwardWeatherPrompt = 'what is the weather about 广州';

const agentWeatherEvalInput = `Please help me phrase this weather question naturally: ${awkwardWeatherPrompt}`;
const historyLessonBrief = {
  date: '2026-07-10',
  stats: {
    promptEvents: 3,
    learningItems: 3,
  },
  patterns: [
    'Use "What is the weather like in + place?" for local weather questions.',
    'Use "create a new project" instead of "create a ne project".',
    'Use "optimize and simplify the docs" instead of mixed-language fragments such as "全面 optimise".',
  ],
  notes: [
    {
      original: 'what is the weather about 广州',
      suggested: "What's the weather like in Guangzhou?",
      ipa: [{ word: 'weather', ipa: '/ˈweðər/' }],
    },
    {
      original: 'I want to create a ne project',
      suggested: 'I want to create a new project.',
      ipa: [{ word: 'project', ipa: '/ˈprɑːdʒekt/' }],
    },
    {
      original: 'check all the docs, seem so 啰嗦了， 全面 optimise一下，keep simple and 清晰',
      suggested: 'Review all the docs, simplify them, and keep them clear.',
      ipa: [{ word: 'simplify', ipa: '/ˈsɪmplɪfaɪ/' }],
    },
  ],
};

const agentEvalCases = [
  {
    id: 'channel-weather',
    buildPrompt: (backend) => buildChannelWeatherPromptFixture(backend).prompt,
    buildPromptFixture: buildChannelWeatherPromptFixture,
    dryRunAssertions,
    replyAssertions: judgeChannelWeatherReply,
  },
  {
    id: 'history-lesson',
    buildPrompt: (backend) => buildHistoryLessonPromptFixture(backend).prompt,
    buildPromptFixture: buildHistoryLessonPromptFixture,
    dryRunAssertions: dryRunHistoryLessonAssertions,
    replyAssertions: judgeHistoryLessonReply,
  },
] as const satisfies readonly AgentEvalCase[];

export function listEvalPromptFixtures(): EvalPromptFixture[] {
  return agentEvalCases.flatMap((testCase) => [
    testCase.buildPromptFixture('claude'),
    testCase.buildPromptFixture('codex'),
  ]);
}

export function getAgentEvalPrompt(backend: ExternalAgentBackend, caseId: AgentEvalCaseId): string {
  return getAgentEvalCase(caseId).buildPrompt(backend);
}

export function getAgentEvalCase(caseId: AgentEvalCaseId): AgentEvalCase {
  const testCase = agentEvalCases.find((candidate) => candidate.id === caseId);
  if (!testCase) throw new Error(`Unknown agent eval case: ${caseId}`);
  return testCase;
}

function buildChannelWeatherPromptFixture(backend: ExternalAgentBackend): EvalPromptFixture {
  const isClaude = backend === 'claude';
  return {
    id: isClaude ? 'agent.claude_channel_weather' : 'agent.codex_channel_weather',
    title: isClaude ? 'Claude external-channel coaching prompt' : 'Codex external-channel coaching prompt',
    command: isClaude ? 'claude -p' : 'codex exec --json -',
    prompt: buildExternalChannelAgentPrompt({
      channel: isClaude ? 'feishu' : 'wechat',
      text: agentWeatherEvalInput,
      metadata: {
        inputKind: 'text',
        thresholdDecision: 'ALLOW',
        smokeEval: true,
      },
      coachingInstruction: [
        'Required: after the main reply, append exactly one compact English note. Do not omit it.',
        'Use this output format:',
        'English note: "original phrase" -> "more natural English"',
        'Why: one practical rule',
        'IPA: key word /IPA/',
        `English note: "${awkwardWeatherPrompt}" -> "What is the weather like in Guangzhou?"`,
        'Why: Use "What is the weather like in + place?" when asking about local weather.',
        'IPA: weather /ˈweðər/',
      ].join('\n'),
    }),
  };
}

function buildHistoryLessonPromptFixture(backend: ExternalAgentBackend): EvalPromptFixture {
  const isClaude = backend === 'claude';
  return {
    id: isClaude ? 'agent.claude_history_lesson' : 'agent.codex_history_lesson',
    title: isClaude ? 'Claude history-based teaching prompt' : 'Codex history-based teaching prompt',
    command: isClaude ? 'claude -p' : 'codex exec --json -',
    prompt: [
      "You are helping an EnglishPilot user review today's English learning history.",
      'Use the embedded brief as the source of truth. Do not ask for files or tools.',
      'Produce a concise teaching response with:',
      "- a short summary of the user's recurring patterns;",
      '- three corrected expressions;',
      '- IPA for useful words;',
      '- a short English speech the user can practice aloud.',
      '',
      '<english_pilot_learning_brief>',
      JSON.stringify(historyLessonBrief, null, 2),
      '</english_pilot_learning_brief>',
    ].join('\n'),
  };
}

function dryRunAssertions(run: ExternalAgentRunResult): AgentEvalAssertion[] {
  return [
    {
      id: 'agent_invocation_built',
      passed: run.exitCode === 0 && run.dryRun && run.promptStdin.includes('<english_pilot_coaching>'),
      summary: 'Builds the local agent invocation and preserves the coaching prompt.',
      details: {
        command: run.command,
        args: run.args,
      },
    },
  ];
}

function dryRunHistoryLessonAssertions(run: ExternalAgentRunResult): AgentEvalAssertion[] {
  return [
    {
      id: 'agent_invocation_built',
      passed:
        run.exitCode === 0 &&
        run.dryRun &&
        run.promptStdin.includes('<english_pilot_learning_brief>') &&
        run.promptStdin.includes('short English speech'),
      summary: 'Builds the local agent invocation and preserves the learning-brief prompt.',
      details: {
        command: run.command,
        args: run.args,
      },
    },
  ];
}

function judgeChannelWeatherReply(run: ExternalAgentRunResult, replyText: string): AgentEvalAssertion[] {
  return [
    {
      id: 'agent_exit_zero',
      passed: run.exitCode === 0,
      summary: 'The local agent process exits successfully.',
      details: {
        exitCode: run.exitCode,
        stderr: run.stderr.trim(),
        failureKind: classifyAgentFailure(run, replyText),
      },
    },
    {
      id: 'contains_english_note',
      passed: /English note:/i.test(replyText),
      summary: 'The reply includes an English note after the main answer.',
    },
    {
      id: 'contains_better_weather_phrase',
      passed: /what(?:'s| is)?\s+the\s+weather\s+like\s+in\s+Guangzhou/i.test(replyText),
      summary: 'The English note includes the expected natural weather phrasing.',
    },
    {
      id: 'contains_why',
      passed:
        /\bWhy(?:\s+[^:\n]{1,40})?:/i.test(replyText) ||
        /\bUse\s+["“]?What is the weather like in \+ place/i.test(replyText),
      summary: 'The English note includes a brief teaching rationale.',
    },
    {
      id: 'contains_ipa',
      passed: /IPA:|\/ˈweðər\//i.test(replyText),
      summary: 'The English note includes IPA when useful.',
    },
  ];
}

function classifyAgentFailure(run: ExternalAgentRunResult, replyText: string): string {
  if (run.exitCode === 0) return 'none';
  const combined = `${run.stderr}\n${run.stdout}\n${replyText}`;
  if (/not logged in|please run \/login|authentication_failed|api key/i.test(combined)) return 'auth-required';
  if (/timed out|SIGTERM/i.test(combined)) return 'timeout';
  return 'agent-failed';
}

function judgeHistoryLessonReply(run: ExternalAgentRunResult, replyText: string): AgentEvalAssertion[] {
  const normalizedReplyText = normalizeEvalReplyText(replyText);
  return [
    {
      id: 'agent_exit_zero',
      passed: run.exitCode === 0,
      summary: 'The local agent process exits successfully.',
      details: {
        exitCode: run.exitCode,
        stderr: run.stderr.trim(),
        failureKind: classifyAgentFailure(run, replyText),
      },
    },
    {
      id: 'contains_history_weather_correction',
      passed: /what(?:'s| is)\s+the\s+weather\s+like\s+in\s+Guangzhou/i.test(normalizedReplyText),
      summary: 'The lesson uses the weather correction from the learning brief.',
    },
    {
      id: 'contains_new_project_correction',
      passed: /create\s+a\s+new\s+project/i.test(replyText),
      summary: 'The lesson uses the new-project correction from the learning brief.',
    },
    {
      id: 'contains_teaching_structure',
      passed: /pattern|practice|corrected expressions?|summary/i.test(replyText),
      summary: 'The reply is structured as a teaching note rather than a raw data dump.',
    },
    {
      id: 'contains_ipa',
      passed: /IPA:|\/ˈweðər\/|\/ˈsɪmplɪfaɪ\/|\/ˈprɑːdʒekt\//i.test(replyText),
      summary: 'The lesson includes IPA for useful words.',
    },
    {
      id: 'contains_practice_speech',
      passed: /speech|practice aloud|Today,\s+I/i.test(replyText),
      summary: 'The reply includes a short practice speech.',
    },
  ];
}

function normalizeEvalReplyText(text: string): string {
  return text.replace(/[‘’]/g, "'").replace(/[“”]/g, '"');
}
