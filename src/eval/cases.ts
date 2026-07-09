import { buildExternalChannelAgentPrompt } from '../agent/channel-prompt.js';
import type { ExternalAgentBackend } from '../agent/runner.js';

export type AgentEvalCaseId = 'channel-weather';

export interface EvalPromptFixture {
  id: string;
  title: string;
  command: string;
  prompt: string;
}

export const blockedProjectPrompt = '我想创建一个 new project，用来辅助英语学习。';
export const awkwardWeatherPrompt = 'what is the weather about 广州';

const agentWeatherEvalInput = `Please help me phrase this weather question naturally: ${awkwardWeatherPrompt}`;

export function listEvalPromptFixtures(): EvalPromptFixture[] {
  return [buildChannelWeatherPromptFixture('claude'), buildChannelWeatherPromptFixture('codex')];
}

export function getAgentEvalPrompt(backend: ExternalAgentBackend, caseId: AgentEvalCaseId): string {
  if (caseId !== 'channel-weather') throw new Error(`Unknown agent eval case: ${caseId}`);
  return buildChannelWeatherPromptFixture(backend).prompt;
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
