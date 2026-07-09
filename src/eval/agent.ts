import {
  extractExternalAgentReplyText,
  runExternalAgent,
  type ExternalAgentBackend,
  type ExternalAgentRunResult,
} from '../agent/runner.js';
import { loadConfig } from '../core/config.js';
import type { EnglishPilotConfig } from '../core/types.js';
import { getAgentEvalPrompt, type AgentEvalCaseId } from './cases.js';
export type { AgentEvalCaseId } from './cases.js';

export interface AgentEvalAssertion {
  id: string;
  passed: boolean;
  summary: string;
  details?: Record<string, unknown>;
}

export interface AgentEvalReport {
  operation: 'english-pilot-agent-eval';
  backend: ExternalAgentBackend;
  caseId: AgentEvalCaseId;
  dryRun: boolean;
  passed: boolean;
  prompt: string;
  run: ExternalAgentRunResult;
  replyText?: string;
  assertions: AgentEvalAssertion[];
}

export async function runAgentEval(input: {
  backend: ExternalAgentBackend;
  caseId?: AgentEvalCaseId;
  cwd?: string;
  dryRun?: boolean;
  timeoutMs?: number;
  config?: EnglishPilotConfig;
  runAgent?: typeof runExternalAgent;
}): Promise<AgentEvalReport> {
  const caseId = input.caseId ?? 'channel-weather';
  const prompt = getAgentEvalPrompt(input.backend, caseId);
  const config = input.config ?? loadConfig();
  const dryRun = input.dryRun === true;
  const run = await (input.runAgent ?? runExternalAgent)({
    config,
    prompt,
    backend: input.backend,
    cwd: input.cwd,
    timeoutMs: input.timeoutMs,
    dryRun,
  });
  const replyText = dryRun ? undefined : extractExternalAgentReplyText(run);
  const assertions = dryRun ? dryRunAssertions(run) : judgeAgentEvalReply(run, replyText ?? '');
  return {
    operation: 'english-pilot-agent-eval',
    backend: input.backend,
    caseId,
    dryRun,
    passed: assertions.every((assertion) => assertion.passed),
    prompt,
    run,
    ...(replyText ? { replyText } : {}),
    assertions,
  };
}

export function formatAgentEvalReport(report: AgentEvalReport): string {
  return [
    `EnglishPilot agent eval: ${report.passed ? 'passed' : 'failed'}`,
    `Backend: ${report.backend}`,
    `Case: ${report.caseId}`,
    `Dry run: ${report.dryRun ? 'yes' : 'no'}`,
    ...report.assertions.map((item) => `${item.passed ? 'PASS' : 'FAIL'} ${item.id} - ${item.summary}`),
    ...(report.replyText ? ['', report.replyText.trim()] : []),
    '',
  ].join('\n');
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

function judgeAgentEvalReply(run: ExternalAgentRunResult, replyText: string): AgentEvalAssertion[] {
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
